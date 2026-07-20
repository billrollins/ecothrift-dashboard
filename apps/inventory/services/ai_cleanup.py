"""Web AI cleanup batches for preprocessing staging rows.

Architecture: workspace/ai-cleanup-grok/FABLE_REVIEW_offline_vs_webui_ai_cleanup.md
§ "Fable 5 verdict" (2026-06-10). Each batch is one small HTTP request: load N staging
rows, one LLM call (routed by model slug), save ``PreprocessingRow.ai_*`` for those rows only. Never
writes ``ManifestRow`` listing fields, never creates ``Product``/``Item`` rows —
that was the legacy ``ai-cleanup-rows`` behavior this replaces.

Cleaned marker: ``ai_reasoning != ''`` (shared with ``ai-cleanup-status`` and
``cancel-ai-cleanup``). The row merge mirrors ``apply-cleanup-csv``'s staging branch
(`apply_cleanup_values_to_staging_row` + `snapshot_final_for_rows`) so online and
offline cleanup produce identical staging state.
"""

from __future__ import annotations

import json
import logging
import re
import time
from copy import deepcopy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory.cleanup_condition import normalize_cleanup_condition
from apps.inventory.layer_helpers import (
    TRIPLE_LAYER_SPECS,
    snapshot_finalize_from_ai_and_standard,
)
from apps.inventory.manifest_standard_fields import slugify_formula_search_tags
from apps.inventory.models import PreprocessingRow, PurchaseOrder
from apps.inventory.prompts import CONDITION_VALUES

# Web pool default 10 rows/batch (see frontend AI_CLEANUP_BATCH_SIZE); server cap 60 ids/request.
MAX_BATCH_ROW_IDS = 60
DEFAULT_BATCH_SIZE = 10
# gemini-3.5-flash 10-row batches run ~30–35s; 5-row ~22s. Gunicorn allows 120s (Procfile).
ANTHROPIC_REQUEST_TIMEOUT_SECONDS = 45.0

WEB_CLEANUP_REASONING = 'AI cleanup (web batch)'

logger = logging.getLogger(__name__)

# ── Leashed pricing (owner design 2026-06-10) ────────────────────────────────
# The model NEVER outputs a price. It outputs two bounded judgment scalers plus a
# retail-sanity flag; WE compute price = unit_retail × m_resale × m_saleability
# × qty_mult(quantity) × cond_mult(condition). Deterministic, auditable, echo-proof.
RESALE_SCALER_BOUNDS = (Decimal('0.05'), Decimal('1.10'))
SALEABILITY_SCALER_BOUNDS = (Decimal('0.05'), Decimal('1.00'))
# Rows with a blank manifest retail get an AI-estimated MSRP (est_retail) so the
# leashed formula still applies. Clamped hard; ignored whenever a real retail exists.
EST_RETAIL_BOUNDS = (Decimal('0.25'), Decimal('10000'))

QTY_MULTIPLIER_TABLE: tuple[tuple[int, Decimal], ...] = (
    (3, Decimal('1.00')),
    (7, Decimal('0.92')),
    (14, Decimal('0.82')),
    (49, Decimal('0.72')),
    (199, Decimal('0.55')),
)
QTY_MULTIPLIER_FLOOR = Decimal('0.40')  # 200+

CONDITION_MULTIPLIERS: dict[str, Decimal] = {
    'new': Decimal('1.00'),
    'like_new': Decimal('0.92'),
    'good': Decimal('0.85'),
    'used_good': Decimal('0.78'),
    'fair': Decimal('0.60'),
    'used_fair': Decimal('0.55'),
    'salvage': Decimal('0.30'),
}
CONDITION_MULTIPLIER_DEFAULT = Decimal('0.85')


def qty_multiplier(quantity: int) -> Decimal:
    for ceiling, mult in QTY_MULTIPLIER_TABLE:
        if quantity <= ceiling:
            return mult
    return QTY_MULTIPLIER_FLOOR


def _clamp(value: Decimal, bounds: tuple[Decimal, Decimal]) -> Decimal:
    lo, hi = bounds
    return max(lo, min(hi, value))


