"""Time kiosk: card identity, preview, boards, gate, throttles, public route."""
from datetime import datetime, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.core.models import AppSetting
from apps.hr import kiosk_service as svc
from apps.hr.models import (
    Department, KioskEvent, Shift, ShiftAssignment, TimeEntry, TimeEntryModificationRequest,
)
from apps.hr.shift_set import apply_shift_set
from apps.routines.models import QaCallIn, QaNudge, Routine, RoutineRun

TZ = ZoneInfo('America/Chicago')
# Wednesday. Retail Open runs Tue-Sat 08:30-14:30.
WED = datetime(2026, 9, 16, 9, 0, tzinfo=TZ)
MON = datetime(2026, 9, 14, 9, 30, tzinfo=TZ)


def _staff(email, first, last, role='Employee', *, superuser=False, active=True):
    group, _ = Group.objects.get_or_create(name=role)
    user = User.objects.create_user(
        email=email, first_name=first, last_name=last, password='pw', is_staff=True,
        is_superuser=superuser, is_active=active,
    )
    user.groups.add(group)
    EmployeeProfile.objects.create(
        user=user, employee_number=EmployeeProfile.generate_employee_number(),
        hire_date=timezone.localdate(),
    )
    return user


def _issue(user) -> str:
    token = svc.mint_token()
    profile = user.employee
    profile.badge_token_hash = svc.hash_token(token)
    profile.badge_issued_at = timezone.now()
    profile.save(update_fields=['badge_token_hash', 'badge_issued_at'])
    return token


def _assign(user, code, weekdays=None):
    shift = Shift.objects.get(punch_code=code)
    return ShiftAssignment.objects.create(
        employee=user, shift=shift, weekdays=weekdays if weekdays is not None else shift.weekdays,
    )


class KioskBase(APITestCase):
    def setUp(self):
        cache.clear()
        apply_shift_set()
        self.host = _staff('host@example.com', 'Kiosk', 'Host')
        self.maria = _staff('maria@example.com', 'Maria', 'Ramirez')
        self.token = _issue(self.maria)
        self.ctx = svc.KioskContext(route=KioskEvent.ROUTE_KIOSK, host=self.host, ip='10.0.0.1')

    def hosted(self):
        self.client.force_authenticate(self.host)
        return self.client

    def public(self):
        self.client.force_authenticate(None)
        return self.client


