"""
Buying work that goes through Superuser → Requests (staged in production, approved there).

- ``buying.fix_price_slip``: undo the B-Stock price slip (Dash #75). Before #75 the parser read a
  whole-number price of 10,000 or more as cents, so a $12,400 bid was stored as $124.00. The plan
  (each snapshot and closing price, old and new) is frozen at staging, so approval applies exactly
  what was previewed, and only where the stored price still equals the old one. Undo puts the old
  prices back where they still equal the new ones. Rule: ``fix_bstock_price_slip.find_slips``.
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.core.models import ApprovalRequest
from apps.core.services.approval_requests import Kind, Progress, register


def plan_price_slip() -> dict:
    """{'snapshots': [[id, old, new]], 'auctions': [[id, old, new]]} as strings (JSON-safe)."""
    from apps.buying.management.commands.fix_bstock_price_slip import FLOOR, find_slips
    from apps.buying.models import Auction, AuctionSnapshot

    snapshots: list[list] = []
    auctions: list[list] = []
    ids = (
        AuctionSnapshot.objects.filter(price__gte=FLOOR, bid_count__gt=0)
        .values_list('auction_id', flat=True).distinct()
    )
    for aid in sorted(set(ids)):
        snaps = list(AuctionSnapshot.objects.filter(auction_id=aid).order_by('captured_at', 'id'))
        slips = find_slips(snaps)
        if not slips:
            continue
        for s, fixed in slips:
            snapshots.append([s.pk, str(s.price), str(fixed)])
        last = next((s for s in reversed(snaps) if s.price is not None), None)
        if last is not None and slips[-1][0].pk == last.pk:
            current = Auction.objects.filter(pk=aid).values_list('current_price', flat=True).first()
            if current is not None and current == slips[-1][0].price:
                auctions.append([aid, str(current), str(slips[-1][1])])
    return {'snapshots': snapshots, 'auctions': auctions}


def _preview(params: dict) -> dict:
    from apps.buying.models import Auction, AuctionSnapshot

    plan = plan_price_slip()
    lots = {row[0] for row in plan['auctions']}

    snap_lots = set(
        AuctionSnapshot.objects.filter(pk__in=[r[0] for r in plan['snapshots']])
        .values_list('auction_id', flat=True)
    )
    titles = dict(Auction.objects.filter(pk__in=lots).values_list('pk', 'title'))
    return {
        'params': {'plan': plan},
        'counts': {
            'Lots with a slipped price': len(snap_lots),
            'Snapshots fixed': len(plan['snapshots']),
            'Closing prices fixed': len(plan['auctions']),
        },
        'changes': [
            'Multiplies each slipped B-Stock price by 100 (it was stored at 1/100 by the old cents rule).',
            'Only prices that still equal the previewed old value change. Undo puts them back.',
        ],
        'sample': [
            {'auction': aid, 'title': (titles.get(aid) or '')[:60], 'price now': old, 'fixed': new}
            for aid, old, new in plan['auctions'][:10]
        ],
    }


def _apply(request: ApprovalRequest, progress: Progress) -> dict:
    from apps.buying.models import Auction, AuctionSnapshot

    plan = request.params.get('plan') or {}
    snaps = auctions = 0
    with transaction.atomic():
        for pk, old, new in plan.get('snapshots') or []:
            snaps += AuctionSnapshot.objects.filter(pk=pk, price=Decimal(old)).update(price=Decimal(new))
        for pk, old, new in plan.get('auctions') or []:
            auctions += Auction.objects.filter(pk=pk, current_price=Decimal(old)).update(current_price=Decimal(new))
    progress.update(log=f'Fixed {snaps:,} snapshots and {auctions:,} closing prices.')
    return {'snapshots_fixed': snaps, 'closing_prices_fixed': auctions}


def _undo(request: ApprovalRequest) -> dict:
    from apps.buying.models import Auction, AuctionSnapshot

    plan = request.params.get('plan') or {}
    snaps = auctions = 0
    with transaction.atomic():
        for pk, old, new in plan.get('snapshots') or []:
            snaps += AuctionSnapshot.objects.filter(pk=pk, price=Decimal(new)).update(price=Decimal(old))
        for pk, old, new in plan.get('auctions') or []:
            auctions += Auction.objects.filter(pk=pk, current_price=Decimal(new)).update(current_price=Decimal(old))
    return {'snapshots_restored': snaps, 'closing_prices_restored': auctions}


register(Kind(
    kind='buying.fix_price_slip', label='Buying: fix B-Stock prices stored at 1/100 (old cents rule)',
    preview=_preview, apply=_apply, undo=_undo,
))
