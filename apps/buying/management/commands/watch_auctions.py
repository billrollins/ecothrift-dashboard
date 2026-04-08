"""Poll B-Stock auction state for watched auctions (requires JWT)."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.services import pipeline, scraper


class Command(BaseCommand):
    help = (
        'Poll auction.bstock.com for auctions on the watchlist, write AuctionSnapshot '
        'rows, and update Auction. Respects WatchlistEntry.poll_interval_seconds unless '
        '--force. Requires workspace/.bstock_token or BSTOCK_AUTH_TOKEN.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Log which auctions would be polled; no HTTP or DB writes.',
        )
        parser.add_argument(
            '--auction-id',
            type=int,
            default=None,
            help='Restrict to a single Auction primary key (must be on watchlist).',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Ignore poll interval / last_polled_at.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        auction_id = options['auction_id']
        force = options['force']
        auction_ids = [auction_id] if auction_id is not None else None

        try:
            summary = pipeline.run_watch_poll(
                auction_ids=auction_ids,
                force=force,
                dry_run=dry_run,
            )
        except ValueError as e:
            self.stderr.write(self.style.ERROR(str(e)))
            raise SystemExit(1) from e
        except scraper.BStockAuthError:
            self.stderr.write(self.style.ERROR(scraper.AUTH_TOKEN_EXPIRED_MESSAGE))
            raise SystemExit(1)

        self.stdout.write(str(summary))
