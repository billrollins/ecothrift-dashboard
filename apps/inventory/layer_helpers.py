"""Helpers for PreprocessingRow standard/ai/final layering (finalize coalesce & effective reads)."""
from __future__ import annotations

from typing import Any, Literal


FieldKind = Literal['str', 'dict', 'list']


def is_meaningful(value: Any, field_kind: FieldKind) -> bool:
    if field_kind == 'str':
        return value is not None and str(value).strip() != ''
    if field_kind == 'dict':
        return isinstance(value, dict) and bool(value)
    if field_kind == 'list':
        return isinstance(value, list) and bool(value)
    return False


# Base field name → kind for triple-layer cols (excluding title-only ai/final).
TRIPLE_LAYER_SPECS: dict[str, FieldKind] = {
    'description': 'str',
    'brand': 'str',
    'model': 'str',
    'condition': 'str',
    'notes': 'str',
    'identifiers': 'dict',
    'taxonomy': 'dict',
    'specifications': 'dict',
    'tracking': 'dict',
    'search_tags': 'list',
}


def preprocessing_row_has_final(sr) -> bool:
    """True once finalize persisted any final_* snapshot (final_description non-NULL)."""
    return getattr(sr, 'final_description', None) is not None


def coalesce_final_value(ai_val: Any, standard_val: Any, field_base: str) -> Any:
    kind = TRIPLE_LAYER_SPECS[field_base]
    if is_meaningful(ai_val, kind):
        return ai_val
    return standard_val


def coalesce_final_title(ai_title: str) -> str:
    return (ai_title or '')[:300] if is_meaningful(ai_title, 'str') else ''


def coalesce_final_category(ai_category: str) -> str:
    """Canonical EcoThrift category from AI layer only (no standard_category)."""
    return str(ai_category or '').strip()[:200] if is_meaningful(ai_category, 'str') else ''


def effective_preprocessing_triple(sr, field_base: str) -> Any:
    """Effective value for staging display / listing when row is PreprocessingRow."""
    if preprocessing_row_has_final(sr):
        return getattr(sr, f'final_{field_base}')
    ai_v = getattr(sr, f'ai_{field_base}', None)
    std_v = getattr(sr, f'standard_{field_base}', None)
    kind = TRIPLE_LAYER_SPECS[field_base]
    if is_meaningful(ai_v, kind):
        return ai_v
    return std_v


def effective_preprocessing_title(sr) -> str:
    if preprocessing_row_has_final(sr):
        return str(getattr(sr, 'final_title', '') or '')[:300]
    ai_t = getattr(sr, 'ai_title', '') or ''
    if is_meaningful(ai_t, 'str'):
        return ai_t[:300]
    return ''


def effective_preprocessing_notes(sr) -> str:
    """Plain-text notes for summaries (effective ai vs standard, pre/post finalize)."""
    v = effective_preprocessing_triple(sr, 'notes')
    return str(v or '')


def effective_taxonomy_category_for_row(row) -> str:
    """EcoThrift canonical category (flat ai/final), not vendor taxonomy_json.category."""
    if getattr(row, 'preprocessing_order_id', None):
        if preprocessing_row_has_final(row):
            fc = getattr(row, 'final_category', None)
            if is_meaningful(fc, 'str'):
                return str(fc or '').strip()[:200]
        ac = getattr(row, 'ai_category', None)
        if is_meaningful(ac, 'str'):
            return str(ac or '').strip()[:200]
        return ''
    flat = getattr(row, 'category', None)
    if is_meaningful(flat, 'str'):
        return str(flat or '').strip()[:200]
    triple = getattr(row, 'taxonomy', {}) or {}
    if isinstance(triple, dict):
        return str(triple.get('category') or '')[:200]
    return ''


def bulk_clear_preprocess_ai_and_final_layers(qs):
    """Re-standardize: clear ai_* structured defaults and reset final_* to NULL."""
    qs.update(
        ai_description='',
        ai_condition='',
        ai_notes='',
        ai_identifiers={},
        ai_taxonomy={},
        ai_specifications={},
        ai_tracking={},
        ai_search_tags=[],
        ai_title='',
        ai_brand='',
        ai_model='',
        ai_category='',
        final_description=None,
        final_title=None,
        final_category=None,
        final_brand=None,
        final_model=None,
        final_condition=None,
        final_notes=None,
        final_identifiers=None,
        final_taxonomy=None,
        final_specifications=None,
        final_tracking=None,
        final_search_tags=None,
    )


def snapshot_finalize_from_ai_and_standard(sr) -> None:
    """Populate all final_* from coalesce(ai, standard); title from ai only."""
    from copy import deepcopy

    for base, kind in TRIPLE_LAYER_SPECS.items():
        ai_v = getattr(sr, f'ai_{base}')
        std_v = getattr(sr, f'standard_{base}')
        coerced = coalesce_final_value(ai_v, std_v, base)
        if kind == 'dict' and isinstance(coerced, dict):
            setattr(sr, f'final_{base}', deepcopy(coerced))
        elif kind == 'list' and isinstance(coerced, list):
            setattr(sr, f'final_{base}', list(coerced))
        else:
            setattr(sr, f'final_{base}', coerced)

    setattr(sr, 'final_title', coalesce_final_title(getattr(sr, 'ai_title', '') or ''))
    setattr(
        sr,
        'final_category',
        coalesce_final_category(getattr(sr, 'ai_category', '') or '') or None,
    )