"""ItemCheckIn catalog API for inventory workbench."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Category, Item, ItemCheckIn, Product, PurchaseOrder, Vendor


class ItemCheckInCatalogTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com', first_name='S', last_name='U', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        self.category = Category.objects.create(name='Toys', slug='toys')
        self.product = Product.objects.create(
            title='LEGO Castle',
            brand='LEGO',
            model='70404',
            category=self.category,
        )
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-WB-1',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        self.check_in = ItemCheckIn.objects.create(
            purchase_order=self.order,
            product=self.product,
            quantity=2,
            origin=ItemCheckIn.ORIGIN_PRODUCT_AD_HOC,
            defaults_snapshot={'condition': 'good', 'price': '19.99'},
        )
        self.items = [
            Item.objects.create(
                sku=f'ITM-WB-{i}',
                product=self.product,
                purchase_order=self.order,
                check_in=self.check_in,
                price=Decimal('19.99'),
                status='on_shelf',
                specifications={'color': 'red'} if i == 0 else {'color': 'red'},
                checked_in_at=timezone.now(),
            )
            for i in range(2)
        ]

    def test_list_includes_catalog_fields(self):
        resp = self.client.get('/api/inventory/item-check-ins/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['count'], 1)
        row = resp.data['results'][0]
        self.assertEqual(row['id'], self.check_in.id)
        self.assertEqual(row['product_title'], 'LEGO Castle')
        self.assertEqual(row['purchase_order_number'], 'PO-WB-1')
        self.assertEqual(row['quantity'], 2)
        self.assertEqual(row['item_count'], 2)
        self.assertEqual(row['items'], [])

    def test_retrieve_includes_nested_items(self):
        resp = self.client.get(f'/api/inventory/item-check-ins/{self.check_in.id}/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(resp.data['items']), 2)
        skus = {it['sku'] for it in resp.data['items']}
        self.assertEqual(skus, {it.sku for it in self.items})
        self.assertEqual(resp.data['specifications'], {'color': 'red'})

    def test_update_check_in_specifications_applies_to_items(self):
        resp = self.client.post(
            f'/api/inventory/orders/{self.order.id}/item-check-ins/{self.check_in.id}/update/',
            {
                'product_mode': 'existing',
                'product_id': self.product.id,
                'quantity': 2,
                'purchase_order': self.order.id,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '19.99',
                'specifications': {'size': 'large'},
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        for item in Item.objects.filter(check_in=self.check_in):
            self.assertEqual(item.specifications, {'size': 'large'})

    def test_filter_by_product(self):
        resp = self.client.get(f'/api/inventory/item-check-ins/?product={self.product.id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['count'], 1)

    def test_search_by_item_sku(self):
        resp = self.client.get(f'/api/inventory/item-check-ins/?search={self.items[0].sku}')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['count'], 1)

    def test_filter_by_item_check_in_id(self):
        resp = self.client.get(f'/api/inventory/item-check-ins/?item_check_in={self.check_in.id}')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['count'], 1)

    def test_count_not_item_list_cache(self):
        """ItemCheckIn list must not reuse ItemViewSet total-count cache."""
        other = ItemCheckIn.objects.create(
            purchase_order=self.order,
            product=self.product,
            quantity=1,
            origin=ItemCheckIn.ORIGIN_PRODUCT_AD_HOC,
        )
        resp = self.client.get('/api/inventory/item-check-ins/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['count'], 2)
        resp_filtered = self.client.get(f'/api/inventory/item-check-ins/?product={self.product.id}')
        self.assertEqual(resp_filtered.data['count'], 2)
        ItemCheckIn.objects.filter(pk=other.pk).delete()
