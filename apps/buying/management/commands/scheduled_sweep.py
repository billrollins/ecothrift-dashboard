"""Hourly: the week's supply order once its count deadline passes (``apps.supplies``), then the discovery sweep
+ lightweight valuation for active non-archived auctions."""

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
        parser.add_argument(
            '--skip-supplies',
            action='store_true',
            help="Skip building the week's supply order (apps.supplies) that runs first.",
        )

    def handle(self, *args, **options):
        slug = options.get('marketplace')
        dry = bool(options.get('dry_run'))
        if not dry and not options.get('skip_supplies'):
            # First and inside a try, so a B-Stock failure never stops the order and an order failure never
            # stops the sweep.
            try:
                from apps.supplies.services.orders import run_due

                self.stdout.write(run_due())
            except Exception as exc:  # noqa: BLE001
                logger.exception('Supply order build failed')
                self.stderr.write(f'Supply order skipped: {exc}')
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
