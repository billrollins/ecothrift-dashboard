"""Fill missing final_* from ai/standard coalesce on staged preprocessing rows."""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.inventory.layer_helpers import TRIPLE_LAYER_SPECS, snapshot_finalize_from_ai_and_standard
from apps.inventory.models import PreprocessingRow, PurchaseOrder


class Command(BaseCommand):
    help = (
        'Snapshot final_* from ai_* + standard_* for staged preprocessing rows '
        '(repair rows missing finals after cleanup import). '
        'Default: fill only empty finals (staff-edited finals preserved). '
        'Use --force to overwrite all finals from layers.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            'purchase_order_id',
            type=int,
            help='PurchaseOrder primary key',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Overwrite every final_* from snapshot (ignore existing finals)',
        )

    def handle(self, *args, **options):
        po_id = options['purchase_order_id']
        force = options['force']

        order = PurchaseOrder.objects.filter(pk=po_id).first()
        if not order:
            self.stderr.write(self.style.ERROR(f'No PurchaseOrder for purchase_order_id={po_id}'))
            return

        if order.finalized_at:
            self.stderr.write(
                self.style.WARNING(
                    f'Order {po_id} preprocessing is finalized; refusing to mutate finals '
                    f'(undo finalize or edit ManifestRow instead).',
                ),
            )
            return

        qs = PreprocessingRow.objects.filter(purchase_order_id=po_id).order_by('row_number')
        total = qs.count()
        if total == 0:
            self.stdout.write('No staged rows.')
            return

        final_field_names = [f'final_{base}' for base in TRIPLE_LAYER_SPECS.keys()] + [
            'final_title',
            'final_category',
        ]
        save_fields = list(dict.fromkeys(final_field_names + ['updated_at']))
        ts = timezone.now()
        updated = 0

        with transaction.atomic():
            for row in qs.iterator(chunk_size=200):
                snapshot_finalize_from_ai_and_standard(row, fill_missing_only=not force)
                row.updated_at = ts
                row.save(update_fields=save_fields)
                updated += 1

        self.stdout.write(self.style.SUCCESS(f'Updated {updated} / {total} row(s) for PO {po_id} (force={force}).'))
