"""Audit: distribution of auction need_score (1–99) and priority."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.models import Auction


def _percentile(sorted_vals: list[float], p: float) -> float | None:
    if not sorted_vals:
        return None
    idx = int(round((p / 100.0) * (len(sorted_vals) - 1)))
    return sorted_vals[idx]


class Command(BaseCommand):
    help = 'Print min/max/mean/percentiles for need_score and priority across Auction rows (1–99 scale).'

    def handle(self, *args, **options):
        qs = Auction.objects.all()
        total = qs.count()
        self.stdout.write(f'Total auctions: {total}')
        need = [float(x) for x in qs.exclude(need_score__isnull=True).values_list('need_score', flat=True)]
        pri = [float(x) for x in qs.exclude(priority__isnull=True).values_list('priority', flat=True)]
        pr = [
            float(x)
            for x in qs.exclude(profitability_ratio__isnull=True).values_list('profitability_ratio', flat=True)
        ]
        ep = [float(x) for x in qs.exclude(est_profit__isnull=True).values_list('est_profit', flat=True)]
        for label, raw in [
            ('need_score', need),
            ('priority', pri),
            ('profitability_ratio', pr),
            ('est_profit', ep),
        ]:
            if not raw:
                self.stdout.write(f'{label}: (no values)')
                continue
            s = sorted(raw)
            mean = sum(s) / len(s)
            self.stdout.write(
                f'{label}: n={len(s)} min={s[0]:.4f} max={s[-1]:.4f} mean={mean:.4f} '
                f'p10={_percentile(s, 10):.4f} p50={_percentile(s, 50):.4f} p90={_percentile(s, 90):.4f}'
            )
        self.stdout.write(
            '\nNeed/priority are weighted CategoryStats.need_score_1to99 mix; see '
            'apps.buying.services.valuation._auction_need_from_mix.'
        )
