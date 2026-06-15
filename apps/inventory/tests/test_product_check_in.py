"""Product-first check-in from catalog product + item list filters for post-check-in navigation."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES
from apps.inventory.models import (
    Category,
    Item,
    ItemCheckIn,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)


class ProductCheckInBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.misfit_vendor = Vendor.objects.create(name='Misfit', code='MIS')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com', first_name='S', last_name='U', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name='Tools & Garage', slug='tools-garage')
        self.product = Product.objects.create(
            title='Cordless Drill',
            brand='Acme',
            model='X1',
            category=self.category,
        )
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-CHECKIN',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        self.misfit_order = PurchaseOrder.objects.create(
            vendor=self.misfit_vendor,
            order_number='MISFIT-V2-2025',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('0.00'),
            retail_value=Decimal('0.00'),
            status='complete',
        )

    def _check_in(self, product=None, **overrides):
        pid = (product or self.product).pk
        payload = {
            'quantity': 2,
            'purchase_order': self.order.id,
            'price': '19.99',
            'retail': '49.99',
            'condition': 'good',
            'dispatch': 'on_shelf',
            'notes': 'Shelf restock',
            **overrides,
        }
        return self.client.post(f'/api/inventory/products/{pid}/check-in/', payload, format='json')


class ProductCheckInEndpointTests(ProductCheckInBase):
    def test_creates_on_shelf_items_linked_to_product(self):
        resp = self._check_in()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['created_count'], 2)
        self.assertEqual(len(resp.data['created_item_ids']), 2)
        items = Item.objects.filter(id__in=resp.data['created_item_ids'])
        self.assertEqual(items.count(), 2)
        for item in items:
            self.assertEqual(item.product_id, self.product.id)
            self.assertEqual(item.purchase_order_id, self.order.id)
            self.assertEqual(item.status, 'on_shelf')
            self.assertIsNotNone(item.checked_in_at)

    def test_product_identity_not_edited_by_payload(self):
        resp = self._check_in(title='Hacked title', brand='Evil', model='ZZ')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.product.refresh_from_db()
        self.assertEqual(self.product.title, 'Cordless Drill')
        self.assertEqual(self.product.brand, 'Acme')
        self.assertEqual(self.product.model, 'X1')

    def test_assigns_purchase_order_and_cost(self):
        resp = self._check_in(retail='100.00')
        self.assertEqual(resp.status_code, 201, resp.data)
        item = Item.objects.get(pk=resp.data['created_item_ids'][0])
        self.assertEqual(item.purchase_order_id, self.order.id)
        self.assertEqual(item.retail, Decimal('100.00'))
        self.assertIsNotNone(item.cost)

    def test_records_processing_row_and_item_check_in(self):
        resp = self._check_in(quantity=3)
        self.assertEqual(resp.status_code, 201, resp.data)
        row = ProcessingRow.objects.get(pk=resp.data['processing_row_id'])
        self.assertEqual(row.row_kind, ProcessingRow.ROW_KIND_ADDED)
        self.assertEqual(row.matched_product_id, self.product.id)
        self.assertEqual(row.quantity, 3)
        self.assertEqual(len(row.item_ids), 3)
        check_in = ItemCheckIn.objects.get(pk=resp.data['item_check_in_id'])
        self.assertEqual(check_in.processing_row_id, row.pk)
        self.assertEqual(check_in.product_id, self.product.id)
        self.assertEqual(check_in.quantity, 3)
        for item in Item.objects.filter(pk__in=resp.data['created_item_ids']):
            self.assertEqual(item.check_in_id, check_in.pk)

    def test_item_check_in_membership_via_fk(self):
        resp = self._check_in(quantity=2)
        self.assertEqual(resp.status_code, 201, resp.data)
        check_in = ItemCheckIn.objects.get(pk=resp.data['item_check_in_id'])
        fk_ids = sorted(check_in.items.values_list('pk', flat=True))
        self.assertEqual(fk_ids, sorted(resp.data['created_item_ids']))
        self.assertEqual(check_in.quantity, len(fk_ids))

    def test_requires_purchase_order(self):
        resp = self._check_in(purchase_order='')
        self.assertEqual(resp.status_code, 400, resp.data)


class ProductCheckInOrdersEndpointTests(ProductCheckInBase):
    def test_lists_misfit_default_first(self):
        ProcessingRow.objects.create(
            purchase_order=self.order,
            row_kind=ProcessingRow.ROW_KIND_ADDED,
            row_number=1,
            quantity=1,
            item_ids=[],
            title='Added row',
        )
        resp = self.client.get('/api/inventory/products/check-in-orders/')
        self.assertEqual(resp.status_code, 200, resp.data)
        orders = resp.data['orders']
        self.assertTrue(orders)
        self.assertTrue(orders[0]['is_default'])
        self.assertEqual(orders[0]['id'], self.misfit_order.id)


class ItemListFilterSortTests(ProductCheckInBase):
    def setUp(self):
        super().setUp()
        now = timezone.now()
        self.item_old = Item.objects.create(
            sku='ITM0000001',
            product=self.product,
            purchase_order=self.order,
            price=Decimal('5.00'),
            checked_in_at=now - timezone.timedelta(days=2),
        )
        self.item_new = Item.objects.create(
            sku='ITM0000002',
            product=self.product,
            purchase_order=self.order,
            price=Decimal('6.00'),
            checked_in_at=now,
        )
        other_product = Product.objects.create(title='Other')
        self.other_item = Item.objects.create(
            sku='ITM0000003',
            product=other_product,
            price=Decimal('7.00'),
            status='sold',
        )

    def test_filters_by_item_check_in(self):
        resp = self._check_in(quantity=2)
        self.assertEqual(resp.status_code, 201, resp.data)
        check_in_id = resp.data['item_check_in_id']
        self.assertIsNotNone(check_in_id)
        list_resp = self.client.get(f'/api/inventory/items/?item_check_in={check_in_id}')
        self.assertEqual(list_resp.status_code, 200, list_resp.data)
        ids = {row['id'] for row in list_resp.data['results']}
        self.assertEqual(ids, set(resp.data['created_item_ids']))

    def test_filters_by_ids(self):
        resp = self.client.get(
            f'/api/inventory/items/?ids={self.item_old.id},{self.item_new.id}',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {row['id'] for row in resp.data['results']}
        self.assertEqual(ids, {self.item_old.id, self.item_new.id})

    def test_filters_by_product_and_status(self):
        self.item_new.status = 'on_shelf'
        self.item_new.save(update_fields=['status'])
        resp = self.client.get(
            f'/api/inventory/items/?product={self.product.id}&status=on_shelf',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {row['id'] for row in resp.data['results']}
        self.assertIn(self.item_new.id, ids)
        self.assertNotIn(self.other_item.id, ids)

    def test_list_includes_item_check_in_id(self):
        resp = self._check_in(quantity=2)
        self.assertEqual(resp.status_code, 201, resp.data)
        check_in_id = resp.data['item_check_in_id']
        item_id = resp.data['created_item_ids'][0]
        list_resp = self.client.get(f'/api/inventory/items/?ids={item_id}')
        self.assertEqual(list_resp.status_code, 200, list_resp.data)
        row = list_resp.data['results'][0]
        self.assertEqual(row['item_check_in_id'], check_in_id)

    def test_default_ordering_checked_in_desc(self):
        resp = self.client.get(
            f'/api/inventory/items/?ids={self.item_old.id},{self.item_new.id}',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = [row['id'] for row in resp.data['results']]
        self.assertEqual(ids[0], self.item_new.id)
        self.assertEqual(ids[1], self.item_old.id)


class ItemCheckInNormalizationTests(ProductCheckInBase):
    """FK check-in membership and staging-row purge behavior."""

    def test_filters_items_by_item_check_in_fk(self):
        resp = self._check_in(quantity=2)
        self.assertEqual(resp.status_code, 201, resp.data)
        check_in = ItemCheckIn.objects.get(pk=resp.data['item_check_in_id'])
        items = list(check_in.items.all())
        self.assertEqual(len(items), 2)
        for item in items:
            self.assertEqual(item.check_in_id, check_in.pk)
        list_resp = self.client.get(f'/api/inventory/items/?item_check_in={check_in.pk}')
        self.assertEqual(list_resp.status_code, 200, list_resp.data)
        self.assertEqual(
            {row['id'] for row in list_resp.data['results']},
            {i.pk for i in items},
        )

    def test_processing_row_purge_leaves_check_in_intact(self):
        resp = self._check_in(quantity=2)
        self.assertEqual(resp.status_code, 201, resp.data)
        check_in_id = resp.data['item_check_in_id']
        row_id = resp.data['processing_row_id']
        check_in = ItemCheckIn.objects.get(pk=check_in_id)
        ProcessingRow.objects.filter(pk=row_id).delete()
        check_in.refresh_from_db()
        self.assertIsNone(check_in.processing_row_id)
        self.assertEqual(check_in.items.count(), 2)
        for item in check_in.items.all():
            self.assertEqual(item.check_in_id, check_in.pk)


class ProductListExactFilterTests(ProductCheckInBase):
    def test_filters_by_exact_product_id(self):
        other = Product.objects.create(title='Other exact filter product')
        resp = self.client.get(f'/api/inventory/products/?product={self.product.id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {row['id'] for row in resp.data['results']}
        self.assertEqual(ids, {self.product.id})
        self.assertNotIn(other.id, ids)

    def test_filters_by_category_id(self):
        resp = self.client.get(f'/api/inventory/products/?category={self.category.id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {row['id'] for row in resp.data['results']}
        self.assertIn(self.product.id, ids)


class VendorListExactFilterTests(ProductCheckInBase):
    def test_filters_by_exact_vendor_id(self):
        resp = self.client.get(f'/api/inventory/vendors/?vendor={self.vendor.id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {row['id'] for row in resp.data['results']}
        self.assertEqual(ids, {self.vendor.id})


class PurchaseOrderListExactFilterTests(ProductCheckInBase):
    def setUp(self):
        super().setUp()
        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        self.dashboard_vendor = Vendor.objects.create(name=dash_name, code='DASH')
        self.dashboard_order = PurchaseOrder.objects.create(
            vendor=self.dashboard_vendor,
            order_number='PO-DASH-FILTER',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )

    def test_filters_by_exact_order_id(self):
        resp = self.client.get(f'/api/inventory/orders/?order={self.dashboard_order.id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        ids = {row['id'] for row in resp.data['results']}
        self.assertIn(self.dashboard_order.id, ids)
        self.assertNotIn(self.misfit_order.id, ids)
