from datetime import date, datetime
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.webstore.models import StoreHoursOverride
from apps.webstore.services.hours import (
    confirmed_expiry,
    effective_day,
    holiday_sentence,
    provisional_expiry,
    public_hours_payload,
)


TZ = ZoneInfo('America/Chicago')


def _aware(y, m, d, hh=12, mm=0):
    return timezone.make_aware(datetime(y, m, d, hh, mm), TZ)


def _cfg():
    return {
        'timezone': 'America/Chicago',
        'open': '09:00',
        'close': '18:00',
        'closed_weekdays': [0, 6],
    }


def _ov(**kwargs):
    defaults = dict(
        label='Labor Day',
        date_start=date(2026, 9, 7),
        date_end=date(2026, 9, 7),
        closed=True,
        is_active=True,
    )
    defaults.update(kwargs)
    return StoreHoursOverride.objects.create(**defaults)


class HolidaySentenceTests(TestCase):
    def test_closed_single_day(self):
        ov = _ov()
        self.assertEqual(holiday_sentence(ov), 'Mon, Sep 7 (Labor Day): Closed.')

    def test_early_close(self):
        ov = _ov(
            label='Christmas Eve',
            date_start=date(2026, 12, 24),
            date_end=date(2026, 12, 24),
            closed=False,
            open='09:00',
            close='15:00',
        )
        self.assertEqual(holiday_sentence(ov), 'Thu, Dec 24 (Christmas Eve): 9 AM to 3 PM.')

    def test_open_with_note(self):
        ov = _ov(
            label='Labor Day',
            closed=False,
            open='09:00',
            close='18:00',
            note='open for the Labor Day Sale kickoff',
        )
        self.assertEqual(
            holiday_sentence(ov),
            'Mon, Sep 7 (Labor Day): 9 AM to 6 PM, open for the Labor Day Sale kickoff.',
        )


class EffectiveDayTests(TestCase):
    def test_closed_override(self):
        ov = _ov()
        hours = effective_day(date(2026, 9, 7), cfg=_cfg(), overrides=[ov])
        self.assertFalse(hours.open)
        self.assertEqual(hours.override, ov)

    def test_open_on_closed_weekday(self):
        ov = _ov(closed=False, open='09:00', close='18:00', label='Labor Day Sale')
        hours = effective_day(date(2026, 9, 7), cfg=_cfg(), overrides=[ov])
        self.assertTrue(hours.open)
        self.assertEqual(hours.close_hhmm, '18:00')

    def test_weekly_closed_without_override(self):
        hours = effective_day(date(2026, 9, 7), cfg=_cfg(), overrides=[])
        self.assertFalse(hours.open)
        self.assertIsNone(hours.override)


class HoldExpiryOverrideTests(TestCase):
    def test_provisional_skips_closed_override(self):
        _ov(date_start=date(2026, 9, 8), date_end=date(2026, 9, 8), label='Closed Tue')
        # Tuesday Sep 8 2026 is normally open; override closes it.
        exp = provisional_expiry(_aware(2026, 9, 8, 12, 0))
        self.assertEqual(exp.date(), date(2026, 9, 9))

    def test_provisional_uses_early_close(self):
        _ov(
            label='Early',
            date_start=date(2026, 9, 8),
            date_end=date(2026, 9, 8),
            closed=False,
            open='09:00',
            close='15:00',
        )
        exp = provisional_expiry(_aware(2026, 9, 8, 12, 0))
        self.assertEqual(exp, _aware(2026, 9, 8, 15, 0))

    def test_confirmed_counts_override_open_monday(self):
        _ov(closed=False, open='09:00', close='18:00', label='Open Monday')
        # Sunday Sep 6 → next 3 open days: Mon 7 (override), Tue 8, Wed 9
        exp = confirmed_expiry(_aware(2026, 9, 6, 12, 0), open_days=3)
        self.assertEqual(exp.date(), date(2026, 9, 9))


class PublicPayloadOverrideTests(TestCase):
    def test_window_and_resume(self):
        _ov()
        payload = public_hours_payload(cfg=_cfg(), today=date(2026, 9, 1))
        self.assertEqual(len(payload['overrides']), 1)
        self.assertEqual(payload['overrides'][0]['label'], 'Labor Day')
        self.assertIn('Regular hours resume', payload['resume_label'])
        self.assertEqual(payload['regular_label'], payload['label'])

    def test_outside_lookahead_hidden(self):
        _ov()
        payload = public_hours_payload(cfg=_cfg(), today=date(2026, 8, 20))
        self.assertEqual(payload['overrides'], [])

    def test_today_override(self):
        _ov()
        payload = public_hours_payload(cfg=_cfg(), today=date(2026, 9, 7))
        self.assertTrue(payload['today']['is_override'])
        self.assertTrue(payload['today']['closed'])
        self.assertEqual(payload['today']['label'], 'Labor Day')


class OverrideOverlapTests(TestCase):
    def test_overlap_rejected(self):
        _ov()
        other = StoreHoursOverride(
            label='Also Labor Day',
            date_start=date(2026, 9, 7),
            date_end=date(2026, 9, 7),
            closed=True,
            is_active=True,
        )
        with self.assertRaises(ValidationError):
            other.clean()

    def test_inactive_overlap_ok(self):
        _ov()
        other = StoreHoursOverride(
            label='Draft',
            date_start=date(2026, 9, 7),
            date_end=date(2026, 9, 7),
            closed=True,
            is_active=False,
        )
        other.clean()


class HoursOverrideApiTests(TestCase):
    def setUp(self):
        group, _ = Group.objects.get_or_create(name='Manager')
        self.mgr = User.objects.create_user(
            email='hours-mgr@example.com', first_name='H', last_name='Mgr',
            password='test-pass-123',
        )
        self.mgr.groups.add(group)
        self.emp = User.objects.create_user(
            email='hours-emp@example.com', first_name='H', last_name='Emp',
            password='test-pass-123',
        )
        emp_g, _ = Group.objects.get_or_create(name='Employee')
        self.emp.groups.add(emp_g)
        self.client = APIClient()

    def test_manager_crud(self):
        self.client.force_authenticate(self.mgr)
        r = self.client.post(
            '/api/webstore/hours-overrides/',
            {
                'label': 'Labor Day',
                'date_start': '2026-09-07',
                'date_end': '2026-09-07',
                'closed': True,
                'is_active': True,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertIn('Closed', r.json()['sentence'])

    def test_employee_forbidden(self):
        self.client.force_authenticate(self.emp)
        r = self.client.get('/api/webstore/hours-overrides/')
        self.assertEqual(r.status_code, 403)
