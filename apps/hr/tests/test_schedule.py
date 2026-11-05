"""The week schedule and call-ins (owner 2026-10-21): managers build the week, Retail is fixed and other departments
flex, everyone sees their own week, call-ins are recorded and counted over 30 and 90 days."""
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.core.models import AppSetting
from apps.hr.models import CallIn, Department, ScheduledShift, ScheduleRequest, Shift, ShiftAssignment
from apps.hr.services import schedule

MONDAY = date(2026, 10, 19)


def _person(email, role='Employee', department=None):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='test-pass-123', is_staff=True)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   pay_rate=Decimal('15'), hire_date=date(2026, 1, 1), department=department)
    return user


def _dept(slug, name):
    return Department.objects.get_or_create(slug=slug, defaults={'name': name})[0]


class ScheduleWeekTests(APITestCase):
    def setUp(self):
        self.retail = _dept('retail-operations', 'Retail')
        self.processing = _dept('processing', 'Processing')
        self.manager = _person('manager@x.com', 'Manager', self.retail)
        self.carrie = _person('carrie@x.com', department=self.retail)
        self.dave = _person('dave@x.com', department=self.processing)
        self.client.force_authenticate(self.manager)

    def test_a_manager_builds_the_week_and_retail_is_fixed(self):
        res = self.client.post('/api/hr/schedule/shifts/', {
            'employee': self.carrie.pk, 'date': '2026-10-20', 'department': self.retail.pk,
            'start_time': '09:00', 'end_time': '15:00'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual((res.json()['text'], res.json()['hours'], res.json()['flexible']), ('9am-3pm', 6.0, False))
        res = self.client.post('/api/hr/schedule/shifts/', {
            'employee': self.dave.pk, 'date': '2026-10-21', 'department': self.processing.pk,
            'start_time': '08:30', 'end_time': '16:30', 'note': 'Truck day'}, format='json')
        self.assertTrue(res.json()['flexible'])
        week = self.client.get('/api/hr/schedule/week/', {'start': '2026-10-22'}).json()
        self.assertEqual((week['start'], week['end']), ('2026-10-19', '2026-10-25'))
        self.assertEqual(len(week['shifts']), 2)
        carrie = next(p for p in week['people'] if p['id'] == self.carrie.pk)
        self.assertEqual(carrie['hours'], 6.0)

    def test_which_departments_are_fixed_is_an_owner_setting(self):
        AppSetting.objects.create(key='hr.fixed_schedule_departments', value=['processing'])
        row = ScheduledShift.objects.create(employee=self.carrie, date=MONDAY, department=self.retail,
                                            start_time=time(9), end_time=time(15))
        self.assertTrue(schedule.shift_payload(row)['flexible'])

    def test_staff_see_the_week_but_cannot_build_it(self):
        # Dash Updates #6 (2026-11-02): everyone sees the week, without call-ins or shift notes; only managers edit.
        shift = ScheduledShift.objects.create(employee=self.carrie, date=MONDAY, department=self.retail,
                                              start_time=time(9), end_time=time(15), note='Doctor at 3')
        CallIn.objects.create(employee=self.dave, shift_date=MONDAY, reason='Sick', recorded_by=self.manager)
        self.client.force_authenticate(self.carrie)
        week = self.client.get('/api/hr/schedule/week/', {'start': MONDAY.isoformat()}).json()
        self.assertFalse(week['can_edit'])
        self.assertEqual(week['call_ins'], [])
        self.assertEqual(set(week['people'][0]), {'id', 'name', 'department', 'department_name', 'fixed', 'usual', 'hours', 'actual_hours'})
        self.assertEqual(week['shifts'][0]['note'], '')
        self.assertEqual(self.client.post('/api/hr/schedule/shifts/', {
            'employee': self.carrie.pk, 'date': '2026-10-20', 'start_time': '09:00', 'end_time': '15:00'},
            format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'/api/hr/schedule/shifts/{shift.pk}/', {'note': ''}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'/api/hr/schedule/shifts/{shift.pk}/').status_code, 403)
        self.assertEqual(self.client.post('/api/hr/schedule/copy-week/', {'from': '2026-10-12', 'to': '2026-10-19'},
                                          format='json').status_code, 403)
        self.client.force_authenticate(self.manager)
        week = self.client.get('/api/hr/schedule/week/', {'start': MONDAY.isoformat()}).json()
        self.assertTrue(week['can_edit'])
        self.assertEqual(len(week['call_ins']), 1)
        self.assertEqual(week['shifts'][0]['note'], 'Doctor at 3')

    def test_who_is_on_right_now(self):
        from apps.hr.models import TimeEntry
        now = timezone.localtime().replace(hour=12, minute=0, second=0, microsecond=0)
        today = now.date()
        erin = _person('erin@x.com', department=self.retail)
        fay = _person('fay@x.com', department=self.retail)
        gus = _person('gus@x.com', department=self.retail)
        for who, dept in ((self.carrie, self.retail), (self.dave, self.processing), (erin, self.retail),
                          (fay, self.retail), (gus, self.retail)):
            ScheduledShift.objects.create(employee=who, date=today, department=dept, start_time=time(9), end_time=time(15))
        TimeEntry.objects.create(employee=self.manager, date=today, clock_in=now - timedelta(hours=2))
        TimeEntry.objects.create(employee=erin, date=today, clock_in=now - timedelta(hours=3), on_break=True)
        TimeEntry.objects.create(employee=fay, date=today, clock_in=now - timedelta(hours=3), clock_out=now - timedelta(hours=1))
        CallIn.objects.create(employee=gus, shift_date=today, reason='Sick', recorded_by=self.manager)
        hal = _person('hal@x.com', department=self.retail)  # closed last night: still late for today's shift
        ScheduledShift.objects.create(employee=hal, date=today, department=self.retail, start_time=time(9), end_time=time(15))
        TimeEntry.objects.create(employee=hal, date=today - timedelta(days=1), clock_in=now - timedelta(hours=19),
                                 clock_out=now - timedelta(hours=14))
        states = schedule.now_states([self.manager.pk, self.carrie.pk, self.dave.pk, erin.pk, fay.pk, gus.pk, hal.pk], now=now)
        self.assertEqual(states, {
            self.manager.pk: 'on_shift',  # clocked in with no shift
            self.carrie.pk: 'late',       # Retail shift started, not clocked in
            self.dave.pk: 'off',          # Processing flexes: not late
            erin.pk: 'on_break',
            fay.pk: 'off',                # worked and clocked out
            gus.pk: 'off',                # called in reads as off
            hal.pk: 'late',               # yesterday's clock-in does not count for today
        })

    def test_copy_last_week_keeps_days_already_set(self):
        ScheduledShift.objects.create(employee=self.carrie, date=MONDAY, start_time=time(9), end_time=time(15))
        ScheduledShift.objects.create(employee=self.dave, date=MONDAY + timedelta(days=1), start_time=time(8),
                                      end_time=time(16))
        ScheduledShift.objects.create(employee=self.carrie, date=MONDAY + timedelta(days=7), start_time=time(12),
                                      end_time=time(18))
        res = self.client.post('/api/hr/schedule/copy-week/', {'from': '2026-10-19', 'to': '2026-10-26'}, format='json')
        self.assertEqual(res.json()['made'], 1)  # Carrie's Monday was already set
        self.assertEqual(ScheduledShift.objects.get(employee=self.carrie, date=MONDAY + timedelta(days=7)).start_time,
                         time(12))
        self.assertTrue(ScheduledShift.objects.filter(employee=self.dave, date=MONDAY + timedelta(days=8)).exists())

    def test_fill_from_usual_shifts(self):
        usual = Shift.objects.create(name='Test Open', department=self.retail, time_in=time(8, 30),
                                     time_out=time(14, 30), weekdays=[1, 2, 3, 4, 5], punch_code='')
        ShiftAssignment.objects.create(employee=self.carrie, shift=usual, weekdays=[1, 3])
        res = self.client.post('/api/hr/schedule/fill-usual/', {'start': '2026-10-19'}, format='json')
        self.assertEqual(res.json()['made'], 2)
        days = sorted(ScheduledShift.objects.filter(employee=self.carrie).values_list('date', flat=True))
        self.assertEqual(days, [date(2026, 10, 20), date(2026, 10, 22)])
        self.assertEqual(self.client.post('/api/hr/schedule/fill-usual/', {'start': '2026-10-19'},
                                          format='json').json()['made'], 0)

    def test_clear_week_empties_only_that_week_and_keeps_call_ins(self):
        # Dash Updates #74: a manager empties the shown week; other weeks, call-ins and staff rights stay.
        monday = ScheduledShift.objects.create(employee=self.carrie, date=MONDAY, start_time=time(9), end_time=time(15))
        ScheduledShift.objects.create(employee=self.dave, date=MONDAY + timedelta(days=6), start_time=time(8),
                                      end_time=time(16))
        ScheduledShift.objects.create(employee=self.carrie, date=MONDAY + timedelta(days=7), start_time=time(9),
                                      end_time=time(15))
        ScheduledShift.objects.create(employee=self.carrie, date=MONDAY - timedelta(days=1), start_time=time(9),
                                      end_time=time(15))
        call_in = CallIn.objects.create(employee=self.carrie, shift_date=MONDAY, scheduled_shift=monday,
                                        reason='Sick', recorded_by=self.manager)
        self.client.force_authenticate(self.carrie)
        self.assertEqual(self.client.post('/api/hr/schedule/clear-week/', {'start': '2026-10-21'},
                                          format='json').status_code, 403)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post('/api/hr/schedule/clear-week/', {}, format='json').status_code, 400)
        res = self.client.post('/api/hr/schedule/clear-week/', {'start': '2026-10-21'}, format='json')
        self.assertEqual(res.json(), {'cleared': 2})
        self.assertEqual(sorted(ScheduledShift.objects.values_list('date', flat=True)),
                         [MONDAY - timedelta(days=1), MONDAY + timedelta(days=7)])
        call_in.refresh_from_db()
        self.assertIsNone(call_in.scheduled_shift)

    def test_the_week_carries_usual_shifts_and_store_hours(self):
        # Dash Updates #55: flexible rows show only days that differ from usual; Retail draws a timeline on store hours.
        usual = Shift.objects.create(name='Test Flex', department=self.processing, time_in=time(9),
                                     time_out=time(17), weekdays=[0, 1, 2, 3, 4], punch_code='')
        ShiftAssignment.objects.create(employee=self.dave, shift=usual, weekdays=[0, 1, 2, 3, 4])
        AppSetting.objects.update_or_create(key='online_sales.hours', defaults={
            'value': {'open': '09:00', 'close': '18:00', 'closed_weekdays': [6]}})
        week = self.client.get('/api/hr/schedule/week/', {'start': '2026-10-19'}).json()
        dave = next(p for p in week['people'] if p['id'] == self.dave.pk)
        carrie = next(p for p in week['people'] if p['id'] == self.carrie.pk)
        self.assertEqual([u['weekday'] for u in dave['usual']], [0, 1, 2, 3, 4])
        self.assertEqual((dave['usual'][0]['start_time'], dave['usual'][0]['end_time'], dave['usual'][0]['flexible']),
                         ('09:00', '17:00', True))
        self.assertEqual((dave['fixed'], carrie['fixed'], carrie['usual']), (False, True, []))
        self.assertEqual([h['open'] for h in week['store_hours']], [True] * 6 + [False])
        self.assertEqual((week['store_hours'][0]['start'], week['store_hours'][0]['end']), ('09:00', '18:00'))

    def test_actual_clock_times_managers_see_all_staff_their_own(self):
        # Dash Updates #55 part A: actual clock-in to clock-out under the scheduled bar, and actual hours.
        from apps.hr.models import TimeEntry
        tz = timezone.get_current_timezone()
        for person in (self.carrie, self.dave):
            TimeEntry.objects.create(employee=person, date=MONDAY,
                                     clock_in=timezone.make_aware(timezone.datetime(2026, 10, 19, 8, 55), tz),
                                     clock_out=timezone.make_aware(timezone.datetime(2026, 10, 19, 15, 10), tz))
        week = self.client.get('/api/hr/schedule/week/', {'start': '2026-10-19'}).json()
        carrie = next(p for p in week['people'] if p['id'] == self.carrie.pk)
        self.assertEqual(carrie['actual_hours'], 6.25)
        self.assertEqual(sorted(a['employee'] for a in week['actual']), sorted([self.carrie.pk, self.dave.pk]))
        self.assertEqual({(a['start'], a['end'], a['open']) for a in week['actual']}, {('08:55', '15:10', False)})
        self.client.force_authenticate(self.carrie)
        week = self.client.get('/api/hr/schedule/week/', {'start': '2026-10-19'}).json()
        self.assertEqual([a['employee'] for a in week['actual']], [self.carrie.pk])
        dave = next(p for p in week['people'] if p['id'] == self.dave.pk)
        self.assertIsNone(dave['actual_hours'])

    def test_my_week_is_this_week_and_next(self):
        today = timezone.localdate()
        start = today - timedelta(days=today.weekday())
        ScheduledShift.objects.create(employee=self.carrie, date=start, start_time=time(9), end_time=time(15))
        ScheduledShift.objects.create(employee=self.carrie, date=start + timedelta(days=10), start_time=time(9),
                                      end_time=time(15))
        ScheduledShift.objects.create(employee=self.carrie, date=start + timedelta(days=15), start_time=time(9),
                                      end_time=time(15))
        ScheduledShift.objects.create(employee=self.dave, date=start, start_time=time(9), end_time=time(15))
        self.client.force_authenticate(self.carrie)
        body = self.client.get('/api/hr/schedule/my-week/').json()
        self.assertEqual(len(body['shifts']), 2)
        self.assertTrue(all(s['employee'] == self.carrie.pk for s in body['shifts']))


class CallInTests(APITestCase):
    def setUp(self):
        self.manager = _person('manager@x.com', 'Manager')
        self.carrie = _person('carrie@x.com')
        self.client.force_authenticate(self.manager)

    def test_record_a_call_in_for_a_shift(self):
        shift = ScheduledShift.objects.create(employee=self.carrie, date=MONDAY, department=_dept('retail-operations', 'Retail'),
                                              start_time=time(9), end_time=time(15))
        res = self.client.post('/api/hr/call-ins/', {
            'employee': self.carrie.pk, 'scheduled_shift': shift.pk, 'shift_date': '2026-10-01',
            'reason': 'Sick kid'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body['shift_date'], '2026-10-19')  # the shift's own day wins
        self.assertEqual(body['shift_text'], '9am-3pm Retail')
        self.assertEqual(body['recorded_by'], self.manager.full_name)
        self.assertIsNotNone(body['called_at'])

    def test_a_no_show_has_no_call_time(self):
        res = self.client.post('/api/hr/call-ins/', {
            'employee': self.carrie.pk, 'shift_date': '2026-10-19', 'kind': 'no_show',
            'called_at': '2026-10-19T08:00:00Z'}, format='json')
        self.assertIsNone(res.json()['called_at'])

    def test_counts_over_30_and_90_days(self):
        today = timezone.localdate()
        for days_ago in (1, 20, 45, 80, 120):
            CallIn.objects.create(employee=self.carrie, shift_date=today - timedelta(days=days_ago))
        CallIn.objects.create(employee=self.carrie, shift_date=today - timedelta(days=5), kind=CallIn.KIND_NO_SHOW)
        counts = schedule.call_in_counts([self.carrie.pk])[self.carrie.pk]
        self.assertEqual(counts, {'d30': 3, 'd90': 5, 'no_show_90': 1})
        week = self.client.get('/api/hr/schedule/week/').json()
        carrie = next(p for p in week['people'] if p['id'] == self.carrie.pk)
        self.assertEqual(carrie['call_ins']['d90'], 5)

    def test_a_shift_must_be_that_persons(self):
        dave = _person('dave@x.com')
        shift = ScheduledShift.objects.create(employee=dave, date=MONDAY, start_time=time(9), end_time=time(15))
        res = self.client.post('/api/hr/call-ins/', {
            'employee': self.carrie.pk, 'scheduled_shift': shift.pk, 'shift_date': '2026-10-19'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_staff_cannot_record_call_ins(self):
        self.client.force_authenticate(self.carrie)
        self.assertEqual(self.client.post('/api/hr/call-ins/', {
            'employee': self.carrie.pk, 'shift_date': '2026-10-19'}, format='json').status_code, 403)


class ScheduleRequestTests(APITestCase):
    """Dash Updates #60 and #61 (Bill, 2026-11-03): staff ask for days off or new times with a note; managers answer."""

    def setUp(self):
        self.retail = _dept('retail-operations', 'Retail')
        self.manager = _person('manager@x.com', 'Manager', self.retail)
        self.carrie = _person('carrie@x.com', department=self.retail)
        self.dave = _person('dave@x.com', department=self.retail)
        self.day = timezone.localdate() + timedelta(days=3)

    def _ask(self, who, **data):
        self.client.force_authenticate(who)
        return self.client.post('/api/hr/schedule/requests/', data, format='json')

    def test_staff_ask_for_days_off_and_a_manager_approves_it(self):
        for n in range(3):
            ScheduledShift.objects.create(employee=self.carrie, date=self.day + timedelta(days=n), department=self.retail,
                                          start_time=time(9), end_time=time(17))
        res = self._ask(self.carrie, kind='off', date=self.day.isoformat(),
                        end_date=(self.day + timedelta(days=1)).isoformat(), note='Family trip')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['status'], 'pending')
        self.client.force_authenticate(self.manager)
        res = self.client.post(f"/api/hr/schedule/requests/{res.json()['id']}/decide/",
                               {'approve': True, 'reply': 'Have fun'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['status'], 'approved')
        self.assertEqual(res.json()['decided_by_name'], self.manager.full_name)
        # The two days off are cleared; the third day stays.
        self.assertEqual(list(ScheduledShift.objects.filter(employee=self.carrie).values_list('date', flat=True)),
                         [self.day + timedelta(days=2)])

    def test_new_times_change_the_shift_or_add_one(self):
        shift = ScheduledShift.objects.create(employee=self.carrie, date=self.day, department=self.retail,
                                              start_time=time(9), end_time=time(17))
        first = self._ask(self.carrie, kind='times', date=self.day.isoformat(), start_time='10:00', end_time='16:00').json()
        extra_day = self.day + timedelta(days=1)
        second = self._ask(self.carrie, kind='times', date=extra_day.isoformat(), start_time='12:00', end_time='18:00').json()
        self.client.force_authenticate(self.manager)
        for row in (first, second):
            self.client.post(f"/api/hr/schedule/requests/{row['id']}/decide/", {'approve': True}, format='json')
        shift.refresh_from_db()
        self.assertEqual((shift.start_time, shift.end_time), (time(10), time(16)))
        added = ScheduledShift.objects.get(employee=self.carrie, date=extra_day)
        self.assertEqual((added.start_time, added.end_time, added.department), (time(12), time(18), self.retail))

    def test_declining_changes_nothing_and_answers_once(self):
        ScheduledShift.objects.create(employee=self.carrie, date=self.day, start_time=time(9), end_time=time(17))
        row = self._ask(self.carrie, kind='off', date=self.day.isoformat()).json()
        self.assertEqual(row['end_date'], self.day.isoformat())
        self.client.force_authenticate(self.manager)
        url = f"/api/hr/schedule/requests/{row['id']}/decide/"
        res = self.client.post(url, {'approve': False, 'reply': 'Short that day'}, format='json')
        self.assertEqual((res.json()['status'], res.json()['reply']), ('declined', 'Short that day'))
        self.assertTrue(ScheduledShift.objects.filter(employee=self.carrie, date=self.day).exists())
        self.assertEqual(self.client.post(url, {'approve': True}, format='json').status_code, 400)

    def test_asks_are_checked(self):
        past = timezone.localdate() - timedelta(days=1)
        self.assertEqual(self._ask(self.carrie, kind='off', date=past.isoformat()).status_code, 400)
        self.assertEqual(self._ask(self.carrie, kind='times', date=self.day.isoformat()).status_code, 400)
        self.assertEqual(self._ask(self.carrie, kind='off', date=self.day.isoformat(),
                                   end_date=(self.day - timedelta(days=1)).isoformat()).status_code, 400)

    def test_staff_see_and_withdraw_their_own_only_managers_answer(self):
        mine = self._ask(self.carrie, kind='off', date=self.day.isoformat(), note='Dentist').json()
        theirs = self._ask(self.dave, kind='off', date=self.day.isoformat(), note='Private').json()
        self.client.force_authenticate(self.carrie)
        self.assertEqual([r['id'] for r in self.client.get('/api/hr/schedule/requests/').json()], [mine['id']])
        self.assertEqual(self.client.post(f"/api/hr/schedule/requests/{mine['id']}/decide/", {'approve': True},
                                          format='json').status_code, 403)
        self.assertEqual(self.client.delete(f"/api/hr/schedule/requests/{theirs['id']}/").status_code, 404)
        monday = self.day - timedelta(days=self.day.weekday())
        week = self.client.get('/api/hr/schedule/week/', {'start': monday.isoformat()}).json()
        self.assertEqual([r['id'] for r in week['requests']], [mine['id']])
        self.assertEqual(self.client.delete(f"/api/hr/schedule/requests/{mine['id']}/").status_code, 204)
        self.assertEqual(ScheduleRequest.objects.get(pk=mine['id']).status, 'withdrawn')
        self.client.force_authenticate(self.manager)
        week = self.client.get('/api/hr/schedule/week/', {'start': monday.isoformat()}).json()
        self.assertEqual([r['id'] for r in week['requests']], [theirs['id']])
        self.assertEqual(len(self.client.get('/api/hr/schedule/requests/', {'status': 'pending'}).json()), 1)
