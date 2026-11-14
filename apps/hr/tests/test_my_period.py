"""The Time clock tab's Mine view (Dash Update #137): this pay period's days, hours and pay so far, and what the
scheduled shifts still ahead add. Off payroll (family, #121) sees the hours and no pay."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import ScheduledShift, ScheduleRequest, TimeEntry, TimeEntryModificationRequest
from apps.hr.services.my_period import my_period
from apps.hr.services.payroll_periods import payroll_period_bounds

TZ = ZoneInfo('America/Chicago')
PERIOD = date(2026, 9, 28)  # Mon: a pay period runs Sep 28 - Oct 11 (weeks Sep 28 and Oct 5)
NOW = datetime(2026, 10, 7, 12, 0, tzinfo=TZ)  # Wed of the second week, noon


def _person(first, rate='20.00', on_payroll=True):
    user = User.objects.create_user(email=f'{first.lower()}@x.com', first_name=first, last_name='Tester',
                                    password='test-pass-123')
    user.groups.add(Group.objects.get_or_create(name='Employee')[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   pay_rate=Decimal(rate), on_payroll=on_payroll, hire_date=date(2026, 1, 1))
    return user


def _worked(user, day, start=9, hours=8, status='pending'):
    clock_in = datetime.combine(day, time(start, 0), tzinfo=TZ)
    return TimeEntry.objects.create(employee=user, date=day, clock_in=clock_in, clock_out=clock_in + timedelta(hours=hours),
                                    status=status)


def _scheduled(user, day, start=9, end=17):
    return ScheduledShift.objects.create(employee=user, date=day, start_time=time(start, 0), end_time=time(end, 0))


class MyPeriodTests(APITestCase):
    def setUp(self):
        self.ashley = _person('Ashley')
        # Week 1: one 8-hour shift. Week 2: Mon and Tue worked, 8 h each.
        _worked(self.ashley, PERIOD)
        _worked(self.ashley, PERIOD + timedelta(days=7))
        _worked(self.ashley, PERIOD + timedelta(days=8))
        _scheduled(self.ashley, PERIOD + timedelta(days=7))  # Mon, worked: nothing ahead
        _scheduled(self.ashley, PERIOD + timedelta(days=9))  # today (Wed) 9-5: 5 h left after noon
        for offset in (10, 11, 12):  # Thu, Fri, Sat 9 am - 7 pm: 10 h each
            _scheduled(self.ashley, PERIOD + timedelta(days=offset), end=19)

    def test_so_far_ahead_and_expected_split_overtime_per_week(self):
        data = my_period(self.ashley, now=NOW)
        self.assertEqual((data['date_from'], data['date_to']), ('2026-09-28', '2026-10-11'))
        self.assertTrue(data['on_payroll'])
        self.assertEqual(data['so_far'], {
            'hours': '24.00', 'overtime_hours': '0.00', 'pending_hours': '24.00', 'shift_count': 3, 'pay': '480.00',
        })
        self.assertEqual(data['ahead'], {'hours': '35.00', 'shift_count': 4, 'pay': '810.00'})
        # Week 2 comes to 16 + 35 = 51 h: 11 past 40 at 1.5. Week 1 stays at 8.
        self.assertEqual(data['expected'], {'hours': '59.00', 'overtime_hours': '11.00', 'pay': '1290.00'})
        self.assertEqual([(w['start'], w['worked'], w['ahead'], w['limit']) for w in data['weeks']], [
            ('2026-09-28', '8.00', '0.00', '40.00'), ('2026-10-05', '16.00', '35.00', '40.00'),
        ])
        self.assertEqual([w['is_current'] for w in data['weeks']], [False, True])

    def test_days_carry_the_schedule_and_the_shifts_worked(self):
        data = my_period(self.ashley, now=NOW)
        days = {d['date']: d for d in data['days']}
        self.assertEqual(sorted(days), ['2026-09-28', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
                                        '2026-10-09', '2026-10-10'])
        monday = days['2026-10-05']
        self.assertTrue(monday['is_past'])
        self.assertEqual(monday['scheduled'][0]['text'], '9am-5pm')
        self.assertEqual(monday['scheduled'][0]['hours_ahead'], '0.00')
        self.assertEqual(monday['worked'][0]['total_hours'], '8.00')
        self.assertIsNone(monday['worked'][0]['change'])
        today = days['2026-10-07']
        self.assertTrue(today['is_today'])
        self.assertEqual(today['scheduled'][0]['hours_ahead'], '5.00')
        self.assertEqual(today['worked'], [])

    def test_clocked_out_today_leaves_nothing_ahead_today(self):
        _worked(self.ashley, PERIOD + timedelta(days=9), start=9, hours=2)
        data = my_period(self.ashley, now=NOW)
        self.assertEqual(data['ahead']['hours'], '30.00')
        self.assertEqual(data['so_far']['hours'], '26.00')

    def test_off_payroll_sees_hours_and_no_pay(self):
        carrie = _person('Carrie', rate='15.00', on_payroll=False)
        _worked(carrie, PERIOD)
        _scheduled(carrie, PERIOD + timedelta(days=10))
        data = my_period(carrie, now=NOW)
        self.assertFalse(data['on_payroll'])
        self.assertEqual(data['so_far']['hours'], '8.00')
        self.assertEqual(data['ahead']['hours'], '8.00')
        self.assertIsNone(data['so_far']['pay'])
        self.assertIsNone(data['ahead']['pay'])
        self.assertIsNone(data['expected']['pay'])


class MyPeriodApiTests(APITestCase):
    def test_own_period_only_with_fix_requests_and_days_off(self):
        ashley = _person('Ashley')
        other = _person('Mike')
        start, _end = payroll_period_bounds()
        mine = _worked(ashley, start)
        _worked(other, start)
        TimeEntryModificationRequest.objects.create(time_entry=mine, employee=ashley, reason='Forgot my break',
                                                    requested_break_minutes=30)
        today = timezone.localdate()
        ScheduleRequest.objects.create(employee=ashley, kind=ScheduleRequest.KIND_OFF, date=today, end_date=today,
                                       note='Dentist')
        self.client.force_authenticate(ashley)
        resp = self.client.get('/api/hr/time-entries/my_period/')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['so_far']['shift_count'], 1)
        first = next(d for d in body['days'] if d['date'] == start.isoformat())
        self.assertEqual([w['employee'] for w in first['worked']], [ashley.pk])
        self.assertEqual(first['worked'][0]['change']['status'], 'pending')
        off = next(d for d in body['days'] if d['date'] == today.isoformat())
        self.assertEqual(off['day_off']['note'], 'Dentist')
        self.assertEqual([r['status'] for r in body['requests']], ['pending'])

    def test_my_pay_off_payroll_has_no_pay(self):
        carrie = _person('Carrie', rate='15.00', on_payroll=False)
        start, _end = payroll_period_bounds()
        _worked(carrie, start)
        self.client.force_authenticate(carrie)
        current = self.client.get('/api/hr/time-entries/my_pay/').json()[0]
        self.assertFalse(current['on_payroll'])
        self.assertEqual(current['total_hours'], '8.00')
        self.assertEqual(current['total_pay'], '0.00')
