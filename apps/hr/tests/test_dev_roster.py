from datetime import date
from io import StringIO

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.dev_roster import apply_dev_roster
from apps.hr.models import Department, Shift, ShiftAssignment
from apps.hr.shift_set import apply_shift_set
from apps.routines.models import Section


def _staff(email, first='Pat', last='Lee'):
    group, _ = Group.objects.get_or_create(name='Employee')
    user = User.objects.create_user(
        email=email, first_name=first, last_name=last, password='x', is_staff=True,
    )
    user.groups.add(group)
    return user


class DevRosterTests(APITestCase):
    def setUp(self):
        apply_shift_set()
        self.retail = Department.objects.get(slug='retail-operations')

    @override_settings(DEBUG=False)
    def test_refuses_when_debug_is_false(self):
        with self.assertRaises(CommandError):
            call_command('seed_dev_roster')

    def test_missing_email_is_skipped(self):
        stats = apply_dev_roster()
        self.assertIn('carrie_rollins.rf@outlook.com', stats['skipped'])
        self.assertEqual(ShiftAssignment.objects.count(), 0)

    def test_second_run_does_not_duplicate_and_carrie_close_is_thursday(self):
        carrie = _staff('carrie_rollins.rf@outlook.com', 'Carrie', 'Rollins')
        apply_dev_roster()
        apply_dev_roster()
        rows = list(ShiftAssignment.objects.filter(employee=carrie).select_related('shift'))
        self.assertEqual(len(rows), 3)
        close = next(row for row in rows if row.shift.punch_code == 'retail_close')
        self.assertEqual(close.weekdays, [3])

    def test_blank_section_owner_is_filled_preset_is_left(self):
        carrie = _staff('carrie_rollins.rf@outlook.com', 'Carrie', 'Rollins')
        david = _staff('davidkilduff@outlook.com', 'David', 'Kilduff')
        other = _staff('other-section@example.com', 'Other', 'Owner')
        blank = Section.objects.create(department=self.retail, name='Carrie')
        preset = Section.objects.create(department=self.retail, name='David', owner=other)
        apply_dev_roster()
        blank.refresh_from_db()
        preset.refresh_from_db()
        self.assertEqual(blank.owner_id, carrie.pk)
        self.assertEqual(preset.owner_id, other.pk)

    def test_department_managers_are_set(self):
        carrie = _staff('carrie_rollins.rf@outlook.com', 'Carrie', 'Rollins')
        ashley = _staff('kilduff.ashleym@outlook.com', 'Ashley', 'Kilduff')
        michael = _staff('zatoichi82frieze@gmail.com', 'Michael', 'Frieze')
        apply_dev_roster()
        self.assertEqual(Department.objects.get(slug='retail-operations').manager_id, carrie.pk)
        self.assertEqual(Department.objects.get(slug='processing').manager_id, ashley.pk)
        self.assertEqual(Department.objects.get(slug='restoration').manager_id, michael.pk)
        self.assertIsNone(Department.objects.get(slug='office').manager_id)

    def test_unmapped_assignments_stay(self):
        extra = _staff('unmapped@example.com', 'Un', 'Mapped')
        EmployeeProfile.objects.create(
            user=extra,
            employee_number=EmployeeProfile.generate_employee_number(),
            hire_date=date(2020, 1, 1),
        )
        reset = Shift.objects.get(punch_code='retail_reset')
        ShiftAssignment.objects.create(employee=extra, shift=reset, weekdays=[0])
        apply_dev_roster()
        self.assertTrue(
            ShiftAssignment.objects.filter(employee=extra, shift=reset).exists(),
        )

    @override_settings(DEBUG=True)
    def test_command_runs_when_debug_is_true(self):
        _staff('bill_rollins@ecothrift.us', 'Bill', 'Rollins')
        out = StringIO()
        call_command('seed_dev_roster', stdout=out)
        self.assertIn('Seeded', out.getvalue())
        self.assertTrue(
            ShiftAssignment.objects.filter(
                employee__email='bill_rollins@ecothrift.us',
                shift__punch_code='office',
            ).exists(),
        )
