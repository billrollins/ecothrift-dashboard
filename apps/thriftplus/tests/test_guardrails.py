"""Thrift+ guardrails (critic review digest point 6, owner 2026-10-21): the "member is here" tap before a member found by
search spends ThriftBucks (THR-05), the returns count on the member card (W14), the watchdogs on the nightly run and the
sale-time ledger write (THR-01, THR-02), and Delete staying the owner's."""
from __future__ import annotations

from datetime import timedelta
from unittest import mock

from django.utils import timezone

from apps.core.models import AppSetting
from apps.thriftplus.models import CartMember, Event, ReturnRecord, RewardRun
from apps.thriftplus.services import member_card, watchdog
from apps.thriftplus.tests.test_register import RegisterBase


class MemberIsHereTests(RegisterBase):
    def test_a_member_found_by_search_spends_thriftbucks_only_after_the_tap(self):
        self._lot('35.00')
        ana = self.account.people.get(role='primary')
        cart = self._cart('ITMTPVASE')
        r = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': ana.pk}, format='json')
        tp = r.json()['thrift_plus']
        self.assertEqual((tp['member']['here'], tp['bucks_used'], tp['bucks_available']), (False, '0.00', '35.00'))
        self.assertEqual(r.json()['total'], '53.50')  # the tag price: nothing comes off yet

        here = self.api.post('/api/thriftplus/register/here/', {'cart': cart['id']}, format='json')
        self.assertEqual(here.status_code, 200, here.content)
        self.assertEqual((here.json()['thrift_plus']['member']['here'], here.json()['total']), (True, '16.05'))
        member = CartMember.objects.get(cart_id=cart['id'])
        self.assertEqual(member.here_by, self.clerk)
        logged = Event.objects.get(action='register_member_here')
        self.assertEqual((logged.actor, logged.detail), (self.clerk, {'cart': cart['id']}))
        # A second tap changes nothing and logs nothing.
        self.api.post('/api/thriftplus/register/here/', {'cart': cart['id']}, format='json')
        self.assertEqual(Event.objects.filter(action='register_member_here').count(), 1)

    def test_their_qr_spends_at_once(self):
        self._lot('35.00')
        cart = self._cart('ITMTPVASE')
        tp = self._attach(cart['id']).json()['thrift_plus']
        self.assertEqual((tp['member']['here'], tp['bucks_used']), (True, '35.00'))

    def test_the_same_member_found_again_by_search_stays_here(self):
        self._lot('35.00')
        ana = self.account.people.get(role='primary')
        cart = self._cart('ITMTPVASE')
        self._attach(cart['id'])
        again = self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': ana.pk}, format='json')
        self.assertEqual(again.json()['thrift_plus']['bucks_used'], '35.00')


class ReturnsWarningTests(RegisterBase):
    def _returns(self, *days_ago):
        from apps.pos.models import Cart, CartLine

        ana = self.account.people.get(role='primary')
        cart = Cart.objects.create(drawer=self.drawer, cashier=self.clerk, status='completed', completed_at=timezone.now())
        for n, ago in enumerate(days_ago):
            line = CartLine.objects.create(cart=cart, description=f'Item {n}', quantity=1, unit_price='10.00', line_total='10.00')
            row = ReturnRecord.objects.create(account=self.account, person=ana, cart_line=line, paid='10.00', credit='8.00')
            ReturnRecord.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=ago, minutes=n))

    def test_trips_in_the_window_and_the_warning_at_the_owners_number(self):
        self._returns(1, 1, 5)  # two items one day, one another day: 2 trips, 3 items
        ana = self.account.people.get(role='primary')
        self.assertEqual(member_card.card(ana)['returns'],
                         {'trips': 2, 'items': 3, 'days': 30, 'warn_at': 3, 'warning': False})
        self._returns(10)
        self.assertTrue(member_card.card(ana)['returns']['warning'])
        AppSetting.objects.create(key='thrift_plus_return_warn_days', value=7)
        self.assertEqual(member_card.card(ana)['returns'],
                         {'trips': 2, 'items': 3, 'days': 7, 'warn_at': 3, 'warning': False})
        AppSetting.objects.create(key='thrift_plus_return_warn_count', value=2)
        self.assertTrue(member_card.card(ana)['returns']['warning'])


class WatchdogTests(RegisterBase):
    def setUp(self):
        super().setUp()
        AppSetting.objects.update_or_create(key='thrift_plus_enabled', defaults={'value': True})

    def test_the_nightly_run_alert(self):
        self.assertEqual(watchdog.nightly_run(), {'text': 'No run has finished yet.', 'last_ok': None})
        run = RewardRun.objects.create(day=timezone.localdate(), finished_at=timezone.now())
        self.assertIsNone(watchdog.nightly_run())
        self.assertIn('Last finished run', watchdog.nightly_run(now=timezone.now() + timedelta(hours=30))['text'])
        RewardRun.objects.create(day=timezone.localdate(), finished_at=timezone.now(), error='database went away')
        self.assertEqual(watchdog.nightly_run()['text'], 'The last run failed: database went away')
        AppSetting.objects.filter(key='thrift_plus_enabled').update(value=False)
        self.assertIsNone(watchdog.nightly_run())
        self.assertTrue(run.pk)

    def test_a_member_sale_whose_ledger_write_failed_is_listed(self):
        cart = self._cart('ITMTPVASE')
        self._attach(cart['id'])
        with mock.patch('apps.thriftplus.services.register._member_sale', side_effect=RuntimeError('boom')):
            self.assertEqual(self._complete(cart['id']).status_code, 200)
        good = self._cart('ITMTPLAMP')
        self._attach(good['id'])
        self.assertEqual(self._complete(good['id']).status_code, 200)
        self.assertEqual([m['cart_id'] for m in watchdog.sales_missing_ledger()], [cart['id']])


class OwnerNeedsYouTests(WatchdogTests):
    def test_both_show_on_the_owner_page(self):
        from apps.core.services.owner_page import needs_you

        items = {i['key']: i for i in needs_you()['items']}
        self.assertEqual((items['thrift_run']['count'], items['thrift_run']['tone']), (1, 'error'))
        self.assertEqual(items['thrift_ledger']['count'], 0)


class DeleteIsTheOwnersTests(RegisterBase):
    def test_staff_and_managers_deactivate_only_the_owner_deletes(self):
        for who in (self.clerk, self.manager):
            self.api.force_authenticate(who)
            self.assertEqual(self.api.post(f'/api/thriftplus/accounts/{self.account.pk}/delete/', {'name': 'Ana'},
                                           format='json').status_code, 403)
            self.assertEqual(self.api.post(f'/api/thriftplus/member-directory/a{self.account.pk}/delete/', {'name': 'Ana'},
                                           format='json').status_code, 403)
        self.api.force_authenticate(self.manager)
        r = self.api.post(f'/api/thriftplus/accounts/{self.account.pk}/deactivate/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.account.refresh_from_db()
        self.assertEqual(self.account.status, 'inactive')
        self.assertTrue(self.account.people.filter(first_name='Ana').exists())  # nothing erased (J14)
