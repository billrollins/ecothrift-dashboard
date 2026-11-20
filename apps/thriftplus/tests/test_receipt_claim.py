"""A non-member receipt's ThriftBucks, claimed by joining the same day through its QR (owner 2026-11-20, Dash Update
#204, rulebook B15): the signed token, the link on the receipt, the same-day window, one claim per sale, the refusals,
and the ThriftBucks credited equal to what the trip would have collected."""
from __future__ import annotations

import re
from datetime import timedelta
from decimal import Decimal

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.pos.models import Cart
from apps.thriftplus.models import Account, CartMember, Event, LedgerEntry
from apps.thriftplus.services import ledger, member_auth, members, receipt_claim
from apps.thriftplus.tests.test_register import RegisterBase

D = Decimal
BASE = '/api/thriftplus/public/'
# QR alphanumeric mode: 0-9 A-Z space $ % * + - . / : (the code then stays version 3, the member QR's size).
ALNUM = re.compile(r'^[0-9A-Z $%*+\-./:]+$')


@override_settings(SECRET_KEY='test-secret-for-receipt-claims', PUBLIC_SITE_CANONICAL_HOST='ecothrift.us')
class TokenTests(SimpleTestCase):
    def test_a_token_names_one_sale_and_cannot_be_made_up(self):
        for pk in (1, 35, 123456, 99999999):
            token = receipt_claim.token_for(pk)
            self.assertEqual(receipt_claim.cart_id_from(token), pk)
            self.assertEqual(receipt_claim.cart_id_from(token.lower()), pk)  # a typed link in lower case still works
        token = receipt_claim.token_for(4242)
        flipped = token[:-1] + ('A' if token[-1] != 'A' else 'B')
        self.assertIsNone(receipt_claim.cart_id_from(flipped))
        self.assertIsNone(receipt_claim.cart_id_from(receipt_claim.token_for(4243)[:-12] + token[-12:]))  # moved sig
        for junk in ('', '4242', 'not a token', 'Z' * 40, None):
            self.assertIsNone(receipt_claim.cart_id_from(junk))
        with override_settings(SECRET_KEY='another-key'):
            self.assertIsNone(receipt_claim.cart_id_from(token))

    def test_the_link_packs_small_for_the_tape(self):
        url = receipt_claim.claim_url(123456)
        self.assertTrue(url.startswith('HTTPS://ECOTHRIFT.US/J/'), url)
        self.assertRegex(url, ALNUM)
        self.assertLessEqual(len(url), 47)  # version 3-Q alphanumeric holds 47: the member QR's size, about 29 mm
        self.assertLessEqual(len(receipt_claim.claim_url(10 ** 9)), 47)


