"""Buying Phase 4 backfill: match, flag and value every auction manifest, then re-value.

    python manage.py analyze_manifests            # open auctions with a manifest, stale only
    python manage.py analyze_manifests --all      # every auction with a manifest
    python manage.py analyze_manifests --force    # even when nothing changed
    python manage.py analyze_manifests --auction 123

New manifests are analyzed on their own (valuation runs it after a pull or an upload).
"""
import time

from django.core.management.base import BaseCommand

from apps.buying.models import Auction, ManifestRow
from apps.buying.services.manifest_analysis import analyze_auction, is_stale
from apps.buying.services.valuation import load_category_stats_dict, recompute_auction_full


class Command(BaseCommand):
    help = 'Match manifest lines to products, flag hazards, and value trucks line by line.'

    def add_arguments(self, parser):
        parser.add_argument('--all', action='store_true', help='Include closed and archived auctions.')
        parser.add_argument('--force', action='store_true', help='Re-run even when the manifest did not change.')
        parser.add_argument('--auction', type=int, help='One auction id.')

    def handle(self, *args, **options):
        # Auctions whose manifest lines we hold (has_manifest only means B-Stock lists one).
        qs = Auction.objects.filter(pk__in=ManifestRow.objects.values('auction_id').distinct())
        if options.get('auction'):
            qs = qs.filter(pk=options['auction'])
        elif not options.get('all'):
            qs = qs.filter(status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING], archived_at__isnull=True)
        stats = load_category_stats_dict()
        done = skipped = failed = 0
        started = time.monotonic()
        for auction in qs.order_by('pk').iterator():
            if not options.get('force') and not is_stale(auction):
                skipped += 1
                continue
            try:
                summary = analyze_auction(auction, stats=stats)
                recompute_auction_full(auction, stats=stats)
            except Exception as exc:  # keep going; report at the end
                failed += 1
                self.stderr.write(f'auction {auction.pk}: {exc}')
                continue
            done += 1
            self.stdout.write(
                f"auction {auction.pk}: {summary.get('lines', 0)} lines, "
                f"{summary.get('matched_lines', 0)} matched, "
                f"{summary.get('matched_retail_pct', 0)}% of retail matched, "
                f"value {summary.get('revenue')} (by category {summary.get('revenue_by_category')})"
            )
        self.stdout.write(self.style.SUCCESS(
            f'analyzed {done}, unchanged {skipped}, failed {failed} in {time.monotonic() - started:.0f}s'
        ))
