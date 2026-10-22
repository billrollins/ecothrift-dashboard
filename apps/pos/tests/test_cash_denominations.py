"""Cash by denomination (2026-10-21, digest point 3): the cashier taps the bills and coins handed over, Dash says what
to give back from what the drawer holds, and the drawer keeps its contents by bill and coin."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase

from apps.inventory.models import Item
from apps.pos.models import Cart, Drawer, Register
from apps.pos.services.cash_counts import add_counts, describe, make_change

from .pin_helpers import manager_ok
from .test_cart_card_surcharge import _CartCardSurchargeFixtures

D = Decimal
FULL = {'hundreds': 2, 'fifties': 2, 'twenties': 10, 'tens': 10, 'fives': 10, 'ones': 30,
        'quarters': 40, 'dimes': 50, 'nickels': 40, 'pennies': 50}


class MakeChangeTests(SimpleTestCase):
    def test_fewest_pieces_from_a_full_drawer(self):
        self.assertEqual(make_change(D('12.60'), FULL), ({'tens': 1, 'ones': 2, 'quarters': 2, 'dimes': 1}, False))
        self.assertEqual(make_change(D('0.99'), FULL), ({'quarters': 3, 'dimes': 2, 'pennies': 4}, False))
        self.assertEqual(make_change(D('0'), FULL), ({}, False))

    def test_what_the_drawer_does_not_have_is_not_given(self):
        no_nickels = {**FULL, 'nickels': 0, 'pennies': 0}
        self.assertEqual(make_change(D('0.30'), no_nickels), ({'dimes': 3}, False))  # not a quarter and a nickel
        no_fives = {**FULL, 'fives': 0}
        self.assertEqual(make_change(D('7.00'), no_fives), ({'ones': 7}, False))

    def test_a_drawer_that_cannot_make_it_says_short(self):
        give, short = make_change(D('0.05'), {'quarters': 4})
        self.assertTrue(short)
        self.assertEqual(give, {'nickels': 1})  # the fewest pieces from any coins, so the screen can still say it

    def test_any_bills_when_the_drawer_is_unknown(self):
        self.assertEqual(make_change(D('57.00')), ({'fifties': 1, 'fives': 1, 'ones': 2}, False))

    def test_counts_add_and_read_out(self):
        self.assertEqual(add_counts({'ones': 2}, {'ones': 1, 'dimes': 3}), {'ones': 3, 'dimes': 3})
        self.assertEqual(add_counts({'ones': 2}, {'ones': 2}, -1), {})
        self.assertEqual(add_counts({}, {'quarters': 1}, -1), {'quarters': -1})  # drift shows at the count
        self.assertEqual(describe({'quarters': 2, 'fives': 1}), '1 × $5, 2 × quarters')


class RegisterCashTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        Drawer.objects.filter(pk=self.drawer.pk).update(contents=FULL)
        self._n = 0

    def _cart(self, price):
        self._n += 1
        item = Item.objects.create(sku=f'POSDEN{self._n:03d}', product=self.item.product, price=D(price),
                                   status='on_shelf')
        return self._open_cart_with_item(item.sku)[0]

    def _contents(self):
        self.drawer.refresh_from_db()
        return self.drawer.contents

    def test_tapped_bills_make_the_tender_and_dash_says_what_to_give_back(self):
        cid = self._cart('37.40')
        r = self._complete(cid, {'payment_method': 'cash', 'cash_received': {'twenties': 2}})
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((D(body['cash_tendered']), D(body['change_given'])), (D('40.00'), D('2.60')))
        self.assertEqual(body['cash_received'], {'twenties': 2})
        self.assertEqual(body['change_breakdown'], {'ones': 2, 'quarters': 2, 'dimes': 1})
        self.assertEqual((body['cash_received_typed'], body['change_short']), (False, False))
        after = self._contents()
        self.assertEqual((after['twenties'], after['ones'], after['quarters'], after['dimes']), (12, 28, 38, 49))
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, D('37.40'))

    def test_a_typed_amount_still_works_and_the_bills_are_guessed(self):
        cid = self._cart('37.40')
        body = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '50.00'}).json()
        self.assertEqual((body['cash_received'], body['cash_received_typed']), ({'fifties': 1}, True))
        self.assertEqual(body['change_breakdown'], {'tens': 1, 'ones': 2, 'quarters': 2, 'dimes': 1})

    def test_tapped_and_typed_must_agree(self):
        cid = self._cart('10.00')
        r = self._complete(cid, {'payment_method': 'cash', 'cash_received': {'tens': 1}, 'cash_tendered': '20.00'})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'CASH_MISMATCH'))
        r = self._complete(cid, {'payment_method': 'cash', 'cash_received': {'twos': 1}})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'INVALID_COUNT'))
        r = self._complete(cid, {'payment_method': 'cash', 'cash_received': {'fives': 1}})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'CASH_SHORT'))
        self.assertEqual(Cart.objects.get(pk=cid).status, 'open')
        self.assertEqual(self._contents(), FULL)

    def test_split_puts_its_cash_in_and_gives_nothing_back(self):
        cid = self._cart('100.00')
        r = self._complete(cid, {'payment_method': 'split', 'cash_received': {'twenties': 2}, 'card_amount': '60.00',
                                 'card_type': 'debit'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['change_breakdown'], self._contents()['twenties']), ({}, 12))

    def test_a_drawer_short_of_coins_says_so(self):
        Drawer.objects.filter(pk=self.drawer.pk).update(contents={'twenties': 5})
        cid = self._cart('19.95')
        body = self._complete(cid, {'payment_method': 'cash', 'cash_received': {'twenties': 1}}).json()
        self.assertEqual((body['change_breakdown'], body['change_short']), ({'nickels': 1}, True))
        self.assertEqual(self._contents(), {'twenties': 6, 'nickels': -1})  # the count will show where it went

    def test_drops_and_voids_keep_the_contents(self):
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        cid = self._cart('37.40')
        self._complete(cid, {'payment_method': 'cash', 'cash_received': {'twenties': 2}})
        self.assertEqual(self.client.post(f'/api/pos/carts/{cid}/void/', manager_ok()[1], format='json').status_code, 200)
        self.assertEqual(self._contents(), FULL)
        r = self.client.post(f'/api/pos/drawers/{self.drawer.id}/drop/', {'amount': {'hundreds': 2}, 'reason': 'Big bills'},
                             format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertNotIn('hundreds', self._contents())

    def test_a_new_drawer_starts_with_its_opening_count(self):
        reg = Register.objects.create(location=self.location, name='Register E', code='POS-E2')
        r = self.client.post('/api/pos/drawers/', {'register': reg.id, 'opening_count': {'ones': 50, 'quarters': 40}},
                             format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['contents'], {'ones': 50, 'quarters': 40})

    def test_the_training_register_shows_change_and_touches_no_drawer(self):
        Register.objects.filter(pk=self.register.pk).update(is_training=True)
        cid = self._cart('3.50')
        body = self._complete(cid, {'payment_method': 'cash', 'cash_received': {'fives': 1}}).json()
        self.assertEqual((body['status'], body['change_breakdown']), ('training', {'ones': 1, 'quarters': 2}))
        self.assertEqual(self._contents(), FULL)
