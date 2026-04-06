"""POST /pos/carts/:id/add-resale-copy/ — atomic duplicate + line with resale metadata."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Item
from apps.pos.models import Cart, CartLine, Drawer, Register


class CartAddResaleCopyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='pos-resale@example.com',
            first_name='Pos',
            last_name='Resale',
            password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.location = WorkLocation.objects.create(name='POS Resale Location')
        self.register = Register.objects.create(
            location=self.location,
            name='Register Resale',
            code='POS-R1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        self.item_sold = Item.objects.create(
            sku='POS-RESALE-SOLD',
            title='Sold for resale test',
            price=Decimal('12.00'),
            status='sold',
        )
        self.item_on_shelf = Item.objects.create(
            sku='POS-RESALE-SHELF',
            title='On shelf',
            price=Decimal('5.00'),
            status='on_shelf',
        )

    def _create_open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_add_resale_copy_duplicates_and_sets_line_metadata(self):
        cart = self._create_open_cart()
        cid = cart['id']
        before_items = Item.objects.count()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-resale-copy/',
            {'source_item_id': self.item_sold.pk},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Item.objects.count(), before_items + 1)
        data = r.json()
        self.assertEqual(len(data['lines']), 1)
        line = data['lines'][0]
        self.assertEqual(line['resale_source_sku'], 'POS-RESALE-SOLD')
        self.assertEqual(line['resale_source_item_id'], self.item_sold.pk)
        new_line = CartLine.objects.get(pk=line['id'])
        self.assertEqual(line['item'], new_line.item_id)
        self.assertEqual(new_line.item.sku, Item.objects.exclude(pk=self.item_sold.pk).latest('id').sku)

    def test_add_resale_copy_rejects_non_sold_source(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-resale-copy/',
            {'source_item_id': self.item_on_shelf.pk},
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json().get('code'), 'NOT_SOLD_FOR_RESALE')

    def test_add_resale_copy_requires_open_cart(self):
        cart = self._create_open_cart()
        cid = cart['id']
        Cart.objects.filter(pk=cid).update(status='completed')
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-resale-copy/',
            {'source_item_id': self.item_sold.pk},
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json().get('code'), 'CART_NOT_OPEN')

    def test_add_item_already_sold_includes_sku_and_title(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-RESALE-SOLD'},
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.content)
        data = r.json()
        self.assertEqual(data.get('code'), 'ITEM_ALREADY_SOLD')
        self.assertEqual(data.get('sku'), 'POS-RESALE-SOLD')
        self.assertEqual(data.get('title'), 'Sold for resale test')
