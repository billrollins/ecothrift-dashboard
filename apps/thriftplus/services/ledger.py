"""
Money on a Thrift+ membership (the 10-12 policy): kept ThriftBucks and Thrift+ credit, as ``LedgerEntry`` rows that
are never edited. A balance is a sum.

- **ThriftBucks** (``kind='bank'``; the data name stays, V8): each positive row is a **lot**. A lot a sale or a re-ring
  collected is usable from the next day through day 30 after the sale (B5: sale + 1 to sale + 30), then it expires.
  Other lots (ThriftBucks given back on a return, a manager's adjustment, a voided spend) are usable at once, for 30
  days. Spending takes the soonest use-by date first, and only from lots usable that day. A return's take-back (W4)
  takes from unspent, unexpired lots, soonest first.
- **Expiry:** ``expire_lots`` writes one negative row per lot past its date (``reason='expire'``, ``reverses`` the
  lot). The nightly reward run calls it; it is safe to call any number of times. Expired ThriftBucks are Thrift+
  income (F4). Every balance here already leaves out lots past their date, so a late nightly run changes nothing a
  member sees.
- **Thrift+ credit** (``kind='credit'``): refund money from returns (B2). It never expires and is spent first, after
  tax, as a payment (B3, T4).

There is no monthly cover (C1, owner 2026-10-12). Old ``cover`` rows stay as history and count in no balance.
Nothing can take a balance below zero.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.thriftplus.models import Account, LedgerEntry

ZERO = Decimal('0.00')
# Kept ThriftBucks are good through day 30 after the sale that collected them (B5).
REWARD_DAYS = 30
# Lots these rows make wait a day: what a trip collects is used from the next day (B5).
NEXT_DAY_REASONS = ('sale', 'rering')
EXPIRE_REASON = 'expire'


def _sum(qs) -> Decimal:
    return (qs.aggregate(s=Sum('amount'))['s'] or ZERO).quantize(Decimal('0.01'))


def balance(account: Account, kind: str) -> Decimal:
    """The sum of a kind's rows, never below zero. For ThriftBucks use ``bucks_total`` (it leaves out lots past their
    date even before the nightly expiry)."""
    return max(ZERO, _sum(account.ledger.filter(kind=kind)))


def credit_balance(account: Account) -> Decimal:
    return balance(account, LedgerEntry.KIND_CREDIT)


# ── ThriftBucks lots ───────────────────────────────────────────────────────────


@dataclass
class Lot:
    id: int
    amount: Decimal  # what is left of it
    collected_on: date
    usable_from: date
    use_by: date
    reason: str
    cart_id: int | None
    cart_line_id: int | None
    item_id: int | None


def _day(entry: LedgerEntry) -> date:
    return timezone.localtime(entry.created_at).date()


def _take(lots: dict[int, Lot], amount: Decimal, day: date, *, usable_only: bool) -> None:
    """Take ``amount`` from the lots, soonest use-by first: lots usable on ``day`` (a spend), or every unexpired lot
    (a take-back or a correction). Anything left over comes from whatever is left, so the lots always add up to the
    rows."""
    left = amount
    open_lots = sorted((l for l in lots.values() if l.amount > 0), key=lambda l: (l.use_by, l.id))
    first = [l for l in open_lots if l.use_by >= day and (not usable_only or l.usable_from <= day)]
    first_ids = {l.id for l in first}
    for lot in first + [l for l in open_lots if l.id not in first_ids]:
        if left <= 0:
            break
        take = min(left, lot.amount)
        lot.amount -= take
        left -= take


def lots(account: Account) -> list[Lot]:
    """Every ThriftBucks lot with what is left of it, replaying the rows in order. Soonest use-by first."""
    found: dict[int, Lot] = {}
    for entry in account.ledger.filter(kind=LedgerEntry.KIND_BANK).order_by('created_at', 'pk'):
        day = _day(entry)
        if entry.amount > 0:
            found[entry.pk] = Lot(
                id=entry.pk, amount=entry.amount, collected_on=day,
                usable_from=day + timedelta(days=1) if entry.reason in NEXT_DAY_REASONS else day,
                use_by=day + timedelta(days=REWARD_DAYS), reason=entry.reason, cart_id=entry.cart_id,
                cart_line_id=entry.cart_line_id, item_id=entry.item_id,
            )
        elif entry.reverses_id in found:  # a void of the sale that collected it, or its expiry
            found[entry.reverses_id].amount += entry.amount
        elif entry.amount < 0:
            _take(found, -entry.amount, day, usable_only=entry.reason == 'spend')
    return sorted(found.values(), key=lambda l: (l.use_by, l.id))


def _today(on: date | None) -> date:
    return on or timezone.localdate()


def available_bucks(account: Account, on: date | None = None, *, of: list[Lot] | None = None) -> Decimal:
    """Kept ThriftBucks usable on ``on`` (B5): collected before that day and not past their use-by date."""
    on = _today(on)
    return sum((l.amount for l in (of if of is not None else lots(account))
                if l.amount > 0 and l.usable_from <= on <= l.use_by), ZERO)


def bucks_total(account: Account, on: date | None = None, *, of: list[Lot] | None = None) -> Decimal:
    """Every kept ThriftBuck not past its date (today's too, usable from tomorrow): the member's ThriftBucks."""
    on = _today(on)
    return sum((l.amount for l in (of if of is not None else lots(account)) if l.amount > 0 and l.use_by >= on), ZERO)


def soonest_use_by(account: Account, on: date | None = None, *, of: list[Lot] | None = None) -> date | None:
    on = _today(on)
    dates = [l.use_by for l in (of if of is not None else lots(account)) if l.amount > 0 and l.use_by >= on]
    return min(dates) if dates else None


def balances(account: Account, on: date | None = None) -> dict:
    """The member's ThriftBucks (``banked``: not past their date; ``available``: usable today), the soonest use-by
    date, and Thrift+ credit."""
    on = _today(on)
    found = lots(account)
    use_by = soonest_use_by(account, on, of=found)
    return {
        'banked': str(bucks_total(account, on, of=found)),
        'available': str(available_bucks(account, on, of=found)),
        'bucks_use_by': use_by.isoformat() if use_by else None,
        'credit': str(credit_balance(account)),
    }


def reward_lots(account: Account, on: date | None = None) -> list[dict]:
    """The member's ThriftBucks as lots, in the order they are used: soonest use-by date first. Lots past their date
    are gone (expired, B5)."""
    on = _today(on)
    return [
        {'amount': str(l.amount), 'earned_on': l.collected_on.isoformat(), 'usable_from': l.usable_from.isoformat(),
         'use_by': l.use_by.isoformat(), 'usable': l.usable_from <= on, 'past_due': False}
        for l in lots(account) if l.amount > 0 and l.use_by >= on
    ]


def _midnight(day: date) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.min), timezone.get_current_timezone())


def expire_lots(on: date | None = None) -> dict:
    """Expire every lot past its use-by date (B5): one negative row per lot, linked to it. Safe to run again: a lot
    already expired (or voided) is skipped. Called by the nightly reward run."""
    on = _today(on)
    cutoff = _midnight(on - timedelta(days=REWARD_DAYS))  # collected before this: use-by date before ``on``
    account_ids = (
        LedgerEntry.objects.filter(kind=LedgerEntry.KIND_BANK, amount__gt=0, created_at__lt=cutoff,
                                   reversed_by__isnull=True)
        .values_list('account_id', flat=True).distinct()
    )
    count, total = 0, ZERO
    for account in Account.objects.filter(pk__in=list(account_ids)):
        with transaction.atomic():
            Account.objects.select_for_update().filter(pk=account.pk).first()
            for lot in lots(account):
                if lot.use_by >= on or lot.amount <= 0 or LedgerEntry.objects.filter(reverses_id=lot.id).exists():
                    continue
                LedgerEntry.objects.create(
                    account=account, kind=LedgerEntry.KIND_BANK, amount=-lot.amount, reason=EXPIRE_REASON,
                    reverses_id=lot.id, cart_id=lot.cart_id, cart_line_id=lot.cart_line_id, item_id=lot.item_id,
                    note=f'Use by {lot.use_by.isoformat()} passed',
                )
                count += 1
                total += lot.amount
    return {'lots': count, 'amount': str(total)}


def owed_bucks(on: date | None = None, *, accounts=None) -> Decimal:
    """Kept ThriftBucks the store still owes (B9): every lot not past its date, on real memberships (or ``accounts``)."""
    on = _today(on)
    accounts = accounts if accounts is not None else Account.objects.filter(is_practice=False)
    rows = LedgerEntry.objects.filter(kind=LedgerEntry.KIND_BANK, account__in=accounts)
    total = _sum(rows)
    cutoff = _midnight(on - timedelta(days=REWARD_DAYS))
    stale = (rows.filter(amount__gt=0, created_at__lt=cutoff, reversed_by__isnull=True)
             .values_list('account_id', flat=True).distinct())
    for account in Account.objects.filter(pk__in=list(stale)):  # past their date, the nightly run not yet in
        total -= sum((l.amount for l in lots(account) if l.amount > 0 and l.use_by < on), ZERO)
    return max(ZERO, total)


# ── Writing rows ───────────────────────────────────────────────────────────────


def record(account: Account, kind: str, amount: Decimal, reason: str, *, cart=None, line=None, item=None,
           actor=None, note: str = '') -> LedgerEntry | None:
    """One row. Zero amounts are not written."""
    if not amount:
        return None
    return LedgerEntry.objects.create(
        account=account, kind=kind, amount=amount, reason=reason, month='',
        cart=cart, cart_line_id=getattr(line, 'pk', None), item=item or getattr(line, 'item', None),
        actor=actor, note=note[:200],
    )


def reverse_cart(cart, reason: str, actor=None, *, line_id: int | None = None) -> int:
    """Undo what a sale wrote (all of it, or one line's): each row not yet reversed gets an opposite row linked to it.
    Rows already reversed or expired are left alone."""
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
