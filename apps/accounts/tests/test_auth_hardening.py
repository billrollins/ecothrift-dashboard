"""Auth hardening: forgot-password token disclosure, secure cookie, throttles."""
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core import mail
from django.core.cache.backends.locmem import LocMemCache
from django.test import override_settings
from rest_framework.test import APITestCase
from rest_framework.throttling import SimpleRateThrottle

from apps.accounts.models import User
from apps.accounts.views import (
    AuthForgotPasswordThrottle,
    AuthLoginThrottle,
    _FixedScopeThrottle,
)


def _user(email='staff@example.com', password='test-pass-123'):
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email=email,
        first_name='Staff',
        last_name='User',
        password=password,
    )
    user.groups.add(group)
    return user


@override_settings(
    DEBUG=False,
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    DEFAULT_FROM_EMAIL='Eco-Thrift <retail@ecothrift.us>',
)
class ForgotPasswordHardeningTests(APITestCase):
    def setUp(self):
        self.user = _user()

    def test_forgot_password_does_not_return_token_when_debug_false(self):
        resp = self.client.post('/api/auth/forgot-password/', {'email': self.user.email}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('reset_token', resp.data)
        self.assertIn('If this email is registered', resp.data['detail'])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)
        # Token must appear in the email body (not the HTTP response).
        self.assertIn('token', mail.outbox[0].body.lower())

    @override_settings(DEBUG=True)
    def test_forgot_password_returns_token_when_debug_true(self):
        resp = self.client.post('/api/auth/forgot-password/', {'email': self.user.email}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertIn('reset_token', resp.data)
        self.assertTrue(resp.data['reset_token'])
        self.assertEqual(len(mail.outbox), 1)

    def test_forgot_password_unknown_email_same_message_no_mail(self):
        resp = self.client.post(
            '/api/auth/forgot-password/',
            {'email': 'nobody@example.com'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('reset_token', resp.data)
        self.assertEqual(len(mail.outbox), 0)


@override_settings(DEBUG=False)
class RefreshCookieSecureTests(APITestCase):
    def setUp(self):
        self.user = _user(email='cookie@example.com')

    def test_login_sets_secure_refresh_cookie_when_not_debug(self):
        resp = self.client.post(
            '/api/auth/login/',
            {'email': 'cookie@example.com', 'password': 'test-pass-123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(cookie)
        self.assertTrue(cookie['secure'])

    @override_settings(DEBUG=True)
    def test_login_refresh_cookie_not_secure_when_debug(self):
        resp = self.client.post(
            '/api/auth/login/',
            {'email': 'cookie@example.com', 'password': 'test-pass-123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        cookie = resp.cookies.get('refresh_token')
        self.assertIsNotNone(cookie)
        self.assertFalse(cookie['secure'])


class AuthThrottleTests(APITestCase):
    def setUp(self):
        throttle_cache = LocMemCache(f'auth-throttle-{id(self)}', {})
        rates = {
            'auth_login': '1/minute',
            'auth_forgot_password': '1/hour',
            'labels_propose_structure': '30/hour',
            'labels_generate_background': '10/hour',
        }
        for cls in (
            SimpleRateThrottle,
            _FixedScopeThrottle,
            AuthLoginThrottle,
            AuthForgotPasswordThrottle,
        ):
            cache_patcher = patch.object(cls, 'cache', throttle_cache)
            rates_patcher = patch.object(cls, 'THROTTLE_RATES', rates)
            cache_patcher.start()
            rates_patcher.start()
            self.addCleanup(cache_patcher.stop)
            self.addCleanup(rates_patcher.stop)
        self.user = _user(email='throttle@example.com')

    def test_login_view_has_throttle_classes(self):
        from apps.accounts.views import login_view

        classes = getattr(login_view.cls, 'throttle_classes', [])
        self.assertTrue(
            any(cls is AuthLoginThrottle for cls in classes),
            f'login_view.cls.throttle_classes={classes}',
        )

    def test_login_throttle_returns_429(self):
        self.client.post(
            '/api/auth/login/',
            {'email': 'throttle@example.com', 'password': 'wrong'},
            format='json',
        )
        resp = self.client.post(
            '/api/auth/login/',
            {'email': 'throttle@example.com', 'password': 'wrong'},
            format='json',
        )
        self.assertEqual(resp.status_code, 429, resp.data)

    def test_forgot_password_throttle_returns_429(self):
        self.client.post(
            '/api/auth/forgot-password/',
            {'email': 'throttle@example.com'},
            format='json',
        )
        resp = self.client.post(
            '/api/auth/forgot-password/',
            {'email': 'throttle@example.com'},
            format='json',
        )
        self.assertEqual(resp.status_code, 429, resp.data)
