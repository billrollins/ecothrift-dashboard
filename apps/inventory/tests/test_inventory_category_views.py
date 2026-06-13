"""Category-derived inventory views must not query a nonexistent Item.category."""

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Item, ManifestRow, Product, PurchaseOrder, Vendor


class InventoryCategoryViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        self.user = get_user_model().objects.create_user(
            email='cat-views@example.com',
            first_name='Cat',
            last_name='Views',
            password='testpw',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.vendor = Vendor.objects.create(name='Category Vendor', code='CAT-V')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-CAT-VIEWS',
            ordered_date=date(2026, 6, 6),
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('100.00'),
            status='paid',
        )

    def test_store_report_uses_product_and_manifest_category(self):
        product = Product.objects.create(
            title='Product Category Item',
            brand='Generic',
            category='Toys & Games',
        )
        Item.objects.create(
            product=product,
            purchase_order=self.po,
            status='on_shelf',
            price=Decimal('4.99'),
            listed_at=timezone.now() - timedelta(days=10),
        )
        manifest_row = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=1,
            quantity=1,
            description='Manifest Category Item',
            title='Manifest Category Item',
            brand='Generic',
            category='Health & Beauty',
            unit_retail=Decimal('8.99'),
        )
        manifest_product = Product.objects.create(
            title='Manifest Category Item',
            brand='Generic',
        )
        Item.objects.create(
            product=manifest_product,
            purchase_order=self.po,
            manifest_row=manifest_row,
            status='on_shelf',
            price=Decimal('3.99'),
            listed_at=timezone.now() - timedelta(days=10),
        )

        response = self.client.get('/api/inventory/store-report/?stale_days=1')

        self.assertEqual(response.status_code, 200, response.data)
        stale_categories = {row['category'] for row in response.data['stale_items']}
        self.assertIn('Toys & Games', stale_categories)
        self.assertIn('Health & Beauty', stale_categories)
        breakdown = {row['category']: row['count'] for row in response.data['category_breakdown']}
        self.assertEqual(breakdown['Toys & Games'], 1)
        self.assertEqual(breakdown['Health & Beauty'], 1)

    def test_item_stats_category_uses_product_or_manifest_category(self):
        product = Product.objects.create(
            title='Stats Product Category',
            brand='Generic',
            category='Toys & Games',
        )
        Item.objects.create(
            product=product,
            purchase_order=self.po,
            status='on_shelf',
            price=Decimal('4.99'),
        )
        manifest_row = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=2,
            quantity=1,
            description='Stats Manifest Category',
            title='Stats Manifest Category',
            brand='Generic',
            category='Toys & Games',
            unit_retail=Decimal('8.99'),
        )
        manifest_product = Product.objects.create(
            title='Stats Manifest Category',
            brand='Generic',
        )
        Item.objects.create(
            product=manifest_product,
            purchase_order=self.po,
            manifest_row=manifest_row,
            status='on_shelf',
            price=Decimal('3.99'),
        )

        response = self.client.get('/api/inventory/items/stats/?category=Toys%20%26%20Games')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['category']['total'], 2)
