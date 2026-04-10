"""Create Misfit Items vendor and two placeholder POs for Phase 0 backfill (orphan catch-alls)."""

from datetime import date

from django.core.management.base import BaseCommand

from apps.inventory.models import PurchaseOrder, Vendor


class Command(BaseCommand):
    help = 'Ensure Vendor MIS + PurchaseOrders MISFIT-V1-2024 and MISFIT-V2-2025 exist (idempotent).'

    def handle(self, *args, **options):
        vendor, created = Vendor.objects.get_or_create(
            code='MIS',
            defaults={
                'name': 'The Island of Misfit Items',
                'vendor_type': 'other',
                'is_active': True,
            },
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"Vendor {'created' if created else 'exists'}: {vendor.code} — {vendor.name}"
            )
        )

        po1, c1 = PurchaseOrder.objects.get_or_create(
            order_number='MISFIT-V1-2024',
            defaults={
                'vendor': vendor,
                'status': 'complete',
                'ordered_date': date(2024, 3, 1),
                'purchase_cost': 0,
                'shipping_cost': 0,
                'fees': 0,
                'retail_value': 0,
                'item_count': 0,
                'condition': 'mixed',
                'description': (
                    'Catch-all for V1 historical items that could not be traced to a source '
                    'purchase order. Revenue from these items appears as untracked sales; use '
                    'to adjust profitability estimates upward.'
                ),
                'notes': (
                    'BACKFILL:v1:misfit — Orphaned items from legacy V1 system '
                    '(Mar 2024 - Jul 2025). See data_backfill_initiative.md.'
                ),
            },
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"MISFIT-V1-2024: {'created' if c1 else 'already present'} (ordered_date placeholder 2024-03-01)"
            )
        )

        po2, c2 = PurchaseOrder.objects.get_or_create(
            order_number='MISFIT-V2-2025',
            defaults={
                'vendor': vendor,
                'status': 'complete',
                'ordered_date': date(2025, 8, 1),
                'purchase_cost': 0,
                'shipping_cost': 0,
                'fees': 0,
                'retail_value': 0,
                'item_count': 0,
                'condition': 'mixed',
                'description': (
                    'Catch-all for V2 historical items that could not be traced to a source '
                    'purchase order. Revenue from these items appears as untracked sales; use '
                    'to adjust profitability estimates upward.'
                ),
                'notes': (
                    'BACKFILL:v2:misfit — Orphaned items from V2 system '
                    '(Aug 2025 - Mar 2026). See data_backfill_initiative.md.'
                ),
            },
        )
        self.stdout.write(
            self.style.SUCCESS(
                f"MISFIT-V2-2025: {'created' if c2 else 'already present'} (ordered_date placeholder 2025-08-01)"
            )
        )
