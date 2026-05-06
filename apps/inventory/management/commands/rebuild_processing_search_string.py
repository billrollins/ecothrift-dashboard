"""Rebuild ``ProcessingRow.search_string`` in bulk (bypasses ``save()`` / ``pre_save``)."""

from django.core.management.base import BaseCommand

from apps.inventory.models import ProcessingRow
from apps.inventory.services.processing_search_string import build_processing_row_search_string

_TERMINAL_PO_STATUSES = frozenset({'complete', 'cancelled'})


class Command(BaseCommand):
    help = 'Recompute ProcessingRow.search_string (uses same builder as pre_save).'

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--purchase-order-id',
            type=int,
            dest='purchase_order_id',
            help='Limit to bookmarks for a single purchase order id.',
        )
        parser.add_argument(
            '--exclude-terminal-po-status',
            action='store_true',
            default=True,
            dest='exclude_terminal',
            help='Exclude POs with status complete or cancelled (default: on).',
        )
        parser.add_argument(
            '--no-exclude-terminal-po-status',
            action='store_false',
            dest='exclude_terminal',
            help='Rebuild every ProcessingRow regardless of PO status.',
        )
        parser.add_argument(
            '--batch-size',
            type=int,
            default=500,
            help='bulk_update batch size (default 500).',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Count rows only; do not write.',
        )

    def handle(self, *args, **options) -> None:
        po_id = options.get('purchase_order_id')
        batch_size = max(1, int(options.get('batch_size') or 500))
        dry_run = bool(options.get('dry_run'))
        exclude_terminal = bool(options.get('exclude_terminal'))

        qs = ProcessingRow.objects.order_by('id')

        if po_id:
            qs = qs.filter(purchase_order_id=int(po_id))
        elif exclude_terminal:
            qs = qs.exclude(purchase_order__status__in=_TERMINAL_PO_STATUSES)

        total = qs.count()
        self.stdout.write(f'Processing rows to rebuild: {total}')

        if dry_run:
            return

        updated = 0
        batch: list[ProcessingRow] = []
        for pr in qs.iterator(chunk_size=batch_size):
            pr.search_string = build_processing_row_search_string(pr)
            batch.append(pr)
            if len(batch) >= batch_size:
                ProcessingRow.objects.bulk_update(batch, ['search_string'])
                updated += len(batch)
                batch.clear()

        if batch:
            ProcessingRow.objects.bulk_update(batch, ['search_string'])
            updated += len(batch)

        self.stdout.write(self.style.SUCCESS(f'Updated search_string on {updated} rows.'))
