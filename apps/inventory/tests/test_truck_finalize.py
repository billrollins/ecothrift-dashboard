"""E2 truck finalize: unfulfilled lines, missing / broken / added, B-Stock refund math, finalize and reopen."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.inventory.models import ManifestRow, ProcessingRow, PurchaseOrder, Vendor
from apps.inventory.services.truck_finalize import expected_refund, truck_report


class TruckFinalizeBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Vendor', code='VND')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='mgr@example.com', first_name='Mo', last_name='Mgr', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        # Manifest $1,000: line 1 = 10 x $50, line 2 = 5 x $100. Hammer $200.
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor, order_number='PO-FIN', ordered_date='2026-10-01',
            purchase_cost=Decimal('200.00'), shipping_cost=Decimal('300.00'), fees=Decimal('20.00'),
            retail_value=Decimal('1000.00'), status='processing',
        )
        self.rows = []
        for n, (qty, retail) in enumerate(((10, '50.00'), (5, '100.00')), start=1):
            mr = ManifestRow.objects.create(
                purchase_order=self.order, row_number=n, quantity=qty, title=f'Line {n}', unit_retail=Decimal(retail),
            )
            pr = ProcessingRow.objects.create(
                purchase_order=self.order, manifest_row=mr, row_number=n, quantity=qty, title=f'Line {n}',
                unit_retail=Decimal(retail), shelf_price=Decimal('5.00'),
            )
            self.rows.append((mr, pr))

    def _check_in(self, idx, qty, condition='good'):
        _, pr = self.rows[idx]
        r = self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id, 'quantity': qty, 'condition': condition, 'dispatch': 'on_shelf',
                'price': '5.00', 'product_mode': 'new', 'title': pr.title,
                # $50 retail on a $5 tag trips the retail check; these tests are about the truck, not the tag.
                'retail_check': 'confirm',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)

    def _url(self, tail=''):
        return f'/api/inventory/orders/{self.order.id}/truck-finalize/{tail}'


class RefundMathTests(TestCase):
    def test_first_five_percent_is_not_refunded(self):
        r = expected_refund(
            sale_price=Decimal('1000'), manifest_retail=Decimal('10000'), claimed_retail=Decimal('1500'),
            rate=Decimal('0.95'), deductible=Decimal('0.05'),
        )
        # 1500 claimed - 500 kept = 1000 of 10000 = 10% of the sale price, x 95%.
        self.assertEqual(r['amount'], '95.00')
        self.assertEqual(r['not_refunded_retail'], '500.00')

    def test_claim_under_deductible_gets_nothing(self):
        r = expected_refund(
            sale_price=Decimal('1000'), manifest_retail=Decimal('10000'), claimed_retail=Decimal('300'),
            rate=Decimal('0.95'), deductible=Decimal('0.05'),
        )
        self.assertEqual(r['amount'], '0.00')

    def test_unknown_sale_price(self):
        r = expected_refund(
            sale_price=None, manifest_retail=Decimal('100'), claimed_retail=Decimal('50'),
            rate=Decimal('0.95'), deductible=Decimal('0.05'),
        )
        self.assertIsNone(r['amount'])


class TruckReportTests(TruckFinalizeBase):
    def test_missing_broken_added_and_refund(self):
        self._check_in(0, 8)            # line 1: 2 missing ($100)
        self._check_in(1, 4)            # line 2: 1 missing ($100)
        self._check_in(1, 1, 'salvage')  # ...and the 5th arrived broken ($100)
        rep = truck_report(self.order)
        t = rep['totals']
        self.assertEqual(t['units']['manifest'], 15)
        self.assertEqual(t['units']['missing'], 2)
        self.assertEqual(t['retail']['missing'], '100.00')
        self.assertEqual(t['units']['broken'], 1)
        self.assertEqual(t['retail']['broken'], '100.00')
        # Claimed $200 - $50 kept (5% of $1,000) = $150 of $1,000 = 15% of $200 hammer x 95%.
        self.assertEqual(rep['refund']['amount'], '28.50')
        self.assertEqual(rep['refund']['sale_price'], '200.00')
        self.assertEqual([line['row_number'] for line in rep['lines']], [1, 2])

    def test_unfulfilled_is_not_missing(self):
        self._check_in(0, 8)
        self._check_in(1, 5)
        r = self.client.post(
            self._url('adjustments/'),
            {'manifest_row_id': self.rows[0][0].id, 'units': 2, 'timing': 'before_arrival', 'refund_amount': '40'},
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.data)
        t = r.data['totals']
        self.assertEqual(t['units']['unfulfilled'], 2)
        self.assertEqual(t['units']['expected'], 13)
        self.assertEqual(t['units']['missing'], 0)
        self.assertEqual(t['adjusted_refund'], '40.00')
        self.assertEqual(r.data['refund']['amount'], '0.00')

    def test_adjustment_cannot_exceed_the_line(self):
        r = self.client.post(
            self._url('adjustments/'), {'row_number': 2, 'units': 6}, format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_added_items_counted(self):
        r = self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-add-item/',
            {'title': 'Extra lamp', 'quantity': 2, 'price': '5.00', 'retail': '30.00'},
            format='json',
        )
        self.assertIn(r.status_code, (200, 201), r.data)
        r = self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-row-check-in/',
            {
                'processing_row_id': r.data['processing_row_id'], 'quantity': 2, 'condition': 'good',
                'dispatch': 'on_shelf', 'price': '5.00', 'product_mode': 'new', 'title': 'Extra lamp',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        rep = truck_report(self.order)
        self.assertEqual(rep['totals']['added_units'], 2)

    def test_refund_settings_are_editable(self):
        AppSetting.objects.update_or_create(key='truck_refund_rate', defaults={'value': 0.9})
        AppSetting.objects.update_or_create(key='truck_refund_deductible', defaults={'value': 0})
        self._check_in(0, 8)
        self._check_in(1, 5)
        rep = truck_report(self.order)
        # $100 missing of $1,000 = 10% of $200 x 90%.
        self.assertEqual(rep['refund']['amount'], '18.00')


class FinalizeTests(TruckFinalizeBase):
    def test_finalize_freezes_and_blocks_adjustments_then_reopen(self):
        self._check_in(0, 10)
        self._check_in(1, 5)
        r = self.client.post(self._url('finalize/'), {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.closeout_status, 'finalized')
        self.assertIsNotNone(self.order.truck_finalized_at)
        self.assertEqual(self.order.truck_finalize_snapshot['totals']['units']['missing'], 0)
        self.assertEqual(r.data['finalized']['by'], 'Mo Mgr')

        r = self.client.post(self._url('adjustments/'), {'row_number': 1, 'units': 1}, format='json')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(self._url('finalize/'), {}, format='json')
        self.assertEqual(r.status_code, 400)

        r = self.client.post(self._url('reopen/'), {}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.closeout_status, 'open')
        self.assertIsNone(self.order.truck_finalized_at)

    def test_reopen_needs_a_manager(self):
        staff = get_user_model().objects.create_user(email='s@example.com', first_name='S', last_name='T', password='pw')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client.post(self._url('finalize/'), {}, format='json')
        c = APIClient()
        c.force_authenticate(user=staff)
        r = c.post(self._url('reopen/'), {}, format='json')
        self.assertIn(r.status_code, (403,))
