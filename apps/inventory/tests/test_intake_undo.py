"""Tests for apps.inventory.services.intake_undo."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase

from apps.core.models import S3File
from apps.inventory.models import (
    Item,
    ManifestRow,
    PreprocessingRow,
    ProcessingRow,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.services.intake_undo import (
    UndoNotAllowed,
    apply_undo,
    compute_undo_preview,
)


class IntakeUndoTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='V', code='V1')
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-UNDO-1',
            ordered_date='2026-05-01',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('100.00'),
            est_shrink=Decimal('0.10'),
        )

    def _prep_with_rows(self):
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            standard_description='S1',
            ai_title='A1',
            final_title='F1',
            unit_retail=Decimal('5.00'),
            proposed_price=Decimal('3.00'),
        )
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            standard_description='S2',
        )
        self.order.preprocess_status = 'finalized'
        self.order.standardized_at = self.order.updated_at
        self.order.ai_cleaned_at = self.order.updated_at
        self.order.finalized_at = self.order.updated_at
        self.order.save()

    def test_preview_invalid_stage(self):
        prev = compute_undo_preview(self.order, 'nope')
        self.assertFalse(prev['safe'])
        self.assertIn('Invalid', prev['blocked_reason'] or '')

    def test_manifest_upload_blocked_without_file(self):
        prev = compute_undo_preview(self.order, 'manifest_upload')
        self.assertFalse(prev['safe'])

    @patch('django.core.files.storage.default_storage.delete')
    def test_manifest_upload_apply(self, mock_delete):
        s3 = S3File.objects.create(key='manifests/x.csv', filename='x.csv')
        self.order.manifest = s3
        self.order.manifest_filename = 'x.csv'
        self.order.preprocess_status = 'standardized'
        self.order.save()
        self._prep_with_rows()
        prev = compute_undo_preview(self.order, 'manifest_upload')
        self.assertTrue(prev['safe'])
        apply_undo(self.order, 'manifest_upload')
        self.order.refresh_from_db()
        self.assertIsNone(self.order.manifest_id)
        self.assertEqual(self.order.preprocess_status, 'not_started')
        self.assertFalse(PreprocessingRow.objects.filter(purchase_order=self.order).exists())
        mock_delete.assert_called_once()

    def test_standardize_blocked_with_manifest_rows(self):
        self._prep_with_rows()
        ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='legacy',
        )
        prev = compute_undo_preview(self.order, 'standardize')
        self.assertFalse(prev['safe'])

    def test_standardize_apply_clears_layers(self):
        self._prep_with_rows()
        prev = compute_undo_preview(self.order, 'standardize')
        self.assertTrue(prev['safe'])
        apply_undo(self.order, 'standardize')
        self.order.refresh_from_db()
        self.assertEqual(self.order.preprocess_status, 'not_started')
        r = PreprocessingRow.objects.get(purchase_order=self.order, row_number=1)
        self.assertEqual(r.standard_description, '')
        self.assertEqual(r.ai_title, '')
        self.assertIsNone(r.final_title)
        self.assertIsNone(r.proposed_price)

    def test_finalize_blocked_with_items(self):
        self._prep_with_rows()
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='bk',
        )
        Item.objects.create(
            purchase_order=self.order,
            sku='ITM0000991',
            title='t',
            brand='b',
            source='purchased',
            status='intake',
        )
        prev = compute_undo_preview(self.order, 'finalize')
        self.assertFalse(prev['safe'])

    def test_finalize_apply_deletes_bookmarks(self):
        self._prep_with_rows()
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='bk',
        )
        prev = compute_undo_preview(self.order, 'finalize')
        self.assertTrue(prev['safe'])
        apply_undo(self.order, 'finalize')
        self.order.refresh_from_db()
        self.assertEqual(self.order.preprocess_status, 'cleaned')
        self.assertIsNone(self.order.finalized_at)
        self.assertEqual(ProcessingRow.objects.filter(purchase_order=self.order).count(), 0)
        r = PreprocessingRow.objects.get(purchase_order=self.order, row_number=1)
        self.assertIsNone(r.final_title)

    def test_ai_cleanup_apply(self):
        self._prep_with_rows()
        prev = compute_undo_preview(self.order, 'ai_cleanup')
        self.assertTrue(prev['safe'])
        apply_undo(self.order, 'ai_cleanup')
        self.order.refresh_from_db()
        self.assertEqual(self.order.preprocess_status, 'standardized')
        r = PreprocessingRow.objects.get(purchase_order=self.order, row_number=1)
        self.assertEqual(r.ai_title, '')

    def test_apply_raises_when_unsafe(self):
        prev = compute_undo_preview(self.order, 'manifest_upload')
        self.assertFalse(prev['safe'])
        with self.assertRaises(UndoNotAllowed):
            apply_undo(self.order, 'manifest_upload')

    def test_undo_preview_blocked_for_legacy_processing_flag(self):
        self.order.uses_legacy_processing = True
        self.order.save(update_fields=['uses_legacy_processing'])
        prev = compute_undo_preview(self.order, 'standardize')
        self.assertFalse(prev['safe'])
        self.assertIn('legacy', (prev.get('blocked_reason') or '').lower())
