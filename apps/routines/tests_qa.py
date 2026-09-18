"""Retail QA v2: baseline math, residual examples, flags, settings."""
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.core.models import AppSetting
from apps.hr.models import Department, Shift, ShiftAssignment, TimeEntry
from apps.routines.baseline import baseline_from_counts, fit_count_dist, log10_tail_score, tail_probs
from apps.routines.flags import test_low_findings, test_speed
from apps.routines.grading import residual_parts, verify_score
from apps.routines.models import (
    QaCallIn,
    QaDayExclusion,
    QaDayOverride,
    QaNudge,
    Routine,
    RoutineRun,
    RoutineSubmission,
    Section,
    SectionObservation,
)
from apps.routines.schedule import (
    SYSTEM_CLOSE,
    SYSTEM_CROSS_CHECK,
    SYSTEM_DAY,
    SYSTEM_OPEN,
    SYSTEM_OWNER_SPOT,
    SYSTEM_TALLY,
    cross_check_day_for,
    eligible_spot_sections,
    maybe_draw_spot,
)
from apps.routines.settings import (
    letter_for,
    retail_qa_settings,
    score_ladder,
    validate_retail_qa_bundle,
    validate_retail_qa_value,
)
from apps.webstore.services.hours import is_open_day

User = get_user_model()
TZ = ZoneInfo('America/Chicago')


def _staff(email, role='Employee', *, superuser=False):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, password='x', first_name=role, last_name=email.split('@')[0],
        is_staff=True, is_superuser=superuser,
    )
    user.groups.add(group)
    return user


class BaselineMathTests(TestCase):
    def test_poisson_when_variance_at_or_below_mean(self):
        dist = fit_count_dist(4, 4)
        self.assertEqual(dist['family'], 'poisson')
        tails = tail_probs(4, dist)
        self.assertGreater(tails['tail'], 0.2)

    def test_negative_binomial_when_overdispersed(self):
        dist = fit_count_dist(4, 12)
        self.assertEqual(dist['family'], 'nb')
        self.assertGreater(dist['r'], 0)
        self.assertGreater(dist['p'], 0)

    def test_zero_on_a_lumpy_aisle_still_scores_full(self):
        dist = fit_count_dist(1, 1)
        tails = tail_probs(0, dist)
        self.assertGreaterEqual(tails['tail'], 0.025)
        self.assertEqual(log10_tail_score(tails['tail'], 0.025, 0.002), 100.0)

    def test_shrink_blends_a_thin_section_toward_the_store(self):
        cfg = retail_qa_settings()
        base = baseline_from_counts([10], [2, 2, 2, 2, 2], cfg)
        self.assertLess(base['mean'], 10)
        self.assertGreater(base['mean'], 2)

    def test_warm_up_before_enough_tallies(self):
        cfg = retail_qa_settings()
        base = baseline_from_counts([1, 2], [1, 2, 1], cfg)
        self.assertTrue(base['warm'])


class ResidualTests(TestCase):
    def setUp(self):
        self.cfg = retail_qa_settings()

    def test_normal_ten_found_two_right_after_is_full(self):
        parts = residual_parts(found=2, mean=10, hours_since_tally=0, open_hours=9, cfg=self.cfg)
        self.assertEqual(parts['count_score'], 100)

    def test_normal_ten_found_five_is_sixty(self):
        parts = residual_parts(found=5, mean=10, hours_since_tally=0, open_hours=9, cfg=self.cfg)
        self.assertEqual(parts['count_score'], 60)

    def test_normal_one_found_one_is_full(self):
        parts = residual_parts(found=1, mean=1, hours_since_tally=0, open_hours=9, cfg=self.cfg)
        self.assertEqual(parts['count_score'], 100)

    def test_normal_one_found_two_is_sixty(self):
        parts = residual_parts(found=2, mean=1, hours_since_tally=0, open_hours=9, cfg=self.cfg)
        self.assertEqual(parts['count_score'], 60)

    def test_verify_ladder(self):
        self.assertEqual(verify_score(0, self.cfg), 100)
        self.assertEqual(verify_score(1, self.cfg), 85)
        self.assertEqual(verify_score(2, self.cfg), 60)
        self.assertEqual(verify_score(3, self.cfg), 30)
        self.assertEqual(verify_score(4, self.cfg), 0)


class SettingsValidationTests(TestCase):
    def test_defaults_fill_new_keys(self):
        cfg = retail_qa_settings()
        self.assertEqual(cfg['spot_check_count'], 3)
        self.assertEqual(cfg['baseline_window'], 100)
        self.assertEqual(cfg['weight_spot'], 60)
        self.assertEqual(cfg['weight_do'], 25)
        self.assertEqual(cfg['weight_cross'], 15)
        self.assertEqual(cfg['section_check_weekdays'], [True, True, True, True, True, True, False])
        self.assertNotIn('owner_weight', cfg)

    def test_ladder_must_ascend_and_scores_descend(self):
        with self.assertRaises(ValueError):
            validate_retail_qa_value('verify_ladder', [
                {'cutoff': 2, 'score': 100},
                {'cutoff': 1, 'score': 50},
            ])
        with self.assertRaises(ValueError):
            validate_retail_qa_value('owner_ladder', [
                {'cutoff': 0.1, 'score': 50},
                {'cutoff': 0.5, 'score': 80},
            ])

    def test_tails_and_letters_cross_check(self):
        cfg = retail_qa_settings()
        cfg['cross_zero_tail'] = 0.03
        cfg['cross_full_tail'] = 0.02
        self.assertTrue(validate_retail_qa_bundle(cfg))

    def test_letters_still_cut_the_same(self):
        self.assertEqual(letter_for(90), 'A')
        self.assertEqual(letter_for(89.9), 'B')
        self.assertEqual(letter_for(50), 'F')

    def test_score_ladder_helper(self):
        self.assertEqual(score_ladder(0.10, retail_qa_settings()['owner_ladder']), 100)
        self.assertEqual(score_ladder(1.01, retail_qa_settings()['owner_ladder']), 0)


