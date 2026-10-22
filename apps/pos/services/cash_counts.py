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


_CENTS = {k: int(v * 100) for k, v in DENOMINATIONS}


def make_change(amount: Decimal, available: dict | None = None) -> tuple[dict, bool]:
    """Which bills and coins to give back for ``amount`` (2026-10-21, cash by denomination): the fewest pieces the
    drawer has (``available``, a count; None means any). Answers (count, short): ``short`` is True when the drawer
    cannot make it exactly, and the count is then the fewest pieces from any bills and coins."""
    cents = int((amount * 100).quantize(Decimal('1')))
    if cents <= 0:
        return {}, False
    if available is not None:
        have = {k: max(0, int(available.get(k) or 0)) for k in _CENTS}
        found = _fewest(cents, have)
        if found is not None:
            return found, False
    return _fewest(cents, None) or {}, available is not None


def _fewest(cents: int, have: dict | None) -> dict | None:
    """Fewest pieces adding to ``cents`` with at most ``have[key]`` of each (any number when None); None if it can't.

    Largest first is right for US money whenever it lands exactly; only a drawer short of some coin (30¢ with no
    nickels: 3 dimes, not a quarter) needs the exact search."""
    left, out = cents, {}
    for key, value in _CENTS.items():
        take = left // value if have is None else min(have[key], left // value)
        if take:
            out[key] = take
            left -= take * value
    if left == 0:
        return out
    if have is None:
        return None  # pragma: no cover - pennies always finish it
    return _fewest_exact(cents, have)


def _fewest_exact(cents: int, have: dict) -> dict | None:
    # Bounded knapsack, each denomination split into items of 1, 2, 4, ... pieces; one decision row per item.
    items = []  # (key, pieces, value in cents)
    for key, value in _CENTS.items():
        limit = min(have[key], cents // value)
        step = 1
        while limit > 0:
            take = min(step, limit)
            items.append((key, take, take * value))
            limit -= take
            step *= 2
    inf = cents + 1_000_000
    best = [0] + [inf] * cents
    used = []
    for _key, pieces, value in items:
        row = bytearray(cents + 1)
        for total in range(cents, value - 1, -1):
            if best[total - value] + pieces < best[total]:
                best[total] = best[total - value] + pieces
                row[total] = 1
        used.append(row)
    if best[cents] >= inf:
        return None
    out: dict = {}
    total = cents
    for index in range(len(items) - 1, -1, -1):
        if used[index][total]:
            key, pieces, value = items[index]
            out[key] = out.get(key, 0) + pieces
            total -= value
    return {k: out[k] for k in _CENTS if out.get(k)}


def add_counts(a: dict | None, b: dict | None, sign: int = 1) -> dict:
    """``a + b`` (``sign`` -1: ``a - b``) by denomination. A result may go below 0 when the drawer's contents drifted
    from what Dash knows; the next count shows it."""
    out = {k: int((a or {}).get(k) or 0) + sign * int((b or {}).get(k) or 0) for k in _CENTS}
    return {k: n for k, n in out.items() if n}


def describe(count: dict) -> str:
    """'1 × $5, 2 × quarters' for a count, largest first."""
    names = {'hundreds': '$100', 'fifties': '$50', 'twenties': '$20', 'tens': '$10', 'fives': '$5', 'ones': '$1',
             'quarters': 'quarters', 'dimes': 'dimes', 'nickels': 'nickels', 'pennies': 'pennies'}
    return ', '.join(f'{count[k]} × {names[k]}' for k in _CENTS if count.get(k))


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
