"""Lock the till (2026-10-21, REG-01/02/04/07/15): the cash path, end to end.

Sales and drawers change only through the register's own actions; the server works out the change; a double tap
cannot complete a sale twice; every drawer count is checked; the supplemental recount records what was counted.
"""
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.inventory.models import Item
from apps.pos.models import (
    Cart, CashDrop, Drawer, DrawerHandoff, Register, SupplementalDrawer, SupplementalTransaction,
)
from apps.pos.views import CartViewSet

from .test_cart_card_surcharge import _CartCardSurchargeFixtures
from apps.pos.tests.pin_helpers import manager_ok

COUNT_120 = {'twenties': 5, 'tens': 1, 'fives': 1, 'ones': 4, 'quarters': 4}  # $120.00


class _CashPathFixtures(_CartCardSurchargeFixtures):
    def setUp(self):
        super().setUp()
        self.manager = User.objects.create_user(
            email='pos-manager@example.com', first_name='Mona', last_name='Manager', password='test-pass-123',
        )
        self.manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self._n = 0

    def _new_item(self, price='100.00'):
        self._n += 1
        return Item.objects.create(
            sku=f'POSCASH{self._n:03d}', product=self.item.product, price=Decimal(price), status='on_shelf',
        )

    def _cart(self, price='100.00'):
        return self._open_cart_with_item(self._new_item(price).sku)

    def _cash(self):
        self.drawer.refresh_from_db()
        return self.drawer.cash_sales_total

    def _as(self, user):
        self.client.force_authenticate(user=user)


