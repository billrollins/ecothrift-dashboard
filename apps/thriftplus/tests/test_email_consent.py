"""Thrift+ email (standards T73, T74): an optional email at sign-up and no boxes. Account email follows the address;
store news is on until the member turns it off, and only turning it off (or back on) is recorded."""
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
from apps.thriftplus.services import emails as member_email

PUBLIC = '/api/thriftplus/public/'


class SignUpEmailTests(TestCase):
    def setUp(self):
        self.clerk = User.objects.create_user('clerk@example.com', 'Pat', 'Clerk', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)

    def _sign_up(self, **extra):
        body = {'first_name': 'Ana', 'phone': '(402) 555-0101', **extra}
        return self.api.post('/api/thriftplus/accounts/', body, format='multipart')

    def test_the_line_under_the_email_field(self):
        note = self.api.get('/api/thriftplus/accounts/email-note/').json()['note']
        self.assertEqual(note, "We'll email your receipts and Thrift+ updates. Store news emails have an unsubscribe link.")

    def test_an_email_gets_updates_and_store_news_with_no_box_and_no_row(self):
        made = self._sign_up(email='  Ana@Example.COM ')
        self.assertEqual(made.status_code, 201, made.content)
        person = Account.objects.get(pk=made.json()['id']).people.get()
        self.assertEqual(person.email, 'ana@example.com')
        self.assertEqual(made.json()['people'][0]['emails'], {'updates': True, 'news': True})
        self.assertFalse(EmailConsent.objects.exists())  # nothing to record until they turn something off

    def test_no_email_means_no_email_and_a_bad_one_stops_the_sign_up(self):
        made = self._sign_up()
        self.assertEqual(made.json()['people'][0]['emails'], {'updates': False, 'news': False})
        bad = self._sign_up(phone='4025550102', email='not-an-email')
        self.assertEqual(bad.status_code, 400)
        self.assertIn("doesn't look right", bad.json()['detail'])

    def test_staff_add_an_email_and_turn_store_news_off_when_asked(self):
        person_id = self._sign_up().json()['people'][0]['id']
        refused = self.api.post(f'/api/thriftplus/people/{person_id}/news/', {'on': False}, format='json')
        self.assertEqual(refused.status_code, 400)
        added = self.api.post(f'/api/thriftplus/people/{person_id}/email/', {'email': 'ana@example.com'}, format='json')
        self.assertEqual(added.json()['people'][0]['emails'], {'updates': True, 'news': True})
        off = self.api.post(f'/api/thriftplus/people/{person_id}/news/', {'on': False}, format='json')
        self.assertEqual(off.json()['people'][0]['emails'], {'updates': True, 'news': False})
        row = EmailConsent.objects.get()
        self.assertEqual((row.email, row.kind, row.opted_in, row.how), ('ana@example.com', 'news', False, 'Staff: Pat Clerk (they asked)'))
        self.assertEqual(row.ref, f'thriftplus.person:{person_id}')
        self.assertFalse(store.may_email('ana@example.com', 'news'))

    def test_unsubscribing_everywhere_turns_news_off(self):
        made = self._sign_up(email='ana@example.com')
        store.record_email_consent('ana@example.com', kind='all', opted_in=False, how='Unsubscribe link')
        person = Account.objects.get(pk=made.json()['id']).people.get()
        self.assertFalse(member_email.news_on(person))


class PortalEmailTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.code = cards.generate_batch(1).cards.values_list('code', flat=True)[0]
        self.account = members.create_account(first_name='Ana', phone='(402) 555-0101', email='ana@example.com',
                                              id_checked=True, card_code=self.code)
        self.person = self.account.people.get()

    def test_a_card_session_can_turn_news_off_but_not_back_on(self):
        card_phone = APIClient()
        card_phone.post(PUBLIC + 'session/card/', {'card_code': f'TP{self.code}', 'phone_last4': '0101'}, format='json')
        me = card_phone.get(PUBLIC + 'me/').json()['emails']
        self.assertEqual((me['updates'], me['news'], me['has_email']), (True, True, True))
        off = card_phone.post(PUBLIC + 'me/emails/', {'news': False}, format='json')
        self.assertFalse(off.json()['emails']['news'])
        self.assertEqual(EmailConsent.objects.get().how, 'Thrift+ My account (the member)')
        on = card_phone.post(PUBLIC + 'me/emails/', {'news': True}, format='json')
        self.assertEqual((on.status_code, on.json()['code']), (403, 'NEEDS_PASSWORD'))

    def test_a_password_session_can_turn_news_back_on(self):
        member_email.set_news(self.person, False, how='test')
        member_auth.set_up_login(self.person, email='ana@example.com', username=None, password='green-lamp-4455')
        phone = APIClient()
        phone.post(PUBLIC + 'session/password/', {'login': 'ana@example.com', 'password': 'green-lamp-4455'}, format='json')
        on = phone.post(PUBLIC + 'me/emails/', {'news': True}, format='json')
        self.assertEqual(on.status_code, 200, on.content)
        self.assertTrue(on.json()['emails']['news'])
