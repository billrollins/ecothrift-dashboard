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

from apps.pos.services.cash_counts import DENOMINATIONS, add_counts, count_total

BILLS = ('hundreds', 'fifties', 'twenties', 'tens', 'fives', 'ones')
COINS = ('quarters', 'dimes', 'nickels', 'pennies')
_LABELS = {'hundreds': '$100', 'fifties': '$50', 'twenties': '$20', 'tens': '$10', 'fives': '$5', 'ones': '$1',
           'quarters': '25¢', 'dimes': '10¢', 'nickels': '5¢', 'pennies': '1¢'}
SETTING_KEY_CLOSE_NOTE_OVER = 'pos.close_note_over'
DEFAULT_CLOSE_NOTE_OVER = Decimal('5.00')


def bills_of(count: dict | None) -> dict:
    return {k: v for k, v in (count or {}).items() if k in BILLS and v}


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
    keys = [k for k, _v in DENOMINATIONS if not bills_only or k in BILLS]
    if coins_total is not None:
        keys = [k for k in keys if k in BILLS]
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