class ClaimTests(RegisterBase):
    def setUp(self):
        super().setUp()
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})

    def _guest_sale(self, *skus):
        cart = self._cart(*skus)
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        return done.json()

    def _new_member(self, first='Cy', phone='4025550199'):
        account = members.create_account(first_name=first, last_name='Lee', phone=phone)
        person = account.people.get()
        token, _ = member_auth.start_session(person, 'code')
        phone_app = APIClient()
        phone_app.cookies[member_auth.COOKIE] = token
        return account, phone_app

    def _claim(self, app, token):
        return app.post(BASE + 'me/claim-receipt/', {'token': token}, format='json')

    def _token(self, sale):
        url = sale['thrift_plus']['claim_url']
        return url.rsplit('/', 1)[1]

    def test_the_receipt_carries_the_claim_link_only_for_a_finished_non_member_sale(self):
        open_cart = self._cart()
        self.assertNotIn('claim_url', open_cart['thrift_plus'])  # not finished yet
        sale = self._guest_sale()
        url = sale['thrift_plus']['claim_url']
        self.assertEqual(receipt_claim.cart_id_from(url.rsplit('/', 1)[1]), sale['id'])
        self.assertRegex(url, ALNUM)
        member_cart = self._cart()
        self._attach(member_cart['id'])
        member_sale = self._complete(member_cart['id']).json()
        self.assertNotIn('claim_url', member_sale['thrift_plus'])  # a member's receipt has nothing to claim
        Cart.objects.filter(pk=sale['id']).update(completed_at=timezone.now() - timedelta(days=1))
        again = self.api.get(f"/api/pos/carts/{sale['id']}/").json()
        self.assertNotIn('claim_url', again['thrift_plus'])  # a reprint the next day: the plain join QR

    def test_joining_the_same_day_adds_exactly_what_the_trip_would_have_collected(self):
        sale = self._guest_sale('ITMTPLAMP', 'ITMTPVASE')
        missed = re.search(r'([\d.]+) ThriftBucks', sale['thrift_plus']['guest_line']).group(1)
        self.assertEqual(missed, '45.00')
        account, app = self._new_member()
        r = self._claim(app, self._token(sale))
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['added'], missed)
        self.assertEqual(r.json()['message'], "45.00 ThriftBucks from today's trip are in your account.")
        self.assertEqual(r.json()['session']['status'], 'member')
        tie = CartMember.objects.get(cart_id=sale['id'])
        self.assertEqual((tie.account_id, tie.rering, tie.reward_choice), (account.pk, True, CartMember.CHOICE_BANK))
        self.assertEqual(ledger.bucks_total(account), D('45.00'))
        # Kept, like the register's re-ring: usable from tomorrow, no instant redemption, no credit; the items stay AS IS.
        self.assertEqual(ledger.available_bucks(account), D('0.00'))
        self.assertEqual(ledger.available_bucks(account, timezone.localdate() + timedelta(days=1)), D('45.00'))
        self.assertEqual(ledger.credit_balance(account), D('0.00'))
        self.assertEqual(set(LedgerEntry.objects.filter(account=account).values_list('reason', flat=True)), {'rering'})
        self.assertTrue(Event.objects.filter(action='receipt_claim', account=account, detail__bucks='45.00').exists())

    def test_one_claim_per_sale(self):
        sale = self._guest_sale()
        _, first = self._new_member()
        self.assertEqual(self._claim(first, self._token(sale)).status_code, 200)
        again = self._claim(first, self._token(sale))
        self.assertEqual((again.status_code, again.json()['code']), (400, 'ALREADY_CLAIMED'))
        _, second = self._new_member('Di', '4025550188')
        other = self._claim(second, self._token(sale))
        self.assertEqual((other.status_code, other.json()['code']), (400, 'ALREADY_CLAIMED'))
        self.assertEqual(LedgerEntry.objects.filter(cart_id=sale['id']).count(), 1)

    def test_a_sale_with_a_member_already_cannot_be_claimed(self):
        cart = self._cart()
        self._attach(cart['id'])
        self._complete(cart['id'])
        _, app = self._new_member()
        r = self._claim(app, receipt_claim.token_for(cart['id']))
        self.assertEqual((r.status_code, r.json()['code']), (400, 'ALREADY_CLAIMED'))

    def test_only_the_day_of_the_sale(self):
        sale = self._guest_sale()
        account, app = self._new_member()
        yesterday = timezone.now() - timedelta(days=1)
        Cart.objects.filter(pk=sale['id']).update(completed_at=yesterday)
        Account.objects.filter(pk=account.pk).update(created_at=yesterday)  # even joined that day: the day is over
        r = self._claim(app, self._token(sale))
        self.assertEqual((r.status_code, r.json()['code']), (400, 'TOO_LATE'))
        self.assertFalse(CartMember.objects.filter(cart_id=sale['id']).exists())

    def test_void_and_training_sales_cannot_be_claimed(self):
        sale = self._guest_sale()
        _, app = self._new_member()
        for status_ in ('voided', 'training', 'open'):
            Cart.objects.filter(pk=sale['id']).update(status=status_)
            r = self._claim(app, self._token(sale))
            self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_CLAIMABLE'), status_)
        self.assertEqual(LedgerEntry.objects.count(), 0)

    def test_only_a_membership_joined_that_day(self):
        sale = self._guest_sale()
        account, app = self._new_member()
        Account.objects.filter(pk=account.pk).update(created_at=timezone.now() - timedelta(days=3))
        r = self._claim(app, self._token(sale))
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_NEW'))

    def test_a_join_not_finished_waits_and_a_bad_link_is_refused(self):
        sale = self._guest_sale()
        account, app = self._new_member()
        Account.objects.filter(pk=account.pk).update(status=Account.STATUS_PENDING)
        r = self._claim(app, self._token(sale))
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_FINISHED'))
        Account.objects.filter(pk=account.pk).update(status=Account.STATUS_ACTIVE)
        bad = self._claim(app, self._token(sale)[:-1] + 'Q')
        self.assertEqual((bad.status_code, bad.json().get('code')), (400, 'BAD_TOKEN'), bad.content)
        self.assertEqual(self._claim(app, self._token(sale)).status_code, 200)  # finished: it goes through

    def test_signed_out_cannot_claim(self):
        sale = self._guest_sale()
        r = APIClient().post(BASE + 'me/claim-receipt/', {'token': self._token(sale)}, format='json')
        self.assertIn(r.status_code, (401, 403))

    def test_the_receipt_link_opens_join_with_the_token(self):
        for path in ('/J/AB12CDEFGHIJKLMN', '/j/ab12cdefghijklmn/'):
            r = self.client.get(path)
            self.assertEqual((r.status_code, r['Location']), (302, '/scan?view=join&claim=AB12CDEFGHIJKLMN'), path)
