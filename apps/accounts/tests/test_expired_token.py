"""An expired or invalid staff token must answer 401, never 403.

The dashboard renews its access token only when a request answers 401 (`frontend/src/api/client.ts`).
A 403 here would sign staff out as soon as a token expired (it happened in another house project
whose authentication class had no ``authenticate_header``). House standard: users, D16.
"""

import datetime

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from apps.accounts.models import User

PROTECTED = '/api/stocktake/today/'  # an ordinary staff route: IsAuthenticated + a role


class ExpiredTokenTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='tok@example.com', first_name='T', last_name='K', password='test-pass-123')
        self.user.groups.add(Group.objects.get_or_create(name='Employee')[0])

    def _get(self, header=None):
        client = APIClient()
        if header:
            client.credentials(HTTP_AUTHORIZATION=header)
        return client.get(PROTECTED)

    def test_a_good_token_gets_in(self):
        self.assertEqual(self._get(f'Bearer {AccessToken.for_user(self.user)}').status_code, 200)

    def test_an_expired_token_answers_401_so_the_browser_renews_it(self):
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=-datetime.timedelta(minutes=5))
        resp = self._get(f'Bearer {token}')
        self.assertEqual(resp.status_code, 401)
        self.assertTrue(resp.headers['WWW-Authenticate'].startswith('Bearer'))
        self.assertEqual(resp.data['code'], 'token_not_valid')

    def test_a_bad_token_and_no_token_answer_401(self):
        for header in ('Bearer not-a-token', None):
            resp = self._get(header)
            self.assertEqual(resp.status_code, 401, header)
            self.assertTrue(resp.headers['WWW-Authenticate'].startswith('Bearer'))
