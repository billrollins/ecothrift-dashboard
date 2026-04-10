"""Claude mapping of fast_cat_key strings to taxonomy_v1 (Phase 4.1B)."""

from __future__ import annotations

import json
import logging
import math
import re
from typing import Any

from django.conf import settings
from django.db.models import Q

from apps.buying.models import Auction, CategoryMapping, ManifestRow
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.core.services.ai_usage_log import (
    estimate_cost_usd,
    log_ai_usage,
    log_ai_usage_from_response,
)

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


def build_system_prompt() -> str:
    return (
        'You map liquidation manifest category keys to canonical retail categories. '
        'You are categorizing THE KEY, not individual product rows. The key represents a category pattern. '
        'Map based on what the key string tells you. Use row context only to decipher opaque keys. '
        'Respond with JSON only — a JSON array — no markdown fences.'
    )


def build_user_prompt(
    batch_keys: list[str],
    key_context: dict[str, tuple[str, str, str]],
) -> str:
    """key_context: fast_cat_key -> (title, brand, unit_retail str)"""
    lines = [
        'Canonical categories (exact names):',
        *[f'- {n}' for n in TAXONOMY_V1_CATEGORY_NAMES],
        '',
        'For each key below, map to exactly one canonical_category from the list.',
        '',
    ]
    for k in batch_keys:
        title, brand, ret = key_context.get(k, ('', '', ''))
        lines.append(f'Key: {k!r}')
        lines.append(f'  Sample row: title={title!r}, brand={brand!r}, unit_retail={ret!r}')
        lines.append('')
    lines.append(
        'Return JSON array only, e.g. '
        '[{"fast_cat_key":"...","canonical_category":"Kitchen & dining",'
        '"confidence":"high","reasoning":"..."}]'
    )
    return '\n'.join(lines)


def _parse_json_array(text: str) -> list[dict[str, Any]]:
    text = text.strip()
    if text.startswith('```'):
        text = re.sub(r'^```(?:json)?\s*', '', text, flags=re.IGNORECASE)
        text = re.sub(r'\s*```$', '', text)
    try:
        data = json.loads(text)
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    except json.JSONDecodeError:
        pass
    start = text.find('[')
    end = text.rfind(']')
    if start >= 0 and end > start:
        data = json.loads(text[start : end + 1])
        if isinstance(data, list):
            return [x for x in data if isinstance(x, dict)]
    raise ValueError(f'Could not parse JSON array: {text[:400]}')


BATCH_SIZE = 10

# Sentinel from build_fast_cat_key when no category fields had values — never AI-map or count as unmapped.
_NO_KEY_SENTINEL = '__no_key__'


def _is_no_key_sentinel(fast_cat_key: str) -> bool:
    return _NO_KEY_SENTINEL in (fast_cat_key or '')


def count_distinct_unmapped_keys(auction: Auction, mapping: dict[str, str]) -> int:
    """Distinct fast_cat_key values that need AI (no mapping, no fast_cat_value yet)."""
    qs = (
        ManifestRow.objects.filter(auction=auction)
        .exclude(fast_cat_key='')
        .exclude(fast_cat_key__contains=_NO_KEY_SENTINEL)
    )
    seen: set[str] = set()
    for r in qs:
        k = (r.fast_cat_key or '').strip()
        if not k or r.fast_cat_value or _is_no_key_sentinel(k):
            continue
        if k not in mapping:
            seen.add(k)
    return len(seen)


def count_distinct_unmapped_keys_after_rows(auction: Auction) -> int:
    """Distinct mappable fast_cat_key with empty fast_cat_value (excludes __no_key__ sentinels)."""
    qs = (
        ManifestRow.objects.filter(auction=auction)
        .exclude(fast_cat_key='')
        .exclude(fast_cat_key__contains=_NO_KEY_SENTINEL)
        .filter(Q(fast_cat_value__isnull=True) | Q(fast_cat_value=''))
    )
    return len(set(qs.values_list('fast_cat_key', flat=True)))


def total_batches_for_count(unmapped_key_count: int) -> int:
    if unmapped_key_count <= 0:
        return 0
    return int(math.ceil(unmapped_key_count / BATCH_SIZE))


def _usage_dict(usage: Any) -> dict[str, int]:
    if usage is None:
        return {
            'input_tokens': 0,
            'output_tokens': 0,
            'cache_creation_tokens': 0,
            'cache_read_tokens': 0,
        }
    return {
        'input_tokens': int(getattr(usage, 'input_tokens', 0) or 0),
        'output_tokens': int(getattr(usage, 'output_tokens', 0) or 0),
        'cache_creation_tokens': int(getattr(usage, 'cache_creation_input_tokens', 0) or 0),
        'cache_read_tokens': int(getattr(usage, 'cache_read_input_tokens', 0) or 0),
    }


