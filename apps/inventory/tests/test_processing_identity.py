"""P3 identity coalescing: workspace list/detail, search tokens, denorm timing.

Design: `.ai/reference/product_identity/session_5_questions.md` (Fable 5 corrected).
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import ManifestRow, ProcessingRow, Product, PurchaseOrder, Vendor
from apps.inventory.services.processing_workspace import (
    build_processing_row_detail,
    build_processing_workspace,
    coalesce_processing_row_identity,
    refresh_processing_rows_denorm,
)


class ProcessingIdentityTestBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com',
            first_name='Staff',
            last_name='User',
            password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)


class CoalesceHelperTests(ProcessingIdentityTestBase):
    def test_product_wins_over_row_and_manifest(self):
        product = Product.objects.create(title='Red Headband', brand='Acme', upc='111')
        mr = ManifestRow(
            title='hdbnd red',
            brand='VendorBrand',
            identifiers={'upc': '222'},
        )
        row = ProcessingRow(title='row title', brand='RowBrand', identifiers={'upc': '333'})
        identity = coalesce_processing_row_identity(row, product, manifest_row=mr)
        self.assertEqual(identity['title'], 'Red Headband')
        self.assertEqual(identity['brand'], 'Acme')
        self.assertEqual(identity['identifiers']['upc'], '111')


class WorkspaceListDetailTests(ProcessingIdentityTestBase):
    def _order_with_matched_row(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-IDENT-1',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product = Product.objects.create(title='Red Headband', brand='Acme', upc='012345678905')
        mr = ManifestRow.objects.create(
            purchase_order=order,
            row_number=1,
            quantity=1,
            title='hdbnd red',
            brand='Vendor',
            unit_retail=Decimal('20.00'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            manifest_row=mr,
            row_number=1,
            quantity=1,
            title='hdbnd red',
            brand='Vendor',
            matched_product=product,
            unit_retail=Decimal('20.00'),
            shelf_price=Decimal('4.99'),
        )
        refresh_processing_rows_denorm(order, processing_row_ids=[pr.pk])
        return order, product, mr, pr

    def test_list_shows_coalesced_product_title(self):
        order, product, _mr, _pr = self._order_with_matched_row()
        payload = build_processing_workspace(order, limit=10)
        self.assertEqual(len(payload['rows']), 1)
        row = payload['rows'][0]
        self.assertEqual(row['title'], 'Red Headband')
        self.assertEqual(row['brand'], 'Acme')
        self.assertEqual(row['productId'], product.id)
        self.assertEqual(row['product']['title'], 'Red Headband')

    def test_detail_coalesces_and_includes_manifest_evidence(self):
        order, product, mr, pr = self._order_with_matched_row()
        payload = build_processing_row_detail(order, processing_row_id=pr.pk)
        row = payload['row']
        self.assertEqual(row['title'], 'Red Headband')
        self.assertEqual(row['productId'], product.id)
        evidence = row.get('manifestEvidence')
        self.assertIsNotNone(evidence)
        self.assertEqual(evidence['title'], 'hdbnd red')
        self.assertEqual(evidence['brand'], 'Vendor')

    def test_api_list_returns_coalesced_title(self):
        order, _product, _mr, _pr = self._order_with_matched_row()
        resp = self.client.get(f'/api/inventory/orders/{order.id}/processing-workspace/')
        self.assertEqual(resp.status_code, 200)
        row = resp.data['rows'][0]
        self.assertEqual(row['title'], 'Red Headband')


class SearchStringIdentityTests(ProcessingIdentityTestBase):
    def test_search_string_keeps_row_and_product_tokens(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-SEARCH-1',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product = Product.objects.create(title='Catalog Product Name')
        mr = ManifestRow.objects.create(
            purchase_order=order,
            row_number=1,
            quantity=1,
            title='Manifest Title',
        )
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            manifest_row=mr,
            row_number=1,
            quantity=1,
            title='Manifest Title',
            matched_product=product,
        )
        refresh_processing_rows_denorm(order, processing_row_ids=[pr.pk])
        pr.refresh_from_db()
        search = pr.search_string.lower()
        self.assertIn('manifest title', search)
        self.assertIn('catalog product name', search)

    def test_denorm_backfill_includes_product_tokens_same_pass(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-DENORM-1',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product = Product.objects.create(title='Legacy Catalog Widget')
        mr = ManifestRow.objects.create(
            purchase_order=order,
            row_number=1,
            quantity=1,
            title='manifest only',
            matched_product=product,
        )
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            manifest_row=mr,
            row_number=1,
            quantity=1,
            title='manifest only',
            matched_product=None,
        )
        refresh_processing_rows_denorm(order, processing_row_ids=[pr.pk])
        pr.refresh_from_db()
        self.assertIsNone(pr.matched_product_id)
        search = pr.search_string.lower()
        self.assertIn('manifest only', search)
        self.assertNotIn('legacy catalog widget', search)

        pr.matched_product = product
        pr.save(update_fields=['matched_product', 'updated_at'])
        refresh_processing_rows_denorm(order, processing_row_ids=[pr.pk])
        pr.refresh_from_db()
        search = pr.search_string.lower()
        self.assertIn('legacy catalog widget', search)
        self.assertIn('manifest only', search)


class CheckInManifestWriteTests(ProcessingIdentityTestBase):
    def test_check_in_does_not_write_manifest_matched_product(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-NO-MR-WRITE',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product = Product.objects.create(title='Matched Product')
        mr = ManifestRow.objects.create(
            purchase_order=order,
            row_number=1,
            quantity=2,
            title='Line item',
            unit_retail=Decimal('10.00'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            manifest_row=mr,
            row_number=1,
            quantity=2,
            title='Line item',
            matched_product=product,
            unit_retail=Decimal('10.00'),
            shelf_price=Decimal('5.00'),
        )
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '5.00',
                'product_mode': 'keep',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        mr.refresh_from_db()
        pr.refresh_from_db()
        self.assertIsNone(mr.matched_product_id)
        self.assertEqual(pr.matched_product_id, product.id)
        from apps.inventory.models import Item

        item = Item.objects.filter(manifest_row=mr).first()
        self.assertIsNotNone(item)
        self.assertEqual(item.product_id, product.id)
