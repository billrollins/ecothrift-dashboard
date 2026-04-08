"""Re-apply normalize_manifest_row to stored ManifestRow.raw_data without calling B-Stock."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.models import ManifestRow
from apps.buying.services import normalize

_BULK_FIELDS = [
    'title',
    'brand',
    'model',
    'category',
    'sku',
    'upc',
    'quantity',
    'retail_value',
    'condition',
    'notes',
]


class Command(BaseCommand):
    help = (
        'Re-normalize manifest line fields from existing JSON raw_data. '
        'Does not require JWT or HTTP. Use after expanding normalize.py heuristics.'
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--auction-id',
            type=int,
            default=None,
            help='Limit to rows for this auction primary key.',
        )
        parser.add_argument(
            '--marketplace',
            type=str,
            default=None,
            help='Limit to auctions in this marketplace slug.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=None,
            help='Max rows to process (after filters).',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='Rows per bulk_update batch.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print how many rows would be updated; do not write.',
        )

    def handle(self, *args, **options) -> None:
        auction_id = options['auction_id']
        marketplace = options['marketplace']
        limit = options['limit']
        batch_size = max(1, int(options['batch_size']))
        dry_run = options['dry_run']

        qs = ManifestRow.objects.all().order_by('pk')
        if auction_id is not None:
            qs = qs.filter(auction_id=auction_id)
        if marketplace:
            qs = qs.filter(auction__marketplace__slug=marketplace)
        if limit is not None:
            qs = qs[: int(limit)]

        total = qs.count()
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f'Dry run: would re-normalize {total} manifest row(s).'))
            return

        processed = 0
        batch: list[ManifestRow] = []

        for row in qs.iterator(chunk_size=batch_size):
            norm = normalize.normalize_manifest_row(row.raw_data or {}, row_id=row.pk)
            row.title = norm['title']
            row.brand = norm['brand']
            row.model = norm['model']
            row.category = norm['category']
            row.sku = norm['sku']
            row.upc = norm['upc']
            row.quantity = norm['quantity']
            row.retail_value = norm['retail_value']
            row.condition = norm['condition']
            row.notes = norm['notes']
            batch.append(row)
            if len(batch) >= batch_size:
                ManifestRow.objects.bulk_update(batch, _BULK_FIELDS)
                processed += len(batch)
                self.stdout.write(f'Updated {processed}/{total}...')
                batch.clear()

        if batch:
            ManifestRow.objects.bulk_update(batch, _BULK_FIELDS)
            processed += len(batch)

        self.stdout.write(self.style.SUCCESS(f'Done. Re-normalized {processed} manifest row(s).'))
