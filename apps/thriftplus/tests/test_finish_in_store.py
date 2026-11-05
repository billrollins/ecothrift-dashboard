"""Dash Update #79 (owner 2026-11-05; J8, J13, J19): a join on the customer's own phone that got stuck is finished in
the store. Staff confirm the phone in person (Edit name or phone), then the customer takes their own selfie and taps
I agree on the store phone. No ID check; never an Assisted join; staff-only."""
from __future__ import annotations

import io

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from PIL import Image
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.thriftplus.models import Account, Card, Event, Person
from apps.thriftplus.services import members, register


def _jpeg() -> SimpleUploadedFile:
    buf = io.BytesIO()
    Image.new('RGB', (40, 40), (120, 160, 90)).save(buf, 'JPEG')
    return SimpleUploadedFile('selfie.jpg', buf.getvalue(), content_type='image/jpeg')


class FinishInStoreTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.clerk = User.objects.create_user(email='clerk@example.com', first_name='Cal', last_name='Clerk', password='x-pass-123')
        self.clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.staff = APIClient()
        self.staff.force_authenticate(self.clerk)
        # The 11-05 case: joined by Google on his own phone, no phone yet, the app's add-phone step would not finish.
        account = Account.objects.create(status=Account.STATUS_PENDING)
        self.person = Person.objects.create(account=account, first_name='Carlos', last_name='Martinez',
                                            email='carlos@example.com')

    def _url(self, person=None):
        return f'/api/thriftplus/people/{(person or self.person).pk}/finish-in-store/'

    def _confirm_phone(self):
        r = self.staff.post(f'/api/thriftplus/people/{self.person.pk}/details/',
                            {'first_name': 'Carlos', 'last_name': 'Martinez', 'phone': '(402) 555-0177'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.json()['phone_verified'])
        return r.json()

    def test_staff_confirm_the_phone_then_the_customer_selfie_and_i_agree_finish_it(self):
        row = self._confirm_phone()
        self.assertEqual(row['status'], Account.STATUS_PENDING)  # no selfie, no I agree yet
        r = self.staff.post(self._url(), {'photo': _jpeg(), 'agree': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['status'], Account.STATUS_ACTIVE)
        self.person.refresh_from_db()
        self.assertTrue(self.person.photo)
        self.assertIsNotNone(self.person.signed_at)
        self.assertEqual(self.person.signed_terms_version, register.TERMS_VERSION)
        self.assertEqual(self.person.phone_verified_by, self.clerk)
        self.assertFalse(self.person.id_checked)  # no ID check (J22's only)
        ev = Event.objects.get(action='finished_in_store', person=self.person)
        self.assertEqual(ev.actor, self.clerk)
        self.assertTrue(ev.detail['agreed'] and ev.detail['photo'] and ev.detail['phone_by_staff'])
        self.assertTrue(Event.objects.filter(action='finished_on_phone', person=self.person).exists())
        self.assertTrue(Card.objects.filter(person=self.person, status=Card.STATUS_ACTIVE).exists())

    def test_without_a_confirmed_phone_it_waits(self):
        r = self.staff.post(self._url(), {'photo': _jpeg(), 'agree': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Confirm their mobile number', r.json()['detail'])
        self.person.refresh_from_db()
        self.assertFalse(self.person.photo)
        self.assertIsNone(self.person.signed_at)

    def test_a_number_on_file_but_never_confirmed_is_confirmed_when_staff_type_it_again(self):
        self.person.phone = '4025550177'
        self.person.save()
        row = self._confirm_phone()  # the same number, typed again by staff
        self.assertTrue(row['phone_verified'])

    def test_the_selfie_and_the_customers_own_tap_are_both_needed(self):
        self._confirm_phone()
        r = self.staff.post(self._url(), {'agree': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('selfie', r.json()['detail'])
        r = self.staff.post(self._url(), {'photo': _jpeg()}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('I agree', r.json()['detail'])
        self.person.refresh_from_db()
        self.assertFalse(self.person.photo)  # nothing half-saved
        self.assertEqual(self.person.account.status, Account.STATUS_PENDING)

    def test_a_photo_on_file_never_stands_in_for_their_selfie(self):
        self._confirm_phone()
        self.person.refresh_from_db()
        self.person.photo = _jpeg()
        self.person.save(update_fields=['photo'])
        r = self.staff.post(self._url(), {'agree': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('selfie', r.json()['detail'])

    def test_a_name_only_save_keeps_the_phone_and_does_not_confirm_it(self):
        self.person.phone = '4025550177'
        self.person.save()
        r = self.staff.post(f'/api/thriftplus/people/{self.person.pk}/details/',
                            {'first_name': 'Carlos', 'last_name': 'Martínez', 'phone': ''}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['phone_last4'], '0177')  # kept, never wiped
        self.assertFalse(r.json()['phone_verified'])  # not read back

    def test_never_an_assisted_join_a_practice_member_or_a_finished_one(self):
        self._confirm_phone()
        Event.objects.create(action='assisted_join', account=self.person.account, person=self.person)
        r = self.staff.post(self._url(), {'photo': _jpeg(), 'agree': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Assisted join', r.json()['detail'])

        member = members.create_account(first_name='Ana', last_name='Bell', phone='(402) 555-0101',
                                        id_checked=True, verified_18=True).people.get()
        r = self.staff.post(self._url(member), {'photo': _jpeg(), 'agree': 'true'}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('already finished', r.json()['detail'])

    def test_staff_only(self):
        self._confirm_phone()
        r = APIClient().post(self._url(), {'photo': _jpeg(), 'agree': 'true'}, format='multipart')
        self.assertIn(r.status_code, (401, 403))
        self.assertEqual(Account.objects.get(pk=self.person.account_id).status, Account.STATUS_PENDING)
