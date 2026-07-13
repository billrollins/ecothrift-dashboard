"""POST /pos/carts/:id/add-discount/ and add-delivery/."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Drawer, Register


class CartDiscountDeliveryAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='pos-disc@example.com',
            first_name='Pos',
            last_name='Disc',
            password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.location = WorkLocation.objects.create(name='POS Disc Loc')
        self.register = Register.objects.create(
            location=self.location,
            name='Register D',
            code='POS-D1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        cat = Category.objects.create(name='POS Disc Cat', slug='pos-disc-cat')
        product = Product.objects.create(title='Disc Test Item', brand='QA', category=cat)
        self.item = Item.objects.create(
            sku='POSTESTDISC1',
            product=product,
            price=Decimal('20.00'),
            status='on_shelf',
        )

    def _open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data['id']

    def test_add_discount_cart_wide(self):
        cid = self._open_cart()
        self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': self.item.sku}, format='json')
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-discount/',
            {'amount': '5.00', 'reason': 'In-store credit (return)'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        kinds = [ln['line_kind'] for ln in r.data['lines']]
        self.assertIn('discount', kinds)
        disc = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'discount')
        self.assertEqual(Decimal(str(disc['unit_price'])), Decimal('-5.00'))
        self.assertEqual(disc['meta']['scope'], 'cart')

    def test_add_discount_rejects_over_cart(self):
        cid = self._open_cart()
        self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': self.item.sku}, format='json')
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-discount/',
            {'amount': '99.00'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['code'], 'DISCOUNT_EXCEEDS_CART')

    def test_add_delivery_5mi(self):
        from datetime import time, timedelta

        from apps.pos.models import DeliveryAvailability

        slot = DeliveryAvailability.objects.create(
            date=timezone.localdate() + timedelta(days=2),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'is_apt': False,
                'availability_id': slot.id,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        delivery = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'delivery')
        self.assertEqual(Decimal(str(delivery['unit_price'])), Decimal('50.00'))
        self.assertEqual(delivery['meta']['tier'], '5mi')
        self.assertEqual(delivery['meta']['customer_name'], 'Jane Doe')
        self.assertEqual(delivery['meta']['items_delivered'], 'Washer')
        self.assertEqual(delivery['meta']['scheduled_date'], slot.date.isoformat())
        self.assertIn('Washer', delivery['description'])

    def test_add_delivery_apt_requires_unit(self):
        from datetime import time, timedelta

        from apps.pos.models import DeliveryAvailability

        slot = DeliveryAvailability.objects.create(
            date=timezone.localdate() + timedelta(days=2),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '10mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '99 Oak Ave',
                'items_delivered': 'Dryer',
                'is_apt': True,
                'unit': '',
                'availability_id': slot.id,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['code'], 'UNIT_REQUIRED')

    def test_add_delivery_requires_items(self):
        from datetime import time, timedelta

        from apps.pos.models import DeliveryAvailability

        slot = DeliveryAvailability.objects.create(
            date=timezone.localdate() + timedelta(days=2),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': '',
                'availability_id': slot.id,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['code'], 'DELIVERY_FIELDS_REQUIRED')