def map_one_fast_cat_batch(
    auction: Auction,
    *,
    mapping: dict[str, str],
) -> dict[str, Any]:
    """
    Process up to BATCH_SIZE unmapped keys. Overlapping work across concurrent callers is allowed.

    Returns a dict for JSON (includes ``usage`` and ``estimated_cost_usd`` when Claude ran).
    On missing API key: ``error`` = ``ai_not_configured``, HTTP 200 from the view.
    """
    client = get_anthropic_client()
    mp_slug = auction.marketplace.slug if auction.marketplace_id else None

    # Refresh mapping from DB so concurrent workers see new CategoryMappings
    mapping = dict(CategoryMapping.objects.values_list('source_key', 'canonical_category'))

    keys_remaining_before = count_distinct_unmapped_keys_after_rows(auction)
    if keys_remaining_before == 0:
        return {
            'keys_mapped': 0,
            'keys_remaining': 0,
            'has_more': False,
            'mappings': [],
            'usage': _usage_dict(None),
            'estimated_cost_usd': 0.0,
        }

    if client is None:
        n = count_distinct_unmapped_keys(auction, mapping)
        return {
            'error': 'ai_not_configured',
            'keys_remaining': n,
            'has_more': False,
        }

    qs = (
        ManifestRow.objects.filter(auction=auction)
        .exclude(fast_cat_key='')
        .exclude(fast_cat_key__contains=_NO_KEY_SENTINEL)
    )
    key_to_row: dict[str, ManifestRow] = {}
    for r in qs:
        k = (r.fast_cat_key or '').strip()
        if not k or r.fast_cat_value or _is_no_key_sentinel(k):
            continue
        if k not in mapping and k not in key_to_row:
            key_to_row[k] = r

    unknown = sorted(key_to_row.keys())[:BATCH_SIZE]
    if not unknown:
        kr = count_distinct_unmapped_keys_after_rows(auction)
        return {
            'keys_mapped': 0,
            'keys_remaining': kr,
            'has_more': kr > 0,
            'mappings': [],
            'usage': _usage_dict(None),
            'estimated_cost_usd': 0.0,
        }

    anthropic = _import_anthropic()
    model = _default_model()
    system = build_system_prompt()
    key_context = {}
    for k in unknown:
        r = key_to_row[k]
        key_context[k] = (
            (r.title or '')[:300],
            (r.brand or '')[:200],
            str(r.retail_value) if r.retail_value is not None else '',
        )
    user = build_user_prompt(unknown, key_context)

    try:
        response = client.messages.create(
            model=model,
            max_tokens=4096,
            system=[{'type': 'text', 'text': system, 'cache_control': {'type': 'ephemeral'}}],
            messages=[{'role': 'user', 'content': user}],
        )
    except anthropic.APIError as e:  # type: ignore[attr-defined]
        logger.warning('Anthropic error in ai_key_mapping: %s', e)
        log_ai_usage(
            'ai_key_mapping',
            model,
            0,
            0,
            auction_id=auction.pk,
            marketplace=mp_slug,
            detail='map_one_fast_cat_batch',
            success=False,
            error=str(e),
        )
        keys_rem = count_distinct_unmapped_keys_after_rows(auction)
        return {
            'keys_mapped': 0,
            'keys_remaining': keys_rem,
            'has_more': keys_rem > 0,
            'mappings': [],
            'usage': _usage_dict(None),
            'estimated_cost_usd': 0.0,
        }

    log_ai_usage_from_response(
        'ai_key_mapping',
        response,
        model=model,
        auction_id=auction.pk,
        marketplace=mp_slug,
        detail=f'map_one_fast_cat_batch keys={len(unknown)}',
    )

    usage = _usage_dict(getattr(response, 'usage', None))
    mid = getattr(response, 'model', None) or model
    est = estimate_cost_usd(
        mid,
        usage['input_tokens'],
        usage['output_tokens'],
        usage['cache_creation_tokens'],
        usage['cache_read_tokens'],
    )

    text = ''
    for block in response.content:
        if block.type == 'text':
            text += block.text

    mappings_out: list[dict[str, Any]] = []
    keys_mapped_count = 0

    try:
        items = _parse_json_array(text)
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning('Bad JSON from key mapping AI: %s', e)
        keys_rem = count_distinct_unmapped_keys_after_rows(auction)
        return {
            'keys_mapped': 0,
            'keys_remaining': keys_rem,
            'has_more': keys_rem > 0,
            'mappings': [],
            'usage': usage,
            'estimated_cost_usd': float(est),
        }

    for item in items:
        fk = (item.get('fast_cat_key') or '').strip()
        cat = (item.get('canonical_category') or '').strip()
        conf = (item.get('confidence') or '').strip()
        reason = (item.get('reasoning') or '').strip()
        if not fk or _is_no_key_sentinel(fk) or cat not in TAXONOMY_V1_CATEGORY_NAMES:
            continue
        ai_reasoning = json.dumps({'confidence': conf, 'reasoning': reason}, ensure_ascii=False)[:8000]
        CategoryMapping.objects.update_or_create(
            source_key=fk,
            defaults={
                'canonical_category': cat,
                'rule_origin': CategoryMapping.RULE_AI,
                'ai_reasoning': ai_reasoning,
            },
        )
        keys_mapped_count += 1
        ManifestRow.objects.filter(auction=auction, fast_cat_key=fk).update(
            fast_cat_value=cat,
            category_confidence=ManifestRow.CONF_FAST_CAT,
        )
        mappings_out.append(
            {
                'fast_cat_key': fk,
                'canonical_category': cat,
                'confidence': conf or 'medium',
            }
        )

    keys_rem = count_distinct_unmapped_keys_after_rows(auction)
    if keys_rem == 0:
        from apps.buying.services.valuation import (
            compute_and_save_manifest_distribution,
            recompute_auction_valuation,
        )

        auction.refresh_from_db()
        compute_and_save_manifest_distribution(auction)
        auction.refresh_from_db()
        recompute_auction_valuation(auction)
    return {
        'keys_mapped': keys_mapped_count,
        'keys_remaining': keys_rem,
        'has_more': keys_rem > 0,
        'mappings': mappings_out,
        'usage': usage,
        'estimated_cost_usd': float(est),
    }
