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

    def test_forgot_password_emails_a_clickable_link_and_returns_nothing(self):
        resp = self.client.post('/api/auth/forgot-password/', {'email': self.user.email}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('reset_token', resp.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(self.user.email, mail.outbox[0].to)
        self.assertIn('/reset-password?token=', mail.outbox[0].body)

    @override_settings(DEBUG=True)
    def test_forgot_password_never_returns_the_token_even_in_debug(self):
        resp = self.client.post('/api/auth/forgot-password/', {'email': self.user.email}, format='json')
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn('reset_token', resp.data)
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

    def test_forgot_password_ignores_a_customer_account(self):
        """Customers reset through the storefront, not the staff dashboard."""
        group, _ = Group.objects.get_or_create(name='Customer')
        shopper = User.objects.create_user(
            email='shopper@example.com', first_name='Ada', last_name='Shopper',
            password='x' * 12,
        )
        shopper.groups.add(group)

        resp = self.client.post(
            '/api/auth/forgot-password/', {'email': shopper.email}, format='json',
        )
        self.assertEqual(resp.status_code, 200)
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

    def test_login_stamps_last_login(self):
        # login_view mints its own JWT, so nothing fires user_logged_in for us.
        # Without the explicit stamp, Admin > Users reads every account as unused.
        self.assertIsNone(self.user.last_login)
        resp = self.client.post(
            '/api/auth/login/',
            {'email': 'cookie@example.com', 'password': 'test-pass-123'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200)
        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.last_login)


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


class RefreshRenewalTests(APITestCase):
    """A sign-in stays alive while it is used (owner 2026-10-20): a day-old refresh token is swapped for a fresh one."""

    def setUp(self):
        from rest_framework_simplejwt.tokens import RefreshToken

        self.user = _user(email='renew@example.com')
        self.RefreshToken = RefreshToken

    def _refresh(self, token):
        self.client.cookies['refresh_token'] = str(token)
        return self.client.post('/api/auth/refresh/')

    def test_a_new_token_keeps_its_refresh_token(self):
        token = self.RefreshToken.for_user(self.user)
        resp = self._refresh(token)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.cookies['refresh_token'].value, str(token))

    def test_a_day_old_token_gets_a_fresh_one_and_the_old_one_still_works(self):
        from datetime import timedelta

        from django.utils import timezone

        token = self.RefreshToken.for_user(self.user)
        token.set_iat(at_time=timezone.now() - timedelta(days=2))
        old = str(token)
        resp = self._refresh(old)
        self.assertEqual(resp.status_code, 200)
        fresh = resp.cookies['refresh_token'].value
        self.assertNotEqual(fresh, old)
        self.assertGreater(self.RefreshToken(fresh)['iat'], self.RefreshToken(old)['iat'])
        # A second tab refreshing with the old token is not signed out.
        self.assertEqual(self._refresh(old).status_code, 200)
