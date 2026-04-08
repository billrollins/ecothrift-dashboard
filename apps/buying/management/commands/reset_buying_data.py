"""Delete all buying domain data except Marketplaces (Phase 4.1A test bed reset)."""

from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.buying.models import (
    Auction,
    AuctionSnapshot,
    Bid,
    CategoryMapping,
    ManifestRow,
    ManifestTemplate,
    Outcome,
    WatchlistEntry,
)

_MODELS_ORDER: list[tuple[str, type]] = [
    ('ManifestRow', ManifestRow),
    ('AuctionSnapshot', AuctionSnapshot),
    ('WatchlistEntry', WatchlistEntry),
    ('Bid', Bid),
    ('Outcome', Outcome),
    ('Auction', Auction),
    ('CategoryMapping', CategoryMapping),
    ('ManifestTemplate', ManifestTemplate),
]


class Command(BaseCommand):
    help = (
        'Delete all ManifestRow, AuctionSnapshot, WatchlistEntry, Bid, Outcome, Auction, '
        'CategoryMapping, and ManifestTemplate rows. Does not delete Marketplace. '
        'Requires --confirm to execute.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Actually delete rows (otherwise only print counts).',
        )

    def handle(self, *args, **options) -> None:
        confirm = options['confirm']

        if not confirm:
            self.stdout.write(self.style.WARNING('Dry run (no --confirm). Current row counts:'))
            for label, model in _MODELS_ORDER:
                n = model.objects.count()
                self.stdout.write(f'  {label}: {n}')
            self.stdout.write(
                self.style.WARNING('Re-run with --confirm to delete these rows.')
            )
            return

        deleted_counts: dict[str, int] = {}
        with transaction.atomic():
            for label, model in _MODELS_ORDER:
                qs = model.objects.all()
                n = qs.count()
                qs.delete()
                deleted_counts[label] = n

        self.stdout.write(self.style.SUCCESS('Deleted rows (per model, order applied):'))
        for label, model in _MODELS_ORDER:
            self.stdout.write(f'  {label}: {deleted_counts[label]}')