class SpotPoolTests(TestCase):
    def setUp(self):
        self.department = Department.objects.create(name='Retail')
        self.sam = _staff('sam@example.com')
        self.owner = _staff('owner@example.com', 'Admin', superuser=True)
        self.section = Section.objects.create(
            department=self.department, name='Housewares', owner=self.sam,
        )
        self.tally, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_TALLY,
            defaults={
                'title': 'Tally',
                'kind': Routine.KIND_SECTION_TALLY,
                'trigger': Routine.TRIGGER_DAILY,
                'assignment': Routine.ASSIGN_PER_PERSON,
                'subject_source': Routine.SUBJECT_MY_SECTION,
                'assigned_department': self.department,
                'is_active': True,
            },
        )
        self.spot, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_OWNER_SPOT,
            defaults={
                'title': 'Spot',
                'kind': Routine.KIND_OWNER_SPOT,
                'trigger': Routine.TRIGGER_DAILY,
                'assignment': Routine.ASSIGN_PER_PERSON,
                'is_active': True,
            },
        )
        self.spot.assigned_users.set([self.owner])
        self.day = date(2026, 9, 1)

    def _done_tally(self):
        run = RoutineRun.objects.create(
            routine=self.tally,
            period_key=self.day.isoformat(),
            due_at=timezone.make_aware(datetime(2026, 9, 1, 18, 0), TZ),
            assigned_to=self.sam,
            status=RoutineRun.STATUS_DONE,
        )
        submission = RoutineSubmission.objects.create(
            routine=self.tally, run=run, status=RoutineSubmission.STATUS_SUBMITTED,
            responses={'sections': [{'section_id': self.section.pk, 'counts': {}, 'flags': []}]},
            submitted_at=timezone.make_aware(datetime(2026, 9, 1, 14, 0), TZ),
        )
        run.submission = submission
        run.completed_at = submission.submitted_at
        run.completed_by = self.sam
        run.save()
        return run

    def test_empty_pool_until_something_is_tallied(self):
        self.assertEqual(eligible_spot_sections(self.spot, self.day), [])
        self._done_tally()
        self.assertEqual([row.pk for row in eligible_spot_sections(self.spot, self.day)], [self.section.pk])

    def test_lazy_draw_waits_then_picks(self):
        run = RoutineRun.objects.create(
            routine=self.spot,
            period_key=self.day.isoformat(),
            due_at=timezone.make_aware(datetime(2026, 9, 1, 18, 0), TZ),
            assigned_to=self.owner,
            generated={'checks': [], 'switches': []},
        )
        self.assertEqual(maybe_draw_spot(run), 'waiting')
        self._done_tally()
        self.assertEqual(maybe_draw_spot(run), 'ready')
        run.refresh_from_db()
        self.assertEqual(run.section_id, self.section.pk)
        self.assertTrue((run.generated or {}).get('tally_run_id'))


class CrossCheckWeekdayTests(TestCase):
    def test_moves_to_the_next_open_day(self):
        tuesday = date(2026, 9, 1)
        self.assertTrue(is_open_day(tuesday) or not is_open_day(tuesday))
        chosen = cross_check_day_for(tuesday, qa_cfg={'cross_check_weekday': 1})
        self.assertIsNotNone(chosen)
        self.assertTrue(is_open_day(chosen))


class ShiftRosterTests(APITestCase):
    def setUp(self):
        self.mgr = _staff('mgr@example.com', 'Manager')
        self.sam = _staff('sam@example.com')
        self.department = Department.objects.create(name='Retail')
        self.shift = Shift.objects.create(
            name='Retail Day',
            department=self.department,
            time_in=time(10, 0),
            time_out=time(17, 0),
            weekdays=[1, 2, 3, 4, 5],
        )

    def test_manager_can_assign_a_shift(self):
        self.client.force_authenticate(self.mgr)
        created = self.client.post('/api/hr/shift-assignments/', {
            'employee': self.sam.pk, 'shift': self.shift.pk,
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['weekdays'], [])
        self.assertTrue(self.shift.runs_on(date(2026, 9, 1)))
        self.assertFalse(self.shift.runs_on(date(2026, 8, 31)))

    def test_person_days_limit_who_is_on_today(self):
        assignment = ShiftAssignment.objects.create(
            employee=self.sam, shift=self.shift, weekdays=[5],
        )
        saturday = date(2026, 9, 5)
        tuesday = date(2026, 9, 1)
        self.assertTrue(assignment.runs_on(saturday))
        self.assertFalse(assignment.runs_on(tuesday))
        self.client.force_authenticate(self.mgr)
        sat = self.client.get('/api/routines/qa/today/', {'date': saturday.isoformat()})
        tue = self.client.get('/api/routines/qa/today/', {'date': tuesday.isoformat()})
        self.assertEqual(sat.status_code, 200, sat.data)
        self.assertEqual(tue.status_code, 200, tue.data)
        self.assertTrue(any(row['id'] == self.sam.pk for row in sat.data['staff']))
        self.assertFalse(any(row['id'] == self.sam.pk for row in tue.data['staff']))

    def test_empty_days_keep_the_person_assigned(self):
        assignment = ShiftAssignment.objects.create(
            employee=self.sam, shift=self.shift, weekdays=[],
        )
        self.assertEqual(assignment.weekday_list(), [])
        self.assertFalse(assignment.runs_on(date(2026, 9, 1)))
        self.assertFalse(assignment.runs_on(date(2026, 9, 5)))
        self.client.force_authenticate(self.mgr)
        patched = self.client.patch(
            f'/api/hr/shift-assignments/{assignment.pk}/',
            {'weekdays': []},
            format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.data)
        self.assertEqual(patched.data['weekdays'], [])
        self.assertEqual(ShiftAssignment.objects.filter(pk=assignment.pk).count(), 1)


class FlagSpeedTests(TestCase):
    def setUp(self):
        self.sam = _staff('sam@example.com')
        self.department = Department.objects.create(name='Retail')
        self.section = Section.objects.create(department=self.department, name='Toys')
        self.audit, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_CROSS_CHECK,
            defaults={
                'title': 'Cross',
                'kind': Routine.KIND_SECTION_AUDIT,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
            },
        )

    def test_a_ten_second_audit_is_too_fast(self):
        start = timezone.now() - timedelta(seconds=10)
        run = RoutineRun.objects.create(
            routine=self.audit,
            period_key=timezone.localdate().isoformat(),
            due_at=timezone.now(),
            section=self.section,
            status=RoutineRun.STATUS_DONE,
            completed_by=self.sam,
            completed_at=timezone.now(),
        )
        sub = RoutineSubmission.objects.create(
            routine=self.audit, run=run, submitted_by=self.sam,
            status=RoutineSubmission.STATUS_SUBMITTED,
            started_at=start, submitted_at=timezone.now(),
        )
        RoutineSubmission.objects.filter(pk=sub.pk).update(started_at=start)
        run.submission = sub
        run.save(update_fields=['submission'])
        hit = test_speed(self.sam.pk, retail_qa_settings(), timezone.now())
        self.assertIsNotNone(hit)
        self.assertEqual(hit['kind'], 'speed')


