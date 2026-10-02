"""
The product standard at intake (owner, 2026-10-02): new data is produced good from the start, so the catalog never
needs a cleanup run again. Rules: `.ai/extended/product-standard.md`, `apps/inventory/spec_rules.py`.

Three steps, all behind one switch (AppSetting `product_standard_at_intake`, off until the owner turns it on):

1. **Preprocessing** (`run_standard_batch`, called by the AI cleanup job after its own batches): Spark writes the
   standard fields for each manifest line (title, tag name, vector text, brand, model, canon category and
   subcategory, product specs), `standardize.validate` checks them, and they are stored on the staging row under
   `ai_status['standard']`. The cleanup prompt and its pricing are untouched.
2. **Matching** (`vector_candidates`, called by `product_matching`): a line with a standard is compared by vector
   to the standardized catalog. A very close product with no product-spec conflict is matched automatically (the
   dedupe bar); weaker ones are offered to staff. So a duplicate product is not created in the first place.
3. **Check-in** (`on_check_in`, called after the item is saved): the product takes the line's standard as its
   profile where it has none, and gets its vector. It runs after the transaction commits and never raises, so it
   cannot fail a check-in, and no model is called at the desk.

Without the switch nothing here runs. Without the Spark key the standard pass fails quietly per batch and intake
goes on as before.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from apps.core.models import AppSetting
from apps.inventory.models import PreprocessingRow, Product, ProductProfile, PurchaseOrder
from apps.inventory.services import standardize as std

logger = logging.getLogger(__name__)

SWITCH_KEY = 'product_standard_at_intake'
PROFILE_FIELDS = ('display_title', 'short_name', 'vector_text', 'brand', 'model_number', 'category', 'subcategory',
                  'key_specs')
HARD = ('category not canon', 'subcategory not canon', 'answer does not match', 'vector_text empty',
        'short_name empty', 'display_title empty')
ROWS_PER_CALL = 6   # Spark at high effort took 70 to 100 seconds for 8 rows (trial, 2026-10-02); the job allows 150
# Calls with the model at one time. A call holds no database connection while the model works (the shared
# production database has few), so this is half of what the cleanup itself may use.
MAX_WORKERS = 24
NEAREST = 5
SCORE_VECTOR_SAME = 85   # the dedupe bar: matched automatically
SCORE_VECTOR_NEAR = 70   # offered to staff


def is_enabled() -> bool:
    value = AppSetting.objects.filter(key=SWITCH_KEY).values_list('value', flat=True).first()
    return value is True or str(value).lower() in ('true', '1', 'yes', 'on')


def standard_of(row: PreprocessingRow | None) -> dict[str, Any]:
    """The line's standard fields, or {} when it has none or they failed a hard check."""
    if row is None or not isinstance(row.ai_status, dict):
        return {}
    s = row.ai_status.get('standard')
    if not isinstance(s, dict) or any(str(p).startswith(HARD) for p in s.get('problems') or []):
        return {}
    return s


def rows_needing_standard(order: PurchaseOrder) -> list[int]:
    """Cleaned staging rows with no standard yet (a re-clean drops it, so it is written again)."""
    return [r.id for r in PreprocessingRow.objects.filter(purchase_order=order).exclude(ai_reasoning='').only('id', 'ai_status')
            if not (isinstance(r.ai_status, dict) and isinstance(r.ai_status.get('standard'), dict))]


def row_payload(row: PreprocessingRow) -> dict[str, Any]:
    from apps.inventory.layer_helpers import effective_preprocessing_title, effective_preprocessing_triple
    from apps.inventory.product_identity import identifier_value

    d: dict[str, Any] = {
        'id': row.id,
        'title': str(effective_preprocessing_title(row) or '')[:300],
        'brand': str(effective_preprocessing_triple(row, 'brand') or ''),
    }
    model = str(effective_preprocessing_triple(row, 'model') or '')
    if model:
        d['model'] = model
    upc = identifier_value(effective_preprocessing_triple(row, 'identifiers'), 'upc')
    if upc:
        d['upc'] = upc
    category = str(row.final_category or row.ai_category or '')
    if category:
        d['current_category'] = category
    m = row.manifest_row
    if m is not None and m.title and m.title != d['title']:
        d['manifest_title'] = str(m.title)[:200]
    return d


