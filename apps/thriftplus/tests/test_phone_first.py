"""Phase 3 and 4 (owner 2026-10-20): the phone is required (``needs_phone``, a code checked before it is saved), sign-in
codes from our own number behind ``thrift_plus.own_number_codes`` (hashed, 10 minutes, the same limits and lockouts), and
the Staff app's "Text sign-in link" (one use, 15 minutes). Twilio is mocked everywhere: nothing real is ever texted."""
from __future__ import annotations

import re
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.texting import service as texting
from apps.texting.models import TextConsent, TextMessage
from apps.thriftplus.models import Account, Event, MemberEmailToken, MemberSession, PhoneCode, Person
from apps.thriftplus.services import member_auth, members, phone_codes
from apps.thriftplus.tests.test_join_v2 import BASE, IP, PHONE, TwilioMixin

OTHER = '4025551234'  # a real-looking number that is not used by anything else
PUBLIC = '/api/thriftplus/public/'
SWITCH = texting.OWN_NUMBER_SETTING


def set_switch(on: bool) -> None:
    AppSetting.objects.update_or_create(key=SWITCH, defaults={'value': on})


def member_client(person: Person, kind: str = MemberSession.KIND_EMAIL) -> APIClient:
    token, _ = member_auth.start_session(person, kind)
    client = APIClient()
    client.cookies[member_auth.COOKIE] = token
    return client


def google_joiner(email='ana@gmail.com') -> Person:
    """A member who joined with Google: an email, no phone."""
    return member_auth.google_join(email, {'given_name': 'Ana', 'family_name': 'Diaz'})