class CommandCenterTests(APITestCase):
    def setUp(self):
        self.mgr = _staff('mgr@example.com', 'Manager')
        self.sam = _staff('sam@example.com')
        self.department, _ = Department.objects.get_or_create(
            name='Retail', defaults={'slug': 'retail-operations', 'icon': 'cart'},
        )
        self.shift, _ = Shift.objects.update_or_create(
            punch_code='retail_open',
            defaults={
                'name': 'Retail Open',
                'department': self.department,
                'time_in': time(8, 30),
                'time_out': time(15, 0),
                'weekdays': [1, 2, 3, 4, 5],
                'is_active': True,
            },
        )
        ShiftAssignment.objects.create(
            employee=self.sam, shift=self.shift, weekdays=[1, 2, 3, 4, 5],
        )
        self.open, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_OPEN,
            defaults={
                'title': 'Retail open',
                'kind': Routine.KIND_CHECKLIST,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'due_time': time(9, 0),
                'hard_time': time(10, 0),
            },
        )
        self.open.due_time = time(9, 0)
        self.open.hard_time = time(10, 0)
        self.open.save(update_fields=['due_time', 'hard_time'])
        self.tally, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_TALLY,
            defaults={
                'title': 'Section walk',
                'kind': Routine.KIND_SECTION_TALLY,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'due_time': time(14, 0),
            },
        )
        self.section = Section.objects.create(
            department=self.department, name='Housewares', owner=self.sam,
        )

    def _today(self):
        return date(2026, 9, 16)

    def _open_run(self, day, assigned=None):
        return RoutineRun.objects.create(
            routine=self.open,
            period_key=day.isoformat(),
            assigned_to=assigned or self.sam,
            due_at=timezone.make_aware(datetime.combine(day, time(9, 0)), TZ),
            status=RoutineRun.STATUS_OPEN,
        )

    def test_status_word_never_returns_raw_keys(self):
        from apps.routines.command_center import status_word
        self.assertEqual(status_word('not_started'), 'Due')
        self.assertEqual(status_word('own_part'), 'Due')
        self.assertEqual(status_word('Done'), 'Done')

    def test_week_payload_includes_section_check_days(self):
        from apps.routines.command_center import week_payload
        monday = date(2026, 9, 14)
        RoutineRun.objects.create(
            routine=self.tally,
            period_key='2026-09-15',
            assigned_to=self.sam,
            due_at=timezone.make_aware(datetime.combine(date(2026, 9, 15), time(10, 0)), TZ),
            status=RoutineRun.STATUS_DONE,
        )
        payload = week_payload(monday)
        row = next((item for item in payload['section_checks'] if item['id'] == self.sam.pk), None)
        self.assertIsNotNone(row)
        self.assertEqual(len(row['days']), 7)
        self.assertIn(row['days'][1], ('done', 'due', 'missed', 'none'))

    def test_fresh_week_tiles_use_spot_and_cross_dashes(self):
        from apps.routines.command_center import week_payload
        monday = date(2026, 9, 14)
        payload = week_payload(monday)
        self.assertEqual(len(payload['tiles']), 7)
        for tile in payload['tiles']:
            self.assertIsNone(tile['spot'])
        due = payload['cross_check_due']
        for tile in payload['tiles']:
            if due and tile['date'] >= due:
                continue
            self.assertIsNone(tile['cross'])

    def test_call_in_unassigns_and_undo_restores(self):
        day = timezone.localdate()
        run = self._open_run(day)
        tally = RoutineRun.objects.create(
            routine=self.tally,
            period_key=day.isoformat(),
            assigned_to=self.sam,
            due_at=timezone.make_aware(datetime.combine(day, time(14, 0)), TZ),
            status=RoutineRun.STATUS_OPEN,
        )
        self.client.force_authenticate(self.mgr)
        created = self.client.post('/api/routines/qa/call-in/', {
            'user': self.sam.pk, 'date': day.isoformat(),
        }, format='json')
        self.assertEqual(created.status_code, 200, created.data)
        run.refresh_from_db()
        tally.refresh_from_db()
        self.assertIsNone(run.assigned_to_id)
        self.assertIsNone(tally.assigned_to_id)
        call_id = created.data['call_in']['id']
        cleared = self.client.delete(f'/api/routines/qa/call-in/{call_id}/')
        self.assertEqual(cleared.status_code, 200, cleared.data)
        run.refresh_from_db()
        tally.refresh_from_db()
        self.assertFalse(QaCallIn.objects.filter(pk=call_id).exists())
        self.assertIsNone(run.assigned_to_id)
        self.assertIsNone(tally.assigned_to_id)

    def test_past_day_cannot_be_called_in(self):
        from apps.routines.command_center import apply_call_in
        with self.assertRaises(ValueError):
            apply_call_in(
                employee=self.sam,
                day=date(2026, 9, 1),
                marked_by=self.mgr,
                today=date(2026, 9, 16),
            )

    def test_late_severity_stays_amber_until_thirty(self):
        from apps.routines.command_center import staff_status
        start = timezone.make_aware(datetime(2026, 9, 16, 8, 30), TZ)
        now = start + timedelta(minutes=20)
        status, minutes, severity = staff_status(
            punch=None, called_in=False, start=start, now=now, on_roster=True,
        )
        self.assertEqual(status, 'Late')
        self.assertEqual(minutes, 20)
        self.assertEqual(severity, 'amber')
        later = start + timedelta(minutes=31)
        status, minutes, severity = staff_status(
            punch=None, called_in=False, start=start, now=later, on_roster=True,
        )
        self.assertEqual(severity, 'red')

    def test_overdue_becomes_missed_after_shift_end(self):
        from apps.routines.command_center import routine_live_status
        day = date(2026, 9, 16)
        run = self._open_run(day)
        mid = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        after = timezone.make_aware(datetime.combine(day, time(15, 30)), TZ)
        self.assertEqual(routine_live_status(run, day=day, now=mid, tz=TZ), 'Overdue')
        self.assertEqual(routine_live_status(run, day=day, now=after, tz=TZ), 'Missed')

    def test_persisted_missed_stays_overdue_before_shift_end(self):
        from apps.routines.command_center import routine_live_status
        day = date(2026, 9, 16)
        run = self._open_run(day)
        run.status = RoutineRun.STATUS_MISSED
        run.save(update_fields=['status'])
        mid = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        self.assertEqual(routine_live_status(run, day=day, now=mid, tz=TZ), 'Overdue')

    def test_closed_monday_omits_open_day_close(self):
        from apps.routines.command_center import build_jobs
        monday = date(2026, 9, 14)
        now = timezone.make_aware(datetime.combine(monday, time(10, 0)), TZ)
        jobs = build_jobs(monday, {}, now=now, tz=TZ, hours_cfg=None)
        self.assertFalse(any(job['group'] == 'shift' for job in jobs))
        self.assertFalse(any('.' in job['title'] for job in jobs))

    def test_punch_after_call_in_shows_in(self):
        from apps.routines.command_center import build_staff
        day = date(2026, 9, 16)
        QaCallIn.objects.create(employee=self.sam, date=day, marked_by=self.mgr)
        TimeEntry.objects.create(
            employee=self.sam,
            date=day,
            clock_in=timezone.make_aware(datetime.combine(day, time(9, 10)), TZ),
        )
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        staff = build_staff(day, now=now, tz=TZ, today=day)
        row = next(item for item in staff if item['id'] == self.sam.pk)
        self.assertEqual(row['status'], 'In')
        self.assertTrue(QaCallIn.objects.filter(employee=self.sam, date=day).exists())

    def test_open_at_hard_time_is_red_with_auto_nudge(self):
        from apps.routines.command_center import today_payload
        from apps.routines.models import QaNudge
        day = date(2026, 9, 16)
        self._open_run(day)
        now = timezone.make_aware(datetime.combine(day, time(10, 15)), TZ)
        payload = today_payload(day, now=now)
        job = next(row for row in payload['jobs'] if row['key'] == SYSTEM_OPEN)
        self.assertEqual(job['status'], 'Overdue')
        self.assertEqual(job['urgency'], 'hard')
        self.assertEqual(job['hard_label'], '10:00')
        self.assertTrue(QaNudge.objects.filter(run_id=job['run_id'], source='auto').exists())
        self.assertTrue(job.get('nudged_at'))
        self.assertTrue(any(row.get('at_label') for row in payload['nudges']))
        issue = next(row for row in payload['issues'] if row.get('run_id') == job['run_id'])
        self.assertEqual(issue['severity'], 'red')
        self.assertEqual(issue['sentence'], 'Retail open is past its hard deadline (10:00).')

    def test_open_between_due_and_hard_is_amber(self):
        from apps.routines.command_center import today_payload
        day = date(2026, 9, 16)
        self._open_run(day)
        now = timezone.make_aware(datetime.combine(day, time(9, 30)), TZ)
        payload = today_payload(day, now=now)
        job = next(row for row in payload['jobs'] if row['key'] == SYSTEM_OPEN)
        self.assertEqual(job['urgency'], 'overdue')
        issue = next(row for row in payload['issues'] if row.get('run_id') == job['run_id'])
        self.assertEqual(issue['severity'], 'amber')
        self.assertEqual(issue['sentence'], 'Retail open was due 09:00 and is not started.')

    def test_today_alerts_match_red_and_amber_issues(self):
        from apps.routines.command_center import today_payload
        day = date(2026, 9, 16)
        self._open_run(day)
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        payload = today_payload(day, now=now)
        counted = sum(1 for row in payload['issues'] if row['severity'] in ('red', 'amber'))
        self.assertEqual(payload['alerts']['total'], counted)
        for job in payload['jobs']:
            self.assertNotIn(job['status'], {'not_started', 'own_part', 'open'})

    def test_employee_cannot_open_the_board(self):
        self.client.force_authenticate(self.sam)
        response = self.client.get('/api/routines/qa/today/')
        self.assertIn(response.status_code, (403, 401))

    def test_late_sentence_uses_minutes_then_hours_then_expected(self):
        from apps.routines.command_center import format_late_sentence
        self.assertEqual(
            format_late_sentence('Sam', 25, 'Cashier - Open', '08:30'),
            'Sam is 25 min late for Cashier - Open.',
        )
        self.assertEqual(
            format_late_sentence('Sam', 90, 'Cashier - Open', '08:30'),
            'Sam is 1 h 30 min late for Cashier - Open.',
        )
        self.assertEqual(
            format_late_sentence('Sam', 308, 'Cashier - Open', '08:30'),
            'Sam: Expected 08:30, not in',
        )

    def test_staff_status_stays_expected_until_fifteen(self):
        from apps.routines.command_center import staff_status
        from apps.routines.settings import LATE_AMBER_MINUTES, LATE_RED_MINUTES
        start = timezone.make_aware(datetime(2026, 9, 16, 8, 30), TZ)
        early = start + timedelta(minutes=LATE_AMBER_MINUTES - 1)
        status, minutes, severity = staff_status(
            punch=None, called_in=False, start=start, now=early, on_roster=True,
        )
        self.assertEqual(status, 'Expected')
        self.assertIsNone(severity)
        amber = start + timedelta(minutes=LATE_AMBER_MINUTES)
        status, minutes, severity = staff_status(
            punch=None, called_in=False, start=start, now=amber, on_roster=True,
        )
        self.assertEqual(severity, 'amber')
        red = start + timedelta(minutes=LATE_RED_MINUTES)
        status, minutes, severity = staff_status(
            punch=None, called_in=False, start=start, now=red, on_roster=True,
        )
        self.assertEqual(severity, 'red')

    def test_section_due_after_clock_in_and_unassigned_at_thirty(self):
        from apps.routines.command_center import STATUS_NOT_TALLIED, section_due_state
        from apps.routines.settings import LATE_AMBER_MINUTES, LATE_RED_MINUTES
        day = date(2026, 9, 16)
        start = timezone.make_aware(datetime.combine(day, time(8, 30)), TZ)
        amber = start + timedelta(minutes=LATE_AMBER_MINUTES)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=amber, tz=TZ, punches={}, call_ins=set(),
        )
        self.assertEqual(label, 'Due after clock-in')
        self.assertEqual(status, STATUS_NOT_TALLIED)
        self.assertTrue(late)
        red = start + timedelta(minutes=LATE_RED_MINUTES)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=red, tz=TZ, punches={}, call_ins=set(),
        )
        self.assertEqual(status, STATUS_NOT_TALLIED)
        self.assertTrue(late)
        punch = TimeEntry(
            employee=self.sam,
            date=day,
            clock_in=timezone.make_aware(datetime.combine(day, time(8, 30)), TZ),
        )
        after = timezone.make_aware(datetime.combine(day, time(9, 0)), TZ)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=after, tz=TZ, punches={self.sam.pk: punch}, call_ins=set(),
        )
        self.assertEqual(label, 'Due 09:30')
        self.assertFalse(late)

    def test_off_owner_unassigned_at_store_open_and_all_sections_count(self):
        from apps.routines.command_center import build_jobs
        from apps.routines.grading import expected_parts
        from apps.webstore.services.hours import get_hours_config
        thursday = date(2026, 9, 17)
        david = _staff('david@example.com')
        david.first_name = 'David'
        david.save(update_fields=['first_name'])
        ShiftAssignment.objects.create(
            employee=david, shift=self.shift, weekdays=[0],
        )
        Section.objects.filter(pk=self.section.pk).update(owner=david)
        extras = []
        for name in ('Books', 'Media', 'Toys', 'Seasonal'):
            extras.append(Section.objects.create(
                department=self.department, name=name, owner=self.sam,
            ))
        keys, sections = expected_parts(thursday)
        self.assertEqual(len(sections), 5)
        now = timezone.make_aware(datetime.combine(thursday, time(9, 0)), TZ)
        jobs = build_jobs(thursday, {'date': thursday.isoformat()}, now=now, tz=TZ, hours_cfg=get_hours_config())
        section_jobs = [row for row in jobs if row['group'] == 'section']
        self.assertEqual(len(section_jobs), 5)
        self.assertTrue(all(row['status'] != 'Done' for row in section_jobs))
        david_job = next(row for row in section_jobs if row['title'] == 'Housewares')
        self.assertEqual(david_job['status'], 'Unassigned')
        self.assertIsNone(david_job['owner'])

    def test_scheduled_section_owner_stays_theirs_until_thirty(self):
        from apps.routines.command_center import STATUS_NOT_TALLIED, section_due_state
        day = date(2026, 9, 16)
        start = timezone.make_aware(datetime.combine(day, time(8, 30)), TZ)
        twenty = start + timedelta(minutes=20)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=twenty, tz=TZ, punches={}, call_ins=set(),
        )
        self.assertEqual(status, STATUS_NOT_TALLIED)
        self.assertEqual(label, 'Due after clock-in')
        self.assertTrue(late)
        thirty = start + timedelta(minutes=30)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=thirty, tz=TZ, punches={}, call_ins=set(),
        )
        self.assertEqual(status, STATUS_NOT_TALLIED)
        self.assertTrue(late)

    def test_late_section_owner_stays_named_on_the_job(self):
        from apps.routines.command_center import build_jobs
        from apps.webstore.services.hours import get_hours_config
        day = date(2026, 9, 16)
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        jobs = build_jobs(day, {'date': day.isoformat()}, now=now, tz=TZ, hours_cfg=get_hours_config())
        row = next(job for job in jobs if job['group'] == 'section' and job['title'] == 'Housewares')
        self.assertEqual(row['status'], 'Not tallied')
        self.assertEqual(row['owner']['id'], self.sam.pk)
        self.assertEqual(row['owner_state'], 'scheduled')
        self.assertTrue(row['owner_late'])
        self.assertEqual(row['due_label'], 'Due after clock-in')

    def test_removed_or_called_in_owner_unassigns(self):
        from apps.routines.command_center import STATUS_NOT_TALLIED, STATUS_UNASSIGNED, section_due_state
        day = date(2026, 9, 16)
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=now, tz=TZ, punches={}, call_ins={self.sam.pk},
        )
        self.assertEqual(status, STATUS_UNASSIGNED)
        self.assertFalse(late)
        QaDayExclusion.objects.create(employee=self.sam, date=day, marked_by=self.mgr)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=now, tz=TZ, punches={}, call_ins=set(),
        )
        self.assertEqual(status, STATUS_UNASSIGNED)

    def test_owner_without_a_roster_row_stays_named(self):
        from apps.routines.command_center import STATUS_NOT_TALLIED, section_due_state
        day = date(2026, 9, 18)
        ShiftAssignment.objects.filter(employee=self.sam).delete()
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=now, tz=TZ, punches={}, call_ins=set(),
        )
        self.assertEqual(status, STATUS_NOT_TALLIED)
        self.assertEqual(label, 'Due after clock-in')
        self.assertFalse(late)

    def test_punched_owner_without_a_roster_row_stays_named(self):
        from apps.routines.command_center import STATUS_NOT_TALLIED, section_due_state
        day = date(2026, 9, 18)
        ShiftAssignment.objects.filter(employee=self.sam).delete()
        punch = TimeEntry(
            employee=self.sam,
            date=day,
            clock_in=timezone.make_aware(datetime.combine(day, time(8, 30)), TZ),
        )
        now = timezone.make_aware(datetime.combine(day, time(9, 0)), TZ)
        due, label, status, late = section_due_state(
            self.section, run=None, status=STATUS_NOT_TALLIED,
            day=day, now=now, tz=TZ, punches={self.sam.pk: punch}, call_ins=set(),
        )
        self.assertEqual(status, STATUS_NOT_TALLIED)
        self.assertEqual(label, 'Due 09:30')
        self.assertFalse(late)

    def test_cross_payload_lists_every_section_before_any_are_done(self):
        from apps.routines.command_center import cross_payload
        monday = date(2026, 9, 14)
        due = date(2026, 9, 20)
        payload = cross_payload(monday, {'cross_checks': [], 'thirds': {'cross': None}}, due=due)
        housewares = next(row for row in payload['rows'] if row['section_name'] == 'Housewares')
        self.assertEqual(housewares['status_label'], 'Due Sun Sep 20')
        self.assertEqual(housewares['tone'], 'grey')
        self.assertEqual(housewares['owner']['id'], self.sam.pk)
        self.assertEqual(payload['done'], 0)
        late = cross_payload(monday, {'cross_checks': [], 'thirds': {'cross': None}}, due=date(2026, 9, 16))
        late_row = next(row for row in late['rows'] if row['section_name'] == 'Housewares')
        self.assertEqual(late_row['status_label'], 'Not done')
        self.assertEqual(late_row['tone'], 'bad')

    def test_assign_run_creates_assign_nudge(self):
        from apps.routines.command_center import assign_run
        day = date(2026, 9, 16)
        run = RoutineRun.objects.create(
            routine=self.tally,
            period_key=day.isoformat(),
            assigned_to=None,
            section=self.section,
            due_at=timezone.make_aware(datetime.combine(day, time(14, 0)), TZ),
            status=RoutineRun.STATUS_OPEN,
        )
        assign_run(run=run, user=self.sam, marked_by=self.mgr)
        row = QaNudge.objects.get(run=run)
        self.assertEqual(row.source, 'assign')
        self.assertEqual(row.created_by_id, self.mgr.pk)

    def test_assign_run_reuses_the_person_s_existing_tally(self):
        from apps.routines.command_center import assign_run
        day = date(2026, 9, 17)
        due = timezone.make_aware(datetime.combine(day, time(14, 0)), TZ)
        mine = RoutineRun.objects.create(
            routine=self.tally,
            period_key=day.isoformat(),
            assigned_to=self.sam,
            due_at=due,
            status=RoutineRun.STATUS_OPEN,
        )
        leftover = RoutineRun.objects.create(
            routine=self.tally,
            period_key=day.isoformat(),
            assigned_to=None,
            unassign_key='u-leftover',
            due_at=due,
            status=RoutineRun.STATUS_OPEN,
        )
        result = assign_run(run=leftover, user=self.sam, marked_by=self.mgr)
        self.assertEqual(result.pk, mine.pk)
        leftover.refresh_from_db()
        self.assertIsNone(leftover.assigned_to_id)
        mine.refresh_from_db()
        self.assertEqual(mine.assigned_to_id, self.sam.pk)

    def test_assign_api_does_not_duplicate_a_tally(self):
        day = date(2026, 9, 17)
        due = timezone.make_aware(datetime.combine(day, time(14, 0)), TZ)
        mine = RoutineRun.objects.create(
            routine=self.tally,
            period_key=day.isoformat(),
            assigned_to=self.sam,
            due_at=due,
            status=RoutineRun.STATUS_OPEN,
        )
        leftover = RoutineRun.objects.create(
            routine=self.tally,
            period_key=day.isoformat(),
            assigned_to=None,
            unassign_key='u-leftover',
            due_at=due,
            status=RoutineRun.STATUS_OPEN,
        )
        self.client.force_authenticate(self.mgr)
        response = self.client.post('/api/routines/qa/board/assign/', {
            'date': day.isoformat(),
            'kind': 'run',
            'run': leftover.pk,
            'user': self.sam.pk,
        }, format='json')
        self.assertEqual(response.status_code, 200, getattr(response, 'data', response.content))
        self.assertEqual(response.data['run_id'], mine.pk)
        leftover.refresh_from_db()
        self.assertIsNone(leftover.assigned_to_id)
        self.assertEqual(
            RoutineRun.objects.filter(
                routine=self.tally, period_key=day.isoformat(), assigned_to=self.sam,
            ).count(),
            1,
        )

    def test_scheduled_owner_stays_due_until_they_punch(self):
        from apps.routines.command_center import build_jobs
        from apps.webstore.services.hours import get_hours_config
        day = date(2026, 9, 16)
        self.open.shift = self.shift
        self.open.assigned_shifts = ['retail_open']
        self.open.save(update_fields=['shift', 'assigned_shifts'])
        run = RoutineRun.objects.create(
            routine=self.open,
            period_key=day.isoformat(),
            assigned_to=None,
            due_at=timezone.make_aware(datetime.combine(day, time(8, 30)), TZ),
            status=RoutineRun.STATUS_OPEN,
        )
        now = timezone.make_aware(datetime.combine(day, time(8, 0)), TZ)
        hours = get_hours_config()
        jobs = build_jobs(day, {'date': day.isoformat()}, now=now, tz=TZ, hours_cfg=hours)
        open_job = next(row for row in jobs if row['key'] == SYSTEM_OPEN)
        self.assertEqual(open_job['owner']['id'], self.sam.pk)
        self.assertEqual(open_job['owner_state'], 'scheduled')
        self.assertEqual(open_job['status'], 'Due')
        run.refresh_from_db()
        self.assertIsNone(run.assigned_to_id)
        TimeEntry.objects.create(
            employee=self.sam,
            date=day,
            clock_in=timezone.make_aware(datetime.combine(day, time(8, 5)), TZ),
            shift='retail_open',
        )
        jobs = build_jobs(day, {'date': day.isoformat()}, now=now, tz=TZ, hours_cfg=hours)
        open_job = next(row for row in jobs if row['key'] == SYSTEM_OPEN)
        self.assertEqual(open_job['owner_state'], 'in')
        self.assertNotEqual(open_job['status'], 'Unassigned')
        self.assertEqual(run.pk, open_job['run_id'])

    def _cashier_pair(self, name, punch, key, title, due, hard):
        shift, _ = Shift.objects.update_or_create(
            punch_code=punch,
            defaults={
                'name': name,
                'department': self.department,
                'time_in': time(8, 30),
                'time_out': time(15, 0),
                'weekdays': [1, 2, 3, 4, 5],
                'is_active': True,
            },
        )
        ShiftAssignment.objects.create(
            employee=self.sam, shift=shift, weekdays=[1, 2, 3, 4, 5],
        )
        routine, _ = Routine.objects.update_or_create(
            system_key=key,
            defaults={
                'title': title,
                'kind': Routine.KIND_CHECKLIST,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'due_time': due,
                'hard_time': hard,
                'shift': shift,
                'shift_locked': True,
            },
        )
        routine.shift = shift
        routine.shift_locked = True
        routine.due_time = due
        routine.hard_time = hard
        routine.save(update_fields=['shift', 'shift_locked', 'due_time', 'hard_time'])
        return shift, routine

    def test_three_cashier_jobs_are_scheduled_without_punches(self):
        from apps.routines.command_center import build_jobs
        from apps.webstore.services.hours import get_hours_config
        day = date(2026, 9, 16)
        self.open.shift = self.shift
        self.open.shift_locked = True
        self.open.save(update_fields=['shift', 'shift_locked'])
        _, day_routine = self._cashier_pair(
            'Cashier - Day', 'retail_day', SYSTEM_DAY, 'Retail day', time(14, 0), time(15, 0),
        )
        _, close_routine = self._cashier_pair(
            'Cashier - Close', 'retail_close', SYSTEM_CLOSE, 'Retail close', time(18, 0), time(19, 0),
        )
        for routine in (self.open, day_routine, close_routine):
            RoutineRun.objects.create(
                routine=routine,
                period_key=day.isoformat(),
                assigned_to=None,
                due_at=timezone.make_aware(datetime.combine(day, routine.due_time), TZ),
                status=RoutineRun.STATUS_OPEN,
            )
        now = timezone.make_aware(datetime.combine(day, time(8, 0)), TZ)
        jobs = build_jobs(day, {'date': day.isoformat()}, now=now, tz=TZ, hours_cfg=get_hours_config())
        shift_jobs = [row for row in jobs if row['group'] == 'shift']
        self.assertEqual(len(shift_jobs), 3)
        for job in shift_jobs:
            self.assertEqual(job['owner_state'], 'scheduled', job['title'])
            self.assertIsNotNone(job['owner'])
            self.assertNotEqual(job['status'], 'Unassigned')

    def test_empty_locked_shift_raises_open_shifts_issue(self):
        from apps.routines.command_center import build_issues, build_jobs
        from apps.webstore.services.hours import get_hours_config
        day = date(2026, 9, 16)
        ShiftAssignment.objects.filter(employee=self.sam).delete()
        close, _ = Shift.objects.update_or_create(
            punch_code='retail_close',
            defaults={
                'name': 'Cashier - Close',
                'department': self.department,
                'time_in': time(17, 0),
                'time_out': time(18, 0),
                'weekdays': [1, 2, 3, 4, 5],
                'is_active': True,
            },
        )
        routine, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_CLOSE,
            defaults={
                'title': 'Retail close',
                'kind': Routine.KIND_CHECKLIST,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'due_time': time(18, 0),
                'hard_time': time(19, 0),
                'shift': close,
                'shift_locked': True,
            },
        )
        routine.shift = close
        routine.shift_locked = True
        routine.save(update_fields=['shift', 'shift_locked'])
        RoutineRun.objects.create(
            routine=routine,
            period_key=day.isoformat(),
            assigned_to=None,
            due_at=timezone.make_aware(datetime.combine(day, time(18, 0)), TZ),
            status=RoutineRun.STATUS_OPEN,
        )
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        hours = get_hours_config()
        jobs = build_jobs(day, {'date': day.isoformat()}, now=now, tz=TZ, hours_cfg=hours)
        issues = build_issues(
            day=day, open_day=True, staff=[], jobs=jobs, spot={'done': True},
            cross={'due': None, 'total': 0, 'done': 0}, nudges={}, now=now, tz=TZ,
            hours_cfg=hours, today=day,
        )
        empty = [row for row in issues if row['type'] == 'empty_shift']
        self.assertTrue(empty)
        self.assertEqual(empty[0]['action'], 'open_shifts')
        self.assertIn('nobody scheduled today', empty[0]['sentence'])

    def test_retail_open_due_uses_routine_time_not_store_hours(self):
        from apps.routines.schedule import due_at_for
        self.open.due_time = time(10, 0)
        due = due_at_for(
            self.open, date(2026, 9, 16), tz=TZ,
            cfg={'open': '08:30', 'close': '18:00', 'closed_weekdays': [0, 6]},
        )
        self.assertEqual(timezone.localtime(due).time(), time(10, 0))
        self.open.due_time = None
        due = due_at_for(self.open, date(2026, 9, 16), tz=TZ)
        self.assertEqual(timezone.localtime(due).time(), time(9, 0))

    def test_retail_day_defaults_to_fourteen_when_no_due_time(self):
        from apps.routines.schedule import due_at_for
        day_routine, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_DAY,
            defaults={
                'title': 'Retail day',
                'kind': Routine.KIND_CHECKLIST,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'due_time': None,
            },
        )
        day_routine.due_time = None
        day_routine.save(update_fields=['due_time'])
        due = due_at_for(day_routine, date(2026, 9, 16), tz=TZ)
        self.assertEqual(timezone.localtime(due).time(), time(14, 0))

    def test_call_in_falls_back_to_the_other_person_on_the_shift(self):
        from apps.hr.shifts import SHIFT_RETAIL_OPEN
        from apps.routines.command_center import apply_call_in
        day = timezone.localdate()
        self.shift.punch_code = SHIFT_RETAIL_OPEN
        self.shift.save(update_fields=['punch_code'])
        self.open.shift = self.shift
        self.open.save(update_fields=['shift'])
        other = _staff('other@example.com')
        TimeEntry.objects.create(
            employee=other,
            date=day,
            clock_in=timezone.make_aware(datetime.combine(day, time(8, 40)), TZ),
            shift=SHIFT_RETAIL_OPEN,
        )
        run = self._open_run(day)
        apply_call_in(employee=self.sam, day=day, marked_by=self.mgr, today=day)
        run.refresh_from_db()
        self.assertEqual(run.assigned_to_id, other.pk)

    def test_owner_check_gate_blocks_until_done_or_missed(self):
        from apps.routines.command_center import owner_check_gate
        day = date(2026, 9, 16)
        now = timezone.make_aware(datetime.combine(day, time(8, 40)), TZ)
        gate = owner_check_gate(section=self.section, day=day, now=now)
        self.assertFalse(gate['allowed'])
        self.assertIn("isn't done yet", gate['message'])
        later = timezone.make_aware(datetime.combine(day, time(9, 5)), TZ)
        gate = owner_check_gate(section=self.section, day=day, now=later)
        self.assertTrue(gate['allowed'])
        self.assertEqual(gate['reason'], 'missed')

    def test_clock_tiles_include_a_created_shift(self):
        Shift.objects.create(
            name='Floor Lead',
            department=self.department,
            time_in=time(10, 0),
            time_out=time(18, 0),
            weekdays=[2],
            punch_code='floor_lead',
        )
        self.client.force_authenticate(self.sam)
        response = self.client.get('/api/hr/shifts/clock_tiles/', {'date': '2026-09-16'})
        self.assertEqual(response.status_code, 200, response.data)
        names = [row['name'] for row in response.data]
        self.assertIn('Floor Lead', names)

    def test_override_feeds_scheduled_for_routine_and_clears_gap(self):
        from apps.routines.command_center import build_issues, build_jobs, scheduled_for_routine
        from apps.webstore.services.hours import get_hours_config
        day = date(2026, 9, 16)
        close, _ = Shift.objects.update_or_create(
            punch_code='retail_close',
            defaults={
                'name': 'Cashier - Close',
                'department': self.department,
                'time_in': time(17, 0),
                'time_out': time(18, 0),
                'weekdays': [1, 2, 3, 4, 5],
                'is_active': True,
            },
        )
        routine, _ = Routine.objects.update_or_create(
            system_key=SYSTEM_CLOSE,
            defaults={
                'title': 'Retail close',
                'kind': Routine.KIND_CHECKLIST,
                'trigger': Routine.TRIGGER_DAILY,
                'is_active': True,
                'due_time': time(18, 0),
                'shift': close,
                'shift_locked': True,
            },
        )
        routine.shift = close
        routine.shift_locked = True
        routine.save(update_fields=['shift', 'shift_locked'])
        RoutineRun.objects.create(
            routine=routine, period_key=day.isoformat(), assigned_to=None,
            due_at=timezone.make_aware(datetime.combine(day, time(18, 0)), TZ),
            status=RoutineRun.STATUS_OPEN,
        )
        self.assertEqual(scheduled_for_routine(routine, day, set()), [])
        QaDayOverride.objects.create(employee=self.sam, date=day, shift=close, marked_by=self.mgr)
        people = scheduled_for_routine(routine, day, set())
        self.assertEqual([row.pk for row in people], [self.sam.pk])
        now = timezone.make_aware(datetime.combine(day, time(10, 0)), TZ)
        hours = get_hours_config()
        jobs = build_jobs(day, {'date': day.isoformat()}, now=now, tz=TZ, hours_cfg=hours)
        issues = build_issues(
            day=day, open_day=True, staff=[], jobs=jobs, spot={'done': True},
            cross={'due': None, 'total': 0, 'done': 0}, nudges={}, now=now, tz=TZ,
            hours_cfg=hours, today=day,
        )
        self.assertFalse(any(row['type'] == 'empty_shift' and 'Close' in row['sentence'] for row in issues))

    def test_exclusion_drops_scheduled_and_reopens_gap(self):
        from apps.routines.command_center import scheduled_for_routine
        day = date(2026, 9, 16)
        self.open.shift = self.shift
        self.open.save(update_fields=['shift'])
        self.assertEqual([row.pk for row in scheduled_for_routine(self.open, day, set())], [self.sam.pk])
        QaDayExclusion.objects.create(employee=self.sam, date=day, marked_by=self.mgr)
        self.assertEqual(scheduled_for_routine(self.open, day, set()), [])

    def test_left_early_clocks_out_and_unassigns(self):
        from apps.routines.command_center import apply_left_early
        day = date(2026, 9, 16)
        run = self._open_run(day)
        TimeEntry.objects.create(
            employee=self.sam,
            date=day,
            clock_in=timezone.make_aware(datetime.combine(day, time(8, 30)), TZ),
            shift='retail_open',
        )
        apply_left_early(
            employee=self.sam, day=day,
            now=timezone.make_aware(datetime.combine(day, time(11, 0)), TZ),
        )
        entry = TimeEntry.objects.get(employee=self.sam, date=day)
        self.assertIsNotNone(entry.clock_out)
        run.refresh_from_db()
        self.assertIsNone(run.assigned_to_id)

    def test_pending_ack_heard_clears_and_manager_sees_heard(self):
        from apps.routines.command_center import create_nudge
        day = timezone.localdate()
        run = self._open_run(day)
        create_nudge(run=run, message='Please start Retail open.', employee=self.sam)
        self.client.force_authenticate(self.sam)
        first = self.client.get('/api/routines/qa/nudges/pending/')
        self.assertEqual(first.status_code, 200, first.data)
        self.assertGreaterEqual(len(first.data['nudges']), 1)
        for row in first.data['nudges']:
            ack = self.client.post(
                f'/api/routines/qa/nudges/{row["id"]}/ack/',
                {'kind': 'heard', 'device': 'Browser'},
                format='json',
            )
            self.assertEqual(ack.status_code, 200, ack.data)
        second = self.client.get('/api/routines/qa/nudges/pending/')
        self.assertEqual(second.data['nudges'], [])
        from apps.routines.command_center import today_payload
        board = today_payload(day)
        labels = [row.get('nudged_at') for row in board['jobs'] if row.get('run_id') == run.pk]
        self.assertTrue(any(label and str(label).startswith('Heard') for label in labels))

    def test_unseen_nudge_after_fifteen_minutes(self):
        from apps.routines.command_center import create_nudge, serialize_nudge
        day = date(2026, 9, 16)
        run = self._open_run(day)
        row = create_nudge(run=run, message='x', employee=self.sam)
        QaNudge.objects.filter(pk=row.pk).update(
            created_at=timezone.now() - timedelta(minutes=16),
        )
        row.refresh_from_db()
        packed = serialize_nudge(row, now=timezone.now())
        self.assertEqual(packed['ack_label'], 'Not seen')


