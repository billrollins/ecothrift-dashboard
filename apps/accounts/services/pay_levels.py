"""Pay levels (owner 2026-10-20): Entry, Senior, Manager, each with an hourly pay range.

``EmployeeProfile.level`` says where a person is. The ranges live in one owner-editable ``AppSetting``
(``hr.pay_levels``): ``{"entry": {"min": 15, "max": 17}, "senior": {"min": 18, "max": 19}, "manager": {"min": 20,
"max": null}}``. A missing row or a bad value falls back to those defaults. Pay between two ranges (17.50) belongs to
the lower level. A pay rate outside its level's range is a warning on screen, never a block.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

SETTING_KEY = 'hr.pay_levels'
LEVELS = ('entry', 'senior', 'manager')  # lowest to highest
LABELS = {'entry': 'Entry', 'senior': 'Senior', 'manager': 'Manager'}
DEFAULT_RANGES = {
    'entry': {'min': 15, 'max': 17},
    'senior': {'min': 18, 'max': 19},
    'manager': {'min': 20, 'max': None},
}


def _number(value):
    if value in (None, ''):
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return number if number >= 0 else None


def ranges() -> dict:
    """{level: {'min': Decimal, 'max': Decimal | None}} from the setting, defaults where it is missing or wrong."""
    from apps.core.models import AppSetting

    row = AppSetting.objects.filter(key=SETTING_KEY).first()
    stored = row.value if row is not None and isinstance(row.value, dict) else {}
    out = {}
    for level in LEVELS:
        default = DEFAULT_RANGES[level]
        given = stored.get(level) if isinstance(stored.get(level), dict) else {}
        low = _number(given.get('min'))
        high = _number(given.get('max')) if 'max' in given else _number(default['max'])
        out[level] = {'min': low if low is not None else Decimal(str(default['min'])), 'max': high}
    return out


def level_for_pay(pay, table: dict | None = None) -> str:
    """The highest level whose minimum the pay reaches (17.50 is Entry, 19.50 is Senior). Nothing set is Entry."""
    table = table or ranges()
    try:
        rate = Decimal(str(pay))
    except (InvalidOperation, ValueError):
        return LEVELS[0]
    found = LEVELS[0]
    for level in LEVELS:
        if rate >= table[level]['min']:
            found = level
    return found


def in_range(pay, level: str, table: dict | None = None) -> bool:
    table = table or ranges()
    if level not in table:
        return True
    try:
        rate = Decimal(str(pay))
    except (InvalidOperation, ValueError):
        return True
    if rate <= 0:
        return True  # not set yet
    span = table[level]
    return rate >= span['min'] and (span['max'] is None or rate <= span['max'])


def range_text(level: str, table: dict | None = None) -> str:
    span = (table or ranges())[level]

    def money(value):
        return f'{value:.2f}'.rstrip('0').rstrip('.') if value == value.to_integral_value() else f'{value:.2f}'

    low = money(span['min'])
    return f'${low}+' if span['max'] is None else f'${low} to ${money(span["max"])}'


def warning(pay, level: str, table: dict | None = None) -> str:
    """Words for a pay rate outside its level's range ('' when it fits)."""
    table = table or ranges()
    if level not in table or in_range(pay, level, table):
        return ''
    return (f'${Decimal(str(pay)):.2f} an hour is outside the {LABELS[level]} range ({range_text(level, table)}). '
            f'You can still save it.')


def payload() -> list[dict]:
    """The levels for the screens: key, label, min, max (null = no top)."""
    table = ranges()
    return [
        {'key': level, 'label': LABELS[level], 'min': float(table[level]['min']),
         'max': float(table[level]['max']) if table[level]['max'] is not None else None,
         'text': range_text(level, table)}
        for level in LEVELS
    ]
