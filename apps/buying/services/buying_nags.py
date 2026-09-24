"""
The buyer's nags, in the same drawer as routines. The app never bids, so it says when to.

- ``ending``: watched lots that end within the hour and are still at or under the max (the
  buyer's own, else the price target). A lot with no max yet is included, because the
  buyer should look at it. It turns red in the last 15 minutes.
- ``unrecorded``: watched lots that ended in the last 7 days with no result. "We won it"
  or "we lost it" is what makes the PO, the report card and the calibration work (AUC-01).

Only superusers get them: they hold the B-Stock login and do the bidding.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.buying.models import Auction, WatchlistEntry

ENDING_MINUTES = 60
URGENT_MINUTES = 15
UNRECORDED_DAYS = 7
DONE = [WatchlistEntry.STATUS_WON, WatchlistEntry.STATUS_LOST, WatchlistEntry.STATUS_PASSED]


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(Decimal(value).quantize(Decimal('0.01')))


def _base(auction: Auction) -> dict[str, Any]:
    return {
        'id': auction.pk,
        'title': auction.title,
        'marketplace': auction.marketplace.name if auction.marketplace_id else '',
        'end_time': auction.end_time.isoformat() if auction.end_time else None,
        'current_price': _money(auction.current_price),
    }


def buying_nags(now=None) -> dict[str, Any]:
    now = now or timezone.now()
    watched = (
        Auction.objects.filter(watchlist_entry__isnull=False, archived_at__isnull=True)
        .exclude(listing_type=Auction.LISTING_TYPE_CONTRACT)
        .exclude(watchlist_entry__status__in=DONE)
        .select_related('marketplace')
    )

    ending = []
    soon = watched.filter(end_time__gt=now, end_time__lte=now + timedelta(minutes=ENDING_MINUTES))
    for auction in soon.order_by('end_time'):
        ceiling = auction.max_bid if auction.max_bid is not None else auction.price_target
        price = auction.current_price or Decimal('0')
        if ceiling is not None and price > ceiling:
            continue
        minutes = max(int((auction.end_time - now).total_seconds() // 60), 0)
        ending.append({
            **_base(auction),
            'minutes_left': minutes,
            'max_bid': _money(ceiling),
            'max_is_buyer': auction.max_bid is not None,
            'room': _money(ceiling - price) if ceiling is not None else None,
            'tone': 'red' if minutes <= URGENT_MINUTES else 'amber',
        })

    unrecorded = [
        _base(auction)
        for auction in watched.filter(
            end_time__lte=now,
            end_time__gt=now - timedelta(days=UNRECORDED_DAYS),
            outcome__isnull=True,
            purchase_order__isnull=True,
        ).order_by('-end_time')[:20]
    ]

    red = any(row['tone'] == 'red' for row in ending)
    count = len(ending) + len(unrecorded)
    return {
        'ending': ending,
        'unrecorded': unrecorded,
        'count': count,
        'tone': 'red' if red else ('amber' if count else 'none'),
    }


def empty() -> dict[str, Any]:
    return {'ending': [], 'unrecorded': [], 'count': 0, 'tone': 'none'}