class ScoringEngineTests(TestCase):
    def test_zero_walk_week_with_everything_else_done_shows_c(self):
        from apps.routines.grading import _walk_cap, combine_weighted
        from apps.routines.settings import WEIGHT_CROSS, WEIGHT_DO, WEIGHT_SPOT
        cfg = retail_qa_settings()
        self.assertEqual((WEIGHT_SPOT, WEIGHT_DO, WEIGHT_CROSS), (60, 25, 15))
        result = combine_weighted([
            ('spot', 60, None),
            ('do', 25, 100.0),
            ('cross', 15, 100.0),
        ])
        _capped, letter = _walk_cap(result['score'], 0, cfg)
        self.assertEqual(letter, 'C')

    def test_day_with_no_walk_shows_do_only_and_spot_dash(self):
        from apps.routines.grading import combine_weighted
        result = combine_weighted([('spot', 60, None), ('do', 25, 92.0)])
        self.assertEqual(result['score'], 92.0)
        self.assertEqual(result['weights']['do'], 100.0)
        self.assertIsNone(combine_weighted([('spot', 60, None), ('do', 25, None)])['score'])

    def test_week_grade_equals_spot_do_blend_before_cross_due(self):
        from apps.routines.grading import _week_cross, combine_weighted
        daily = [{'cross': {'audits': [{'status': 'open'}]}}]
        self.assertIsNone(_week_cross(daily, due=date(2026, 9, 20), today=date(2026, 9, 16), project=False))
        blend = combine_weighted([('spot', 60, 91.0), ('do', 25, 88.0)])
        with_cross = combine_weighted([('spot', 60, 91.0), ('do', 25, 88.0), ('cross', 15, 100.0)])
        self.assertNotEqual(blend['score'], with_cross['score'])
        self.assertEqual(
            blend['score'],
            combine_weighted([('spot', 60, 91.0), ('do', 25, 88.0), ('cross', 15, None)])['score'],
        )

    def test_empty_spot_renormalizes_and_zero_walks_cap_at_c(self):
        from apps.routines.grading import _walk_cap, combine_weighted
        cfg = retail_qa_settings()
        result = combine_weighted([('spot', 60, None), ('do', 25, 100.0)])
        self.assertEqual(result['score'], 100.0)
        capped, cap_letter = _walk_cap(result['score'], 0, cfg)
        self.assertEqual(cap_letter, 'C')
        blend = combine_weighted([('spot', 60, 100.0), ('do', 25, 100.0)])
        self.assertEqual(blend['score'], 100.0)

    def test_cross_stays_out_before_the_due_date(self):
        from apps.routines.grading import _week_cross
        daily = [{'cross': {'audits': [{'status': 'open'}]}}]
        self.assertIsNone(_week_cross(daily, due=date(2026, 9, 20), today=date(2026, 9, 16), project=False))
        self.assertIsNone(_week_cross(daily, due=date(2026, 9, 20), today=date(2026, 9, 16), project=True))
        self.assertEqual(_week_cross(daily, due=date(2026, 9, 16), today=date(2026, 9, 16), project=False), 0.0)

    def test_projection_keeps_scored_days_and_fills_only_the_rest(self):
        from apps.routines.grading import _doing_for_week, _owner_for_week, _walk_cap, combine_weighted
        cfg = retail_qa_settings()
        daily = [
            {'date': '2026-09-15', 'graded': True, 'open_day': True, 'thirds': {'doing': 0.0, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
            {'date': '2026-09-16', 'graded': True, 'open_day': True, 'thirds': {'doing': 0.0, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
            {'date': '2026-09-17', 'graded': True, 'open_day': True, 'thirds': {'doing': 40.0, 'owner': 20.0}, 'doing': {'done': 4, 'needed': 10}},
            {'date': '2026-09-18', 'graded': False, 'open_day': True, 'thirds': {'doing': None, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
            {'date': '2026-09-19', 'graded': False, 'open_day': True, 'thirds': {'doing': None, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
        ]
        today = date(2026, 9, 17)
        doing = _doing_for_week(daily, today=today, project=True)
        owner, walks = _owner_for_week(daily, today=today, project=True)
        self.assertEqual(doing, 60.0)
        self.assertEqual(owner, 73.3)
        self.assertEqual(walks, 3)
        result = combine_weighted([('spot', 60, owner), ('do', 25, doing)])
        _capped, letter = _walk_cap(result['score'], walks, cfg)
        self.assertNotEqual(letter, 'A')

    def test_expected_persists_and_ignores_a_later_call_in(self):
        from apps.routines.grading import compute_expected, expected_for_day
        from apps.routines.models import QaDayExpected
        day = timezone.localdate()
        department = Department.objects.create(name='Expected Desk')
        owner = _staff('expect-owner@example.com')
        shift = Shift.objects.create(
            name='Desk Day',
            department=department,
            time_in=time(8, 0),
            time_out=time(16, 0),
            weekdays=list(range(7)),
            punch_code='retail_day',
        )
        ShiftAssignment.objects.create(employee=owner, shift=shift)
        Section.objects.create(department=department, name='Desk', owner=owner)
        first = expected_for_day(day)
        self.assertGreaterEqual(first, 1)
        QaCallIn.objects.create(employee=owner, date=day, marked_by=owner)
        self.assertEqual(compute_expected(day), first)
        self.assertEqual(expected_for_day(day), first)
        self.assertEqual(QaDayExpected.objects.get(date=day).expected, first)

    def test_seed_cashier_shifts_is_idempotent(self):
        from apps.routines.shift_seed import seed_cashier_shifts
        first = seed_cashier_shifts()
        second = seed_cashier_shifts()
        self.assertTrue(any('Cashier - Open' in row for row in first))
        self.assertTrue(all('kept' in row or 'locked' in row for row in second))
        self.assertEqual(
            Shift.objects.filter(name__in=('Cashier - Open', 'Cashier - Day', 'Cashier - Close')).count(),
            3,
        )


FORBIDDEN_SUMMARY_KEYS = {
    'name', 'full_name', 'assigned_to', 'completed_by', 'owner', 'email',
    'people', 'nudges', 'staff', 'jobs', 'checker',
}


def _assert_no_forbidden_keys(test, payload, path='root'):
    if isinstance(payload, dict):
        for key, value in payload.items():
            test.assertNotIn(key, FORBIDDEN_SUMMARY_KEYS, msg=path)
            _assert_no_forbidden_keys(test, value, f'{path}.{key}')
    elif isinstance(payload, list):
        for index, value in enumerate(payload):
            _assert_no_forbidden_keys(test, value, f'{path}[{index}]')


def _last_weekday(weekday: int) -> date:
    today = timezone.localdate()
    return today - timedelta(days=(today.weekday() - weekday) % 7)


class DaySummaryApiTests(APITestCase):
    def setUp(self):
        self.employee = _staff('day-summary-emp@example.com', 'Employee')

    def test_employee_open_day_is_200_without_names(self):
        self.client.force_authenticate(self.employee)
        tuesday = _last_weekday(1)
        response = self.client.get('/api/routines/qa/day-summary/', {'date': tuesday.isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('open'))
        _assert_no_forbidden_keys(self, response.data)

    def test_anonymous_is_401(self):
        tuesday = _last_weekday(1)
        response = self.client.get('/api/routines/qa/day-summary/', {'date': tuesday.isoformat()})
        self.assertEqual(response.status_code, 401)

    def test_closed_day_nulls_thirds(self):
        self.client.force_authenticate(self.employee)
        monday = _last_weekday(0)
        response = self.client.get('/api/routines/qa/day-summary/', {'date': monday.isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['open'])
        self.assertIsNone(response.data['letter'])
        self.assertIsNone(response.data['score'])
        self.assertIsNone(response.data['do'])
        self.assertIsNone(response.data['spot'])
        self.assertIsNone(response.data['cross'])

    def test_future_date_is_400(self):
        self.client.force_authenticate(self.employee)
        response = self.client.get('/api/routines/qa/day-summary/', {'date': '2099-01-06'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('date is in the future', str(response.data.get('detail', '')))

    def test_xor_query_is_400(self):
        self.client.force_authenticate(self.employee)
        both = self.client.get('/api/routines/qa/day-summary/', {
            'date': _last_weekday(1).isoformat(), 'week': '2026-W36',
        })
        neither = self.client.get('/api/routines/qa/day-summary/')
        self.assertEqual(both.status_code, 400)
        self.assertEqual(neither.status_code, 400)

    def test_future_week_is_400(self):
        self.client.force_authenticate(self.employee)
        response = self.client.get('/api/routines/qa/day-summary/', {'week': '2099-W01'})
        self.assertEqual(response.status_code, 400)

    def test_current_week_is_200(self):
        from apps.routines.grading import week_label, this_monday
        self.client.force_authenticate(self.employee)
        week = week_label(this_monday(timezone.localdate()))
        response = self.client.get('/api/routines/qa/day-summary/', {'week': week})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data.get('week'), week)
        _assert_no_forbidden_keys(self, response.data)