class IdentifyTests(KioskBase):
    def test_hash_lookup_finds_the_card_holder(self):
        self.assertEqual(svc.identify(self.token), self.maria)
        self.assertEqual(svc.identify(self.token.lower()), self.maria)

    def test_unknown_revoked_and_inactive_all_look_the_same(self):
        revoked = _staff('rev@example.com', 'Rev', 'Oked')
        rev_token = _issue(revoked)
        revoked.employee.badge_revoked_at = timezone.now()
        revoked.employee.save(update_fields=['badge_revoked_at'])
        gone = _staff('gone@example.com', 'Gone', 'Person', active=False)
        gone_token = _issue(gone)

        client = self.hosted()
        bodies = set()
        for token in ('ZZZZZZZZZZ', rev_token, gone_token):
            res = client.post('/api/hr/kiosk/identify/', {'token': token}, format='json')
            self.assertEqual(res.status_code, 404, res.data)
            bodies.add((res.data['detail'], res.data.get('code')))
        self.assertEqual(bodies, {(svc.GENERIC_MESSAGE, 'card')})

    def test_identify_never_mints_a_jwt_or_changes_the_host(self):
        res = self.hosted().post('/api/hr/kiosk/identify/', {'token': self.token}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertNotIn('access', res.data)
        self.assertNotIn('refresh_token', res.cookies)
        self.assertEqual(res.data['id'], self.maria.pk)
        self.assertEqual(res.data['full_name'], 'Maria Ramirez')
        event = KioskEvent.objects.get(action='identify_ok')
        self.assertEqual(event.host_id, self.host.pk)
        self.assertEqual(event.subject_id, self.maria.pk)
        self.assertEqual(event.route, 'kiosk')

    def test_hosted_throttle_locks_after_twenty_failures_with_one_cooldown_event(self):
        client = self.hosted()
        for _ in range(svc.HOSTED_FAIL_LIMIT):
            res = client.post('/api/hr/kiosk/identify/', {'token': 'ZZZZZZZZZZ'}, format='json')
            self.assertEqual(res.status_code, 404)
        self.assertEqual(KioskEvent.objects.filter(action='cooldown').count(), 1)
        # Locked: even the real card gets the generic line.
        res = client.post('/api/hr/kiosk/identify/', {'token': self.token}, format='json')
        self.assertEqual(res.status_code, 404)
        self.assertEqual(res.data['detail'], svc.GENERIC_MESSAGE)
        self.assertIsNone(KioskEvent.objects.get(action='cooldown').subject_id)

    def test_a_good_scan_resets_the_failure_count(self):
        client = self.hosted()
        for _ in range(svc.HOSTED_FAIL_LIMIT - 1):
            res = client.post('/api/hr/kiosk/identify/', {'token': 'ZZZZZZZZZZ'}, format='json')
            self.assertEqual(res.status_code, 404)
        res = client.post('/api/hr/kiosk/identify/', {'token': self.token}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        res = client.post('/api/hr/kiosk/identify/', {'token': 'ZZZZZZZZZZ'}, format='json')
        self.assertEqual(res.status_code, 404)
        self.assertEqual(KioskEvent.objects.filter(action='cooldown').count(), 0)
        res = client.post('/api/hr/kiosk/identify/', {'token': self.token}, format='json')
        self.assertEqual(res.status_code, 200, res.data)


class PreviewTests(KioskBase):
    def test_preview_joins_roster_and_punch_code(self):
        _assign(self.maria, 'retail_open')
        data = svc.preview(self.maria, now=WED)
        self.assertEqual(data['state'], 'out')
        self.assertEqual(data['name'], 'Maria R.')
        self.assertEqual(data['suggested_shift']['punch_code'], 'retail_open')
        self.assertEqual(data['suggested_shift']['name'], 'Retail Open')
        self.assertEqual(data['suggested_shift']['department'], 'Retail')
        self.assertEqual(data['suggested_shift']['time_in'], '08:30')
        self.assertFalse(data['suggested_shift_unmatched'])
        self.assertIn('retail_open', {tile['punch_code'] for tile in data['tiles']})
        self.assertEqual(data['warnings']['late'], {'minutes': 30, 'shift_name': 'Retail Open'})

    def test_unmatched_when_the_roster_shift_has_no_tile(self):
        retail = Department.objects.get(slug='retail-operations')
        odd = Shift.objects.create(
            name='Retail Odd', department=retail, time_in='07:00', time_out='11:00', weekdays=[2],
        )
        ShiftAssignment.objects.create(employee=self.maria, shift=odd, weekdays=[2])
        data = svc.preview(self.maria, now=WED, ctx=self.ctx)
        self.assertTrue(data['suggested_shift_unmatched'])
        self.assertTrue(KioskEvent.objects.filter(action='unmatched_shift').exists())

    def test_public_preview_has_no_full_name_hosted_does(self):
        self.assertNotIn('full_name', svc.preview(self.maria, now=WED, redacted=True))
        self.assertEqual(svc.preview(self.maria, now=WED)['full_name'], 'Maria Ramirez')

    def test_store_closed_warning_only_for_an_unscheduled_punch_on_a_closed_day(self):
        self.assertTrue(svc.preview(self.maria, now=MON)['warnings']['store_closed'])
        _assign(self.maria, 'retail_reset')
        self.assertFalse(svc.preview(self.maria, now=MON)['warnings']['store_closed'])


class PunchTests(KioskBase):
    def test_stale_fix_closes_at_the_suggested_out_and_files_the_request(self):
        started = WED - timedelta(hours=20)
        punch = TimeEntry.objects.create(employee=self.maria, clock_in=started, shift='retail_open')
        data = svc.preview(self.maria, now=WED)
        self.assertEqual(data['state'], 'stale')
        self.assertEqual(data['gate'][0]['kind'], 'stale_punch')
        suggested = svc.suggested_clock_out(punch, now=WED)
        self.assertGreater(suggested, started)
        self.assertLessEqual(suggested, WED)

        svc.fix_stale(self.maria, ctx=self.ctx, now=WED)
        punch.refresh_from_db()
        self.assertEqual(punch.clock_out, suggested)
        req = TimeEntryModificationRequest.objects.get(time_entry=punch)
        self.assertEqual(req.reason, svc.REASON_FORGOT_TO_CLOCK_OUT)
        self.assertEqual(req.status, 'pending')
        self.assertEqual(req.requested_clock_out, suggested)
        self.assertEqual(svc.preview(self.maria, now=WED)['state'], 'out')

    def test_stale_suggestion_uses_the_roster_out_time_when_assigned(self):
        _assign(self.maria, 'retail_open')
        started = datetime(2026, 9, 15, 8, 30, tzinfo=TZ)  # Tuesday
        punch = TimeEntry.objects.create(employee=self.maria, clock_in=started, shift='retail_open')
        self.assertEqual(
            svc.suggested_clock_out(punch, now=WED),
            datetime(2026, 9, 15, 14, 30, tzinfo=TZ),
        )

    def test_wrong_shift_relabels_without_closing(self):
        punch = TimeEntry.objects.create(employee=self.maria, clock_in=WED - timedelta(hours=1), shift='retail_open')
        svc.set_shift(self.maria, shift='retail_close', ctx=self.ctx, now=WED)
        punch.refresh_from_db()
        self.assertEqual(punch.shift, 'retail_close')
        self.assertIsNone(punch.clock_out)

    def test_clock_in_out_and_break_through_the_hosted_api(self):
        client = self.hosted()
        res = client.post('/api/hr/kiosk/clock-in/', {'token': self.token, 'shift': 'retail_open'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['state'], 'in')
        self.assertEqual(res.data['result']['action'], 'clock_in')
        res = client.post('/api/hr/kiosk/clock-in/', {'token': self.token, 'shift': 'retail_open'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data['detail'], 'Already clocked in.')
        res = client.post('/api/hr/kiosk/break/', {'token': self.token, 'action': 'start'}, format='json')
        self.assertEqual(res.data['state'], 'break')
        res = client.post('/api/hr/kiosk/break/', {'token': self.token, 'action': 'end'}, format='json')
        self.assertEqual(res.data['state'], 'in')
        res = client.post('/api/hr/kiosk/clock-out/', {'token': self.token}, format='json')
        self.assertEqual(res.data['state'], 'out')
        self.assertEqual(
            list(KioskEvent.objects.filter(subject=self.maria).order_by('id').values_list('action', flat=True)),
            ['clock_in', 'break_start', 'break_end', 'clock_out'],
        )

    def test_request_edit_files_a_pending_request(self):
        TimeEntry.objects.create(employee=self.maria, clock_in=WED - timedelta(hours=1), shift='retail_open')
        res = self.hosted().post(
            '/api/hr/kiosk/request-edit/',
            {'token': self.token, 'kind': 'forgot_break', 'value': 30}, format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        req = TimeEntryModificationRequest.objects.get(employee=self.maria)
        self.assertEqual(req.requested_break_minutes, 30)
        self.assertEqual(req.status, 'pending')


class GateTests(KioskBase):
    def setUp(self):
        super().setUp()
        self.routine = Routine.objects.create(
            title='Open checklist', gate_on_miss=True, assignment=Routine.ASSIGN_PER_PERSON,
        )
        self.optional = Routine.objects.create(title='Optional', gate_on_miss=False)

    def _missed(self, routine, due_at, **extra):
        return RoutineRun.objects.create(
            routine=routine, period_key=due_at.date().isoformat(), due_at=due_at,
            assigned_to=self.maria, status=RoutineRun.STATUS_MISSED, **extra,
        )

    def test_yesterdays_miss_before_clock_out_is_in_the_gate(self):
        yesterday_due = WED - timedelta(days=1, hours=1)  # Tue 08:00
        run = self._missed(self.routine, yesterday_due)
        TimeEntry.objects.create(
            employee=self.maria, clock_in=WED - timedelta(days=1), clock_out=WED - timedelta(days=1) + timedelta(hours=6),
            shift='retail_open',
        )
        self._missed(self.routine, WED - timedelta(days=40))  # too old
        self._missed(self.routine, WED - timedelta(days=2), miss_reason='forgot')  # already answered
        self._missed(self.optional, WED - timedelta(days=1))  # not gated
        gate = svc.build_gate(self.maria, None, now=WED)
        self.assertEqual([item['kind'] for item in gate], ['missed_routines'])
        self.assertEqual([row['id'] for row in gate[0]['runs']], [run.pk])

    def test_clock_in_blocks_until_every_run_has_a_reason_then_stores_it(self):
        run = self._missed(self.routine, WED - timedelta(days=1))
        with self.assertRaises(svc.KioskError) as caught:
            svc.clock_in(self.maria, shift='retail_open', gate={}, ctx=self.ctx, now=WED)
        self.assertEqual(caught.exception.code, 'missed_routines')
        with self.assertRaises(svc.KioskError):
            svc.clock_in(
                self.maria, shift='retail_open',
                gate={'missed_routines': [{'run': run.pk, 'reason': 'other', 'note': ''}]},
                ctx=self.ctx, now=WED,
            )
        self.assertFalse(TimeEntry.objects.filter(employee=self.maria).exists())
        svc.clock_in(
            self.maria, shift='retail_open',
            gate={'missed_routines': [{'run': run.pk, 'reason': 'forgot', 'note': ''}]},
            ctx=self.ctx, now=WED,
        )
        run.refresh_from_db()
        self.assertEqual(run.miss_reason, 'forgot')
        self.assertEqual(run.miss_reason_by_id, self.maria.pk)
        self.assertEqual(run.miss_reason_at, WED)
        self.assertTrue(TimeEntry.objects.filter(employee=self.maria, clock_out__isnull=True).exists())
        cleared = KioskEvent.objects.get(action='gate_cleared')
        self.assertEqual(cleared.meta, {'kind': 'missed_routines', 'count': 1})

    def test_a_gated_run_that_vanishes_returns_400(self):
        run = self._missed(self.routine, WED - timedelta(days=1))
        real = svc.missed_runs_for

        def drop_after_listing(user, *, now):
            rows = real(user, now=now)
            run.delete()
            return rows

        with patch('apps.hr.kiosk_service.missed_runs_for', side_effect=drop_after_listing):
            with self.assertRaises(svc.KioskError) as caught:
                svc.clock_in(
                    self.maria, shift='retail_open',
                    gate={'missed_routines': [{'run': run.pk, 'reason': 'forgot'}]},
                    ctx=self.ctx, now=WED,
                )
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(caught.exception.code, 'missed_routines')
        self.assertFalse(TimeEntry.objects.filter(employee=self.maria).exists())

    def test_nudge_gate_hears_with_the_route_device(self):
        run = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-09-16', due_at=WED, assigned_to=self.maria,
        )
        nudge = QaNudge.objects.create(run=run, employee=self.maria, message='Please start the open')
        with patch('apps.routines.command_center.fire_hard_deadline_nudges'):
            gate = svc.build_gate(self.maria, None, now=WED)
            self.assertEqual(gate[0]['kind'], 'nudge')
            self.assertEqual(gate[0]['nudges'][0]['id'], nudge.pk)
            with self.assertRaises(svc.KioskError) as caught:
                svc.clock_in(self.maria, shift='retail_open', gate={}, ctx=self.ctx, now=WED)
            self.assertEqual(caught.exception.code, 'nudge')
            public = svc.KioskContext(route=KioskEvent.ROUTE_CLOCK, host=None, ip='10.0.0.2')
            svc.clock_in(self.maria, shift='retail_open', gate={'nudge': [nudge.pk]}, ctx=public, now=WED)
        nudge.refresh_from_db()
        self.assertEqual(nudge.ack_kind, 'heard')
        self.assertEqual(nudge.acked_by_device, 'Clock')

    def test_a_failed_clock_in_stores_nothing(self):
        run = self._missed(self.routine, WED - timedelta(days=1))
        nudge_run = RoutineRun.objects.create(
            routine=self.routine, period_key='2026-09-16', due_at=WED, assigned_to=self.maria,
        )
        nudge = QaNudge.objects.create(run=nudge_run, employee=self.maria, message='hi')
        real_log = svc.log_event

        def explode(ctx, action, **kwargs):
            if action == 'clock_in':
                raise RuntimeError('boom')
            return real_log(ctx, action, **kwargs)

        with patch('apps.routines.command_center.fire_hard_deadline_nudges'), \
                patch('apps.hr.kiosk_service.log_event', side_effect=explode):
            with self.assertRaises(RuntimeError):
                svc.clock_in(
                    self.maria, shift='retail_open',
                    gate={'missed_routines': [{'run': run.pk, 'reason': 'forgot'}], 'nudge': [nudge.pk]},
                    ctx=self.ctx, now=WED,
                )
        run.refresh_from_db()
        nudge.refresh_from_db()
        self.assertEqual(run.miss_reason, '')
        self.assertIsNone(nudge.acked_at)
        self.assertFalse(TimeEntry.objects.filter(employee=self.maria).exists())
        self.assertFalse(KioskEvent.objects.filter(action='gate_cleared').exists())

    def test_stale_punch_must_be_fixed_before_clock_in(self):
        TimeEntry.objects.create(employee=self.maria, clock_in=WED - timedelta(hours=20), shift='retail_open')
        with self.assertRaises(svc.KioskError) as caught:
            svc.clock_in(self.maria, shift='retail_open', gate={}, ctx=self.ctx, now=WED)
        self.assertEqual(caught.exception.code, 'stale_punch')


class BoardTests(KioskBase):
    def setUp(self):
        super().setUp()
        self.late = _staff('late@example.com', 'Lou', 'Late')
        self.brk = _staff('brk@example.com', 'Bea', 'Break')
        self.called = _staff('called@example.com', 'Cal', 'Called')
        self.unsched = _staff('un@example.com', 'Uma', 'Unscheduled')
        for user in (self.maria, self.late, self.brk, self.called):
            _assign(user, 'retail_open')
        TimeEntry.objects.create(employee=self.maria, clock_in=WED - timedelta(minutes=40), shift='retail_open')
        TimeEntry.objects.create(
            employee=self.brk, clock_in=WED - timedelta(minutes=40), shift='retail_open',
            on_break=True, break_started_at=WED - timedelta(minutes=5),
        )
        QaCallIn.objects.create(employee=self.called, date=WED.date())
        dead = Department.objects.create(name='Dead', slug='dead', is_active=False)
        Shift.objects.create(
            name='Dead shift', department=dead, time_in='09:00', time_out='17:00', punch_code='dead_code',
        )
        TimeEntry.objects.create(employee=self.unsched, clock_in=WED - timedelta(minutes=10), shift='dead_code')

    def _rows(self, redacted):
        board = svc.build_board(redacted=redacted, now=WED)
        return {row['id']: row for row in board['rows']}, board

    def test_hosted_board_has_every_chip_and_groups_by_department(self):
        rows, board = self._rows(False)
        self.assertEqual(rows[self.maria.pk]['status'], 'in')
        self.assertEqual(rows[self.maria.pk]['in_time'], '08:20')
        self.assertEqual(rows[self.brk.pk]['status'], 'break')
        self.assertEqual(rows[self.late.pk]['status'], 'late')
        self.assertEqual(rows[self.late.pk]['late_minutes'], 30)
        self.assertEqual(rows[self.called.pk]['status'], 'called_in')
        self.assertEqual(rows[self.maria.pk]['department_name'], 'Retail')
        self.assertEqual(rows[self.maria.pk]['name'], 'Maria R.')

    def test_an_unscheduled_punch_with_an_inactive_department_lands_in_other(self):
        rows, board = self._rows(False)
        self.assertTrue(rows[self.unsched.pk]['other'])
        self.assertEqual(rows[self.unsched.pk]['department_name'], 'Other')
        self.assertEqual(board['departments'][-1]['slug'], 'other')

    def test_public_board_is_redacted(self):
        rows, board = self._rows(True)
        self.assertNotIn(self.unsched.pk, rows)
        self.assertEqual(rows[self.brk.pk]['status'], 'in')
        self.assertEqual(rows[self.called.pk]['status'], 'out')
        self.assertEqual(rows[self.late.pk]['status'], 'late')
        self.assertEqual(rows[self.maria.pk]['expected_time'], '08:30')
        allowed = {
            'id', 'name', 'shift_name', 'expected_time', 'status',
            'department_id', 'department_name', 'department_slug', 'department_icon', 'department_sort', 'other',
        }
        for row in rows.values():
            self.assertEqual(set(row), allowed, row)
            self.assertNotIn('Ramirez', row['name'])
            self.assertIn(row['status'], {'in', 'out', 'expected', 'late'})
        dumped = str(board)
        for forbidden in ('called_in', 'late_minutes', 'in_time', 'break', 'Ramirez', 'Called in'):
            self.assertNotIn(forbidden, dumped)


class PublicRouteTests(KioskBase):
    def test_public_board_and_mutations_work_with_a_card_and_nothing_else(self):
        client = self.public()
        res = client.get('/api/hr/clock/board/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['redacted'])
        self.assertIn('clock_device', res.cookies)

        res = client.post('/api/hr/clock/identify/', {'token': self.token}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertNotIn('full_name', res.data)
        self.assertEqual(res.data['name'], 'Maria R.')

        res = client.post('/api/hr/clock/clock-in/', {'token': self.token, 'shift': 'retail_open'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        event = KioskEvent.objects.get(action='clock_in')
        self.assertEqual(event.route, 'clock')
        self.assertIsNone(event.host_id)

        res = client.post('/api/hr/clock/clock-out/', {}, format='json')
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.data['detail'], svc.GENERIC_MESSAGE)
        self.assertTrue(TimeEntry.objects.filter(employee=self.maria, clock_out__isnull=True).exists())

    def test_public_has_no_set_shift_or_request_edit(self):
        client = self.public()
        self.assertEqual(client.post('/api/hr/clock/set-shift/', {}).status_code, 404)
        self.assertEqual(client.post('/api/hr/clock/request-edit/', {}).status_code, 404)

    def test_hosted_requires_a_staff_host(self):
        self.assertEqual(self.public().get('/api/hr/kiosk/board/').status_code, 401)

    def test_public_throttle_locks_after_ten_failures_per_device(self):
        client = self.public()
        client.get('/api/hr/clock/board/')
        for _ in range(svc.PUBLIC_FAIL_LIMIT):
            res = client.post('/api/hr/clock/identify/', {'token': 'ZZZZZZZZZZ'}, format='json')
            self.assertEqual(res.status_code, 404)
        res = client.post('/api/hr/clock/identify/', {'token': self.token}, format='json')
        self.assertEqual(res.status_code, 404)
        self.assertEqual(KioskEvent.objects.filter(action='cooldown', route='clock').count(), 1)

    def test_ip_allowlist_blocks_other_addresses(self):
        AppSetting.objects.create(key='kiosk.public_allowed_ips', value=['203.0.113.7'])
        client = self.public()
        res = client.get('/api/hr/clock/board/', REMOTE_ADDR='198.51.100.1')
        self.assertEqual(res.status_code, 403)
        res = client.get('/api/hr/clock/board/', REMOTE_ADDR='203.0.113.7')
        self.assertEqual(res.status_code, 200)
        res = client.post(
            '/api/hr/clock/identify/', {'token': self.token}, format='json',
            REMOTE_ADDR='10.0.0.9', HTTP_X_FORWARDED_FOR='203.0.113.7, 10.0.0.9',
        )
        self.assertEqual(res.status_code, 200)
