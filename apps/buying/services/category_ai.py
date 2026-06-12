"""Claude tier-2 mapping for unknown manifest category strings (Phase 4)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.core.services.ai_usage_log import log_ai_usage
from apps.core.services.llm_router import (
    LLMAPIError,
    LLMConfigError,
    llm_complete,
)

logger = logging.getLogger(__name__)


def _default_model() -> str:
    from apps.core.ai_config import ai_model

    return ai_model('CATEGORY_AI')


def build_system_prompt() -> str:
    lines = [
        'You assign liquidation manifest line groups to exactly one of these 19 categories.',
        'Respond with JSON only — no markdown fences.',
        '',
    ]
    for i, name in enumerate(TAXONOMY_V1_CATEGORY_NAMES, start=1):
        lines.append(f'{i}. {name}')
    return '\n'.join(lines)


def build_user_prompt(
    source_key: str,
    sample_lines: list[tuple[str, str, str]],
) -> str:
    """sample_lines: (title, brand, condition) up to 8."""
    parts = [
        f'The manifest header/category string for this group is: "{source_key}".',
        '',
        'Here are sample lines (title | brand | condition):',
    ]
    for title, brand, cond in sample_lines:
        parts.append(f'- {title or "—"} | {brand or "—"} | {cond or "—"}')
    parts.append('')
    parts.append(
        'Respond with JSON only: '
        '{"canonical_category":"<exact name from the list above>",'
        '"reasoning":"<one short sentence>"}'
    )
    return '\n'.join(parts)


def parse_ai_category_json(text: str) -> dict[str, Any]:
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
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    raise ValueError(f'Could not parse JSON from model response: {text[:500]}')


def suggest_category_for_source_key(
    source_key: str,
    sample_rows: list[Any],
    *,
    auction_id: int | None = None,
    marketplace_slug: str | None = None,
) -> tuple[str, str]:
    """
    One model call (AI_MODEL_CATEGORY_AI): returns (canonical_category, reasoning) or raises.
    sample_rows: ManifestRow-like with title, brand, condition.
    """
    sample_lines: list[tuple[str, str, str]] = []
    for r in sample_rows:
        sample_lines.append(
            (getattr(r, 'title', '') or '', getattr(r, 'brand', '') or '', getattr(r, 'condition', '') or '')
        )

    system = build_system_prompt()
    user = build_user_prompt(source_key, sample_lines)
    model = _default_model()

    try:
        result = llm_complete(
            model_id=model,
            system=system,
            user=user,
            max_tokens=1024,
            log_source='categorize_manifests',
            log_detail=f'source_key={source_key[:120]!r}',
            log_auction_id=auction_id,
            log_marketplace=marketplace_slug,
        )
    except LLMConfigError as e:
        raise RuntimeError(str(e)) from e
    except LLMAPIError as e:
        logger.warning('LLM API error in category_ai: %s', e)
        log_ai_usage(
            'categorize_manifests',
            model,
            0,
            0,
            auction_id=auction_id,
            marketplace=marketplace_slug,
            detail=f'source_key={source_key[:120]!r}',
            success=False,
            error=str(e),
        )
        raise

    data = parse_ai_category_json(result.text)
    canonical = (data.get('canonical_category') or '').strip()
    reasoning = (data.get('reasoning') or '').strip()
    if canonical not in TAXONOMY_V1_CATEGORY_NAMES:
        raise ValueError(
            f'Invalid canonical_category from model: {canonical!r} (not in taxonomy)'
        )
    return canonical, reasoning
