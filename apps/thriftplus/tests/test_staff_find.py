"""Thrift+ Staff, Find (owner 2026-10-20): one box finds everyone; quick fixes (sign-in QR, retake photo, name and phone)."""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.thriftplus.models import Account, MemberEmailToken, MemberSession, Person
from apps.thriftplus.services import members, register

PUBLIC = '/api/thriftplus/public/'
PNG = (b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89'
       b'\x00\x00\x00\rIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82')


class StaffFindTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        clerk = User.objects.create_user(email='clerk@example.com', first_name='Cal', last_name='Clerk', password='x-pass-123')
        clerk.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.staff = APIClient()
        self.staff.force_authenticate(clerk)
        self.member = members.create_account(first_name='Ana', last_name='Bell', phone='(402) 555-0101',
                                             id_checked=True, verified_18=True).people.get()
        # Joined by email last week and never finished: no phone on file (the couple at the register, 10-19).
        account = Account.objects.create(status=Account.STATUS_PENDING)
        self.joined = Person.objects.create(account=account, first_name='Ruth', last_name='Olsen', email='ruth@example.com',
                                            email_verified_at=timezone.now())

    def _find(self, q):
        r = self.staff.post('/api/thriftplus/register/pending/', {'q': q, 'recent': True}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        return [(p['first_name'], p['status']) for p in r.data['people']]

    def test_one_box_finds_members_and_joins_by_name_phone_and_email(self):
        self.assertEqual(self._find('ruth'), [('Ruth', 'pending')])
        self.assertEqual(self._find('olsen'), [('Ruth', 'pending')])
        self.assertEqual(self._find('ruth@exam'), [('Ruth', 'pending')])
        self.assertEqual(self._find('ana bell'), [('Ana', 'active')])  # a finished member, not only pending joins
        self.assertEqual(self._find('0101'), [('Ana', 'active')])  # any part of the phone
        self.assertEqual(self._find('(402) 555-0101'), [('Ana', 'active')])
        self.assertEqual(self._find('nobody'), [])

    def test_the_sign_in_qr_signs_the_app_in_once_and_leaves_the_email_alone(self):
        r = self.staff.post(f'/api/thriftplus/people/{self.member.pk}/sign-in-qr/', {}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        link = r.data['link']
        self.assertIn('/scan?signin=', link)
        token = link.split('signin=')[1]
        phone = APIClient()
        signed = phone.post(PUBLIC + 'session/link/', {'token': token}, format='json')
        self.assertEqual(signed.status_code, 200, signed.content)
        self.assertTrue(MemberSession.objects.filter(person=self.member).exists())
        self.member.refresh_from_db()
        self.assertIsNone(self.member.email_verified_at)  # no email was involved
        again = APIClient().post(PUBLIC + 'session/link/', {'token': token}, format='json')
        self.assertEqual(again.status_code, 400)  # once

    def test_the_sign_in_qr_dies_after_five_minutes(self):
        r = self.staff.post(f'/api/thriftplus/people/{self.joined.pk}/sign-in-qr/', {}, format='json')
        token = r.data['link'].split('signin=')[1]
        MemberEmailToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        late = APIClient().post(PUBLIC + 'session/link/', {'token': token}, format='json')
        self.assertEqual((late.status_code, late.data.get('code')), (400, 'LINK_EXPIRED'))

    def test_staff_add_a_phone_to_an_email_join_and_it_counts_as_checked(self):
        r = self.staff.post(f'/api/thriftplus/people/{self.joined.pk}/details/',
                            {'first_name': 'Ruth', 'last_name': 'Olsen', 'phone': '402-555-0177'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['phone_last4'], '0177')
        self.joined.refresh_from_db()
        self.assertEqual(self.joined.phone, '4025550177')
        self.assertIsNotNone(self.joined.phone_verified_at)
        self.assertEqual(self._find('0177'), [('Ruth', 'pending')])

    def test_a_phone_on_another_membership_is_refused(self):
        r = self.staff.post(f'/api/thriftplus/people/{self.joined.pk}/details/',
                            {'first_name': 'Ruth', 'last_name': 'Olsen', 'phone': '4025550101'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('another membership', r.data['detail'])

    def test_retake_photo_answers_the_row(self):
        photo = SimpleUploadedFile('me.png', PNG, content_type='image/png')
        r = self.staff.post(f'/api/thriftplus/people/{self.member.pk}/photo-fix/', {'photo': photo}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(r.data['photo_url'])

    def test_an_ended_session_does_not_count_as_signed_in(self):
        from apps.thriftplus.services import member_auth

        _token, session = member_auth.start_session(self.member, MemberSession.KIND_EMAIL)
        self.assertTrue(register.finalize_row(self.member)['app_signed_in'])
        MemberSession.objects.filter(pk=session.pk).update(revoked_at=timezone.now())
        self.assertFalse(register.finalize_row(self.member)['app_signed_in'])
