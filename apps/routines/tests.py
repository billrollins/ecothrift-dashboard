"""Routines definition, schedule, and API."""
from datetime import date, datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.core.models import AppSetting
from apps.hr.models import Department

from .definition import build_responses, merge_responses, score_responses, validate_definition
from .grading import audit_score, day_grade, parse_week, score_run, week_grade
from .kinds import outcome, submit_blockers
from .models import Routine, RoutineRun, RoutineSubmission, Section, WorkCyclePrompt
from .settings import letter_for, retail_qa_settings
from .schedule import (
    SYSTEM_CLOSE,
    SYSTEM_CROSS_CHECK,
    SYSTEM_DAY,
    SYSTEM_OPEN,
    SYSTEM_OWNER_SPOT,
    SYSTEM_TALLY,
    SYSTEM_WORK_CYCLE,
    biweekly_period_start,
    due_at_for,
    is_overdue,
    materialize_routines,
    period_key_for,
    run_moments,
    should_run_on,
    subject_for,
    was_late,
)

User = get_user_model()
TZ = ZoneInfo('America/Chicago')

DEFINITION = {
    'template_version': 1,
    'sections': [{
        'id': 'floor',
        'title': 'Floor',
        'checks': [
            {'id': 'swept', 'label': 'Swept', 'control': 'pass_fail'},
            {'id': 'count', 'label': 'Count', 'control': 'number', 'unit': 'pcs', 'critical': True},
        ],
    }],
}


def _staff(email, role='Employee', *, superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email,
        password='x',
        first_name=role,
        last_name=email.split('@')[0],
        is_staff=True,
        is_superuser=superuser,
    )
    user.groups.add(group)
    return user


class DefinitionTests(TestCase):
    def test_rejects_unknown_control(self):
        errors = validate_definition({
            'sections': [{'id': 's', 'title': 'S', 'checks': [
                {'id': 'c', 'label': 'C', 'control': 'grade'},
            ]}],
        })
        self.assertTrue(errors)

    def test_merge_keeps_answers_and_adds_new_checks(self):
        responses = build_responses(DEFINITION)
        responses['sections'][0]['checks'][0]['result'] = 'pass'
        expanded = {
            'template_version': 1,
            'sections': [{
                'id': 'floor',
                'title': 'Floor',
                'checks': [
                    {'id': 'swept', 'label': 'Swept', 'control': 'pass_fail'},
                    {'id': 'count', 'label': 'Count', 'control': 'number', 'unit': 'pcs'},
                    {'id': 'lights', 'label': 'Lights', 'control': 'pass_fail'},
                ],
            }],
        }
        merged = merge_responses(expanded, responses)
        ids = [check['id'] for check in merged['sections'][0]['checks']]
        self.assertEqual(ids, ['swept', 'count', 'lights'])
        self.assertEqual(merged['sections'][0]['checks'][0]['result'], 'pass')
        self.assertEqual(merged['sections'][0]['checks'][2]['result'], '')

    def test_score_critical_fail(self):
        responses = build_responses(DEFINITION)
        responses['sections'][0]['checks'][0]['result'] = 'fail'
        responses['sections'][0]['checks'][0]['critical'] = True
        responses['sections'][0]['checks'][1]['value'] = 3
        failed, critical, unanswered = score_responses(responses)
        self.assertEqual(failed, 1)
        self.assertTrue(critical)
        self.assertEqual(unanswered, [])


class ScheduleTests(TestCase):
    def test_period_keys(self):
        day = date(2026, 9, 1)
        daily = Routine(trigger=Routine.TRIGGER_DAILY)
        weekly = Routine(trigger=Routine.TRIGGER_WEEKLY)
        monthly = Routine(trigger=Routine.TRIGGER_MONTHLY)
        quarterly = Routine(trigger=Routine.TRIGGER_QUARTERLY)
        annual = Routine(trigger=Routine.TRIGGER_ANNUAL)
        biweekly = Routine(trigger=Routine.TRIGGER_BIWEEKLY, anchor_date=date(2026, 9, 8))
        self.assertEqual(period_key_for(daily, day), '2026-09-01')
        self.assertEqual(period_key_for(weekly, day), '2026-W36')
        self.assertEqual(period_key_for(monthly, day), '2026-09')
        self.assertEqual(period_key_for(quarterly, day), '2026-Q3')
        self.assertEqual(period_key_for(annual, day), '2026')
        self.assertEqual(period_key_for(biweekly, date(2026, 9, 8)), '2026-09-08')
        self.assertEqual(period_key_for(biweekly, date(2026, 9, 20)), '2026-09-08')
        self.assertEqual(period_key_for(biweekly, date(2026, 9, 22)), '2026-09-22')

    def test_closed_sunday_does_not_run_daily(self):
        routine = Routine(trigger=Routine.TRIGGER_DAILY, weekdays=[])
        self.assertFalse(should_run_on(routine, date(2026, 8, 30)))  # Sunday
        self.assertFalse(should_run_on(routine, date(2026, 8, 31)))  # Monday
        self.assertTrue(should_run_on(routine, date(2026, 9, 1)))  # Tuesday

    def test_biweekly_indexes_from_next_due(self):
        routine = Routine(trigger=Routine.TRIGGER_BIWEEKLY, anchor_date=date(2026, 9, 8))
        self.assertIsNone(biweekly_period_start(date(2026, 9, 8), date(2026, 9, 1)))
        self.assertFalse(should_run_on(routine, date(2026, 9, 1)))
        self.assertTrue(should_run_on(routine, date(2026, 9, 8)))
        self.assertTrue(should_run_on(routine, date(2026, 9, 12)))
        due = due_at_for(routine, date(2026, 9, 12), tz=TZ)
        self.assertEqual(due.date(), date(2026, 9, 8))

    def test_weekly_due_last_open_day(self):
        routine = Routine(trigger=Routine.TRIGGER_WEEKLY, due_time=time(17, 0))
        due = due_at_for(routine, date(2026, 9, 1), tz=TZ)
        self.assertEqual(due.date(), date(2026, 9, 5))  # Saturday; Sunday closed

    def test_subject_draw_is_deterministic(self):
        routine = Routine(pk=7, subject_pool=['A', 'B', 'C'])
        first = subject_for(routine, '2026-W36', 3)
        second = subject_for(routine, '2026-W36', 3)
        self.assertEqual(first, second)
        self.assertIn(first, {'A', 'B', 'C'})


