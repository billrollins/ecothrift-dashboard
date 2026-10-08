"""Thrift+ text consent (standards T59, house texting standard): two separate boxes, never pre-ticked, each
choice recorded in apps.texting with the words shown; members and staff can change them; STOP ends both."""
from __future__ import annotations

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.texting import service as texting
from apps.texting.models import TextConsent
from apps.thriftplus.models import Account
from apps.thriftplus.services import cards, member_auth, members
from apps.thriftplus.services import texts as text_consent

PUBLIC = '/api/thriftplus/public/'


class SignUpTextConsentTests(TestCase):
    def setUp(self):
        self.clerk = User.objects.create_user('clerk@example.com', 'Pat', 'Clerk', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api = APIClient()
        self.api.force_authenticate(self.clerk)

    def _sign_up(self, **extra):
        body = {'first_name': 'Ana', 'phone': '(402) 555-0101', **extra}
        return self.api.post('/api/thriftplus/accounts/', body, format='multipart')

    def test_the_words_match_the_twilio_campaign_word_for_word(self):
        # The campaign in the house texting standard quotes these two lines; a change needs master.
        self.assertEqual(text_consent.WORDING['thriftplus']['text'], (
            'Text me my Thrift+ updates (savings, gift card balance, receipts, returns). Message frequency varies. '
            'Message and data rates may apply. Reply STOP to opt out, HELP for help. '
            'Terms: ecothrift.us/terms · Privacy: ecothrift.us/privacy.'))
        self.assertEqual(text_consent.WORDING['news']['text'], (
            'Text me Eco-Thrift store news (new arrivals and sales, up to about 4 a month). '
            'Message and data rates may apply. Reply STOP to opt out, HELP for help.'))

    def test_the_words_come_from_the_server_with_their_versions(self):
        data = self.api.get('/api/thriftplus/accounts/text-wording/').json()
        self.assertEqual([k['kind'] for k in data['kinds']], ['thriftplus', 'news'])
        self.assertTrue(all(k['version'] and 'Reply STOP to opt out' in k['text'] for k in data['kinds']))
        self.assertIn('Message and data rates may apply.', data['kinds'][0]['text'])
        self.assertIn('needed to join', data['not_required'])

    def test_only_the_ticked_box_is_recorded_with_the_words_shown(self):
        made = self._sign_up(texts_thriftplus='true', texts_news='false')
        self.assertEqual(made.status_code, 201, made.content)
        person = Account.objects.get(pk=made.json()['id']).people.get()
        row = TextConsent.objects.get()
        self.assertEqual((row.phone, row.kind, row.opted_in), ('4025550101', 'thriftplus', True))
        self.assertEqual(row.wording_version, text_consent.WORDING['thriftplus']['version'])
        self.assertEqual(row.wording, text_consent.WORDING['thriftplus']['text'])
        self.assertEqual((row.ref, row.by_id), (f'thriftplus.person:{person.pk}', self.clerk.pk))
        self.assertIn('Thrift+ sign-up (staff: Pat Clerk)', row.how)
        self.assertEqual(made.json()['people'][0]['texts'], {'thriftplus': True, 'news': False})
        self.assertFalse(texting.may_text('4025550101', 'news'))

    def test_no_ticks_means_no_rows_and_no_texts(self):
        self.assertEqual(self._sign_up().status_code, 201)
        self.assertFalse(TextConsent.objects.exists())

    def test_a_tick_without_a_mobile_number_stops_the_sign_up(self):
        refused = self.api.post('/api/thriftplus/accounts/', {'first_name': 'Bo', 'texts_news': 'true'}, format='multipart')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('mobile number', refused.json()['detail'])
        self.assertFalse(Account.objects.exists())

    def test_staff_change_a_choice_when_asked_and_stop_ends_both(self):
        made = self._sign_up(texts_thriftplus='true')
        person_id = made.json()['people'][0]['id']
        on = self.api.post(f'/api/thriftplus/people/{person_id}/texts/', {'kind': 'news', 'opted_in': True}, format='json')
        self.assertEqual(on.json()['people'][0]['texts'], {'thriftplus': True, 'news': True})
        self.assertEqual(TextConsent.objects.filter(kind='news').get().how, 'Staff: Pat Clerk (they asked)')
        off = self.api.post(f'/api/thriftplus/people/{person_id}/texts/', {'kind': 'thriftplus', 'opted_in': False}, format='json')
        self.assertEqual(off.json()['people'][0]['texts'], {'thriftplus': False, 'news': True})
        bad = self.api.post(f'/api/thriftplus/people/{person_id}/texts/', {'kind': 'everything', 'opted_in': True}, format='json')
        self.assertEqual(bad.status_code, 400)
        texting.record_stop('4025550101')
        person = Account.objects.get().people.get()
        self.assertEqual(text_consent.choices(person), {'thriftplus': False, 'news': False})
        self.assertEqual(TextConsent.objects.count(), 4)  # every change kept


class PortalTextConsentTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.code = cards.generate_batch(1).cards.values_list('code', flat=True)[0]
        self.account = members.create_account(first_name='Ana', phone='(402) 555-0101', id_checked=True, card_code=self.code,
                                              texts={'thriftplus': True})
        self.person = self.account.people.get()

    def test_me_shows_your_choices_and_a_card_session_can_stop_but_not_start(self):
        card_phone = APIClient()
        card_phone.post(PUBLIC + 'session/card/', {'card_code': f'TP{self.code}', 'phone_last4': '0101'}, format='json')
        me = card_phone.get(PUBLIC + 'me/').json()
        self.assertEqual(me['texts']['choices'], {'thriftplus': True, 'news': False})
        self.assertTrue(me['texts']['has_number'])
        start = card_phone.post(PUBLIC + 'me/texts/', {'kind': 'news', 'opted_in': True}, format='json')
        self.assertEqual((start.status_code, start.json()['code']), (403, 'NEEDS_PASSWORD'))
        stop = card_phone.post(PUBLIC + 'me/texts/', {'kind': 'thriftplus', 'opted_in': False}, format='json')
        self.assertEqual(stop.json()['texts']['choices'], {'thriftplus': False, 'news': False})
        self.assertEqual(TextConsent.objects.order_by('-at', '-id').first().how, 'Thrift+ My account (the member)')

    def test_a_password_session_can_start_store_news(self):
        member_auth.set_up_login(self.person, email='ana@example.com', username=None, password='green-lamp-4455')
        phone = APIClient()
        phone.post(PUBLIC + 'session/password/', {'login': 'ana@example.com', 'password': 'green-lamp-4455'}, format='json')
        started = phone.post(PUBLIC + 'me/texts/', {'kind': 'news', 'opted_in': True}, format='json')
        self.assertEqual(started.status_code, 200, started.content)
        self.assertEqual(started.json()['texts']['choices'], {'thriftplus': True, 'news': True})
        row = TextConsent.objects.filter(kind='news').get()
        self.assertEqual(row.wording_version, text_consent.WORDING['news']['version'])
