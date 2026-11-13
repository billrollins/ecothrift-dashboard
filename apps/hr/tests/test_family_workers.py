"""Family workers (Dash Update #121, Bill 2026-11-12): "No Rollins is on payroll". Off payroll = left out of every pay
sheet, pay export and labor-cost total, kept on the time clock, schedule and staff lists. Plus the family_workers
command (dry run first) and the staff filter that brings late-alphabet staff back to the Employees list."""
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from io import StringIO
from zoneinfo import ZoneInfo

from django.contrib.auth.models import Group
from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.hr.models import TimeEntry
from apps.hr.services import pay_periods
from apps.hr.services.roster import build_time_roster

TZ = ZoneInfo('America/Chicago')
PERIOD = date(2026, 9, 28)  # starts a pay period


def _person(first, last, role='Employee', rate='20.00', on_payroll=True, superuser=False, pk=None):
    user = User.objects.create_user(email=f'{first.lower()}.{last.lower()}@x.com', first_name=first, last_name=last,
                                    password='test-pass-123', is_staff=True, is_superuser=superuser,
                                    **({'pk': pk} if pk else {}))
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   pay_rate=Decimal(rate), on_payroll=on_payroll, hire_date=date(2026, 1, 1))
    return user


def _shift(employee, day, hours):
    start = datetime.combine(day, time(8, 0), tzinfo=TZ)
    return TimeEntry.objects.create(employee=employee, date=day, clock_in=start, clock_out=start + timedelta(hours=hours))


