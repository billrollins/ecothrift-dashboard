"""Join v2 (owner 2026-10-19, workspace/join_contract.md): the sign-in options, Continue with Google, one "Phone or
email" box with a texted (Twilio Verify) or emailed code, the selfie and signature in the app, "confirmed" by email or
phone, and the Finalize rules when the app already has the selfie and signature. Google's check and Twilio are mocked:
nothing real is ever texted or fetched."""
from __future__ import annotations

import base64
import io
import os
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.thriftplus.models import Account, Card, Event, MemberSession, Person
from apps.thriftplus.services import google_sign_in, member_auth, member_list, members, phone_codes, register
from apps.thriftplus.tests.test_email_sign_in import MailMixin
from apps.thriftplus.tests.test_register import RegisterBase

BASE = '/api/thriftplus/public/'
IP = '203.0.113.7'
PHONE = '4028675309'
CLAIMS = {'email': 'Ana.Diaz@Gmail.com', 'email_verified': True, 'given_name': 'ana', 'family_name': 'DIAZ',
          'name': 'ana DIAZ', 'sub': '123'}
GOOGLE_ENV = {'GOOGLE_CLIENT_ID': 'test-client.apps.googleusercontent.com'}


def _jpeg(size=(40, 40)) -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new('RGB', size, (120, 160, 90)).save(buf, 'JPEG')
    return SimpleUploadedFile('selfie.jpg', buf.getvalue(), content_type='image/jpeg')