def compute_leashed_price(
    *,
    unit_retail: Decimal | None,
    quantity: int,
    condition: str,
    m_resale: Decimal,
    m_saleability: Decimal,
) -> Decimal | None:
    if unit_retail is None or unit_retail <= 0:
        return None
    cond_mult = CONDITION_MULTIPLIERS.get(condition, CONDITION_MULTIPLIER_DEFAULT)
    price = unit_retail * m_resale * m_saleability * qty_multiplier(quantity) * cond_mult
    return max(price, Decimal('0.25')).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


class AiCleanupBatchError(ValueError):
    """Request-shape problems (bad row_ids, staging inactive) → HTTP 400."""


def parse_cleanup_price(value: Any) -> Decimal | None:
    if value in (None, ''):
        return None
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        return None


def uncleaned_staging_row_ids(order: PurchaseOrder) -> list[int]:
    """Staging rows not yet cleaned (``ai_reasoning == ''``), in row order."""
    return list(
        PreprocessingRow.objects.filter(purchase_order=order, ai_reasoning='')
        .order_by('row_number')
        .values_list('id', flat=True),
    )


def apply_cleanup_values_to_staging_row(row: PreprocessingRow, values: dict[str, Any]) -> None:
    """Merge one cleanup result into a staging row's ``ai_*`` layer.

    Extracted from ``_upload_cleanup_csv_impl`` (staging branch) so the web batch
    endpoint and the offline CSV apply share one write contract. ``values`` keys:
    ``title``/``brand``/``model``/``category`` (str), ``condition`` (normalized DB value
    or ''), ``proposed_price`` (Decimal | None), ``est_retail`` (Decimal | None,
    staging retail fill for blank-retail rows), ``search_tags`` (list | None),
    ``specifications`` (dict | None), ``notes`` (str), ``ai_status``
    (dict), ``reasoning`` (str). Caller wraps in a transaction and snapshots final_*.
    """

    source = row.manifest_row or row
    update_fields: set[str] = set()

    row.ai_title = str(values.get('title') or '')[:300]
    row.ai_brand = str(values.get('brand') or '')[:200]
    row.ai_model = str(values.get('model') or '')[:200]
    row.ai_category = str(values.get('category') or '')[:200]
    row.ai_identifiers = deepcopy(getattr(source, 'identifiers', row.standard_identifiers) or {})
    row.ai_taxonomy = deepcopy(getattr(source, 'taxonomy', row.standard_taxonomy) or {})
    row.ai_tracking = deepcopy(getattr(source, 'tracking', row.standard_tracking) or {})
    row.ai_condition = str(values.get('condition') or '')
    row.ai_status = deepcopy(values.get('ai_status') or {})
    update_fields.update({
        'ai_title', 'ai_brand', 'ai_model', 'ai_category',
        'ai_identifiers', 'ai_taxonomy', 'ai_tracking', 'ai_condition',
        'ai_status',
    })

    notes = str(values.get('notes') or '').strip()
    if notes:
        row.ai_notes = notes
        update_fields.add('ai_notes')
    specs = values.get('specifications')
    if isinstance(specs, dict):
        row.ai_specifications = specs
        update_fields.add('ai_specifications')
    tags = values.get('search_tags')
    if isinstance(tags, list):
        row.ai_search_tags = tags
        update_fields.add('ai_search_tags')

    # AI-estimated retail for blank-retail rows: staging-only (the ManifestRow spine
    # keeps its original blank for audit). Flows into proposed_price + PO cost allocation.
    est_retail = values.get('est_retail')
    source_retail = getattr(source, 'unit_retail', None)
    if est_retail is not None and (source_retail is None or source_retail <= 0):
        row.unit_retail = est_retail
        update_fields.add('unit_retail')

    row.proposed_price = values.get('proposed_price')
    row.ai_reasoning = str(values.get('reasoning') or '') or WEB_CLEANUP_REASONING
    update_fields.update({'proposed_price', 'ai_reasoning'})
    if row.proposed_price is not None and row.pricing_stage == 'unpriced':
        row.pricing_stage = 'draft'
        row.pricing_notes = row.pricing_notes or row.ai_reasoning
        update_fields.update({'pricing_stage', 'pricing_notes'})

    row.save(update_fields=sorted(update_fields))


