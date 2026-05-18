"""One-off: build legacy check-in Item rows from existing ManifestRow data (operator use only)."""

from django.core.management.base import BaseCommand, CommandError

from apps.inventory.models import PurchaseOrder
from apps.inventory.views import _build_check_in_queue_from_manifest


class Command(BaseCommand):
    help = (
        'Create check-in Item rows from existing ManifestRow lines for a legacy PO '
        '(uses_legacy_processing). Does not run from receiving completion.'
    )

    def add_arguments(self, parser):
        parser.add_argument('order_id', type=int, help='PurchaseOrder primary key')
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print counts only; do not write.',
        )

    def handle(self, *args, **options):
        oid = options['order_id']
        dry = options['dry_run']
        order = PurchaseOrder.objects.filter(pk=oid).first()
        if not order:
            raise CommandError(f'PurchaseOrder {oid} not found.')
        if not order.manifest_rows.exists():
            raise CommandError('No manifest rows on this order.')
        if order.items.exists():
            raise CommandError('Order already has items; refusing to duplicate.')
        if not order.uses_legacy_processing:
            self.stdout.write(
                self.style.WARNING(
                    'Order does not have uses_legacy_processing=True; proceeding only if '
                    'you intend to legacy-materialize.',
                ),
            )
        if dry:
            n = order.manifest_rows.count()
            self.stdout.write(f'Dry run: would process {n} manifest rows for PO {order.order_number}.')
            return
        user = order.created_by
        items_created, batches = _build_check_in_queue_from_manifest(order, user)
        order.refresh_from_db()
        self.stdout.write(
            self.style.SUCCESS(
                f'PO {order.order_number}: items_created={items_created}, batch_groups={batches}',
            ),
        )
