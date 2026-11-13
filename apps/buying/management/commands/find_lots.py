"""Find live lots for a need, from the same list as Buying > Auctions (read only).

Uses ``live_lots.build()``: only lots a B-Stock search returned in the last 3 hours (the hourly sweep), with the
Buy Now price inside a Buy Now window and the current bid otherwise. Adds what that page does not show at a glance:
retail per unit (gear vs consumables), whether it is Buy Now or an auction, and the real end of the Buy Now window.

    python manage.py find_lots --q "baby|stroller|car seat" --min-per-unit 50
    python manage.py find_lots --q lego --max-landed 0.30

Nothing is written. Register: buying_auction, buying_manifestrow (through live_lots).
"""
from __future__ import annotations

import re
from datetime import datetime

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.buying.models import Auction
from apps.buying.services import live_lots


class Command(BaseCommand):
    help = 'List live lots matching a keyword, with retail per unit, Buy Now or auction, price, landed % and the 20% max.'

    def add_arguments(self, parser) -> None:
        parser.add_argument('--q', default='', help='Regular expression matched against the title (case-insensitive).')
        parser.add_argument('--min-per-unit', type=float, default=0, help='Only lots with at least this retail per unit.')
        parser.add_argument('--max-landed', type=float, default=None, help='Only lots landing at or under this share of retail now (0.25 = 25%%).')
        parser.add_argument('--limit', type=int, default=25)

    def handle(self, *args, **opts) -> None:
        data = live_lots.build()
        pat = re.compile(opts['q'], re.I) if opts['q'] else None
        rows = []
        for r in data['lots']:
            if pat and not pat.search(r['title'] or ''):
                continue
            units = r.get('units')
            retail = r.get('retail')
            per_unit = (retail / units) if retail and units else None
            if opts['min_per_unit'] and (per_unit is None or per_unit < opts['min_per_unit']):
                continue
            if opts['max_landed'] is not None and (r.get('landed_pct') is None or r['landed_pct'] > opts['max_landed']):
                continue
            rows.append((r, per_unit))
        rows.sort(key=lambda x: -(x[1] or 0))
        ids = [r['id'] for r, _ in rows[: opts['limit']]]
        bn_end = dict(Auction.objects.filter(pk__in=ids).values_list('pk', 'buy_now_ends_at'))
        tz = timezone.get_current_timezone()

        def when(dt):
            return dt.astimezone(tz).strftime('%a %m-%d %H:%M') if dt else '?'

        self.stdout.write(f"Live list from {data.get('last_listed_at') or '?'} (sweep); {len(rows)} match.")
        for r, per_unit in rows[: opts['limit']]:
            is_bn = r['price_basis'] == 'Buy Now'
            ends = when(bn_end.get(r['id'])) if is_bn else (when(datetime.fromisoformat(r['ends'])) if r['ends'] else '?')
            pct = f"{r['landed_pct'] * 100:.0f}%" if r.get('landed_pct') is not None else '?'
            self.stdout.write(
                f"{r['id']} | {'BUY NOW' if is_bn else 'auction'} | {r['seller']} | {(r['short_title'] or '')[:60]} | "
                f"{r.get('units') or '?'} units, ${r['retail'] or 0:,.0f} retail, ${per_unit or 0:,.0f}/unit | "
                f"{r['price_basis']} ${r['price'] or 0:,.0f} ({r['bids']} bids) | landed {pct} | "
                f"20% max ${r['bid_up_to'] or 0:,.0f} | ends {ends} | manifest {r['manifest']} | {r['url']}"
            )
