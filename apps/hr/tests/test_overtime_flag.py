"""Owner 2026-10-20: a weekly overtime allowance per person (0 = none; Ashley is cleared for 5 over 40). Past 40 plus
the allowance is a big red flag on the kiosk, on People, and in the morning brief."""
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.hr.models import TimeEntry
from apps.hr.services.time_clock_utils import (
    over_hours_flag, overtime_allowance_for, week_hours_by_user, weekly_status_for_employee,
)
from apps.hr.tests import test_kiosk as tk


def add_hours(user, hours, *, day=None):
    """Closed shifts today (16 hours at most each, as the clock allows) adding up to ``hours``."""
    day = day or timezone.localdate()
    start = timezone.make_aware(datetime.combine(day, time(0, 0)))
    left, n = Decimal(str(hours)), TimeEntry.objects.filter(employee=user).count()  # a new minute each
    while left > 0:
        chunk = min(left, Decimal('8'))
        clock_in = start + timedelta(minutes=n)
        TimeEntry.objects.create(employee=user, clock_in=clock_in, clock_out=clock_in + timedelta(hours=float(chunk)),
                                 shift='retail_open')
        left -= chunk
        n += 1


def noon():
    return timezone.make_aware(datetime.combine(timezone.localdate(), time(12, 0)))


class WeeklyStatusTests(TestCase):
    def setUp(self):
        self.user = tk._staff('worker@example.com', 'Wanda', 'Worker')

    def test_forty_exactly_is_at_the_limit_not_over_it(self):
        add_hours(self.user, 40)
        status = weekly_status_for_employee(self.user, noon())
        self.assertEqual((status['is_at_limit'], status['is_over_limit']), (True, False))
        self.assertIsNone(over_hours_flag(status['hours_worked'], status['overtime_allowance']))

    def test_over_forty_without_an_allowance_is_the_red_flag_with_the_wording_and_a_link(self):
        add_hours(self.user, '43.2')
        status = weekly_status_for_employee(self.user, noon())
        self.assertEqual((status['hours_limit'], status['overtime_hours']), (Decimal('40.00'), Decimal('3.20')))
        flag = over_hours_flag(status['hours_worked'], status['overtime_allowance'], self.user.pk)
        self.assertEqual(flag['text'], 'Over their hours: 43.2 of 40. Forgot to clock out? Fix the time entry.')
        self.assertIn(f'employee={self.user.pk}', flag['link'])

    def test_an_allowance_moves_the_flag_from_forty_to_forty_plus_the_allowance(self):
        self.user.employee.overtime_allowance_hours = Decimal('5')
        self.user.employee.save()
        self.assertEqual(overtime_allowance_for(self.user), Decimal('5'))
        add_hours(self.user, 45)
        status = weekly_status_for_employee(self.user, noon())
        self.assertEqual((status['hours_limit'], status['base_limit'], status['is_at_limit'], status['is_over_limit']),
                         (Decimal('45.00'), Decimal('40.00'), True, False))
        self.assertIsNone(over_hours_flag(status['hours_worked'], status['overtime_allowance']))
        add_hours(self.user, '0.5', day=timezone.localdate())
        status = weekly_status_for_employee(self.user, noon())
        flag = over_hours_flag(status['hours_worked'], status['overtime_allowance'], self.user.pk)
        self.assertEqual(flag['text'], 'Over their hours: 45.5 of 45. Forgot to clock out? Fix the time entry.')

    def test_forty_three_is_fine_for_someone_cleared_and_flagged_for_someone_not(self):
        cleared = tk._staff('ashley@example.com', 'Ashley', 'Cleared')
        cleared.employee.overtime_allowance_hours = Decimal('5')
        cleared.employee.save()
        add_hours(cleared, 43)
        add_hours(self.user, 43)
        week = week_hours_by_user(noon())
        self.assertEqual((week[cleared.pk], week[self.user.pk]), (Decimal('43.00'), Decimal('43.00')))
        self.assertIsNone(over_hours_flag(week[cleared.pk], cleared.employee.overtime_allowance_hours))
        self.assertIsNotNone(over_hours_flag(week[self.user.pk], self.user.employee.overtime_allowance_hours))


class KioskFlagTests(tk.KioskBase):
    def test_kiosk_shows_a_big_red_flag_over_forty_and_the_amber_note_at_the_limit(self):
        add_hours(self.maria, 40)
        warnings = tk.svc.preview(self.maria, now=noon())['warnings']
        self.assertEqual((warnings['overtime'], warnings['over_hours']), (True, None))
        add_hours(self.maria, '2.5')
        warnings = tk.svc.preview(self.maria, now=noon())['warnings']
        self.assertEqual((warnings['overtime'], warnings['over_hours']), (False, {'hours': '42.5', 'limit': '40'}))

    def test_a_cleared_person_is_flagged_only_past_their_allowance(self):
        self.maria.employee.overtime_allowance_hours = Decimal('5')
        self.maria.employee.save()
        add_hours(self.maria, 44)
        warnings = tk.svc.preview(self.maria, now=noon())['warnings']
        self.assertEqual((warnings['overtime'], warnings['over_hours']), (False, None))
        add_hours(self.maria, 2)
        warnings = tk.svc.preview(self.maria, now=noon())['warnings']
        self.assertEqual(warnings['over_hours'], {'hours': '46', 'limit': '45'})


class PeopleAndBriefTests(TestCase):
    def setUp(self):
        self.admin = tk._staff('owner@example.com', 'Owner', 'Admin', role='Admin')
        self.over = tk._staff('over@example.com', 'Olive', 'Over')
        self.fine = tk._staff('fine@example.com', 'Finn', 'Fine')
        self.cleared = tk._staff('ashley@example.com', 'Ashley', 'Cleared')
        self.cleared.employee.overtime_allowance_hours = Decimal('5')
        self.cleared.employee.save()
        add_hours(self.over, '43.2')
        add_hours(self.fine, 20)
        add_hours(self.cleared, 44)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_people_rows_carry_the_flag_only_for_someone_over_their_hours(self):
        rows = {u['email']: u for u in self.client.get('/api/accounts/users/').data['results']}
        flag = rows['over@example.com']['hours_flag']
        self.assertEqual((flag['hours'], flag['limit']), ('43.2', '40'))
        self.assertEqual(flag['text'], 'Over their hours: 43.2 of 40. Forgot to clock out? Fix the time entry.')
        self.assertIn(f'employee={self.over.pk}', flag['link'])
        self.assertIsNone(rows['fine@example.com']['hours_flag'])
        self.assertIsNone(rows['ashley@example.com']['hours_flag'])  # 44 of 45
        one = self.client.get(f'/api/accounts/users/{self.over.pk}/').data
        self.assertEqual(one['hours_flag']['hours'], '43.2')
        self.assertIsNone(self.client.get(f'/api/accounts/users/{self.fine.pk}/').data['hours_flag'])

    def test_the_flag_is_not_computed_anywhere_else(self):
        self.client.force_authenticate(self.over)
        self.assertIsNone(self.client.get('/api/auth/me/').data.get('hours_flag'))

    def test_the_owner_page_lists_who_is_over(self):
        from apps.core.services.owner_page import needs_you

        row = next(i for i in needs_you(noon())['items'] if i['key'] == 'over_hours')
        self.assertEqual(row['count'], 1)
        self.assertEqual(row['detail'], 'Olive Over: 43.2 of 40')
        self.assertNotIn('Ashley Cleared', row['detail'])
