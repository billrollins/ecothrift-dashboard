"""Cash counts by denomination (2026-10-21, lock the till): one checker for every drawer and supplemental input.

A count is ``{'twenties': 3, 'quarters': 8, ...}`` with the keys the register's counter uses. A bad count or amount is
a plain 400, never a server error, and a total sent with a count must match it to the cent.
"""
from decimal import Decimal

from apps.pos.services.card_surcharge import CardSurchargeError, parse_money

DENOMINATIONS = (
    ('hundreds', Decimal('100')),
    ('fifties', Decimal('50')),
    ('twenties', Decimal('20')),
    ('tens', Decimal('10')),
    ('fives', Decimal('5')),
    ('ones', Decimal('1')),
    ('quarters', Decimal('0.25')),
    ('dimes', Decimal('0.10')),
    ('nickels', Decimal('0.05')),
    ('pennies', Decimal('0.01')),
)
_VALUES = dict(DENOMINATIONS)
MAX_PIECES = 100_000


class CashCountError(ValueError):
    """A count or amount the server refuses; the message is shown to staff as it is."""


def clean_count(raw, label: str = 'Count') -> dict:
    """The count as ``{key: whole number}``. Blank is an empty count."""
    if raw in (None, ''):
        return {}
    if not isinstance(raw, dict):
        raise CashCountError(f'{label} must be a count of each bill and coin.')
    out = {}
    for key, value in raw.items():
        if key not in _VALUES:
            raise CashCountError(f'{label}: "{key}" is not a bill or coin.')
        if isinstance(value, bool):
            raise CashCountError(f'{label}: {key} must be a whole number.')
        if isinstance(value, str) and value.strip().isdigit():
            value = int(value.strip())
        if isinstance(value, float) and value.is_integer():
            value = int(value)
        if value in (None, ''):
            value = 0
        if not isinstance(value, int):
            raise CashCountError(f'{label}: {key} must be a whole number.')
        if value < 0 or value > MAX_PIECES:
            raise CashCountError(f'{label}: {key} must be 0 or more.')
        out[key] = value
    return out


def count_total(count: dict) -> Decimal:
    return sum((_VALUES[k] * n for k, n in count.items()), Decimal('0')).quantize(Decimal('0.01'))


def clean_amount(raw, label: str, *, required: bool = False) -> Decimal | None:
    try:
        return parse_money(raw, label, required=required)
    except CardSurchargeError as exc:
        raise CashCountError(str(exc)) from exc


def count_and_total(data, count_key: str, total_key: str, label: str, *, required: bool = True):
    """(count, total) from a request body. With a count, the total is the count's sum (a total sent too must match it);
    with no count, the total alone is used."""
    count = clean_count(data.get(count_key), label)
    sent = clean_amount(data.get(total_key), f'{label} total', required=required and not count)
    if count:
        total = count_total(count)
        if sent is not None and sent != total:
            raise CashCountError(
                f'{label} total ${sent} does not match the bills and coins counted (${total}).'
            )
        return count, total
    return count, sent if sent is not None else Decimal('0.00')
