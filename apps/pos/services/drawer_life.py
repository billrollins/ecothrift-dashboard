"""A drawer's life (critic review 2026-10-21, digest point 3): blind counts, paid in / paid out, and the office ledger.

- **Blind counts.** Opening, handoff and close are counted without seeing what Dash expects; the answer after the count
  shows the difference by bill and coin (``count_check``). A handoff counts the bills only (Bill, 10-21): coins are
  counted at the end of the day in the office, on the coin counter.
- **Expected cash** = opening + cash sales - drops + paid in - paid out.
- **The cash chain** (REG-19): the supplemental drawer in the office is the ledger above the registers. A drawer's till
  comes out of it when the drawer opens, drops go into it, and the whole drawer goes back into it at the office close.
- A close more than ``pos.close_note_over`` (owner setting, default $5) off needs a note (REG-18).
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db.models import Sum

from apps.pos.services.cash_counts import DENOMINATIONS, ODDBALLS, add_counts, count_total

BILLS = ('hundreds', 'fifties', 'twenties', 'tens', 'fives', 'ones')
COINS = ('quarters', 'dimes', 'nickels', 'pennies')
# Counted by hand with the bills (2026-11-03): the bills and the oddballs; the coin counter takes only COINS.
BY_HAND = BILLS + ODDBALLS
_LABELS = {'hundreds': '$100', 'fifties': '$50', 'twenties': '$20', 'tens': '$10', 'fives': '$5', 'ones': '$1',
           'quarters': '25¢', 'dimes': '10¢', 'nickels': '5¢', 'pennies': '1¢',
           'twos': '$2', 'halves': '50¢', 'dollar_coins': '$1 coin'}
LABELS = _LABELS
SETTING_KEY_CLOSE_NOTE_OVER = 'pos.close_note_over'
DEFAULT_CLOSE_NOTE_OVER = Decimal('5.00')
# What a blind viewer is not sent about an open drawer (Dash Update #36, Bill 2026-11-03): the cash in it now, what Dash
# expects and the differences. Its counts' answers come back once, right after the count (``count_check``).
BLIND_DRAWER_FIELDS = ('contents', 'cash_sales_total', 'expected_cash', 'variance')
BLIND_HANDOFF_FIELDS = ('expected_total', 'expected_count', 'variance')


def sees_running_cash(user) -> bool:
    """Managers and the owner see an open drawer's cash now and what Dash expects (Bill 2026-11-03: "hide 'Cash now'
    from cashiers during a blind count; managers still see it"). The same rule as the Drawers page's manager view."""
    from apps.accounts.services.access import holds, manager_or
    return manager_or(user, 'pos.override:use') or holds(user, 'cashier:manage')


def bills_of(count: dict | None) -> dict:
    return {k: v for k, v in (count or {}).items() if k in BY_HAND and v}


def coins_of(count: dict | None) -> dict:
    return {k: v for k, v in (count or {}).items() if k in COINS and v}


def expected_cash(drawer) -> Decimal:
    """Opening + cash sales - drops + paid in - paid out."""
    from apps.pos.models import CashMovement

    drops = drawer.drops.aggregate(s=Sum('total'))['s'] or Decimal('0')
    moves = {row['kind']: row['s'] for row in
             drawer.movements.values('kind').annotate(s=Sum('total'))}
    paid_in = moves.get(CashMovement.KIND_PAID_IN) or Decimal('0')
    paid_out = moves.get(CashMovement.KIND_PAID_OUT) or Decimal('0')
    return drawer.opening_total + drawer.cash_sales_total - drops + paid_in - paid_out


def count_check(counted: dict, expected: dict, *, coins_total: Decimal | None = None, bills_only: bool = False) -> dict:
    """Counted beside expected, by bill and coin, after a blind count. ``coins_total``: the coin counter gave one total,
    so the coins are one row. ``bills_only``: a handoff (no coin rows)."""
    keys = [k for k, _v in DENOMINATIONS if not bills_only or k in BY_HAND]
    if coins_total is not None:
        keys = [k for k in keys if k in BY_HAND]
    rows = []
    for key in keys:
        c, e = int(counted.get(key) or 0), int(expected.get(key) or 0)
        if c or e:
            rows.append({'key': key, 'label': _LABELS[key], 'counted': c, 'expected': e, 'difference': c - e})
    counted_total = count_total({k: counted.get(k, 0) for k in keys if counted.get(k)})
    expected_total = count_total({k: expected.get(k, 0) for k in keys if expected.get(k)})
    if coins_total is not None and not bills_only:
        expected_coins = count_total(coins_of(expected))
        rows.append({'key': 'coins', 'label': 'Coins (coin counter)', 'counted': str(coins_total),
                     'expected': str(expected_coins), 'difference': str(coins_total - expected_coins)})
        counted_total += coins_total
        expected_total += expected_coins
    return {
        'rows': rows,
        'counted_total': str(counted_total),
        'expected_total': str(expected_total),
        'difference_total': str(counted_total - expected_total),
    }