def run_standard_batch(order: PurchaseOrder, row_ids: list[int], *, api_key: str | None = None,
                       timeout: float = 150.0, before_model_call=None) -> dict[str, Any]:
    """One Spark call for a few staging rows; the checked answers are saved on the rows."""
    from apps.core.services.llm_router import llm_complete

    rows = list(PreprocessingRow.objects.filter(purchase_order=order, pk__in=row_ids).select_related('manifest_row'))
    if not rows:
        return {'rows_saved': 0}
    items = [row_payload(r) for r in rows]
    cats, system, version = std.canon(), std.system_prompt(), std.rules_version()
    generation = order.ai_cleanup_generation
    if before_model_call is not None:
        before_model_call()  # no database connection is held through the model call
    res = llm_complete(model_id=std.MODEL, system=system, user=json.dumps(items, ensure_ascii=False),
                       max_tokens=16000, effort=std.EFFORT, timeout=timeout, api_key=api_key,
                       log_source='intake_standard', log_detail=f'order {order.pk}')
    answers = {str(a.get('id')): a for a in std._parse(res.text) if isinstance(a, dict)}
    if PurchaseOrder.objects.values_list('ai_cleanup_generation', flat=True).get(pk=order.pk) != generation:
        return {'rows_saved': 0, 'cancelled': True}  # cleanup was undone meanwhile: save nothing
    given = {str(i['id']): i for i in items}
    saved = 0
    for row in PreprocessingRow.objects.filter(pk__in=[r.id for r in rows]):
        a = answers.get(str(row.id))
        if not a:
            continue
        clean, problems = std.validate(a, cats, given[str(row.id)])
        status = dict(row.ai_status) if isinstance(row.ai_status, dict) else {}
        status['standard'] = {**{k: clean.get(k) for k in (*PROFILE_FIELDS, 'item_details', 'confidence', 'flags')},
                              'problems': problems, 'rules_version': version, 'source': f'ai:{std.MODEL}'}
        row.ai_status = status
        row.save(update_fields=['ai_status', 'updated_at'])
        saved += 1
    return {'rows_saved': saved}


def vector_text_for(standard: dict[str, Any]) -> str:
    """The same text a standardized product embeds (`product_vectors.product_text`)."""
    return ' | '.join(p for p in (standard.get('vector_text'), standard.get('category'), standard.get('subcategory')) if p)


