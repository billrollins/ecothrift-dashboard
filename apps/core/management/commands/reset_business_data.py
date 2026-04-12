"""
Delete operational / transactional data while preserving users, employees, and vendors.

Does NOT touch: User, auth Group/Permission, EmployeeProfile, ConsigneeProfile, CustomerProfile,
WorkLocation, Department, Vendor, AppSetting, S3File, PrintServerRelease, HR time/sick records.

Run:
  python manage.py reset_business_data
  python manage.py reset_business_data --dry-run
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.consignment.models import (
    ConsignmentAgreement,
    ConsignmentItem,
    ConsignmentPayout,
)
from apps.inventory.models import (
    BatchGroup,
    Category,
    CSVTemplate,
    Item,
    ItemHistory,
    ItemScanHistory,
    Product,
    PurchaseOrder,
    VendorProductRef,
)
from apps.pos.models import (
    BankTransaction,
    Cart,
    CartLine,
    CashDrop,
    Drawer,
    DrawerHandoff,
    HistoricalTransaction,
    Receipt,
    Register,
    RevenueGoal,
    SupplementalDrawer,
    SupplementalTransaction,
)


def _counts_to_delete():
    """Row counts for models this command clears."""
    return {
        'consignment_items': ConsignmentItem.objects.count(),
        'consignment_payouts': ConsignmentPayout.objects.count(),
        'consignment_agreements': ConsignmentAgreement.objects.count(),
        'cart_lines': CartLine.objects.count(),
        'receipts': Receipt.objects.count(),
        'carts': Cart.objects.count(),
        'cash_drops': CashDrop.objects.count(),
        'drawer_handoffs': DrawerHandoff.objects.count(),
        'supplemental_txns': SupplementalTransaction.objects.count(),
        'bank_txns': BankTransaction.objects.count(),
        'revenue_goals': RevenueGoal.objects.count(),
        'historical_transactions': HistoricalTransaction.objects.count(),
        'drawers': Drawer.objects.count(),
        'supplemental_drawers': SupplementalDrawer.objects.count(),
        'registers': Register.objects.count(),
        'item_scans': ItemScanHistory.objects.count(),
        'item_history': ItemHistory.objects.count(),
        'items': Item.objects.count(),
        'batch_groups': BatchGroup.objects.count(),
        'purchase_orders': PurchaseOrder.objects.count(),
        'vendor_product_refs': VendorProductRef.objects.count(),
        'products': Product.objects.count(),
        'categories': Category.objects.count(),
        'csv_templates': CSVTemplate.objects.count(),
    }


class Command(BaseCommand):
    help = (
        'Remove inventory, POS, and consignment data. Keeps users, employees, vendors, '
        'locations, and app settings.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show row counts only; do not delete.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        before = _counts_to_delete()
        total = sum(before.values())

        self.stdout.write(self.style.MIGRATE_HEADING('reset_business_data'))
        for key, n in sorted(before.items()):
            self.stdout.write(f'  {key}: {n}')
        self.stdout.write(self.style.WARNING(f'  TOTAL rows to delete: {total}'))

        if dry_run:
            self.stdout.write(self.style.NOTICE('Dry run - no changes.'))
            return

        if total == 0:
            self.stdout.write(self.style.SUCCESS('Nothing to delete.'))
            return

        with transaction.atomic():
            # Consignment (references inventory.Item)
            ConsignmentItem.objects.all().delete()
            ConsignmentPayout.objects.all().delete()
            ConsignmentAgreement.objects.all().delete()

            # POS — children before parents
            CartLine.objects.all().delete()
            Receipt.objects.all().delete()
            Cart.objects.all().delete()
            CashDrop.objects.all().delete()
            DrawerHandoff.objects.all().delete()
            SupplementalTransaction.objects.all().delete()
            BankTransaction.objects.all().delete()
            RevenueGoal.objects.all().delete()
            HistoricalTransaction.objects.all().delete()
            Drawer.objects.all().delete()
            SupplementalDrawer.objects.all().delete()
            Register.objects.all().delete()

            # Inventory
            ItemScanHistory.objects.all().delete()
            ItemHistory.objects.all().delete()
            Item.objects.all().delete()
            BatchGroup.objects.all().delete()
            # Cascades manifest rows + processing batches
            PurchaseOrder.objects.all().delete()
            VendorProductRef.objects.all().delete()
            Product.objects.all().delete()
            Category.objects.all().delete()
            CSVTemplate.objects.all().delete()

        after = _counts_to_delete()
        remaining = sum(after.values())
        self.stdout.write(self.style.SUCCESS(f'Done. Remaining operational rows: {remaining}'))
