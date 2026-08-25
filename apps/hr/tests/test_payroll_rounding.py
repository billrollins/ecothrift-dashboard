"""Payroll pay must match the hours we print, not raw seconds."""
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import TimeEntry

TZ = ZoneInfo('America/Chicago')


def _admin():
    group, _ = Group.objects.get_or_create(name='Admin')
    user = User.objects.create_user(
        email='owner@example.com',
        first_name='Owner',
        last_name='Tester',
        password='test-pass-123',
        is_superuser=True,
        is_staff=True,
    )
    user.groups.add(group)
    return user


def _employee():
    group, _ = Group.objects.get_or_create(name='Employee')
    user = User.objects.create_user(
        email='ashley@example.com',
        first_name='Ashley',
        last_name='Kilduff',
        password='test-pass-123',
    )
    user.groups.add(group)
    EmployeeProfile.objects.create(
        user=user,
        employee_number=EmployeeProfile.generate_employee_number(),
        pay_rate=Decimal('15.00'),
        hire_date=timezone.localdate(),
    )
    return user


class PayrollRoundingTests(APITestCase):
    def test_pay_uses_two_decimal_hours_not_raw_seconds(self):
        admin = _admin()
        worker = _employee()
        # 8h + 2 seconds → 8.000555… hours. Displayed 8.00; unrounded × $15 was $120.01.
        TimeEntry.objects.create(
            employee=worker,
            date=timezone.localdate(),
            clock_in=datetime(2026, 8, 17, 9, 0, 0, tzinfo=TZ),
            clock_out=datetime(2026, 8, 17, 17, 0, 2, tzinfo=TZ),
            break_minutes=0,
        )

        self.client.force_authenticate(admin)
        resp = self.client.get(
            '/api/hr/time-entries/payroll/',
            {'date_from': '2026-08-17', 'date_to': '2026-08-17'},
        )
        self.assertEqual(resp.status_code, 200)
        row = resp.data[0]
        self.assertEqual(Decimal(row['total_hours']), Decimal('8.00'))
        self.assertEqual(Decimal(row['total_pay']), Decimal('120.00'))
        self.assertEqual(
            (Decimal(row['total_hours']) * Decimal(row['pay_rate'])).quantize(Decimal('0.01')),
            Decimal(row['total_pay']),
        )
