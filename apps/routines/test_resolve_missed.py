"""A superuser forgives or marks done any missed routine; both score as done; no nudge on a missed run (owner, 2026-10-08)."""
from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import User

from apps.hr.models import Department

from .command_center import ResolveError, miss_fields, resolve_board_job, resolve_missed_run
from .grading import _cross_for_day, _owner_for_day, _people_for_week, retail_qa_settings
from .models import Routine, RoutineRun, Section
from .schedule import SYSTEM_CLOSE, SYSTEM_CROSS_CHECK, SYSTEM_OPEN, SYSTEM_OWNER_SPOT, SYSTEM_TALLY

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

    def test_marked_done_and_forgiven_both_count_as_done_for_the_person(self):
        resolve_missed_run(self.run, kind='done', by=self.owner, now=LATER)
        rows = {row['id']: row for row in _people_for_week(date(2026, 10, 5), [], [self.run])}
        self.assertEqual((rows[self.who.pk]['assigned'], rows[self.who.pk]['done'], rows[self.who.pk]['missed']), (1, 1, 0))
        other = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-10-06', due_at=LATER, assigned_to=self.who,
            status=RoutineRun.STATUS_MISSED,
        )
        resolve_missed_run(other, kind='forgiven', by=self.owner, now=datetime(2026, 10, 7, 9, 0, tzinfo=TZ))
        rows = {row['id']: row for row in _people_for_week(date(2026, 10, 5), [], [self.run, other])}
        self.assertEqual((rows[self.who.pk]['assigned'], rows[self.who.pk]['done'], rows[self.who.pk]['missed']), (2, 2, 0))
        self.assertEqual(rows[self.who.pk]['late'], 0)

    def test_the_rules(self):
        with self.assertRaises(ResolveError):
            resolve_missed_run(self.run, kind='maybe', by=self.owner, now=LATER)
        future = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-10-09', due_at=datetime(2026, 10, 9, 9, 0, tzinfo=TZ),
            assigned_to=self.who,
        )
        with self.assertRaises(ResolveError):
            resolve_missed_run(future, kind='done', by=self.owner, now=LATER)
        with self.assertRaises(ResolveError):
            resolve_board_job(date(2026, 10, 5), key='nothing', kind='done', by=self.owner, now=LATER)

    def test_a_cleared_cross_check_and_spot_walk_score_as_clean(self):
        cross = RoutineRun.objects.create(
            routine=Routine.objects.get_or_create(system_key=SYSTEM_CROSS_CHECK, defaults={'title': 'Cross check'})[0],
            period_key='2026-10-05', subject='Housewares',
            due_at=DUE, assigned_to=self.who, status=RoutineRun.STATUS_MISSED,
        )
        spot = RoutineRun.objects.create(
            routine=Routine.objects.get_or_create(system_key=SYSTEM_OWNER_SPOT, defaults={'title': 'Spot walk'})[0],
            period_key='2026-10-05', subject='Toys', due_at=DUE, assigned_to=self.owner,
        )
        cfg = retail_qa_settings()
        self.assertEqual(_cross_for_day(date(2026, 10, 5), [cross], cfg, {})['audits'][0]['score'], 0.0)
        resolve_missed_run(cross, kind='forgiven', by=self.owner, now=LATER)
        resolve_missed_run(spot, kind='done', by=self.owner, now=LATER)
        audit = _cross_for_day(date(2026, 10, 5), [cross], cfg, {})['audits'][0]
        self.assertEqual((audit['score'], audit['status'], audit['resolved']), (100.0, 'done', 'forgiven'))
        owner = _owner_for_day(date(2026, 10, 5), [spot], cfg, {})
        self.assertEqual((owner['score'], owner['spots'][0]['resolved']), (100.0, 'done'))

    def test_a_board_row_with_no_run_is_cleared_by_what_it_is(self):
        department = Department.objects.create(name='Resolve Desk')
        aisle = Section.objects.create(department=department, name='Housewares', owner=self.who)
        Routine.objects.get_or_create(system_key=SYSTEM_TALLY, defaults={'title': 'Section check'})
        Routine.objects.get_or_create(system_key=SYSTEM_CLOSE, defaults={'title': 'Closing checklist'})
        run = resolve_board_job(date(2026, 10, 5), key=SYSTEM_TALLY, section_id=aisle.pk, kind='forgiven',
                                by=self.owner, now=LATER)
        self.assertTrue(run.section_scoped)
        self.assertEqual((run.section_id, run.assigned_to_id, run.status), (aisle.pk, self.who.pk, RoutineRun.STATUS_DONE))
        close = resolve_board_job(date(2026, 10, 5), key=SYSTEM_CLOSE, kind='done', by=self.owner, now=LATER)
        self.assertEqual((close.routine.system_key, close.status), (SYSTEM_CLOSE, RoutineRun.STATUS_DONE))
        self.client.force_authenticate(self.owner)
        res = self.client.post('/api/routines/qa/resolve/', {'date': '2026-10-05', 'key': SYSTEM_OPEN, 'kind': 'done'},
                               format='json')
        self.assertEqual(res.status_code, 200, res.data)  # the open checklist's run from setUp
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, RoutineRun.STATUS_DONE)
        self.client.force_authenticate(self.manager)
        res = self.client.post('/api/routines/qa/resolve/', {'date': '2026-10-05', 'key': SYSTEM_CLOSE, 'kind': 'done'},
                               format='json')
        self.assertEqual(res.status_code, 403)


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
