"""Daily SQL aggregates → ``CategoryStats``; optional full valuation for open auctions."""

from __future__ import annotations

from datetime import timedelta

from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.buying.models import Auction
from apps.buying.services.buying_settings import get_pricing_need_window_days
from apps.buying.services.category_stats_sql import upsert_category_stats_from_sql
from apps.buying.services.valuation import load_category_stats_dict, recompute_auction_full


class Command(BaseCommand):
    help = 'Recompute CategoryStats from inventory SQL; invalidate category-need cache; optional full recompute.'

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Log counts only; do not write CategoryStats or cache.',
        )
        parser.add_argument(
            '--skip-recompute-open',
            action='store_true',
            help='Skip full recompute for non-archived open/closing auctions with future end_time.',
        )

    def handle(self, *args, **options):
        dry = bool(options.get('dry_run'))
        skip_re = bool(options.get('skip_recompute_open'))
        window = get_pricing_need_window_days()
        since = timezone.now() - timedelta(days=window)
        if dry:
            from apps.buying.services.category_stats_sql import compute_category_stats_payloads

            payloads = compute_category_stats_payloads(since=since)
            self.stdout.write(self.style.NOTICE(f'dry-run: {len(payloads)} categories (window_days={window})'))
            return

        upsert_category_stats_from_sql(since=since)
        cache.delete('category_need_panel')
        self.stdout.write(self.style.SUCCESS(f'CategoryStats updated (need window {window} days). Cache invalidated.'))

        if skip_re:
            self.stdout.write('Skipped full recompute (--skip-recompute-open).')
            return

        stats = load_category_stats_dict()
        now = timezone.now()
        qs = Auction.objects.filter(
            archived_at__isnull=True,
            status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
            end_time__gte=now,
        ).select_related('marketplace')
        n = 0
        for a in qs.iterator(chunk_size=200):
            recompute_auction_full(a, stats=stats)
            n += 1
        self.stdout.write(self.style.SUCCESS(f'Full recompute for {n} open/closing auction(s).'))
