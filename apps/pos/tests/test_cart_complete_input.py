"""Cart complete: a malformed money payload is a clean 400 with a plain message, never a 500 (2026-10-20)."""
from decimal import Decimal

from django.test import TestCase

from apps.pos.models import Cart
from apps.pos.services.card_surcharge import CardSurchargeError, parse_money

from .test_cart_card_surcharge import _CartCardSurchargeFixtures


class ParseMoneyTests(TestCase):
    def test_good_amounts(self):
        for raw, want in [
            ('20', '20.00'), ('20.5', '20.50'), (' 20.00 ', '20.00'), (0, '0.00'), (12, '12.00'),
            (20.5, '20.50'), (65.60000000000001, '65.60'), (Decimal('1.10'), '1.10'), ('0.00', '0.00'),
            ('99999999.99', '99999999.99'),
        ]:
            self.assertEqual(parse_money(raw, 'Amount'), Decimal(want), raw)

    def test_blank_is_none_unless_required(self):
        for blank in (None, '', '   '):
            self.assertIsNone(parse_money(blank, 'Amount'))
            with self.assertRaises(CardSurchargeError):
                parse_money(blank, 'Amount', required=True)

    def test_bad_amounts_are_refused_with_a_message(self):
        bad = [
            'abc', '12abc', '$20', '1,000', 'NaN', 'nan', 'Infinity', '-Infinity', 'inf', '1e5', '1_000', '0x10',
            float('nan'), float('inf'), float('-inf'), True, False, [], [1], {}, {'a': 1}, object(),
            '-1', -1, -0.01, '20.001', 20.005, '0.001', '100000000', 1e300, 10 ** 30, '9' * 400, '--1', '.',
        ]
        for raw in bad:
            with self.assertRaises(CardSurchargeError, msg=repr(raw)) as ctx:
                parse_money(raw, 'Cash tendered')
            self.assertIn('Cash tendered', str(ctx.exception))


class CartCompleteInputTests(_CartCardSurchargeFixtures, TestCase):
    def _refused(self, payload, text=None, code='INVALID_AMOUNT'):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, payload)
        self.assertEqual(r.status_code, 400, (payload, r.content))
        self.assertTrue(r.json().get('detail'))
        if code:
            self.assertEqual(r.json().get('code'), code)
        if text:
            self.assertIn(text, r.json()['detail'])
        # nothing was written
        c = Cart.objects.get(pk=cid)
        self.assertEqual(c.status, 'open')
        self.assertIsNone(c.cash_tendered)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'on_shelf')
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.cash_sales_total, Decimal('0.00'))

    def test_cash_refuses_malformed_cash_tendered(self):
        for bad in ['abc', 'NaN', 'Infinity', '-Infinity', '-5', -5, '20.001', 20.005, '', None, True, [], {},
                    '1e400', '1' * 40, 1e300]:
            self._refused({'payment_method': 'cash', 'cash_tendered': bad}, 'Cash tendered')

    def test_cash_refuses_a_missing_cash_tendered(self):
        self._refused({'payment_method': 'cash'}, 'Cash tendered is required')
        self._refused({}, 'Cash tendered is required')

    def test_split_refuses_malformed_cash_and_card_amounts(self):
        for bad in ['abc', 'NaN', 'Infinity', '-1', '10.123']:
            self._refused(
                {'payment_method': 'split', 'cash_tendered': bad, 'card_amount': '60.00', 'card_type': 'debit'},
                'Cash tendered',
            )
            self._refused(
                {'payment_method': 'split', 'cash_tendered': '40.00', 'card_amount': bad, 'card_type': 'debit'},
                'Card amount',
            )

    def test_other_money_fields_are_checked_too(self):
        for bad in ['abc', 'NaN', 'Infinity', '-3', '1.234']:
            self._refused({'payment_method': 'cash', 'cash_tendered': '100.00', 'change_given': bad}, 'Change given')
        for bad in ['abc', 'NaN', 'Infinity', '-3']:
            self._refused(
                {'payment_method': 'card', 'card_amount': '100.00', 'card_type': 'debit', 'card_charged_total': bad},
                'Card charged total',
            )

    def test_odd_shapes_are_a_400_not_a_500(self):
        self._refused({'payment_method': ['cash'], 'cash_tendered': '100.00'}, code=None)
        self._refused({'payment_method': {'a': 1}, 'cash_tendered': '100.00'}, code=None)
        self._refused({'payment_method': 'card', 'card_amount': '100.00', 'card_type': 5}, code=None)
        self._refused({'payment_method': 'payroll', 'payroll_employee': 'abc'}, code='PAYROLL_NOT_ALLOWED')
        self._refused({'payment_method': 'payroll', 'payroll_employee': [1]}, code='PAYROLL_NOT_ALLOWED')
        self._refused({'payment_method': 'payroll', 'payroll_employee': 10 ** 30}, code='PAYROLL_NOT_ALLOWED')

    def test_a_list_body_is_a_400(self):
        cid, _ = self._open_cart_with_item()
        r = self.client.post(f'/api/pos/carts/{cid}/complete/', [1, 2], format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_good_payloads_still_go_through(self):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': 100, 'change_given': '0.00'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Decimal(r.json()['cash_tendered']), Decimal('100.00'))

    def test_float_amounts_from_the_register_still_go_through(self):
        cid, cart = self._open_cart_with_item()
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': 100.0})
        self.assertEqual(r.status_code, 200, r.content)