class NagMomentTests(TestCase):
    """The three instants that decide how loud a run is allowed to get."""

    def _run(self, **routine_kwargs) -> RoutineRun:
        fields = {
            'trigger': Routine.TRIGGER_DAILY,
            'due_time': time(17, 50),
            'late_after': Routine.LATE_END_OF_DAY,
            **routine_kwargs,
        }
        routine = Routine(**fields)
        due = due_at_for(routine, date(2026, 9, 1), tz=TZ)
        run = RoutineRun(routine=routine, due_at=due, status=RoutineRun.STATUS_OPEN)
        return run

    def test_remind_falls_back_to_the_top_of_the_day(self):
        moments = run_moments(self._run())
        self.assertEqual(timezone.localtime(moments['remind_at']).time(), time(0, 0))

    def test_hard_nag_is_the_due_time_and_late_is_end_of_day(self):
        moments = run_moments(self._run(remind_time=time(9, 0)))
        local = {key: timezone.localtime(value) if value else None for key, value in moments.items()}
        self.assertEqual(local['remind_at'].time(), time(9, 0))
        self.assertEqual(local['nag_at'].time(), time(17, 50))
        self.assertEqual(local['late_at'].time(), time(23, 59))

    def test_clock_out_run_has_no_hard_nag(self):
        run = self._run(due_time=None, remind_time=time(9, 0))
        moments = run_moments(run)
        self.assertIsNone(moments['nag_at'])
        self.assertEqual(timezone.localtime(moments['late_at']).time(), time(23, 59))
        # Still open at 8pm is fine; the same run the next morning is not.
        self.assertFalse(is_overdue(run, now=timezone.make_aware(
            datetime(2026, 9, 1, 20, 0), TZ,
        )))
        self.assertTrue(is_overdue(run, now=timezone.make_aware(
            datetime(2026, 9, 2, 9, 0), TZ,
        )))

    def test_late_after_due_time_bites_immediately(self):
        run = self._run(late_after=Routine.LATE_DUE)
        self.assertEqual(run_moments(run)['late_at'], run_moments(run)['nag_at'])
        self.assertTrue(is_overdue(run, now=timezone.make_aware(
            datetime(2026, 9, 1, 18, 0), TZ,
        )))

    def test_grace_days_rule_reads_the_grace_field(self):
        run = self._run(late_after=Routine.LATE_GRACE, grace_days=2)
        self.assertEqual(
            timezone.localtime(run_moments(run)['late_at']).date(), date(2026, 9, 3),
        )

    def test_deadline_never_lands_before_the_nag_that_guards_it(self):
        run = self._run(due_time=time(23, 59), late_after=Routine.LATE_DUE, remind_time=time(23, 59))
        moments = run_moments(run)
        self.assertEqual(moments['late_at'], moments['nag_at'])
        self.assertLessEqual(moments['remind_at'], moments['nag_at'])

    def test_finished_run_is_late_only_past_its_deadline(self):
        run = self._run()
        run.status = RoutineRun.STATUS_DONE
        run.completed_at = timezone.make_aware(datetime(2026, 9, 1, 19, 0), TZ)
        self.assertFalse(was_late(run))
        run.completed_at = timezone.make_aware(datetime(2026, 9, 2, 8, 0), TZ)
        self.assertTrue(was_late(run))