def snapshot_final_for_rows(rows: list[PreprocessingRow]) -> None:
    """Rebuild ``final_*`` from ai_+standard_ for rows just merged (apply-path parity)."""
    if not rows:
        return
    final_field_names = [f'final_{base}' for base in TRIPLE_LAYER_SPECS.keys()] + [
        'final_title',
        'final_category',
    ]
    snapshot_save_fields = list(dict.fromkeys(final_field_names + ['updated_at']))
    ts = timezone.now()
    for sr in rows:
        sr.refresh_from_db()
        snapshot_finalize_from_ai_and_standard(sr, fill_missing_only=False)
        sr.updated_at = ts
        sr.save(update_fields=snapshot_save_fields)


def cleanup_batch_system_prompt() -> str:
    """Lean market-anchored cleanup prompt (deep dive 2026-06-10).

    Anti-echo by construction: ideal_price/base_cost never reach the model; the prompt
    forbids outputting unit_retail or a fixed % of it. Pricing = the model's OWN
    market judgment shaped by depth (quantity), saleability drag, and retail-claim
    skepticism — never margin math (owner rule). Gold examples teach those exact cases.
    """
    return (
        'You price and clean liquidation manifest rows for a midwest thrift store. '
        'Input: a JSON array of rows. Return ONLY a JSON array — one object per input row, '
        'same order, never skip or merge rows, no markdown. Keys per object: row_id (copied '
        'exactly), title, brand, model, category, condition, retail_suspect, '
        'retail_suspect_reason, est_retail, m_resale, m_saleability, search_tags, low_confidence, '
        'low_confidence_reason.\n'
        '- title: short and sellable, names ONE unit, like a search query ("Samsung 55\\" 4K Smart TV").\n'
        '- brand / model: extract from the data only; never invent; a UPC is not a model; "" if unknown.\n'
        '- category: copy one name character-for-character from the list below. Choose by the '
        f'item\'s primary function. "{MIXED_LOTS_UNCATEGORIZED}" is allowed ONLY when the item is '
        'genuinely unidentifiable — any identifiable product has a real category.\n'
        '- condition: the closest value from: ' + ', '.join(CONDITION_VALUES) + '. '
        'Keep the vendor\'s meaning unless the text contradicts it.\n'
        'You do NOT output a price. You output two scalers and a flag; the system computes '
        'price = unit_retail × m_resale × m_saleability × quantity and condition multipliers.\n'
        '- retail_suspect: JSON boolean — true ONLY when unit_retail looks like a data error for '
        'this item (×10/×100 typo, absurd claim). retail_suspect_reason: short reason, or "". '
        'When unit_retail is blank there is nothing to suspect: output false.\n'
        '- est_retail: ONLY when the input row\'s unit_retail is blank (""), output a numeric '
        'string estimating the item\'s NEW/MSRP claimed retail in USD (e.g. "24.99"). This is a '
        'retail CLAIM the scalers will be applied to — NOT a resale price, NOT what we should '
        'charge. When unit_retail is present, output "" (empty string).\n'
        '- m_resale (number, 0.05–1.10): the fraction of CLAIMED retail this item type resells '
        'for at qty 1 in good condition. High-demand resale items (LEGO, popular brands) near '
        '0.85–1.05; typical goods 0.30–0.60; luxury/decor with inflated markup 0.10–0.25.\n'
        '- m_saleability (number, 0.05–1.00): thrift-channel fit. 1.00 = normal thrift item; '
        'industrial/commercial gear, bare parts, compatibility-locked accessories, items buyers '
        'want a warranty for, used skin/oral/water-contact items: 0.10–0.50.\n'
        '  No margin or profit math — judge the item, not our economics.\n'
        '- search_tags: array of 2-6 lowercase keywords.\n'
        '- low_confidence: JSON boolean; true when identity or price is a guess. '
        'low_confidence_reason: short reason, or "" when false.\n'
        'Unreadable row? Output it anyway with low_confidence true.\n\n'
        'Allowed categories:\n'
        + '\n'.join(f'- {name}' for name in TAXONOMY_V1_CATEGORY_NAMES)
        + '\n\nGold examples (input -> output):\n'
        '{"row_id": 1, "title": "LEGO Star Wars Millennium Falcon 75257", "brand": "LEGO", '
        '"quantity": 3, "unit_retail": "159.99"} -> {"row_id": 1, "title": "LEGO Star Wars Millennium Falcon Set", '
        '"brand": "LEGO", "model": "75257", "category": "Toys & games", "condition": "new", '
        '"retail_suspect": false, "retail_suspect_reason": "", "est_retail": "", "m_resale": 0.95, "m_saleability": 1.0, '
        '"search_tags": ["lego", "star-wars", "building-set"], "low_confidence": false, "low_confidence_reason": ""}'
        '  // hot resale brand: sells near claimed retail\n'
        '{"row_id": 2, "title": "Hydraulic pallet truck replacement seal kit", "brand": "", '
        '"quantity": 4, "unit_retail": "89.00"} -> {"row_id": 2, "title": "Pallet Jack Hydraulic Seal Kit", '
        '"brand": "", "model": "", "category": "Tools & hardware", "condition": "new", '
        '"retail_suspect": false, "retail_suspect_reason": "", "est_retail": "", "m_resale": 0.40, "m_saleability": 0.20, '
        '"search_tags": ["pallet-jack", "seal-kit", "hydraulic", "parts"], "low_confidence": false, '
        '"low_confidence_reason": ""}  // industrial bare part: tiny thrift buyer pool\n'
        '{"row_id": 3, "title": "cenozo Modern LED Acrylic Ball Chandelier 90W", "brand": "cenozo", '
        '"quantity": 1, "unit_retail": "700.70"} -> {"row_id": 3, "title": "Cenozo LED Dimmable Acrylic Ball Chandelier", '
        '"brand": "cenozo", "model": "", "category": "Home décor & lighting", "condition": "used_good", '
        '"retail_suspect": false, "retail_suspect_reason": "", "est_retail": "", "m_resale": 0.12, "m_saleability": 0.90, '
        '"search_tags": ["chandelier", "led", "dimmable", "ceiling-light"], "low_confidence": false, '
        '"low_confidence_reason": ""}  // no-name luxury markup: real value is a small fraction of claimed retail\n'
        '{"row_id": 4, "title": "Bic Soleil razors 4ct", "brand": "Bic", '
        '"quantity": 72, "unit_retail": "699.00"} -> {"row_id": 4, "title": "Bic Soleil Disposable Razors 4-Pack", '
        '"brand": "Bic", "model": "", "category": "Health, beauty & personal care", "condition": "new", '
        '"retail_suspect": true, "retail_suspect_reason": "razor 4-pack listed at $699 — likely x100 typo", '
        '"est_retail": "", "m_resale": 0.40, "m_saleability": 1.0, "search_tags": ["razor", "bic", "disposable"], '
        '"low_confidence": false, "low_confidence_reason": ""}  // flag bad retail; system skips pricing that row\n'
        '{"row_id": 5, "title": "Hamilton Beach 2-slice toaster black", "brand": "Hamilton Beach", '
        '"quantity": 2, "unit_retail": ""} -> {"row_id": 5, "title": "Hamilton Beach 2-Slice Toaster", '
        '"brand": "Hamilton Beach", "model": "", "category": "Kitchen & dining", "condition": "used_good", '
        '"retail_suspect": false, "retail_suspect_reason": "", "est_retail": "29.99", "m_resale": 0.45, '
        '"m_saleability": 1.0, "search_tags": ["toaster", "hamilton-beach", "kitchen"], '
        '"low_confidence": false, "low_confidence_reason": ""}'
        '  // blank retail: estimate the NEW/MSRP claim; scalers still judge resale as usual'
    )


