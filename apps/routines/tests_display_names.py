import importlib
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from django.apps import apps
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import Department, Shift, ShiftAssignment
from apps.routines.models import Routine
from apps.routines.program import PROGRAM_TITLES, apply_program
from apps.routines.schedule import SYSTEM_OPEN

routine_mig = importlib.import_module('apps.routines.migrations.0021_routine_display_names')
RENAMES = routine_mig.RENAMES
rename_routines = routine_mig.apply


TZ = ZoneInfo('America/Chicago')


def _staff(email, role='Employee'):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, password='x', first_name='Sam', last_name='Lee',
        is_staff=True,
    )
    user.groups.add(group)
    return user


class RoutineDisplayNameTests(TestCase):
    def test_routine_migration_renames_seeded_names_and_leaves_custom(self):
        for key, (old_names, new_name) in RENAMES.items():
            row, _ = Routine.objects.update_or_create(
                system_key=key,
                defaults={
                    'title': old_names[0],
                    'kind': Routine.KIND_CHECKLIST,
                    'trigger': Routine.TRIGGER_DAILY,
                    'definition': {'template_version': 1, 'sections': []},
                },
            )
            row.title = old_names[0]
            row.save(update_fields=['title'])
        rename_routines(apps, None)
        for key, (_old_names, new_name) in RENAMES.items():
            self.assertEqual(Routine.objects.get(system_key=key).title, new_name)

        custom = Routine.objects.get(system_key='retail.open')
        custom.title = 'Front door list'
        custom.save(update_fields=['title'])
        rename_routines(apps, None)
        custom.refresh_from_db()
        self.assertEqual(custom.title, 'Front door list')

    def test_apply_program_on_fresh_rows_uses_new_titles(self):
        Routine.objects.filter(system_key__in=PROGRAM_TITLES).delete()
        for key in PROGRAM_TITLES:
            Routine.objects.create(
                system_key=key,
                title='tmp',
                kind=Routine.KIND_CHECKLIST,
                trigger=Routine.TRIGGER_DAILY,
                definition={'template_version': 1, 'sections': []},
            )
        apply_program(Routine)
        for key, (title, _intro) in PROGRAM_TITLES.items():
            self.assertEqual(Routine.objects.get(system_key=key).title, title)


class LateIssueDisplayNameTests(APITestCase):
    def test_late_person_issue_reads_retail_open(self):
        from apps.routines.command_center import today_payload

        department, _ = Department.objects.get_or_create(
            slug='retail-operations',
            defaults={'name': 'Retail', 'icon': 'cart'},
        )
        shift, _ = Shift.objects.update_or_create(
            punch_code='retail_open',
            defaults={
                'name': 'Retail Open',
                'department': department,
                'time_in': time(8, 30),
                'time_out': time(15, 0),
                'weekdays': [1, 2, 3, 4, 5],
                'is_active': True,
            },
        )
        shift.name = 'Retail Open'
        shift.save(update_fields=['name'])
        sam = _staff('late-open@example.com')
        ShiftAssignment.objects.get_or_create(
            employee=sam, shift=shift, defaults={'weekdays': [1, 2, 3, 4, 5]},
        )
        Routine.objects.update_or_create(
            system_key=SYSTEM_OPEN,
            defaults={
                'title': 'Opening checklist',
                'kind': Routine.KIND_CHECKLIST,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'due_time': time(9, 0),
            },
        )
        day = date(2026, 9, 16)
        now = timezone.make_aware(datetime.combine(day, time(8, 55)), TZ)
        payload = today_payload(day, now=now)
        sentences = [row['sentence'] for row in payload['issues']]
        self.assertTrue(
            any('late for Retail Open' in sentence for sentence in sentences),
            sentences,
        )
