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
    """True when any final_* field is populated (cleanup upload or finalize snapshot)."""
    fd = getattr(sr, 'final_description', None)
    if is_meaningful(fd, 'str'):
        return True
    ft = getattr(sr, 'final_title', None)
    if is_meaningful(ft, 'str'):
        return True
    fc = getattr(sr, 'final_category', None)
    if is_meaningful(fc, 'str'):
        return True
    for base, kind in TRIPLE_LAYER_SPECS.items():
        if base == 'description':
            continue
        v = getattr(sr, f'final_{base}', None)
        if is_meaningful(v, kind):
            return True
    return False


def coalesce_final_value(ai_val: Any, standard_val: Any, field_base: str) -> Any:
    kind = TRIPLE_LAYER_SPECS[field_base]
    if is_meaningful(ai_val, kind):
        return ai_val
    return standard_val


def coalesce_final_title_from_row(sr) -> str:
    """Prefer meaningful ai_title; else first ~300 chars of standard_description."""
    ai_t = getattr(sr, 'ai_title', '') or ''
    if is_meaningful(ai_t, 'str'):
        return ai_t[:300]
    std_d = getattr(sr, 'standard_description', '') or ''
    if is_meaningful(std_d, 'str'):
        return std_d[:300]
    return ''


def coalesce_final_category_from_row(sr) -> str:
    """Prefer meaningful ai_category; else standard_taxonomy.category."""
    ai_c = getattr(sr, 'ai_category', '') or ''
    if is_meaningful(ai_c, 'str'):
        return str(ai_c).strip()[:200]
    tax = getattr(sr, 'standard_taxonomy', None) or {}
    if isinstance(tax, dict):
        cat = tax.get('category')
        if is_meaningful(cat, 'str'):
            return str(cat).strip()[:200]
    return ''


def _normalize_final_layer_value(coerced: Any, kind: FieldKind) -> Any:
    from copy import deepcopy

    if kind == 'str':
        if coerced is None:
            return None
        s = str(coerced).strip()
        return s if s else None
    if kind == 'dict':
        if isinstance(coerced, dict) and coerced:
            return deepcopy(coerced)
        return None
    if kind == 'list':
        if isinstance(coerced, list) and coerced:
            return list(coerced)
        return None
    return None


def effective_preprocessing_triple(sr, field_base: str) -> Any:
    """Effective value for staging display / listing when row is PreprocessingRow."""
    final_v = getattr(sr, f'final_{field_base}', None)
    kind = TRIPLE_LAYER_SPECS[field_base]
    if preprocessing_row_has_final(sr):
        if is_meaningful(final_v, kind):
            return final_v
    elif final_v is not None and is_meaningful(final_v, kind):
        return final_v
    ai_v = getattr(sr, f'ai_{field_base}', None)
    std_v = getattr(sr, f'standard_{field_base}', None)
    if is_meaningful(ai_v, kind):
        return ai_v
    return std_v


def effective_preprocessing_title(sr) -> str:
    ft = getattr(sr, 'final_title', None)
    if ft is not None:
        return str(ft or '')[:300]
    ai_t = getattr(sr, 'ai_title', '') or ''
    if is_meaningful(ai_t, 'str'):
        return ai_t[:300]
    std_d = getattr(sr, 'standard_description', '') or ''
    if is_meaningful(std_d, 'str'):
        return std_d[:300]
    return ''


def effective_preprocessing_notes(sr) -> str:
    """Plain-text notes for summaries (effective ai vs standard, pre/post finalize)."""
    v = effective_preprocessing_triple(sr, 'notes')
    return str(v or '')


def effective_taxonomy_category_for_row(row) -> str:
    """EcoThrift canonical category (flat ai/final), not vendor taxonomy_json.category."""
    if hasattr(row, 'standard_taxonomy'):
        if preprocessing_row_has_final(row):
            fc = getattr(row, 'final_category', None)
            if is_meaningful(fc, 'str'):
                return str(fc or '').strip()[:200]
            ac = getattr(row, 'ai_category', None)
            if is_meaningful(ac, 'str'):
                return str(ac or '').strip()[:200]
            tax = getattr(row, 'standard_taxonomy', None) or {}
            if isinstance(tax, dict):
                cat = tax.get('category')
                if is_meaningful(cat, 'str'):
                    return str(cat).strip()[:200]
            return ''
        fc = getattr(row, 'final_category', None)
        if fc is not None and is_meaningful(fc, 'str'):
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


def bulk_clear_preprocess_standard_layer(qs):
    """Undo standardize: clear standard_* structured fields (retain raw_row)."""
    qs.update(
        standard_description='',
        standard_brand='',
        standard_model='',
        standard_condition='',
        standard_notes='',
        standard_identifiers={},
        standard_taxonomy={},
        standard_specifications={},
        standard_tracking={},
        standard_search_tags=[],
    )


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


def snapshot_finalize_from_ai_and_standard(sr, *, fill_missing_only: bool = False) -> None:
    """Populate final_* from coalesce(ai, standard) and title/category defaults.

    When fill_missing_only is False (e.g. cleanup CSV upload), overwrite all finals from layers.
    When True (finalize), only fill finals that are still empty so Final Review edits persist.
    """
    for base, kind in TRIPLE_LAYER_SPECS.items():
        if fill_missing_only and is_meaningful(getattr(sr, f'final_{base}'), kind):
            continue
        ai_v = getattr(sr, f'ai_{base}')
        std_v = getattr(sr, f'standard_{base}')
        coerced = coalesce_final_value(ai_v, std_v, base)
        setattr(sr, f'final_{base}', _normalize_final_layer_value(coerced, kind))

    if not (fill_missing_only and is_meaningful(getattr(sr, 'final_title', None), 'str')):
        ft = coalesce_final_title_from_row(sr)
        sr.final_title = ft if ft else None

    if not (fill_missing_only and is_meaningful(getattr(sr, 'final_category', None), 'str')):
        fc = coalesce_final_category_from_row(sr)
        sr.final_category = fc if fc else None

