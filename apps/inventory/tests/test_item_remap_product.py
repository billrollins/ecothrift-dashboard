"""Single-item product correction (check-in mistake fix)."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Item, ItemCheckIn, ItemHistory, Product, PurchaseOrder, Vendor


class ItemRemapProductTests(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com', first_name='S', last_name='U', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)

        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-REMAP',
            ordered_date='2026-06-01',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('100.00'),
            status='processing',
        )
        self.product_a = Product.objects.create(title='Product A', brand='Brand')
        self.product_b = Product.objects.create(title='Product B', brand='Brand')
        self.check_in = ItemCheckIn.objects.create(
            purchase_order=self.order,
            product=self.product_a,
            quantity=2,
        )
        self.item_one = Item.objects.create(
            purchase_order=self.order,
            product=self.product_a,
            check_in=self.check_in,
            price=Decimal('9.99'),
            status='on_shelf',
            condition='good',
            location='on_shelf',
        )
        self.item_two = Item.objects.create(
            purchase_order=self.order,
            product=self.product_a,
            check_in=self.check_in,
            price=Decimal('9.99'),
            status='on_shelf',
            condition='good',
            location='on_shelf',
        )

    def test_remap_single_item_leaves_sibling_and_updates_mixed_check_in(self):
        resp = self.client.post(
            f'/api/inventory/items/{self.item_one.id}/remap-product/',
            {'product_mode': 'existing', 'product_id': self.product_b.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['product_id'], self.product_b.id)
        self.assertTrue(resp.data['changed'])

        self.item_one.refresh_from_db()
        self.item_two.refresh_from_db()
        self.check_in.refresh_from_db()

        self.assertEqual(self.item_one.product_id, self.product_b.id)
        self.assertEqual(self.item_two.product_id, self.product_a.id)
        self.assertEqual(self.check_in.product_id, self.product_a.id)

        history = ItemHistory.objects.filter(item=self.item_one).order_by('-id').first()
        self.assertIsNotNone(history)
        self.assertIn('check-in correction', history.note.lower())

    def test_remap_last_sibling_syncs_check_in_product(self):
        self.item_two.product = self.product_b
        self.item_two.save(update_fields=['product', 'updated_at'])

        resp = self.client.post(
            f'/api/inventory/items/{self.item_one.id}/remap-product/',
            {'product_mode': 'existing', 'product_id': self.product_b.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)

        self.check_in.refresh_from_db()
        self.assertEqual(self.check_in.product_id, self.product_b.id)

    def test_remap_sold_item_rejected(self):
        self.item_one.status = 'sold'
        self.item_one.save(update_fields=['status', 'updated_at'])
        resp = self.client.post(
            f'/api/inventory/items/{self.item_one.id}/remap-product/',
            {'product_mode': 'existing', 'product_id': self.product_b.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
