"""Re-fit the likely-close model (close ÷ retail per seller, the late bump) from ended auctions."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.services import price_target
from apps.buying.services.close_model_fit import MIN_BUMP_N, MIN_SELLER_N, fit_close_model, to_decimal_model
from apps.core.models import AppSetting

SETTING_KEY = 'buying_close_model'


class Command(BaseCommand):
    help = (
        'Fit likely close = listed retail x the seller ratio (median close / retail over ended '
        'auctions), and the late bump (final / price 1 and 3 hours out, from price snapshots). '
        'Reports it next to the current model; --save stores it in Admin > Assumptions.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument('--days', type=int, default=180, help='Ended auctions of the last N days (default 180).')
        parser.add_argument('--save', action='store_true', help='Store the fitted model (else just report).')

    def handle(self, *args, **options) -> None:
        fit = fit_close_model(days=options['days'])
        model, current = fit['model'], fit['current']
        self.stdout.write(f"{fit['n']} ended auctions in the last {options['days']} days.")
        self.stdout.write(f"{'seller':24} {'n':>6} {'close/retail':>12}  {'current':>8}")
        current_sellers = current.get('sellers') or {}
        for name, row in fit['sellers'].items():
            mark = '' if row['own_ratio'] else f'  (under {MIN_SELLER_N}: uses the default)'
            now = next((v for k, v in current_sellers.items() if k in name), current.get('default'))
            self.stdout.write(f"{name[:24]:24} {row['n']:>6} {row['median']:>12}  {now!s:>8}{mark}")
        self.stdout.write(f"default: {model['default']} (was {current.get('default')})")
        for key, setting in (('hour', 'bump_last_hour'), ('three_hours', 'bump_last_3_hours')):
            b = fit['bumps'][key]
            note = '' if b['n'] >= MIN_BUMP_N else f' (under {MIN_BUMP_N}: kept the current one)'
            self.stdout.write(f"{setting}: {model[setting]} from n = {b['n']}, median {b['median']} (was {current.get(setting)}){note}")
        if not options['save']:
            self.stdout.write('Report only. Run again with --save to use it, then recompute_buying_valuations.')
            return
        AppSetting.objects.update_or_create(
            key=SETTING_KEY,
            defaults={'value': to_decimal_model(model), 'description': 'Likely close model (fit_close_model).'},
        )
        price_target.clear_cache()
        self.stdout.write(self.style.SUCCESS('Saved. Now run recompute_buying_valuations.'))
