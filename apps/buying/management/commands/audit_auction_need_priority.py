"""Phase 3B Session 5 — Step 1: distribution of current need_score and priority (before formula change)."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.models import Auction


def _percentile(sorted_vals: list[float], p: float) -> float | None:
    if not sorted_vals:
        return None
    idx = int(round((p / 100.0) * (len(sorted_vals) - 1)))
    return sorted_vals[idx]


class Command(BaseCommand):
    help = 'Print min/max/mean/percentiles for need_score and priority across Auction rows.'

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
        for label, raw in [
            ('need_score', need),
            ('priority', pri),
            ('profitability_ratio', pr),
        ]:
            if not raw:
                self.stdout.write(f'{label}: (no values)')
                continue
            s = sorted(raw)
            mean = sum(s) / len(s)
            self.stdout.write(
                f'{label}: n={len(s)} min={s[0]:.6f} max={s[-1]:.6f} mean={mean:.6f} '
                f'p10={_percentile(s, 10):.6f} p50={_percentile(s, 50):.6f} p90={_percentile(s, 90):.6f}'
            )
        self.stdout.write(
            '\nUse these numbers with Phase 3B D+L plan: propose explicit formula, '
            'get approval, then change recompute_auction_valuation — not before.'
        )
