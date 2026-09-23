"""Re-fit the shipping formula from our own shipping history (POs + saved B-Stock quotes)."""

from __future__ import annotations

import csv
import statistics
from collections import defaultdict
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.buying.services.shipping_formula import (
    FORMULA_SETTING_KEY,
    ensure_origin_miles,
    fit_formula,
    formula_amount,
    get_shipping_formula,
    load_origin_miles,
    shipping_history,
)


class Command(BaseCommand):
    help = (
        'Fit shipping = truckload: fixed + per_mile x miles; LTL: fixed + per_pallet x pallets + '
        'per_pallet_mile x pallets x miles, from purchase orders (city and pallets read from the '
        'description) and saved B-Stock quotes. Looks up driving miles for new cities (Google). '
        'Prints each city and the fit; --save stores it in Admin > Assumptions.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument('--save', action='store_true', help='Store the new formula (else just report).')
        parser.add_argument(
            '--csv',
            default='workspace/shipping_history.csv',
            help='Also write the rows used (city slug, vendor, pallets, cost, fee, shipping, yyyy-mm).',
        )

    def handle(self, *args, **options) -> None:
        rows = shipping_history()
        found = ensure_origin_miles(sorted({r['city'] for r in rows}))
        if found:
            self.stdout.write(f'Looked up driving miles for {found} new city(ies).')
        miles = load_origin_miles()

        by_city: dict[str, list[dict]] = defaultdict(list)
        for r in rows:
            by_city[r['city_slug']].append(r)
        current = get_shipping_formula()
        self.stdout.write(f'{len(rows)} shipments from {len(by_city)} cities. Current formula fitted {current.get("fitted_on")}.')
        self.stdout.write(f'{"city":24} {"miles":>5} {"n":>3}  {"months":17} {"$/pallet med":>12}  vendors')
        for slug, rs in sorted(by_city.items(), key=lambda kv: -len(kv[1])):
            per = statistics.median(float(r['shipping']) / r['pallets'] for r in rs)
            months = f'{min(r["ym"] for r in rs)}..{max(r["ym"] for r in rs)}'
            vendors = ','.join(sorted({r['vendor'] for r in rs}))
            self.stdout.write(f'{rs[0]["city"]:24} {miles.get(slug, "-"):>5} {len(rs):>3}  {months:17} {per:12.0f}  {vendors}')

        formula = fit_formula(rows, miles)
        t, l = formula['truckload'], formula['ltl']
        self.stdout.write(
            f'\nTruckload: ${t["fixed"]:,.0f} + ${t["per_mile"]:.2f}/mile  '
            f'(level {formula["level"]["truckload"]}, typical miss {formula["typical_error"]["truckload"]:.0%})'
        )
        self.stdout.write(
            f'LTL: ${l["fixed"]:,.0f} + ${l["per_pallet"]:.2f}/pallet + ${l["per_pallet_mile"]:.4f}/pallet-mile  '
            f'(level {formula["level"]["ltl"]}, typical miss {formula["typical_error"]["ltl"]:.0%})'
        )
        self.stdout.write(
            f'Example: 23-pallet truckload from 637 mi = ${formula_amount(23, 637, True, formula):,.0f}; '
            f'4 pallets LTL from 616 mi = ${formula_amount(4, 616, False, formula):,.0f}'
        )

        if options['csv'] and rows:
            path = Path(settings.BASE_DIR) / options['csv']
            path.parent.mkdir(parents=True, exist_ok=True)
            with open(path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
            self.stdout.write(f'Rows written to {path}.')

        if options['save']:
            from apps.core.models import AppSetting

            AppSetting.objects.update_or_create(key=FORMULA_SETTING_KEY, defaults={'value': formula})
            self.stdout.write(self.style.SUCCESS('Saved. Re-value with: python manage.py recompute_buying_valuations'))
        else:
            self.stdout.write('Report only; add --save to use it.')