def close_note_over() -> Decimal:
    from apps.core.models import AppSetting

    try:
        raw = AppSetting.objects.get(key=SETTING_KEY_CLOSE_NOTE_OVER).value
        value = Decimal(str(raw.get('amount') if isinstance(raw, dict) else raw))
    except (AppSetting.DoesNotExist, InvalidOperation, TypeError, ValueError):
        return DEFAULT_CLOSE_NOTE_OVER
    if value.is_nan() or value < 0:
        return DEFAULT_CLOSE_NOTE_OVER
    return value


def office_for(drawer):
    """The supplemental drawer (the office) for this drawer's store, or None when none is set up."""
    from apps.pos.models import SupplementalDrawer

    location_id = getattr(drawer.register, 'location_id', None)
    return (SupplementalDrawer.objects.select_for_update().filter(location_id=location_id).first()
            or SupplementalDrawer.objects.select_for_update().first())


def post_to_office(kind: str, drawer, count: dict, total: Decimal, user, *, sign: int, note: str = ''):
    """One line in the office ledger, and its balance moved (``sign`` +1 into the office, -1 out of it). Nothing for the
    training register or when no supplemental drawer is set up. Call inside a transaction."""
    from apps.pos.models import SupplementalTransaction

    if drawer.register.is_training or not total:
        return None
    office = office_for(drawer)
    if office is None:
        return None
    line = SupplementalTransaction.objects.create(
        supplemental=office, transaction_type=kind, amount=count or {}, total=total, related_drawer=drawer,
        performed_by=user, notes=note[:500],
    )
    office.current_total = (office.current_total or Decimal('0')) + sign * total
    if count:
        office.current_balance = add_counts(office.current_balance, count, sign)
    office.save(update_fields=['current_total', 'current_balance'])
    return line


def close_out(counted: dict, till: dict | None, till_total: Decimal, closing_total: Decimal, *,
              coins_total: Decimal | None = None) -> dict:
    """After the close count (Retail 4 step 5, Bill 2026-11-02: "exchange with supplemental to have count match what
    opening register needs / create a cash drop of excess"): keep the whole till for tomorrow; the office brings the
    pieces the count lacks and takes the same dollars back out of the rest (less what the count was short of the till);
    the drop is the rest, by piece. Coins from the coin counter are one total, so they go by dollars. With no till by bill only the
    totals are known. Saved on the drawer (``Drawer.close_out``)."""
    # The office fills the drawer to the whole till: what the count is short of it comes in and nothing goes back.
    short = max(Decimal('0.00'), till_total - closing_total)
    out = {
        'keep_total': str(till_total), 'drop_total': str(max(Decimal('0.00'), closing_total - till_total)),
        'short_for_till': str(short),
        'keep': None, 'from_office': None, 'drop': None, 'coins_from_office': None, 'drop_coins': None,
        'swap_total': '0.00', 'give_back': '0.00',
    }
    if not till:
        return out
    by_piece = coins_total is None
    keys = [k for k, _v in DENOMINATIONS if by_piece or k in BY_HAND]
    have = {k: int(counted.get(k) or 0) for k in keys}
    want = {k: int(till.get(k) or 0) for k in keys}
    out['keep'] = {k: v for k, v in till.items() if v}
    out['from_office'] = {k: want[k] - have[k] for k in keys if want[k] > have[k]}
    out['drop'] = {k: have[k] - want[k] for k in keys if have[k] > want[k]}
    swap = count_total(out['from_office'])
    if not by_piece:
        till_coins = count_total(coins_of(till))
        out['coins_from_office'] = str(max(Decimal('0.00'), till_coins - coins_total))
        out['drop_coins'] = str(max(Decimal('0.00'), coins_total - till_coins))
        swap += Decimal(out['coins_from_office'])
    out['swap_total'] = str(swap.quantize(Decimal('0.01')))
    # For the pieces the office brings, it takes the same dollars back out of the rest, less what the count was short.
    out['give_back'] = str(max(Decimal('0.00'), swap - short).quantize(Decimal('0.01')))
    return out