class SaleRecordsLockedTests(_CashPathFixtures, TestCase):
    def test_a_cashier_cannot_edit_or_delete_a_sale_record(self):
        cid, _ = self._cart()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self.assertEqual(self.client.patch(f'/api/pos/carts/{cid}/', {'cash_tendered': '0.00'},
                                           format='json').status_code, 403)
        self.assertEqual(self.client.put(f'/api/pos/carts/{cid}/', {'drawer': self.drawer.id},
                                         format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/pos/carts/{cid}/').status_code, 403)
        self.assertEqual(Cart.objects.get(pk=cid).status, 'completed')

    def test_money_and_status_fields_are_read_only_even_for_a_manager(self):
        cid, _ = self._cart()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '120.00'})
        self._as(self.manager)
        r = self.client.patch(f'/api/pos/carts/{cid}/', {
            'status': 'open', 'payment_method': 'card', 'cash_tendered': '1.00', 'change_given': '0.00',
            'card_amount': '5.00', 'total': '1.00', 'completed_at': None,
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        c = Cart.objects.get(pk=cid)
        self.assertEqual((c.status, c.payment_method, c.cash_tendered, c.change_given, c.total),
                         ('completed', 'cash', Decimal('120.00'), Decimal('20.00'), Decimal('100.00')))
        self.assertIsNotNone(c.completed_at)

    def test_a_manager_deletes_only_an_open_sale(self):
        cid, _ = self._cart()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        open_id, _ = self._cart()
        self._as(self.manager)
        self.assertEqual(self.client.delete(f'/api/pos/carts/{cid}/').status_code, 409)
        self.assertEqual(self.client.delete(f'/api/pos/carts/{open_id}/').status_code, 204)
        self.assertTrue(Cart.objects.filter(pk=cid).exists())

    def test_a_new_sale_always_starts_open(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id, 'status': 'completed',
                                                 'cash_tendered': '50.00', 'payment_method': 'card'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        c = Cart.objects.get(pk=r.data['id'])
        self.assertEqual((c.status, c.payment_method, c.cash_tendered), ('open', 'cash', None))

    def test_a_finished_sale_takes_no_new_items_or_line_changes(self):
        cid, cart = self._cart()
        line_id = cart['lines'][0]['id']
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        add = self.client.post(f'/api/pos/carts/{cid}/add-item/', {'sku': self._new_item().sku}, format='json')
        self.assertEqual((add.status_code, add.json()['code']), (400, 'SALE_FINISHED'))
        edit = self.client.patch(f'/api/pos/carts/{cid}/lines/{line_id}/', {'unit_price': '0.01'}, format='json')
        self.assertEqual((edit.status_code, edit.json()['code']), (400, 'SALE_FINISHED'))
        self.assertEqual(self.client.delete(f'/api/pos/carts/{cid}/lines/{line_id}/').status_code, 400)
        self.assertEqual(Cart.objects.get(pk=cid).total, Decimal('100.00'))


class ServerWorksOutChangeTests(_CashPathFixtures, TestCase):
    def _refused(self, payload, code, price='100.00'):
        cid, _ = self._cart(price)
        r = self._complete(cid, payload)
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.json()['code'], code)
        self.assertEqual(Cart.objects.get(pk=cid).status, 'open')
        self.assertEqual(self._cash(), Decimal('0.00'))

    def test_cash_change_is_worked_out_on_the_server(self):
        cid, _ = self._cart('37.40')
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '50.00'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((Decimal(r.json()['cash_tendered']), Decimal(r.json()['change_given'])),
                         (Decimal('50.00'), Decimal('12.60')))
        self.assertEqual(self._cash(), Decimal('37.40'))  # the drawer keeps the sale, not the $50 bill

    def test_a_matching_change_from_the_screen_is_fine(self):
        cid, _ = self._cart('37.40')
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '40.00', 'change_given': '2.60'})
        self.assertEqual(r.status_code, 200, r.content)

    def test_short_cash_and_wrong_change_are_refused(self):
        self._refused({'payment_method': 'cash', 'cash_tendered': '99.99'}, 'CASH_SHORT')
        self._refused({'payment_method': 'cash', 'cash_tendered': '120.00', 'change_given': '25.00'},
                      'CHANGE_MISMATCH')
        self._refused({'payment_method': 'cash', 'cash_tendered': '120.00', 'change_given': '0.00'},
                      'CHANGE_MISMATCH')

    def test_split_parts_must_add_up(self):
        base = {'payment_method': 'split', 'card_type': 'debit'}
        self._refused({**base, 'cash_tendered': '40.00', 'card_amount': '50.00'}, 'SPLIT_MISMATCH')
        self._refused({**base, 'cash_tendered': '100.00', 'card_amount': '0.00'}, 'SPLIT_MISMATCH')
        self._refused({**base, 'cash_tendered': '0.00', 'card_amount': '100.00'}, 'SPLIT_MISMATCH')
        self._refused({**base, 'cash_tendered': '40.00', 'card_amount': '60.00', 'change_given': '5.00'},
                      'CHANGE_MISMATCH')
        cid, _ = self._cart()
        ok = self._complete(cid, {**base, 'cash_tendered': '40.00', 'card_amount': '60.00'})
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(self._cash(), Decimal('40.00'))

    def test_card_amount_must_match_the_total(self):
        self._refused({'payment_method': 'card', 'card_type': 'debit', 'card_amount': '10.00'}, 'CARD_MISMATCH')
        cid, _ = self._cart()
        r = self._complete(cid, {'payment_method': 'card', 'card_type': 'debit', 'card_amount': '100.00',
                                 'cash_tendered': '500.00'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIsNone(r.json()['cash_tendered'])  # cash typed on a card sale is not recorded
        self.assertEqual(self._cash(), Decimal('0.00'))

    def test_a_sale_on_a_closed_drawer_is_refused(self):
        cid, _ = self._cart()
        Drawer.objects.filter(pk=self.drawer.pk).update(status='closed')
        r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self.assertEqual((r.status_code, r.json()['code']), (400, 'DRAWER_CLOSED'))

    def test_cash_sale_then_void_leaves_the_drawer_where_it_started(self):
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        cid, _ = self._cart('37.40')
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self.assertEqual(self._cash(), Decimal('37.40'))
        self.assertEqual(self.client.post(f'/api/pos/carts/{cid}/void/', manager_ok()[1], format='json').status_code, 200)
        self.assertEqual(self._cash(), Decimal('0.00'))


class DoubleTapTests(_CashPathFixtures, TestCase):
    def test_a_second_complete_is_refused_and_counts_nothing_twice(self):
        cid, _ = self._cart()
        self.assertEqual(self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'}).status_code, 200)
        again = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self.assertEqual(again.status_code, 400)
        self.assertEqual(self._cash(), Decimal('100.00'))

    def test_the_tap_that_loses_the_race_writes_nothing(self):
        """Both taps passed the first check; the row lock finds the sale already finished."""
        cid, _ = self._cart()
        with mock.patch.object(CartViewSet, '_lock_open_cart', return_value=False):
            r = self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self.assertEqual((r.status_code, r.json()['code']), (409, 'SALE_ALREADY_COMPLETED'))
        c = Cart.objects.get(pk=cid)
        self.assertEqual((c.status, c.cash_tendered), ('open', None))
        self.assertEqual(self._cash(), Decimal('0.00'))
        self.assertFalse(hasattr(c, 'receipt') and c.receipt)

    def test_two_sales_on_one_drawer_both_count(self):
        a, _ = self._cart('10.00')
        b, _ = self._cart('15.00')
        stale = Drawer.objects.get(pk=self.drawer.pk)  # a copy loaded before either sale
        self._complete(a, {'payment_method': 'cash', 'cash_tendered': '10.00'})
        self._complete(b, {'payment_method': 'cash', 'cash_tendered': '20.00'})
        self.assertEqual(self._cash(), Decimal('25.00'))
        self.assertEqual(stale.cash_sales_total, Decimal('0.00'))


class DrawerRecordsLockedTests(_CashPathFixtures, TestCase):
    def test_a_cashier_cannot_edit_or_delete_a_drawer(self):
        url = f'/api/pos/drawers/{self.drawer.id}/'
        self.assertEqual(self.client.patch(url, {'cash_sales_total': '0.00'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(url).status_code, 403)

    def test_drawer_fields_are_read_only_and_a_drawer_with_sales_stays(self):
        cid, _ = self._cart()
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '100.00'})
        self._as(self.manager)
        url = f'/api/pos/drawers/{self.drawer.id}/'
        self.assertEqual(self.client.patch(url, {'cash_sales_total': '0.00', 'opening_total': '999.00',
                                                 'status': 'closed'}, format='json').status_code, 200)
        self.drawer.refresh_from_db()
        self.assertEqual((self.drawer.cash_sales_total, self.drawer.opening_total, self.drawer.status),
                         (Decimal('100.00'), Decimal('0.00'), 'open'))
        r = self.client.delete(url)
        self.assertEqual((r.status_code, r.json()['code']), (409, 'DRAWER_HAS_RECORDS'))

    def test_a_manager_can_delete_an_empty_drawer(self):
        reg = Register.objects.create(location=self.location, name='Empty', code='POS-E1')
        empty = Drawer.objects.create(register=reg, date=timezone.now().date(), current_cashier=self.user,
                                      opened_by=self.user, opened_at=timezone.now(), status='open')
        self._as(self.manager)
        self.assertEqual(self.client.delete(f'/api/pos/drawers/{empty.id}/').status_code, 204)


class DrawerInputTests(_CashPathFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self.reg2 = Register.objects.create(location=self.location, name='Register D', code='POS-D1')

    def _bad(self, r, text=None):
        self.assertEqual(r.status_code, 400, r.content)
        if text:
            self.assertIn(text, r.json()['detail'])

    def test_open_uses_the_counted_total_and_refuses_bad_counts(self):
        url = '/api/pos/drawers/'
        self._bad(self.client.post(url, {'register': self.reg2.id, 'opening_count': COUNT_120,
                                         'opening_total': '100.00'}, format='json'), 'does not match')
        self._bad(self.client.post(url, {'register': self.reg2.id, 'opening_total': 'abc'}, format='json'))
        self._bad(self.client.post(url, {'register': self.reg2.id, 'opening_count': {'twos': 1}}, format='json'),
                  'not a bill or coin')
        self._bad(self.client.post(url, {'register': self.reg2.id, 'opening_count': {'ones': -3}}, format='json'))
        self._bad(self.client.post(url, {'register': self.reg2.id, 'opening_count': {'ones': 1.5}}, format='json'))
        self._bad(self.client.post(url, {'register': self.reg2.id, 'opening_count': [1, 2]}, format='json'))
        self.assertFalse(Drawer.objects.filter(register=self.reg2).exists())
        ok = self.client.post(url, {'register': self.reg2.id, 'opening_count': COUNT_120,
                                    'opening_total': 120.00000000000001}, format='json')
        self.assertEqual(ok.status_code, 201, ok.content)
        self.assertEqual(Decimal(ok.json()['opening_total']), Decimal('120.00'))

    def test_close_checks_the_count_and_works_out_the_variance(self):
        cid, _ = self._cart('37.40')
        self._complete(cid, {'payment_method': 'cash', 'cash_tendered': '40.00'})
        url = f'/api/pos/drawers/{self.drawer.id}/close/'
        self._bad(self.client.post(url, {'closing_count': COUNT_120, 'closing_total': '1.00'}, format='json'))
        self._bad(self.client.post(url, {'closing_total': 'NaN'}, format='json'))
        self._bad(self.client.post(url, {}, format='json'), 'required')
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.status, 'open')
        r = self.client.post(url, {'closing_count': {'twenties': 1, 'tens': 1, 'fives': 1, 'ones': 2,
                                                     'quarters': 1, 'dimes': 1, 'nickels': 1}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.drawer.refresh_from_db()
        self.assertEqual((self.drawer.closing_total, self.drawer.expected_cash, self.drawer.variance),
                         (Decimal('37.40'), Decimal('37.40'), Decimal('0.00')))

    def test_handoff_needs_a_real_staff_member(self):
        url = f'/api/pos/drawers/{self.drawer.id}/handoff/'
        customer = User.objects.create_user(email='shopper@example.com', first_name='S', last_name='C',
                                            password='test-pass-123')
        gone = User.objects.create_user(email='gone@example.com', first_name='G', last_name='O',
                                        password='test-pass-123', is_active=False)
        gone.groups.add(Group.objects.get(name='Employee'))
        for who in (None, '', 'abc', 999999, 10 ** 30, True, customer.id, gone.id, self.user.id):
            self._bad(self.client.post(url, {'incoming_cashier': who, 'counted_total': '0.00'}, format='json'))
        self.assertFalse(DrawerHandoff.objects.exists())
        r = self.client.post(url, {'incoming_cashier': self.manager.id, 'count': {'ones': 5}}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        h = DrawerHandoff.objects.get()
        self.assertEqual((h.counted_total, h.variance), (Decimal('5.00'), Decimal('5.00')))
        self.drawer.refresh_from_db()
        self.assertEqual(self.drawer.current_cashier_id, self.manager.id)

    def test_takeover_with_and_without_a_count(self):
        self._as(self.manager)
        url = f'/api/pos/drawers/{self.drawer.id}/takeover/'
        self._bad(self.client.post(url, {'count': {'ones': 2}, 'counted_total': '9.00'}, format='json'))
        self._bad(self.client.post(url, {'counted_total': 'abc'}, format='json'))
        self.assertEqual(self.client.post(url, {}, format='json').status_code, 200)
        self.assertEqual(DrawerHandoff.objects.get().variance, Decimal('0.00'))

    def test_drops_need_cash_and_an_open_drawer(self):
        url = f'/api/pos/drawers/{self.drawer.id}/drop/'
        self._bad(self.client.post(url, {'amount': {}, 'total': '0'}, format='json'))
        self._bad(self.client.post(url, {'total': '-20.00'}, format='json'))
        self._bad(self.client.post(url, {'amount': {'twenties': 2}, 'total': '20.00'}, format='json'))
        ok = self.client.post(url, {'amount': {'twenties': 2}, 'total': '40.00'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        Drawer.objects.filter(pk=self.drawer.pk).update(status='closed')
        r = self.client.post(url, {'amount': {'twenties': 1}}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'DRAWER_CLOSED'))
        self.assertEqual(CashDrop.objects.count(), 1)


class SupplementalRecountTests(_CashPathFixtures, TestCase):
    def setUp(self):
        super().setUp()
        self._as(self.manager)
        self.supp = SupplementalDrawer.objects.create(
            location=self.location, current_balance={'twenties': 25}, current_total=Decimal('500.00'),
        )

    def test_the_pages_recount_records_what_was_counted(self):
        """The page sends count and total; before 2026-10-21 the server read other names and recorded $0."""
        r = self.client.post('/api/pos/supplemental/audit/', {
            'count': {'twenties': 24, 'tens': 1, 'fives': 1}, 'total': '495.00', 'notes': '',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.supp.refresh_from_db()
        self.assertEqual((self.supp.current_total, self.supp.current_balance),
                         (Decimal('495.00'), {'twenties': 24, 'tens': 1, 'fives': 1}))
        adj = SupplementalTransaction.objects.get(transaction_type='audit_adjustment')
        self.assertEqual(adj.total, Decimal('-5.00'))  # short keeps its sign
        self.assertIn('short', adj.notes)

    def test_over_is_positive_and_the_old_field_names_still_work(self):
        r = self.client.post('/api/pos/supplemental/audit/', {
            'current_balance': {'twenties': 26}, 'current_total': '520.00',
        }, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        adj = SupplementalTransaction.objects.get(transaction_type='audit_adjustment')
        self.assertEqual(adj.total, Decimal('20.00'))
        self.assertIn('over', adj.notes)

    def test_a_bad_recount_is_refused_and_changes_nothing(self):
        for body in ({'count': {'twenties': 1}, 'total': '500.00'}, {'total': 'abc'}, {'count': 'lots'}):
            self.assertEqual(self.client.post('/api/pos/supplemental/audit/', body, format='json').status_code,
                             400, body)
        self.supp.refresh_from_db()
        self.assertEqual(self.supp.current_total, Decimal('500.00'))
        self.assertFalse(SupplementalTransaction.objects.exists())

    def test_draw_and_return_are_checked(self):
        self.assertEqual(self.client.post('/api/pos/supplemental/draw/', {'total': 'abc'},
                                          format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/pos/supplemental/draw/', {'total': '0'},
                                          format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/pos/supplemental/draw/', {'total': '20.00', 'related_drawer': 999999},
                                          format='json').status_code, 400)
        ok = self.client.post('/api/pos/supplemental/draw/', {'amount': {'ones': 20}, 'total': '20.00',
                                                              'related_drawer': self.drawer.id}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        back = self.client.post('/api/pos/supplemental/return/', {'amount': {'fives': 1}}, format='json')
        self.assertEqual(back.status_code, 200, back.content)
        self.supp.refresh_from_db()
        self.assertEqual(self.supp.current_total, Decimal('485.00'))

    def test_no_supplemental_drawer_is_a_404_not_a_crash(self):
        self.supp.delete()
        for path in ('draw', 'return', 'audit'):
            self.assertEqual(self.client.post(f'/api/pos/supplemental/{path}/', {'total': '5.00'},
                                              format='json').status_code, 404, path)

    def test_cashiers_cannot_touch_the_supplemental_drawer(self):
        self._as(self.user)
        self.assertEqual(self.client.post('/api/pos/supplemental/audit/', {'total': '0.00'},
                                          format='json').status_code, 403)
