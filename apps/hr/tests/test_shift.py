from datetime import time, timedelta

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import Department, Shift, TimeEntry
from apps.hr.services.roster import build_time_roster
from apps.hr.shifts import SHIFT_OFFICE, SHIFT_RETAIL_OPEN, shift_label
from apps.routines.models import Routine


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


def _live_shift(code, name, dept, **kwargs):
    row, _ = Shift.objects.update_or_create(
        punch_code=code,
        defaults={
            'department': dept,
            'name': name,
            'time_in': time(9, 0),
            'time_out': time(17, 0),
            'weekdays': [1, 2, 3, 4, 5],
            'is_active': True,
            **kwargs,
        },
    )
    return row


class TimeEntryShiftTests(APITestCase):
    def setUp(self):
        self.retail, _ = Department.objects.get_or_create(
            slug='retail-operations',
            defaults={'name': 'Retail', 'icon': 'cart', 'sort_order': 0},
        )
        self.office, _ = Department.objects.get_or_create(
            slug='office',
            defaults={'name': 'Management', 'icon': 'home', 'sort_order': 3},
        )
        _live_shift(SHIFT_RETAIL_OPEN, 'Cashier - Open', self.retail)
        _live_shift(SHIFT_OFFICE, 'Office - Day', self.office)
        _live_shift('retail_reset', 'Retail - Reset', self.retail, weekdays=[0])

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
            {'shift': 'retail_reset'},
            format='json',
        )
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data['shift'], 'retail_reset')
        refused = self.client.post(
            f'/api/hr/time-entries/{created.data["id"]}/set_shift/',
            {'shift': 'not_a_shift'},
            format='json',
        )
        self.assertEqual(refused.status_code, 400)

    def test_office_clocks_in(self):
        user = _employee('office@example.com')
        self.client.force_authenticate(user)
        ok = self.client.post('/api/hr/time-entries/', {'shift': SHIFT_OFFICE}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(ok.data['shift'], SHIFT_OFFICE)
        self.assertEqual(ok.data['shift_label'], 'Office - Day')
        self.assertEqual(ok.data['shift_department'], 'Management')

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

    def test_clock_tiles_follow_departments_and_shifts(self):
        manager = _manager()
        retail, _ = Department.objects.get_or_create(
            slug='retail-operations',
            defaults={'name': 'Retail', 'sort_order': 0, 'is_active': True},
        )
        office, _ = Department.objects.get_or_create(
            slug='office',
            defaults={'name': 'Management', 'sort_order': 3, 'is_active': True},
        )
        retail.name = 'Retail'
        retail.sort_order = 0
        retail.is_active = True
        retail.save(update_fields=['name', 'sort_order', 'is_active'])
        office.name = 'Management'
        office.sort_order = 3
        office.is_active = True
        office.save(update_fields=['name', 'sort_order', 'is_active'])
        Shift.objects.filter(department__in=[retail, office]).delete()
        Shift.objects.create(
            department=retail, name='Cashier - Open', time_in=time(8, 30), time_out=time(15, 0),
            weekdays=[1, 2, 3, 4, 5], punch_code=SHIFT_RETAIL_OPEN,
        )
        Shift.objects.create(
            department=retail, name='Retail - Inventory', time_in=time(9, 0), time_out=time(17, 0),
            weekdays=[0], punch_code='retail_inventory',
        )
        Shift.objects.create(
            department=office, name='Management', time_in=time(9, 0), time_out=time(17, 0),
            weekdays=[1, 2, 3, 4, 5], punch_code=SHIFT_OFFICE,
        )
        self.client.force_authenticate(manager)
        thursday = self.client.get('/api/hr/shifts/clock_tiles/', {'date': '2026-09-17'})
        self.assertEqual(thursday.status_code, 200, thursday.data)
        thursday_names = [row['name'] for row in thursday.data]
        self.assertIn('Cashier - Open', thursday_names)
        self.assertIn('Management', thursday_names)
        self.assertNotIn('Retail - Inventory', thursday_names)
        monday = self.client.get('/api/hr/shifts/clock_tiles/', {'date': '2026-09-14'})
        self.assertEqual(monday.status_code, 200, monday.data)
        monday_names = [row['name'] for row in monday.data]
        self.assertIn('Retail - Inventory', monday_names)
        self.assertNotIn('Cashier - Open', monday_names)
        self.assertTrue(all(row['department'] != 'Office' for row in thursday.data))
        self.assertTrue(all(row['name'] != 'Customer Service' for row in thursday.data))

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

    def test_historical_code_uses_fallback_label(self):
        self.assertEqual(shift_label('retail_cs'), 'Customer Service')
        user = _employee('cs@example.com')
        now = timezone.now()
        entry = TimeEntry.objects.create(
            employee=user, clock_in=now, clock_out=now, shift='retail_cs',
        )
        self.client.force_authenticate(user)
        listed = self.client.get('/api/hr/time-entries/')
        rows = listed.data['results'] if isinstance(listed.data, dict) else listed.data
        match = next(row for row in rows if row['id'] == entry.pk)
        self.assertEqual(match['shift_label'], 'Customer Service')

    def test_shift_list_marks_locked_routines(self):
        open_shift = Shift.objects.get(punch_code=SHIFT_RETAIL_OPEN)
        reset = Shift.objects.get(punch_code='retail_reset')
        day = _live_shift('retail_day', 'Cashier - Day', self.retail, is_active=False)
        close = _live_shift('retail_close', 'Cashier - Close', self.retail)
        for key, shift in (
            ('retail.open', open_shift),
            ('retail.day', day),
            ('retail.close', close),
        ):
            routine, _ = Routine.objects.update_or_create(
                system_key=key,
                defaults={
                    'title': key.replace('retail.', 'Retail ').title(),
                    'kind': 'checklist',
                    'trigger': 'daily',
                    'is_active': True,
                    'definition': {'template_version': 1, 'sections': []},
                },
            )
            routine.shift = shift
            routine.shift_locked = True
            routine.save(update_fields=['shift', 'shift_locked'])
        manager = _manager()
        self.client.force_authenticate(manager)
        listed = self.client.get('/api/hr/shifts/')
        self.assertEqual(listed.status_code, 200, listed.data)
        by_code = {row['punch_code']: row for row in listed.data}
        self.assertTrue(by_code[SHIFT_RETAIL_OPEN]['locked'])
        self.assertTrue(by_code['retail_day']['locked'])
        self.assertTrue(by_code['retail_close']['locked'])
        self.assertFalse(by_code['retail_reset']['locked'])
