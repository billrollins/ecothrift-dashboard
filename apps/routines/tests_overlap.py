from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import Department, Shift, ShiftAssignment, TimeEntry
from apps.routines.command_center import build_jobs, build_staff
from apps.routines.models import Routine, RoutineRun
from apps.routines.schedule import SYSTEM_CLOSE, SYSTEM_OPEN

TZ = ZoneInfo('America/Chicago')
THURSDAY = date(2026, 9, 17)


def _staff(email, first, last, role='Employee'):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, first_name=first, last_name=last, password='x', is_staff=True,
    )
    user.groups.add(group)
    return user


class OverlappingShiftTests(APITestCase):
    def setUp(self):
        self.retail, _ = Department.objects.get_or_create(
            slug='retail-operations',
            defaults={'name': 'Retail', 'icon': 'cart', 'sort_order': 0},
        )
        self.open_shift, _ = Shift.objects.update_or_create(
            punch_code='retail_open',
            defaults={
                'name': 'Retail Open', 'department': self.retail,
                'time_in': time(8, 30), 'time_out': time(14, 30),
                'weekdays': [1, 2, 3, 4, 5], 'is_active': True,
            },
        )
        self.close_shift, _ = Shift.objects.update_or_create(
            punch_code='retail_close',
            defaults={
                'name': 'Retail Close', 'department': self.retail,
                'time_in': time(12, 30), 'time_out': time(18, 30),
                'weekdays': [1, 2, 3, 4, 5], 'is_active': True,
            },
        )
        self.carrie = _staff('carrie@example.com', 'Carrie', 'Rollins')
        self.david = _staff('david@example.com', 'David', 'Kilduff')
        ShiftAssignment.objects.update_or_create(
            employee=self.carrie, shift=self.open_shift,
            defaults={'weekdays': [1, 2, 3, 4, 5]},
        )
        ShiftAssignment.objects.update_or_create(
            employee=self.carrie, shift=self.close_shift,
            defaults={'weekdays': [3]},
        )
        ShiftAssignment.objects.update_or_create(
            employee=self.david, shift=self.close_shift,
            defaults={'weekdays': [1, 2, 3, 4, 5]},
        )
        for key, title, shift in (
            (SYSTEM_OPEN, 'Retail open', self.open_shift),
            (SYSTEM_CLOSE, 'Retail close', self.close_shift),
        ):
            routine, _ = Routine.objects.update_or_create(
                system_key=key,
                defaults={
                    'title': title, 'kind': Routine.KIND_CHECKLIST,
                    'trigger': Routine.TRIGGER_DAILY, 'is_active': True,
                    'due_time': time(9, 0) if key == SYSTEM_OPEN else time(18, 0),
                    'definition': {'template_version': 1, 'sections': []},
                },
            )
            routine.shift = shift
            routine.shift_locked = True
            routine.audience_type = Routine.AUDIENCE_SHIFT
            routine.assigned_shifts = [shift.punch_code]
            routine.save()
            if key == SYSTEM_OPEN:
                self.open = routine
            else:
                self.close = routine

    def test_one_staff_row_joins_names_and_outer_span(self):
        now = timezone.make_aware(datetime.combine(THURSDAY, time(8, 50)), TZ)
        staff = build_staff(THURSDAY, now=now, tz=TZ, today=THURSDAY)
        row = next(item for item in staff if item['id'] == self.carrie.pk)
        self.assertEqual(row['shift_name'], 'Retail Open + Retail Close')
        self.assertEqual(row['time_in'], '08:30')
        self.assertEqual(row['time_out'], '18:30')
        self.assertEqual(row['status'], 'Late')

    def test_close_lists_both_scheduled_names_until_punch(self):
        now = timezone.make_aware(datetime.combine(THURSDAY, time(10, 0)), TZ)
        jobs = build_jobs(THURSDAY, {}, now=now, tz=TZ, hours_cfg=None)
        close = next(row for row in jobs if row['key'] == SYSTEM_CLOSE)
        self.assertEqual(close['owner_state'], 'scheduled')
        self.assertIsNone(close['owner']['id'])
        self.assertEqual(close['owner']['name'], 'Carrie R., David K.')

    def test_one_punch_marks_both_locked_routines_in(self):
        TimeEntry.objects.create(
            employee=self.carrie,
            date=THURSDAY,
            clock_in=timezone.make_aware(datetime.combine(THURSDAY, time(8, 20)), TZ),
            shift='retail_open',
        )
        now = timezone.make_aware(datetime.combine(THURSDAY, time(10, 0)), TZ)
        jobs = build_jobs(THURSDAY, {}, now=now, tz=TZ, hours_cfg=None)
        open_job = next(row for row in jobs if row['key'] == SYSTEM_OPEN)
        close = next(row for row in jobs if row['key'] == SYSTEM_CLOSE)
        self.assertEqual(open_job['owner_state'], 'in')
        self.assertEqual(open_job['owner']['id'], self.carrie.pk)
        self.assertEqual(close['owner_state'], 'in')
        self.assertEqual(close['owner']['id'], self.carrie.pk)

    def test_mine_includes_both_locked_routines(self):
        day = timezone.localdate()
        if day.weekday() == 0:
            self.skipTest('Monday is closed; pick an open weekday.')
        ShiftAssignment.objects.filter(employee=self.carrie).update(weekdays=[day.weekday()])
        for routine in (self.open, self.close):
            RoutineRun.objects.get_or_create(
                routine=routine,
                period_key=day.isoformat(),
                assigned_to=None,
                defaults={
                    'due_at': timezone.now(),
                    'status': RoutineRun.STATUS_OPEN,
                    'unassign_key': '',
                },
            )
        self.client.force_authenticate(self.carrie)
        mine = self.client.get('/api/routines/runs/mine/')
        self.assertEqual(mine.status_code, 200, mine.data)
        keys = {row['system_key'] for row in mine.data['open']}
        self.assertIn(SYSTEM_OPEN, keys)
        self.assertIn(SYSTEM_CLOSE, keys)
