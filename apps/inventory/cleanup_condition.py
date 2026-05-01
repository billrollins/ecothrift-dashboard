"""Map AI cleanup CSV condition strings to ManifestRow condition vocabulary."""

from __future__ import annotations

# Matches ManifestRow.CONDITION_CHOICES keys (canonical for ai_condition / preprocessing).
CANONICAL_CLEANUP_CONDITIONS: frozenset[str] = frozenset({
    'new',
    'like_new',
    'very_good',
    'good',
    'fair',
    'salvage',
    'unknown',
})

# Lowercased keys: phrase, underscore_slug, or shorthand → canonical value.
_ALIAS_TO_CANONICAL: dict[str, str] = {
    'used_good': 'good',
    'used_fair': 'fair',
    'used_like_new': 'like_new',
    'used_very_good': 'very_good',
    'like new': 'like_new',
    'very good': 'very_good',
    'used - good': 'good',
    'used - fair': 'fair',
    'used good': 'good',
    'used fair': 'fair',
}


def normalize_cleanup_condition(raw: str | None) -> str | None:
    """Return canonical condition key or None if unrecognized."""
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if not s:
        return None
    if s in CANONICAL_CLEANUP_CONDITIONS:
        return s
    compact = s.replace('-', '_').replace(' ', '_')
    while '__' in compact:
        compact = compact.replace('__', '_')
    if compact in CANONICAL_CLEANUP_CONDITIONS:
        return compact
    if s in _ALIAS_TO_CANONICAL:
        return _ALIAS_TO_CANONICAL[s]
    if compact in _ALIAS_TO_CANONICAL:
        return _ALIAS_TO_CANONICAL[compact]
    return None
