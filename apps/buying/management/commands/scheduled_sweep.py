"""Hourly: discovery sweep + lightweight valuation for active non-archived auctions."""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand, CommandError

from apps.buying.services import pipeline, scraper
from apps.buying.services.valuation import (
    recompute_active_auctions_lightweight,
    run_ai_estimate_for_swept_auctions,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'run_discovery (no JWT), AI estimate on swept auctions, then '
        'recompute_active_auctions_lightweight for active listings.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--marketplace',
            type=str,
            default=None,
            help='Slug of a single marketplace (default: all active).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Pass through to discovery dry_run (no DB writes from discovery).',
        )

    def handle(self, *args, **options):
        slug = options.get('marketplace')
        dry = bool(options.get('dry_run'))
        try:
            summary = pipeline.run_discovery(
                marketplace_slug=slug,
                dry_run=dry,
                enrich_detail=False,
            )
        except scraper.BStockAuthError as e:
            raise CommandError(str(e)) from e
        except ValueError as e:
            raise CommandError(str(e)) from e

        self.stdout.write(self.style.SUCCESS(str(summary)))
        if dry:
            self.stdout.write('dry-run: skipped AI estimate and lightweight recompute.')
            return

        ids = summary.get('upserted_auction_ids') or []
        ai_est = run_ai_estimate_for_swept_auctions(ids)
        self.stdout.write(self.style.SUCCESS(f'ai_estimate={ai_est!r}'))
        n = recompute_active_auctions_lightweight()
        self.stdout.write(self.style.SUCCESS(f'lightweight_recomputed={n}'))
        logger.info('scheduled_sweep lightweight_recomputed=%s summary=%s', n, summary)
