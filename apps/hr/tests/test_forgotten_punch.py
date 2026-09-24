"""Forgotten clock-out on Today: ask when they left, close it there, file a request."""
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import TimeEntry, TimeEntryModificationRequest
from apps.hr.services.forgotten_punch import REASON_TODAY


def _employee(email, first, role='Employee'):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(email=email, first_name=first, last_name='Test', password='test-pass-123')
    user.groups.add(group)
    EmployeeProfile.objects.create(
        user=user,
        employee_number=EmployeeProfile.generate_employee_number(),
        pay_rate=Decimal('15.00'),
        hire_date=timezone.localdate(),
    )
    return user


class ForgottenPunchTests(APITestCase):
    def setUp(self):
        self.carrie = _employee('carrie@example.com', 'Carrie')
        self.boss = _employee('boss@example.com', 'Boss', role='Manager')

    def _open(self, hours_ago):
        return TimeEntry.objects.create(
            employee=self.carrie,
            clock_in=timezone.now() - timedelta(hours=hours_ago),
            shift='retail_open',
        )

    def test_current_flags_a_punch_open_fourteen_hours_or_more(self):
        self._open(20)
        self.client.force_authenticate(self.carrie)
        data = self.client.get('/api/hr/time-entries/current/').data
        self.assertIsNotNone(data['stale'])
        self.assertIn('suggested_clock_out', data['stale'])

    def test_a_normal_shift_is_not_flagged(self):
        self._open(3)
        self.client.force_authenticate(self.carrie)
        self.assertIsNone(self.client.get('/api/hr/time-entries/current/').data['stale'])

    def test_plain_clock_out_is_refused_for_a_forgotten_punch(self):
        punch = self._open(24)
        self.client.force_authenticate(self.carrie)
        response = self.client.post(f'/api/hr/time-entries/{punch.pk}/clock_out/')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(response.data['code'], 'stale_punch')
        punch.refresh_from_db()
        self.assertIsNone(punch.clock_out)

    def test_fix_closes_at_the_time_given_and_files_a_request(self):
        punch = self._open(24)
        left = punch.clock_in + timedelta(hours=7)
        self.client.force_authenticate(self.carrie)
        response = self.client.post(
            f'/api/hr/time-entries/{punch.pk}/fix_forgotten/',
            {'clock_out': left.isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        punch.refresh_from_db()
        self.assertEqual(punch.clock_out, left)
        self.assertEqual(punch.total_hours, Decimal('7.00'))
        request = TimeEntryModificationRequest.objects.get(time_entry=punch)
        self.assertEqual(request.requested_clock_out, left)
        self.assertEqual(request.reason, REASON_TODAY)
        self.assertEqual(request.status, 'pending')

    def test_fix_refuses_a_time_before_clock_in_or_a_shift_still_going(self):
        stale = self._open(24)
        self.client.force_authenticate(self.carrie)
        before = self.client.post(
            f'/api/hr/time-entries/{stale.pk}/fix_forgotten/',
            {'clock_out': (stale.clock_in - timedelta(minutes=5)).isoformat()},
            format='json',
        )
        self.assertEqual(before.status_code, 400, before.data)
        stale.clock_out = timezone.now()
        stale.save()
        fresh = self._open(2)
        still_going = self.client.post(f'/api/hr/time-entries/{fresh.pk}/fix_forgotten/', {}, format='json')
        self.assertEqual(still_going.status_code, 400, still_going.data)

    def test_a_manager_can_still_clock_someone_out(self):
        punch = self._open(24)
        self.client.force_authenticate(self.boss)
        response = self.client.post(f'/api/hr/time-entries/{punch.pk}/clock_out/')
        self.assertEqual(response.status_code, 200, response.data)
