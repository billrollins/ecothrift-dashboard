"""Map DB2 legacy condition strings to Item.CONDITION_CHOICES for retag."""

from apps.inventory.models import Item

_VALID = {c[0] for c in Item.CONDITION_CHOICES}

# DB2 / old dashboard values that are not valid on DB3 Item
_LEGACY_MAP = {
    'poor': 'fair',
}


def normalize_legacy_condition(raw: str | None) -> str:
    """Return a value in Item.CONDITION_CHOICES; default 'unknown'."""
    c = (raw or '').strip().lower()
    if not c:
        return 'unknown'
    c = _LEGACY_MAP.get(c, c)
    return c if c in _VALID else 'unknown'