class RoutineApiTests(APITestCase):
    def setUp(self):
        self.employee = _staff('emp@example.com')
        self.other = _staff('other@example.com')
        self.owner = _staff('owner@example.com', 'Admin', superuser=True)
        self.routine = Routine.objects.create(
            title='Close checklist',
            intro='Walk the floor.',
            definition=DEFINITION,
            trigger=Routine.TRIGGER_DAILY,
            due_time=time(17, 0),
            assignment=Routine.ASSIGN_POOLED,
            assigned_role='Staff',
            is_blocking=True,
            created_by=self.owner,
        )
        # The Retail QA program ships seeded and live. These cases are about the
        # engine, so park it and count only the routine under test.
        Routine.objects.exclude(pk=self.routine.pk).update(is_active=False)

    def test_biweekly_requires_next_due_date(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post('/api/routines/routines/', {
            'title': 'Every other Tuesday',
            'definition': DEFINITION,
            'trigger': 'biweekly',
            'due_time': '10:30:00',
            'assignment': 'pooled',
            'assigned_role': 'Staff',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        created = self.client.post('/api/routines/routines/', {
            'title': 'Every other Tuesday',
            'definition': DEFINITION,
            'trigger': 'biweekly',
            'anchor_date': '2026-09-08',
            'due_time': '10:30:00',
            'assignment': 'pooled',
            'assigned_role': 'Staff',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['anchor_date'], '2026-09-08')

    def test_employee_cannot_create_routine(self):
        self.client.force_authenticate(self.employee)
        response = self.client.post('/api/routines/routines/', {
            'title': 'Nope',
            'definition': DEFINITION,
            'trigger': 'daily',
            'due_time': '17:00:00',
            'assignment': 'pooled',
            'assigned_role': 'Staff',
        }, format='json')
        self.assertEqual(response.status_code, 403)

    def _open_tuesday_now(self):
        return (
            timezone.make_aware(datetime(2026, 9, 1, 9, 0), TZ),
            {'closed_weekdays': [0, 6], 'timezone': 'America/Chicago'},
            TZ,
        )

    def test_superuser_creates_and_materialize_pooled(self):
        created = materialize_routines(date(2026, 9, 1))
        self.assertEqual(created, 1)
        run = RoutineRun.objects.get()
        self.assertIsNone(run.assigned_to_id)
        self.assertEqual(run.period_key, '2026-09-01')
        again = materialize_routines(date(2026, 9, 1))
        self.assertEqual(again, 0)
        self.routine.due_time = time(10, 30)
        self.routine.save(update_fields=['due_time'])
        materialize_routines(date(2026, 9, 1))
        run.refresh_from_db()
        self.assertEqual(run.due_at.astimezone(TZ).hour, 10)
        self.assertEqual(run.due_at.astimezone(TZ).minute, 30)

    def test_saving_a_routine_creates_todays_run(self):
        self.client.force_authenticate(self.owner)
        with patch('apps.routines.schedule._local_now', return_value=self._open_tuesday_now()):
            response = self.client.post('/api/routines/routines/', {
                'title': 'Opening',
                'definition': DEFINITION,
                'trigger': 'daily',
                'due_time': '10:30:00',
                'assignment': 'pooled',
                'assigned_role': 'Staff',
            }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(
            RoutineRun.objects.filter(routine_id=response.data['id'], period_key='2026-09-01').exists()
        )

    def test_mine_materializes_open_runs(self):
        self.client.force_authenticate(self.employee)
        self.assertEqual(RoutineRun.objects.count(), 0)
        with patch('apps.routines.schedule._local_now', return_value=self._open_tuesday_now()):
            mine = self.client.get('/api/routines/runs/mine/')
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.data['open']), 1)

    def test_mine_and_submit_closes_pooled_run(self):
        with patch('apps.routines.schedule._local_now', return_value=self._open_tuesday_now()):
            materialize_routines(date(2026, 9, 1))
            run = RoutineRun.objects.get()
            self.client.force_authenticate(self.employee)
            mine = self.client.get('/api/routines/runs/mine/')
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(len(mine.data['open']), 1)

        created = self.client.post('/api/routines/submissions/', {
            'routine': self.routine.pk,
            'run': run.pk,
        }, format='json')
        self.assertEqual(created.status_code, 201)
        responses = created.data['responses']
        responses['sections'][0]['checks'][0]['result'] = 'pass'
        responses['sections'][0]['checks'][1]['value'] = 4
        submitted = self.client.post(
            f'/api/routines/submissions/{created.data["id"]}/submit/',
            {'responses': responses},
            format='json',
        )
        self.assertEqual(submitted.status_code, 200, submitted.data)
        run.refresh_from_db()
        self.assertEqual(run.status, RoutineRun.STATUS_DONE)
        self.assertEqual(run.completed_by_id, self.employee.pk)
        mine_after = self.client.get('/api/routines/runs/mine/')
        self.assertNotIn(run.pk, [row['id'] for row in mine_after.data['open']])
        self.assertEqual(len(mine_after.data['done']), 1)

        self.client.force_authenticate(self.other)
        second = self.client.post('/api/routines/submissions/', {
            'routine': self.routine.pk,
            'run': run.pk,
        }, format='json')
        self.assertEqual(second.status_code, 400)

    def test_superuser_can_start_a_pooled_run_they_are_not_assigned_to(self):
        self.routine.assigned_department_id = None
        self.routine.assigned_role = 'Employee'
        self.routine.save(update_fields=['assigned_role'])
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get()
        self.client.force_authenticate(self.owner)
        created = self.client.post('/api/routines/submissions/', {
            'routine': self.routine.pk,
            'run': run.pk,
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)

    def test_unanswered_cannot_submit(self):
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get()
        self.client.force_authenticate(self.employee)
        created = self.client.post('/api/routines/submissions/', {
            'routine': self.routine.pk,
            'run': run.pk,
        }, format='json')
        rejected = self.client.post(
            f'/api/routines/submissions/{created.data["id"]}/submit/',
            {'responses': created.data['responses']},
            format='json',
        )
        self.assertEqual(rejected.status_code, 400)
        run.refresh_from_db()
        self.assertEqual(run.status, RoutineRun.STATUS_OPEN)

    def test_editing_routine_updates_pending_draft(self):
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get()
        self.client.force_authenticate(self.employee)
        created = self.client.post('/api/routines/submissions/', {
            'routine': self.routine.pk,
            'run': run.pk,
        }, format='json')
        self.assertEqual(len(created.data['responses']['sections'][0]['checks']), 2)
        created.data['responses']['sections'][0]['checks'][0]['result'] = 'pass'
        self.client.patch(
            f'/api/routines/submissions/{created.data["id"]}/',
            {'responses': created.data['responses']},
            format='json',
        )
        expanded = {
            'template_version': 1,
            'sections': [{
                'id': 'floor',
                'title': 'Floor',
                'checks': [
                    {'id': 'swept', 'label': 'Swept', 'control': 'pass_fail'},
                    {'id': 'count', 'label': 'Count', 'control': 'number', 'unit': 'pcs', 'critical': True},
                    {'id': 'lights', 'label': 'Lights', 'control': 'pass_fail'},
                ],
            }],
        }
        self.client.force_authenticate(self.owner)
        updated = self.client.patch(
            f'/api/routines/routines/{self.routine.pk}/',
            {'definition': expanded},
            format='json',
        )
        self.assertEqual(updated.status_code, 200, updated.data)
        self.client.force_authenticate(self.employee)
        opened = self.client.get(f'/api/routines/runs/{run.pk}/')
        checks = opened.data['draft']['responses']['sections'][0]['checks']
        self.assertEqual([check['id'] for check in checks], ['swept', 'count', 'lights'])
        self.assertEqual(checks[0]['result'], 'pass')
        self.assertEqual(checks[2]['result'], '')

    def test_deleted_routine_leaves_staff_surfaces(self):
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get()
        self.client.force_authenticate(self.owner)
        listed = self.client.get('/api/routines/routines/')
        self.assertEqual(listed.status_code, 200)
        listed_rows = listed.data['results'] if isinstance(listed.data, dict) else listed.data
        self.assertIn(self.routine.pk, [row['id'] for row in listed_rows])

        deleted = self.client.delete(f'/api/routines/routines/{self.routine.pk}/')
        self.assertEqual(deleted.status_code, 204)
        self.routine.refresh_from_db()
        self.assertFalse(self.routine.is_active)
        self.assertTrue(RoutineRun.objects.filter(pk=run.pk).exists())

        catalog = self.client.get('/api/routines/routines/')
        catalog_rows = catalog.data['results'] if isinstance(catalog.data, dict) else catalog.data
        self.assertNotIn(self.routine.pk, [row['id'] for row in catalog_rows])
        self.assertEqual(self.client.get(f'/api/routines/routines/{self.routine.pk}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/routines/runs/{run.pk}/').status_code, 404)
        mine = self.client.get('/api/routines/runs/mine/')
        self.assertEqual(mine.status_code, 200)
        self.assertEqual(mine.data['open'], [])
        self.assertEqual(mine.data['on_demand'], [])

    def test_admin_list_shows_retired_rows_with_history(self):
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get()
        self.client.force_authenticate(self.employee)
        created = self.client.post('/api/routines/submissions/', {
            'routine': self.routine.pk, 'run': run.pk,
        }, format='json')
        responses = created.data['responses']
        responses['sections'][0]['checks'][0]['result'] = 'pass'
        responses['sections'][0]['checks'][1]['result'] = 'pass'
        responses['sections'][0]['checks'][1]['value'] = 3
        self.client.post(
            f'/api/routines/submissions/{created.data["id"]}/submit/',
            {'responses': responses}, format='json',
        )
        forbidden = self.client.get('/api/routines/routines/admin/')
        self.assertEqual(forbidden.status_code, 403)

        self.client.force_authenticate(self.owner)
        self.client.delete(f'/api/routines/routines/{self.routine.pk}/')
        listed = self.client.get('/api/routines/routines/admin/')
        self.assertEqual(listed.status_code, 200, listed.data)
        row = next(r for r in listed.data if r['id'] == self.routine.pk)
        self.assertFalse(row['is_active'])
        self.assertEqual(row['stats']['done'], 1)
        self.assertEqual(row['stats']['passed'], 1)
        self.assertEqual(row['stats']['open'], 0)
        self.assertEqual(row['stats']['last_completed_by_name'], self.employee.full_name)
        self.assertIsNotNone(row['stats']['last_completed_at'])
        self.assertEqual(row['stats']['assignee_count'], 3)

    def test_admin_restore_and_hard_delete(self):
        materialize_routines(date(2026, 9, 1))
        self.client.force_authenticate(self.owner)
        self.client.delete(f'/api/routines/routines/{self.routine.pk}/')

        restored = self.client.post(f'/api/routines/routines/{self.routine.pk}/restore/')
        self.assertEqual(restored.status_code, 200, restored.data)
        self.routine.refresh_from_db()
        self.assertTrue(self.routine.is_active)
        self.assertEqual(self.client.get(f'/api/routines/routines/{self.routine.pk}/').status_code, 200)

        blocked = self.client.delete(f'/api/routines/routines/{self.routine.pk}/hard-delete/')
        self.assertEqual(blocked.status_code, 400)

        # A retired routine still takes quick edits from Admin.
        self.client.delete(f'/api/routines/routines/{self.routine.pk}/')
        patched = self.client.patch(
            f'/api/routines/routines/{self.routine.pk}/', {'grace_days': 2}, format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.data)

        gone = self.client.delete(f'/api/routines/routines/{self.routine.pk}/hard-delete/')
        self.assertEqual(gone.status_code, 204)
        self.assertFalse(Routine.objects.filter(pk=self.routine.pk).exists())
        self.assertFalse(RoutineRun.objects.filter(routine_id=self.routine.pk).exists())

    def test_no_manual_complete(self):
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get()
        self.client.force_authenticate(self.owner)
        patched = self.client.patch(
            f'/api/routines/runs/{run.pk}/',
            {'status': 'done'},
            format='json',
        )
        self.assertEqual(patched.status_code, 405)


class SectionRoutineTests(APITestCase):
    """Materialize rules for the three section-shaped routine kinds."""

    def setUp(self):
        self.department = Department.objects.create(name='Retail')
        self.sam = _staff('sam@example.com')
        self.alex = _staff('alex@example.com')
        self.jo = _staff('jo@example.com')
        self.owner = _staff('owner@example.com', 'Admin', superuser=True)
        self.sections = [
            Section.objects.create(department=self.department, name=name, owner=owner, sort_order=i)
            for i, (name, owner) in enumerate(
                [('Housewares', self.sam), ('Toys', self.alex), ('Books', self.jo)],
            )
        ]
        Routine.objects.update(is_active=False)

    def _routine(self, **fields):
        return Routine.objects.create(
            definition={'template_version': 1, 'sections': []},
            trigger=Routine.TRIGGER_DAILY,
            assignment=Routine.ASSIGN_PER_PERSON,
            assigned_department=self.department,
            assigned_role='Staff',
            **fields,
        )

    def test_my_section_gives_each_owner_one_run_for_all_they_keep(self):
        Section.objects.create(
            department=self.department, name='Seasonal', owner=self.sam, sort_order=9,
        )
        self._routine(title='Tally', kind=Routine.KIND_SECTION_TALLY,
                      subject_source=Routine.SUBJECT_MY_SECTION)
        materialize_routines(date(2026, 9, 1))
        runs = {run.assigned_to_id: run for run in RoutineRun.objects.all()}
        self.assertEqual(set(runs), {self.sam.pk, self.alex.pk, self.jo.pk})
        self.assertEqual(runs[self.sam.pk].subject, 'Housewares, Seasonal')
        self.assertIsNone(runs[self.sam.pk].section_id)

    def test_cross_check_never_lands_on_your_own_aisle_and_rotates(self):
        self._routine(title='Cross-check', kind=Routine.KIND_SECTION_AUDIT,
                      subject_source=Routine.SUBJECT_OTHER_SECTION, weekdays=[1])
        seen = set()
        for day in (date(2026, 9, 1), date(2026, 9, 8), date(2026, 9, 15)):
            materialize_routines(day)
            for run in RoutineRun.objects.filter(period_key=day.isoformat()):
                self.assertIsNotNone(run.section_id)
                self.assertNotEqual(run.section.owner_id, run.assigned_to_id)
                self.assertEqual(run.subject, run.section.name)
                seen.add((run.assigned_to_id, run.section_id))
        self.assertGreater(len({week for _, week in seen}), 1)

    def test_a_single_section_has_nobody_to_cross_check_it(self):
        Section.objects.exclude(pk=self.sections[0].pk).delete()
        self._routine(title='Cross-check', kind=Routine.KIND_SECTION_AUDIT,
                      subject_source=Routine.SUBJECT_OTHER_SECTION)
        materialize_routines(date(2026, 9, 1))
        self.assertEqual(RoutineRun.objects.count(), 0)

    def test_owner_spot_draws_a_fixed_sample_and_walks_the_sections(self):
        # The seeded Open checklist is the pool the sample is drawn from.
        Routine.objects.filter(system_key=SYSTEM_OPEN).update(
            is_active=True, definition=DEFINITION,
        )
        spot = self._routine(title='Spot check', kind=Routine.KIND_OWNER_SPOT)
        spot.assigned_users.set([self.owner])

        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get(routine=spot)
        drawn = run.generated['checks']
        self.assertEqual(len(drawn), 2)
        self.assertEqual(run.section_id, self.sections[0].pk)

        # A refresh must not reroll the sample somebody is halfway through.
        materialize_routines(date(2026, 9, 1))
        run.refresh_from_db()
        self.assertEqual(run.generated['checks'], drawn)

        materialize_routines(date(2026, 9, 2))
        self.assertEqual(
            RoutineRun.objects.get(routine=spot, period_key='2026-09-02').section_id,
            self.sections[1].pk,
        )

    def test_owner_spot_picks_up_a_section_that_appeared_later(self):
        Section.objects.all().delete()
        Routine.objects.filter(system_key=SYSTEM_OPEN).update(
            is_active=True, definition=DEFINITION,
        )
        spot = self._routine(title='Spot check', kind=Routine.KIND_OWNER_SPOT)
        spot.assigned_users.set([self.owner])
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get(routine=spot)
        self.assertIsNone((run.generated or {}).get('section_id'))

        Section.objects.create(department=self.department, name='Housewares', owner=self.sam)
        materialize_routines(date(2026, 9, 1))
        run.refresh_from_db()
        self.assertTrue((run.generated or {}).get('section_id'))

    def test_reassigning_a_section_moves_todays_open_run(self):
        self._routine(title='Tally', kind=Routine.KIND_SECTION_TALLY,
                      subject_source=Routine.SUBJECT_MY_SECTION)
        materialize_routines(date(2026, 9, 1))
        self.sections[0].owner = self.alex
        self.sections[0].save(update_fields=['owner'])
        materialize_routines(date(2026, 9, 1))
        alex_run = RoutineRun.objects.get(assigned_to=self.alex, period_key='2026-09-01')
        self.assertEqual(alex_run.subject, 'Housewares, Toys')

    def test_cover_hands_an_absent_owners_run_over(self):
        self._routine(title='Tally', kind=Routine.KIND_SECTION_TALLY,
                      subject_source=Routine.SUBJECT_MY_SECTION)
        materialize_routines(date(2026, 9, 1))
        run = RoutineRun.objects.get(assigned_to=self.sam)

        self.client.force_authenticate(self.alex)
        refused = self.client.post(f'/api/routines/runs/{run.pk}/cover/')
        self.assertEqual(refused.status_code, 403)

        self.client.force_authenticate(self.owner)
        covered = self.client.post(f'/api/routines/runs/{run.pk}/cover/')
        self.assertEqual(covered.status_code, 200, covered.data)
        run.refresh_from_db()
        self.assertEqual(run.assigned_to_id, self.owner.pk)

        again = self.client.post(f'/api/routines/runs/{run.pk}/cover/')
        self.assertEqual(again.status_code, 400)


class SectionApiTests(APITestCase):
    def setUp(self):
        self.employee = _staff('emp@example.com')
        self.owner = _staff('owner@example.com', 'Admin', superuser=True)
        self.department = Department.objects.create(name='Retail')
        self.section = Section.objects.create(
            department=self.department, name='Housewares', owner=self.employee,
        )

    def test_staff_read_superuser_write(self):
        self.client.force_authenticate(self.employee)
        listed = self.client.get('/api/routines/sections/')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data[0]['owner_name'], self.employee.full_name)

        refused = self.client.post('/api/routines/sections/', {
            'department': self.department.pk, 'name': 'Toys',
        }, format='json')
        self.assertEqual(refused.status_code, 403)

        self.client.force_authenticate(self.owner)
        created = self.client.post('/api/routines/sections/', {
            'department': self.department.pk, 'name': ' Toys ',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['name'], 'Toys')

    def test_retire_hides_the_section_but_keeps_it(self):
        self.client.force_authenticate(self.owner)
        self.client.delete(f'/api/routines/sections/{self.section.pk}/')
        self.assertEqual(len(self.client.get('/api/routines/sections/').data), 0)
        with_retired = self.client.get('/api/routines/sections/?include_retired=1')
        self.assertEqual(len(with_retired.data), 1)
        self.assertFalse(with_retired.data[0]['is_active'])

    def test_reorder_writes_the_new_positions(self):
        second = Section.objects.create(department=self.department, name='Toys', sort_order=1)
        self.client.force_authenticate(self.owner)
        response = self.client.post(
            '/api/routines/sections/reorder/',
            {'ids': [second.pk, self.section.pk]},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row['name'] for row in response.data], ['Toys', 'Housewares'])

    def test_a_name_cannot_repeat_in_one_department(self):
        self.client.force_authenticate(self.owner)
        clash = self.client.post('/api/routines/sections/', {
            'department': self.department.pk, 'name': 'Housewares',
        }, format='json')
        self.assertEqual(clash.status_code, 400)


class GradingTests(APITestCase):
    """Scoring one run, one day, and one week."""

    MONDAY = date(2026, 8, 31)
    TUESDAY = date(2026, 9, 1)

    def setUp(self):
        self.department = Department.objects.create(name='Retail')
        self.sam = _staff('sam@example.com')
        self.alex = _staff('alex@example.com')
        self.boss = _staff('boss@example.com', 'Admin', superuser=True)
        self.housewares = Section.objects.create(
            department=self.department, name='Housewares', owner=self.sam,
        )
        Section.objects.create(department=self.department, name='Toys', owner=self.alex)
        Routine.objects.update(is_active=False)
        self.cfg = retail_qa_settings()

    def _routine(self, system_key, **fields):
        """The seeded program routine, woken up and pointed at this test's data."""
        fields.setdefault('title', system_key)
        fields.setdefault('kind', Routine.KIND_CHECKLIST)
        routine, _created = Routine.objects.update_or_create(
            system_key=system_key,
            defaults={
                'definition': DEFINITION,
                'trigger': Routine.TRIGGER_DAILY,
                'assigned_department': self.department,
                'is_active': True,
                **fields,
            },
        )
        return routine

    def _run(self, routine, day, *, status=RoutineRun.STATUS_DONE, responses=None, at=None,
             section=None):
        run = RoutineRun.objects.create(
            routine=routine,
            period_key=day.isoformat(),
            due_at=datetime.combine(day, time(18, 0), tzinfo=TZ),
            section=section,
            status=status,
        )
        if status == RoutineRun.STATUS_DONE:
            submission = RoutineSubmission.objects.create(
                routine=routine,
                run=run,
                status=RoutineSubmission.STATUS_SUBMITTED,
                responses=responses or {},
                submitted_at=at or datetime.combine(day, time(9, 0), tzinfo=TZ),
            )
            run.submission = submission
            run.completed_at = submission.submitted_at
            run.completed_by = self.sam
            run.save(update_fields=['submission', 'completed_at', 'completed_by'])
        return run

    def _checklists(self, day, *, missing=(), late=()):
        for key in (SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE):
            routine = self._routine(key, late_after=Routine.LATE_END_OF_DAY)
            if key in missing:
                self._run(routine, day, status=RoutineRun.STATUS_OPEN)
            elif key in late:
                self._run(routine, day, at=datetime.combine(
                    day + timedelta(days=1), time(9, 0), tzinfo=TZ,
                ))
            else:
                self._run(routine, day)

    def _audit(self, **over):
        return {
            'section_id': self.housewares.pk,
            'photo': '/api/photo/1/',
            'items_inspected': 30,
            'counts': {},
            'flags': [],
            'notes': '',
            **over,
        }

    def test_a_clean_audit_scores_full_and_issues_step_it_down(self):
        self.assertEqual(audit_score(self._audit(), self.cfg), 100.0)
        # One category with two issues: 75 there, 100 in the other seven.
        self.assertEqual(
            audit_score(self._audit(counts={'reshelf': 2}), self.cfg), 96.9,
        )
        self.assertEqual(
            audit_score(self._audit(counts={'reshelf': 9}), self.cfg), 87.5,
        )

    def test_recorded_categories_never_touch_the_score(self):
        churn = self._audit(counts={'clean': 12, 'tars': 4, 'reprice': 7})
        self.assertEqual(audit_score(churn, self.cfg), 100.0)

    def test_safety_caps_an_otherwise_spotless_section(self):
        flagged = self._audit(flags=['safety'])
        self.assertEqual(audit_score(flagged, self.cfg), 50.0)

    def test_a_checklist_scores_on_when_not_on_what_it_found(self):
        routine = self._routine(SYSTEM_OPEN)
        on_time = self._run(routine, self.TUESDAY)
        self.assertEqual(score_run(on_time, self.cfg), 100.0)

        late = self._run(routine, self.TUESDAY - timedelta(days=1), at=datetime.combine(
            self.TUESDAY, time(9, 0), tzinfo=TZ,
        ))
        self.assertEqual(score_run(late, self.cfg), 50.0)

        never = self._run(routine, self.TUESDAY - timedelta(days=2),
                          status=RoutineRun.STATUS_OPEN)
        self.assertEqual(score_run(never, self.cfg), 0.0)

    def test_a_daily_tally_is_recorded_and_not_scored(self):
        tally = self._routine(SYSTEM_TALLY, kind=Routine.KIND_SECTION_TALLY)
        run = self._run(tally, self.TUESDAY, responses={'sections': [
            {'section_id': self.housewares.pk, 'counts': {'hangers': 9}, 'flags': []},
        ]})
        self.assertIsNone(score_run(run, self.cfg))

    def test_a_full_day_of_checklists_is_an_a(self):
        self._checklists(self.TUESDAY)
        graded = day_grade(self.TUESDAY, self.cfg)
        self.assertEqual(graded['performed_score'], 100.0)
        self.assertEqual(graded['letter'], 'A')
        self.assertIsNone(graded['owner_score'])

    def test_a_missing_close_costs_a_third_of_the_day(self):
        self._checklists(self.TUESDAY, missing=[SYSTEM_CLOSE])
        graded = day_grade(self.TUESDAY, self.cfg)
        self.assertEqual(graded['score'], 66.7)
        self.assertEqual(graded['letter'], 'D')
        self.assertEqual(graded['performed'][SYSTEM_CLOSE]['status'], 'open')

    def test_a_late_close_keeps_half_credit(self):
        self._checklists(self.TUESDAY, late=[SYSTEM_CLOSE])
        graded = day_grade(self.TUESDAY, self.cfg)
        self.assertEqual(graded['score'], 83.3)
        self.assertTrue(graded['performed'][SYSTEM_CLOSE]['late'])

    def test_the_spot_check_takes_half_the_day_when_it_happens(self):
        self._checklists(self.TUESDAY)
        spot = self._routine(SYSTEM_OWNER_SPOT, kind=Routine.KIND_OWNER_SPOT)
        self._run(spot, self.TUESDAY, section=self.housewares, responses={
            'checks': [
                {'check_id': 'swept', 'result': 'pass'},
                {'check_id': 'count', 'result': 'fail'},
            ],
            'audit': self._audit(),
        })
        graded = day_grade(self.TUESDAY, self.cfg)
        # Two drawn checks and the section, evenly weighted: 100, 0, 100.
        self.assertEqual(graded['owner_score'], 66.7)
        self.assertEqual(graded['performed_score'], 100.0)
        # Half the checklists, half the owner's look.
        self.assertEqual(graded['score'], 83.3)
        self.assertEqual(graded['owner_section'], 'Housewares')

    def test_an_untouched_spot_check_is_silence_not_a_zero(self):
        self._checklists(self.TUESDAY)
        spot = self._routine(SYSTEM_OWNER_SPOT, kind=Routine.KIND_OWNER_SPOT)
        self._run(spot, self.TUESDAY, status=RoutineRun.STATUS_OPEN)
        graded = day_grade(self.TUESDAY, self.cfg)
        self.assertIsNone(graded['owner_score'])
        self.assertEqual(graded['score'], 100.0)

    def test_a_day_nobody_scheduled_is_blank_rather_than_failing(self):
        self.assertFalse(day_grade(self.TUESDAY, self.cfg)['graded'])

    def test_the_week_mixes_the_daily_average_with_the_cross_checks(self):
        self._checklists(self.TUESDAY)
        cross = self._routine(SYSTEM_CROSS_CHECK, kind=Routine.KIND_SECTION_AUDIT,
                              weekdays=[1])
        run = self._run(cross, self.TUESDAY, section=self.housewares,
                        responses=self._audit(counts={'reshelf': 9}))
        run.assigned_to = self.alex
        run.save(update_fields=['assigned_to'])

        week = week_grade(self.MONDAY, self.cfg)
        self.assertEqual(week['daily_average'], 100.0)
        self.assertEqual(week['cross_check_average'], 87.5)
        self.assertEqual(week['score'], 96.9)
        self.assertEqual(week['letter'], 'A')
        self.assertEqual(week['cross_checks'][0]['auditor_name'], self.alex.full_name)

    def test_a_cross_check_that_never_happened_is_a_zero(self):
        self._checklists(self.TUESDAY)
        cross = self._routine(SYSTEM_CROSS_CHECK, kind=Routine.KIND_SECTION_AUDIT)
        self._run(cross, self.TUESDAY, section=self.housewares,
                  status=RoutineRun.STATUS_OPEN)
        week = week_grade(self.MONDAY, self.cfg)
        self.assertEqual(week['cross_check_average'], 0.0)
        self.assertEqual(week['score'], 75.0)

    def test_a_week_with_no_cross_check_leans_on_the_days_alone(self):
        self._checklists(self.TUESDAY)
        week = week_grade(self.MONDAY, self.cfg)
        self.assertIsNone(week['cross_check_average'])
        self.assertEqual(week['score'], 100.0)

    def test_tallies_are_summed_per_section_for_the_report(self):
        tally = self._routine(SYSTEM_TALLY, kind=Routine.KIND_SECTION_TALLY)
        for day, count in ((self.MONDAY, 3), (self.TUESDAY, 4)):
            self._run(tally, day, responses={'sections': [{
                'section_id': self.housewares.pk,
                'section_name': 'Housewares',
                'counts': {'hangers': count},
                'flags': [],
            }]})
        rows = week_grade(self.MONDAY, self.cfg)['tallies']
        self.assertEqual(rows[0]['counts']['hangers'], 7)
        self.assertEqual(rows[0]['walks'], 2)

    def test_calibration_shows_what_the_checker_walked_past(self):
        cross = self._routine(SYSTEM_CROSS_CHECK, kind=Routine.KIND_SECTION_AUDIT)
        self._run(cross, self.TUESDAY, section=self.housewares, responses=self._audit())
        spot = self._routine(SYSTEM_OWNER_SPOT, kind=Routine.KIND_OWNER_SPOT)
        self._run(spot, self.TUESDAY, section=self.housewares, responses={
            'checks': [],
            'audit': self._audit(counts={'security': 4}),
        })
        rows = week_grade(self.MONDAY, self.cfg)['calibration']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['gaps'][0]['key'], 'security')
        self.assertEqual(rows[0]['gaps'][0]['owner'], 4)
        self.assertEqual(rows[0]['checker_score'], 100.0)

    def test_settings_override_the_letter_boundaries(self):
        AppSetting.objects.update_or_create(
            key='retail_qa.grade_a', defaults={'value': '95'},
        )
        self._checklists(self.TUESDAY, late=[SYSTEM_CLOSE])
        graded = day_grade(self.TUESDAY)
        self.assertEqual(graded['score'], 83.3)
        self.assertEqual(graded['letter'], 'B')

    def test_the_grades_endpoint_needs_staff_and_returns_the_week(self):
        self._checklists(self.TUESDAY)
        anonymous = self.client.get('/api/routines/grades/')
        self.assertEqual(anonymous.status_code, 401)

        self.client.force_authenticate(self.sam)
        pinned = (
            timezone.make_aware(datetime(2026, 9, 1, 12, 0), TZ),
            {'closed_weekdays': [0, 6], 'timezone': 'America/Chicago'},
            TZ,
        )
        with patch('apps.routines.schedule._local_now', return_value=pinned):
            response = self.client.get('/api/routines/grades/?week=2026-W36')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['monday'], '2026-08-31')
        self.assertEqual(response.data['letter'], 'A')
        self.assertIn('graded', response.data['taxonomy'])

    def test_a_bad_week_parameter_falls_back_to_this_week(self):
        self.assertEqual(parse_week('nonsense').weekday(), 0)
        self.assertEqual(parse_week('2026-W36'), self.MONDAY)


class RetailQaSettingsTests(TestCase):
    def test_defaults_stand_in_for_anything_unset_or_unreadable(self):
        AppSetting.objects.update_or_create(
            key='retail_qa.owner_weight', defaults={'value': '0.7'},
        )
        AppSetting.objects.update_or_create(
            key='retail_qa.grade_a', defaults={'value': 'ninety'},
        )
        cfg = retail_qa_settings()
        self.assertEqual(cfg['owner_weight'], 0.7)
        # Unparsable is the same as unset: the shipped default, not a crash.
        self.assertEqual(cfg['grade_a'], 90)
        self.assertEqual(cfg['audit_min_items'], 20)

    def test_letters_follow_the_stored_boundaries(self):
        self.assertEqual(letter_for(89.9), 'B')
        AppSetting.objects.update_or_create(
            key='retail_qa.grade_b', defaults={'value': '85'},
        )
        self.assertEqual(letter_for(84), 'C')


class SectionSubmitTests(APITestCase):
    """The three guards on a cross-check, enforced by the server."""

    DAY = date(2026, 9, 1)

    def setUp(self):
        self.department = Department.objects.create(name='Retail')
        self.sam = _staff('sam@example.com')
        self.alex = _staff('alex@example.com')
        self.housewares = Section.objects.create(
            department=self.department, name='Housewares', owner=self.sam,
        )
        Section.objects.create(department=self.department, name='Toys', owner=self.alex)
        Routine.objects.update(is_active=False)
        Routine.objects.filter(system_key=SYSTEM_CROSS_CHECK).update(
            is_active=True, assigned_department=self.department, weekdays=[1],
        )
        materialize_routines(self.DAY)
        self.run = RoutineRun.objects.get(
            routine__system_key=SYSTEM_CROSS_CHECK, assigned_to=self.sam,
        )
        self.client.force_authenticate(self.sam)
        started = self.client.post('/api/routines/submissions/', {
            'routine': self.run.routine_id, 'run': self.run.pk,
        }, format='json')
        self.submission = started.data['id']

    def _submit(self, **over):
        payload = {
            'section_id': self.run.section_id,
            'photo': None,
            'items_inspected': 0,
            'counts': {},
            'flags': [],
            'notes': '',
            **over,
        }
        return self.client.post(
            f'/api/routines/submissions/{self.submission}/submit/',
            {'responses': payload},
            format='json',
        )

    def test_the_draft_opens_on_the_section_it_was_assigned(self):
        self.assertEqual(self.run.section_id, Section.objects.get(name='Toys').pk)

    def test_no_photo_no_submit(self):
        refused = self._submit(items_inspected=30)
        self.assertEqual(refused.status_code, 400)
        self.assertIn('Take the wide shot of the section first.', refused.data['detail'])

    def test_a_glance_at_four_items_is_not_an_audit(self):
        refused = self._submit(photo='data:image/png;base64,iVBORw0KGgo=', items_inspected=4)
        self.assertEqual(refused.status_code, 400)
        self.assertIn('Inspect at least 20 items before submitting.', refused.data['detail'])

    def test_a_real_audit_closes_the_run_and_scores(self):
        done = self._submit(
            photo='data:image/png;base64,iVBORw0KGgo=',
            items_inspected=30,
            counts={'reshelf': 3, 'clean': 8},
            flags=['low_stock'],
            notes='Back wall thin.',
        )
        self.assertEqual(done.status_code, 200, done.data)
        self.run.refresh_from_db()
        self.assertEqual(self.run.status, RoutineRun.STATUS_DONE)
        # 3 reshelf scores 50 in that category; the churn count does not touch it.
        self.assertEqual(score_run(self.run), 93.8)
        # The photo is stored and the data URL is replaced by its own URL.
        self.assertTrue(self.run.submission.responses['photo'].startswith('/api/routines/'))


class ProgramLockTests(APITestCase):
    def setUp(self):
        self.owner = _staff('lock-admin@example.com', 'Admin', superuser=True)
        self.program = Routine.objects.get(system_key=SYSTEM_OPEN)
        self.program.is_active = True
        self.program.save(update_fields=['is_active'])

    def test_program_routines_cannot_be_retired(self):
        self.client.force_authenticate(self.owner)
        response = self.client.delete(f'/api/routines/routines/{self.program.pk}/')
        self.assertEqual(response.status_code, 400)
        self.program.refresh_from_db()
        self.assertTrue(self.program.is_active)

    def test_program_trigger_cannot_change(self):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(
            f'/api/routines/routines/{self.program.pk}/',
            {'trigger': 'weekly'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.program.refresh_from_db()
        self.assertEqual(self.program.trigger, Routine.TRIGGER_DAILY)

    def test_program_title_can_change(self):
        self.client.force_authenticate(self.owner)
        response = self.client.patch(
            f'/api/routines/routines/{self.program.pk}/',
            {'title': 'Retail opening desk'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.program.refresh_from_db()
        self.assertEqual(self.program.title, 'Retail opening desk')


class CleanupMigrationTests(TestCase):
    def test_cleanup_purges_authored_and_retitles(self):
        leftover = Routine.objects.create(
            title='Scratch opening',
            definition=DEFINITION,
            trigger=Routine.TRIGGER_DAILY,
            assigned_role='Staff',
        )
        import importlib
        from django.apps import apps
        cleanup = importlib.import_module('apps.routines.migrations.0006_retail_qa_cleanup').cleanup
        cleanup(apps, None)
        self.assertFalse(Routine.objects.filter(pk=leftover.pk).exists())
        opening = Routine.objects.get(system_key=SYSTEM_OPEN)
        self.assertEqual(opening.title, 'Retail opening')
        cycle = Routine.objects.get(system_key=SYSTEM_WORK_CYCLE)
        self.assertEqual(cycle.kind, Routine.KIND_WORK_CYCLE)
        self.assertEqual(retail_qa_settings()['idle_prompt_minutes'], 5)


class WorkCycleKindTests(TestCase):
    def setUp(self):
        self.routine = Routine.objects.get(system_key=SYSTEM_WORK_CYCLE)
        self.routine.kind = Routine.KIND_WORK_CYCLE
        self.routine.is_active = True
        self.routine.save(update_fields=['kind', 'is_active'])

    def test_blockers_and_outcome(self):
        empty = {'mode': '', 'shelf': {}, 'non_shelf': {'done': [], 'notes': ''}}
        self.assertTrue(submit_blockers(self.routine, empty, min_items=20))
        shelf = {
            'mode': 'shelf',
            'shelf': {'section_id': None, 'counts': {}, 'flags': []},
            'non_shelf': {'done': [], 'notes': ''},
        }
        self.assertIn('section', ' '.join(submit_blockers(self.routine, shelf, min_items=20)).lower())
        shelf['shelf']['section_id'] = 1
        shelf['shelf']['counts'] = {'reshelf': 2}
        self.assertEqual(submit_blockers(self.routine, shelf, min_items=20), [])
        self.assertEqual(outcome(self.routine, shelf), (2, False))
        other = {
            'mode': 'non_shelf',
            'shelf': {},
            'non_shelf': {'done': [], 'notes': ''},
        }
        self.assertTrue(submit_blockers(self.routine, other, min_items=20))
        other['non_shelf']['notes'] = 'Wiped the glass.'
        self.assertEqual(submit_blockers(self.routine, other, min_items=20), [])
        self.assertEqual(outcome(self.routine, other), (0, False))


class WorkCycleApiTests(APITestCase):
    def setUp(self):
        self.staff = _staff('cycle@example.com')
        self.cycle = Routine.objects.get(system_key=SYSTEM_WORK_CYCLE)
        self.cycle.kind = Routine.KIND_WORK_CYCLE
        self.cycle.is_active = True
        self.cycle.trigger = Routine.TRIGGER_ON_DEMAND
        self.cycle.assignment = Routine.ASSIGN_POOLED
        self.cycle.assigned_role = 'Staff'
        self.cycle.save()

    def test_retrieve_includes_runner_context(self):
        self.client.force_authenticate(self.staff)
        response = self.client.get(f'/api/routines/routines/{self.cycle.pk}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn('taxonomy', response.data.get('runner') or {})
        self.assertIn('non_shelf_checks', response.data['runner'])

    def test_mine_lists_drafts(self):
        self.client.force_authenticate(self.staff)
        started = self.client.post('/api/routines/submissions/', {
            'routine': self.cycle.pk,
            'mode': 'shelf',
        }, format='json')
        self.assertEqual(started.status_code, 201, started.data)
        mine = self.client.get('/api/routines/runs/mine/')
        self.assertEqual(mine.status_code, 200, mine.data)
        drafts = mine.data.get('drafts') or []
        self.assertTrue(any(row['id'] == started.data['id'] for row in drafts))
        self.assertGreaterEqual(mine.data.get('idle_prompt_minutes') or 0, 1)

    def test_prompt_logs_a_dismissal(self):
        self.client.force_authenticate(self.staff)
        response = self.client.post('/api/routines/work-cycle/prompt/', {
            'outcome': 'dismissed',
            'idle_seconds': 320,
            'shown_at': timezone.now().isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(WorkCyclePrompt.objects.filter(outcome='dismissed').count(), 1)


class NoDashesTests(TestCase):
    def test_apps_source_has_no_em_or_en_dashes(self):
        from pathlib import Path
        root = Path(__file__).resolve().parents[1]
        hits = []
        for path in root.rglob('*'):
            if path.suffix not in {'.py'}:
                continue
            if any(part in {'.venv', '__pycache__', 'node_modules'} for part in path.parts):
                continue
            text = path.read_text(encoding='utf-8')
            if '\u2014' in text or '\u2013' in text:
                hits.append(str(path.relative_to(root)))
        self.assertEqual(hits, [], f'em/en dashes in {hits}')
