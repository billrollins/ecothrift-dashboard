"""What is behind a Dashboard department card (owner 2026-10-22), and who may read or set the goals."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.inventory.models import Item, ItemCheckIn, ItemHistory, Product, PurchaseOrder, RestorationJob, Vendor
from apps.pos.models import DashboardDepartmentGoal
from apps.pos.services.dashboard_metrics import (
    buying_details,
    processed_items,
    processing_details,
    restoration_details,
)

DETAILS_URL = '/api/pos/dashboard/department-details/'
ITEMS_URL = '/api/pos/dashboard/processed-items/'
GOALS_URL = '/api/pos/dashboard/department-goals/'


def _user(email, first, group=None, **extra):
    user = User.objects.create_user(email, first, 'Tester', password='x-pass-123', **extra)
    if group:
        user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


class DepartmentDetailsTests(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.ana = _user('ana@example.com', 'Ana', 'Employee')
        self.ben = _user('ben@example.com', 'Ben', 'Employee')
        self.mia = _user('mia@example.com', 'Mia', 'Employee')
        self.vendor = Vendor.objects.create(name='Target', code='TGT')
        self.product = Product.objects.create(title='Desk lamp', brand='Generic')
        self.order = PurchaseOrder.objects.create(
            vendor=self.vendor, order_number='PO-DET-1', status='processing',
            ordered_date=self.today, total_cost=Decimal('100.00'),
        )

    # ── helpers ──
    def _floor(self, sku, price, retail, by):
        item = Item.objects.create(sku=sku, product=self.product, price=Decimal(price),
                                   retail=Decimal(retail) if retail is not None else None, status='on_shelf')
        ItemHistory.objects.create(item=item, event_type='status_change', old_value='processing',
                                   new_value='on_shelf', created_by=by)
        return item

    def _check_in(self):
        return ItemCheckIn.objects.create(purchase_order=self.order, product=self.product,
                                          origin=ItemCheckIn.ORIGIN_PROCESSING, quantity=1, created_by=self.ana)

    def _finished_job(self, by, value_added):
        return RestorationJob.objects.create(
            item_check_in=self._check_in(), product=self.product, purchase_order=self.order, quantity=1,
            stage=RestorationJob.STAGE_DONE, dispositioned_at=timezone.now(), dispositioned_by=by,
            value_added=Decimal(value_added) if value_added is not None else None,
        )

    # ── Buying ──
    def test_buying_lists_the_orders_in_the_period_with_cost(self):
        PurchaseOrder.objects.create(vendor=self.vendor, order_number='PO-DET-X', status='cancelled',
                                     ordered_date=self.today, total_cost=Decimal('999.00'))
        PurchaseOrder.objects.create(vendor=self.vendor, order_number='PO-DET-OLD', status='complete',
                                     ordered_date=self.today - timedelta(days=30), total_cost=Decimal('50.00'))
        PurchaseOrder.objects.create(vendor=self.vendor, order_number='PO-DET-2', status='ordered',
                                     ordered_date=self.today - timedelta(days=1), total_cost=None)

        details = buying_details(self.today - timedelta(days=6), self.today)
        self.assertEqual([row['order_number'] for row in details['rows']], ['PO-DET-1', 'PO-DET-2'])
        first = details['rows'][0]
        self.assertEqual((first['id'], first['vendor'], first['total_cost']), (self.order.id, 'Target', '100.00'))
        self.assertIsNone(details['rows'][1]['total_cost'])  # unknown cost stays blank, not $0
        self.assertEqual(details['totals'], {'orders': 2, 'total_cost': '100.00'})

    # ── Processing ──
    def test_processing_is_per_person_with_price_and_retail(self):
        self._floor('TSTDET0001', '20.00', '50.00', self.ana)
        self._floor('TSTDET0002', '10.00', None, self.ana)
        self._floor('TSTDET0003', '30.00', '80.00', self.ben)
        # An item Ben took in from Restoration Overview is his too.
        check_in = self._check_in()
        Item.objects.create(sku='TSTDET0004', product=self.product, check_in=check_in, price=Decimal('40.00'),
                            retail=Decimal('100.00'), status='on_shelf')
        RestorationJob.objects.create(item_check_in=check_in, product=self.product, purchase_order=self.order,
                                      quantity=1, stage=RestorationJob.STAGE_DONE,
                                      processing_handled_at=timezone.now(), processing_handled_by=self.ben)

        details = processing_details(self.today, self.today)
        rows = {row['name']: row for row in details['rows']}
        self.assertEqual(
            {k: rows['Ana Tester'][k] for k in ('items', 'total_price', 'total_retail', 'missing_retail')},
            {'items': 2, 'total_price': '30.00', 'total_retail': '50.00', 'missing_retail': 1},
        )
        self.assertEqual(
            {k: rows['Ben Tester'][k] for k in ('items', 'total_price', 'total_retail')},
            {'items': 2, 'total_price': '70.00', 'total_retail': '180.00'},
        )
        self.assertEqual(details['totals']['items'], 4)
        # The people add up to the card's day number.
        self.assertEqual(details['totals']['total_price'], '100.00')

    def test_processed_items_are_that_persons_items(self):
        mine = self._floor('TSTDET0011', '12.00', '40.00', self.ana)
        self._floor('TSTDET0012', '8.00', '20.00', self.ben)

        page = processed_items(self.today, self.today, self.ana.id)
        self.assertEqual((page['name'], page['count'], page['total_price']), ('Ana Tester', 1, '12.00'))
        self.assertEqual([row['sku'] for row in page['results']], [mine.sku])
        self.assertEqual(page['results'][0]['title'], 'Desk lamp')
        self.assertEqual(processed_items(self.today, self.today, None)['count'], 0)

    # ── Restoration ──
    def test_restoration_is_per_person_with_value_added(self):
        self._finished_job(self.mia, '15.00')
        self._finished_job(self.mia, None)
        self._finished_job(self.ana, '5.00')

        details = restoration_details(self.today, self.today)
        rows = {row['name']: row for row in details['rows']}
        self.assertEqual((rows['Mia Tester']['items'], rows['Mia Tester']['value_added'], rows['Mia Tester']['unmeasured']),
                         (2, '15.00', 1))
        self.assertEqual((rows['Ana Tester']['items'], rows['Ana Tester']['value_added']), (1, '5.00'))
        self.assertEqual(details['totals'], {'items': 3, 'value_added': '20.00', 'unmeasured': 1})

    # ── The API: everyone on the team reads it ──
    def test_staff_read_the_details(self):
        self._floor('TSTDET0021', '20.00', '50.00', self.ana)
        self.client.force_authenticate(self.ben)
        day = self.today.isoformat()
        for department in ('buying', 'processing', 'restoration'):
            with self.subTest(department=department):
                response = self.client.get(DETAILS_URL, {'department': department, 'start': day, 'end': day})
                self.assertEqual(response.status_code, 200)
                self.assertEqual((response.data['department'], response.data['start']), (department, day))
        response = self.client.get(ITEMS_URL, {'user': self.ana.id, 'start': day, 'end': day})
        self.assertEqual((response.status_code, response.data['count']), (200, 1))

    def test_bad_requests_say_why(self):
        self.client.force_authenticate(self.ben)
        day = self.today.isoformat()
        far = (self.today - timedelta(days=120)).isoformat()
        for params in (
            {'department': 'retail', 'start': day, 'end': day},
            {'department': 'buying', 'start': 'soon', 'end': day},
            {'department': 'buying', 'start': day, 'end': far},
            {'department': 'buying', 'start': far, 'end': day},
        ):
            with self.subTest(params=params):
                self.assertEqual(self.client.get(DETAILS_URL, params).status_code, 400)
        self.assertEqual(self.client.get(ITEMS_URL, {'user': 'ana', 'start': day, 'end': day}).status_code, 400)

    def test_signed_out_gets_nothing(self):
        day = self.today.isoformat()
        response = self.client.get(DETAILS_URL, {'department': 'buying', 'start': day, 'end': day})
        self.assertIn(response.status_code, (401, 403))


class DepartmentGoalPermissionTests(APITestCase):
    """Staff read the goals; only the owner sets them."""

    def test_staff_read_goals_but_cannot_set_them(self):
        DashboardDepartmentGoal.objects.update_or_create(department='buying', defaults={'value': '5000'})
        self.client.force_authenticate(_user('clerk@example.com', 'Cleo', 'Employee'))
        response = self.client.get(GOALS_URL)
        self.assertEqual(response.status_code, 200)
        self.assertIn('5000', [goal['value'] for goal in response.data if goal['department'] == 'buying'])
        response = self.client.post(GOALS_URL, {'department': 'buying', 'value': '1'}, format='json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(DashboardDepartmentGoal.objects.get(department='buying').value, '5000')

    def test_owner_sets_a_goal(self):
        self.client.force_authenticate(_user('owner@example.com', 'Bill', is_superuser=True))
        response = self.client.post(GOALS_URL, {'department': 'processing', 'value': '8000'}, format='json')
        self.assertIn(response.status_code, (200, 201))  # a migration may have made the row already
        self.assertEqual(DashboardDepartmentGoal.objects.get(department='processing').value, '8000')
