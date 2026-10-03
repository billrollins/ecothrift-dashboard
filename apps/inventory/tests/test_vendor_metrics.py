"""Vendor metrics (intake_updates Phase 6): each definition, the weighting and the period, on two vendors."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import Dispute, Item, ManifestRow, Product, PurchaseOrder, Vendor
from apps.inventory.services import vendor_metrics as vm

D = Decimal


class VendorMetricsTests(TestCase):
    def setUp(self):
        today = timezone.localdate()
        self.a = Vendor.objects.create(name='Vendor A', code='QVA')
        self.b = Vendor.objects.create(name='Vendor B', code='QVB')
        product = Product.objects.create(title='Metric Widget')
        t0 = timezone.now() - timedelta(days=10)

        def order(vendor, number, cost, rows, days_ago=5):
            po = PurchaseOrder.objects.create(vendor=vendor, order_number=number, purchase_cost=D(cost),
                                              ordered_date=today - timedelta(days=days_ago))
            made = [ManifestRow.objects.create(purchase_order=po, row_number=i + 1, quantity=q, unit_retail=D(r))
                    for i, (q, r) in enumerate(rows)]
            return po, made

        def item(po, sku, price, retail, row=None, sold_for=None, sold_days=None):
            sold = sold_for is not None
            return Item.objects.create(
                sku=sku, product=product, purchase_order=po, manifest_row=row, checked_in_at=t0,
                price=D(price), retail=D(retail), status='sold' if sold else 'on_shelf',
                sold_for=D(sold_for) if sold else None, sold_at=t0 + timedelta(days=sold_days) if sold else None,
            )

        # Vendor A, order 1: cost 20, manifest 100 (one row of 100), one item priced 50, sold for 40 after 4 days.
        a1, rows = order(self.a, 'QVA-1', '20.00', [(1, '100.00')])
        item(a1, 'QVA-1-1', '50.00', '100.00', rows[0], sold_for='40.00', sold_days=4)
        # Vendor A, order 2: cost 180, manifest 900 (three rows of 300), two items priced 100 each (one disputed), unsold.
        a2, rows = order(self.a, 'QVA-2', '180.00', [(1, '300.00'), (1, '300.00'), (1, '300.00')])
        item(a2, 'QVA-2-1', '100.00', '300.00', rows[0])
        disputed = item(a2, 'QVA-2-2', '100.00', '300.00', rows[1])
        Dispute.objects.create(purchase_order=a2, kind='processing', title='Broken', subject_item=disputed)
        # Vendor A, an old order outside 90 days but inside 12 months: cost 100, no manifest, nothing checked in.
        order(self.a, 'QVA-OLD', '100.00', [], days_ago=200)
        # Vendor B: cost 50, no manifest, one item priced 30 sold for 30 after 10 days.
        b1, _ = order(self.b, 'QVB-1', '50.00', [])
        item(b1, 'QVB-1-1', '30.00', '60.00', sold_for='30.00', sold_days=10)

    def test_each_definition_weighted_across_orders(self):
        m = vm.compute('90d')[self.a.id]
        self.assertEqual(m['orders'], 2)
        self.assertEqual(m['spent'], D('200.00'))
        self.assertEqual(m['manifest_retail'], D('1000.00'))
        self.assertEqual(m['landed_pct'], D('20'))               # 200 / 1000, not the average of 20% and 20%
        self.assertEqual(m['priced_start'], D('250.00'))
        self.assertEqual(m['priced_pct_of_retail'], D('36'))     # 250 / 700 approved retail
        self.assertEqual(m['manifest_accuracy'], D('70'))        # 700 / 1000
        self.assertEqual(m['received_pct'], D('40'))             # 100 + 300 (the disputed one left out) / 1000
        self.assertEqual((m['disputes'], m['disputes_open'], m['disputed_pct']), (1, 1, D('30')))
        self.assertEqual(m['recovery_expected'], D('125'))       # 250 / 200
        self.assertEqual(m['sold'], D('40.00'))
        self.assertEqual(m['recovery_actual'], D('20'))          # 40 / 200
        self.assertEqual(m['sold_pct'], D('16'))                 # 40 / 250
        self.assertEqual(m['kept_of_start'], D('80'))            # 40 / 50
        self.assertEqual(m['days_to_sell'], 4.0)
        self.assertEqual((m['items_checked_in'], m['items_sold']), (3, 1))
        self.assertEqual((m['avg_cost'], m['avg_start'], m['avg_sold']), (D('66.67'), D('83.33'), D('40.00')))
        self.assertEqual(m['profit'], D('-160.00'))

    def test_missing_data_is_none_not_zero(self):
        m = vm.compute('90d')[self.b.id]
        self.assertIsNone(m['manifest_retail'])
        self.assertIsNone(m['landed_pct'])
        self.assertIsNone(m['manifest_accuracy'])
        self.assertEqual(m['orders_no_manifest'], 1)
        self.assertEqual(m['days_to_sell'], 10.0)
        PurchaseOrder.objects.create(vendor=self.b, order_number='QVB-2', purchase_cost=D('10.00'),
                                     ordered_date=timezone.localdate())
        bare = vm.compute('90d', self.b.id)[self.b.id]
        self.assertEqual(bare['orders'], 2)

    def test_vendor_with_no_sales_shows_none(self):
        c = Vendor.objects.create(name='Vendor C', code='QVC')
        PurchaseOrder.objects.create(vendor=c, order_number='QVC-1', purchase_cost=D('10.00'), ordered_date=timezone.localdate())
        m = vm.compute('90d')[c.id]
        self.assertIsNone(m['sold'])
        self.assertIsNone(m['profit'])
        self.assertIsNone(m['kept_of_start'])
        self.assertIsNone(m['days_to_sell'] if 'days_to_sell' in m else None)

    def test_period(self):
        self.assertEqual(vm.compute('90d')[self.a.id]['orders'], 2)
        self.assertEqual(vm.compute('12m')[self.a.id]['orders'], 3)
        self.assertEqual(vm.compute('all')[self.a.id]['spent'], D('300.00'))
        self.assertEqual(vm.compute('nonsense')[self.a.id]['orders'], 3)   # unknown means the default, 12 months


class VendorMetricsApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        user = get_user_model().objects.create_user(email='vm@example.com', first_name='V', last_name='M', password='x')
        user.groups.add(group)
        self.client.force_authenticate(user=user)
        self.v = Vendor.objects.create(name='Vendor API', code='QVAPI')
        PurchaseOrder.objects.create(vendor=self.v, order_number='QVAPI-1', purchase_cost=D('10.00'),
                                     ordered_date=timezone.localdate())

    def test_list_and_one_vendor(self):
        res = self.client.get('/api/inventory/vendors/metrics/', {'period': 'all', 'fresh': '1'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['period'], 'all')
        self.assertEqual(res.data['vendors'][str(self.v.id)]['spent'], '10.00')
        one = self.client.get(f'/api/inventory/vendors/{self.v.id}/metrics/', {'period': '90d'})
        self.assertEqual(one.status_code, 200)
        self.assertEqual(one.data['metrics']['orders'], 1)
