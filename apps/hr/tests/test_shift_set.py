from datetime import time

from django.contrib.auth.models import Group
from django.db import IntegrityError
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import Department, Shift, ShiftAssignment, TimeEntry
from apps.hr.shift_set import apply_shift_set
from apps.hr.tests.test_department_slugs import EXPECTED
from apps.routines.models import Routine


def _employee(email='shift-set@example.com'):
    group, _ = Group.objects.get_or_create(name='Employee')
    user = User.objects.create_user(
        email=email, first_name='Pat', last_name='Lee', password='x',
    )
    user.groups.add(group)
    return user


class ShiftSetTests(APITestCase):
    def setUp(self):
        for name, slug, icon, sort in EXPECTED:
            Department.objects.get_or_create(
                slug=slug,
                defaults={'name': name, 'icon': icon, 'sort_order': sort},
            )

    def test_four_slugs_resolve(self):
        apply_shift_set()
        for name, slug, icon, sort in EXPECTED:
            row = Department.objects.get(slug=slug)
            self.assertEqual((row.name, row.icon, row.sort_order), (name, icon, sort))

    def test_seeds_seven_rows_with_exact_clocks(self):
        apply_shift_set()
        by_code = {row.punch_code: row for row in Shift.objects.filter(punch_code__in={
            'retail_open', 'retail_day', 'retail_close', 'retail_reset',
            'processing', 'restoration', 'office',
        })}
        self.assertEqual(len(by_code), 7)
        open_row = by_code['retail_open']
        self.assertEqual(open_row.time_in, time(8, 30))
        self.assertEqual(open_row.time_out, time(14, 30))
        self.assertEqual(open_row.weekdays, [1, 2, 3, 4, 5])
        self.assertTrue(open_row.is_active)
        day = by_code['retail_day']
        self.assertEqual(day.time_in, time(11, 0))
        self.assertEqual(day.time_out, time(19, 0))
        self.assertFalse(day.is_active)
        close = by_code['retail_close']
        self.assertEqual(close.time_in, time(12, 30))
        self.assertEqual(close.time_out, time(18, 30))
        reset = by_code['retail_reset']
        self.assertEqual(reset.weekdays, [0])
        self.assertEqual(reset.name, 'Retail - Reset')

    def test_existing_row_keeps_its_name(self):
        apply_shift_set()
        row = Shift.objects.get(punch_code='retail_open')
        row.name = 'Floor Open'
        row.time_in = time(9, 0)
        row.save(update_fields=['name', 'time_in'])
        apply_shift_set()
        row.refresh_from_db()
        self.assertEqual(row.name, 'Floor Open')
        self.assertEqual(row.time_in, time(8, 30))
        self.assertEqual(row.time_out, time(14, 30))

    def test_unique_punch_code_rejects_a_duplicate(self):
        apply_shift_set()
        retail = Department.objects.get(slug='retail-operations')
        with self.assertRaises(IntegrityError):
            Shift.objects.create(
                department=retail, name='Another Open', punch_code='retail_open',
                time_in=time(8, 0), time_out=time(12, 0), weekdays=[1],
            )

    def test_deletes_unused_shift_without_punches_or_assignments(self):
        retail = Department.objects.get(slug='retail-operations')
        leftover = Shift.objects.create(
            department=retail, name='Ghost', punch_code='retail_ghost',
            time_in=time(9, 0), time_out=time(17, 0), weekdays=[1],
        )
        apply_shift_set()
        self.assertFalse(Shift.objects.filter(pk=leftover.pk).exists())

    def test_keeps_leftover_with_a_punch_and_does_not_touch_it(self):
        retail = Department.objects.get(slug='retail-operations')
        leftover = Shift.objects.create(
            department=retail, name='Customer Service', punch_code='retail_cs',
            time_in=time(9, 0), time_out=time(17, 0), weekdays=[1],
        )
        user = _employee()
        now = timezone.now()
        entry = TimeEntry.objects.create(
            employee=user, clock_in=now, clock_out=now, shift='retail_cs',
        )
        apply_shift_set()
        self.assertTrue(Shift.objects.filter(pk=leftover.pk).exists())
        entry.refresh_from_db()
        self.assertEqual(entry.shift, 'retail_cs')

    def test_keeps_leftover_with_assignments_and_no_punches(self):
        retail = Department.objects.get(slug='retail-operations')
        leftover = Shift.objects.create(
            department=retail, name='Inventory', punch_code='retail_inventory',
            time_in=time(9, 0), time_out=time(17, 0), weekdays=[0],
        )
        ShiftAssignment.objects.create(
            employee=_employee('inv@example.com'), shift=leftover, weekdays=[0],
        )
        apply_shift_set()
        self.assertTrue(Shift.objects.filter(pk=leftover.pk).exists())

    def test_relocks_open_day_close(self):
        apply_shift_set()
        for key, punch in (
            ('retail.open', 'retail_open'),
            ('retail.day', 'retail_day'),
            ('retail.close', 'retail_close'),
        ):
            routine, _ = Routine.objects.get_or_create(
                system_key=key,
                defaults={
                    'title': key, 'kind': 'checklist', 'trigger': 'daily',
                    'definition': {'template_version': 1, 'sections': []},
                },
            )
        apply_shift_set()
        for key, punch in (
            ('retail.open', 'retail_open'),
            ('retail.day', 'retail_day'),
            ('retail.close', 'retail_close'),
        ):
            routine = Routine.objects.get(system_key=key)
            self.assertEqual(routine.shift.punch_code, punch)
            self.assertTrue(routine.shift_locked)
