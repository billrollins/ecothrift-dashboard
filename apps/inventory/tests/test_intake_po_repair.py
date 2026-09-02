"""Tests for intake PO repair helpers (316-319 rollout)."""

from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.inventory.models import (
    Item,
    ManifestRow,
    Product,
    ProcessingDataBuild,
    ProcessingRow,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.services.intake_po_repair import (
    compute_manifest_row_count_snapshot,
    classify_processing_stage,
    EXPECTED_INTAKE_POS,
    verify_intake_po,
)


class IntakePoRepairClassificationTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='V', code='VND')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number=EXPECTED_INTAKE_POS[316],
            ordered_date='2026-01-01',
            purchase_cost=Decimal('1'),
            retail_value=Decimal('10'),
            status='delivered',
            delivered_date='2026-01-02',
            preprocess_status='finalized',
            finalized_at=timezone.now(),
            manifest_row_count=5,
        )

    def test_classify_no_bookmarks(self):
        self.assertEqual(classify_processing_stage(self.po), 'no_bookmarks')

    def test_classify_in_flight_with_open_build(self):
        for i in range(3):
            ProcessingRow.objects.create(
                purchase_order=self.po,
                row_number=i + 1,
                quantity=1,
            )
        ProcessingDataBuild.objects.create(
            purchase_order=self.po,
            status=ProcessingDataBuild.STATUS_RUNNING,
            total_rows=3,
            processed_rows=1,
        )
        # Link only one manifest row
        mr = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=1,
            quantity=1,
            title='A',
        )
        pr = ProcessingRow.objects.get(purchase_order=self.po, row_number=1)
        pr.manifest_row = mr
        pr.save(update_fields=['manifest_row'])
        self.assertEqual(classify_processing_stage(self.po), 'in_flight')

    def test_classify_completed_when_build_complete(self):
        for i in range(2):
            ProcessingRow.objects.create(
                purchase_order=self.po,
                row_number=i + 1,
                quantity=1,
            )
        m1 = ManifestRow.objects.create(
            purchase_order=self.po, row_number=1, quantity=1, title='A',
        )
        m2 = ManifestRow.objects.create(
            purchase_order=self.po, row_number=2, quantity=1, title='B',
        )
        for pr, mr in zip(
            ProcessingRow.objects.filter(purchase_order=self.po).order_by('row_number'),
            [m1, m2],
        ):
            pr.manifest_row = mr
            pr.save(update_fields=['manifest_row'])
        ProcessingDataBuild.objects.create(
            purchase_order=self.po,
            status=ProcessingDataBuild.STATUS_COMPLETE,
            completed_at=timezone.now(),
        )
        self.assertEqual(classify_processing_stage(self.po), 'completed')

    def test_classify_completed_without_build_when_all_linked(self):
        for i in range(2):
            ProcessingRow.objects.create(
                purchase_order=self.po,
                row_number=i + 1,
                quantity=1,
            )
        m1 = ManifestRow.objects.create(
            purchase_order=self.po, row_number=1, quantity=1, title='A',
        )
        m2 = ManifestRow.objects.create(
            purchase_order=self.po, row_number=2, quantity=1, title='B',
        )
        for pr, mr in zip(
            ProcessingRow.objects.filter(purchase_order=self.po).order_by('row_number'),
            [m1, m2],
        ):
            pr.manifest_row = mr
            pr.save(update_fields=['manifest_row'])
        self.assertEqual(classify_processing_stage(self.po), 'completed')

    def test_manifest_row_count_snapshot_prefers_max_of_sources(self):
        self.po.manifest_row_count = 10
        preview = {'rows': [{'raw': {}} for _ in range(3)]}
        # No manifest/processing rows yet - should take max(10, 3) = 10
        self.assertEqual(
            compute_manifest_row_count_snapshot(self.po, preview),
            10,
        )

    def test_verify_allows_unmanifested_intake_items_with_terminal_items(self):
        po = PurchaseOrder.objects.create(
            id=317,
            vendor=self.vendor,
            order_number=EXPECTED_INTAKE_POS[317],
            ordered_date='2026-01-01',
            purchase_cost=Decimal('1'),
            retail_value=Decimal('10'),
            status='delivered',
            delivered_date='2026-01-02',
            preprocess_status='finalized',
            finalized_at=timezone.now(),
            receiving_status='done',
            receiving_done_at=timezone.now(),
            processing_status='done',
            processing_done_at=timezone.now(),
            manifest_row_count=1,
            manifest_category_count=None,
        )
        manifest_row = ManifestRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=1,
            title='Manifested item',
        )
        processing_row = ProcessingRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=1,
            manifest_row=manifest_row,
        )
        linked_product = Product.objects.create(title='Linked sold item')
        overage_product = Product.objects.create(title='Unmanifested intake item')
        Item.objects.create(
            sku='LINKED-1',
            product=linked_product,
            purchase_order=po,
            manifest_row=manifest_row,
            status='sold',
        )
        Item.objects.create(
            sku='OVERAGE-1',
            product=overage_product,
            purchase_order=po,
            status='intake',
        )

        self.assertEqual(classify_processing_stage(po), 'completed')
        self.assertEqual(processing_row.manifest_row_id, manifest_row.id)
        self.assertEqual(verify_intake_po(po), [])

    def test_expected_intake_pos_canonical_rollout_mapping(self):
        self.assertDictEqual(
            EXPECTED_INTAKE_POS,
            {
                319: 'TRGET-O2R-1K40',
                318: 'TRGET-O4U-QP68',
                317: 'C5TC0-OM1-A8R3',
                316: 'AMZ0N-OQL-CCP4',
            },
        )
