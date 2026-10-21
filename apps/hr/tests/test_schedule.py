"""The week schedule and call-ins (owner 2026-10-21): managers build the week, Retail is fixed and other departments
flex, everyone sees their own week, call-ins are recorded and counted over 30 and 90 days."""
from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.core.models import AppSetting
from apps.hr.models import CallIn, Department, ScheduledShift, Shift, ShiftAssignment
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

    def test_staff_cannot_build_the_week(self):
        self.client.force_authenticate(self.carrie)
        self.assertEqual(self.client.get('/api/hr/schedule/week/').status_code, 403)
        self.assertEqual(self.client.post('/api/hr/schedule/shifts/', {
            'employee': self.carrie.pk, 'date': '2026-10-20', 'start_time': '09:00', 'end_time': '15:00'},
            format='json').status_code, 403)

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
