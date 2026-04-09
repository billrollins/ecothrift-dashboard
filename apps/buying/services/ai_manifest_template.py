"""Claude-assisted ManifestTemplate completion for unknown CSV headers (Phase 4.1B)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.conf import settings
from django.utils import timezone as dj_tz

from apps.buying.models import ManifestTemplate, Marketplace
from apps.core.services.ai_usage_log import log_ai_usage, log_ai_usage_from_response

logger = logging.getLogger(__name__)


def _import_anthropic():
    import anthropic as _anthropic

    return _anthropic


def get_anthropic_client():
    api_key = getattr(settings, 'ANTHROPIC_API_KEY', None)
    if not api_key:
        return None
    anthropic = _import_anthropic()
    return anthropic.Anthropic(api_key=api_key)


def _default_model() -> str:
    return (getattr(settings, 'AI_MODEL', None) or 'claude-sonnet-4-6').strip()


COLUMN_MAP_KEYS_PICK = frozenset(
    {'title', 'brand', 'model', 'sku', 'upc', 'condition'}
)
COLUMN_MAP_KEYS_LIST = frozenset(
    {'quantity', 'retail_value', 'extended_retail', 'notes'}
)
COLUMN_MAP_KEYS_ALL = COLUMN_MAP_KEYS_PICK | COLUMN_MAP_KEYS_LIST


def normalize_column_map(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Coerce AI JSON to ManifestTemplate.column_map shape."""
    if not raw or not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    for k in COLUMN_MAP_KEYS_ALL:
        if k not in raw:
            continue
        v = raw[k]
        if k in COLUMN_MAP_KEYS_LIST:
            if isinstance(v, str):
                out[k] = [v] if v.strip() else []
            elif isinstance(v, list):
                out[k] = [x for x in v if isinstance(x, str)]
        else:
            if isinstance(v, str):
                out[k] = v
            elif isinstance(v, list):
                out[k] = [x for x in v if isinstance(x, str)]
    return out


def _parse_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start = text.find('{')
    end = text.rfind('}')
    if start >= 0 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError(f'Could not parse JSON object: {text[:400]}')


def _template_examples_block() -> str:
    qs = (
        ManifestTemplate.objects.select_related('marketplace')
        .order_by('-created_at')[:50]
    )
    lines: list[str] = []
    for t in qs:
        mp_name = getattr(t.marketplace, 'name', '') or getattr(t.marketplace, 'slug', '')
        lines.append(
            json.dumps(
                {
                    'marketplace': mp_name,
                    'header_signature': t.header_signature[:500],
                    'column_map': t.column_map,
                    'category_fields': t.category_fields,
                },
                ensure_ascii=False,
            )
        )
    return '\n'.join(lines) if lines else '(no prior templates)'


def build_system_prompt() -> str:
    return (
        'You are a manifest column mapping assistant for a liquidation resale business. '
        'You map CSV column headers to standardized fields used for inventory tracking and categorization. '
        'Respond with JSON only — no markdown fences.'
    )


def build_user_prompt(
    marketplace: Marketplace,
    columns: list[str],
    sample_rows: list[dict[str, str]],
) -> str:
    keys_doc = (
        'The column_map object must use ONLY these keys (exact names):\n'
        '- Pick one (value: single CSV header string OR array of header names for fallbacks): '
        f'{", ".join(sorted(COLUMN_MAP_KEYS_PICK))}\n'
        '- List of CSV headers only (value: JSON array of header strings): '
        f'{", ".join(sorted(COLUMN_MAP_KEYS_LIST))}\n'
        'category_fields is separate: an array of CSV column names whose values are used to build fast_cat_key '
        '(category-like columns such as Category, Subcategory, Department).\n'
        'fast_cat_key is composed as: marketplace prefix + slugified values from those columns in order. '
        'Example Target: Category "Hair Care", Subcategory "Shamp Cond", Department "Health And Beauty" '
        '→ key like tgt-hair-care-shamp-cond-health-and-beauty.\n'
    )
    samples = sample_rows[:5]
    return (
        f'Marketplace: {marketplace.name}\n\n'
        f'CSV headers ({len(columns)} columns): {json.dumps(columns, ensure_ascii=False)}\n\n'
        f'Sample data rows ({len(samples)}):\n{json.dumps(samples, ensure_ascii=False)}\n\n'
        f'{keys_doc}\n'
        'Up to 50 recent templates from our database (pattern reference):\n'
        f'{_template_examples_block()}\n\n'
        'Return JSON only:\n'
        '{"column_map": {...}, "category_fields": ["Column Name", ...], "reasoning": "short"}\n'
    )


def ai_display_name(marketplace: Marketplace, num_cols: int) -> str:
    d = dj_tz.localtime(dj_tz.now()).strftime('%Y-%m-%d')
    return f'AI {marketplace.name} {num_cols}-col ({d})'


def propose_manifest_template_with_ai(
    template: ManifestTemplate,
    marketplace: Marketplace,
    columns: list[str],
    rows: list[dict[str, str]],
    *,
    auction_id: int | None,
) -> bool:
    """
    Call Claude to fill column_map and category_fields; set is_reviewed=True.
    Returns True on success.
    """
    client = get_anthropic_client()
    if client is None:
        return False

    anthropic = _import_anthropic()
    model = _default_model()
    system = build_system_prompt()
    user = build_user_prompt(marketplace, columns, rows[:5])

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=[{'type': 'text', 'text': system, 'cache_control': {'type': 'ephemeral'}}],
            messages=[{'role': 'user', 'content': user}],
        )
    except anthropic.APIError as e:  # type: ignore[attr-defined]
        logger.warning('Anthropic error in ai_manifest_template: %s', e)
        log_ai_usage(
            'ai_template_creation',
            model,
            0,
            0,
            auction_id=auction_id,
            marketplace=marketplace.slug,
            detail='propose_manifest_template_with_ai',
            success=False,
            error=str(e),
        )
        return False

    log_ai_usage_from_response(
        'ai_template_creation',
        response,
        model=model,
        auction_id=auction_id,
        marketplace=marketplace.slug,
        detail='propose_manifest_template_with_ai',
    )

    text = ''
    for block in response.content:
        if block.type == 'text':
            text += block.text

    try:
        data = _parse_json_object(text)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning('Bad JSON from template AI: %s', e)
        log_ai_usage(
            'ai_template_creation',
            model,
            0,
            0,
            auction_id=auction_id,
            marketplace=marketplace.slug,
            detail='parse JSON failed',
            success=False,
            error=str(e),
        )
        return False

    cm = normalize_column_map(data.get('column_map'))
    cf_raw = data.get('category_fields')
    category_fields: list[str] = []
    if isinstance(cf_raw, list):
        category_fields = [str(x) for x in cf_raw if isinstance(x, str) and x.strip()]
    elif isinstance(cf_raw, str) and cf_raw.strip():
        category_fields = [cf_raw.strip()]

    # Require at least title or retail mapping for usability
    if not cm.get('title') and not cm.get('retail_value'):
        logger.warning('AI template missing title and retail_value')
        return False

    reasoning = (data.get('reasoning') or '')[:2000]
    template.column_map = cm
    template.category_fields = category_fields
    template.category_field_transforms = {}
    template.is_reviewed = True
    template.display_name = ai_display_name(marketplace, len(columns))[:200]
    template.notes = f'AI-filled (Phase 4.1B). {reasoning}'[:5000]
    template.save()
    return True