def _png_data_url() -> str:
    buf = io.BytesIO()
    Image.new('RGBA', (60, 20), (0, 0, 0, 0)).save(buf, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


class TwilioMixin:
    """Texted codes on, with Twilio Verify mocked (``send``, ``check``)."""

    def start_twilio(self):
        cache.clear()
        for name, kwargs in (('available', {'return_value': True}), ('send', {'return_value': None}),
                             ('check', {'return_value': True})):
            p = patch(f'apps.thriftplus.services.phone_codes.{name}', **kwargs)
            setattr(self, f'twilio_{name}', p.start())
            self.addCleanup(p.stop)

    def _send(self, contact=PHONE, api=None, ip=IP, **names):
        return (api or self.app).post(BASE + 'code/send/', {'contact': contact, **names}, format='json', REMOTE_ADDR=ip)

    def _check(self, contact=PHONE, code='123456', api=None, ip=IP):
        return (api or self.app).post(BASE + 'code/check/', {'contact': contact, 'code': code}, format='json',
                                      REMOTE_ADDR=ip)

    def skip_phone_gap(self, digits=PHONE):
        cache.delete(member_auth._phone_key(digits, 'last'))

    def phone_join(self, api=None, first='pat', last='lee'):
        self.assertEqual(self._send(api=api, first_name=first, last_name=last).status_code, 200)
        r = self._check(api=api)
        self.assertEqual(r.status_code, 200, r.content)
        return Person.objects.get(phone=PHONE)


class PhoneCodesUnitTests(SimpleTestCase):
    def test_us_numbers_only(self):
        ok = {'(402) 867-5309': PHONE, '+1 402 867 5309': PHONE, '14028675309': PHONE, '402.867.5309': PHONE}
        for raw, want in ok.items():
            self.assertEqual(phone_codes.us_number(raw), want, raw)
        for raw in ('867-5309', '+44 20 7946 0958', '402-555-0123', '555-867-5309', '102-867-5309', '402-067-5309',
                    '911-867-5309', '402-411-5309', '', 'abc', '4028675309123'):
            self.assertEqual(phone_codes.us_number(raw), '', raw)
        self.assertEqual(phone_codes.masked(PHONE), '***-***-5309')

    def test_a_test_run_never_texts_even_with_the_keys(self):
        keys = {name: 'x' for name in phone_codes.KEYS}
        with patch.dict(os.environ, keys):
            self.assertTrue(phone_codes.configured())
            self.assertFalse(phone_codes.available())
            with patch('requests.post') as post:
                with self.assertRaises(phone_codes.PhoneCodeError):
                    phone_codes.send(PHONE)
                with self.assertRaises(phone_codes.PhoneCodeError):
                    phone_codes.check(PHONE, '123456')
                post.assert_not_called()
        with override_settings(DEBUG=True, RUNNING_TESTS=False), patch.dict(os.environ, keys):
            self.assertFalse(phone_codes.available())  # dev never texts either
        with override_settings(DEBUG=False, RUNNING_TESTS=False), patch.dict(os.environ, keys):
            self.assertTrue(phone_codes.available())  # production with the keys
        with override_settings(DEBUG=False, RUNNING_TESTS=False), patch.dict(os.environ, {**keys, 'TWILIO_API_KEY': ''}):
            self.assertFalse(phone_codes.available())

    def test_the_verify_calls(self):
        keys = {name: f'{name.lower()}-v' for name in phone_codes.KEYS}

        class Answer:
            def __init__(self, code, body=None):
                self.status_code, self._body = code, body or {}

            def json(self):
                return self._body

        with override_settings(DEBUG=False, RUNNING_TESTS=False), patch.dict(os.environ, keys), \
                patch('requests.post', return_value=Answer(201, {'status': 'pending'})) as post:
            phone_codes.send(PHONE)
            args, kwargs = post.call_args
            self.assertEqual(args[0], 'https://verify.twilio.com/v2/Services/twilio_verify_service_sid-v/Verifications')
            self.assertEqual(kwargs['data'], {'To': '+14028675309', 'Channel': 'sms'})
            self.assertEqual((kwargs['auth'], kwargs['timeout']), (('twilio_api_key-v', 'twilio_api_secret-v'), 10))
            post.return_value = Answer(200, {'status': 'approved'})
            self.assertTrue(phone_codes.check(PHONE, '123456'))
            self.assertEqual(post.call_args[1]['data'], {'To': '+14028675309', 'Code': '123456'})
            post.return_value = Answer(200, {'status': 'pending'})
            self.assertFalse(phone_codes.check(PHONE, '000000'))
            post.return_value = Answer(404)
            self.assertFalse(phone_codes.check(PHONE, '000000'))
            post.return_value = Answer(429)
            with self.assertRaises(phone_codes.PhoneCodeError):
                phone_codes.send(PHONE)


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us')
class JoinV2Tests(TwilioMixin, MailMixin, TestCase):
    def setUp(self):
        self.start_mail()
        self.start_twilio()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.app = APIClient()

    # ── The options ──

    def test_the_sign_in_options_follow_the_keys(self):
        with patch.dict(os.environ, GOOGLE_ENV):
            r = self.app.get(BASE + 'sign-in-options/')
        self.assertEqual((r.status_code, r.json()),
                         (200, {'google_client_id': GOOGLE_ENV['GOOGLE_CLIENT_ID'], 'phone': True, 'email': True}))
        self.twilio_available.return_value = False
        with patch.dict(os.environ, {'GOOGLE_CLIENT_ID': ''}):
            r = self.app.get(BASE + 'sign-in-options/')
        self.assertEqual(r.json(), {'google_client_id': None, 'phone': False, 'email': True})

    # ── Google ──

    def _google(self, claims=None, api=None):
        with patch.dict(os.environ, GOOGLE_ENV), \
                patch('apps.thriftplus.services.google_sign_in.verify', return_value=claims or CLAIMS) as verify:
            r = (api or self.app).post(BASE + 'google/', {'credential': 'id-token'}, format='json')
        if r.status_code == 200:
            verify.assert_called_once_with('id-token')
        return r

    def test_google_joins_a_new_email_then_signs_it_in(self):
        r = self._google()
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual((body['status'], body['purpose']), ('member', 'join'))
        self.assertEqual((body['member']['ready'], body['member']['email_verified'], body['member']['email']),
                         (False, True, 'ana.diaz@gmail.com'))
        self.assertEqual((body['member']['selfie'], body['member']['signed'], body['member']['finish_steps']),
                         (False, False, ['selfie', 'sign']))
        self.assertIn(member_auth.COOKIE, r.cookies)
        person = Person.objects.get(email='ana.diaz@gmail.com')
        self.assertEqual((person.first_name, person.last_name, person.account.status), ('Ana', 'Diaz', 'pending'))
        self.assertIsNotNone(person.email_verified_at)
        self.assertTrue(Card.objects.filter(person=person, status=Card.STATUS_ACTIVE).exists())
        self.assertEqual(Event.objects.get(action='joined_online').detail, {'to': 'a***@gmail.com', 'by': 'google'})
        self.assertEqual(MemberSession.objects.get().kind, MemberSession.KIND_EMAIL)
        self.assertEqual(member_list.stage(person.account, person), 'needs_finalize')
        again = self._google(api=APIClient())
        self.assertEqual((again.status_code, again.json()['purpose']), (200, 'sign_in'))
        self.assertEqual(Account.objects.count(), 1)

    def test_google_signs_in_an_existing_member_and_confirms_their_email(self):
        account = members.create_account(first_name='Bo', last_name='Lee', phone='4025550102', email='ana.diaz@gmail.com')
        r = self._google()
        self.assertEqual((r.status_code, r.json()['purpose'], r.json()['member']['ready']), (200, 'sign_in', True))
        self.assertEqual(Account.objects.count(), 1)
        self.assertIsNotNone(account.people.get().email_verified_at)

    def test_google_refused_when_off_bad_or_switched_off(self):
        with patch.dict(os.environ, {'GOOGLE_CLIENT_ID': ''}):
            r = self.app.post(BASE + 'google/', {'credential': 'id-token'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (404, 'GOOGLE_OFF'))
        with patch.dict(os.environ, GOOGLE_ENV), patch('apps.thriftplus.services.google_sign_in.verify',
                                                       side_effect=google_sign_in.GoogleError('bad')):
            r = self.app.post(BASE + 'google/', {'credential': 'forged'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'GOOGLE_BAD'))
        account = members.create_account(first_name='Bo', last_name='Lee', email='ana.diaz@gmail.com')
        members.revoke(account, reason='tag switching')
        r = self._google()
        self.assertEqual((r.status_code, r.json()['code']), (403, 'MEMBERSHIP_OFF'))
        self.assertFalse(MemberSession.objects.exists())
        self.assertEqual(Account.objects.count(), 1)

    def test_google_checks_the_real_token_against_the_client_id(self):
        with patch.dict(os.environ, GOOGLE_ENV), patch.object(google_sign_in._jwks, 'get_signing_key_from_jwt',
                                                              side_effect=google_sign_in.jwt.PyJWKClientError('no key')):
            with self.assertRaises(google_sign_in.GoogleError):
                google_sign_in.verify('not-a-real-token')
        with patch.dict(os.environ, {'GOOGLE_CLIENT_ID': ''}):
            with self.assertRaises(google_sign_in.GoogleError):
                google_sign_in.verify('x')

    def test_while_thrift_plus_is_off_google_joins_nobody_new(self):
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': False})
        r = self._google()
        self.assertEqual((r.status_code, r.json()['code']), (403, 'THRIFT_PLUS_OFF'))
        self.assertFalse(Account.objects.exists())

    # ── A phone join ──

    def test_a_phone_join_sends_then_the_code_makes_a_pending_member_and_signs_in(self):
        r = self._send(contact='(402) 867-5309', first_name='pat', last_name='LEE')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent', 'channel': 'sms'}))
        self.twilio_send.assert_called_once_with(PHONE)
        self.assertFalse(Person.objects.exists())  # made only when the code checks out
        r = self._check(contact='+1 402 867 5309', code='123 456')
        self.assertEqual(r.status_code, 200, r.content)
        self.twilio_check.assert_called_once_with(PHONE, '123456')
        body = r.json()
        self.assertEqual((body['status'], body['purpose']), ('member', 'join'))
        m = body['member']
        self.assertEqual((m['ready'], m['phone_verified'], m['email'], m['session_kind'], m['finish_steps']),
                         (False, True, '', 'phone', ['selfie', 'sign']))
        self.assertIn(member_auth.COOKIE, r.cookies)
        person = Person.objects.get()
        self.assertEqual((person.first_name, person.last_name, person.phone, person.email, person.role),
                         ('Pat', 'Lee', PHONE, '', 'primary'))
        self.assertIsNotNone(person.phone_verified_at)
        self.assertIsNone(person.phone_verified_by)
        self.assertEqual(person.account.status, Account.STATUS_PENDING)
        self.assertTrue(Card.objects.filter(person=person, status=Card.STATUS_ACTIVE).exists())
        self.assertEqual(Event.objects.get(action='joined_online').detail, {'to': '***-***-5309', 'by': 'phone'})
        self.assertEqual(MemberSession.objects.get().kind, MemberSession.KIND_PHONE)
        self.assertNotIn(PHONE, str(list(Event.objects.values_list('detail', flat=True))))  # masked
        self.assertTrue(self.app.get(BASE + 'me/').json()['can_change'])  # a texted code is a strong sign-in
        self.assertEqual(self.app.get(BASE + 'me/card/').json()['ready'], False)

    def test_a_members_phone_signs_in_after_the_code(self):
        account = members.create_account(first_name='Bo', last_name='Lee', phone=PHONE)
        r = self._send()
        self.assertEqual(r.json(), {'status': 'sent', 'channel': 'sms'})
        self.twilio_send.assert_called_once_with(PHONE)
        r = self._check()
        self.assertEqual((r.status_code, r.json()['purpose'], r.json()['member']['ready']), (200, 'sign_in', True))
        self.assertEqual(Account.objects.count(), 1)
        bo = account.people.get()
        self.assertIsNotNone(bo.phone_verified_at)
        self.assertEqual(Event.objects.get(action='phone_code_sent').detail,
                         {'to': '***-***-5309', 'purpose': 'sign_in', 'sent': True})
        self.assertTrue(Event.objects.filter(action='phone_code_used', person=bo).exists())

    def test_the_answer_is_the_same_for_unknown_contacts(self):
        members.create_account(first_name='Bo', last_name='Lee', phone=PHONE)
        member = self._send()
        stranger = self._send(contact='402-867-1111')
        self.assertEqual((member.status_code, member.json()), (stranger.status_code, stranger.json()))
        self.assertEqual(self.twilio_send.call_count, 1)  # only the member's number is texted
        # A code for a number nobody asked for is simply wrong; Twilio isn't asked.
        r = self._check(contact='402-867-1111')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'CODE_BAD'))
        self.twilio_check.assert_not_called()
        # A revoked membership's number: nothing sent, nothing joined, the same answer.
        revoked = members.create_account(first_name='Cy', last_name='Off', phone='4028672222')
        members.revoke(revoked, reason='tag switching')
        r = self._send(contact='4028672222', first_name='Cy', last_name='New')
        self.assertEqual(r.json(), {'status': 'sent', 'channel': 'sms'})
        self.assertEqual(self.twilio_send.call_count, 1)
        self.assertEqual(Account.objects.filter(status=Account.STATUS_PENDING).count(), 0)
        self.assertTrue(Event.objects.filter(action='join_refused', account=revoked).exists())
        self.assertEqual(self._check(contact='4028672222').json()['code'], 'CODE_BAD')
        # The same for emails: a member's gets a sign-in email, a stranger's nothing, the same answer.
        members.create_account(first_name='Di', last_name='Em', email='di@example.com')
        a = self._send(contact='di@example.com')
        b = self._send(contact='who@example.com')
        self.assertEqual((a.json(), b.json()), ({'status': 'sent', 'channel': 'email'},) * 2)
        self.assertEqual(self.send.call_count, 1)

    def test_bad_contacts_and_names_say_what_is_wrong(self):
        for contact in ('867-5309', '+44 20 7946 0958', '402-555-0123', 'not an email@', 'abc', ''):
            r = self._send(contact=contact)
            self.assertEqual((r.status_code, r.json()), (400, {'code': 'CONTACT_BAD',
                                                               'detail': 'Enter a US phone number or an email.'}), contact)
        r = self._send(first_name='Pat')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NAME_NEEDED'))
        r = self._send(contact='pat@example.com', last_name='Lee')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NAME_NEEDED'))
        self.assertEqual(self._check(contact='12').json()['code'], 'CONTACT_BAD')
        self.twilio_available.return_value = False
        r = self._send(first_name='Pat', last_name='Lee')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'PHONE_OFF'))
        self.assertEqual(self._check().json()['code'], 'PHONE_OFF')
        self.twilio_send.assert_not_called()
        self.send.assert_not_called()

    def test_the_resend_gap_the_hourly_limit_and_the_lockout(self):
        self._send(first_name='Pat', last_name='Lee')
        r = self._send(first_name='Pat', last_name='Lee')
        self.assertEqual((r.status_code, r.json()['code']), (429, 'TOO_SOON'))
        self.assertTrue(1 <= r.json()['retry_after'] <= 30)
        for _ in range(member_auth.PHONE_SENDS_PER_HOUR - 1):
            self.skip_phone_gap()
            self.assertEqual(self._send(first_name='Pat', last_name='Lee').status_code, 200)
        self.skip_phone_gap()
        self.assertEqual(self._send(first_name='Pat', last_name='Lee').json()['code'], 'TOO_MANY')
        # Five wrong codes lock the number for 15 minutes: no checks, no sends, even with the right code.
        self.twilio_check.return_value = False
        for _ in range(member_auth.PHONE_WRONG_CODES):
            r = self._check(code='000000')
            self.assertEqual((r.status_code, r.json()['code']), (400, 'CODE_BAD'))
        self.twilio_check.return_value = True
        r = self._check()
        self.assertEqual((r.status_code, r.json()['code']), (429, 'LOCKED'))
        self.assertGreater(r.json()['retry_after'], 14 * 60)
        self.assertEqual(self._send(first_name='Pat', last_name='Lee').json()['code'], 'LOCKED')
        self.assertFalse(Person.objects.exists())
        self.assertEqual(self.twilio_check.call_count, member_auth.PHONE_WRONG_CODES)

    def test_the_per_address_send_limit(self):
        for n in range(member_auth.PHONE_SENDS_PER_IP_HOUR):
            self.assertEqual(self._send(contact=f'402867{1000 + n}').status_code, 200)
        self.assertEqual(self._send(contact='4028679999').json()['code'], 'TOO_MANY')
        self.assertEqual(self._send(contact='4028679999', ip='198.51.100.1').status_code, 200)

    # ── The email path through the one box ──

    def test_an_email_join_through_code_send_and_code_check(self):
        r = self._send(contact='Ana@Example.com', first_name='Ana', last_name='Diaz')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent', 'channel': 'email'}))
        self.assertEqual(self.mail()['subject'], 'Confirm your email for Thrift+')
        self.twilio_send.assert_not_called()
        r = self._check(contact='ana@example.com', code=self.code())
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['purpose'], r.json()['member']['email_verified'], r.json()['member']['session_kind']),
                         ('join', True, 'email'))
        self.assertEqual(self._check(contact='ana@example.com', code='000000', api=APIClient()).json()['code'],
                         'CODE_BAD')
        self.skip_gap('ana@example.com')
        self.assertEqual(self._send(contact='ana@example.com').json()['channel'], 'email')
        self.assertEqual(self.mail()['subject'], 'Your Thrift+ sign-in link')

    # ── The selfie and the signature in the app ──

    def test_the_selfie_and_signature_finish_the_app_steps(self):
        self.phone_join()
        r = self.app.post(BASE + 'me/selfie/', {'photo': _jpeg()}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['member']['selfie'], r.json()['member']['finish_steps']), (True, ['sign']))
        person = Person.objects.get()
        self.assertTrue(person.photo.name.startswith('thriftplus/photos/'))
        r = self.app.post(BASE + 'me/signature/', {'signature': _png_data_url(), 'terms_version': register.TERMS_VERSION},
                          format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['member']['signed'], r.json()['member']['finish_steps']), (True, []))
        person.refresh_from_db()
        self.assertTrue(person.signature.name.startswith('thriftplus/signatures/'))
        self.assertEqual(person.signed_terms_version, register.TERMS_VERSION)
        self.assertIsNotNone(person.signed_at)
        self.assertTrue(Event.objects.filter(action='app_signature', person=person).exists())
        self.assertEqual(self.app.get(BASE + 'session/').json()['member']['finish_steps'], [])

    def test_the_selfie_and_signature_refuse_bad_files(self):
        self.phone_join()
        bad = SimpleUploadedFile('x.jpg', b'not an image', content_type='image/jpeg')
        self.assertEqual(self.app.post(BASE + 'me/selfie/', {'photo': bad}, format='multipart').json()['code'], 'PHOTO_BAD')
        big = SimpleUploadedFile('big.jpg', b'\xff' * (8 * 1024 * 1024 + 1), content_type='image/jpeg')
        self.assertEqual(self.app.post(BASE + 'me/selfie/', {'photo': big}, format='multipart').json()['code'],
                         'PHOTO_TOO_BIG')
        self.assertEqual(self.app.post(BASE + 'me/selfie/', {}, format='multipart').json()['code'], 'PHOTO_NEEDED')
        for sig in ('', 'data:image/jpeg;base64,AAAA', 'data:image/png;base64,!!!',
                    'data:image/png;base64,' + base64.b64encode(b'GIF89a').decode()):
            r = self.app.post(BASE + 'me/signature/', {'signature': sig}, format='json')
            self.assertEqual((r.status_code, r.json()['code']), (400, 'SIGNATURE_BAD'), sig)
        person = Person.objects.get()
        self.assertEqual((bool(person.photo), bool(person.signature)), (False, False))

    def test_the_selfie_and_signature_are_for_pending_members_only(self):
        anon = APIClient().post(BASE + 'me/selfie/', {'photo': _jpeg()}, format='multipart')
        self.assertIn(anon.status_code, (401, 403))
        account = members.create_account(first_name='Bo', last_name='Lee', phone=PHONE)
        self._send()
        self.assertEqual(self._check().status_code, 200)
        r = self.app.post(BASE + 'me/selfie/', {'photo': _jpeg()}, format='multipart')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_PENDING'))
        r = self.app.post(BASE + 'me/signature/', {'signature': _png_data_url()}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NOT_PENDING'))
        self.assertFalse(account.people.get().photo)
        self.assertEqual(self.app.get(BASE + 'session/').json()['member']['finish_steps'], [])  # active: nothing left

    # ── Confirmed by phone ──

    def test_a_phone_confirmed_join_is_needs_finalize_and_never_purged(self):
        person = self.phone_join()
        Account.objects.filter(pk=person.account_id).update(created_at=timezone.now() - timedelta(hours=30))
        self.assertTrue(members.confirmed(person))
        self.assertEqual(member_list.stage(person.account, person), 'needs_finalize')
        self.assertIn(f'a{person.account_id}', [row['key'] for row in member_list.rows()])
        # Confirmed by phone with no phone on file (it can't be here, but the rule is the verified phone): kept too.
        Person.objects.filter(pk=person.pk).update(phone='')
        stale = Account.objects.create(status=Account.STATUS_PENDING)
        Person.objects.create(account=stale, first_name='Old', last_name='Join', email='old@example.com')
        Account.objects.filter(pk=stale.pk).update(created_at=timezone.now() - timedelta(hours=30))
        self.assertEqual(member_list.purge_unconfirmed(), 1)
        self.assertTrue(Account.objects.filter(pk=person.account_id).exists())
        self.assertFalse(Account.objects.filter(pk=stale.pk).exists())


@override_settings(ONLINE_SALES_PUBLIC_BASE_URL='https://ecothrift.us')
class FinalizeV2Tests(TwilioMixin, MailMixin, RegisterBase):
    """Finalize Thrift+ when the app already has the selfie and the signature: the ID, the face, 18+, Verified."""

    def setUp(self):
        super().setUp()
        self.start_mail()
        self.start_twilio()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.app = APIClient()
        self.pat = self.phone_join()
        self.app.post(BASE + 'me/selfie/', {'photo': _jpeg()}, format='multipart')
        self.app.post(BASE + 'me/signature/', {'signature': _png_data_url(), 'terms_version': register.TERMS_VERSION},
                      format='json')
        self.pat.refresh_from_db()

    def _finish(self, person=None, **data):
        body = {'person': (person or self.pat).pk, 'id_checked': 'true', 'verified_18': 'true', 'finalize': 'true', **data}
        return self.api.post('/api/thriftplus/register/finish/', body, format='multipart')

    def test_pending_rows_show_the_selfie_the_signature_and_the_masked_contact(self):
        rows = self.api.post('/api/thriftplus/register/pending/', {'q': 'pat'}, format='json').json()['people']
        row = rows[0]
        self.assertEqual((row['person_id'], row['selfie'], row['signed'], row['contact']),
                         (self.pat.pk, True, True, '***-***-5309'))
        self.assertTrue(row['photo_url'])
        recent = self.api.post('/api/thriftplus/register/pending/', {'q': '', 'recent': True}, format='json').json()['people']
        pat = [p for p in recent if p['person_id'] == self.pat.pk][0]
        self.assertEqual((pat['selfie'], pat['signed'], pat['contact'], pat['confirmed'], pat['phone_verified']),
                         (True, True, '***-***-5309', True, True))
        self.assertEqual((pat['finished_at'], pat['finished_by']), (None, ''))  # phone verified, not finished
        member_auth.join('Em', 'Ail', 'em@example.com', base_url='https://ecothrift.us', ip=IP)
        em = self.api.post('/api/thriftplus/register/pending/', {'q': 'ail'}, format='json').json()['people'][0]
        self.assertEqual((em['contact'], em['selfie'], em['signed'], em['photo_url']), ('e***@example.com', False, False, None))

    def test_with_the_app_selfie_and_signature_only_the_id_and_face_are_needed(self):
        r = self._finish()
        self.assertEqual((r.status_code, r.json()['code']), (400, 'FACE_NEEDED'))
        r = self._finish(face_matches='true', id_checked='false')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'ID_NEEDED'))
        self.assertEqual(Account.objects.get(pk=self.pat.account_id).status, Account.STATUS_PENDING)
        r = self._finish(face_matches='true')  # no phone, no signature, no photo
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.json()['status'], r.json()['signed']), ('active', True))
        pat = Person.objects.get(pk=self.pat.pk)
        self.assertEqual((pat.id_checked, pat.verified_18, pat.phone, pat.photo.name, pat.signature.name),
                         (True, True, PHONE, self.pat.photo.name, self.pat.signature.name))
        event = Event.objects.get(action='finished_joining')
        self.assertEqual((event.actor, event.detail['from_app'], event.detail['face_matches']), (self.clerk, True, True))
        row = register.finalize_row(pat)
        self.assertEqual((row['status'], row['finished_by'], bool(row['finished_at'])),
                         ('active', self.clerk.full_name or self.clerk.email, True))
        self.assertEqual(self._attach(self._cart()['id'], Card.objects.get(person=pat).code).status_code, 200)

    def test_retake_replaces_the_selfie_and_18_needs_the_id_check(self):
        retake = _jpeg((50, 50))
        r = self._finish(face_matches='true', verified_18='false', photo=retake)
        self.assertEqual(r.status_code, 200, r.content)
        pat = Person.objects.get(pk=self.pat.pk)
        self.assertNotEqual(pat.photo.name, self.pat.photo.name)
        self.assertEqual((pat.id_checked, pat.verified_18), (True, False))

    def test_without_the_app_steps_finalize_keeps_the_old_rules_and_the_phone_is_optional(self):
        member_auth.join('Em', 'Ail', 'em@example.com', base_url='https://ecothrift.us', ip=IP)
        em = Person.objects.get(email='em@example.com')
        r = self._finish(person=em, face_matches='true')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'SIGNATURE_NEEDED'))
        sig = SimpleUploadedFile('signature.png', b'\x89PNG\r\n\x1a\n' + b'\x00' * 32, content_type='image/png')
        r = self._finish(person=em, signature=sig)  # no phone: fine now
        self.assertEqual((r.status_code, r.json()['status']), (200, 'active'))
        em.refresh_from_db()
        self.assertEqual((em.phone, em.phone_verified_at), ('', None))
        self.assertIsNotNone(em.email_verified_at)  # finalized in person

    def test_the_register_terminal_finishes_without_a_phone_and_a_typed_phone_is_still_checked(self):
        member_auth.join('Em', 'Ail', 'em@example.com', base_url='https://ecothrift.us', ip=IP)
        em = Person.objects.get(email='em@example.com')
        r = self.api.post('/api/thriftplus/register/finish/', {'person': em.pk, 'phone': '402-555-0101'},
                          format='multipart')  # Ana's
        self.assertEqual((r.status_code, r.json()['code']), (409, 'PHONE_TAKEN'))
        r = self.api.post('/api/thriftplus/register/finish/', {'person': em.pk, 'phone': '555-01'}, format='multipart')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'PHONE_BAD'))
        r = self.api.post('/api/thriftplus/register/finish/', {'person': em.pk, 'id_checked': 'true'}, format='multipart')
        self.assertEqual((r.status_code, r.json()['status']), (200, 'active'))

    def test_finalize_at_the_register_with_a_cart_puts_them_on_the_sale(self):
        # The register's Finish joining dialog, selfie path: finalize=true and the open sale.
        cart = self._cart()
        r = self._finish(face_matches='true', cart=cart['id'])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['status'], 'active')
        self.assertEqual(r.json()['cart']['thrift_plus']['member']['person_id'], self.pat.pk)
        self.assertNotIn('attach_error', r.json())

    def test_the_register_path_takes_no_phone_field_at_all(self):
        member_auth.join('Em', 'Ail', 'em@example.com', base_url='https://ecothrift.us', ip=IP)
        em = Person.objects.get(email='em@example.com')
        for phone in ({}, {'phone': ''}, {'phone': '   '}):
            Account.objects.filter(pk=em.account_id).update(status=Account.STATUS_PENDING)
            r = self.api.post('/api/thriftplus/register/finish/', {'person': em.pk, 'id_checked': 'true', **phone},
                              format='multipart')
            self.assertEqual((r.status_code, r.json()['status']), (200, 'active'), phone)

    def test_find_by_phone_shows_the_selfie_and_signature(self):
        found = self.api.post('/api/thriftplus/register/find/', {'phone': PHONE}, format='json').json()['people']
        self.assertEqual([(p['person_id'], p['selfie'], p['signed']) for p in found], [(self.pat.pk, True, True)])
        self.assertEqual(register.pending_person(self.pat)['selfie'], True)
        self.assertEqual(register.finalize_row(self.pat)['signed'], True)

    def test_finalize_is_still_staff_only(self):
        from apps.thriftplus.tests.test_register import _user

        api = APIClient()
        api.force_authenticate(_user('consignee2@example.com', 'Consignee'))
        r = api.post('/api/thriftplus/register/finish/', {'person': self.pat.pk, 'id_checked': 'true',
                                                         'face_matches': 'true', 'finalize': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 403)
        self.assertEqual(Account.objects.get(pk=self.pat.account_id).status, Account.STATUS_PENDING)


class GooglePopupHeaderTests(TestCase):
    """2026-10-19: with COOP "same-origin" the Google popup could not hand the sign-in back, so it stalled."""

    def test_pages_allow_the_google_sign_in_popup(self):
        r = self.client.get('/api/thriftplus/public/sign-in-options/')
        self.assertEqual(r.headers.get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups')

