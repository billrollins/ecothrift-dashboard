"""Thrift+ email sign-in (owner 2026-10-15, rulebook J8, J11, J12; workspace/signin-contract.md): join online with a
name and email, the emailed link or 6-digit code, the limits, a pending membership at the register (MEMBER_PENDING,
Finish joining), and staff sending the app link from Dash. The mail send is mocked: nothing real is ever sent."""
from __future__ import annotations

import re
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.pos.models import Register
from apps.thriftplus.models import Account, Card, CartMember, Event, LedgerEntry, MemberEmailToken, MemberSession, Person
from apps.thriftplus.services import member_auth, members, register, signin_emails
from apps.thriftplus.services.overview import overview
from apps.thriftplus.tests.test_register import RegisterBase

BASE = '/api/thriftplus/public/'
IP = '203.0.113.5'
JOIN_WORDS = 'Tap to confirm your email and start your Thrift+ membership.'
SIGN_IN_WORDS = 'Tap to sign in to Thrift+.'
SMALL_PRINT = "The link and code work once, for 15 minutes. Didn't ask for this? You can ignore this email."


class MailMixin:
    """The store mailbox, mocked (never a real email)."""

    def start_mail(self):
        cache.clear()
        mailer = patch('apps.webstore.emails._send', return_value=True)
        self.send = mailer.start()
        self.addCleanup(mailer.stop)

    def mail(self, n=-1) -> dict:
        args, kwargs = self.send.call_args_list[n]
        return {'subject': args[0], 'text': args[1], 'to': args[2], 'html': kwargs.get('html_body', '')}

    def token(self, n=-1) -> str:
        return re.search(r'/scan\?signin=(\S+)', self.mail(n)['text']).group(1)

    def code(self, n=-1) -> str:
        return ''.join(re.search(r'in the app: (\d{3}) (\d{3})', self.mail(n)['text']).groups())

    def skip_gap(self, email):
        """As if 30 seconds had passed since the last send to this email."""
        cache.delete(f"thriftplus:send-last:{member_auth._hash(email, 'limit')}")


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us')
class EmailSignInTests(MailMixin, TestCase):
    def setUp(self):
        self.start_mail()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.api = APIClient()

    def _join(self, name='Ana Maria Diaz', email='Ana@Example.com', ip=IP, api=None):
        return (api or self.api).post(BASE + 'join/', {'name': name, 'email': email}, format='json', REMOTE_ADDR=ip)

    def _ask(self, email, ip=IP, api=None):
        return (api or self.api).post(BASE + 'session/email/', {'email': email}, format='json', REMOTE_ADDR=ip)

    def _link(self, token, api=None):
        return (api or self.api).post(BASE + 'session/link/', {'token': token}, format='json')

    def _code(self, email, code, ip=IP, api=None):
        return (api or self.api).post(BASE + 'session/code/', {'email': email, 'code': code}, format='json', REMOTE_ADDR=ip)

    def _member(self, email='bo@example.com', verified=False):
        account = members.create_account(first_name='Bo', last_name='Lee', phone='4025550102', email=email)
        person = account.people.get()
        if verified:
            Person.objects.filter(pk=person.pk).update(email_verified_at=timezone.now())
        return person

    # ── Joining ──

    def test_a_new_email_makes_a_pending_membership_with_a_member_code_and_sends_the_join_email(self):
        r = self._join()
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent'}))
        person = Person.objects.get(email='ana@example.com')
        self.assertEqual((person.first_name, person.last_name, person.phone, person.role), ('Ana', 'Maria Diaz', '', 'primary'))
        self.assertEqual(person.account.status, Account.STATUS_PENDING)
        self.assertIsNone(person.email_verified_at)
        self.assertTrue(Card.objects.filter(person=person, status=Card.STATUS_ACTIVE).exists())  # their QR shows
        mail = self.mail()
        self.assertEqual((mail['subject'], mail['to']), ('Confirm your email for Thrift+', 'ana@example.com'))
        token = MemberEmailToken.objects.get()
        self.assertEqual((token.purpose, token.email, token.ip, token.person), ('join', 'ana@example.com', IP, person))
        self.assertNotIn(self.token(), (token.token_hash, token.code_hash))  # only keyed hashes are kept
        self.assertGreater(token.expires_at, timezone.now() + timedelta(minutes=14))
        self.assertLessEqual(token.expires_at, timezone.now() + timedelta(minutes=15))
        sent = Event.objects.get(action='email_link_sent')
        self.assertEqual((sent.detail['to'], sent.detail['purpose'], sent.person), ('a***@example.com', 'join', person))
        self.assertTrue(Event.objects.filter(action='joined_online', person=person).exists())
        self.assertNotIn('ana@example.com', str(list(Event.objects.values_list('detail', flat=True))))  # masked

    def test_the_join_email_has_the_words_the_link_and_the_code(self):
        self._join()
        mail = self.mail()
        token, code = self.token(), self.code()
        self.assertEqual(mail['text'], (
            f'{JOIN_WORDS}\n\nConfirm and sign in: https://ecothrift.us/scan?signin={token}\n\n'
            f'Or type this code in the app: {code[:3]} {code[3:]}\n\n{SMALL_PRINT}\n\n'
            'Eco-Thrift\n8425 W Center Rd, Omaha, NE 68124\n'
        ))
        self.assertRegex(code, r'^\d{6}$')
        for words in (JOIN_WORDS, 'Confirm and sign in', f'{code[:3]} {code[3:]}', "Didn&#x27;t ask for this?",
                      'background:#3f9f35', f'href="https://ecothrift.us/scan?signin={token}"'):
            self.assertIn(words, mail['html'])
        self.assertNotIn('card', (mail['text'] + mail['html']).lower())  # J10: never "card"

    def test_the_sign_in_email_words(self):
        subject, text, html = signin_emails.render('sign_in', link='https://ecothrift.us/scan?signin=abc', code='012345')
        self.assertEqual(subject, 'Your Thrift+ sign-in link')
        self.assertTrue(text.startswith(f'{SIGN_IN_WORDS}\n\nSign in: https://ecothrift.us/scan?signin=abc\n\n'
                                        'Or type this code in the app: 012 345\n\n'))
        self.assertIn(SMALL_PRINT, text)
        self.assertIn('>Sign in</a>', html)
        self.assertEqual(signin_emails.spaced('123456'), '123 456')

    def test_an_email_already_a_members_gets_a_sign_in_email_and_no_new_membership(self):
        bo = self._member()
        before = Account.objects.count()
        r = self._join(name='Somebody Else', email='BO@example.com')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent'}))  # the same answer as a new join
        self.assertEqual(Account.objects.count(), before)
        self.assertEqual(self.mail()['subject'], 'Your Thrift+ sign-in link')
        self.assertEqual(MemberEmailToken.objects.get().person, bo)

    def test_a_pending_join_not_confirmed_gets_the_join_email_again_then_sign_in_once_confirmed(self):
        self._join()
        self.skip_gap('ana@example.com')
        self._join(name='Ana Diaz')
        self.assertEqual(self.mail()['subject'], 'Confirm your email for Thrift+')
        self.assertEqual(Account.objects.filter(status=Account.STATUS_PENDING).count(), 1)
        self.assertEqual(self._link(self.token()).status_code, 200)
        self.skip_gap('ana@example.com')
        self._ask('ana@example.com')
        self.assertEqual(self.mail()['subject'], 'Your Thrift+ sign-in link')

    def test_a_revoked_memberships_email_joins_nothing_and_gets_nothing(self):
        bo = self._member()
        members.revoke(bo.account, reason='tag switching')
        r = self._join(email='bo@example.com')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent'}))
        self.send.assert_not_called()
        self.assertFalse(Account.objects.filter(status=Account.STATUS_PENDING).exists())

    def test_bad_requests_say_what_is_wrong(self):
        r = self._join(name='  ')
        self.assertEqual((r.status_code, r.json()['code'], r.json()['detail']),
                         (400, 'NAME_NEEDED', 'Enter your first and last name.'))
        r = self._join(email='not-an-email')
        self.assertEqual((r.status_code, r.json()['code'], r.json()['detail']), (400, 'EMAIL_BAD', 'Check your email address.'))
        self.assertEqual(self._ask('nope').json(), {'code': 'EMAIL_BAD', 'detail': 'Check your email address.'})
        self.send.assert_not_called()

    # ── "Email me a link": never says whether an email is a member's ──

    def test_the_answer_is_the_same_whether_or_not_the_email_is_a_members(self):
        self._member()
        member = self._ask('bo@example.com')
        stranger = self._ask('who@example.com')
        self.assertEqual((member.status_code, member.json()), (stranger.status_code, stranger.json()))
        self.assertEqual(member.json(), {'status': 'sent'})
        self.assertEqual(self.send.call_count, 1)  # only the member's
        self.assertEqual(self.mail()['subject'], 'Your Thrift+ sign-in link')

    # ── The link and the code ──

    def test_the_link_signs_in_once_for_a_year_and_confirms_the_email(self):
        self._join()
        r = self._link(self.token())
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['status'], body['purpose']), ('member', 'join'))
        self.assertEqual((body['member']['ready'], body['member']['email_verified'], body['member']['email']),
                         (False, True, 'ana@example.com'))
        self.assertEqual(body['member']['session_kind'], 'email')
        self.assertIn(member_auth.COOKIE, r.cookies)
        session = MemberSession.objects.get()
        self.assertEqual(session.kind, MemberSession.KIND_EMAIL)
        self.assertGreater(session.expires_at, timezone.now() + timedelta(days=364))
        person = Person.objects.get(email='ana@example.com')
        self.assertIsNotNone(person.email_verified_at)
        self.assertEqual(Event.objects.get(action='email_link_used').detail, {'purpose': 'join', 'to': 'a***@example.com', 'how': 'link'})
        # A pending member sees their member QR, not ready (J2), and collects nothing.
        card = self.api.get(BASE + 'me/card/').json()
        self.assertEqual((card['ready'], card['qr'][:2]), (False, 'TP'))
        self.assertTrue(self.api.get(BASE + 'me/').json()['can_change'])  # the email is the strong sign-in (no password)
        # Once only.
        again = self._link(self.token(), api=APIClient())
        self.assertEqual((again.status_code, again.json()['code'], again.json()['detail']),
                         (400, 'LINK_USED', 'That link has already been used. Send a new one.'))
        self.assertTrue(Event.objects.filter(action='email_link_failed', detail__code='LINK_USED').exists())
        # Sign-out ends it.
        self.api.post(BASE + 'session/sign-out/')
        self.assertEqual(self.api.get(BASE + 'session/').json()['status'], 'signed_out')

    def test_an_email_session_changes_the_membership_like_a_password_and_a_card_session_still_cannot(self):
        """J11: members have no password, so an emailed link or code is the strong sign-in (news back on, removing a
        person, a lost code). The old card sign-in stays restricted."""
        from apps.texting import service as texting

        bo = self._member(verified=True)
        texting.record_email_consent('bo@example.com', kind='news', opted_in=False, how='test')
        dee = members.add_second_adult(bo.account, both_present=True, primary_approves=True, first_name='Dee')
        self._ask('bo@example.com')
        self.assertEqual(self._code('bo@example.com', self.code()).status_code, 200)
        me = self.api.get(BASE + 'me/').json()
        self.assertEqual((me['can_change'], me['emails']['news']), (True, False))
        on = self.api.post(BASE + 'me/emails/', {'news': True}, format='json')
        self.assertEqual((on.status_code, on.json()['emails']['news']), (200, True))
        removed = self.api.post(BASE + 'me/remove-person/', {'person': dee.pk}, format='json')
        self.assertEqual(removed.status_code, 200, removed.content)
        self.assertIsNotNone(Person.objects.get(pk=dee.pk).removed_at)
        # The old card sign-in: looks only.
        card = APIClient()
        token, _ = member_auth.start_session(bo, MemberSession.KIND_CARD)
        card.cookies[member_auth.COOKIE] = token
        self.assertFalse(card.get(BASE + 'me/').json()['can_change'])
        refused = card.post(BASE + 'me/emails/', {'news': True}, format='json')
        self.assertEqual((refused.status_code, refused.json()['code']), (403, 'NEEDS_PASSWORD'))

    def test_an_old_or_wrong_link_says_so(self):
        self._join()
        token = self.token()
        MemberEmailToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        r = self._link(token)
        self.assertEqual((r.status_code, r.json()['code'], r.json()['detail']),
                         (400, 'LINK_EXPIRED', 'That link has expired. Send a new one.'))
        r = self._link('made-up')
        self.assertEqual((r.json()['code'], r.json()['detail']), ('LINK_BAD', "That link didn't work. Send a new one."))
        self.assertFalse(MemberSession.objects.exists())

    def test_the_code_signs_in_like_the_link(self):
        bo = self._member(verified=True)
        self._ask('bo@example.com')
        code = self.code()
        r = self._code('BO@example.com', f'{code[:3]} {code[3:]}')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['purpose'], r.json()['member']['ready']), ('sign_in', True))
        self.assertEqual(MemberSession.objects.get().person, bo)
        again = self._code('bo@example.com', code)
        self.assertEqual((again.status_code, again.json()['code']), (400, 'CODE_BAD'))  # used: no unused one left
        self.assertEqual(self._link(self.token()).json()['code'], 'LINK_USED')  # the link and the code are one token

    def test_only_the_newest_code_works(self):
        self._member()
        self._ask('bo@example.com')
        old = self.code()
        self.skip_gap('bo@example.com')
        self._ask('bo@example.com')
        new = self.code()
        if old != new:
            self.assertEqual(self._code('bo@example.com', old).json()['code'], 'CODE_BAD')
        self.assertEqual(self._code('bo@example.com', new).status_code, 200)

    def test_five_wrong_codes_kill_it(self):
        self._member()
        self._ask('bo@example.com')
        code = self.code()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(member_auth.CODE_TRIES):
            r = self._code('bo@example.com', wrong)
            self.assertEqual((r.status_code, r.json()['code'], r.json()['detail']),
                             (400, 'CODE_BAD', "That code didn't work. Check it and try again."))
        r = self._code('bo@example.com', code)
        self.assertEqual((r.status_code, r.json()['code'], r.json()['detail']),
                         (400, 'CODE_EXPIRED', 'That code has expired. Send a new one.'))
        self.assertEqual(self._link(self.token()).json()['code'], 'LINK_EXPIRED')
        self.assertFalse(MemberSession.objects.exists())

    def test_an_old_code_has_expired(self):
        self._member()
        self._ask('bo@example.com')
        MemberEmailToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self._code('bo@example.com', self.code()).json()['code'], 'CODE_EXPIRED')

    # ── The limits ──

    def test_30_seconds_between_sends_to_one_email(self):
        self._member()
        self._ask('bo@example.com')
        r = self._ask('bo@example.com')
        self.assertEqual((r.status_code, r.json()['code'], r.json()['detail']),
                         (429, 'TOO_SOON', 'Too many tries. Wait a few minutes and try again.'))
        self.assertTrue(1 <= r.json()['retry_after'] <= 30)
        stranger = self._ask('who@example.com')
        self.assertEqual(stranger.status_code, 200)
        self.assertEqual(self._ask('who@example.com').status_code, 429)  # the same for a non-member: nothing told
        self.assertEqual(self.send.call_count, 1)

    def test_3_sends_per_email_in_15_minutes_and_6_an_hour(self):
        self._member()
        for _ in range(3):
            self.assertEqual(self._ask('bo@example.com').status_code, 200)
            self.skip_gap('bo@example.com')
        r = self._ask('bo@example.com')
        self.assertEqual((r.status_code, r.json()['code']), (429, 'TOO_MANY'))
        cache.delete(f"thriftplus:send-15m:{member_auth._hash('bo@example.com', 'limit')}")  # 15 minutes later
        for _ in range(3):
            self.assertEqual(self._ask('bo@example.com', ip='198.51.100.9').status_code, 200)
            self.skip_gap('bo@example.com')
        cache.delete(f"thriftplus:send-15m:{member_auth._hash('bo@example.com', 'limit')}")
        self.assertEqual(self._ask('bo@example.com', ip='198.51.100.10').json()['code'], 'TOO_MANY')  # 6 this hour
        self.assertEqual(self.send.call_count, 6)

    def test_10_sends_an_hour_from_one_address(self):
        for n in range(member_auth.SENDS_PER_IP_HOUR):
            self.assertEqual(self._join(name=f'Person {n}', email=f'p{n}@example.com').status_code, 200)
        r = self._join(name='One More', email='p99@example.com')
        self.assertEqual((r.status_code, r.json()['code']), (429, 'TOO_MANY'))
        self.assertEqual(self._join(name='One More', email='p99@example.com', ip='198.51.100.9').status_code, 200)

    def test_10_code_tries_from_one_address_in_15_minutes(self):
        self._member()
        self._ask('bo@example.com')
        for n in range(member_auth.CODE_TRIES_PER_IP):
            self.assertEqual(self._code(f'who{n}@example.com', '123456').status_code, 400)
        r = self._code('bo@example.com', self.code())
        self.assertEqual((r.status_code, r.json()['code']), (429, 'TOO_MANY'))
        self.assertEqual(self._code('bo@example.com', self.code(), ip='198.51.100.9').status_code, 200)

    # ── While Thrift+ is off ──

    def test_off_joining_is_closed_and_a_link_is_refused_without_using_it(self):
        self._member()
        self._ask('bo@example.com')
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': False})
        r = self._join(email='new@example.com')
        self.assertEqual((r.status_code, r.json()['code']), (403, 'THRIFT_PLUS_OFF'))
        r = self._link(self.token())
        self.assertEqual((r.status_code, r.json()['code']), (403, 'THRIFT_PLUS_OFF'))
        self.assertIsNone(MemberEmailToken.objects.get().used_at)
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.assertEqual(self._link(self.token()).status_code, 200)


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us')
class FinishJoiningTests(MailMixin, RegisterBase):
    """A pending membership at the register (J2, J8): its QR answers MEMBER_PENDING; Finish joining takes the phone
    (read back), the ID and the photo, and then it is a member like any other."""

    def setUp(self):
        super().setUp()
        self.start_mail()
        member_auth.join('Cara Joyner', 'cara@example.com', base_url='https://ecothrift.us', ip=IP)
        self.cara = Person.objects.get(email='cara@example.com')
        self.cara_code = Card.objects.get(person=self.cara).code

    def _finish(self, **data):
        body = {'person': self.cara.pk, 'phone': '(402) 555-0177', 'id_checked': 'true', 'verified_18': 'true', **data}
        return self.api.post('/api/thriftplus/register/finish/', body, format='multipart')

    def test_a_pending_qr_answers_member_pending_everywhere_and_collects_nothing(self):
        cart = self._cart()
        expected = {
            'code': 'MEMBER_PENDING', 'person_id': self.cara.pk, 'account_id': self.cara.account_id,
            'detail': 'Joined online. Finish joining first: ask the phone number, check the ID, take the photo.',
            'first_name': 'Cara', 'last_name': 'Joyner', 'email': 'cara@example.com', 'code_last4': self.cara_code[-4:],
        }
        for r in (self._attach(cart['id'], self.cara_code),
                  self.api.post('/api/thriftplus/register/attach/', {'cart': cart['id'], 'person': self.cara.pk}, format='json')):
            self.assertEqual(r.status_code, 400, r.content)
            got = r.json()
            self.assertTrue(got.pop('joined_at'))
            self.assertEqual(got, expected)
        self.assertFalse(CartMember.objects.exists())
        done = self._complete(cart['id'])
        self.assertEqual(done.status_code, 200, done.content)
        rering = self.api.post('/api/thriftplus/register/rering/', {'cart': cart['id'], 'code': f'TP{self.cara_code}'}, format='json')
        self.assertEqual(rering.json()['code'], 'MEMBER_PENDING')
        lookup = self.api.get('/api/thriftplus/returns/lookup/', {'code': self.cara_code})
        self.assertEqual((lookup.status_code, lookup.json()['code'], lookup.json()['person_id']), (400, 'MEMBER_PENDING', self.cara.pk))
        self.assertFalse(LedgerEntry.objects.filter(account=self.cara.account).exists())

    def test_the_cashier_finds_pending_joins_by_name_email_or_code_newest_first(self):
        member_auth.join('Cara Two', 'cara2@example.com', base_url='https://ecothrift.us', ip='198.51.100.9')
        find = lambda q: self.api.post('/api/thriftplus/register/pending/', {'q': q}, format='json').json()['people']  # noqa: E731
        self.assertEqual([p['first_name'] for p in find('cara')], ['Cara', 'Cara'])
        self.assertEqual([p['last_name'] for p in find('cara')], ['Two', 'Joyner'])  # newest first
        self.assertEqual([p['person_id'] for p in find('JOYNER')], [self.cara.pk])
        self.assertEqual([p['person_id'] for p in find('cara@example')], [self.cara.pk])
        self.assertEqual([p['person_id'] for p in find(f'TP{self.cara_code}')], [self.cara.pk])
        self.assertEqual(len(find('')), 2)
        self.assertEqual(find('Ana'), [])  # an active member is not a pending join
        row = find('joyner')[0]
        self.assertEqual(set(row), {'person_id', 'account_id', 'first_name', 'last_name', 'email', 'joined_at', 'code_last4'})

    def test_finishing_verifies_the_phone_in_person_and_puts_them_on_the_sale(self):
        cart = self._cart()
        photo = SimpleUploadedFile('cara.jpg', b'\xff\xd8\xff\xe0fake', content_type='image/jpeg')
        r = self._finish(cart=cart['id'], photo=photo)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['person_id'], body['status']), (self.cara.pk, 'active'))
        self.assertEqual(body['cart']['thrift_plus']['member']['person_id'], self.cara.pk)
        cara = Person.objects.select_related('account').get(pk=self.cara.pk)
        self.assertEqual((cara.account.status, cara.phone, cara.phone_verified_by, cara.id_checked, cara.verified_18),
                         ('active', '4025550177', self.clerk, True, True))
        self.assertIsNotNone(cara.phone_verified_at)
        self.assertTrue(cara.photo)
        self.assertEqual(Event.objects.get(action='finished_joining').actor, self.clerk)
        # Now a member like any other: found by phone, and their QR goes on a sale.
        found = self.api.post('/api/thriftplus/register/find/', {'phone': '402-555-0177'}, format='json').json()['people']
        self.assertEqual([p['person_id'] for p in found], [cara.pk])
        self.assertEqual(self._attach(self._cart()['id'], self.cara_code).status_code, 200)

    def test_a_phone_on_another_membership_is_refused(self):
        r = self._finish(phone='402-555-0101')  # Ana's
        self.assertEqual((r.status_code, r.json()['code'], r.json()['detail']),
                         (409, 'PHONE_TAKEN', 'That phone number is on another membership. Check the ID and ask a manager.'))
        self.assertEqual(Account.objects.get(pk=self.cara.account_id).status, Account.STATUS_PENDING)
        r = self._finish(phone='555-0177')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'PHONE_BAD'))
        self.assertEqual(self._finish().status_code, 200)
        self.assertEqual(self._finish().json()['code'], 'NOT_PENDING')

    def test_the_training_register_cannot_finish_a_real_join(self):
        Register.objects.filter(pk=self.register.pk).update(is_training=True)
        cart = self._cart()
        r = self._finish(cart=cart['id'])
        self.assertEqual((r.status_code, r.json()['code']), (400, 'TRAINING'))
        self.assertEqual(Account.objects.get(pk=self.cara.account_id).status, Account.STATUS_PENDING)

    # ── Finalize Thrift+ on the cashier's phone (owner 2026-10-16, J5) ──

    PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32

    def _signature(self, data=None):
        return SimpleUploadedFile('signature.png', data or self.PNG, content_type='image/png')

    def test_finish_with_a_signature_stores_it_with_when_and_the_terms_version(self):
        r = self._finish(signature=self._signature(), finalize='true')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['status'], r.json()['signed'], r.json()['cart']), ('active', True, None))
        cara = Person.objects.get(pk=self.cara.pk)
        self.assertTrue(cara.signature.name.startswith('thriftplus/signatures/'))
        self.assertTrue(cara.signature.name.endswith('.png'))
        self.assertIsNotNone(cara.signed_at)
        self.assertEqual(cara.signed_terms_version, register.TERMS_VERSION)
        self.assertTrue(Event.objects.get(action='finished_joining').detail['signed'])

    def test_finalize_refuses_without_the_signature_or_the_id_check_and_stays_pending(self):
        r = self._finish(finalize='true')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'SIGNATURE_NEEDED'))
        r = self._finish(finalize='true', id_checked='false', signature=self._signature())
        self.assertEqual((r.status_code, r.json()['code']), (400, 'ID_NEEDED'))
        r = self._finish(finalize='true', signature=self._signature(b'GIF89a-not-a-png'))
        self.assertEqual((r.status_code, r.json()['code']), (400, 'SIGNATURE_BAD'))
        r = self._finish(finalize='true', phone='555-0177', signature=self._signature())
        self.assertEqual((r.status_code, r.json()['code']), (400, 'PHONE_BAD'))
        self.assertEqual(Account.objects.get(pk=self.cara.account_id).status, Account.STATUS_PENDING)
        self.assertFalse(Person.objects.get(pk=self.cara.pk).signature)

    def test_the_register_finish_still_works_without_a_signature(self):
        r = self._finish()
        self.assertEqual((r.status_code, r.json()['signed']), (200, False))
        self.assertIsNone(Person.objects.get(pk=self.cara.pk).signed_at)

    def test_finishing_is_staff_only(self):
        from apps.thriftplus.tests.test_register import _user

        anon = APIClient().post('/api/thriftplus/register/finish/', {'person': self.cara.pk}, format='multipart')
        self.assertIn(anon.status_code, (401, 403))
        outsider = _user('consignee@example.com', 'Consignee')
        api = APIClient()
        api.force_authenticate(outsider)
        r = api.post('/api/thriftplus/register/finish/', {'person': self.cara.pk, 'phone': '4025550177',
                                                         'id_checked': 'true', 'finalize': 'true',
                                                         'signature': self._signature()}, format='multipart')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(api.post('/api/thriftplus/register/pending/', {'q': 'cara'}, format='json').status_code, 403)
        self.assertEqual(Account.objects.get(pk=self.cara.account_id).status, Account.STATUS_PENDING)

    def test_a_scanned_qr_of_an_active_member_says_so(self):
        ana_code, blank = self.codes[0], self.codes[2]  # Ana's, and a card no one has
        r = self.api.post('/api/thriftplus/register/pending/', {'q': f'TP{ana_code}'}, format='json').json()
        self.assertEqual((r['people'], r['member']), ([], {'status': 'active', 'first_name': 'Ana'}))
        r = self.api.post('/api/thriftplus/register/pending/', {'q': f'TP{blank}'}, format='json').json()
        self.assertEqual(r['member']['status'], 'unknown')
        r = self.api.post('/api/thriftplus/register/pending/', {'q': 'nobody'}, format='json').json()
        self.assertNotIn('member', r)
        r = self.api.post('/api/thriftplus/register/pending/', {'q': f'TP{self.cara_code}'}, format='json').json()
        self.assertEqual(([p['person_id'] for p in r['people']], 'member' in r), ([self.cara.pk], False))

    def test_a_register_sign_up_verifies_the_phone_too(self):
        r = self.api.post('/api/thriftplus/accounts/', {'first_name': 'Dot', 'phone': '402 555 0190'}, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        dot = Person.objects.get(phone='4025550190')
        self.assertEqual(dot.phone_verified_by, self.clerk)
        self.assertIsNotNone(dot.phone_verified_at)

    def test_overview_and_the_members_list_count_pending_joins_apart(self):
        numbers = overview()['members']
        self.assertEqual((numbers['active'], numbers['pending']), (2, 1))
        self.assertEqual(sum(d['n'] for d in numbers['signups']), 2)  # a pending join is not a sign-up yet
        listed = self.api.get('/api/thriftplus/accounts/', {'status': 'pending'}).json()
        self.assertEqual([a['id'] for a in listed], [self.cara.account_id])
        self.assertEqual(listed[0]['people'][0]['email_verified_at'], None)
        self.assertEqual(self.api.get('/api/thriftplus/accounts/', {'q': 'cara@exam'}).json()[0]['id'], self.cara.account_id)


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us')
class StaffEmailLinkTests(MailMixin, RegisterBase):
    """J12: a member who joined at the register with no email gets the app once staff add an email and send the link."""

    def setUp(self):
        super().setUp()
        self.start_mail()
        self.bo = Person.objects.get(first_name='Bo')

    def _send_link(self, person, **data):
        return self.api.post(f'/api/thriftplus/members/{person.pk}/email-link/', data, format='json')

    def test_staff_add_the_email_and_send_the_join_link_then_a_sign_in_link_once_confirmed(self):
        r = self._send_link(self.bo, email='Bo@Example.com')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['sent'], r.json()['sent_to'], r.json()['people'][0]['email']), ('join', 'b***@example.com', 'bo@example.com'))
        self.assertEqual((self.mail()['subject'], self.mail()['to']), ('Confirm your email for Thrift+', 'bo@example.com'))
        self.assertEqual(Event.objects.get(action='email_link_sent').actor, self.clerk)
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        member = APIClient().post(BASE + 'session/link/', {'token': self.token()}, format='json')
        self.assertEqual((member.status_code, member.json()['member']['ready']), (200, True))
        self.skip_gap('bo@example.com')
        self.assertEqual(self.api.post(f'/api/thriftplus/people/{self.bo.pk}/email-link/', {}, format='json').json()['sent'], 'sign_in')
        self.assertEqual(self.mail()['subject'], 'Your Thrift+ sign-in link')

    def test_no_email_no_link_and_a_new_address_must_be_confirmed_again(self):
        r = self._send_link(self.bo)
        self.assertEqual((r.status_code, r.json()['detail']), (400, 'Add an email address first.'))
        self.send.assert_not_called()
        Person.objects.filter(pk=self.bo.pk).update(email='bo@example.com', email_verified_at=timezone.now())
        self.assertEqual(self._send_link(self.bo, email='bo.new@example.com').json()['sent'], 'join')
        self.assertIsNone(Person.objects.get(pk=self.bo.pk).email_verified_at)

    def test_staff_only(self):
        self.assertIn(APIClient().post(f'/api/thriftplus/members/{self.bo.pk}/email-link/', {}, format='json').status_code, (401, 403))

    def test_a_pending_join_finished_by_staff_link_keeps_register_rules(self):
        """Staff can resend a pending join its join email; it still has to finish at a register."""
        member_auth.join('Cara Joyner', 'cara@example.com', base_url='https://ecothrift.us', ip=IP)
        cara = Person.objects.get(email='cara@example.com')
        self.skip_gap('cara@example.com')
        self.assertEqual(self._send_link(cara).json()['sent'], 'join')
        self.assertEqual(register.pending('cara')[0]['person_id'], cara.pk)
