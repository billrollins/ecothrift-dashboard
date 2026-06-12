"""P8 unified add-item model: qty-aware POST /items + workspace Added-row routing + product usage."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import (
    Item,
    ManifestRow,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)


class UnifiedItemCreateBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com', first_name='S', last_name='U', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)

    def _create_item(self, **overrides):
        payload = {
            'title': 'Cordless Drill',
            'brand': 'Acme',
            'category': 'Tools & Garage',
            'price': '19.99',
            'retail_value': '49.99',
            'source': 'purchased',
            'condition': 'good',
            **overrides,
        }
        return self.client.post('/api/inventory/items/', payload, format='json')


class QuantityAwareCreateTests(UnifiedItemCreateBase):
    def test_default_create_still_single_item(self):
        resp = self._create_item()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['created_count'], 1)
        self.assertEqual(len(resp.data['created_items']), 1)
        self.assertEqual(Item.objects.count(), 1)
        item = Item.objects.get()
        self.assertEqual(item.sku, resp.data['sku'])
        self.assertIsNotNone(item.product_id)

    def test_quantity_creates_n_items_sharing_product(self):
        resp = self._create_item(quantity=4)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['created_count'], 4)
        self.assertEqual(len(resp.data['created_items']), 4)
        items = list(Item.objects.all())
        self.assertEqual(len(items), 4)
        self.assertEqual(len({i.product_id for i in items}), 1)
        self.assertEqual(len({i.sku for i in items}), 4)

    def test_quantity_clamped_and_invalid_defaults_to_one(self):
        resp = self._create_item(quantity='not-a-number')
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['created_count'], 1)


class WorkspaceRoutedCreateTests(UnifiedItemCreateBase):
    """POs with a processing workspace get a first-class Added queue row from POST /items."""

    def setUp(self):
        super().setUp()
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-UNIFIED',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        mr = ManifestRow.objects.create(
            purchase_order=self.order, row_number=1, quantity=2,
            title='Manifest line', unit_retail=Decimal('10.00'),
        )
        ProcessingRow.objects.create(
            purchase_order=self.order, manifest_row=mr, row_number=1, quantity=2,
            title='Manifest line', shelf_price=Decimal('4.99'),
        )

    def test_create_on_workspace_po_adds_processing_row(self):
        resp = self._create_item(purchase_order=self.order.id, quantity=3)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['created_count'], 3)

        added = ProcessingRow.objects.filter(
            purchase_order=self.order, row_kind=ProcessingRow.ROW_KIND_ADDED,
        )
        self.assertEqual(added.count(), 1)
        row = added.get()
        self.assertEqual(row.quantity, 3)
        self.assertEqual(len(row.item_ids), 3)
        self.assertEqual(row.queue_status, 'checked_in')

        items = Item.objects.filter(id__in=row.item_ids)
        self.assertEqual(items.count(), 3)
        for item in items:
            self.assertEqual(item.purchase_order_id, self.order.id)
            self.assertEqual(item.status, 'on_shelf')

    def test_create_on_non_workspace_po_skips_added_row(self):
        plain = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-PLAIN',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('50.00'),
            status='processing',
        )
        resp = self._create_item(purchase_order=plain.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertFalse(
            ProcessingRow.objects.filter(purchase_order=plain).exists(),
        )

    def test_workspace_route_reuses_existing_product_by_upc(self):
        existing = Product.objects.create(title='Cordless Drill', brand='Acme', upc='012345678905')
        resp = self._create_item(purchase_order=self.order.id, upc='012345678905')
        self.assertEqual(resp.status_code, 201, resp.data)
        row = ProcessingRow.objects.get(
            purchase_order=self.order, row_kind=ProcessingRow.ROW_KIND_ADDED,
        )
        self.assertEqual(row.matched_product_id, existing.id)


class ProductUsageEndpointTests(UnifiedItemCreateBase):
    def test_usage_counts_items_across_orders(self):
        product = Product.objects.create(title='Widget')
        orders = []
        for n in range(2):
            orders.append(PurchaseOrder.objects.create(
                vendor=self.vendor,
                order_number=f'PO-USE-{n}',
                ordered_date='2026-06-01',
                purchase_cost=Decimal('10.00'),
                retail_value=Decimal('50.00'),
            ))
        for n in range(3):
            Item.objects.create(
                sku=f'SKU-USE-{n}', title='Widget', product=product,
                purchase_order=orders[n % 2], price=Decimal('1.00'),
            )
        # One item with no PO: counted in item_count, not order_count.
        Item.objects.create(sku='SKU-USE-X', title='Widget', product=product, price=Decimal('1.00'))

        resp = self.client.get(f'/api/inventory/products/{product.id}/usage/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['item_count'], 4)
        self.assertEqual(resp.data['order_count'], 2)

    def test_usage_zero_for_unused_product(self):
        product = Product.objects.create(title='Lonely')
        resp = self.client.get(f'/api/inventory/products/{product.id}/usage/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['item_count'], 0)
        self.assertEqual(resp.data['order_count'], 0)
