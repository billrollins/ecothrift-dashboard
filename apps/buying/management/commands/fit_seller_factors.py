"""Fit each seller's revenue factor (actual / predicted) from our finished B-Stock POs."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.services import price_target
from apps.buying.services.seller_factor import MIN_TRUCKS, SELLER_FACTORS_KEY, fit_seller_factors
from apps.core.models import AppSetting


class Command(BaseCommand):
    help = (
        "Per B-Stock seller, what its finished trucks really made against the valuation's "
        'prediction (POs 120+ days old, half or more sold). Reports it; --save stores the '
        'factors in Admin > Assumptions, then run recompute_buying_valuations.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument('--save', action='store_true', help='Store the factors (else just report).')
        parser.add_argument('--min-age-days', type=int, default=120)
        parser.add_argument('--min-sold-pct', type=float, default=50)

    def handle(self, *args, **options) -> None:
        fit = fit_seller_factors(min_age_days=options['min_age_days'], min_sold_pct=options['min_sold_pct'])
        overall = fit['overall']
        self.stdout.write(
            f"Finished trucks: {overall.get('n', 0)}; actual / predicted (after shrink {fit['shrink_kept']} kept): "
            f"median {overall.get('median', '-')} (p25 {overall.get('p25', '-')}, p75 {overall.get('p75', '-')})."
        )
        self.stdout.write(f"{'seller':16} {'n':>4} {'p25':>6} {'median':>7} {'p75':>6}  factor")
        for name, row in fit['by_seller'].items():
            factor = fit['sellers'].get(name, {}).get('factor', f'- (under {MIN_TRUCKS} trucks)')
            self.stdout.write(f"{name[:16]:16} {row['n']:>4} {row['p25']:>6} {row['median']:>7} {row['p75']:>6}  {factor}")
        if not options['save']:
            self.stdout.write('Report only. Run again with --save to use it, then recompute_buying_valuations.')
            return
        AppSetting.objects.update_or_create(
            key=SELLER_FACTORS_KEY,
            defaults={'value': fit, 'description': "Seller revenue factors: finished trucks' actual / predicted (fit_seller_factors)."},
        )
        price_target.clear_cache()
        self.stdout.write(self.style.SUCCESS('Saved. Now run recompute_buying_valuations.'))
