"""Thrift+ Phase 4: the scanner app's public API (member sessions, never the staff JWT; tags, cart, signals, reset)."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Item, Product
from apps.thriftplus.models import Account, AppCart, ItemReward, MemberLogin, MemberSession, ScanSignal
from apps.thriftplus.services import cards, member_auth, members, scanner

D = Decimal
BASE = '/api/thriftplus/public/'


class PublicApiTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})   # Thrift+ is on
        no_sale = patch.object(scanner, '_sale_factor', return_value=D('1'))  # a Labor Day window must not move the numbers
        no_sale.start()
        self.addCleanup(no_sale.stop)
        self.api = APIClient()
        batch = cards.generate_batch(2)
        self.code, self.other_code = list(batch.cards.values_list('code', flat=True))
        self.account = members.create_account(first_name='Ana', phone='(402) 555-0101', id_checked=True, verified_18=True,
                                              card_code=self.code)
        self.person = self.account.people.get()
        self.lamp = Item.objects.create(sku='ITMTPPUB1', product=Product.objects.create(title='Brass floor lamp, tall arched reading style'),
                                        price=D('90.00'), status='on_shelf')
        ItemReward.objects.create(item=self.lamp, family_key='p1', floor_date=timezone.localdate() - timedelta(days=19),
                                  starting_price=D('90.00'), floor_price=D('9.00'), grow_days=13, reward=D('13.00'),
                                  status=ItemReward.STATUS_CLIMBING, reason='one_unit', day=20, computed_on=timezone.localdate())

    def _card_sign_in(self, last4='0101'):
        return self.api.post(BASE + 'session/card/', {'card_code': f'TP{self.code}', 'phone_last4': last4}, format='json')

    def test_a_card_and_phone_digits_sign_in_and_wrong_tries_lock_the_card(self):
        self.assertEqual(self.api.get(BASE + 'session/').json(), {'status': 'signed_out'})
        ok = self._card_sign_in()
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertIn(member_auth.COOKIE, ok.cookies)
        self.assertTrue(ok.cookies[member_auth.COOKIE]['httponly'])
        self.assertEqual(ok.cookies[member_auth.COOKIE]['path'], member_auth.COOKIE_PATH)
        member = self.api.get(BASE + 'session/').json()['member']
        self.assertEqual((member['first_name'], member['card_last4'], member['cover']['amount']), ('Ana', self.code[-4:], '10.00'))
        self.assertEqual(MemberSession.objects.get().token_hash != self.api.cookies[member_auth.COOKIE].value, True)
        stranger = APIClient()
        for _ in range(member_auth.CARD_TRIES):
            bad = stranger.post(BASE + 'session/card/', {'card_code': self.code, 'phone_last4': '9999'}, format='json')
            self.assertEqual(bad.status_code, 401)
        locked = stranger.post(BASE + 'session/card/', {'card_code': self.code, 'phone_last4': '0101'}, format='json')
        self.assertEqual(locked.json()['code'], 'LOCKED')

    def test_a_staff_token_means_nothing_here_and_a_member_session_is_not_a_staff_login(self):
        staff = User.objects.create_user('clerk@example.com', 'Pat', 'Clerk', password='x-pass-123')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api.force_authenticate(staff)
        self.assertEqual(self.api.get(BASE + 'cart/').status_code, 403)
        self.api.force_authenticate(None)
        self._card_sign_in()
        self.assertEqual(self.api.get('/api/thriftplus/accounts/').status_code, 401)  # the cookie is not a staff login
        self.assertEqual(self.api.get('/api/pos/sale-mode/').status_code, 401)

    def test_revoking_the_membership_ends_the_session(self):
        self._card_sign_in()
        self.assertEqual(self.api.get(BASE + 'cart/').status_code, 200)
        members.revoke(self.account, reason='tag switching')
        self.assertEqual(self.api.get(BASE + 'cart/').status_code, 403)

    def test_a_tag_shows_the_member_reward_and_the_cart_uses_the_register_math(self):
        found = self.api.get(BASE + f'tag/{self.lamp.sku.lower()}/').json()
        self.assertEqual(found['status'], 'found')
        card = found['item']
        self.assertEqual((card['price'], card['reward'], card['member_price']), ('90.00', '13.00', '77.00'))
        self.assertEqual((card['reward_banked'], card['reward_instant']), ('13.00', '10.40'))  # save all, or 80% today
        self.assertLessEqual(len(card['title']), 28)
        self.assertEqual((card['category'], card['available'], card['age_restricted']), ('lighting', True, False))
        self.assertEqual(self.api.get(BASE + 'tag/NOPE/').json(), {'status': 'not_found', 'sku': 'NOPE'})
        self.assertEqual(self.api.get(BASE + 'cart/').status_code, 403)  # guests keep their cart on the phone
        self._card_sign_in()
        cart = self.api.post(BASE + 'cart/add/', {'sku': self.lamp.sku}, format='json').json()
        self.assertEqual(cart['totals']['to_cover'], '10.00')
        # Saving is the default (form 5): nothing off today, $3 to the balance.
        self.assertEqual((cart['totals']['savings'], cart['totals']['member_total'], cart['totals']['to_bank']),
                         ('0.00', '90.00', '3.00'))
        self.assertEqual((cart['totals']['full_value'], cart['totals']['instant_value']), ('3.00', '2.40'))
        banked = self.api.post(BASE + 'cart/choice/', {'choice': 'bank'}, format='json').json()
        self.assertEqual((banked['reward_choice'], banked['totals']['to_bank']), ('bank', '3.00'))
        self.assertEqual(ItemReward.objects.get(item=self.lamp).adds, 1)
        self.assertEqual(ItemReward.objects.get(item=self.lamp).scans, 1)
        history = self.api.get(BASE + 'history/').json()
        self.assertEqual([(h['item']['sku'], h['decision']) for h in history], [(self.lamp.sku, 'added')])
        cleared = self.api.post(BASE + 'cart/clear/').json()
        self.assertEqual((cleared['lines'], cleared['reward_choice']), ([], None))

    def test_passes_and_price_feel_count_on_the_item(self):
        self.api.post(BASE + 'pass/', {'sku': self.lamp.sku}, format='json')
        self.api.post(BASE + 'feel/', {'sku': self.lamp.sku, 'reason': 'too_high', 'would_pay': '70.00'}, format='json')
        state = ItemReward.objects.get(item=self.lamp)
        self.assertEqual((state.passes, state.feedback), (1, {'too_high': 1}))
        self.assertEqual(ScanSignal.objects.filter(kind='feel').get().detail['would_pay'], '70.00')

    def test_a_staff_member_signs_in_to_the_scanner_with_their_dash_email_and_gets_their_own_membership(self):
        staff = User.objects.create_user(email='sam@ecothrift.us', password='correct-horse-9', first_name='Sam', last_name='Staff')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        bad = self.api.post(BASE + 'session/password/', {'login': 'sam@ecothrift.us', 'password': 'nope'}, format='json')
        self.assertEqual(bad.status_code, 401)
        ok = self.api.post(BASE + 'session/password/', {'login': 'Sam@EcoThrift.us', 'password': 'correct-horse-9'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.json()['status'], 'member')
        self.assertEqual(ok.json()['member']['first_name'], 'Sam')
        account = Account.objects.get(staff_user=staff)
        self.assertEqual(account.people.count(), 1)
        again = self.api.post(BASE + 'session/password/', {'login': 'sam@ecothrift.us', 'password': 'correct-horse-9'}, format='json')
        self.assertEqual(again.status_code, 200)
        self.assertEqual(Account.objects.filter(staff_user=staff).count(), 1)   # the membership is made once

    def test_a_customer_account_is_not_a_staff_sign_in_to_the_scanner(self):
        shopper = User.objects.create_user(email='shopper@example.com', password='correct-horse-9', first_name='Shop', last_name='Per')
        shopper.groups.add(Group.objects.get_or_create(name='Customer')[0])
        res = self.api.post(BASE + 'session/password/', {'login': 'shopper@example.com', 'password': 'correct-horse-9'}, format='json')
        self.assertEqual(res.status_code, 401)
        self.assertFalse(Account.objects.filter(staff_user=shopper).exists())

    def test_a_card_session_sets_up_a_login_once_and_the_reset_link_signs_out_every_phone(self):
        self._card_sign_in()
        weak = self.api.post(BASE + 'login/', {'email': 'ana@example.com', 'password': '123'}, format='json')
        self.assertEqual(weak.json()['code'], 'WEAK_PASSWORD')
        made = self.api.post(BASE + 'login/', {'email': 'Ana@Example.com', 'username': 'ana_d', 'password': 'green-lamp-4455'}, format='json')
        self.assertEqual(made.json()['member']['email'], 'ana@example.com')
        again = self.api.post(BASE + 'login/', {'email': 'x@example.com', 'password': 'green-lamp-4455'}, format='json')
        self.assertEqual(again.json()['code'], 'HAS_LOGIN')
        phone = APIClient()
        self.assertEqual(phone.post(BASE + 'session/password/', {'login': 'ANA_D', 'password': 'green-lamp-4455'}, format='json').status_code, 200)
        self.assertEqual(phone.post(BASE + 'session/password/', {'login': 'ana@example.com', 'password': 'nope'}, format='json').status_code, 401)
        with patch('apps.webstore.emails._send', return_value=True) as send:
            sent = APIClient().post(BASE + 'session/reset/', {'email': 'ana@example.com'}, format='json').json()
            unknown = APIClient().post(BASE + 'session/reset/', {'email': 'who@example.com'}, format='json').json()
        self.assertEqual((sent['sent_to'], unknown['sent_to']), ('a***@example.com', 'w***@example.com'))  # same answer either way
        self.assertEqual(send.call_count, 1)
        token = send.call_args.args[1].split('reset=')[1].split()[0]
        done = APIClient().post(BASE + 'session/reset/confirm/', {'token': token, 'password': 'blue-coat-7788'}, format='json')
        self.assertEqual(done.status_code, 200, done.content)
        self.assertEqual(phone.get(BASE + 'cart/').status_code, 403)  # the old phone was signed out
        reused = APIClient().post(BASE + 'session/reset/confirm/', {'token': token, 'password': 'blue-coat-9999'}, format='json')
        self.assertEqual(reused.json()['code'], 'BAD_RESET')
        self.assertNotIn('blue-coat', MemberLogin.objects.get().password)  # only a hash is kept

    def test_the_portal_changes_answer_with_the_updated_membership_and_a_card_session_cannot_make_them(self):
        card_phone = APIClient()
        card_phone.post(BASE + 'session/card/', {'card_code': f'TP{self.code}', 'phone_last4': '0101'}, format='json')
        card_id = self.person.cards.get().pk
        refused = card_phone.post(BASE + 'me/card-lost/', {'card': card_id}, format='json')
        self.assertEqual((refused.status_code, refused.json()['code']), (403, 'NEEDS_PASSWORD'))
        self.assertEqual(card_phone.get(BASE + 'me/').json()['can_change'], False)

        member_auth.set_up_login(self.person, email='ana@example.com', username=None, password='green-lamp-4455')
        second = members.add_second_adult(self.account, both_present=True, primary_approves=True, first_name='Ben',
                                          id_checked=True, verified_18=True, card_code=self.other_code)
        phone = APIClient()
        phone.post(BASE + 'session/password/', {'login': 'ana@example.com', 'password': 'green-lamp-4455'}, format='json')

        stopped = phone.post(BASE + 'me/card-lost/', {'card': card_id}, format='json')
        self.assertEqual(stopped.status_code, 200, stopped.content)
        ana = next(p for p in stopped.json()['people'] if p['is_you'])
        self.assertEqual([c['status'] for c in ana['cards']], ['dead'])
        self.assertEqual(stopped.json()['can_change'], True)

        removed = phone.post(BASE + 'me/remove-person/', {'person': second.pk}, format='json')
        self.assertEqual(removed.status_code, 200, removed.content)
        self.assertEqual([p['first_name'] for p in removed.json()['people']], ['Ana'])

    def test_the_register_picks_up_the_choice_made_in_the_app(self):
        from apps.core.models import WorkLocation
        from apps.pos.models import Drawer, Register
        from apps.thriftplus.services import register

        AppSetting.objects.update_or_create(key='thrift_plus_test_registers', defaults={'value': ['TP-P1']})
        clerk = User.objects.create_user('clerk2@example.com', 'Pat', 'Clerk', password='x-pass-123')
        clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        reg = Register.objects.create(location=WorkLocation.objects.create(name='Store'), name='R', code='TP-P1')
        drawer = Drawer.objects.create(register=reg, date=timezone.localdate(), current_cashier=clerk, opened_by=clerk,
                                       opened_at=timezone.now(), status='open')
        scanner.set_choice(self.account, 'bank')
        from apps.pos.models import Cart
        cart = Cart.objects.create(drawer=drawer, cashier=clerk)
        member = register.attach(cart, self.code, user=clerk)
        self.assertEqual(member.reward_choice, 'bank')
        self.assertEqual(register.cart_block(cart)['app_choice'], 'bank')
        self.assertTrue(AppCart.objects.filter(account=self.account).exists())


class SwitchTests(TestCase):
    """Owner, 2026-10-07: everything Thrift+ customers see is behind the switch."""

    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': False})
        AppSetting.objects.update_or_create(key=members.PREVIEW_KEY, defaults={'value': 'staff123'})
        Item.objects.create(sku='ITMTPSW1', product=Product.objects.create(title='Lamp'), price=D('9.00'), status='on_shelf')

    def test_off_the_scanner_and_portal_say_opens_soon(self):
        api = APIClient()
        for method, url in (('get', '/api/thriftplus/public/session/'), ('get', '/api/thriftplus/public/tag/ITMTPSW1/'),
                            ('post', '/api/thriftplus/public/session/password/'), ('get', '/api/thriftplus/public/me/')):
            res = getattr(api, method)(url, {}, format='json') if method == 'post' else api.get(url)
            self.assertEqual((res.status_code, res.json()['code']), (403, 'THRIFT_PLUS_OFF'), url)

    def test_a_staff_phone_with_the_preview_code_gets_in(self):
        api = APIClient()
        self.assertEqual(api.get('/api/thriftplus/public/tag/ITMTPSW1/', HTTP_X_THRIFTPLUS_PREVIEW='wrong').status_code, 403)
        res = api.get('/api/thriftplus/public/tag/ITMTPSW1/', HTTP_X_THRIFTPLUS_PREVIEW='staff123')
        self.assertEqual((res.status_code, res.data['status']), (200, 'found'))

    def test_on_everyone_gets_in(self):
        AppSetting.objects.filter(key=members.ENABLED_KEY).update(value=True)
        self.assertEqual(APIClient().get('/api/thriftplus/public/tag/ITMTPSW1/').status_code, 200)

    def test_only_the_super_user_changes_thrift_plus_settings(self):
        mgr = User.objects.create_user(email='mgr@example.com', first_name='Mo', last_name='M', password='Shelf-life-42')
        mgr.groups.add(Group.objects.get_or_create(name='Manager')[0])
        boss = User.objects.create_user(email='boss@example.com', first_name='Bill', last_name='R', password='Shelf-life-42',
                                        is_superuser=True, is_staff=True)
        boss.groups.add(Group.objects.get_or_create(name='Admin')[0])
        url = f'/api/core/settings/{members.ENABLED_KEY}/'
        api = APIClient()
        api.force_authenticate(mgr)
        self.assertEqual(api.patch(url, {'value': True}, format='json').status_code, 403)
        api.force_authenticate(boss)
        self.assertEqual(api.patch(url, {'value': True}, format='json').status_code, 200)
        self.assertTrue(members.is_enabled())
