"""Black Friday prices (Dash Update #220): every number from ``black_friday.black_friday_price``, the one method the
register and the scanners use, so the ad and the store agree.

    python manage.py black_friday_prices --project 1                 # sku, title, checked retail, Black Friday price
    python manage.py black_friday_prices --project 1 --json out.json # {"ITM...": 54.98, ...} (--json - prints it)
    python manage.py black_friday_prices --summary                    # the floor's average off retail
    python manage.py black_friday_prices --freeze                     # save every floor item's number now

The numbers are frozen: an item's is worked out once and saved, so a later run prints the same prices. Looking a price
up saves it (that is the freeze), so this command writes ``pos.BlackFridayPrice`` rows; it changes nothing else.

``--on 2026-11-28`` picks the day whose ThriftBucks set the price (default: the setting's, else Saturday).
"""
from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand

from apps.pos.services import black_friday


class Command(BaseCommand):
    help = 'Black Friday prices from the one method (black_friday_price): a photo project, or the floor summary.'

    def add_arguments(self, parser):
        parser.add_argument('--project', type=int, help='Photo project id: its items.')
        parser.add_argument('--skus', help='Comma-separated tags instead of a project.')
        parser.add_argument('--json', help='Write {sku: price} here.')
        parser.add_argument('--summary', action='store_true', help="The floor's average off retail (checked retail only).")
        parser.add_argument('--on', help='The day whose ThriftBucks set the price (YYYY-MM-DD).')
        parser.add_argument('--freeze', action='store_true',
                            help='Work out and save the number for every floor item now (run once, with the ad export).')
        parser.add_argument('--again', action='store_true', help='With --freeze: work every number out again.')

    def handle(self, *args, **opts):
        from apps.inventory.models import Item
        from apps.inventory.services.tag_retail import tag_retail

        target = date.fromisoformat(opts['on']) if opts.get('on') else (black_friday.bucks_day() or date(2026, 11, 28))
        if opts.get('freeze'):
            n = black_friday.freeze(target=target, again=bool(opts.get('again')))
            self.stdout.write(f'{n} floor items have their Black Friday number saved (ThriftBucks of {target}).')
            if not (opts.get('summary') or opts.get('project') or opts.get('skus')):
                return
        if opts.get('summary'):
            self._summary(target)
            return
        if opts.get('project'):
            from apps.core.models import ProjectPhoto

            ids = set(ProjectPhoto.objects.filter(project_id=opts['project'], item__isnull=False).values_list('item_id', flat=True))
            items = list(Item.objects.filter(pk__in=ids).select_related('product'))
        elif opts.get('skus'):
            items = list(Item.objects.filter(sku__in=[s.strip().upper() for s in opts['skus'].split(',') if s.strip()])
                         .select_related('product'))
        else:
            self.stderr.write('Give --project, --skus or --summary.')
            return
        prices = black_friday.prices_for(items, target=target)
        rows = sorted(items, key=lambda i: i.sku)
        if opts.get('json') == '-':  # to the screen (a production one-off: copy it from there)
            self.stdout.write(json.dumps({i.sku: float(prices[i.pk]) for i in rows}))
            return
        if opts.get('json'):
            with open(opts['json'], 'w', encoding='utf-8') as fh:
                json.dump({i.sku: float(prices[i.pk]) for i in rows}, fh, indent=1)
            self.stdout.write(f'{len(rows)} prices for Saturday {target} ThriftBucks -> {opts["json"]}')
            return
        self.stdout.write('sku\ttitle\tretail\tblack_friday_price\tstatus')
        for i in rows:
            retail = tag_retail(i)
            self.stdout.write(f'{i.sku}\t{(i.product.title or "")[:60]}\t{retail or ""}\t{prices[i.pk]}\t{i.status}')

    def _summary(self, target: date):
        from apps.inventory.models import Item
        from apps.inventory.services.tag_retail import tag_retail

        items = list(Item.objects.filter(status='on_shelf', price__gt=0))
        prices = black_friday.prices_for(items, target=target)
        n = 0
        pct_sum = Decimal(0)
        retail_sum = price_sum = Decimal(0)
        for i in items:
            retail = tag_retail(i)
            if retail is None or retail <= 0:
                continue
            p = prices[i.pk]
            n += 1
            pct_sum += (retail - p) / retail
            retail_sum += retail
            price_sum += p
        if not n:
            self.stdout.write('No floor item has a retail the tag may print.')
            return
        self.stdout.write(f'Saturday {target} ThriftBucks; {n} of {len(items)} floor items have a printable retail.')
        self.stdout.write(f'Average off retail, per item: {pct_sum / n * 100:.1f}%')
        self.stdout.write(f'Average off retail, dollar-weighted: {(1 - price_sum / retail_sum) * 100:.1f}%')
