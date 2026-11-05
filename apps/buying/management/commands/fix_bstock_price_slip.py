"""Undo the B-Stock price slip (Dash #75). Dry run by default; --apply writes.

Before Dash #75 the parser read any whole-number price of 10,000 or more as cents, so a $12,400 bid
was stored as $124.00. Open lots correct themselves on the next sweep; this fixes the history
(snapshots and the closing price of ended lots), which the close model and similar-lot prices use.

Rule, per auction, snapshots in time order. A snapshot is slipped when:
- the last good price q is a real bid of at least $9,000 (bid count above 0, so never a Buy Now
  price shown before bidding),
- its own price p is under $10,000 and its bid count is at least q's, and
- 100 x p lands between 0.95 x q and 3 x q (prices only climb).
Then p becomes 100 x p and is the new last good price. The auction's current price is fixed when
it equals its last snapshot and that snapshot was slipped. Lots first seen at $10,000+ have no
earlier good price and are not touched (counted in the report).

Prod: run only as a Dash request the owner approves.
"""

from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.buying.models import Auction, AuctionSnapshot

FLOOR = Decimal('9000')
CEIL = Decimal('10000')
HUNDRED = Decimal('100')


def find_slips(snaps: list[AuctionSnapshot]) -> list[tuple[AuctionSnapshot, Decimal]]:
    """[(snapshot, fixed price)] for one auction's snapshots in time order."""
    out: list[tuple[AuctionSnapshot, Decimal]] = []
    good_price: Decimal | None = None
    good_bids: int | None = None
    for s in snaps:
        p = s.price
        if p is None:
            continue
        bids = s.bid_count or 0
        if (
            good_price is not None and good_price >= FLOOR and (good_bids or 0) > 0
            and p < CEIL and bids >= (good_bids or 0)
            and good_price * Decimal('0.95') <= p * HUNDRED <= good_price * 3
        ):
            fixed = p * HUNDRED
            out.append((s, fixed))
            good_price, good_bids = fixed, bids
            continue
        good_price, good_bids = p, bids
    return out


class Command(BaseCommand):
    help = 'Find (and with --apply, fix) B-Stock prices stored at 1/100 by the old cents rule.'

    def add_arguments(self, parser) -> None:
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--sample', type=int, default=10)

    def handle(self, *args, **options):
        ids = list(
            AuctionSnapshot.objects.filter(price__gte=FLOOR, bid_count__gt=0)
            .values_list('auction_id', flat=True).distinct()
        )
        fixes: list[tuple[int, list[tuple[AuctionSnapshot, Decimal]], bool]] = []
        for aid in ids:
            snaps = list(AuctionSnapshot.objects.filter(auction_id=aid).order_by('captured_at', 'id'))
            slips = find_slips(snaps)
            if not slips:
                continue
            last = next((s for s in reversed(snaps) if s.price is not None), None)
            fix_current = bool(last is not None and slips[-1][0].pk == last.pk)
            fixes.append((aid, slips, fix_current))

        first_seen_big = Auction.objects.filter(current_price__gte=CEIL).count()
        self.stdout.write(
            f'auctions with a slip: {len(fixes)}; snapshots: {sum(len(f[1]) for f in fixes)}; '
            f'closing prices: {sum(1 for f in fixes if f[2])}'
        )
        for aid, slips, fix_current in fixes[: options['sample']]:
            a = Auction.objects.filter(pk=aid).values('current_price', 'total_retail_value', 'title').first() or {}
            self.stdout.write(
                f'  auction {aid}: {len(slips)} snapshot(s), e.g. {slips[0][0].price} -> {slips[0][1]}; '
                f"current {a.get('current_price')}{' -> fixed' if fix_current else ''}; "
                f"retail {a.get('total_retail_value')}; {str(a.get('title') or '')[:60]}"
            )
        self.stdout.write(f'(for scale: {first_seen_big} lots already hold a price of $10,000+)')
        if not options['apply']:
            self.stdout.write('dry run: nothing written (add --apply).')
            return
        with transaction.atomic():
            for aid, slips, fix_current in fixes:
                for s, fixed in slips:
                    AuctionSnapshot.objects.filter(pk=s.pk).update(price=fixed)
                if fix_current:
                    a = Auction.objects.select_for_update().get(pk=aid)
                    last_slip = slips[-1]
                    if a.current_price == last_slip[0].price:
                        a.current_price = last_slip[1]
                        a.save(update_fields=['current_price'])
        self.stdout.write(self.style.SUCCESS('applied.'))
