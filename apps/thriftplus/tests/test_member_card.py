"""Release 1 of the 10-20 register work (owner 2026-10-20): the member card, the cart's Refresh and ``returns_until``."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.pos.models import Cart
from apps.thriftplus.models import Account, LedgerEntry, Person
from apps.thriftplus.services import members, returns
from apps.thriftplus.tests.test_register import RegisterBase
from apps.pos.tests.pin_helpers import manager_ok

D = Decimal


class ReturnsUntilTests(RegisterBase):
    """The cart block's ``returns_until``: the sale day + 3, only for a member with a 3-day-return line."""

    def setUp(self):
        super().setUp()
        returns._NOTE_CACHE.clear()
        self.mug = self._item('ITMTPMUG', 'Cheap mug', '8.00', '1.00')  # $10 or less: sold AS IS

    def _until(self):
        return (timezone.localdate() + timedelta(days=3)).isoformat()

    def test_a_member_with_a_three_day_return_line_gets_the_date_while_open_and_after_the_sale(self):
        cart = self._cart('ITMTPLAMP')
        self.assertNotIn('returns_until', cart['thrift_plus'])  # no member yet
        attached = self._attach(cart['id']).json()
        self.assertEqual(attached['thrift_plus']['returns_until'], self._until())
        self.assertEqual(attached['thrift_plus']['member']['standing'], 'member')
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        block = done.json()['thrift_plus']
        self.assertEqual(block['returns_until'], self._until())
        self.assertIn('return_note', block)

    def test_the_closed_days_note_comes_with_the_date_after_the_sale(self):
        from unittest import mock

        cart = self._cart('ITMTPLAMP')
        self._attach(cart['id'])
        with mock.patch.object(returns, 'closed_note', return_value="Heads up: we're closed Sun Oct 25."):
            done = self._complete(cart['id'])
        self.assertEqual(done.json()['thrift_plus']['return_note'], "Heads up: we're closed Sun Oct 25.")

    def test_no_date_for_a_guest_or_when_every_line_is_as_is(self):
        guest = self._cart('ITMTPLAMP')
        self.assertNotIn('returns_until', guest['thrift_plus'])
        as_is = self._cart('ITMTPMUG')
        block = self._attach(as_is['id']).json()['thrift_plus']
        self.assertEqual(block['lines'][next(iter(block['lines']))]['mark'], 'AS IS')
        self.assertNotIn('returns_until', block)
        self.assertEqual(self._complete(as_is['id']).json()['thrift_plus'].get('returns_until'), None)

    def test_one_three_day_line_among_as_is_lines_is_enough(self):
        cart = self._cart('ITMTPMUG', 'ITMTPLAMP')
        self.assertEqual(self._attach(cart['id']).json()['thrift_plus']['returns_until'], self._until())


class RefreshTests(RegisterBase):
    def test_refresh_works_the_sale_out_again_with_the_members_balances_of_now(self):
        cart = self._cart('ITMTPLAMP')
        self._attach(cart['id'])
        before = self.api.get(f"/api/pos/carts/{cart['id']}/").json()['thrift_plus']
        self.assertEqual((before['credit_used'], before['balances']['credit']), ('0.00', '0.00'))
        self._credit('10.00')  # credit arrived while the sale was open (or set aside)
        stale = self.api.get(f"/api/pos/carts/{cart['id']}/").json()
        self.assertEqual(stale['thrift_credit'], '0.00')
        fresh = self.api.post(f"/api/pos/carts/{cart['id']}/refresh/", {}, format='json')
        self.assertEqual(fresh.status_code, 200, fresh.content)
        block = fresh.json()['thrift_plus']
        self.assertEqual((fresh.json()['thrift_credit'], block['credit_used'], block['balances']['credit']), ('10.00', '10.00', '10.00'))
        self.assertEqual(block['member']['standing'], 'member')

    def test_refresh_leaves_a_finished_sale_as_it_is_and_needs_a_signed_in_employee(self):
        cart = self._cart('ITMTPLAMP')
        self._attach(cart['id'])
        done = self._complete(cart['id']).json()
        self._credit('10.00')
        again = self.api.post(f"/api/pos/carts/{cart['id']}/refresh/", {}, format='json')
        self.assertEqual((again.status_code, again.json()['total'], again.json()['status']), (200, done['total'], 'completed'))
        self.assertEqual(Cart.objects.get(pk=cart['id']).thrift_credit, D(done['thrift_credit']))
        from rest_framework.test import APIClient

        self.assertIn(APIClient().post(f"/api/pos/carts/{cart['id']}/refresh/", {}, format='json').status_code, (401, 403))