def build_cleanup_batch_payload(order: PurchaseOrder, rows: list[PreprocessingRow]) -> list[dict[str, Any]]:
    """Per-row model input — same source fields as ``download-cleanup-csv`` (staging branch)."""
    # NOTE: ideal_price/base_cost are deliberately NOT sent — they are the owner's margin
    # math, not market facts, and the model echoes provided numbers (744/744 ideal_price
    # copies observed on PO 323, 2026-06-10). quantity IS sent: depth drives price.
    payload = []
    for row in rows:
        source = row.manifest_row or row
        identifiers = getattr(source, 'identifiers', row.standard_identifiers) or {}
        taxonomy = getattr(source, 'taxonomy', row.standard_taxonomy) or {}
        payload.append({
            'row_id': row.id,
            'title': getattr(source, 'title', '') or '',
            'brand': getattr(source, 'brand', row.standard_brand) or '',
            'model': getattr(source, 'model', row.standard_model) or '',
            'category': str(taxonomy.get('category') or ''),
            'condition': getattr(source, 'condition', row.standard_condition) or '',
            'notes': getattr(source, 'notes', row.standard_notes) or '',
            'upc': str(identifiers.get('upc') or identifiers.get('UPC') or ''),
            'unit_retail': str(source.unit_retail) if source.unit_retail else '',
            'quantity': int(source.quantity or 1),
        })
    return payload


