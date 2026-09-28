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

from datetime import date
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.thriftplus.models import Account, LedgerEntry
from apps.thriftplus.services.trip import cover_amount

ZERO = Decimal('0.00')


def month_of(day: date) -> str:
    return day.strftime('%Y-%m')


def _next_month(day: date) -> date:
    return date(day.year + (day.month == 12), day.month % 12 + 1, 1)


def _sum(qs) -> Decimal:
    return (qs.aggregate(s=Sum('amount'))['s'] or ZERO).quantize(Decimal('0.01'))


def cover(account: Account, on: date | None = None) -> dict:
    """This month's cover: the amount, how much rewards have filled, and what is left."""
    on = on or timezone.localdate()
    amount = cover_amount()
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
