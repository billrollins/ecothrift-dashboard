from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User


class LanguagePreferenceTests(APITestCase):
    def setUp(self):
        group, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='lang@example.com',
            first_name='Lang',
            last_name='User',
            password='x',
        )
        self.user.groups.add(group)
        self.client.force_authenticate(self.user)

    def test_me_exposes_and_patches_language(self):
        me = self.client.get('/api/auth/me/')
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.data['language'], 'en')

        patched = self.client.patch('/api/auth/me/', {'language': 'es'}, format='json')
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data['language'], 'es')
        self.user.refresh_from_db()
        self.assertEqual(self.user.language, 'es')

        refused = self.client.patch('/api/auth/me/', {'language': 'fr'}, format='json')
        self.assertEqual(refused.status_code, 400)
