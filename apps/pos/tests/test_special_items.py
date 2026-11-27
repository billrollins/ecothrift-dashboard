"""Special items: one-tap pink tags in the Pink tag window (owner 2026-11-27, e.g. $1.99 Flannels)."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting, WorkLocation
from apps.inventory.models import PurchaseOrder, Vendor
from apps.inventory.services.order_card import order_card
from apps.pos.models import Cart, CartLine, Drawer, Register, SpecialItem


class SpecialItemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='special@example.com', first_name='Spec', last_name='Ial', password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)
        location = WorkLocation.objects.create(name='Special Location')
        register = Register.objects.create(location=location, name='Register SP', code='POS-SP')
        self.drawer = Drawer.objects.create(
            register=register, date=timezone.now().date(), current_cashier=self.user, opened_by=self.user,
            opened_at=timezone.now(), status='open',
        )
        self.po = PurchaseOrder.objects.create(
            vendor=Vendor.objects.create(name='Walmart', code='WSP'), order_number='SPECIAL-TEST-1',
            ordered_date=timezone.now().date(), total_cost=Decimal('100.00'),
        )
        SpecialItem.objects.all().delete()
        self.flannel = SpecialItem.objects.create(name='Flannels', price=Decimal('1.99'), purchase_order=self.po)

    def _cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()['id']

    def _add(self, cid, body):
        r = self.client.post(f'/api/pos/carts/{cid}/add-manual-line/', body, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_list_shows_active_only(self):
        SpecialItem.objects.create(name='Old', price=Decimal('5.00'), active=False)
        r = self.client.get('/api/pos/special-items/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([s['name'] for s in r.json()], ['Flannels'])
        self.assertEqual(r.json()[0]['price'], '1.99')

    def test_tap_adds_line_at_its_price_with_its_order(self):
        cid = self._cart()
        data = self._add(cid, {'description': 'ignored', 'special_item': self.flannel.pk})
        line = CartLine.objects.get(cart_id=cid)
        self.assertIsNone(line.item_id)
        self.assertEqual(line.description, 'Flannels')
        self.assertEqual(line.line_total, Decimal('1.99'))
        self.assertFalse(line.tax_exempt)
        self.assertEqual(line.meta, {'special_item': self.flannel.pk, 'order_id': self.po.pk})
        self.assertGreater(Decimal(str(data['tax_amount'])), 0)

    def test_inactive_special_is_refused(self):
        self.flannel.active = False
        self.flannel.save()
        body = {'description': 'x', 'special_item': self.flannel.pk}
        r = self.client.post(f'/api/pos/carts/{self._cart()}/add-manual-line/', body, format='json')
        self.assertEqual(r.status_code, 400)

    def test_black_friday_leaves_special_at_its_price(self):
        now = timezone.localtime()
        AppSetting.objects.update_or_create(key='pos.black_friday', defaults={'value': {
            'start': (now - timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M'),
            'end': (now + timedelta(hours=5)).strftime('%Y-%m-%dT%H:%M'),
        }})
        cid = self._cart()
        self._add(cid, {'description': 'ignored', 'special_item': self.flannel.pk})
        self._add(cid, {'description': 'Pink Tag Item', 'unit_price': '10.00'})
        special = CartLine.objects.get(cart_id=cid, description='Flannels')
        pink = CartLine.objects.get(cart_id=cid, description='Pink Tag Item')
        self.assertEqual(special.line_total, Decimal('1.99'))
        self.assertEqual(special.sale_off, Decimal('0'))
        self.assertLess(pink.line_total, Decimal('10.00'))  # a plain pink tag still gets Black Friday

    def test_taxable_switch_off(self):
        cid = self._cart()
        data = self._add(cid, {'description': 'Pink Tag Item', 'unit_price': '4.00', 'taxable': False})
        self.assertTrue(CartLine.objects.get(cart_id=cid).tax_exempt)
        self.assertEqual(Decimal(str(data['tax_amount'])), Decimal('0.00'))

    def test_completed_special_sales_count_toward_the_order(self):
        cid = self._cart()
        self._add(cid, {'description': 'x', 'special_item': self.flannel.pk})
        self._add(cid, {'description': 'x', 'special_item': self.flannel.pk})
        self.assertEqual(order_card(self.po.pk)['money']['sold_for'], '0.00')  # open sale: not yet
        Cart.objects.filter(pk=cid).update(status='completed')
        card = order_card(self.po.pk)
        self.assertEqual(card['money']['sold_for'], '3.98')
        self.assertEqual(card['units']['special_sold'], 2)
