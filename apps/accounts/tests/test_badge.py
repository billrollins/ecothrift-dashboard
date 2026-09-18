"""Kiosk card issue / reprint / revoke, and the host password check."""
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.kiosk_service import hash_token, identify


def _user(email, role, **extra):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, first_name=role, last_name='Person', password='secret-pw', is_staff=True, **extra,
    )
    user.groups.add(group)
    EmployeeProfile.objects.create(
        user=user, employee_number=EmployeeProfile.generate_employee_number(),
        hire_date=timezone.localdate(),
    )
    return user


class BadgeTests(APITestCase):
    def setUp(self):
        self.admin = _user('admin@example.com', 'Admin')
        self.manager = _user('mgr@example.com', 'Manager')
        self.emp = _user('emp@example.com', 'Employee')

    def test_issue_reprint_and_revoke(self):
        self.client.force_authenticate(self.admin)
        url = f'/api/accounts/users/{self.emp.pk}/badge/'
        res = self.client.post(url)
        self.assertEqual(res.status_code, 200, res.data)
        first = res.data['token']
        self.assertEqual(len(first), 10)
        self.assertEqual(res.data['badge_status'], 'active')
        self.emp.employee.refresh_from_db()
        self.assertEqual(self.emp.employee.badge_token_hash, hash_token(first))
        self.assertEqual(identify(first), self.emp)

        # Second issue refuses; reprint rotates.
        self.assertEqual(self.client.post(url).status_code, 400)
        res = self.client.post(url + 'reprint/')
        second = res.data['token']
        self.assertNotEqual(first, second)
        self.assertIsNone(identify(first))
        self.assertEqual(identify(second), self.emp)

        res = self.client.post(url + 'revoke/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['badge_status'], 'revoked')
        self.assertIsNone(identify(second))

        # Re-issue after revoke works and clears the revoke.
        res = self.client.post(url)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(identify(res.data['token']), self.emp)

    def test_serializer_exposes_status_only(self):
        self.client.force_authenticate(self.admin)
        self.client.post(f'/api/accounts/users/{self.emp.pk}/badge/')
        res = self.client.get(f'/api/accounts/users/{self.emp.pk}/')
        employee = res.data['employee']
        self.assertEqual(employee['badge_status'], 'active')
        self.assertNotIn('badge_token_hash', employee)
        self.assertNotIn('token', employee)

    def test_non_admin_cannot_touch_cards(self):
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'/api/accounts/users/{self.emp.pk}/badge/').status_code, 403)
        self.client.force_authenticate(self.emp)
        self.assertEqual(self.client.post(f'/api/accounts/users/{self.emp.pk}/badge/revoke/').status_code, 403)


class VerifyPasswordTests(APITestCase):
    def setUp(self):
        self.host = _user('host@example.com', 'Employee')

    def test_ok_wrong_and_anonymous(self):
        self.client.force_authenticate(self.host)
        res = self.client.post('/api/auth/verify-password/', {'password': 'secret-pw'}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['ok'])
        res = self.client.post('/api/auth/verify-password/', {'password': 'nope'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(res.data['ok'])
        self.client.force_authenticate(None)
        res = self.client.post('/api/auth/verify-password/', {'password': 'secret-pw'}, format='json')
        self.assertEqual(res.status_code, 401)
