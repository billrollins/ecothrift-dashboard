"""Tests for intake_test_reset service."""

from __future__ import annotations

import tempfile
from decimal import Decimal
from pathlib import Path
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.test import TestCase, override_settings

from apps.core.models import S3File
from apps.inventory.models import (
    Item,
    ManifestRow,
    Product,
    PreprocessingRow,
    ProcessingRow,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.services.intake_test_reset import (
    DEFAULT_ORDER_NUMBER,
    IntakeTestResetError,
    RESET_STAGE_BEFORE_UPLOAD,
    apply_reset,
    reconstruct_manifest_csv_from_po,
)


# In-memory storage: USE_S3=False alone does NOT reconfigure default_storage, so
# without this the tests write real objects to the S3 bucket.
_TEST_STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


@override_settings(STORAGES=_TEST_STORAGES)
class IntakeTestResetTests(TestCase):
    def setUp(self):
        # Isolate the fixture cache: apply_reset() writes workspace/intake-test-fixtures/
        # as a side effect, which must never clobber (or read) the real cached manifest.
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self._fixture_patch = mock.patch(
            'apps.inventory.services.intake_test_reset.fixture_dir',
            return_value=Path(self._tmp.name),
        )
        self._fixture_patch.start()
        self.addCleanup(self._fixture_patch.stop)

        User = get_user_model()
        self.user = User.objects.create_superuser(
            email='reset@example.com',
            first_name='Reset',
            last_name='Admin',
            password='test-pass',
        )
        self.vendor = Vendor.objects.create(name='Walmart', code='WMT')
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number=DEFAULT_ORDER_NUMBER,
            ordered_date='2026-05-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('1000.00'),
            est_shrink=Decimal('0.10'),
        )

    def _write_fixture(self, text: str) -> Path:
        path = Path(self._tmp.name) / 'WLMRT-OJU-3V74.csv'
        path.write_text(text, encoding='utf-8')
        return path

    def _attach_manifest(self):
        raw = (
            'SKU,Title,Brand\n'
            'ABC123,Widget,Acme\n'
            'DEF456,Gadget,Acme\n'
        ).encode('utf-8')
        key = default_storage.save(
            f'manifests/orders/{self.order.id}/WLMRT-OJU-3V74.csv',
            ContentFile(raw, name='WLMRT-OJU-3V74.csv'),
        )
        s3 = S3File.objects.create(
            key=key,
            filename='WLMRT-OJU-3V74.csv',
            size=len(raw),
            content_type='text/csv',
            uploaded_by=self.user,
        )
        self.order.manifest = s3
        self.order.manifest_filename = s3.filename
        self.order.manifest_row_count = 2
        self.order.save()

    @override_settings(DEBUG=True, USE_S3=False)
    def test_apply_reads_manifest_from_po_and_purges_artifacts(self):
        self._attach_manifest()
        ManifestRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='spine',
        )
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            standard_description='old',
        )
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            quantity=1,
            description='bookmark',
        )
        Item.objects.create(
            purchase_order=self.order,
            sku='ITM0000991',
            product=Product.objects.create(title='t', brand='b'),
            source='purchased',
            status='intake',
        )
        self.order.preprocess_status = 'cleaned'
        self.order.processing_status = 'active'
        self.order.save()

        summary = apply_reset()

        self.order.refresh_from_db()
        self.assertEqual(self.order.preprocess_status, 'not_started')
        self.assertEqual(self.order.processing_status, 'not_started')
        self.assertEqual(self.order.manifest_row_count, 2)
        self.assertIsNotNone(self.order.manifest_id)
        self.assertEqual(ManifestRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(PreprocessingRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(ProcessingRow.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(Item.objects.filter(purchase_order=self.order).count(), 0)
        self.assertEqual(summary['manifest_source'], 'purchase_order_manifest')

    @override_settings(DEBUG=True, USE_S3=False)
    def test_reconstruct_manifest_from_staging_when_storage_missing(self):
        self._attach_manifest()
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            raw_row={'SKU': 'ABC123', 'Title': 'Widget', 'Brand': 'Acme'},
        )
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=2,
            raw_row={'SKU': 'DEF456', 'Title': 'Gadget', 'Brand': 'Acme'},
        )
        self.order.manifest_headers = ['SKU', 'Title', 'Brand']
        self.order.manifest_filename = 'WLMRT-OJU-3V74.csv'
        self.order.save()

        rebuilt = reconstruct_manifest_csv_from_po(self.order)
        self.assertIsNotNone(rebuilt)
        raw, filename = rebuilt
        self.assertIn(b'ABC123', raw)
        self.assertEqual(filename, 'WLMRT-OJU-3V74.csv')

    @override_settings(DEBUG=True, USE_S3=False)
    def test_apply_rebuilds_from_staging_when_storage_missing(self):
        self._attach_manifest()
        PreprocessingRow.objects.create(
            purchase_order=self.order,
            row_number=1,
            raw_row={'SKU': 'ABC123', 'Title': 'Widget', 'Brand': 'Acme'},
        )
        self.order.manifest_headers = ['SKU', 'Title', 'Brand']
        self.order.manifest_filename = 'WLMRT-OJU-3V74.csv'
        self.order.save()

        # Simulate missing blob (DB row remains).
        from django.core.files.storage import default_storage
        default_storage.delete(self.order.manifest.key)

        summary = apply_reset()
        self.assertEqual(summary['manifest_source'], 'reconstructed_from_staging_raw_row')
        self.order.refresh_from_db()
        self.assertEqual(self.order.manifest_row_count, 1)

    @override_settings(DEBUG=True, USE_S3=False)
    def test_before_upload_clears_manifest(self):
        self._attach_manifest()
        summary = apply_reset(stage=RESET_STAGE_BEFORE_UPLOAD)

        self.order.refresh_from_db()
        self.assertIsNone(self.order.manifest_id)
        self.assertEqual(self.order.preprocess_status, 'not_started')
        self.assertIsNone(summary['upload'])

    @override_settings(DEBUG=True, USE_S3=False)
    def test_fixture_rejected_when_cleanup_export_format(self):
        """A download-cleanup-csv export must never be uploaded as a vendor manifest."""
        self._attach_manifest()
        default_storage.delete(self.order.manifest.key)  # no blob, no staging → fixture path
        self._write_fixture(
            'row_id,row_number,quantity,unit_retail,base_cost,ideal_price,description\n'
            '101,1,1,20.00,9.00,18.00,Widget\n'
            '102,2,1,10.00,4.50,9.00,Gadget\n',
        )
        with self.assertRaises(IntakeTestResetError) as ctx:
            apply_reset()
        self.assertIn('cleanup-CSV export', str(ctx.exception))

    @override_settings(DEBUG=True, USE_S3=False)
    def test_fixture_rejected_on_row_count_mismatch(self):
        """A stale/poisoned fixture (wrong row count vs PO) is refused, not uploaded."""
        self._attach_manifest()  # sets manifest_row_count=2
        default_storage.delete(self.order.manifest.key)
        self._write_fixture('SKU,Title,Brand\nONLY1,Widget,Acme\n')
        with self.assertRaises(IntakeTestResetError) as ctx:
            apply_reset()
        self.assertIn('refusing stale/poisoned fixture', str(ctx.exception))

    @override_settings(DEBUG=True, USE_S3=False)
    def test_valid_fixture_used_when_storage_and_staging_missing(self):
        self._attach_manifest()
        default_storage.delete(self.order.manifest.key)
        self._write_fixture(
            'SKU,Title,Brand\n'
            'ABC123,Widget,Acme\n'
            'DEF456,Gadget,Acme\n',
        )
        summary = apply_reset()
        self.assertTrue(str(summary['manifest_source']).startswith('fixture:'))
        self.order.refresh_from_db()
        self.assertEqual(self.order.manifest_row_count, 2)