def parse_cleanup_response_text(content_text: str) -> list[dict[str, Any]]:
    match = re.search(r'\[[\s\S]*\]', content_text or '')
    if not match:
        return []
    try:
        parsed = json.loads(match.group())
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [s for s in parsed if isinstance(s, dict)]


def validate_cleanup_suggestion(
    suggestion: dict[str, Any],
    context: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, str]:
    context = context or {}
    """Return (values for merge, '') or (None, discard reason)."""
    title = str(suggestion.get('title') or '').strip()
    if not title:
        return None, 'empty_title'

    taxonomy_set = set(TAXONOMY_V1_CATEGORY_NAMES)
    category = str(suggestion.get('category') or '').strip()
    if category not in taxonomy_set:
        category = ''

    condition = normalize_cleanup_condition(str(suggestion.get('condition') or '').strip()) or ''

    tags_raw = suggestion.get('search_tags')
    if isinstance(tags_raw, list):
        tags = slugify_formula_search_tags(','.join(str(x) for x in tags_raw if str(x).strip()))
    elif tags_raw:
        tags = slugify_formula_search_tags(str(tags_raw))
    else:
        tags = None

    low_confidence = suggestion.get('low_confidence') is True
    reason = str(suggestion.get('low_confidence_reason') or '').strip()
    issues: list[dict[str, str]] = []
    if low_confidence:
        issues.append({'rule': 'AI_LOW_CONFIDENCE', 'reason': reason or 'AI low confidence'})

    # Leashed pricing: clamp the model's scalers, compute price deterministically.
    unit_retail = parse_cleanup_price(context.get('unit_retail'))
    quantity = int(context.get('quantity') or 1)
    retail_suspect = suggestion.get('retail_suspect') is True
    m_resale = _clamp(parse_cleanup_price(suggestion.get('m_resale')) or Decimal('0.40'), RESALE_SCALER_BOUNDS)
    m_saleability = _clamp(parse_cleanup_price(suggestion.get('m_saleability')) or Decimal('1.00'), SALEABILITY_SCALER_BOUNDS)

    # est_retail: AI-estimated MSRP for rows the manifest left blank. Never overrides a
    # real retail; clamped to a sane band. Garbage ('n/a', absurd numbers) → ignored.
    est_retail: Decimal | None = None
    if unit_retail is None or unit_retail <= 0:
        # Blank retail also means there's nothing to suspect — the flag would be noise.
        retail_suspect = False
        candidate = parse_cleanup_price(suggestion.get('est_retail'))
        if candidate is not None and candidate > 0:
            est_retail = _clamp(candidate, EST_RETAIL_BOUNDS)

    proposed_price: Decimal | None = None
    if retail_suspect:
        # A bad retail (×10/×100 typo) would skew everything downstream — flag, don't price.
        issues.append({
            'rule': 'RETAIL_SUSPECT',
            'reason': str(suggestion.get('retail_suspect_reason') or '').strip() or 'unit_retail looks wrong (possible typo)',
        })
    else:
        proposed_price = compute_leashed_price(
            unit_retail=unit_retail if unit_retail and unit_retail > 0 else est_retail,
            quantity=quantity,
            condition=condition or str(context.get('condition') or ''),
            m_resale=m_resale,
            m_saleability=m_saleability,
        )

    ai_status: dict[str, Any] = {}
    if issues:
        ai_status = {'state': 'soft_flagged', 'issues': issues}
    if proposed_price is not None or retail_suspect:
        pricing: dict[str, Any] = {
            'm_resale': str(m_resale),
            'm_saleability': str(m_saleability),
            'qty_mult': str(qty_multiplier(quantity)),
            'retail_suspect': retail_suspect,
        }
        if est_retail is not None:
            pricing['est_retail'] = str(est_retail)
        ai_status = {**ai_status, 'pricing': pricing}

    reasoning = WEB_CLEANUP_REASONING + (' — low confidence' if low_confidence else '')
    if est_retail is not None:
        reasoning += f' [est. retail ${est_retail} — manifest had none]'

    return {
        'title': title,
        'brand': str(suggestion.get('brand') or '').strip(),
        'model': str(suggestion.get('model') or '').strip(),
        'category': category,
        'condition': condition,
        'proposed_price': proposed_price,
        'est_retail': est_retail,
        'search_tags': tags,
        'ai_status': ai_status,
        'reasoning': reasoning,
    }, ''


