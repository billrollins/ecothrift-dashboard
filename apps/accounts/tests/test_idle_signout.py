"""Idle sign-out (house standard D16, T69): a Dash login with no activity past its limit cannot refresh."""
from datetime import timedelta

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.accounts.models import User
from apps.accounts.services import idle
from apps.core.models import AppSetting

PROTECTED = '/api/stocktake/today/'  # an ordinary staff route (see test_expired_token)


def _staff(email='idle@example.com', role='Employee'):
    user = User.objects.create_user(email=email, first_name='Idle', last_name='User', password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


def _signed_in(test, user):
    """A client holding a real refresh cookie, the way the browser does after login."""
    resp = test.client.post('/api/auth/login/', {'email': user.email, 'password': 'test-pass-123'}, format='json')
    test.assertEqual(resp.status_code, 200)
    return resp


class IdleSignOutTests(APITestCase):
    def setUp(self):
        self.user = _staff()

    def _age(self, **delta):
        User.objects.filter(pk=self.user.pk).update(last_active_at=timezone.now() - timedelta(**delta))

    def test_login_stamps_activity(self):
        self.assertIsNone(User.objects.get(pk=self.user.pk).last_active_at)
        _signed_in(self, self.user)
        self.assertIsNotNone(User.objects.get(pk=self.user.pk).last_active_at)

    def test_idle_over_four_hours_is_refused_with_a_clear_code(self):
        old = _signed_in(self, self.user).cookies['refresh_token'].value
        self._age(hours=4, minutes=5)
        resp = self.client.post('/api/auth/refresh/')
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.data['code'], 'IDLE')
        self.assertEqual(resp.data['detail'], 'Signed out after 4 hours idle.')
        self.assertEqual(resp.cookies['refresh_token'].value, '')  # cookie cleared
        # The spent token cannot be replayed, even after the person is active again.
        self._age(minutes=1)
        self.client.cookies['refresh_token'] = old
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 401)

    def test_idle_under_four_hours_refreshes(self):
        _signed_in(self, self.user)
        self._age(hours=3, minutes=55)
        resp = self.client.post('/api/auth/refresh/')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('access', resp.data)
        self.assertTrue(resp.cookies['refresh_token'].value)
        # A refresh is activity: the clock starts over.
        self.assertLess(timezone.now() - User.objects.get(pk=self.user.pk).last_active_at, timedelta(minutes=1))

    def test_a_request_with_a_good_token_counts_as_activity(self):
        self._age(hours=3)
        token = AccessToken.for_user(self.user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(self.client.get(PROTECTED).status_code, 200)
        self.assertLess(timezone.now() - User.objects.get(pk=self.user.pk).last_active_at, timedelta(minutes=1))

    def test_requests_stamp_at_most_every_five_minutes(self):
        recent = timezone.now() - timedelta(minutes=2)
        User.objects.filter(pk=self.user.pk).update(last_active_at=recent)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.user)}')
        self.client.get(PROTECTED)
        self.assertEqual(User.objects.get(pk=self.user.pk).last_active_at, recent)

    def test_a_session_started_before_this_shipped_gets_a_fresh_start(self):
        # No last_active_at yet: let it in rather than sign everybody out on deploy day.
        self.client.cookies['refresh_token'] = str(RefreshToken.for_user(self.user))
        resp = self.client.post('/api/auth/refresh/')
        self.assertEqual(resp.status_code, 200)
        self.assertIsNotNone(User.objects.get(pk=self.user.pk).last_active_at)

    def test_the_limit_is_a_setting(self):
        AppSetting.objects.create(key=idle.SETTING_KEY, value={'staff': 2, 'register': 10})
        _signed_in(self, self.user)
        self._age(hours=2, minutes=5)
        resp = self.client.post('/api/auth/refresh/')
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.data['detail'], 'Signed out after 2 hours idle.')

    def test_a_bad_setting_falls_back_to_four_hours(self):
        AppSetting.objects.create(key=idle.SETTING_KEY, value='soon')
        self.assertEqual(idle.idle_hours(), 4)
        AppSetting.objects.filter(key=idle.SETTING_KEY).update(value={'staff': -3, 'register': 'x'})
        self.assertEqual(idle.idle_hours(), 4)
        self.assertEqual(idle.idle_hours('register'), 24)

    def test_a_register_keeps_the_longer_named_setting(self):
        _signed_in(self, self.user)
        self._age(hours=10)
        # The same idle time: a plain browser is out, a register is not.
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 401)
        _signed_in(self, self.user)
        self._age(hours=10)
        resp = self.client.post('/api/auth/refresh/', HTTP_X_DEVICE_KIND='register')
        self.assertEqual(resp.status_code, 200)

    def test_a_register_is_still_signed_out_past_its_own_limit(self):
        _signed_in(self, self.user)
        self._age(hours=25)
        resp = self.client.post('/api/auth/refresh/', HTTP_X_DEVICE_KIND='register')
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.data['detail'], 'Signed out after 24 hours idle.')

    def test_a_register_limit_below_the_staff_limit_does_not_shorten_registers(self):
        AppSetting.objects.create(key=idle.SETTING_KEY, value={'staff': 4, 'register': 1})
        self.assertEqual(idle.idle_hours('register'), 4)

    def test_a_customer_is_never_timed_out(self):
        customer = User.objects.create_user(email='cust@example.com', first_name='C', last_name='U', password='x-pass-123')
        customer.groups.add(Group.objects.get_or_create(name='Customer')[0])
        User.objects.filter(pk=customer.pk).update(last_active_at=timezone.now() - timedelta(days=3))
        self.client.cookies['refresh_token'] = str(RefreshToken.for_user(customer))
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 200)

    def test_an_expired_token_still_answers_401_not_403(self):
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=-timedelta(minutes=5))
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        resp = self.client.get(PROTECTED)
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(resp.data['code'], 'token_not_valid')