def vector_candidates(rows: list[PreprocessingRow]) -> dict[int, list[dict[str, Any]]]:
    """{row id: [{'product_id', 'similarity', 'auto'}]}, closest first, for rows that have a standard.

    Only standardized products count (a product with no vector text was embedded from its raw title, which is not
    comparable), and a merged-away product stands for the product it was merged into. `auto` is the dedupe bar:
    similarity at or above TRUST_SIMILARITY, the same canon category and subcategory, no hard product-spec conflict.
    (Owner rule: a wrong match is cheaper than a duplicate product; when in doubt, match.)"""
    from pgvector.django import CosineDistance

    from apps.inventory.models import ProductVector
    from apps.inventory.services import dedupe
    from apps.inventory.services.product_vectors import MODEL_NAME, embed_texts

    have = [(r, standard_of(r)) for r in rows]
    have = [(r, s) for r, s in have if s.get('vector_text')]
    if not have or not ProductProfile.objects.exclude(vector_text='').exists():
        return {}
    vectors = embed_texts([vector_text_for(s) for _, s in have])
    near: dict[int, list[tuple[int, float]]] = {}
    for (row, _s), vec in zip(have, vectors):
        # The filter is only the model, so the HNSW index answers each lookup; the rest is checked below.
        hits = (ProductVector.objects.filter(model_name=MODEL_NAME)
                .annotate(distance=CosineDistance('embedding', vec)).order_by('distance')
                .values_list('product_id', 'distance')[:NEAREST])
        near[row.id] = [(pid, 1 - float(d)) for pid, d in hits if 1 - float(d) >= dedupe.SIMILARITY]

    profiles: dict[int, dict[str, Any]] = {}
    want = {pid for hits in near.values() for pid, _ in hits}
    for _hop in range(4):  # follow merges to the surviving product
        if not want:
            break
        got = ProductProfile.objects.filter(product_id__in=want).values(
            'product_id', 'merged_into_id', 'vector_text', 'category', 'subcategory', 'key_specs', 'product__is_active')
        profiles.update({p['product_id']: p for p in got})
        want = {p['merged_into_id'] for p in profiles.values() if p['merged_into_id']} - set(profiles)

    def survivor(pid: int) -> dict[str, Any] | None:
        p = profiles.get(pid)
        for _hop in range(4):
            if p is None or not p['merged_into_id']:
                break
            p = profiles.get(p['merged_into_id'])
        return p if p and p['vector_text'] and p['product__is_active'] and not p['merged_into_id'] else None

    out: dict[int, list[dict[str, Any]]] = {}
    for row, s in have:
        seen: set[int] = set()
        for pid, sim in near.get(row.id, []):
            p = survivor(pid)
            if p is None or p['product_id'] in seen:
                continue
            seen.add(p['product_id'])
            same_place = p['category'] == s.get('category') and p['subcategory'] == s.get('subcategory')
            # A `*_type` spec is free wording ("commode chair" / "drop arm commode chair"): the vector already
            # compares it. Only a hard spec (size, count, storage ...) makes a different product here.
            clash = [k for k in dedupe.specs_conflict(p['key_specs'] or {}, s.get('key_specs') or {})
                     if not k.endswith('_type')]
            out.setdefault(row.id, []).append({
                'product_id': p['product_id'], 'similarity': round(sim, 4),
                'auto': sim >= dedupe.TRUST_SIMILARITY and same_place and not clash,
            })
    return out


def apply_to_product(product_id: int, preprocessing_row_id: int | None) -> dict[str, Any]:
    """Give a product that is not standardized yet the line's standard as its profile, and its vector."""
    from apps.inventory.services.product_profile import set_field
    from apps.inventory.services.product_vectors import embed_products

    row = PreprocessingRow.objects.filter(pk=preprocessing_row_id).first() if preprocessing_row_id else None
    s = standard_of(row)
    if not s:
        return {'applied': 0}
    product = Product.objects.get(pk=product_id)
    if not std.matches_input(s, {'title': product.title or '', 'brand': product.brand or ''}):
        return {'applied': 0}  # staff checked in a different product than the line described
    profile, _ = ProductProfile.objects.get_or_create(product=product)
    applied = 0
    if not profile.vector_text:  # a product that is already standardized keeps its standard
        for field in PROFILE_FIELDS:
            value = s.get(field)
            if value in (None, '', {}):
                continue
            # `set_field` never replaces a value a person set.
            if set_field(product, field, value, source=s.get('source') or f'ai:{std.MODEL}',
                         confidence=str(s.get('confidence') or ''), profile=profile):
                applied += 1
    embedded = embed_products([product]) if profile.vector_text else {}
    return {'applied': applied, 'embedded': embedded}


def on_check_in(product_id: int, preprocessing_row_id: int | None) -> None:
    """Schedule `apply_to_product` after the check-in commits. Never raises: a check-in must not fail on this."""
    from django.db import transaction

    try:
        if not preprocessing_row_id or not is_enabled():
            return

        def _go() -> None:
            try:
                apply_to_product(product_id, preprocessing_row_id)
            except Exception:  # noqa: BLE001 - the standard is best effort at check-in
                logger.exception('intake standard failed for product %s', product_id)

        transaction.on_commit(_go)
    except Exception:  # noqa: BLE001
        logger.exception('intake standard could not be scheduled for product %s', product_id)
