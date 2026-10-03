"""New-order form (intake_updates Phase 2): the vendor guess from an order number, and a paid date on create."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import PurchaseOrder, Vendor
from apps.inventory.services.order_vendor_guess import guess_vendor, order_prefix

User = get_user_model()


class OrderPrefixTests(TestCase):
    def test_first_segment_before_the_dash(self):
        self.assertEqual(order_prefix('TRGET-OGG-9L2P'), 'TRGET')
        self.assertEqual(order_prefix(' trget-ogg '), 'TRGET')

    def test_leading_letters_without_a_dash(self):
        self.assertEqual(order_prefix('AMZ11175'), 'AMZ')
        self.assertEqual(order_prefix('12345'), '')
        self.assertEqual(order_prefix(''), '')


class GuessVendorTests(TestCase):
    def setUp(self):
        today = timezone.localdate()
        self.target = Vendor.objects.create(name='Target', code='QTRGT')
        self.old_target = Vendor.objects.create(name='Target (old)', code='QTGT')
        self.amazon = Vendor.objects.create(name='Amazon', code='QAMZN')
        self.gone = Vendor.objects.create(name='Gone', code='QGONE', is_active=False)
        for i in range(3):
            PurchaseOrder.objects.create(vendor=self.target, order_number=f'QTRGT-A-{i}', ordered_date=today)
        PurchaseOrder.objects.create(vendor=self.old_target, order_number='QTRGT-OLD-1', ordered_date=today)
        PurchaseOrder.objects.create(vendor=self.amazon, order_number='QAMZ11175', ordered_date=today)
        PurchaseOrder.objects.create(vendor=self.gone, order_number='QGONE-1', ordered_date=today)

    def test_most_orders_with_the_prefix_wins(self):
        self.assertEqual(guess_vendor('QTRGT-NEW-9'), (self.target, 'orders'))

    def test_vendor_code_when_no_orders_match(self):
        self.assertEqual(guess_vendor('QAMZN-OQL-CCP4'), (self.amazon, 'code'))

    def test_dashless_number_uses_leading_letters(self):
        self.assertEqual(guess_vendor('QAMZ22222'), (self.amazon, 'orders'))

    def test_nothing_fits(self):
        self.assertIsNone(guess_vendor('QZZZZ-1'))
        self.assertIsNone(guess_vendor('X'))

    def test_inactive_vendors_are_not_guessed(self):
        self.assertIsNone(guess_vendor('QGONE-2'))


class NewOrderApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        user = User.objects.create_user(email='po-new@example.com', first_name='New', last_name='Order', password='testpw')
        user.groups.add(group)
        self.client.force_authenticate(user=user)
        self.vendor = Vendor.objects.create(name='Target', code='QAPI')

    def test_vendor_guess_endpoint(self):
        res = self.client.get('/api/inventory/orders/vendor-guess/', {'order_number': 'QAPI-ABC-1'})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['prefix'], 'QAPI')
        self.assertEqual(res.data['vendor']['id'], self.vendor.id)
        self.assertEqual(res.data['vendor']['source'], 'code')

    def test_paid_date_on_create_marks_the_order_paid(self):
        res = self.client.post(
            '/api/inventory/orders/',
            {'vendor': self.vendor.id, 'order_number': 'QAPI-PAID-1', 'paid_date': '2026-10-01', 'purchase_cost': '450.50'},
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'paid')
        self.assertEqual(res.data['paid_date'], '2026-10-01')

    def test_no_paid_date_stays_ordered(self):
        res = self.client.post('/api/inventory/orders/', {'vendor': self.vendor.id, 'order_number': 'QAPI-ORD-1'}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'ordered')
