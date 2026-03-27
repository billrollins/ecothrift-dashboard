"""
Hierarchical dev logging config from `.ai/debug/log.config`.

Cascade: walk parent chain until a non-empty value, then expand targets.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from django.conf import settings

# Child key -> parent key (must include every area used in get_logger(...)).
HIERARCHY: dict[str, str] = {
    'LOG_ADD_ITEM_FORM': 'LOG_ADD_ITEM',
    'LOG_ADD_ITEM_AI': 'LOG_ADD_ITEM',
    'LOG_ADD_ITEM': 'LOG_INVENTORY',
    'LOG_INVENTORY_AI_CLEANUP': 'LOG_INVENTORY',
    'LOG_INVENTORY_AI_MATCH': 'LOG_INVENTORY',
    'LOG_INVENTORY_AI_FINALIZATION': 'LOG_INVENTORY',
    'LOG_INVENTORY_CATEGORIZER': 'LOG_INVENTORY',
    'LOG_INVENTORY_PRICING': 'LOG_INVENTORY',
    'LOG_INVENTORY_IMPORT': 'LOG_INVENTORY',
    'LOG_INVENTORY': 'LOG_BACKEND',
    'LOG_AI': 'LOG_BACKEND',
    'LOG_POS': 'LOG_BACKEND',
    'LOG_AUTH': 'LOG_BACKEND',
    'LOG_BACKEND': 'LOG_ALL',
    'LOG_FRONTEND': 'LOG_ALL',
}

_LINE_RE = re.compile(r'^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*(?:#.*)?$')

_cache: dict[str, Any] = {'mtime': None, 'path': None, 'raw': {}, 'resolved': {}}


def _config_path() -> Path:
    return Path(settings.BASE_DIR) / '.ai' / 'debug' / 'log.config'


def _parse_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    text = path.read_text(encoding='utf-8', errors='replace')
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        m = _LINE_RE.match(line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if key != 'LOG_ALL' and key not in HIERARCHY:
            continue
        out[key] = val.strip().strip('"').strip("'")
    return out


def _load_raw() -> dict[str, str]:
    path = _config_path()
    try:
        mtime = path.stat().st_mtime
    except OSError:
        mtime = None
    if _cache['mtime'] == mtime and _cache['path'] == str(path):
        return _cache['raw']
    raw = _parse_file(path)
    _cache['mtime'] = mtime
    _cache['path'] = str(path)
    _cache['raw'] = raw
    _cache['resolved'] = {}
    return raw


def _expand(raw_val: str) -> frozenset[str]:
    v = (raw_val or '').strip().lower()
    if not v or v == 'off':
        return frozenset()
    if v == 'django':
        return frozenset({'django'})
    if v == 'browser':
        return frozenset({'browser'})
    if v == 'file':
        return frozenset({'file'})
    if v == 'both':
        return frozenset({'django', 'browser'})
    if v == 'all':
        return frozenset({'django', 'browser', 'file'})
    # comma-separated
    parts = {p.strip().lower() for p in v.split(',') if p.strip()}
    out: set[str] = set()
    for p in parts:
        out |= set(_expand(p))
    return frozenset(out)


def resolve(area_key: str) -> frozenset[str]:
    """
    Return active targets for an area (cascading through parents).
    Unknown area -> treat as LOG_BACKEND.
    """
    if area_key not in HIERARCHY and area_key != 'LOG_ALL':
        area_key = 'LOG_BACKEND'

    raw = _load_raw()
    resolved_cache: dict[str, frozenset[str]] = _cache['resolved']
    if area_key in resolved_cache:
        return resolved_cache[area_key]

    chain: list[str] = []
    k: str | None = area_key
    while k:
        chain.append(k)
        k = HIERARCHY.get(k)

    chosen = ''
    for node in chain:
        val = raw.get(node, '')
        if val is not None and str(val).strip() != '':
            chosen = str(val).strip()
            break

    result = _expand(chosen)
    resolved_cache[area_key] = result
    return result


def invalidate_cache() -> None:
    _cache['mtime'] = None
    _cache['resolved'] = {}
