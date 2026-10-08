"""A superuser forgives or marks done a missed routine; no nudge on a missed run (owner, 2026-10-08)."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import User

from .command_center import ResolveError, miss_fields, resolve_missed_run
from .grading import _people_for_week
from .models import Routine, RoutineRun
from .schedule import SYSTEM_CROSS_CHECK, SYSTEM_OPEN

TZ = ZoneInfo('America/Chicago')
DUE = datetime(2026, 10, 5, 9, 0, tzinfo=TZ)
LATER = datetime(2026, 10, 6, 9, 0, tzinfo=TZ)


def _staff(email, role, *, superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, password='x', first_name=role, last_name='X', is_staff=True, is_superuser=superuser,
    )
    user.groups.add(group)
    return user


class ResolveMissedTests(APITestCase):
    def setUp(self):
        self.routine, _ = Routine.objects.get_or_create(system_key=SYSTEM_OPEN, defaults={'title': 'Open checklist'})
        self.who = _staff('w@example.com', 'Employee')
        self.owner = _staff('o@example.com', 'Admin', superuser=True)
        self.manager = _staff('m@example.com', 'Manager')
        self.run = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-10-05', due_at=DUE, assigned_to=self.who,
            status=RoutineRun.STATUS_MISSED, miss_reason='forgot',
        )

    def test_only_a_superuser_can_clear_a_run(self):
        self.client.force_authenticate(self.manager)
        res = self.client.post(f'/api/routines/qa/runs/{self.run.pk}/resolve/', {'kind': 'done'}, format='json')
        self.assertEqual(res.status_code, 403)
        self.client.force_authenticate(self.owner)
        res = self.client.post(f'/api/routines/qa/runs/{self.run.pk}/resolve/', {'kind': 'done', 'note': 'Saw it done'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, RoutineRun.STATUS_DONE)
        self.assertEqual(self.run.completed_at, DUE)  # on time
        self.assertEqual(self.run.generated['resolved']['kind'], 'done')
        self.assertEqual(self.run.generated['resolved']['note'], 'Saw it done')
        self.assertEqual(miss_fields(self.run)['resolved'], {'kind': 'done', 'label': 'Marked done', 'by_name': 'Admin X'})
        again = self.client.post(f'/api/routines/qa/runs/{self.run.pk}/resolve/', {'kind': 'forgiven'}, format='json')
        self.assertEqual(again.status_code, 400)

    def test_marked_done_counts_for_the_person_and_forgiven_counts_for_no_one(self):
        resolve_missed_run(self.run, kind='done', by=self.owner, now=LATER)
        rows = {row['id']: row for row in _people_for_week(date(2026, 10, 5), [], [self.run])}
        self.assertEqual((rows[self.who.pk]['assigned'], rows[self.who.pk]['done'], rows[self.who.pk]['missed']), (1, 1, 0))
        other = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-10-06', due_at=LATER, assigned_to=self.who,
            status=RoutineRun.STATUS_MISSED,
        )
        resolve_missed_run(other, kind='forgiven', by=self.owner, now=datetime(2026, 10, 7, 9, 0, tzinfo=TZ))
        rows = {row['id']: row for row in _people_for_week(date(2026, 10, 5), [], [self.run, other])}
        self.assertEqual((rows[self.who.pk]['assigned'], rows[self.who.pk]['done'], rows[self.who.pk]['missed']), (1, 1, 0))

    def test_the_rules(self):
        with self.assertRaises(ResolveError):
            resolve_missed_run(self.run, kind='maybe', by=self.owner, now=LATER)
        future = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-10-09', due_at=datetime(2026, 10, 9, 9, 0, tzinfo=TZ),
            assigned_to=self.who,
        )
        with self.assertRaises(ResolveError):
            resolve_missed_run(future, kind='done', by=self.owner, now=LATER)
        cross = RoutineRun.objects.create(
            routine=Routine.objects.get_or_create(system_key=SYSTEM_CROSS_CHECK, defaults={'title': 'Cross check'})[0],
            period_key='2026-10-05',
            due_at=DUE, assigned_to=self.owner, status=RoutineRun.STATUS_MISSED,
        )
        with self.assertRaises(ResolveError):
            resolve_missed_run(cross, kind='forgiven', by=self.owner, now=LATER)


class MissedIssueTests(TestCase):
    def test_a_missed_run_asks_for_a_clear_not_a_nudge(self):
        from .command_center import STATUS_MISSED, build_issues

        job = {'status': STATUS_MISSED, 'run_id': 7, 'title': 'Open checklist', 'owner': {'id': 3, 'name': 'Sam'}}
        issues = build_issues(
            day=date(2026, 10, 5), open_day=True, staff=[], jobs=[job], spot={}, cross={}, nudges={},
            now=LATER, tz=TZ, hours_cfg=None, today=date(2026, 10, 6),
        )
        row = next(item for item in issues if item.get('run_id') == 7)
        self.assertEqual(row['action'], 'resolve_missed')
        self.assertIsNone(row['nudged_at'])
