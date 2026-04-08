"""Re-apply normalization to stored ManifestRow.raw_data without calling B-Stock."""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.buying.models import CategoryMapping, ManifestRow
from apps.buying.services import normalize
from apps.buying.services.manifest_template import (
    build_fast_cat_key,
    row_fill_rates_for_template,
    standardize_row,
    effective_category_fields,
)

_BULK_FIELDS_BSTOCK = [
    'title',
    'brand',
    'model',
    'sku',
    'upc',
    'quantity',
    'retail_value',
    'condition',
    'notes',
]

_BULK_FIELDS_TEMPLATE = _BULK_FIELDS_BSTOCK + [
    'fast_cat_key',
    'fast_cat_value',
    'category_confidence',
]


def _mapping() -> dict[str, str]:
    return dict(CategoryMapping.objects.values_list('source_key', 'canonical_category'))


class Command(BaseCommand):
    help = (
        'Re-normalize manifest line fields from existing JSON raw_data. '
        'Rows with manifest_template: template standardize + fast_cat. '
        'Legacy API rows: normalize_manifest_row only. Does not require JWT or HTTP.'
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

        qs = ManifestRow.objects.select_related(
            'auction__marketplace', 'manifest_template'
        ).order_by('pk')
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
        mp = _mapping()

        for row in qs.iterator(chunk_size=batch_size):
            raw = row.raw_data if isinstance(row.raw_data, dict) else {}
            tmpl = row.manifest_template
            if tmpl is not None:
                std = standardize_row(tmpl, raw)
                fr = row_fill_rates_for_template(tmpl, raw)
                eff = effective_category_fields(tmpl, fr)
                fck = build_fast_cat_key(row.auction.marketplace, tmpl, raw, eff)
                fcv = mp.get(fck) if fck else None
                if fcv:
                    row.fast_cat_key = fck
                    row.fast_cat_value = fcv
                    row.category_confidence = ManifestRow.CONF_FAST_CAT
                else:
                    row.fast_cat_key = fck
                    row.fast_cat_value = None
                    row.category_confidence = None
                row.title = std['title']
                row.brand = std['brand']
                row.model = std['model']
                row.sku = std['sku']
                row.upc = std['upc']
                row.quantity = std['quantity']
                row.retail_value = std['retail_value']
                row.condition = std['condition']
                row.notes = std['notes']
                fields = _BULK_FIELDS_TEMPLATE
            else:
                norm = normalize.normalize_manifest_row(raw, row_id=row.pk)
                row.title = norm['title']
                row.brand = norm['brand']
                row.model = norm['model']
                row.sku = norm['sku']
                row.upc = norm['upc']
                row.quantity = norm['quantity']
                row.retail_value = norm['retail_value']
                row.condition = norm['condition']
                row.notes = norm['notes']
                fields = _BULK_FIELDS_BSTOCK

            batch.append((row, fields))
            if len(batch) >= batch_size:
                self._flush_batch(batch)
                processed += len(batch)
                self.stdout.write(f'Updated {processed}/{total}...')
                batch.clear()

        if batch:
            self._flush_batch(batch)
            processed += len(batch)

        self.stdout.write(self.style.SUCCESS(f'Done. Re-normalized {processed} manifest row(s).'))

    def _flush_batch(self, batch: list[tuple[ManifestRow, list[str]]]) -> None:
        by_fields: dict[tuple[str, ...], list[ManifestRow]] = {}
        for row, fields in batch:
            key = tuple(fields)
            by_fields.setdefault(key, []).append(row)
        for fields_t, rows in by_fields.items():
            ManifestRow.objects.bulk_update(rows, list(fields_t))