class OffPayrollTests(APITestCase):
    def setUp(self):
        self.owner = _person('Bill', 'Rollins', 'Admin', rate='0', on_payroll=False, superuser=True)
        self.ashley = _person('Ashley', 'Tester')
        self.carrie = _person('Carrie', 'Rollins', rate='15.00', on_payroll=False)
        _shift(self.ashley, PERIOD, 8)
        _shift(self.carrie, PERIOD, 6)
        self.client.force_authenticate(self.owner)

    def test_pay_numbers_and_csv_leave_them_out(self):
        body = self.client.get('/api/hr/pay-periods/numbers/', {'date_from': '2026-10-01'}).json()
        self.assertEqual([r['name'] for r in body['rows']], [self.ashley.full_name])
        self.assertEqual(body['totals']['gross'], '160.00')
        csv = self.client.get('/api/hr/pay-periods/numbers/', {'date_from': '2026-10-01', 'download': 'csv'})
        self.assertNotIn('Carrie', csv.content.decode())
        self.assertEqual([r['name'] for r in pay_periods.period_numbers(PERIOD)['rows']], [self.ashley.full_name])

    def test_payroll_sheet_leaves_them_out(self):
        rows = self.client.get('/api/hr/time-entries/payroll/',
                               {'date_from': '2026-09-28', 'date_to': '2026-10-11'}).json()
        self.assertEqual([r['employee_name'] for r in rows], [self.ashley.full_name])

    def test_roster_keeps_the_shift_with_no_pay(self):
        rows = {r['employee_name']: r for r in build_time_roster(PERIOD, PERIOD + timedelta(days=13))}
        self.assertEqual(set(rows), {self.ashley.full_name, self.carrie.full_name})
        carrie = rows[self.carrie.full_name]
        self.assertEqual((carrie['on_payroll'], carrie['pay'], carrie['total_hours']),
                         (False, Decimal('0.00'), Decimal('6.00')))
        self.assertTrue(rows[self.ashley.full_name]['on_payroll'])

    def test_owner_page_labor_cost_leaves_them_out(self):
        from apps.core.services.owner_page import labor_cost

        self.assertEqual(labor_cost(PERIOD, PERIOD), (Decimal('8.00'), Decimal('160.00')))

    def test_no_payroll_deduction_for_them(self):
        from unittest import mock

        from apps.pos.services.staff_purchases import eligibility

        cfg = {'payroll_deduction': True, 'payroll_max_percent': 50}
        with mock.patch('apps.pos.services.staff_purchases.settings_value', return_value=cfg):
            out = eligibility(self.carrie, cashier=self.ashley)
        self.assertFalse(out['eligible'])
        self.assertEqual(out['reason'], 'Not on payroll, so there is no paycheck to take it from.')
        people = self.client.get('/api/pos/staff-purchases/people/')
        self.assertEqual(people.status_code, 200)
        ids = [p['id'] for p in people.json()]
        self.assertIn(self.ashley.pk, ids)
        self.assertNotIn(self.carrie.pk, ids)

    def test_still_in_the_staff_list_with_the_flag(self):
        res = self.client.get('/api/accounts/users/', {'staff': 1, 'page_size': 200}).json()
        carrie = next(u for u in res['results'] if u['id'] == self.carrie.pk)
        self.assertFalse(carrie['employee']['on_payroll'])

    def test_the_switch_saves_and_as_needed_is_a_type(self):
        res = self.client.patch(f'/api/accounts/users/{self.ashley.pk}/employee_profile/',
                                {'on_payroll': False, 'employment_type': 'as_needed'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.ashley.employee.refresh_from_db()
        self.assertEqual((self.ashley.employee.on_payroll, self.ashley.employee.employment_type), (False, 'as_needed'))


class StaffFilterTests(APITestCase):
    """Bill saw 5 of 9 staff: the list took the first 200 logins of every kind by last name, so Phillip and Rollins
    were behind 200 customers."""

    def test_staff_only_reaches_the_end_of_the_alphabet(self):
        owner = _person('Bill', 'Rollins', 'Admin', superuser=True)
        _person('Ray', 'Phillip')
        customer = Group.objects.get_or_create(name='Customer')[0]
        for n in range(205):
            u = User.objects.create_user(email=f'c{n}@x.com', first_name='Ada', last_name=f'Aaron{n:03d}', password=None)
            u.groups.add(customer)
        self.client.force_authenticate(owner)
        everyone = self.client.get('/api/accounts/users/', {'page_size': 200, 'is_active': 1, 'ordering': 'last_name'})
        self.assertNotIn('Rollins', [u['last_name'] for u in everyone.json()['results']])
        staff = self.client.get('/api/accounts/users/',
                                {'page_size': 200, 'is_active': 1, 'ordering': 'last_name', 'staff': 1}).json()
        self.assertEqual([u['last_name'] for u in staff['results']], ['Phillip', 'Rollins'])


class FamilyWorkersCommandTests(APITestCase):
    def setUp(self):
        self.bill = _person('Bill', 'Rollins', 'Admin', rate='25.00', superuser=True)
        self.carrie = _person('Carrie', 'Rollins', rate='18.00')
        self.carrie.phone = '4025550100'
        self.carrie.save(update_fields=['phone'])
        self.carrie.employee.employment_type = 'part_time'
        self.carrie.employee.save(update_fields=['employment_type'])
        self.other = _person('Ashley', 'Tester', rate='20.00')

    def run_it(self, *extra):
        out = StringIO()
        call_command('family_workers', '--bill-id', str(self.bill.pk), '--carrie-id', str(self.carrie.pk),
                     '--raylan-email', 'raylan@x.com', *extra, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing(self):
        text = self.run_it()
        self.assertIn('DRY RUN', text)
        self.assertIn('Raylan Rollins: CREATED', text)
        self.assertIn('Sawyer Rollins: SKIPPED', text)
        self.assertFalse(User.objects.filter(email='raylan@x.com').exists())
        self.carrie.employee.refresh_from_db()
        self.assertTrue(self.carrie.employee.on_payroll)

    def test_apply(self):
        EmployeeProfile.objects.filter(user=self.bill).update(emergency_name='Old Contact', emergency_phone='4025550000')
        text = self.run_it('--apply', '--carrie-phone', '402-555-0199')
        self.assertIn('Bill Rollins: emergency contact -> Carrie Rollins (was Old Contact, another phone)', text)
        self.assertIn('APPLIED', text)
        raylan = User.objects.get(email='raylan@x.com')
        p = raylan.employee
        self.assertEqual((raylan.role, p.employment_type, p.pay_rate, p.on_payroll, raylan.has_usable_password()),
                         ('Employee', 'as_needed', Decimal('0'), False, False))
        self.assertEqual((p.emergency_name, p.emergency_phone), ('Carrie Rollins', '4025550199'))
        self.carrie.refresh_from_db()
        self.assertEqual(self.carrie.phone, '4025550100')  # her own login is never changed
        self.carrie.employee.refresh_from_db()
        self.bill.employee.refresh_from_db()
        self.assertEqual((self.carrie.employee.employment_type, self.carrie.employee.pay_rate,
                          self.carrie.employee.on_payroll), ('full_time', Decimal('0'), False))
        self.assertEqual((self.bill.employee.pay_rate, self.bill.employee.on_payroll), (Decimal('0'), False))
        self.other.employee.refresh_from_db()
        self.assertTrue(self.other.employee.on_payroll)
        # Twice is safe.
        again = self.run_it('--apply', '--carrie-phone', '402-555-0199')
        self.assertIn('already a staff login', again)
        self.assertIn('emergency contact already Carrie Rollins', again)

    def test_wrong_person_stops_it(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            call_command('family_workers', '--bill-id', str(self.other.pk), '--carrie-id', str(self.carrie.pk),
                         stdout=StringIO())
