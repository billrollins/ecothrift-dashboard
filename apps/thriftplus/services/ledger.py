"""
Money on a Thrift+ membership (thrift_plus_rewards Phase 3): the monthly cover, banked rewards and
store credit, as ``LedgerEntry`` rows that are never edited. A balance is a sum.

- **The cover** (``deductible`` in the spec): the first $10 of rewards each calendar month pays for
  the membership. It resets on the 1st and never rolls over. The rows carry their month.
- **Banked rewards:** the part of a trip's rewards past the cover, when the member chose to bank.
- **Store credit:** from returns and re-rings. Spent at the register.

Nothing can take a balance below zero. A sale writes one row per line and kind, so a return or a
void reverses exactly that line.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.thriftplus.models import Account, LedgerEntry
from apps.thriftplus.services.trip import cover_amount

ZERO = Decimal('0.00')
# Form 5: saved rewards are good for 30 days after the receipt they were earned on.
REWARD_DAYS = 30


def month_of(day: date) -> str:
    return day.strftime('%Y-%m')


def _next_month(day: date) -> date:
    return date(day.year + (day.month == 12), day.month % 12 + 1, 1)


def _sum(qs) -> Decimal:
    return (qs.aggregate(s=Sum('amount'))['s'] or ZERO).quantize(Decimal('0.01'))


def staff_free(account: Account) -> bool:
    """A staff member's own membership pays no cover while the owner's switch is on (pos.staff_purchases)."""
    if not account.staff_user_id:
        return False
    from apps.pos.services.staff_purchases import is_staff_member, thrift_plus_free_on

    return thrift_plus_free_on() and is_staff_member(account.staff_user)


def cover(account: Account, on: date | None = None) -> dict:
    """This month's cover: the amount, how much rewards have filled, and what is left (none for staff)."""
    on = on or timezone.localdate()
    amount = ZERO if staff_free(account) else cover_amount()
    covered = min(amount, max(ZERO, _sum(account.ledger.filter(kind=LedgerEntry.KIND_COVER, month=month_of(on)))))
    return {
        'month': month_of(on), 'amount': str(amount), 'covered': str(covered), 'remaining': str(amount - covered),
        'is_covered': covered >= amount, 'resets_on': _next_month(on).isoformat(),
    }


def cover_left(account: Account, on: date | None = None) -> Decimal:
    return Decimal(cover(account, on)['remaining'])


def balance(account: Account, kind: str) -> Decimal:
    return max(ZERO, _sum(account.ledger.filter(kind=kind)))


def balances(account: Account) -> dict:
    return {
        'banked': str(balance(account, LedgerEntry.KIND_BANK)),
        'credit': str(balance(account, LedgerEntry.KIND_CREDIT)),
        'cover': cover(account),
    }


def reward_lots(account: Account, on: date | None = None) -> list[dict]:
    """The Rewards Balance as lots, in the order they are used: soonest use-by date first (owner, 2026-10-09).

    Each saved reward is good for ``REWARD_DAYS`` after the receipt. A return or void takes back its own lot; any
    other use (spent at the register) takes from the soonest first. The register does not yet drop a lot when its
    date passes; such a lot is marked ``past_due`` so the screen can say so.
    """
    on = on or timezone.localdate()
    rows = list(account.ledger.filter(kind=LedgerEntry.KIND_BANK).order_by('created_at', 'pk'))
    lots: dict[int, dict] = {}
    for entry in rows:
        if entry.amount > 0:
            earned = timezone.localtime(entry.created_at).date()
            lots[entry.pk] = {'id': entry.pk, 'amount': entry.amount, 'earned_on': earned,
                              'use_by': earned + timedelta(days=REWARD_DAYS)}
    spent = ZERO
    for entry in rows:
        if entry.amount < 0:
            if entry.reverses_id in lots:
                lots[entry.reverses_id]['amount'] += entry.amount
            else:
                spent -= entry.amount
    ordered = sorted(lots.values(), key=lambda lot: (lot['use_by'], lot['id']))
    for lot in ordered:
        take = min(spent, max(ZERO, lot['amount']))
        lot['amount'] -= take
        spent -= take
    return [
        {'amount': str(lot['amount']), 'earned_on': lot['earned_on'].isoformat(), 'use_by': lot['use_by'].isoformat(),
         'past_due': lot['use_by'] < on}
        for lot in ordered if lot['amount'] > 0
    ]


def record(account: Account, kind: str, amount: Decimal, reason: str, *, cart=None, line=None, item=None,
           actor=None, note: str = '', on: date | None = None) -> LedgerEntry | None:
    """One row. Zero amounts are not written."""
    if not amount:
        return None
    return LedgerEntry.objects.create(
        account=account, kind=kind, amount=amount, reason=reason,
        month=month_of(on or timezone.localdate()) if kind == LedgerEntry.KIND_COVER else '',
        cart=cart, cart_line_id=getattr(line, 'pk', None), item=item or getattr(line, 'item', None),
        actor=actor, note=note[:200],
    )


def reverse_cart(cart, reason: str, actor=None, *, line_id: int | None = None) -> int:
    """Undo what a sale wrote (all of it, or one line's): each row not yet reversed gets an opposite
    row linked to it. Cover rows go back to the month they filled."""
    qs = LedgerEntry.objects.filter(cart=cart, reverses__isnull=True, reversed_by__isnull=True)
    if line_id is not None:
        qs = qs.filter(cart_line_id=line_id)
    written = 0
    for entry in list(qs):
        LedgerEntry.objects.create(
            account=entry.account, kind=entry.kind, amount=-entry.amount, month=entry.month, reason=reason,
            cart=cart, cart_line_id=entry.cart_line_id, item=entry.item, reverses=entry, actor=actor,
        )
        written += 1
    return written