class OwnNumberMixin:
    """The own-number path for real (hashing, expiry), with only the sender mocked: ``self.texts`` collects the bodies."""

    def start_own_number(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        set_switch(True)
        self.texts: list[tuple[str, str]] = []

        def deliver(number, body):
            self.texts.append((number, body))
            return True, f'SM{len(self.texts)}', ''

        for target, kwargs in (('apps.texting.service.sender_ready', {'return_value': True}),
                               ('apps.texting.service._deliver', {'side_effect': deliver})):
            p = patch(target, **kwargs)
            p.start()
            self.addCleanup(p.stop)

    def last_code(self) -> str:
        return re.search(r'code is (\d{6})', self.texts[-1][1]).group(1)


class NeedsPhoneTests(TwilioMixin, TestCase):
    """Phase 3: a member with no phone adds one with a code that is checked before it is saved (Verify mocked)."""

    def setUp(self):
        self.start_twilio()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.person = google_joiner()
        self.app = member_client(self.person)

    def _send(self, phone=PHONE, **kw):
        return self.app.post(BASE + 'me/phone/send/', {'phone': phone}, format='json', REMOTE_ADDR=kw.get('ip', IP))

    def _save(self, phone=PHONE, code='123456'):
        return self.app.post(BASE + 'me/phone/', {'phone': phone, 'code': code}, format='json', REMOTE_ADDR=IP)

    def test_the_member_payload_says_needs_phone_until_there_is_one(self):
        me = self.app.get(BASE + 'session/').data['member']
        self.assertTrue(me['needs_phone'])
        self.assertEqual(me['phone'], '')
        self.assertEqual(self._send().status_code, 200)
        self.assertEqual(self._save().status_code, 200)
        me = self.app.get(BASE + 'session/').data['member']
        self.assertFalse(me['needs_phone'])
        self.assertEqual(me['phone'], PHONE)

    def test_a_phone_joiner_never_needs_one(self):
        joined = Person.objects.create(account=Account.objects.create(status=Account.STATUS_PENDING), first_name='Pat',
                                       last_name='Lee', phone=PHONE, phone_verified_at=timezone.now())
        self.assertFalse(member_auth.needs_phone(joined))

    def test_staff_and_practice_memberships_are_not_asked(self):
        staff_user = User.objects.create_user(email='s@example.com', first_name='Sam', last_name='Staff', password='x-pass-123')
        practice = Person.objects.create(account=Account.objects.create(status=Account.STATUS_ACTIVE, is_practice=True),
                                         first_name='Practice', last_name='One')
        staff = Person.objects.create(account=Account.objects.create(status=Account.STATUS_ACTIVE, staff_user=staff_user),
                                      first_name='Sam', last_name='Staff')
        self.assertFalse(member_auth.needs_phone(practice))
        self.assertFalse(member_auth.needs_phone(staff))
        self.assertTrue(member_auth.needs_phone(self.person))

    def test_saving_needs_the_code_to_be_right_for_that_number(self):
        self.assertEqual(self._send().status_code, 200)
        self.twilio_check.return_value = False
        bad = self._save(code='000000')
        self.assertEqual((bad.status_code, bad.data['code']), (400, 'CODE_BAD'))
        self.person.refresh_from_db()
        self.assertEqual(self.person.phone, '')
        self.twilio_check.return_value = True
        ok = self._save()
        self.assertEqual(ok.status_code, 200)
        self.person.refresh_from_db()
        self.assertEqual(self.person.phone, PHONE)
        self.assertIsNotNone(self.person.phone_verified_at)
        self.assertTrue(Event.objects.filter(action='phone_added', person=self.person).exists())
        self.twilio_check.assert_called_with(PHONE, '123456')  # checked for the number it saved

    def test_a_missing_or_short_code_never_reaches_twilio_and_a_bad_number_is_refused(self):
        self.assertEqual(self._save(code='12').data['code'], 'CODE_BAD')
        self.twilio_check.assert_not_called()
        self.assertEqual(self._send('555-123').data['code'], 'CONTACT_BAD')
        self.twilio_send.assert_not_called()

    def test_texts_off_here_is_said_plainly(self):
        self.twilio_available.return_value = False
        r = self._send()
        self.assertEqual((r.status_code, r.data['code']), (400, 'PHONE_OFF'))

    def test_a_number_on_another_membership_is_refused_before_a_text(self):
        members.create_account(first_name='Bo', last_name='Kay', phone=PHONE, id_checked=True, verified_18=True)
        r = self._send()
        self.assertEqual((r.status_code, r.data['code']), (400, 'PHONE_TAKEN'))
        self.twilio_send.assert_not_called()
        self.assertEqual(self._save().data['code'], 'PHONE_TAKEN')  # and not saved even with a good code
        self.person.refresh_from_db()
        self.assertEqual(self.person.phone, '')

    def test_a_second_adult_may_share_the_number_on_their_own_membership(self):
        other = members.create_account(first_name='Bo', last_name='Kay', phone=PHONE, id_checked=True, verified_18=True)
        spouse = Person.objects.create(account=other, role=Person.ROLE_SECONDARY, first_name='Cy', last_name='Kay',
                                       email='cy@gmail.com')
        client = member_client(spouse)
        r = client.post(BASE + 'me/phone/send/', {'phone': PHONE}, format='json', REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)

    def test_a_member_who_has_a_phone_changes_it_at_the_register(self):
        self.person.phone = OTHER
        self.person.save()
        self.assertEqual(self._send().data['code'], 'PHONE_SET')
        self.assertEqual(self._save().data['code'], 'PHONE_SET')

    def test_the_old_card_session_cannot_add_a_phone(self):
        client = member_client(self.person, MemberSession.KIND_CARD)
        r = client.post(BASE + 'me/phone/send/', {'phone': PHONE}, format='json', REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 403)

    def test_signed_out_is_refused(self):
        r = APIClient().post(BASE + 'me/phone/send/', {'phone': PHONE}, format='json')
        self.assertIn(r.status_code, (401, 403))

    def test_the_same_limits_as_a_sign_in_code(self):
        self.assertEqual(self._send().status_code, 200)
        soon = self._send()
        self.assertEqual((soon.status_code, soon.data['code']), (429, 'TOO_SOON'))
        self.skip_phone_gap()
        self.twilio_check.return_value = False
        for _ in range(5):
            self.assertEqual(self._save(code='000000').data['code'], 'CODE_BAD')
        locked = self._save(code='000000')
        self.assertEqual((locked.status_code, locked.data['code']), (429, 'LOCKED'))
        self.skip_phone_gap()
        self.assertEqual(self._send().status_code, 429)  # the lock holds the number


class SwitchSeedTests(TestCase):
    def test_the_own_number_switch_starts_off(self):
        self.assertIs(AppSetting.objects.get(key=SWITCH).value, False)
        self.assertFalse(texting.own_number_on())


class OwnNumberCodeTests(OwnNumberMixin, TwilioMixin, TestCase):
    """Phase 4: with the switch on we make, text and check the code ourselves; off, Verify as before."""

    def setUp(self):
        self.start_own_number()
        self.member = members.create_account(first_name='Ana', last_name='Bell', phone=PHONE, id_checked=True,
                                             verified_18=True).people.get()
        self.app = APIClient()

    def test_the_switch_picks_the_way_and_is_off_by_default(self):
        set_switch(False)
        self.assertFalse(texting.own_number_on())
        with patch('apps.thriftplus.services.phone_codes._post') as post:
            post.return_value.status_code = 201
            phone_codes.send(PHONE)
            self.assertEqual(post.call_args.args[0], 'Verifications')  # Verify, as before
        self.assertEqual(self.texts, [])
        set_switch(True)
        phone_codes.send(PHONE)
        self.assertEqual(len(self.texts), 1)
        self.assertEqual(self.texts[0][0], PHONE)

    def test_available_follows_the_sender_not_the_verify_keys(self):
        with patch('apps.texting.service.sender_ready', return_value=False):
            self.assertFalse(phone_codes.available())  # the switch is on but the sender is not ready
        with patch('apps.texting.service.sender_ready', return_value=True):
            self.assertTrue(phone_codes.available())

    def test_the_text_says_who_it_is_the_code_how_long_and_how_to_stop(self):
        phone_codes.send(PHONE)
        body = self.texts[0][1]
        self.assertRegex(body, r'^Eco-Thrift: Your Thrift\+ sign-in code is \d{6}\. It works for 10 minutes\. '
                               r'Reply STOP to opt out\.$')

    def test_only_hashes_are_kept_and_the_record_hides_the_code(self):
        phone_codes.send(PHONE)
        code = self.last_code()
        row = PhoneCode.objects.get()
        self.assertEqual(len(row.code_hash), 64)
        self.assertNotIn(code, row.code_hash + row.phone_hash)
        self.assertNotIn(PHONE, row.phone_hash)
        message = TextMessage.objects.get()
        self.assertEqual((message.status, message.key, message.phone), ('sent', 'sign_in_code', PHONE))
        self.assertNotIn(code, message.body)
        self.assertIn('######', message.body)

    def test_the_right_code_works_once(self):
        phone_codes.send(PHONE)
        code = self.last_code()
        self.assertTrue(phone_codes.check(PHONE, code))
        self.assertFalse(phone_codes.check(PHONE, code))

    def test_a_code_works_for_ten_minutes_only(self):
        phone_codes.send(PHONE)
        code = self.last_code()
        row = PhoneCode.objects.get()
        self.assertAlmostEqual((row.expires_at - row.created_at).total_seconds(), 600, delta=2)
        PhoneCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertFalse(phone_codes.check(PHONE, code))

    def test_a_code_is_for_its_own_number(self):
        phone_codes.send(PHONE)
        code = self.last_code()
        self.assertFalse(phone_codes.check(OTHER, code))
        self.assertTrue(phone_codes.check(PHONE, code))

    def test_five_wrong_tries_kill_the_code_even_for_the_right_one(self):
        phone_codes.send(PHONE)
        code = self.last_code()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(5):
            self.assertFalse(phone_codes.check(PHONE, wrong))
        self.assertFalse(phone_codes.check(PHONE, code))

    def test_a_new_code_replaces_the_old_one(self):
        phone_codes.send(PHONE)
        old = self.last_code()
        phone_codes.send(PHONE)
        new = self.last_code()
        if old != new:
            self.assertFalse(phone_codes.check(PHONE, old))
        self.assertTrue(phone_codes.check(PHONE, new))

    def test_a_text_that_did_not_go_leaves_no_working_code(self):
        with patch('apps.texting.service._deliver', return_value=(False, '', 'Twilio refused the text (400).')):
            with self.assertRaises(phone_codes.PhoneCodeError):
                phone_codes.send(PHONE)
        self.assertFalse(PhoneCode.objects.filter(used_at__isnull=True).exists())
        self.assertEqual(TextMessage.objects.get().status, 'failed')

    def test_a_dev_or_test_machine_never_texts(self):
        with patch('apps.texting.service.sender_ready', return_value=False):
            with self.assertRaises(phone_codes.PhoneCodeError):
                phone_codes.send(PHONE)
        self.assertEqual(self.texts, [])

    def test_signing_in_with_a_texted_code_end_to_end(self):
        r = self.app.post(BASE + 'code/send/', {'contact': PHONE}, format='json', REMOTE_ADDR=IP)
        self.assertEqual((r.status_code, r.data['channel']), (200, 'sms'))
        self.assertEqual(len(self.texts), 1)
        signed = self.app.post(BASE + 'code/check/', {'contact': PHONE, 'code': self.last_code()}, format='json',
                               REMOTE_ADDR=IP)
        self.assertEqual(signed.status_code, 200, signed.content)
        self.assertEqual(signed.data['status'], 'member')
        self.assertEqual(MemberSession.objects.get().kind, MemberSession.KIND_PHONE)

    def test_the_same_send_limits_and_lockout_as_verify(self):
        self.assertEqual(self.app.post(BASE + 'code/send/', {'contact': PHONE}, format='json', REMOTE_ADDR=IP).status_code, 200)
        soon = self.app.post(BASE + 'code/send/', {'contact': PHONE}, format='json', REMOTE_ADDR=IP)
        self.assertEqual((soon.status_code, soon.data['code']), (429, 'TOO_SOON'))
        self.skip_phone_gap()
        code = self.last_code()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(5):
            r = self.app.post(BASE + 'code/check/', {'contact': PHONE, 'code': wrong}, format='json', REMOTE_ADDR=IP)
            self.assertEqual(r.data['code'], 'CODE_BAD')
        locked = self.app.post(BASE + 'code/check/', {'contact': PHONE, 'code': code}, format='json', REMOTE_ADDR=IP)
        self.assertEqual((locked.status_code, locked.data['code']), (429, 'LOCKED'))
        self.assertEqual(len(self.texts), 1)

    def test_a_number_that_said_stop_is_not_texted_and_is_told_so(self):
        texting.record_stop(PHONE)
        r = self.app.post(BASE + 'code/send/', {'contact': PHONE}, format='json', REMOTE_ADDR=IP)
        self.assertEqual((r.status_code, r.data['code']), (400, 'TEXTS_OFF'))
        self.assertEqual(self.texts, [])
        # An unknown number that said STOP is silent, like any unknown number: nothing says whether it is a member's.
        texting.record_stop(OTHER)
        quiet = self.app.post(BASE + 'code/send/', {'contact': OTHER}, format='json', REMOTE_ADDR=IP)
        self.assertEqual(quiet.status_code, 200)
        self.assertEqual(self.texts, [])

    def test_the_stop_list_is_honored_at_the_sender_too(self):
        texting.record_stop(PHONE)
        with self.assertRaises(phone_codes.PhoneCodeError):
            phone_codes.send(PHONE)
        self.assertEqual(self.texts, [])
        self.assertEqual(TextMessage.objects.get().status, 'opted_out')

    def test_adding_a_phone_uses_our_number_when_the_switch_is_on(self):
        person = google_joiner()
        client = member_client(person)
        r = client.post(BASE + 'me/phone/send/', {'phone': OTHER}, format='json', REMOTE_ADDR=IP)
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(self.texts[0][0], OTHER)
        saved = client.post(BASE + 'me/phone/', {'phone': OTHER, 'code': self.last_code()}, format='json', REMOTE_ADDR=IP)
        self.assertEqual(saved.status_code, 200, saved.content)
        person.refresh_from_db()
        self.assertEqual(person.phone, OTHER)


class TextSignInLinkTests(OwnNumberMixin, TestCase):
    """Phase 4: the Staff app's "Text sign-in link"."""

    def setUp(self):
        self.start_own_number()
        clerk = User.objects.create_user(email='clerk@example.com', first_name='Cal', last_name='Clerk', password='x-pass-123')
        clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.clerk = clerk
        self.staff = APIClient()
        self.staff.force_authenticate(clerk)
        self.member = members.create_account(first_name='Ana', last_name='Bell', phone=PHONE, id_checked=True,
                                             verified_18=True).people.get()

    def _text(self, person=None):
        return self.staff.post(f'/api/thriftplus/people/{(person or self.member).pk}/text-link/', {}, format='json')

    def _row(self, person=None):
        r = self.staff.post('/api/thriftplus/register/pending/', {'q': 'ana bell', 'recent': True},
                            format='json')
        return next(p for p in r.data['people'] if p['person_id'] == (person or self.member).pk)

    def test_the_button_is_offered_only_when_the_switch_is_on_with_a_phone_and_no_stop(self):
        self.assertTrue(self._row()['can_text_link'])
        set_switch(False)
        self.assertFalse(self._row()['can_text_link'])
        set_switch(True)
        texting.record_stop(PHONE)
        self.assertFalse(self._row()['can_text_link'])
        texting.record_consent(PHONE, kind=TextConsent.KIND_THRIFTPLUS, opted_in=True, how='Staff: they asked')
        self.assertTrue(self._row()['can_text_link'])  # opted back in
        self.member.phone = ''
        self.member.save()
        self.assertFalse(self._row()['can_text_link'])

    def test_texting_the_link_sends_one_text_with_a_one_use_link(self):
        r = self._text()
        self.assertEqual(r.status_code, 200, r.content)
        number, body = self.texts[0]
        self.assertEqual(number, PHONE)
        self.assertRegex(body, r'^Eco-Thrift: Tap to sign in to Thrift\+: https?://\S+/scan\?signin=\S+ It works once, '
                               r'for 15 minutes\. Reply STOP to opt out\.$')
        token = re.search(r'signin=(\S+)', body).group(1)
        phone = APIClient()
        signed = phone.post(PUBLIC + 'session/link/', {'token': token}, format='json')
        self.assertEqual(signed.status_code, 200, signed.content)
        self.assertEqual(signed.data['member']['first_name'], 'Ana')
        again = APIClient().post(PUBLIC + 'session/link/', {'token': token}, format='json')
        self.assertEqual((again.status_code, again.data['code']), (400, 'LINK_USED'))
        self.assertTrue(Event.objects.filter(action='sign_in_text_made', person=self.member).exists())
        self.assertTrue(Event.objects.filter(action='sign_in_text_used', person=self.member).exists())

    def test_the_link_lasts_fifteen_minutes(self):
        self._text()
        token = re.search(r'signin=(\S+)', self.texts[0][1]).group(1)
        row = MemberEmailToken.objects.get()
        self.assertEqual(row.purpose, MemberEmailToken.PURPOSE_STAFF_TEXT)
        self.assertAlmostEqual((row.expires_at - row.created_at).total_seconds(), 900, delta=2)
        MemberEmailToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        late = APIClient().post(PUBLIC + 'session/link/', {'token': token}, format='json')
        self.assertEqual((late.status_code, late.data['code']), (400, 'LINK_EXPIRED'))

    def test_the_record_keeps_who_sent_it_and_not_the_link(self):
        self._text()
        message = TextMessage.objects.get()
        self.assertEqual((message.status, message.key, message.by_id), ('sent', 'sign_in_link', self.clerk.pk))
        token = re.search(r'signin=(\S+)', self.texts[0][1]).group(1)
        self.assertNotIn(token, message.body)

    def test_nothing_goes_when_the_switch_is_off(self):
        set_switch(False)
        r = self._text()
        self.assertEqual(r.status_code, 400)
        self.assertEqual(self.texts, [])
        self.assertFalse(MemberEmailToken.objects.exists())

    def test_nothing_goes_without_a_phone_or_after_stop(self):
        self.member.phone = ''
        self.member.save()
        self.assertEqual(self._text().status_code, 400)
        self.member.phone = PHONE
        self.member.save()
        texting.record_stop(PHONE)
        r = self._text()
        self.assertEqual(r.status_code, 400)
        self.assertIn('turned off', r.data['detail'])
        self.assertEqual(self.texts, [])
        self.assertFalse(MemberEmailToken.objects.exists())

    def test_a_failed_text_kills_its_link(self):
        with patch('apps.texting.service._deliver', return_value=(False, '', 'Twilio refused the text (400).')):
            r = self._text()
        self.assertEqual(r.status_code, 400)
        self.assertTrue(MemberEmailToken.objects.get().used_at is not None)

    def test_one_text_a_minute_per_person(self):
        self.assertEqual(self._text().status_code, 200)
        soon = self._text()
        self.assertEqual((soon.status_code, soon.data['code']), (429, 'TOO_SOON'))
        self.assertEqual(len(self.texts), 1)

    def test_only_staff_may_ask(self):
        r = APIClient().post(f'/api/thriftplus/people/{self.member.pk}/text-link/', {}, format='json')
        self.assertIn(r.status_code, (401, 403))
        self.assertEqual(self.texts, [])
