"""Pay basics (owner 2026-10-21): overtime at 1.5 past 40 a week, QuickBooks numbers per pay period, the pay period
lock, the time-edit trail, and nobody changing their own time entries through the API."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import PayPeriodClose, TimeEntry, TimeEntryChange, TimeEntryModificationRequest
from apps.hr.services import pay_periods
from apps.hr.services.payroll_periods import payroll_period_bounds

TZ = ZoneInfo('America/Chicago')
PERIOD = date(2026, 9, 28)  # a Monday that starts a pay period (anchor Jun 8, 2026, every 14 days)


def _person(email, role='Employee', rate='20.00', superuser=False):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='test-pass-123', is_staff=True, is_superuser=superuser)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   pay_rate=Decimal(rate), hire_date=date(2026, 1, 1))
    return user


def _shift(employee, day, hours, status='pending'):
    start = datetime.combine(day, time(8, 0), tzinfo=TZ)
    return TimeEntry.objects.create(employee=employee, date=day, clock_in=start, clock_out=start + timedelta(hours=hours),
                                    status=status)


class OvertimeAndNumbersTests(APITestCase):
    def setUp(self):
        self.assertEqual(payroll_period_bounds(PERIOD)[0], PERIOD)
        self.owner = _person('owner@x.com', 'Admin', superuser=True)
        self.ashley = _person('ashley@x.com', rate='20.00')
        self.carrie = _person('carrie@x.com', rate='15.50')

    def test_overtime_is_per_week_and_paid_at_one_and_a_half(self):
        # Week 1: 5 x 9 = 45 hours (5 overtime). Week 2: 4 x 9 = 36 (no overtime, not averaged with week 1).
        for n in range(5):
            _shift(self.ashley, PERIOD + timedelta(days=n), 9)
        for n in range(4):
            _shift(self.ashley, PERIOD + timedelta(days=7 + n), 9)
        _shift(self.carrie, PERIOD + timedelta(days=2), 6)
        self.client.force_authenticate(self.owner)
        body = self.client.get('/api/hr/pay-periods/numbers/', {'date_from': '2026-10-03'}).json()
        self.assertEqual((body['date_from'], body['date_to']), ('2026-09-28', '2026-10-11'))
        ashley = next(r for r in body['rows'] if r['name'] == self.ashley.full_name)
        self.assertEqual(ashley['regular_hours'], '76.00')
        self.assertEqual(ashley['overtime_hours'], '5.00')
        self.assertEqual(ashley['rate'], '20.00')
        self.assertEqual(ashley['overtime_rate'], '30.00')
        self.assertEqual(ashley['gross'], '1670.00')  # 76 x 20 + 5 x 30
        carrie = next(r for r in body['rows'] if r['name'] == self.carrie.full_name)
        self.assertEqual((carrie['regular_hours'], carrie['overtime_hours'], carrie['gross']), ('6.00', '0.00', '93.00'))
        self.assertEqual(body['totals']['gross'], '1763.00')
        self.assertFalse(body['closed'])

    def test_a_shift_still_going_is_flagged_not_counted(self):
        TimeEntry.objects.create(employee=self.ashley, date=PERIOD, clock_in=datetime.combine(PERIOD, time(8), tzinfo=TZ))
        row = pay_periods.period_numbers(PERIOD)['rows'][0]
        self.assertEqual((row['open_shifts'], row['regular_hours']), (1, Decimal('0.00')))

    def test_csv_download(self):
        _shift(self.ashley, PERIOD, 8)
        self.client.force_authenticate(self.owner)
        res = self.client.get('/api/hr/pay-periods/numbers/', {'date_from': '2026-09-28', 'download': 'csv'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('attachment; filename="pay-2026-09-28-to-2026-10-11.csv"', res['Content-Disposition'])
        lines = res.content.decode().strip().splitlines()
        self.assertTrue(lines[0].startswith('Employee,Employee number,Regular hours,Overtime hours,Rate'))
        self.assertIn('8.00,0.00,20.00,30.00,160.00,0.00,160.00', lines[1])

    def test_only_the_owner_sees_the_numbers(self):
        manager = _person('manager@x.com', 'Manager')
        self.client.force_authenticate(manager)
        self.assertEqual(self.client.get('/api/hr/pay-periods/numbers/').status_code, 403)

    def test_my_pay_counts_overtime_at_one_and_a_half(self):
        today = timezone.localdate()
        start, _end = payroll_period_bounds(today)
        for n in range(5):
            _shift(self.ashley, start + timedelta(days=n), 9)
        self.client.force_authenticate(self.ashley)
        current = next(r for r in self.client.get('/api/hr/time-entries/my_pay/').json() if r['is_current'])
        self.assertEqual(current['overtime_hours'], '5.00')
        self.assertEqual(current['total_pay'], '950.00')  # 40 x 20 + 5 x 30


class PeriodLockTests(APITestCase):
    def setUp(self):
        self.owner = _person('owner@x.com', 'Admin', superuser=True)
        self.manager = _person('manager@x.com', 'Manager')
        self.ashley = _person('ashley@x.com')
        self.entry = _shift(self.ashley, PERIOD + timedelta(days=1), 8)

    def test_a_closed_period_cannot_be_edited_until_reopened(self):
        self.client.force_authenticate(self.owner)
        res = self.client.post('/api/hr/pay-periods/close/', {'date_from': '2026-10-01'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['closed'])
        self.assertTrue(PayPeriodClose.objects.get(date_from=PERIOD).is_closed)

        self.client.force_authenticate(self.manager)
        edit = self.client.patch(f'/api/hr/time-entries/{self.entry.pk}/', {'break_minutes': 30}, format='json')
        self.assertEqual(edit.status_code, 400)
        self.assertEqual(edit.json()['code'], 'PERIOD_CLOSED')
        self.assertEqual(self.client.post(f'/api/hr/time-entries/{self.entry.pk}/approve/').status_code, 400)
        self.assertEqual(self.client.post('/api/hr/time-entries/bulk_delete/', {'ids': [self.entry.pk]},
                                          format='json').status_code, 400)
        added = self.client.post('/api/hr/time-entries/', {
            'employee': self.ashley.pk, 'clock_in': '2026-10-02T14:00:00Z', 'clock_out': '2026-10-02T18:00:00Z',
        }, format='json')
        self.assertEqual(added.status_code, 400)
        self.entry.refresh_from_db()
        self.assertEqual((self.entry.break_minutes, self.entry.deleted_at), (0, None))

        self.client.force_authenticate(self.owner)
        self.client.post('/api/hr/pay-periods/reopen/', {'date_from': '2026-09-28'}, format='json')
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.patch(f'/api/hr/time-entries/{self.entry.pk}/', {'break_minutes': 30},
                                           format='json').status_code, 200)

    def test_moving_a_shift_out_of_a_closed_period_is_refused(self):
        later = _shift(self.ashley, PERIOD + timedelta(days=20), 4)
        pay_periods.close(PERIOD, self.owner)
        self.client.force_authenticate(self.manager)
        res = self.client.patch(f'/api/hr/time-entries/{self.entry.pk}/', {
            'clock_in': later.clock_in.isoformat(), 'clock_out': (later.clock_in + timedelta(hours=8)).isoformat()},
            format='json')
        self.assertEqual(res.status_code, 400)

    def test_a_period_with_someone_clocked_in_cannot_close(self):
        TimeEntry.objects.create(employee=self.manager, date=PERIOD, clock_in=datetime.combine(PERIOD, time(8), tzinfo=TZ))
        self.client.force_authenticate(self.owner)
        res = self.client.post('/api/hr/pay-periods/close/', {'date_from': '2026-09-28'}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()['code'], 'OPEN_SHIFT')

    def test_only_the_owner_closes(self):
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post('/api/hr/pay-periods/close/', {'date_from': '2026-09-28'},
                                          format='json').status_code, 403)


class OwnTimeAndTrailTests(APITestCase):
    def setUp(self):
        self.owner = _person('owner@x.com', 'Admin', superuser=True)
        self.manager = _person('manager@x.com', 'Manager')
        self.ashley = _person('ashley@x.com')

    def test_a_manager_edit_is_recorded_with_before_and_after(self):
        entry = _shift(self.ashley, PERIOD, 8)
        self.client.force_authenticate(self.manager)
        res = self.client.patch(f'/api/hr/time-entries/{entry.pk}/', {'break_minutes': 30}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        change = TimeEntryChange.objects.get(entry=entry)
        self.assertEqual((change.action, change.actor), (TimeEntryChange.ACTION_EDITED, self.manager))
        self.assertEqual((change.before['break_minutes'], change.after['break_minutes']), (0, 30))
        self.assertEqual((change.before['total_hours'], change.after['total_hours']), ('8.00', '7.50'))
        self.client.post(f'/api/hr/time-entries/{entry.pk}/approve/')
        self.client.delete(f'/api/hr/time-entries/{entry.pk}/')
        history = self.client.get(f'/api/hr/time-entries/{entry.pk}/history/').json()
        self.assertEqual([h['action'] for h in history], ['deleted', 'approved', 'edited'])
        self.assertEqual(history[0]['by'], self.manager.full_name)

    def test_a_manager_cannot_change_their_own_time(self):
        mine = _shift(self.manager, PERIOD, 8)
        self.client.force_authenticate(self.manager)
        for res in (
            self.client.patch(f'/api/hr/time-entries/{mine.pk}/', {'break_minutes': 0}, format='json'),
            self.client.post(f'/api/hr/time-entries/{mine.pk}/approve/'),
            self.client.delete(f'/api/hr/time-entries/{mine.pk}/'),
            self.client.post('/api/hr/time-entries/bulk_approve/', {'ids': [mine.pk]}, format='json'),
        ):
            self.assertEqual(res.status_code, 403, res.content)
        mine.refresh_from_db()
        self.assertEqual((mine.status, mine.deleted_at), ('pending', None))

    def test_the_owner_can_change_their_own(self):
        mine = _shift(self.owner, PERIOD, 8)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.patch(f'/api/hr/time-entries/{mine.pk}/', {'break_minutes': 15},
                                           format='json').status_code, 200)

    def test_staff_cannot_add_a_finished_or_backdated_shift_for_themselves(self):
        from apps.hr.shifts import active_punch_codes

        code = sorted(active_punch_codes())[0]
        self.client.force_authenticate(self.ashley)
        before = timezone.now()
        res = self.client.post('/api/hr/time-entries/', {
            'shift': code, 'clock_in': '2026-09-01T08:00:00Z', 'clock_out': '2026-09-01T20:00:00Z',
            'status': 'approved', 'break_minutes': 0,
        }, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        entry = TimeEntry.objects.get(pk=res.json()['id'])
        self.assertIsNone(entry.clock_out)
        self.assertGreaterEqual(entry.clock_in, before)
        self.assertEqual(entry.status, 'pending')

    def test_staff_cannot_type_their_own_break_at_clock_out(self):
        entry = TimeEntry.objects.create(employee=self.ashley, date=timezone.localdate(),
                                         clock_in=timezone.now() - timedelta(hours=2))
        self.client.force_authenticate(self.ashley)
        res = self.client.post(f'/api/hr/time-entries/{entry.pk}/clock_out/', {'break_minutes': 120}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        entry.refresh_from_db()
        self.assertEqual(entry.break_minutes, 0)

    def test_an_applied_time_change_request_is_recorded(self):
        entry = _shift(self.ashley, PERIOD, 8)
        req = TimeEntryModificationRequest.objects.create(
            time_entry=entry, employee=self.ashley, requested_break_minutes=30, reason='Forgot my lunch')
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'/api/hr/modification-requests/{req.pk}/approve/').status_code, 200)
        change = TimeEntryChange.objects.get(entry=entry)
        self.assertEqual((change.action, change.note), (TimeEntryChange.ACTION_REQUEST, 'Forgot my lunch'))

    def test_sick_leave_endpoints_are_gone(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get('/api/hr/sick-leave/balances/').status_code, 404)
