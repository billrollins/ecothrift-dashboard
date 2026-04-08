"""Claude tier-2 mapping for unknown manifest category strings (Phase 4)."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from django.conf import settings

from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES

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
    m = (getattr(settings, 'BUYING_CATEGORY_AI_MODEL', None) or '').strip()
    return m if m else 'claude-sonnet-4-6'


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
) -> tuple[str, str]:
    """
    One Claude call: returns (canonical_category, reasoning) or raises.
    sample_rows: ManifestRow-like with title, brand, condition.
    """
    client = get_anthropic_client()
    if client is None:
        raise RuntimeError('ANTHROPIC_API_KEY is not configured.')

    sample_lines: list[tuple[str, str, str]] = []
    for r in sample_rows:
        sample_lines.append(
            (getattr(r, 'title', '') or '', getattr(r, 'brand', '') or '', getattr(r, 'condition', '') or '')
        )

    anthropic = _import_anthropic()
    system = build_system_prompt()
    user = build_user_prompt(source_key, sample_lines)
    model = _default_model()

    try:
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=system,
            messages=[{'role': 'user', 'content': user}],
        )
    except anthropic.APIError as e:  # type: ignore[attr-defined]
        logger.warning('Anthropic API error in category_ai: %s', e)
        raise

    content_text = ''
    for block in response.content:
        if block.type == 'text':
            content_text += block.text

    data = parse_ai_category_json(content_text)
    canonical = (data.get('canonical_category') or '').strip()
    reasoning = (data.get('reasoning') or '').strip()
    if canonical not in TAXONOMY_V1_CATEGORY_NAMES:
        raise ValueError(
            f'Invalid canonical_category from model: {canonical!r} (not in taxonomy)'
        )
    return canonical, reasoning
