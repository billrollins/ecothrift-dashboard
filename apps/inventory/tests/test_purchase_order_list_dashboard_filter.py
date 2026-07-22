"""Regression: order list/summary must not hide POs when vendor_name_cache is stale or empty."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES
from apps.inventory.models import PurchaseOrder, Vendor


class PurchaseOrderListDashboardFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        user = get_user_model().objects.create_user(
            email='staff@example.com',
            first_name='S',
            last_name='T',
            password='pw',
        )
        user.is_staff = True
        user.save()
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=user)

        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        self.vendor = Vendor.objects.create(name=dash_name, code='AMZ')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-LIST-TEST-1',
            ordered_date='2026-05-01',
            purchase_cost=Decimal('1'),
            retail_value=Decimal('5'),
            status='ordered',
        )

    def test_list_includes_po_when_vendor_name_cache_cleared(self):
        PurchaseOrder.objects.filter(pk=self.po.pk).update(
            vendor_name_cache='',
            vendor_code_cache='',
        )
        self.po.refresh_from_db()
        self.assertEqual(self.po.vendor_name_cache, '')

        r = self.client.get('/api/inventory/orders/')
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertIn(self.po.id, ids)

    def test_summary_includes_po_when_vendor_name_cache_cleared(self):
        PurchaseOrder.objects.filter(pk=self.po.pk).update(
            vendor_name_cache='',
            vendor_code_cache='',
        )

        r = self.client.get('/api/inventory/orders/summary/')
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(r.data.get('total_orders', 0), 1)

    def test_list_milestones_ordering_nulls_first(self):
        today = timezone.localdate()
        common = {
            'vendor': self.vendor,
            'purchase_cost': Decimal('1'),
            'retail_value': Decimal('5'),
            'status': 'paid',
            'description': 'ms',
            'item_count': 0,
        }
        older_ship = PurchaseOrder.objects.create(
            **common,
            order_number='PO-MS-LIST-A',
            ordered_date=today - timedelta(days=10),
            shipped_date=today - timedelta(days=5),
        )
        newer_ship = PurchaseOrder.objects.create(
            **common,
            order_number='PO-MS-LIST-B',
            ordered_date=today - timedelta(days=9),
            shipped_date=today - timedelta(days=1),
        )
        not_shipped = PurchaseOrder.objects.create(
            **common,
            order_number='PO-MS-LIST-C',
            ordered_date=today - timedelta(days=8),
            shipped_date=None,
        )
        r = self.client.get(
            '/api/inventory/orders/',
            {'ordering': 'milestones', 'status__in': 'paid'},
        )
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertLess(ids.index(not_shipped.id), ids.index(newer_ship.id))
        self.assertLess(ids.index(newer_ship.id), ids.index(older_ship.id))
        row = next(x for x in r.data['results'] if x['id'] == newer_ship.id)
        self.assertIn('paid_date', row)
        self.assertIn('shipped_date', row)

    def test_include_older_false_hides_stale_orders(self):
        today = timezone.localdate()
        recent = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-RECENT-1',
            ordered_date=today - timedelta(days=30),
            purchase_cost=Decimal('1'),
            retail_value=Decimal('5'),
            status='ordered',
        )
        stale = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-STALE-1',
            ordered_date=today - timedelta(days=200),
            purchase_cost=Decimal('1'),
            retail_value=Decimal('5'),
            status='ordered',
        )
        r = self.client.get('/api/inventory/orders/', {'include_older': '0'})
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertIn(recent.id, ids)
        self.assertNotIn(stale.id, ids)

        r_all = self.client.get('/api/inventory/orders/', {'include_older': '1'})
        self.assertEqual(r_all.status_code, 200)
        ids_all = [row['id'] for row in r_all.data['results']]
        self.assertIn(stale.id, ids_all)
