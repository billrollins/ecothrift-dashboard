"""Pull manifest line items from order-process.bstock.com using each Auction.lot_id."""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand, CommandError

from apps.buying.services import pipeline
from apps.buying.services import scraper

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Fetch manifests for auctions with has_manifest=True (or specific IDs). '
        'Requires JWT (workspace/.bstock_token or BSTOCK_AUTH_TOKEN) and Auction.lot_id.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--auction-id',
            type=int,
            nargs='*',
            dest='auction_ids',
            default=None,
            help='One or more Auction primary keys to pull.',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Re-pull even if ManifestRow rows already exist (replaces rows).',
        )

    def handle(self, *args, **options):
        ids = options.get('auction_ids')
        if ids is not None and len(ids) == 0:
            self.stdout.write(self.style.WARNING('No auction ids; nothing to do.'))
            return
        force = bool(options.get('force'))

        try:
            summary = pipeline.run_manifest_pull(auction_ids=ids, force=force)
        except scraper.BStockAuthError as e:
            raise CommandError(str(e)) from e
        except ValueError as e:
            raise CommandError(str(e)) from e
        except Exception as e:
            raise CommandError(str(e)) from e

        self.stdout.write(self.style.SUCCESS(str(summary)))
        logger.info('pull_manifests %s', summary)
