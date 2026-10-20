"""The member app's Account tab (owner 2026-10-20): ``public/me/`` answers your name, phone and photo."""
from __future__ import annotations

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.thriftplus.services import member_auth, members

PUBLIC = '/api/thriftplus/public/'


class AccountTabTests(TestCase):
    def setUp(self):
        cache.clear()
        AppSetting.objects.update_or_create(key=members.ENABLED_KEY, defaults={'value': True})
        self.account = members.create_account(first_name='Ana', last_name='Ruiz', phone='(402) 555-0101',
                                              email='ana@example.com', id_checked=True)
        self.person = self.account.people.get()

    def _me(self):
        token, _ = member_auth.start_session(self.person, 'email')
        phone = APIClient()
        phone.cookies[member_auth.COOKIE] = token
        return phone.get(PUBLIC + 'me/').json()

    def test_me_has_your_name_and_phone_and_no_photo_yet(self):
        you = self._me()['you']
        self.assertEqual(you, {'name': 'Ana Ruiz', 'phone': '4025550101', 'photo_url': None})

    def test_me_has_the_photo_when_there_is_one(self):
        self.person.photo.save('selfie.jpg', ContentFile(b'jpeg'), save=True)
        you = self._me()['you']
        self.assertTrue(you['photo_url'])
        self.assertIn('selfie', you['photo_url'])
