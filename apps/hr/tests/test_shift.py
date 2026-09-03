from datetime import timedelta

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import TimeEntry
from apps.hr.services.roster import build_time_roster
from apps.hr.shifts import SHIFT_OFFICE, SHIFT_RETAIL_DAY, SHIFT_RETAIL_OPEN


def _employee(email='shift@example.com'):
    group, _ = Group.objects.get_or_create(name='Employee')
    user = User.objects.create_user(
        email=email,
        first_name='Shift',
        last_name='Worker',
        password='x',
    )
    user.groups.add(group)
    return user


def _manager():
    group, _ = Group.objects.get_or_create(name='Manager')
    user = User.objects.create_user(
        email='shift-mgr@example.com',
        first_name='Shift',
        last_name='Manager',
        password='x',
        is_staff=True,
    )
    user.groups.add(group)
    return user


class TimeEntryShiftTests(APITestCase):
    def test_self_clock_in_needs_a_shift(self):
        user = _employee()
        self.client.force_authenticate(user)
        refused = self.client.post('/api/hr/time-entries/', {}, format='json')
        self.assertEqual(refused.status_code, 400)

        ok = self.client.post('/api/hr/time-entries/', {'shift': SHIFT_RETAIL_OPEN}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data['shift'], SHIFT_RETAIL_OPEN)
        self.assertTrue(ok.data['shift_label'])

    def test_set_shift_on_an_open_punch(self):
        user = _employee('change@example.com')
        self.client.force_authenticate(user)
        created = self.client.post(
            '/api/hr/time-entries/', {'shift': SHIFT_RETAIL_OPEN}, format='json',
        )
        changed = self.client.post(
            f'/api/hr/time-entries/{created.data["id"]}/set_shift/',
            {'shift': SHIFT_RETAIL_DAY},
            format='json',
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data['shift'], SHIFT_RETAIL_DAY)

    def test_office_clocks_in(self):
        user = _employee('office@example.com')
        self.client.force_authenticate(user)
        ok = self.client.post('/api/hr/time-entries/', {'shift': SHIFT_OFFICE}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data['shift'], SHIFT_OFFICE)
        self.assertEqual(ok.data['shift_label'], 'Management')
        self.assertEqual(ok.data['shift_department'], 'Office')

    def test_open_shift_labels_are_position_and_department(self):
        user = _employee('labels@example.com')
        self.client.force_authenticate(user)
        ok = self.client.post('/api/hr/time-entries/', {'shift': SHIFT_RETAIL_OPEN}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data['shift_label'], 'Cashier - Open')
        self.assertEqual(ok.data['shift_department'], 'Retail')

    def test_roster_label_carries_department(self):
        user = _employee('roster@example.com')
        now = timezone.now()
        entry = TimeEntry.objects.create(
            employee=user,
            clock_in=now,
            clock_out=now + timedelta(hours=1),
            shift=SHIFT_RETAIL_OPEN,
        )
        rows = build_time_roster(entry.date, entry.date)
        match = next(row for row in rows if row['id'] == entry.id)
        self.assertEqual(match['shift_label'], 'Retail: Cashier - Open')

    def test_manager_may_omit_shift_on_a_payroll_row(self):
        manager = _manager()
        other = _employee('payroll@example.com')
        self.client.force_authenticate(manager)
        from django.utils import timezone
        created = self.client.post('/api/hr/time-entries/', {
            'employee': other.pk,
            'clock_in': timezone.now().isoformat(),
            'clock_out': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['shift'], '')
        self.assertEqual(TimeEntry.objects.get(pk=created.data['id']).shift, '')
