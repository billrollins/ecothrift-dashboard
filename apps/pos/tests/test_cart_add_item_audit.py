"""POS add-item: structured errors and ItemScanHistory audit rows."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Category, Item, ItemScanHistory, Product
from apps.pos.models import CartLine, Drawer, Register


class CartAddItemAuditTests(TestCase):
    """Sold SKU, missing SKU, and successful add paths for add-item."""

    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='pos-audit@example.com',
            first_name='Pos',
            last_name='Audit',
            password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.location = WorkLocation.objects.create(name='POS Audit Location')
        self.register = Register.objects.create(
            location=self.location,
            name='Register Audit',
            code='POS-A1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        category = Category.objects.create(name='POS Audit Cat', slug='pos-audit-cat')
        self.item_on_shelf = Item.objects.create(
            sku='POS-AUDIT-SHELF',
            product=Product.objects.create(title='On shelf', brand='QA', category=category),
            price=Decimal('10.00'),
            status='on_shelf',
        )
        self.item_sold = Item.objects.create(
            sku='POS-AUDIT-SOLD',
            product=Product.objects.create(title='Sold unit', brand='QA', category=category),
            price=Decimal('7.50'),
            status='sold',
        )

    def _create_open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_add_item_sold_tag_in_hand_rings_up_and_its_old_sale_moves(self):
        """Owner, 2026-10-06: the register always adds. Two items shared the tag; the one in hand is real."""
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-AUDIT-SOLD'},
            format='json',
        )
        self.assertIn(r.status_code, (200, 201), r.content)
        self.assertTrue(CartLine.objects.filter(cart_id=cid, item=self.item_sold).exists())
        self.item_sold.refresh_from_db()
        self.assertEqual((self.item_sold.sku, self.item_sold.status), ('POS-AUDIT-SOLD', 'on_shelf'))
        twin = Item.objects.get(notes__startswith='SALE_MOVED_FROM:POS-AUDIT-SOLD')
        self.assertEqual(twin.status, 'sold')
        outcomes = list(ItemScanHistory.objects.filter(item=self.item_sold, cart_id=cid).values_list('outcome', flat=True))
        self.assertIn('pos_sold_tag_moved', outcomes)
        self.assertIn('added_to_cart', outcomes)

    def test_add_item_sold_consignment_still_stops_for_a_person(self):
        from unittest.mock import patch

        cart = self._create_open_cart()
        cid = cart['id']
        with patch('apps.inventory.services.duplicate_tag.why_not', return_value='consignment'):
            r = self.client.post(
                f'/api/pos/carts/{cid}/add-item/',
                {'sku': 'POS-AUDIT-SOLD'},
                format='json',
            )
        self.assertEqual(r.status_code, 400, r.content)
        data = r.json()
        self.assertEqual((data.get('code'), data.get('item_id')), ('ITEM_ALREADY_SOLD', self.item_sold.pk))
        scan = ItemScanHistory.objects.filter(item=self.item_sold).latest('scanned_at')
        self.assertEqual(scan.outcome, 'pos_blocked_sold')
        self.assertFalse(CartLine.objects.filter(cart_id=cid, item=self.item_sold).exists())

    def test_add_item_unknown_sku_returns_not_found_code(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-DOES-NOT-EXIST-99999'},
            format='json',
        )
        self.assertEqual(r.status_code, 404, r.content)
        self.assertEqual(r.json().get('code'), 'ITEM_NOT_FOUND')

    def test_add_item_success_logs_added_to_cart_with_cart_and_user(self):
        cart = self._create_open_cart()
        cid = cart['id']
        before = ItemScanHistory.objects.filter(
            item=self.item_on_shelf,
            outcome='added_to_cart',
        ).count()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-AUDIT-SHELF'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(
            ItemScanHistory.objects.filter(
                item=self.item_on_shelf,
                outcome='added_to_cart',
            ).count(),
            before + 1,
        )
        scan = ItemScanHistory.objects.filter(
            item=self.item_on_shelf,
            outcome='added_to_cart',
        ).latest('scanned_at')
        self.assertEqual(scan.cart_id, cid)
        self.assertEqual(scan.created_by_id, self.user.pk)
        self.assertEqual(len(r.json()['lines']), 1)
