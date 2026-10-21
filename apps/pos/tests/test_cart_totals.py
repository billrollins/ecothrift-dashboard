"""Regression tests: cart subtotal/tax/total stay aligned with line totals after mutations."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.db.models import Sum
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.inventory.models import Category, Item, Product
from apps.pos.models import Cart, CartLine, Drawer, Register
from apps.pos.tests.pin_helpers import manager_ok


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
        category = Category.objects.create(name='POS Totals Cat', slug='pos-totals-cat')
        self.item_a = Item.objects.create(
            sku='POS-T-SKU-A',
            product=Product.objects.create(title='Item A', brand='QA', category=category),
            price=Decimal('7.50'),
            status='on_shelf',
        )
        self.item_b = Item.objects.create(
            sku='POS-T-SKU-B',
            product=Product.objects.create(title='Item B', brand='QA', category=category),
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

    def test_add_same_sku_twice_rings_the_next_unit_and_totals_match(self):
        # Two units of one thing from one order: the second scan of the tag rings the next unit (2026-10-20).
        from apps.inventory.models import PurchaseOrder, Vendor

        order = PurchaseOrder.objects.create(
            vendor=Vendor.objects.create(name='Totals Vendor', code='TOV'), order_number='PO-TOT-1',
            ordered_date='2026-10-01', purchase_cost=Decimal('10.00'), retail_value=Decimal('100.00'),
            status='processing',
        )
        Item.objects.filter(pk=self.item_a.pk).update(purchase_order=order)
        Item.objects.create(
            sku='POS-T-SKU-A2', product=self.item_a.product, purchase_order=order, price=Decimal('7.50'),
            status='on_shelf',
        )
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
        self.assertEqual(len(data['lines']), 2)
        self.assertEqual([ln['quantity'] for ln in data['lines']], [1, 1])
        self.assertEqual(Decimal(str(data['subtotal'])), Decimal('15.00'))
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
        # A line already holding 5 (made before one-unit-per-line, 2026-10-20); the cashier lowers it to 4.
        CartLine.objects.filter(pk=line_id).update(quantity=5)
        r = self.client.patch(
            f'/api/pos/carts/{cid}/lines/{line_id}/',
            {'quantity': 4},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['lines'][0]['quantity'], 4)
        assert_cart_totals_match_lines(self, data)

    def test_patch_line_price_with_cents_from_json(self):
        """The terminal sends an edited price as a JSON number (a float in Python)."""
        cart = self._create_open_cart()
        cid = cart['id']
        r0 = self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': 'POS-T-SKU-A'}, format='json')
        line_id = r0.json()['lines'][0]['id']
        CartLine.objects.filter(pk=line_id).update(quantity=3)  # a line made before one-unit-per-line (2026-10-20)
        r = self.client.patch(
            f'/api/pos/carts/{cid}/lines/{line_id}/',
            {'quantity': 3, 'description': 'Item A', 'unit_price': 12.99, **manager_ok()[1]},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(Decimal(str(data['lines'][0]['unit_price'])), Decimal('12.99'))
        self.assertEqual(Decimal(str(data['lines'][0]['line_total'])), Decimal('38.97'))
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
            description=self.item_a.product.title,
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

    def test_a_dark_register_is_untouched_by_thrift_plus(self):
        """Thrift+ is off here (the switch off, not a test or training register): recalculate never runs the Thrift+
        sync or post-total hook, writes no Thrift+ line and leaves the credit at zero (owner: POS must never break)."""
        from unittest import mock

        from apps.thriftplus.services import register

        cart = self._create_open_cart()
        with mock.patch.object(register, 'after_totals_if_live') as hook, mock.patch.object(register, 'sync') as sync:
            r = self.client.post(f"/api/pos/carts/{cart['id']}/add-item/", {'sku': 'POS-T-SKU-A'}, format='json')
            Cart.objects.get(pk=cart['id']).recalculate()
        self.assertEqual(r.status_code, 200, r.content)
        hook.assert_not_called()
        sync.assert_not_called()
        data = r.json()
        assert_cart_totals_match_lines(self, data)
        self.assertEqual((data['subtotal'], data['total'], data['thrift_credit'], data['thrift_plus']),
                         ('7.50', '8.02', '0.00', None))
        self.assertEqual([l['thrift_savings'] for l in data['lines']], ['0.00'])
        self.assertFalse(CartLine.objects.filter(cart_id=cart['id'], line_kind='discount').exists())
