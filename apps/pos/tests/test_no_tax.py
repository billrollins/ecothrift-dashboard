"""Per-line "No tax" (Bill, 2026-10-21: "we started selling pop"): a line can be left untaxed; the rest of the sale is
taxed as usual, and the sales tax report shows exempt sales apart."""
from datetime import datetime, time
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.core.models import AppSetting
from apps.inventory.models import Item
from apps.pos.models import Cart, CartLine

from .test_cart_card_surcharge import _CartCardSurchargeFixtures

D = Decimal


class NoTaxLineTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        AppSetting.objects.update_or_create(key='tax_rate', defaults={'value': '0.07', 'description': 'test tax'})
        self.lamp = Item.objects.create(sku='POSNT001', product=self.item.product, price=D('20.00'), status='on_shelf')

    def _sale_with_pop(self):
        cid, _ = self._open_cart_with_item(self.lamp.sku)
        pop = self.client.post(f'/api/pos/carts/{cid}/add-manual-line/',
                               {'description': 'Pop', 'unit_price': '1.50'}, format='json').json()
        pop_line = next(ln for ln in pop['lines'] if ln['description'] == 'Pop')
        return cid, pop_line['id']

    def _no_tax(self, cid, line_id, value=True):
        return self.client.patch(f'/api/pos/carts/{cid}/lines/{line_id}/', {'tax_exempt': value}, format='json')

    def test_a_no_tax_line_is_left_out_of_the_tax(self):
        cid, pop = self._sale_with_pop()
        self.assertEqual(Cart.objects.get(pk=cid).tax_amount, D('1.50'))  # 21.50 × 7% = 1.505, rounded as before
        r = self._no_tax(cid, pop)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['subtotal'], body['tax_amount'], body['total']), ('21.50', '1.40', '22.90'))
        self.assertTrue(next(ln for ln in body['lines'] if ln['id'] == pop)['tax_exempt'])
        back = self._no_tax(cid, pop, False).json()
        self.assertEqual(back['tax_amount'], '1.50')

    def test_no_pin_and_only_true_or_false(self):
        cid, pop = self._sale_with_pop()
        for bad in ('yes', 1, None):
            r = self._no_tax(cid, pop, bad)
            self.assertEqual((r.status_code, r.json()['code']), (400, 'INVALID_TAX_EXEMPT'), bad)

    def test_a_discount_on_a_no_tax_line_is_untaxed_too(self):
        cid, pop = self._sale_with_pop()
        self._no_tax(cid, pop)
        r = self.client.post(f'/api/pos/carts/{cid}/add-discount/',
                             {'amount': '0.25', 'reason': 'Dented can', 'target_line_id': pop}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['tax_amount'], '1.40')  # the lamp's tax only
        disc = CartLine.objects.get(cart_id=cid, line_kind='discount')
        self.assertTrue(disc.tax_exempt)
        refused = self._no_tax(cid, disc.pk, False)
        self.assertEqual(refused.json()['code'], 'INVALID_TARGET')

    def test_a_paid_sale_keeps_its_lower_tax(self):
        cid, pop = self._sale_with_pop()
        self._no_tax(cid, pop)
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '23.00'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['tax_amount'], r.json()['change_given']), ('1.40', '0.10'))


def _at(y, m, d, hour=12):
    return timezone.make_aware(datetime.combine(datetime(y, m, d).date(), time(hour)), timezone.get_current_timezone())


class ExemptSalesReportTests(_CartCardSurchargeFixtures, TestCase):
    def test_the_report_shows_exempt_sales_apart(self):
        from apps.accounts.models import User

        owner = User.objects.create_superuser(email='nt-owner@example.com', first_name='O', last_name='W',
                                              password='x-pass-123')
        cart = Cart.objects.create(drawer=self.drawer, cashier=self.user, status='completed', payment_method='cash',
                                   tax_rate=D('0.07'))
        CartLine.objects.create(cart=cart, description='Lamp', unit_price=D('20.00'), line_kind='item')
        CartLine.objects.create(cart=cart, description='Pop', unit_price=D('1.50'), line_kind='manual', tax_exempt=True)
        cart.recalculate()
        Cart.objects.filter(pk=cart.pk).update(completed_at=_at(2026, 10, 21))
        self.client.force_authenticate(owner)
        d = self.client.get('/api/pos/reports/sales-tax/', {'start': '2026-10-01', 'end': '2026-10-31'}).data
        self.assertEqual((d['gross_sales'], d['exempt_sales'], d['taxable_sales'], d['tax_collected']),
                         ('21.50', '1.50', '20.00', '1.40'))
        self.assertEqual((d['rates'][0]['taxable'], d['rates'][0]['tax_at_rate'], d['rounding']), ('20.00', '1.40', '0.00'))
        self.assertEqual(d['days'][0]['taxable'], '20.00')
