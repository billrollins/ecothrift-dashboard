"""Thrift+ email consent (standards T73, email-first): an optional email at sign-up and two separate, unticked boxes,
each choice recorded in the shared consent store with the words shown; members and staff can change them."""
from __future__ import annotations

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.texting import service as store
from apps.texting.models import EmailConsent
from apps.thriftplus.models import Account
from apps.thriftplus.services import cards, member_auth, members
from apps.thriftplus.services import emails as email_consent

PUBLIC = '/api/thriftplus/public/'


class SignUpEmailConsentTests(TestCase):
    def setUp(self):
        self.clerk = User.objects.create_user('clerk@example.com', 'Pat', 'Clerk', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)

    def _sign_up(self, **extra):
        body = {'first_name': 'Ana', 'phone': '(402) 555-0101', **extra}
        return self.api.post('/api/thriftplus/accounts/', body, format='multipart')

    def test_the_words_are_masters_word_for_word(self):
        data = self.api.get('/api/thriftplus/accounts/email-wording/').json()
        self.assertEqual([k['text'] for k in data['kinds']], [
            'Email me my Thrift+ updates (savings, gift card balance, receipts, returns).',
            'Email me Eco-Thrift store news.',
        ])
        self.assertTrue(all(k['version'] for k in data['kinds']))
        self.assertIn('needed to join', data['not_required'])

    def test_the_email_is_kept_and_only_the_ticked_box_is_recorded(self):
        made = self._sign_up(email='  Ana@Example.COM ', emails_thriftplus='true', emails_news='false')
        self.assertEqual(made.status_code, 201, made.content)
        person = Account.objects.get(pk=made.json()['id']).people.get()
        self.assertEqual(person.email, 'ana@example.com')
        row = EmailConsent.objects.get()
        self.assertEqual((row.email, row.kind, row.opted_in), ('ana@example.com', 'thriftplus', True))
        self.assertEqual(row.wording, email_consent.WORDING['thriftplus']['text'])
        self.assertEqual(row.wording_version, email_consent.WORDING['thriftplus']['version'])
        self.assertEqual((row.ref, row.by_id), (f'thriftplus.person:{person.pk}', self.clerk.pk))
        self.assertIn('Thrift+ sign-up (staff: Pat Clerk)', row.how)
        self.assertEqual(made.json()['people'][0]['emails'], {'thriftplus': True, 'news': False})

    def test_an_email_is_optional_and_no_ticks_means_no_rows(self):
        self.assertEqual(self._sign_up().status_code, 201)
        self.assertEqual(self._sign_up(phone='4025550102', email='bo@example.com').status_code, 201)
        self.assertFalse(EmailConsent.objects.exists())

    def test_a_bad_email_or_a_tick_without_an_email_stops_the_sign_up(self):
        bad = self._sign_up(email='not-an-email')
        self.assertEqual(bad.status_code, 400)
        self.assertIn("doesn't look right", bad.json()['detail'])
        tick = self._sign_up(emails_news='true')
        self.assertEqual(tick.status_code, 400)
        self.assertIn('email', tick.json()['detail'])
        self.assertFalse(Account.objects.exists())

    def test_staff_add_an_email_later_and_change_a_choice_when_asked(self):
        person_id = self._sign_up().json()['people'][0]['id']
        refused = self.api.post(f'/api/thriftplus/people/{person_id}/emails/', {'kind': 'news', 'opted_in': True}, format='json')
        self.assertEqual(refused.status_code, 400)
        added = self.api.post(f'/api/thriftplus/people/{person_id}/email/', {'email': 'ana@example.com'}, format='json')
        self.assertEqual(added.json()['people'][0]['email'], 'ana@example.com')
        on = self.api.post(f'/api/thriftplus/people/{person_id}/emails/', {'kind': 'news', 'opted_in': True}, format='json')
        self.assertEqual(on.json()['people'][0]['emails'], {'thriftplus': False, 'news': True})
        self.assertEqual(EmailConsent.objects.get().how, 'Staff: Pat Clerk (they asked)')
        off = self.api.post(f'/api/thriftplus/people/{person_id}/emails/', {'kind': 'news', 'opted_in': False}, format='json')
        self.assertEqual(off.json()['people'][0]['emails'], {'thriftplus': False, 'news': False})
        self.assertEqual(EmailConsent.objects.count(), 2)  # every change kept
        self.assertFalse(store.may_email('ana@example.com', 'news'))


class PortalEmailConsentTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.code = cards.generate_batch(1).cards.values_list('code', flat=True)[0]
        self.account = members.create_account(first_name='Ana', phone='(402) 555-0101', email='ana@example.com',
                                              id_checked=True, card_code=self.code, emails={'thriftplus': True})
        self.person = self.account.people.get()

    def test_me_shows_your_choices_and_a_card_session_can_stop_but_not_start(self):
        card_phone = APIClient()
        card_phone.post(PUBLIC + 'session/card/', {'card_code': f'TP{self.code}', 'phone_last4': '0101'}, format='json')
        me = card_phone.get(PUBLIC + 'me/').json()
        self.assertEqual(me['emails']['choices'], {'thriftplus': True, 'news': False})
        self.assertTrue(me['emails']['has_email'])
        start = card_phone.post(PUBLIC + 'me/emails/', {'kind': 'news', 'opted_in': True}, format='json')
        self.assertEqual((start.status_code, start.json()['code']), (403, 'NEEDS_PASSWORD'))
        stop = card_phone.post(PUBLIC + 'me/emails/', {'kind': 'thriftplus', 'opted_in': False}, format='json')
        self.assertEqual(stop.json()['emails']['choices'], {'thriftplus': False, 'news': False})

    def test_a_password_session_can_start_store_news(self):
        member_auth.set_up_login(self.person, email='ana@example.com', username=None, password='green-lamp-4455')
        phone = APIClient()
        phone.post(PUBLIC + 'session/password/', {'login': 'ana@example.com', 'password': 'green-lamp-4455'}, format='json')
        started = phone.post(PUBLIC + 'me/emails/', {'kind': 'news', 'opted_in': True}, format='json')
        self.assertEqual(started.status_code, 200, started.content)
        self.assertEqual(started.json()['emails']['choices'], {'thriftplus': True, 'news': True})
