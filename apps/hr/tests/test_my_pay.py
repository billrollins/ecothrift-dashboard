"""Staff can read their own biweekly pay periods, and nobody else's."""
from datetime import datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import TimeEntry
from apps.hr.services.payroll_periods import payroll_period_bounds
from apps.hr.services.roster import shift_hours

TZ = ZoneInfo('America/Chicago')


def _employee(email, first, last, rate='15.00'):
    group, _ = Group.objects.get_or_create(name='Employee')
    user = User.objects.create_user(
        email=email,
        first_name=first,
        last_name=last,
        password='test-pass-123',
    )
    user.groups.add(group)
    EmployeeProfile.objects.create(
        user=user,
        employee_number=EmployeeProfile.generate_employee_number(),
        pay_rate=Decimal(rate),
        hire_date=timezone.localdate(),
    )
    return user


def _closed_shift(employee, day, hours=8, status='pending'):
    clock_in = datetime.combine(day, time(9, 0), tzinfo=TZ)
    clock_out = clock_in + timedelta(hours=hours)
    return TimeEntry.objects.create(
        employee=employee,
        date=day,
        clock_in=clock_in,
        clock_out=clock_out,
        break_minutes=0,
        status=status,
    )


class MyPayTests(APITestCase):
    def test_own_periods_count_hours_and_pay(self):
        worker = _employee('ashley@example.com', 'Ashley', 'Kilduff', '15.00')
        current_start, _current_end = payroll_period_bounds()
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=13)

        first = _closed_shift(worker, current_start)
        second = _closed_shift(worker, current_start + timedelta(days=1))
        prior = _closed_shift(worker, previous_start)

        self.client.force_authenticate(worker)
        resp = self.client.get('/api/hr/time-entries/my_pay/')
        self.assertEqual(resp.status_code, 200)
        self.assertGreaterEqual(len(resp.data), 2)
        self.assertNotIn('pay_rate', resp.data[0])

        current = resp.data[0]
        previous = resp.data[1]
        self.assertTrue(current['is_current'])
        self.assertEqual(current['shift_count'], 2)
        current_hours = (shift_hours(first) + shift_hours(second)).quantize(Decimal('0.01'))
        self.assertEqual(Decimal(current['total_hours']), current_hours)
        self.assertEqual(
            Decimal(current['total_pay']),
            (current_hours * Decimal('15.00')).quantize(Decimal('0.01')),
        )

        self.assertFalse(previous['is_current'])
        self.assertEqual(previous['shift_count'], 1)
        self.assertEqual(Decimal(previous['total_hours']), shift_hours(prior))

    def test_other_employee_shifts_never_appear(self):
        worker = _employee('ashley@example.com', 'Ashley', 'Kilduff')
        other = _employee('other@example.com', 'Other', 'Person', '20.00')
        current_start, _current_end = payroll_period_bounds()
        _closed_shift(other, current_start, hours=10)

        self.client.force_authenticate(worker)
        resp = self.client.get(
            '/api/hr/time-entries/my_pay/',
            {'employee': other.id},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data[0]['shift_count'], 0)
        self.assertEqual(Decimal(resp.data[0]['total_hours']), Decimal('0.00'))
        self.assertEqual(Decimal(resp.data[0]['total_pay']), Decimal('0.00'))

    def test_anonymous_is_rejected(self):
        resp = self.client.get('/api/hr/time-entries/my_pay/')
        self.assertIn(resp.status_code, (401, 403))
