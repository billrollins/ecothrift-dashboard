"""POST /pos/carts/:id/add-manual-line/ — lines without inventory items (pink tag / unscannable)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import Cart, CartLine, Drawer, Register


class CartManualLineAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='manual-line@example.com',
            first_name='Manual',
            last_name='Line',
            password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.location = WorkLocation.objects.create(name='Manual Line Location')
        self.register = Register.objects.create(
            location=self.location,
            name='Register ML',
            code='POS-ML',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )

    def _create_open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_add_manual_line_item_null_and_totals(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-manual-line/',
            {'description': 'Pink Tag Item'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(len(data['lines']), 1)
        line = data['lines'][0]
        self.assertIsNone(line['item'])
        self.assertEqual(line['description'], 'Pink Tag Item')
        self.assertEqual(line['quantity'], 1)
        self.assertEqual(Decimal(str(line['unit_price'])), Decimal('0.50'))
        self.assertEqual(Decimal(str(line['line_total'])), Decimal('0.50'))

        tax_rate = Decimal(str(data['tax_rate']))
        subtotal = Decimal(str(line['line_total']))
        tax = (subtotal * tax_rate).quantize(Decimal('0.01'))
        total = subtotal + tax
        self.assertEqual(Decimal(str(data['subtotal'])), subtotal)
        self.assertEqual(Decimal(str(data['tax_amount'])), tax)
        self.assertEqual(Decimal(str(data['total'])), total)

        row = CartLine.objects.get(pk=line['id'])
        self.assertIsNone(row.item_id)

    def test_add_manual_line_custom_price(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-manual-line/',
            {'description': 'Custom', 'unit_price': '1.25'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(Decimal(str(data['lines'][0]['unit_price'])), Decimal('1.25'))

    def test_add_manual_line_closed_cart_400(self):
        cart = self._create_open_cart()
        cid = cart['id']
        Cart.objects.filter(pk=cid).update(status='completed', completed_at=timezone.now())
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-manual-line/',
            {'description': 'Too late'},
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json().get('code'), 'CART_NOT_OPEN')

    def test_add_manual_line_empty_description_400(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-manual-line/',
            {'description': '   '},
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.content)
