"""
Thrift+ in Dash, the owner's numbers (thrift_plus_rewards Phase 4):
- members and cards; online joins still to finish at a register (owner 2026-10-15, J8) are counted apart, never as
  members;
- signups by day;
- member sales against guest sales;
- ThriftBucks (the 10-12 policy): redeemed instantly (dollars off), collected and kept, used, and expired (Thrift+
  income, F4); Thrift+ credit from returns;
- what the store owes (B9): kept ThriftBucks not past their date, plus Thrift+ credit;
- returns;
- scans-to-adds from the scanner app.

Last 30 days unless said otherwise.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.thriftplus.models import Account, Card, ItemReward, LedgerEntry, Person, ReturnRecord
from apps.thriftplus.services.ledger import owed_bucks
from apps.thriftplus.services.staff_members import MERGED_REASON

ZERO = Decimal('0.00')
DAYS = 30


def _money(value) -> str:
    return str((value or ZERO).quantize(Decimal('0.01')))


def overview(days: int = DAYS) -> dict:
    from apps.pos.models import Cart, CartLine

    since = timezone.now() - timedelta(days=days)
    carts = Cart.objects.filter(status='completed', completed_at__gte=since).exclude(thrift_member__account__is_practice=True)
    member_carts = carts.filter(thrift_member__isnull=False)
    real = Account.objects.filter(is_practice=False)  # practice members are left out of every count (2026-10-10)
    owed_rows = LedgerEntry.objects.filter(account__is_practice=False)
    ledger = owed_rows.filter(created_at__gte=since)
    signups = (
        real.exclude(status=Account.STATUS_PENDING).filter(created_at__gte=since).annotate(day=TruncDate('created_at')).values('day')
        .annotate(n=Count('pk')).order_by('day')
    )
    signals = ItemReward.objects.aggregate(scans=Sum('scans'), adds=Sum('adds'), passes=Sum('passes'))
    scans = signals['scans'] or 0
    bank = ledger.filter(kind=LedgerEntry.KIND_BANK)
    kept = _money(bank.filter(reason__in=('sale', 'rering'), amount__gt=0).aggregate(s=Sum('amount'))['s'])
    owed_bank = owed_bucks(timezone.localdate(), accounts=real)
    owed_credit = (owed_rows.filter(kind=LedgerEntry.KIND_CREDIT).aggregate(s=Sum('amount'))['s'] or ZERO)
    return {
        'days': days,
        'members': {
            'active': real.filter(status=Account.STATUS_ACTIVE).count(),
            # A customer membership merged into a staff member's own (owner 2026-10-15) ends revoked: not counted.
            'revoked': real.filter(status=Account.STATUS_REVOKED).exclude(revoked_reason__startswith=MERGED_REASON).count(),
            # Joined online, not finished at a register yet (J8): not members until then.
            'pending': real.filter(status=Account.STATUS_PENDING).count(),
            'pending_new': real.filter(status=Account.STATUS_PENDING, created_at__gte=since).count(),
            'people': Person.objects.filter(removed_at__isnull=True, account__status=Account.STATUS_ACTIVE,
                                            account__is_practice=False).count(),
            'verified_18': Person.objects.filter(removed_at__isnull=True, verified_18=True, account__is_practice=False)
            .exclude(account__status=Account.STATUS_PENDING).count(),
            'cards_active': Card.objects.filter(status=Card.STATUS_ACTIVE).exclude(person__account__is_practice=True)
            .exclude(person__account__status=Account.STATUS_PENDING).count(),
            'cards_blank': Card.objects.filter(status=Card.STATUS_UNISSUED, batch__isnull=False).count(),
            'signups': [{'day': r['day'].isoformat(), 'n': r['n']} for r in signups],
        },
        'sales': {
            'member_sales': member_carts.count(),
            'member_revenue': _money(member_carts.aggregate(s=Sum('total'))['s']),
            'guest_sales': carts.filter(thrift_member__isnull=True).count(),
            'guest_revenue': _money(carts.filter(thrift_member__isnull=True).aggregate(s=Sum('total'))['s']),
        },
        'rewards': {
            # Redeemed instantly: dollars off today (V4).
            'instant': _money(CartLine.objects.filter(cart__in=carts).aggregate(s=Sum('thrift_savings'))['s']),
            # ThriftBucks collected and kept (sales and re-rings).
            'collected': kept,
            'banked': kept,
            # ThriftBucks used at the register (a discount line before tax).
            'used': _money(-(bank.filter(reason='spend').aggregate(s=Sum('amount'))['s'] or ZERO)),
            # ThriftBucks that passed their use-by date unused: Thrift+ income (F4).
            'expired': _money(-(bank.filter(reason='expire').aggregate(s=Sum('amount'))['s'] or ZERO)),
            'credit_from_returns': _money(ledger.filter(kind=LedgerEntry.KIND_CREDIT, reason='return').aggregate(s=Sum('amount'))['s']),
        },
        'owed': {
            'banked': _money(owed_bank),
            'credit': _money(max(ZERO, owed_credit)),
            'total': _money(owed_bank + max(ZERO, owed_credit)),
        },
        'returns': {
            'count': ReturnRecord.objects.filter(created_at__gte=since).count(),
            'waiting': ReturnRecord.objects.filter(status=ReturnRecord.STATUS_OPEN).count(),
        },
        'scanner': {
            'scans': scans, 'adds': signals['adds'] or 0, 'passes': signals['passes'] or 0,
            'add_rate': round((signals['adds'] or 0) / scans, 3) if scans else None,
            'items_scanned': ItemReward.objects.filter(scans__gt=0).count(),
            'price_feedback': ItemReward.objects.exclude(feedback={}).filter(~Q(feedback=None)).count(),
        },
    }
