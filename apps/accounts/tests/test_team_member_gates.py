"""Security fix (2026-09-25): an online-store customer's sign-in must not reach staff endpoints."""
from __future__ import annotations

from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User

STAFF_ONLY = [
    ('get', '/api/pos/sale-mode/'),
    ('post', '/api/pos/sale-mode/'),
    ('get', '/api/pos/dashboard/metrics/'),
    ('get', '/api/pos/dashboard/alerts/'),
    ('get', '/api/pos/dashboard/sales-goal/'),
    ('get', '/api/pos/dashboard/department-goals/'),
    ('get', '/api/ai/models/'),
    ('post', '/api/ai/chat/'),
    ('get', '/api/core/system/print-server-version/'),
    ('get', '/api/core/system/print-server-releases/'),
]


def _user(email, group=None, **extra):
    user = User.objects.create_user(email, 'Test', 'User', password='x-pass-123', **extra)
    if group:
        user.groups.add(Group.objects.get_or_create(name=group)[0])
    return user


class TeamMemberGateTests(APITestCase):
    def test_a_customer_gets_403_on_every_staff_endpoint(self):
        self.client.force_authenticate(_user('shopper@example.com', 'Customer'))
        for method, url in STAFF_ONLY:
            with self.subTest(url=url, method=method):
                response = getattr(self.client, method)(url, {'override': True}, format='json')
                self.assertEqual(response.status_code, 403)

    def test_staff_and_a_superuser_without_a_group_still_get_in(self):
        for user in (_user('clerk@example.com', 'Employee'), _user('owner@example.com', is_superuser=True)):
            self.client.force_authenticate(user)
            with self.subTest(user=user.email):
                self.assertEqual(self.client.get('/api/pos/sale-mode/').status_code, 200)
                self.assertNotEqual(self.client.get('/api/pos/dashboard/metrics/').status_code, 403)
