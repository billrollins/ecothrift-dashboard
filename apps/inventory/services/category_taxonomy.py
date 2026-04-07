"""Helpers for category intelligence: taxonomy files, validation, prompts."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any


def normalize_category_name(name: str) -> str:
    return re.sub(r'\s+', ' ', (name or '').strip())


def load_taxonomy(path: Path | str) -> dict[str, Any]:
    p = Path(path)
    data = json.loads(p.read_text(encoding='utf-8'))
    cats = data.get('categories') or []
    if not cats:
        raise ValueError('taxonomy file has no categories')
    for c in cats:
        if 'index' not in c or 'name' not in c:
            raise ValueError('each category needs index and name')
    return data


def taxonomy_index_map(data: dict[str, Any]) -> dict[int, str]:
    out: dict[int, str] = {}
    for c in data['categories']:
        idx = int(c['index'])
        out[idx] = normalize_category_name(str(c['name']))
    return out


def validate_assignment(
    category_index: int,
    category_name: str,
    index_map: dict[int, str],
) -> tuple[bool, str]:
    if category_index not in index_map:
        return False, f'index {category_index} not in taxonomy'
    expected = index_map[category_index]
    got = normalize_category_name(category_name)
    if got != expected:
        return False, f'name mismatch for index {category_index}: expected {expected!r}, got {got!r}'
    return True, ''


def taxonomy_prompt_hash(data: dict[str, Any]) -> str:
    raw = json.dumps(
        {'version': data.get('version'), 'categories': data['categories']},
        sort_keys=True,
    )
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()[:16]


def extract_json_object(text: str) -> dict[str, Any]:
    """Parse first JSON object from model output (strip markdown fences)."""
    t = text.strip()
    if t.startswith('```'):
        lines = t.split('\n')
        if lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        t = '\n'.join(lines)
    return json.loads(t)


def build_categorization_system_prompt(
    data: dict[str, Any],
    bin_label: str,
) -> str:
    lines = [
        'You assign inventory rows to exactly one category from a fixed numbered list.',
        f'Bin: {bin_label}.',
        'Primary text to classify from: for bin2 use product_title and product_brand when present; '
        'for bin3 current-inventory exports use item_title and item_brand (product_* are often empty). '
        'Ignore empty fields.',
        'Return ONLY a JSON object (no markdown, no commentary) with this exact shape:',
        '{"assignments":[{"row_key":"<string>","category_index":<positive int>,"category_name":"<exact name from list>"}]}',
        'category_index and category_name must match the same row in the list below.',
        '',
        'Categories:',
    ]
    for c in sorted(data['categories'], key=lambda x: int(x['index'])):
        lines.append(f"{int(c['index'])}. {normalize_category_name(str(c['name']))}")
    return '\n'.join(lines)


def row_dict_for_prompt(
    row: dict[str, str],
    taxonomy_columns: list[str],
    *,
    omit_empty: bool = True,
) -> dict[str, str]:
    """Subset CSV row to fields for the model. Drops empty strings when omit_empty to reduce noise."""
    _always = frozenset({'row_key', 'bin'})
    out: dict[str, str] = {}
    for k in taxonomy_columns:
        if k not in row:
            continue
        v = row[k]
        if omit_empty and k not in _always:
            if v is None or (isinstance(v, str) and not str(v).strip()):
                continue
        out[k] = v if v is not None else ''
    return out
