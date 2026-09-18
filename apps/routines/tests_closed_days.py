from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import Department, Shift, ShiftAssignment
from apps.routines.command_center import build_staff, week_tiles
from apps.routines.grading import expected_parts
from apps.routines.models import Section
from apps.routines.schedule import SYSTEM_CLOSE, SYSTEM_DAY, SYSTEM_OPEN
from apps.webstore.services.hours import is_open_day

TZ = ZoneInfo('America/Chicago')


def _staff(email):
    group, _ = Group.objects.get_or_create(name='Employee')
    user = User.objects.create_user(
        email=email, first_name='Reset', last_name='Worker', password='x', is_staff=True,
    )
    user.groups.add(group)
    return user


class ClosedDayScoringTests(APITestCase):
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
                'weekdays': [3], 'is_active': True,
            },
        )
        Shift.objects.update_or_create(
            punch_code='retail_day',
            defaults={
                'name': 'Retail Mid', 'department': self.retail,
                'time_in': time(11, 0), 'time_out': time(19, 0),
                'weekdays': [1, 2, 3, 4, 5], 'is_active': False,
            },
        )
        Shift.objects.update_or_create(
            punch_code='retail_close',
            defaults={
                'name': 'Retail Close', 'department': self.retail,
                'time_in': time(12, 30), 'time_out': time(18, 30),
                'weekdays': [1, 2, 3, 4, 5], 'is_active': True,
            },
        )
        self.reset, _ = Shift.objects.update_or_create(
            punch_code='retail_reset',
            defaults={
                'name': 'Retail Reset', 'department': self.retail,
                'time_in': time(9, 0), 'time_out': time(17, 0),
                'weekdays': [0], 'is_active': True,
            },
        )

    def test_monday_includes_sections_and_omits_open_day_close(self):
        monday = date(2026, 9, 14)
        aisle = Section.objects.create(department=self.retail, name='Housewares')
        self.assertFalse(is_open_day(monday))
        keys, sections = expected_parts(monday)
        self.assertEqual(keys, set())
        self.assertEqual(sections, {aisle.pk})

    def test_tuesday_includes_inactive_day_and_ignores_shift_weekdays(self):
        tuesday = date(2026, 9, 15)
        self.assertTrue(is_open_day(tuesday))
        self.assertEqual(self.open_shift.weekdays, [3])
        keys, _sections = expected_parts(tuesday)
        self.assertEqual(keys, {SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE})

    def test_monday_reset_staff_appear_and_late_applies(self):
        monday = date(2026, 9, 14)
        worker = _staff('reset@example.com')
        ShiftAssignment.objects.create(employee=worker, shift=self.reset, weekdays=[0])
        now = timezone.make_aware(datetime.combine(monday, time(9, 20)), TZ)
        staff = build_staff(monday, now=now, tz=TZ, today=monday)
        row = next(item for item in staff if item['id'] == worker.pk)
        self.assertEqual(row['shift_name'], 'Retail Reset')
        self.assertEqual(row['status'], 'Late')
        self.assertEqual(row['time_in'], '09:00')

    def test_monday_week_tile_is_closed(self):
        monday = date(2026, 9, 14)
        tiles = week_tiles(monday, {}, today=monday, due=None)
        tile = next(row for row in tiles if row['date'] == monday.isoformat())
        self.assertFalse(tile['open'])
        self.assertTrue(tile['graded'])
        sunday = next(row for row in tiles if row['weekday'] == 'Sun')
        self.assertFalse(sunday['open'])
        self.assertFalse(sunday['graded'])
