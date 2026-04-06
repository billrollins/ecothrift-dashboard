"""Regression tests: cart subtotal/tax/total stay aligned with line totals after mutations."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.db.models import Sum
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Item
from apps.pos.models import Cart, CartLine, Drawer, Register


def assert_cart_totals_match_lines(testcase, data):
    """Top-level subtotal/tax_amount/total must match nested lines (same rules as Cart.recalculate)."""
    tax_rate = Decimal(str(data['tax_rate']))
    subtotal = sum((Decimal(str(l['line_total'])) for l in data['lines']), Decimal('0'))
    tax = (subtotal * tax_rate).quantize(Decimal('0.01'))
    total = subtotal + tax
    testcase.assertEqual(Decimal(str(data['subtotal'])), subtotal)
    testcase.assertEqual(Decimal(str(data['tax_amount'])), tax)
    testcase.assertEqual(Decimal(str(data['total'])), total)


class CartTotalsAPITests(TestCase):
    """POST add-item and PATCH/DELETE lines must return coherent aggregates (no stale prefetch)."""

    def setUp(self):
        self.client = APIClient()
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='pos-test@example.com',
            first_name='Pos',
            last_name='Tester',
            password='test-pass-123',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(user=self.user)

        self.location = WorkLocation.objects.create(name='POS Test Location')
        self.register = Register.objects.create(
            location=self.location,
            name='Register 1',
            code='POS-T1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        self.item_a = Item.objects.create(
            sku='POS-T-SKU-A',
            title='Item A',
            price=Decimal('7.50'),
            status='on_shelf',
        )
        self.item_b = Item.objects.create(
            sku='POS-T-SKU-B',
            title='Item B',
            price=Decimal('5.00'),
            status='on_shelf',
        )

    def _create_open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.json()

    def test_add_item_first_line_totals_match_lines(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-T-SKU-A'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(len(data['lines']), 1)
        assert_cart_totals_match_lines(self, data)

    def test_add_same_sku_twice_totals_match_incremented_quantity(self):
        cart = self._create_open_cart()
        cid = cart['id']
        self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'POS-T-SKU-A'}, format='json')
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-T-SKU-A'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(len(data['lines']), 1)
        self.assertEqual(data['lines'][0]['quantity'], 2)
        assert_cart_totals_match_lines(self, data)

    def test_add_second_sku_totals_match_both_lines(self):
        cart = self._create_open_cart()
        cid = cart['id']
        self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'POS-T-SKU-A'}, format='json')
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-T-SKU-B'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(len(data['lines']), 2)
        assert_cart_totals_match_lines(self, data)

    def test_patch_line_quantity_totals_stay_coherent(self):
        cart = self._create_open_cart()
        cid = cart['id']
        r0 = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-T-SKU-A'},
            format='json',
        )
        line_id = r0.json()['lines'][0]['id']
        r = self.client.patch(
            f'/api/pos/carts/{cid}/lines/{line_id}/',
            {'quantity': 4},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['lines'][0]['quantity'], 4)
        assert_cart_totals_match_lines(self, data)

    def test_delete_line_totals_stay_coherent(self):
        cart = self._create_open_cart()
        cid = cart['id']
        self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'POS-T-SKU-A'}, format='json')
        r1 = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': 'POS-T-SKU-B'},
            format='json',
        )
        lines = r1.json()['lines']
        self.assertEqual(len(lines), 2)
        line_b = next(ln for ln in lines if ln['description'] == 'Item B')
        r = self.client.delete(f'/api/pos/carts/{cid}/lines/{line_b["id"]}/')
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(len(data['lines']), 1)
        assert_cart_totals_match_lines(self, data)

    def test_recalculate_uses_fresh_lines_not_prefetch(self):
        """Direct ORM: mutate lines on a prefetched cart; aggregates must match DB lines."""
        cart = Cart.objects.create(
            drawer=self.drawer,
            cashier=self.user,
            tax_rate=Decimal('0.0700'),
        )
        qs = Cart.objects.select_related('drawer', 'cashier', 'receipt').prefetch_related('lines')
        cart_pf = qs.get(pk=cart.pk)

        CartLine.objects.create(
            cart=cart_pf,
            item=self.item_a,
            description=self.item_a.title,
            quantity=1,
            unit_price=self.item_a.price,
        )
        cart_pf.recalculate()
        cart_pf.refresh_from_db()
        line_sum = CartLine.objects.filter(cart_id=cart_pf.pk).aggregate(
            s=Sum('line_total'),
        )['s'] or Decimal('0')
        self.assertEqual(cart_pf.subtotal, line_sum)
        tax = (line_sum * cart_pf.tax_rate).quantize(Decimal('0.01'))
        self.assertEqual(cart_pf.tax_amount, tax)
        self.assertEqual(cart_pf.total, line_sum + tax)
