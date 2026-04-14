"""Run listing discovery and upsert Auction rows for active marketplaces."""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand, CommandError

from apps.buying.services import pipeline
from apps.buying.services import scraper

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Discover open auctions via search.bstock.com (POST all-listings). '
        'Requires seeded Marketplaces with external_id (storeFrontId). '
        'JWT from workspace/.bstock_token or BSTOCK_AUTH_TOKEN only when using --enrich-detail.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--marketplace',
            type=str,
            default=None,
            help='Slug of a single marketplace to sweep (default: all active).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Fetch listings but do not write to the database. Logs full first search JSON.',
        )
        parser.add_argument(
            '--enrich-detail',
            action='store_true',
            help='Merge auction.bstock.com state per listing (requires BSTOCK_AUTH_TOKEN).',
        )
        parser.add_argument(
            '--page-limit',
            type=int,
            default=200,
            help='Page size for search pagination (default 200).',
        )
        parser.add_argument(
            '--max-pages',
            type=int,
            default=None,
            help='Max search pages per marketplace (default: unlimited within BSTOCK_SEARCH_MAX_PAGES).',
        )

    def handle(self, *args, **options):
        slug = options.get('marketplace')
        dry = bool(options.get('dry_run'))
        enrich = bool(options.get('enrich_detail'))
        page_limit = int(options.get('page_limit') or 200)
        max_pages = options.get('max_pages')

        try:
            summary = pipeline.run_discovery(
                marketplace_slug=slug,
                dry_run=dry,
                enrich_detail=enrich,
                page_limit=page_limit,
                max_pages=max_pages,
            )
        except scraper.BStockAuthError as e:
            raise CommandError(str(e)) from e
        except ValueError as e:
            raise CommandError(str(e)) from e

        self.stdout.write(self.style.SUCCESS(str(summary)))
        logger.info('sweep_auctions %s', summary)
