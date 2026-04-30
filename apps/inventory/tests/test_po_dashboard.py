"""Purchase order list search cache and /orders/summary aggregates."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import PurchaseOrder, Vendor

User = get_user_model()


class PurchaseOrderSearchAndSummaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='po-dash@example.com',
            first_name='Dash',
            last_name='Tester',
            password='testpw',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.v1 = Vendor.objects.create(name='Walmart', code='WM-DASH')
        self.v2 = Vendor.objects.create(name='Target', code='TG-DASH')
        self.po1 = PurchaseOrder.objects.create(
            vendor=self.v1,
            order_number='PO-DASH-A1',
            ordered_date='2025-06-01',
            description='Pallet gadgets',
            status='delivered',
            purchase_cost=Decimal('40.00'),
            retail_value=Decimal('120.00'),
            item_count=4,
        )
        self.po2 = PurchaseOrder.objects.create(
            vendor=self.v2,
            order_number='PO-DASH-B2',
            ordered_date='2025-06-15',
            description='Rare keyword findme-dash',
            status='ordered',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('150.00'),
            item_count=6,
        )
        self.po1.refresh_from_db()
        self.po2.refresh_from_db()

        self.v_generic = Vendor.objects.create(name='Generic', code='GEN-X')
        self.po_other = PurchaseOrder.objects.create(
            vendor=self.v_generic,
            order_number='PO-DASH-HIDDEN',
            ordered_date='2025-06-10',
            description='Should not appear on dashboard list',
            status='delivered',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('30.00'),
            item_count=1,
        )
        self.po_other.refresh_from_db()

    def test_save_populates_vendor_cache_and_search_text(self):
        self.assertIn('po-dash-a1', self.po1.search_text)
        self.assertIn('walmart', self.po1.search_text)
        self.assertEqual(self.po1.vendor_name_cache, 'Walmart')
        self.assertEqual(self.po1.vendor_code_cache, 'WM-DASH')

    def test_list_search_matches_description_and_order_number(self):
        r = self.client.get('/api/inventory/orders/', {'search': 'findme-dash'})
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertIn(self.po2.id, ids)

        r2 = self.client.get('/api/inventory/orders/', {'search': 'PO-DASH-A1'})
        self.assertEqual(r2.status_code, 200)
        ids2 = [row['id'] for row in r2.data['results']]
        self.assertIn(self.po1.id, ids2)

    def test_list_uses_vendor_name_cache_not_join(self):
        r = self.client.get('/api/inventory/orders/', {'vendor': self.v1.pk})
        self.assertEqual(r.status_code, 200)
        row = next(x for x in r.data['results'] if x['id'] == self.po1.id)
        self.assertEqual(row['vendor_name'], 'Walmart')
        self.assertEqual(row['vendor_code'], 'WM-DASH')

    def test_list_excludes_non_dashboard_vendor_names(self):
        r = self.client.get('/api/inventory/orders/', {})
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertNotIn(self.po_other.id, ids)
        self.assertIn(self.po1.id, ids)

    def test_summary_matches_status_filter(self):
        r = self.client.get(
            '/api/inventory/orders/summary/',
            {'status__in': 'delivered'},
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['total_orders'], 1)
        self.assertEqual(r.data['delivered_count'], 1)

    def test_summary_includes_margin_when_retail_positive(self):
        r = self.client.get('/api/inventory/orders/summary/')
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(r.data['total_orders'], 2)
        self.assertIsNotNone(r.data['margin_percent'])
