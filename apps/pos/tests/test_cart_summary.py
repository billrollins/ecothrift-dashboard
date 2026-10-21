"""Transactions page totals: same filters as the list, money from completed sales only (2026-10-19)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase

from apps.thriftplus.tests.test_register import RegisterBase

from .test_cart_card_surcharge import _CartCardSurchargeFixtures
from apps.pos.tests.pin_helpers import manager_ok


class CartSummaryTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])

    def _summary(self, **params):
        r = self.client.get('/api/pos/carts/summary/', {'status': 'all', **params})
        self.assertEqual(r.status_code, 200, r.content)
        return r.data

    def test_voided_sales_are_counted_but_not_added_to_the_money(self):
        cid, cart = self._open_cart_with_item()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total']})
        self.assertEqual(self.client.post(f'/api/pos/carts/{cid}/void/', manager_ok()[1], format='json').status_code, 200)
        cid, cart = self._open_cart_with_item()
        done = self._complete(cid, {'payment_method': 'card', 'card_amount': cart['total'], 'card_type': 'debit',
                                    'card_charged_total': cart['total']})
        self.assertEqual(done.status_code, 200, done.content)

        s = self._summary()
        self.assertEqual((s['count'], s['voided_count']), (1, 1))
        self.assertEqual(s['total'], cart['total'])
        self.assertEqual(s['average'], cart['total'])
        self.assertEqual(s['by_method'], {'card': cart['total']})

    def test_filters_match_the_list(self):
        cid, cart = self._open_cart_with_item()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total']})
        self.assertEqual(self._summary(payment_method='card')['count'], 0)
        self.assertEqual(self._summary(payment_method='cash')['count'], 1)
        self.assertEqual(self._summary(date_from='2000-01-01', date_to='2000-01-02')['count'], 0)
        self.assertEqual(self._summary(payment_method='card')['average'], '0')

    def test_search_finds_a_receipt_and_a_guest_sale_has_no_thrift_row(self):
        cid, cart = self._open_cart_with_item()
        done = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total']})
        number = done.data['receipt']['receipt_number']
        r = self.client.get('/api/pos/carts/', {'status': 'all', 'q': number[-5:]})
        self.assertEqual([c['id'] for c in r.data['results']], [cid])
        self.assertIsNone(r.data['results'][0]['thrift_row'])
        self.assertEqual(self.client.get('/api/pos/carts/', {'status': 'all', 'q': 'nobody-by-this-name'}).data['count'], 0)


class CartThriftColumnsTests(RegisterBase):
    def _buy(self, sku, choice='bank'):
        cart = self._cart(sku)
        self._attach(cart['id'])
        if choice == 'instant':
            self._choice(cart['id'], 'instant')
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        return done.json()

    def test_member_sales_show_who_and_their_thriftbucks_and_search_by_name(self):
        kept = self._buy('ITMTPLAMP')
        instant = self._buy('ITMTPVASE', choice='instant')
        r = self.api.get('/api/pos/carts/', {'status': 'all', 'q': 'ana'})
        rows = {c['id']: c['thrift_row'] for c in r.json()['results']}
        self.assertEqual(set(rows), {kept['id'], instant['id']})
        self.assertTrue(rows[kept['id']]['member'].startswith('Ana'))
        self.assertEqual(rows[kept['id']]['earned'], '35.00')
        self.assertEqual(Decimal(rows[kept['id']]['instant']), Decimal('0'))
        self.assertGreater(Decimal(rows[instant['id']]['instant']), 0)
        summary = self.api.get('/api/pos/carts/summary/', {'status': 'all'}).json()
        self.assertEqual(summary['thrift_count'], 2)
