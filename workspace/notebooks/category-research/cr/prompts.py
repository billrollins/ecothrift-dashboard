"""
Prompt strings for AI categorization — edit here without touching categorization logic.

Category names come from ``taxonomy_v1.example.json`` (19 canonical labels).
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from typing import Any, Mapping

import pandas as pd

from .paths import category_research_package_root


@lru_cache(maxsize=1)
def taxonomy_category_names() -> tuple[str, ...]:
    """Ordered category names from ``taxonomy_v1.example.json``."""
    p = category_research_package_root() / 'taxonomy_v1.example.json'
    data = json.loads(p.read_text(encoding='utf-8'))
    cats = data.get('categories') or []
    return tuple(
        str(c['name']).strip()
        for c in sorted(cats, key=lambda x: int(x['index']))
    )


def _build_system_prompt() -> str:
    names = taxonomy_category_names()
    lines = [
        'You are a product categorizer for a thrift store.',
        'Assign each item to exactly one of these categories:',
        '',
    ]
    for i, name in enumerate(names, start=1):
        lines.append(f'{i}. {name}')
    lines.extend(
        [
            '',
            'Respond with JSON only, no markdown, no commentary:',
            '{"category": "<exact category name from the list above>", "confidence": "high|medium|low"}',
        ]
    )
    return '\n'.join(lines)


SYSTEM_PROMPT: str = _build_system_prompt()

# Fields sent to the model (omit empty / NaN).
PROMPT_FIELDS: tuple[str, ...] = (
    'manifest_category',
    'manifest_description',
    'vendor_name',
    'product_title',
    'product_brand',
    'product_model',
    'manifest_retail_value',
    'item_retail_amt',
)


def _is_blank(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return True
    if pd.isna(value):
        return True
    if isinstance(value, str) and not value.strip():
        return True
    return False


def build_user_prompt(row: Mapping[str, Any] | Any) -> str:
    """
    Build the user message from one extract row (``pd.Series`` or dict-like).

    Omits empty or missing fields.
    """
    if hasattr(row, 'to_dict'):
        d = row.to_dict()
    else:
        d = dict(row)

    parts: list[str] = []
    for key in PROMPT_FIELDS:
        if key not in d:
            continue
        val = d[key]
        if _is_blank(val):
            continue
        s = str(val).strip()
        if not s:
            continue
        parts.append(f'{key}: {s}')
    return '\n'.join(parts) if parts else '(no product fields)'
