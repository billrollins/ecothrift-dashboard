"""Denormalized manifest metadata, detail-surface endpoint, PATCH guardrails."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.inventory.models import Item, PurchaseOrder, Vendor
from apps.inventory.views import header_signature

User = get_user_model()


@override_settings(DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage')
class PurchaseOrderManifestMetaSurfaceTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='po-meta-surface@test.example',
            first_name='Test',
            last_name='Meta',
            password='testpw',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.vendor = Vendor.objects.create(name='MetaVendor', code='MV-META')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-META-DEMO',
            ordered_date='2025-06-01',
            description='manifest meta probe',
            status='ordered',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('30.00'),
            item_count=0,
        )
        self.po.refresh_cached_vendor_fields()
        self.po.manifest_row_count = 0
        self.po.save(
            update_fields=['vendor_name_cache', 'vendor_code_cache', 'search_text', 'manifest_row_count'],
        )

    def test_detail_surface_num_queries_are_low(self):
        """GET detail-surface must stay hot-path cheap (typically 2 ORM queries: auth user + PO row).

        Middleware can add extras in some setups; tighten if infra changes.
        """
        with self.assertNumQueries(2):
            r = self.client.get(f'/api/inventory/orders/{self.po.pk}/detail-surface/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertNotIn('manifest_preview', r.data)
        self.assertNotIn('processing_stats', r.data)
        self.assertIn('has_manifest', r.data)
        self.assertFalse(r.data['has_manifest'])

    def test_retrieve_num_queries_are_low(self):
        """GET retrieve must not run multi-Count annotations on items."""
        with self.assertNumQueries(2):
            r = self.client.get(f'/api/inventory/orders/{self.po.pk}/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertNotIn('processing_stats', r.data)

    def test_patch_description_returns_surface_shape(self):
        r = self.client.patch(
            f'/api/inventory/orders/{self.po.pk}/',
            {'description': 'updated desc'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['description'], 'updated desc')
        self.assertNotIn('processing_stats', r.data)
        self.assertNotIn('manifest_preview', r.data)
        self.assertIn('has_manifest', r.data)

    def test_patch_num_queries_bounded_with_many_items(self):
        """PATCH hot path: one PO row read/write, no item status Count annotations."""
        for i in range(60):
            Item.objects.create(
                sku=f'ITM-PATCH-{i:03d}',
                title=f'item {i}',
                purchase_order=self.po,
                status='intake' if i % 2 == 0 else 'processing',
            )
        with self.assertNumQueries(6):
            r = self.client.patch(
                f'/api/inventory/orders/{self.po.pk}/',
                {'notes': 'batch notes'},
                format='json',
            )
        self.assertEqual(r.status_code, 200, r.data)

    def test_processing_stats_endpoint_bounded_queries(self):
        Item.objects.create(
            sku='ITM-STAT-01',
            title='one',
            purchase_order=self.po,
            status='on_shelf',
        )
        with self.assertNumQueries(4):
            r = self.client.get(f'/api/inventory/orders/{self.po.pk}/processing-stats/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('item_status_counts', r.data)
        self.assertEqual(r.data['item_status_counts']['on_shelf'], 1)

    def test_patch_rejects_manifest_meta_fields(self):
        r = self.client.patch(
            f'/api/inventory/orders/{self.po.pk}/',
            {'manifest_filename': 'x.csv', 'manifest_row_count': 9},
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn('manifest_filename', r.data)
        self.assertIn('manifest_row_count', r.data)

        r2 = self.client.patch(
            f'/api/inventory/orders/{self.po.pk}/',
            {'manifest_signature': 'abc', 'manifest_headers': ['a']},
            format='json',
        )
        self.assertEqual(r2.status_code, 400, r2.data)
        self.assertIn('manifest_signature', r2.data)
        self.assertIn('manifest_headers', r2.data)

    def test_upload_and_remove_round_trip_surface_shape(self):
        csv_body = 'Category,SKU\nA,1\nB,2\nA,3\n'
        upload = self.client.post(
            f'/api/inventory/orders/{self.po.pk}/upload-manifest/',
            {'file': SimpleUploadedFile('meta.csv', csv_body.encode('utf-8'), content_type='text/csv')},
            format='multipart',
        )
        self.assertEqual(upload.status_code, 200, upload.data)
        self.assertEqual(upload.data.get('manifest_filename'), 'meta.csv')
        self.assertEqual(upload.data.get('manifest_row_count'), 3)
        self.assertEqual(upload.data.get('manifest_category_count'), 2)
        self.assertTrue(upload.data.get('has_manifest'))
        exp_sig = header_signature(['Category', 'SKU'])
        self.assertEqual(upload.data.get('manifest_signature'), exp_sig)
        self.assertEqual(upload.data.get('manifest_headers'), ['Category', 'SKU'])

        self.po.refresh_from_db()
        self.assertEqual(self.po.manifest_row_count, 3)
        self.assertEqual(self.po.manifest_category_count, 2)
        self.assertEqual(self.po.manifest_signature, exp_sig)
        preview = self.po.manifest_preview or {}
        self.assertEqual(set(preview.keys()), {'headers', 'delimiter', 'rows'})
        self.assertEqual(preview['headers'], ['Category', 'SKU'])

        removed = self.client.post(
            f'/api/inventory/orders/{self.po.pk}/remove-manifest/',
            {},
            format='json',
        )
        self.assertEqual(removed.status_code, 200, removed.data)
        self.assertIsNone(removed.data.get('manifest_filename'))
        self.assertIsNone(removed.data.get('manifest_uploaded_at'))
        self.assertIsNone(removed.data.get('manifest_row_count'))
        self.assertIsNone(removed.data.get('manifest_category_count'))
        self.assertFalse(removed.data.get('has_manifest'))
        self.po.refresh_from_db()
        self.assertEqual(self.po.preprocess_status, 'not_started')
        self.assertIsNone(self.po.template_id)
        self.assertFalse(self.po.manifest_signature)
        self.assertIsNone(self.po.manifest_headers)
