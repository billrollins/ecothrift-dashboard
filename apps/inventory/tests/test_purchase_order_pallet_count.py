"""API behavior for optional PO `order_pallet_count` (planning / expectation)."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Vendor

User = get_user_model()


class PurchaseOrderPalletCountTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='po-pallet@example.com',
            first_name='PO',
            last_name='Tester',
            password='testpw',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)
        self.vendor = Vendor.objects.create(name='ACME', code='AC-PALLET')

    def test_post_includes_order_pallet_count_and_get_returns_it(self):
        payload = {
            'vendor': self.vendor.id,
            'order_number': 'PO-PALLET-API-1',
            'ordered_date': '2025-06-01',
            'order_pallet_count': 12,
        }
        r = self.client.post('/api/inventory/orders/', payload, format='json')
        self.assertEqual(r.status_code, 201, getattr(r, 'data', r.content))
        self.assertEqual(r.data['order_pallet_count'], 12)

        rid = r.data['id']
        r2 = self.client.get(f'/api/inventory/orders/{rid}/')
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['order_pallet_count'], 12)
