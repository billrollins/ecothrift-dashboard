"""Assisted join (owner 2026-11-03, J22): staff sign up a customer on the store phone, with a code texted to their flip
phone or, with no phone, by the photo ID; then the Finalize screen (photo, a tap on I agree, the ID check). Twilio is
mocked: nothing real is texted."""
from __future__ import annotations

from django.utils import timezone

from apps.core.models import AppSetting
from apps.thriftplus.models import Account, Card, Event, Person
from apps.thriftplus.services import member_list, members, register
from apps.thriftplus.tests.test_join_v2 import PHONE, TwilioMixin, _jpeg
from apps.thriftplus.tests.test_register import RegisterBase

ASSIST = '/api/thriftplus/register/assist/'


class AssistedJoinTests(TwilioMixin, RegisterBase):
    def setUp(self):
        super().setUp()
        self.start_twilio()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})

    def _finish(self, person_id, **data):
        body = {'person': person_id, 'id_checked': 'true', 'verified_18': 'true', 'finalize': 'true',
                'photo': _jpeg(), 'agree': 'true', **data}
        return self.api.post('/api/thriftplus/register/finish/', body, format='multipart')

    def test_a_flip_phone_gets_the_code_and_staff_finish_on_the_store_phone(self):
        r = self.api.post(ASSIST + 'send/', {'first_name': 'rosa', 'last_name': 'PARKS', 'phone': '(402) 867-5309'},
                          format='json')
        self.assertEqual((r.status_code, r.json()), (200, {'status': 'sent'}))
        self.twilio_send.assert_called_once_with(PHONE)
        self.assertFalse(Person.objects.filter(phone=PHONE).exists())  # nothing until the code is right

        self.twilio_check.return_value = False
        r = self.api.post(ASSIST + 'check/', {'phone': PHONE, 'code': '000000'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'CODE_BAD'))
        self.twilio_check.return_value = True
        r = self.api.post(ASSIST + 'check/', {'phone': PHONE, 'code': '123456'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        row = r.json()['person']
        self.assertEqual((row['first_name'], row['last_name'], row['status'], row['phone_verified'], row['signed']),
                         ('Rosa', 'Parks', 'pending', True, False))
        person = Person.objects.get(pk=row['person_id'])
        self.assertEqual(person.phone_verified_by, self.clerk)
        self.assertEqual(person.account.notes, 'Assisted join (their phone, a texted code).')
        self.assertTrue(Event.objects.filter(action='assisted_join', person=person, actor=self.clerk).exists())
        # Owner 2026-11-03 ("keep ID check for assisted only"): a verified phone, a photo and I agree never finish an
        # Assisted join without Finalize; it is the one Needs Finalize.
        self.assertEqual((row['assisted'], member_list.stage(person.account, person)), (True, 'needs_finalize'))
        person.photo, person.signed_at = _jpeg(), timezone.now()
        person.save()
        self.assertFalse(members.finish_on_phone(person))
        person.photo, person.signed_at = '', None
        person.save()
        self.assertEqual(Account.objects.get(pk=person.account_id).status, Account.STATUS_PENDING)

        r = self._finish(person.pk)
        self.assertEqual((r.status_code, r.json()['status'], r.json()['signed']), (200, 'active', True))
        person.refresh_from_db()
        self.assertEqual((person.id_checked, person.verified_18, bool(person.photo), bool(person.signature)),
                         (True, True, True, False))
        self.assertIsNotNone(person.signed_at)

    def test_a_number_already_on_a_membership_is_refused(self):
        members.create_account(first_name='Bo', last_name='Lee', phone=PHONE)
        r = self.api.post(ASSIST + 'send/', {'first_name': 'Bo', 'last_name': 'Lee', 'phone': PHONE}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (409, 'PHONE_TAKEN'))
        self.twilio_send.assert_not_called()
        r = self.api.post(ASSIST + 'send/', {'first_name': 'Bo', 'last_name': '', 'phone': '4025550199'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NAME_NEEDED'))
        r = self.api.post(ASSIST + 'send/', {'first_name': 'Bo', 'last_name': 'Lee', 'phone': '12'}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'CONTACT_BAD'))

    def test_no_phone_by_the_photo_id_then_found_by_name(self):
        r = self.api.post(ASSIST + 'no-phone/', {'first_name': 'Ed', 'last_name': ''}, format='json')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'NAME_NEEDED'))
        r = self.api.post(ASSIST + 'no-phone/', {'first_name': 'ed', 'last_name': 'nophone'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        row = r.json()['person']
        self.assertEqual((row['first_name'], row['last_name'], row['status'], row['contact']),
                         ('Ed', 'Nophone', 'pending', ''))
        person = Person.objects.get(pk=row['person_id'])
        self.assertEqual((person.phone, person.email), ('', ''))
        self.assertTrue(Card.objects.filter(person=person).exists())  # the member code, never printed

        # Finalize needs the ID check and the tap on I agree, as for everyone.
        r = self._finish(person.pk, agree='false')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'SIGNATURE_NEEDED'))
        r = self._finish(person.pk, id_checked='false')
        self.assertEqual((r.status_code, r.json()['code']), (400, 'ID_NEEDED'))
        self.assertEqual(self._finish(person.pk).status_code, 200)
        self.assertEqual(Account.objects.get(pk=person.account_id).status, Account.STATUS_ACTIVE)

        # Found at the register by name (J20); never purged; a phone can be added later.
        found = self.api.post('/api/thriftplus/register/pending/', {'q': 'nophone', 'recent': True}, format='json')
        self.assertEqual([p['person_id'] for p in found.json()['people']], [person.pk])
        self.assertEqual(member_list.purge_unconfirmed(dry_run=True), 0)
        person.refresh_from_db()
        self.assertTrue(register.agreed(person))

    def test_assisted_join_is_staff_only(self):
        from rest_framework.test import APIClient

        r = APIClient().post(ASSIST + 'no-phone/', {'first_name': 'Ed', 'last_name': 'Lee'}, format='json')
        self.assertIn(r.status_code, (401, 403))
