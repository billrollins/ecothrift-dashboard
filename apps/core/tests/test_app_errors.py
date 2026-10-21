"""Error alerts: server 500s and screen crashes recorded in AppError, shown to the owner (critic review point 8)."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import path
from rest_framework.test import APIClient

from apps.core.models import AppError


def _boom(request):
    raise ValueError('boom on purpose')


urlpatterns = [path('boom/', _boom)]


def _user(email, role=None, **extra):
    user = get_user_model().objects.create_user(email, 'Test', 'User', password='x', **extra)
    if role:
        user.groups.add(Group.objects.get_or_create(name=role)[0])
    return user


class ServerErrorTests(TestCase):
    @override_settings(ROOT_URLCONF=__name__)
    def test_a_500_is_recorded(self):
        client = APIClient(raise_request_exception=False)
        r = client.get('/boom/')
        self.assertEqual(r.status_code, 500)
        e = AppError.objects.get()
        self.assertEqual(e.source, AppError.SOURCE_SERVER)
        self.assertEqual(e.message, 'ValueError: boom on purpose')
        self.assertEqual(e.path, '/boom/')
        self.assertEqual(e.method, 'GET')
        self.assertIn('_boom', e.detail)
        self.assertFalse(e.seen)

    def test_a_404_is_not_recorded(self):
        APIClient().get('/api/core/no-such-thing/')
        self.assertFalse(AppError.objects.exists())


class ScreenErrorReportTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_anyone_can_report_a_crash(self):
        r = APIClient().post(
            '/api/core/errors/report/',
            {'message': 'TypeError: x is undefined', 'stack': 'at Foo', 'component_stack': 'in Bar', 'path': '/pos/terminal'},
            format='json',
        )
        self.assertEqual(r.status_code, 204)
        e = AppError.objects.get()
        self.assertEqual(e.source, AppError.SOURCE_SCREEN)
        self.assertEqual(e.message, 'TypeError: x is undefined')
        self.assertEqual(e.path, '/pos/terminal')
        self.assertIn('at Foo', e.detail)
        self.assertIn('in Bar', e.detail)
        self.assertIsNone(e.user)

    def test_signed_in_report_keeps_the_user_and_clips_long_text(self):
        cashier = _user('cashier@example.com', role='Employee')
        client = APIClient()
        client.force_authenticate(cashier)
        r = client.post('/api/core/errors/report/', {'message': 'x' * 2000}, format='json')
        self.assertEqual(r.status_code, 204)
        e = AppError.objects.get()
        self.assertEqual(e.user, cashier)
        self.assertEqual(len(e.message), 500)

    def test_reports_are_throttled(self):
        client = APIClient()
        codes = [client.post('/api/core/errors/report/', {'message': 'm'}, format='json').status_code for _ in range(31)]
        self.assertEqual(codes[:30], [204] * 30)
        self.assertEqual(codes[30], 429)


class OwnerErrorListTests(TestCase):
    def setUp(self):
        self.owner = _user('owner@example.com', role='Admin', is_superuser=True)
        AppError.objects.create(source=AppError.SOURCE_SERVER, message='old', seen=True)
        AppError.objects.create(source=AppError.SOURCE_SCREEN, message='new', user=self.owner)

    def test_owner_sees_counts_and_latest(self):
        client = APIClient()
        client.force_authenticate(self.owner)
        r = client.get('/api/core/errors/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['open_count'], 1)
        self.assertEqual(r.data['last_24h'], 2)
        self.assertEqual(r.data['last_7d'], 2)
        self.assertEqual([row['message'] for row in r.data['latest']], ['new', 'old'])
        self.assertEqual(r.data['latest'][0]['user'], 'Test User')

    def test_mark_seen_clears_the_open_count(self):
        client = APIClient()
        client.force_authenticate(self.owner)
        r = client.post('/api/core/errors/seen/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['open_count'], 0)
        self.assertFalse(AppError.objects.filter(seen=False).exists())

    def test_managers_cannot_read_or_clear(self):
        client = APIClient()
        client.force_authenticate(_user('mgr@example.com', role='Manager'))
        self.assertEqual(client.get('/api/core/errors/').status_code, 403)
        self.assertEqual(client.post('/api/core/errors/seen/').status_code, 403)
