"""
Thrift+ in Dash, the owner's numbers (thrift_plus_rewards Phase 4):
- members and cards;
- signups by day;
- member sales against guest sales;
- rewards given (the instant rebate, the cover filled, rewards banked);
- the balances members hold (banked and store credit: what the store owes);
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

ZERO = Decimal('0.00')
DAYS = 30


def _money(value) -> str:
    return str((value or ZERO).quantize(Decimal('0.01')))


def overview(days: int = DAYS) -> dict:
    from apps.pos.models import Cart, CartLine

    since = timezone.now() - timedelta(days=days)
    carts = Cart.objects.filter(status='completed', completed_at__gte=since)
    member_carts = carts.filter(thrift_member__isnull=False)
    ledger = LedgerEntry.objects.filter(created_at__gte=since)
    signups = (
        Account.objects.filter(created_at__gte=since).annotate(day=TruncDate('created_at')).values('day')
        .annotate(n=Count('pk')).order_by('day')
    )
    signals = ItemReward.objects.aggregate(scans=Sum('scans'), adds=Sum('adds'), passes=Sum('passes'))
    scans = signals['scans'] or 0
    return {
        'days': days,
        'members': {
            'active': Account.objects.filter(status=Account.STATUS_ACTIVE).count(),
            'revoked': Account.objects.filter(status=Account.STATUS_REVOKED).count(),
            'people': Person.objects.filter(removed_at__isnull=True, account__status=Account.STATUS_ACTIVE).count(),
            'verified_18': Person.objects.filter(removed_at__isnull=True, verified_18=True).count(),
            'cards_active': Card.objects.filter(status=Card.STATUS_ACTIVE).count(),
            'cards_blank': Card.objects.filter(status=Card.STATUS_UNISSUED).count(),
            'signups': [{'day': r['day'].isoformat(), 'n': r['n']} for r in signups],
        },
        'sales': {
            'member_sales': member_carts.count(),
            'member_revenue': _money(member_carts.aggregate(s=Sum('total'))['s']),
            'guest_sales': carts.filter(thrift_member__isnull=True).count(),
            'guest_revenue': _money(carts.filter(thrift_member__isnull=True).aggregate(s=Sum('total'))['s']),
        },
        'rewards': {
            'instant': _money(CartLine.objects.filter(cart__in=carts).aggregate(s=Sum('thrift_savings'))['s']),
            'to_cover': _money(ledger.filter(kind=LedgerEntry.KIND_COVER).aggregate(s=Sum('amount'))['s']),
            'banked': _money(ledger.filter(kind=LedgerEntry.KIND_BANK, reason='sale').aggregate(s=Sum('amount'))['s']),
            'credit_from_returns': _money(ledger.filter(kind=LedgerEntry.KIND_CREDIT, reason='return').aggregate(s=Sum('amount'))['s']),
        },
        'owed': {
            'banked': _money(LedgerEntry.objects.filter(kind=LedgerEntry.KIND_BANK).aggregate(s=Sum('amount'))['s']),
            'credit': _money(LedgerEntry.objects.filter(kind=LedgerEntry.KIND_CREDIT).aggregate(s=Sum('amount'))['s']),
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
