"""Void: a paid sale gives back its drawer cash and items; an unpaid one touches neither (2026-10-06)."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase

from apps.pos.models import Cart

from .test_cart_card_surcharge import _CartCardSurchargeFixtures


class CartVoidTests(_CartCardSurchargeFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])

    def _void(self, cid):
        return self.client.post(f'/api/pos/carts/{cid}/void/')

    def _cash(self):
        self.drawer.refresh_from_db()
        return self.drawer.cash_sales_total

    def test_voiding_a_paid_cash_sale_takes_its_cash_out_and_puts_the_item_back(self):
        cid, cart = self._open_cart_with_item()
        self.assertEqual(self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total']}).status_code, 200)
        self.assertEqual(self._cash(), Decimal('100.00'))
        self.assertEqual(self._void(cid).status_code, 200)
        self.assertEqual(self._cash(), Decimal('0.00'))
        self.item.refresh_from_db()
        self.assertEqual((self.item.status, self.item.sold_at, self.item.sold_for), ('on_shelf', None, None))

    def test_split_gives_back_only_the_cash_part_and_card_gives_back_none(self):
        cid, cart = self._open_cart_with_item()
        done = self._complete(cid, {'payment_method': 'split', 'cash_tendered': '40.00', 'card_amount': '60.00',
                                    'card_type': 'debit', 'card_charged_total': '60.00'})
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(self._cash(), Decimal('40.00'))
        self.assertEqual(self._void(cid).status_code, 200)
        self.assertEqual(self._cash(), Decimal('0.00'))

        cid, cart = self._open_cart_with_item()
        self._complete(cid, {'payment_method': 'card', 'card_amount': cart['total'], 'card_type': 'debit',
                             'card_charged_total': cart['total']})
        self.assertEqual(self._void(cid).status_code, 200)
        self.assertEqual(self._cash(), Decimal('0.00'))

    def test_voiding_an_unpaid_copy_leaves_the_paid_sale_alone(self):
        """A slow register opened the same scan in two carts; one was paid, the other voided."""
        extra, _ = self._open_cart_with_item()
        paid, cart = self._open_cart_with_item()
        self._complete(paid, {'payment_method': 'cash', 'cash_tendered': cart['total']})
        self.assertEqual(self._void(extra).status_code, 200)
        self.item.refresh_from_db()
        self.assertEqual(self.item.status, 'sold')
        self.assertIsNotNone(self.item.sold_at)
        self.assertEqual(self._cash(), Decimal('100.00'))

    def test_a_second_void_is_refused_and_takes_nothing_twice(self):
        cid, cart = self._open_cart_with_item()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': cart['total']})
        self.assertEqual(self._void(cid).status_code, 200)
        self.assertEqual(self._void(cid).status_code, 400)
        self.assertEqual(self._cash(), Decimal('0.00'))
        self.assertEqual(Cart.objects.get(pk=cid).status, 'voided')