class MemberCardTests(RegisterBase):
    def _card(self, **params):
        return self.api.get('/api/thriftplus/register/member/', params)

    def test_the_card_shows_status_rewards_trips_and_the_people_on_the_membership(self):
        members.add_second_adult(self.account, both_present=True, primary_approves=True, first_name='Ben', last_name='Bell',
                                 id_checked=True, verified_18=True)
        person = self.account.people.get(role=Person.ROLE_PRIMARY)
        sale = self._cart('ITMTPLAMP')
        self._attach(sale['id'])
        self._complete(sale['id'])
        self._lot('10.00', days_ago=2)
        self._credit('5.00')
        r = self._card(person=person.pk)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['person']['person_id'], body['person']['standing'], body['person']['name']),
                         (person.pk, 'member', f'{person.first_name} {person.last_name}'.strip()))
        rewards = body['rewards']
        self.assertEqual((rewards['collected'], rewards['used']), ('45.00', '0.00'))  # the lamp's 35 and 10 from a trip two days ago
        self.assertEqual((rewards['balance'], rewards['credit']), ('45.00', '5.00'))
        self.assertTrue(rewards['use_by'])
        trip = body['trips'][0]
        self.assertEqual((trip['date'], trip['total'], trip['items'], trip['cart_id']),
                         (timezone.localdate().isoformat(), '85.60', 1, sale['id']))
        self.assertTrue(trip['ticket'])
        self.assertEqual([p['first_name'] for p in body['people']], ['Ana', 'Ben'])

    def test_used_thriftbucks_show_and_a_voided_sale_counts_for_nothing(self):
        self._lot('40.00', days_ago=3)
        sale = self._cart('ITMTPLAMP')
        self._attach(sale['id'])
        self._complete(sale['id'])
        person = self.account.people.first()
        body = self._card(person=person.pk).json()
        self.assertEqual((body['rewards']['used'], body['rewards']['collected']), ('40.00', '75.00'))
        self.api.force_authenticate(self.manager)
        self.assertEqual(self.api.post(f"/api/pos/carts/{sale['id']}/void/", manager_ok()[1], format='json').status_code, 200)
        voided = self._card(person=person.pk).json()
        self.assertEqual((voided['rewards']['used'], voided['rewards']['collected'], voided['trips']), ('0.00', '40.00', []))

    def test_a_pending_join_is_pending_and_a_removed_person_is_off(self):
        pending = Person.objects.create(account=Account.objects.create(status=Account.STATUS_PENDING), first_name='Ruth',
                                        last_name='Olsen', email='ruth@example.com')
        self.assertEqual(self._card(person=pending.pk).json()['person']['standing'], 'pending')
        off = self.account.people.first()
        Account.objects.filter(pk=self.account.pk).update(status=Account.STATUS_INACTIVE)
        self.assertEqual(self._card(person=off.pk).json()['person']['standing'], 'off')

    def test_the_card_is_found_by_the_member_qr_too_and_an_unknown_member_is_a_404(self):
        person = self.account.people.first()
        by_qr = self._card(code=f'TP{self.codes[0]}')
        self.assertEqual((by_qr.status_code, by_qr.json()['person']['person_id']), (200, person.pk))
        self.assertEqual(self._card(person=999999).status_code, 404)
        self.assertEqual(self._card().status_code, 404)

    def test_the_ledger_is_not_changed_by_looking(self):
        before = LedgerEntry.objects.count()
        self._card(person=self.account.people.first().pk)
        self.assertEqual(LedgerEntry.objects.count(), before)