def model_provider(model_id: str) -> str:
    """Provider for a model id — delegates to the shared router (one implementation)."""
    from apps.core.services.llm_router import resolve_provider

    return resolve_provider(model_id)


def resolve_cleanup_api_key(model_id: str) -> tuple[str, str | None]:
    """Return (api_key, error_message). error_message is set when the key is missing."""
    from apps.core.services.llm_router import LLMConfigError, resolve_api_key

    try:
        return resolve_api_key(model_provider(model_id)), None
    except LLMConfigError as e:
        return '', str(e)


def run_ai_cleanup_batch(
    order: PurchaseOrder,
    row_ids: list[int],
    *,
    model_id: str,
    api_key: str,
) -> dict[str, Any]:
    """One web cleanup batch: load rows → one model call → merge ai_* → snapshot final_*.

    Holds no lock during the model call. Re-reads ``ai_cleanup_generation`` after the
    call and discards the save when undo/cancel bumped it (legacy guard, ported).
    """

    timing: dict[str, float] = {}
    t_total = time.perf_counter()

    ids = sorted({int(x) for x in row_ids})
    if not ids:
        raise AiCleanupBatchError('row_ids must be a non-empty list of staging row ids.')
    if len(ids) > MAX_BATCH_ROW_IDS:
        raise AiCleanupBatchError(f'row_ids is limited to {MAX_BATCH_ROW_IDS} rows per batch.')

    generation_at_start = PurchaseOrder.objects.values_list(
        'ai_cleanup_generation', flat=True,
    ).get(pk=order.pk)

    t0 = time.perf_counter()
    rows = list(
        PreprocessingRow.objects.filter(purchase_order=order, pk__in=ids)
        .select_related('manifest_row')
        .order_by('row_number'),
    )
    timing['db_fetch_ms'] = round((time.perf_counter() - t0) * 1000, 1)
    if len(rows) != len(ids):
        found = {r.id for r in rows}
        missing = [i for i in ids if i not in found]
        raise AiCleanupBatchError(f'Unknown staging row ids for this order: {missing[:10]}')

    t0 = time.perf_counter()
    payload = build_cleanup_batch_payload(order, rows)
    system_prompt = cleanup_batch_system_prompt()
    timing['prompt_build_ms'] = round((time.perf_counter() - t0) * 1000, 1)

    t0 = time.perf_counter()
    user_payload = json.dumps(payload)
    from apps.core.services.llm_router import llm_complete

    result = llm_complete(
        model_id=model_id,
        api_key=api_key,
        system=system_prompt,
        user=user_payload,
        max_tokens=8192,
        temperature=0,
        timeout=ANTHROPIC_REQUEST_TIMEOUT_SECONDS,
        log_source='ai_cleanup_batch',
        log_detail=f'order={order.pk} rows={len(rows)} requested_model={model_id}',
    )
    timing['api_call_ms'] = round((time.perf_counter() - t0) * 1000, 1)
    content_text = result.text

    t0 = time.perf_counter()
    # Raw response visibility for pricing/quality forensics ("what did the AI actually say?").
    logger.info(
        'ai_cleanup_batch_response order=%s model=%s rows=%s chars=%s',
        order.pk, model_id, len(rows), len(content_text),
    )
    logger.debug('ai_cleanup_batch_response_body order=%s body=%s', order.pk, content_text[:8000])
    suggestions_by_id = {}
    for s in parse_cleanup_response_text(content_text):
        try:
            suggestions_by_id[int(s.get('row_id'))] = s
        except (TypeError, ValueError):
            continue
    timing['parse_ms'] = round((time.perf_counter() - t0) * 1000, 1)

    discarded: list[dict[str, Any]] = []
    merge_plan: list[tuple[PreprocessingRow, dict[str, Any]]] = []
    for row in rows:
        suggestion = suggestions_by_id.get(row.id)
        if suggestion is None:
            discarded.append({'row_id': row.id, 'reason': 'missing'})
            continue
        source = row.manifest_row or row
        values, discard_reason = validate_cleanup_suggestion(suggestion, {
            'unit_retail': source.unit_retail,
            'quantity': source.quantity,
            'condition': getattr(source, 'condition', row.standard_condition) or '',
        })
        if values is None:
            discarded.append({'row_id': row.id, 'reason': discard_reason})
            continue
        merge_plan.append((row, values))

    t0 = time.perf_counter()
    generation_now = PurchaseOrder.objects.values_list(
        'ai_cleanup_generation', flat=True,
    ).get(pk=order.pk)
    if generation_now != generation_at_start:
        timing['db_save_ms'] = 0.0
        timing['total_ms'] = round((time.perf_counter() - t_total) * 1000, 1)
        return {
            'rows_requested': len(ids),
            'rows_saved': 0,
            'saved_row_ids': [],
            'discarded_rows': discarded,
            'cancelled': True,
            'generation': generation_now,
            'model_used': model_id,
            'timing': timing,
        }

    saved_rows: list[PreprocessingRow] = []
    with transaction.atomic():
        for row, values in merge_plan:
            apply_cleanup_values_to_staging_row(row, values)
            saved_rows.append(row)
        snapshot_final_for_rows(saved_rows)
    timing['db_save_ms'] = round((time.perf_counter() - t0) * 1000, 1)
    timing['total_ms'] = round((time.perf_counter() - t_total) * 1000, 1)

    return {
        'rows_requested': len(ids),
        'rows_saved': len(saved_rows),
        'saved_row_ids': [r.id for r in saved_rows],
        'discarded_rows': discarded,
        'cancelled': False,
        'generation': generation_now,
        'model_used': model_id,
        'timing': timing,
    }


def complete_ai_cleanup(order: PurchaseOrder) -> dict[str, Any]:
    """Post-cleanup completion (no AI): match candidates + order flags. Idempotent."""
    from apps.inventory.services.product_matching import generate_match_candidates_for_order

    now = timezone.now()
    with transaction.atomic():
        order_w = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
        order_w.ai_cleaned_at = now
        order_w.preprocess_status = 'cleaned'
        order_w.save(update_fields=['ai_cleaned_at', 'preprocess_status', 'updated_at'])

    match_summary = generate_match_candidates_for_order(order)
    total = PreprocessingRow.objects.filter(purchase_order=order).count()
    uncleaned = PreprocessingRow.objects.filter(purchase_order=order, ai_reasoning='').count()
    return {
        'total_rows': total,
        'cleaned_rows': total - uncleaned,
        'remaining_rows': uncleaned,
        'match_candidates': match_summary,
    }
