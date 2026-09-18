from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.hr.models import Department, Shift, ShiftAssignment
from apps.routines.command_center import (
    assign_run,
    build_issues,
    build_jobs,
    create_nudge,
    fire_hard_deadline_nudges,
    pending_nudges_for,
    resolve_nudges_for_run,
    serialize_nudge,
)
from apps.routines.models import QaNudge, Routine, RoutineRun
from apps.routines.schedule import SYSTEM_CLOSE, SYSTEM_DAY, SYSTEM_OPEN
from apps.routines.settings import NUDGE_UNSEEN_MINUTES
from apps.webstore.services.hours import get_hours_config

TZ = ZoneInfo('America/Chicago')
THURSDAY = date(2026, 9, 17)


def _staff(email, first, last, role='Employee'):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, first_name=first, last_name=last, password='x', is_staff=True,
    )
    user.groups.add(group)
    return user


class DayPoolTests(APITestCase):
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
        self.day_shift, _ = Shift.objects.update_or_create(
            punch_code='retail_day',
            defaults={
                'name': 'Retail Mid', 'department': self.retail,
                'time_in': time(11, 0), 'time_out': time(19, 0),
                'weekdays': [1, 2, 3, 4, 5], 'is_active': False,
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
        self.carrie = _staff('carrie-pool@example.com', 'Carrie', 'Rollins')
        self.david = _staff('david-pool@example.com', 'David', 'Kilduff')
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
        for key, title, shift, due in (
            (SYSTEM_OPEN, 'Opening checklist', self.open_shift, time(9, 0)),
            (SYSTEM_DAY, 'Midday checklist', self.day_shift, time(14, 0)),
            (SYSTEM_CLOSE, 'Closing checklist', self.close_shift, time(18, 0)),
        ):
            routine, _ = Routine.objects.update_or_create(
                system_key=key,
                defaults={
                    'title': title, 'kind': Routine.KIND_CHECKLIST,
                    'trigger': Routine.TRIGGER_DAILY, 'is_active': True,
                    'due_time': due,
                    'hard_time': time(15, 0) if key == SYSTEM_DAY else None,
                    'definition': {'template_version': 1, 'sections': []},
                },
            )
            routine.shift = shift
            routine.shift_locked = True
            routine.assigned_department = self.retail
            routine.audience_type = Routine.AUDIENCE_SHIFT
            routine.assigned_shifts = [shift.punch_code] if shift.punch_code else []
            routine.save()
            if key == SYSTEM_DAY:
                self.day = routine

    def _day_run(self, day=THURSDAY):
        due = timezone.make_aware(datetime.combine(day, time(14, 0)), TZ)
        if day == timezone.localdate() and due <= timezone.now():
            due = timezone.now() + timedelta(hours=4)
        run, _ = RoutineRun.objects.get_or_create(
            routine=self.day,
            period_key=day.isoformat(),
            assigned_to=None,
            defaults={
                'due_at': due,
                'status': RoutineRun.STATUS_OPEN,
                'unassign_key': '',
            },
        )
        if run.status != RoutineRun.STATUS_OPEN or run.due_at <= timezone.now():
            run.status = RoutineRun.STATUS_OPEN
            run.due_at = due
            run.save(update_fields=['status', 'due_at'])
        return run

    def test_inactive_day_is_a_named_pool(self):
        run = self._day_run()
        now = timezone.make_aware(datetime.combine(THURSDAY, time(10, 0)), TZ)
        hours = get_hours_config()
        jobs = build_jobs(THURSDAY, {}, now=now, tz=TZ, hours_cfg=hours)
        day_job = next(row for row in jobs if row['key'] == SYSTEM_DAY)
        self.assertEqual(day_job['owner_state'], 'pool')
        self.assertIsNone(day_job['owner']['id'])
        self.assertEqual(day_job['owner']['name'], 'Pool · Carrie R., David K.')
        self.assertEqual(day_job['status'], 'Due')
        self.assertEqual(day_job['run_id'], run.pk)
        issues = build_issues(
            day=THURSDAY, open_day=True, staff=[], jobs=jobs, spot={'done': True},
            cross={'due': None, 'total': 0, 'done': 0}, nudges={}, now=now, tz=TZ,
            hours_cfg=hours, today=THURSDAY,
        )
        self.assertFalse([row for row in issues if row['type'] == 'call_in_unassigned'])

    def test_mine_includes_pooled_day_for_both(self):
        day = timezone.localdate()
        if day.weekday() == 0:
            self.skipTest('Monday is closed.')
        ShiftAssignment.objects.filter(employee__in=[self.carrie, self.david]).update(
            weekdays=[day.weekday()],
        )
        self._day_run(day)
        for user in (self.carrie, self.david):
            self.client.force_authenticate(user)
            mine = self.client.get('/api/routines/runs/mine/')
            self.assertEqual(mine.status_code, 200, mine.data)
            keys = {row['system_key'] for row in mine.data['open']}
            self.assertIn(SYSTEM_DAY, keys)
            qa = self.client.get('/api/routines/qa/mine/')
            self.assertEqual(qa.status_code, 200, qa.data)
            titles = {row['title'] for row in qa.data['today']}
            self.assertIn('Midday checklist', titles)

    def test_complete_resolves_the_other_members_nudge(self):
        run = self._day_run()
        create_nudge(run=run, source='manual', message='Please finish Midday checklist.')
        self.assertEqual(QaNudge.objects.filter(run=run).count(), 2)
        run.status = RoutineRun.STATUS_DONE
        run.completed_by = self.david
        run.completed_at = timezone.now()
        run.save(update_fields=['status', 'completed_by', 'completed_at'])
        resolve_nudges_for_run(run)
        carrie_nudge = QaNudge.objects.get(run=run, employee=self.carrie)
        self.assertEqual(carrie_nudge.ack_kind, 'resolved')
        self.assertEqual(serialize_nudge(carrie_nudge)['ack_label'], 'Resolved')
        self.assertEqual(pending_nudges_for(self.carrie), [])
        now = timezone.make_aware(datetime.combine(THURSDAY, time(16, 0)), TZ)
        jobs = build_jobs(THURSDAY, {}, now=now, tz=TZ, hours_cfg=get_hours_config())
        day_job = next(row for row in jobs if row['key'] == SYSTEM_DAY)
        self.assertEqual(day_job['status'], 'Done')
        self.assertEqual(day_job['run_id'], run.pk)

    def test_hard_deadline_writes_one_nudge_per_pool_member(self):
        run = self._day_run()
        now = timezone.make_aware(datetime.combine(THURSDAY, time(15, 5)), TZ)
        fire_hard_deadline_nudges(THURSDAY, now=now, tz=TZ, hours_cfg=get_hours_config())
        rows = list(QaNudge.objects.filter(run=run, source='auto'))
        self.assertEqual(len(rows), 2)
        self.assertEqual({row.employee_id for row in rows}, {self.carrie.pk, self.david.pk})

    def test_resolved_nudge_is_never_unseen_or_re_nudge(self):
        run = self._day_run()
        create_nudge(run=run, source='auto', employee=self.carrie, message='past hard')
        resolve_nudges_for_run(run)
        nudge = QaNudge.objects.get(run=run, employee=self.carrie)
        nudge.created_at = timezone.now() - timedelta(minutes=NUDGE_UNSEEN_MINUTES + 5)
        nudge.save(update_fields=['created_at'])
        packed = serialize_nudge(nudge, now=timezone.now())
        self.assertEqual(packed['ack_label'], 'Resolved')
        now = timezone.make_aware(datetime.combine(THURSDAY, time(16, 0)), TZ)
        jobs = [{
            'group': 'shift',
            'key': SYSTEM_DAY,
            'title': 'Midday checklist',
            'run_id': run.pk,
            'status': 'Overdue',
            'owner': {'id': None, 'name': 'Pool · Carrie R., David K.'},
            'due_at': now,
            'hard_label': '15:00',
            'urgency': 'hard',
        }]
        issues = build_issues(
            day=THURSDAY, open_day=True, staff=[], jobs=jobs, spot={'done': True},
            cross={'due': None, 'total': 0, 'done': 0},
            nudges={run.pk: nudge}, now=now, tz=TZ,
            hours_cfg=get_hours_config(), today=THURSDAY,
        )
        overdue = [row for row in issues if row['run_id'] == run.pk and row['type'] == 'overdue_routine']
        self.assertTrue(overdue)
        self.assertNotEqual(overdue[0]['action'], 're_nudge')
        self.assertEqual(overdue[0]['nudged_at'], 'Resolved')

    def test_empty_retail_roster_is_unassigned(self):
        ShiftAssignment.objects.all().delete()
        run = self._day_run()
        now = timezone.make_aware(datetime.combine(THURSDAY, time(10, 0)), TZ)
        hours = get_hours_config()
        jobs = build_jobs(THURSDAY, {}, now=now, tz=TZ, hours_cfg=hours)
        day_job = next(row for row in jobs if row['key'] == SYSTEM_DAY)
        self.assertEqual(day_job['status'], 'Unassigned')
        self.assertIsNone(day_job['owner'])
        issues = build_issues(
            day=THURSDAY, open_day=True, staff=[], jobs=jobs, spot={'done': True},
            cross={'due': None, 'total': 0, 'done': 0}, nudges={}, now=now, tz=TZ,
            hours_cfg=hours, today=THURSDAY,
        )
        self.assertTrue([row for row in issues if row['type'] == 'call_in_unassigned'])
        self.assertEqual(run.assigned_to_id, None)

    def test_assign_run_leaves_the_pool(self):
        day = timezone.localdate()
        if day.weekday() == 0:
            self.skipTest('Monday is closed.')
        ShiftAssignment.objects.filter(employee__in=[self.carrie, self.david]).update(
            weekdays=[day.weekday()],
        )
        run = self._day_run(day)
        assign_run(run=run, user=self.carrie)
        run.refresh_from_db()
        self.assertEqual(run.assigned_to_id, self.carrie.pk)
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        jobs = build_jobs(day, {}, now=now, tz=TZ, hours_cfg=get_hours_config())
        day_job = next(row for row in jobs if row['key'] == SYSTEM_DAY)
        self.assertEqual(day_job['owner']['id'], self.carrie.pk)
        self.assertNotEqual(day_job['owner_state'], 'pool')
        self.client.force_authenticate(self.david)
        mine = self.client.get('/api/routines/runs/mine/')
        keys = {row['system_key'] for row in mine.data['open']}
        self.assertNotIn(SYSTEM_DAY, keys)
        qa = self.client.get('/api/routines/qa/mine/')
        titles = {row['title'] for row in qa.data['today']}
        self.assertNotIn('Midday checklist', titles)
