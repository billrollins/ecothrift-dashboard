from datetime import date, datetime, time
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.hr.models import Department
from apps.routines.grading import (
    section_check_done_label,
    section_owner_people,
    week_grade,
)
from apps.routines.models import Routine, RoutineRun, Section
from apps.routines.schedule import SYSTEM_OPEN, SYSTEM_TALLY

TZ = ZoneInfo('America/Chicago')
MONDAY = date(2026, 9, 14)
TUESDAY = date(2026, 9, 15)
WEDNESDAY = date(2026, 9, 16)
THURSDAY = date(2026, 9, 17)
FRIDAY = date(2026, 9, 18)


def _staff(email, first, last, role='Employee'):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, first_name=first, last_name=last, password='x', is_staff=True,
    )
    user.groups.add(group)
    return user


class SectionCheckDialogTests(TestCase):
    def setUp(self):
        self.retail, _ = Department.objects.get_or_create(
            slug='retail-operations',
            defaults={'name': 'Retail', 'icon': 'cart', 'sort_order': 0},
        )
        self.owner = _staff('sam-section@example.com', 'Sam', 'Owner')
        self.bill = _staff('bill-nosection@example.com', 'Bill', 'Office')
        self.section = Section.objects.create(
            department=self.retail, name='Housewares', owner=self.owner,
        )
        self.tally, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_TALLY,
            defaults={
                'title': 'Section check',
                'kind': Routine.KIND_SECTION_TALLY,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'definition': {'template_version': 1, 'sections': []},
            },
        )
        self.open, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_OPEN,
            defaults={
                'title': 'Opening checklist',
                'kind': Routine.KIND_CHECKLIST,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'definition': {'template_version': 1, 'sections': []},
            },
        )

    def _run(self, routine, day, person, status):
        return RoutineRun.objects.create(
            routine=routine,
            period_key=day.isoformat(),
            assigned_to=person,
            section=self.section if routine.system_key == SYSTEM_TALLY else None,
            due_at=timezone.make_aware(datetime.combine(day, time(10, 0)), TZ),
            status=status,
        )

    @patch('apps.routines.grading.timezone.localdate', return_value=FRIDAY)
    def test_done_matches_dots_and_skips_people_without_a_section(self, _today):
        self._run(self.tally, TUESDAY, self.owner, RoutineRun.STATUS_DONE)
        self._run(self.tally, WEDNESDAY, self.owner, RoutineRun.STATUS_DONE)
        self._run(self.tally, THURSDAY, self.owner, RoutineRun.STATUS_MISSED)
        self._run(self.tally, FRIDAY, self.owner, RoutineRun.STATUS_OPEN)
        for day in (TUESDAY, WEDNESDAY, THURSDAY, FRIDAY):
            self._run(self.open, day, self.bill, RoutineRun.STATUS_DONE)
            self._run(self.open, day, self.owner, RoutineRun.STATUS_DONE)

        week = week_grade(MONDAY)
        people = section_owner_people(week['people'])
        self.assertEqual([row['id'] for row in people], [self.owner.pk])
        self.assertFalse(any(row['id'] == self.bill.pk for row in people))

        row = people[0]
        self.assertEqual(row['section_days'], ['missed', 'done', 'done', 'missed', 'due', 'none', 'none'])
        self.assertEqual(row['done'], 2)
        self.assertEqual(row['assigned'], 4)
        self.assertEqual(row['due_today'], 1)
        self.assertEqual(
            section_check_done_label(row['done'], row['assigned'], row['due_today']),
            '2 of 4 · 1 due today',
        )
        self.assertEqual(sum(1 for status in row['section_days'] if status != 'none'), 5)

    @patch('apps.routines.grading.timezone.localdate', return_value=FRIDAY)
    def test_empty_when_nobody_owns_a_section(self, _today):
        self.section.owner = None
        self.section.save(update_fields=['owner'])
        self._run(self.open, FRIDAY, self.bill, RoutineRun.STATUS_DONE)
        week = week_grade(MONDAY)
        self.assertEqual(section_owner_people(week['people']), [])
