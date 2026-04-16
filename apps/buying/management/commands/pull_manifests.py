"""Pull manifest line items from order-process.bstock.com using each Auction.lot_id.

Fetches use anonymous GET via ``scraper.get_manifest`` (no JWT). SOCKS5 applies
when ``BUYING_SOCKS5_PROXY_ENABLED`` is True. REST ``POST …/pull_manifest/`` may
still return 501; this command is the server-side pull path.
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand, CommandError

from apps.buying.services import pipeline
from apps.buying.services import scraper

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        'Fetch manifests via anonymous order-process API (SOCKS5 if enabled). '
        'With no auction IDs: uses the nightly queue (watched first, then priority). '
        'Use --legacy-has-manifest to only process auctions where has_manifest=True.'
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
        parser.add_argument(
            '--batch-size',
            type=int,
            default=None,
            help='When pulling the queue (no auction IDs), limit to this many auctions.',
        )
        parser.add_argument(
            '--delay',
            type=float,
            default=0.0,
            help='Seconds to sleep after each auction (default 0).',
        )
        parser.add_argument(
            '--legacy-has-manifest',
            action='store_true',
            help='Only consider auctions with has_manifest=True (old behavior).',
        )
        parser.add_argument(
            '--no-prefetch',
            action='store_true',
            help='Disable overlapping fetch of the next auction manifest.',
        )

    def handle(self, *args, **options):
        ids = options.get('auction_ids')
        if ids is not None and len(ids) == 0:
            self.stdout.write(self.style.WARNING('No auction ids; nothing to do.'))
            return
        force = bool(options.get('force'))
        batch_size = options.get('batch_size')
        delay = float(options.get('delay') or 0.0)
        legacy = bool(options.get('legacy_has_manifest'))

        try:
            summary = pipeline.run_manifest_pull(
                auction_ids=ids,
                force=force,
                batch_size=batch_size,
                inter_auction_delay=delay,
                use_has_manifest_fallback=legacy and ids is None,
                prefetch_next=not bool(options.get('no_prefetch')),
            )
        except scraper.BStockAuthError as e:
            raise CommandError(str(e)) from e
        except ValueError as e:
            raise CommandError(str(e)) from e
        except Exception as e:
            raise CommandError(str(e)) from e

        self.stdout.write(self.style.SUCCESS(str(summary)))
        logger.info('pull_manifests %s', summary)
