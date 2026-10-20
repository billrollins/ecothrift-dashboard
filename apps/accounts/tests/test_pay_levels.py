"""Owner 2026-10-20: three pay levels (Entry, Senior, Manager) with ranges in one setting, a warning (never a block)
for pay outside the range, and a weekly overtime allowance on the employee profile."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import EmployeeProfile, User
from apps.accounts.services import pay_levels
from apps.core.models import AppSetting


def _user(email, role='Employee', pay='0', level='entry'):
    user = User.objects.create_user(email=email, first_name=email.split('@')[0].title(), last_name='T',
                                    password='pw-12345-xx', is_staff=True)
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    EmployeeProfile.objects.create(user=user, employee_number=EmployeeProfile.generate_employee_number(),
                                   hire_date=timezone.localdate(), pay_rate=Decimal(pay), level=level)
    return user


class LevelRuleTests(APITestCase):
    def test_pay_goes_to_the_level_it_falls_in_and_between_ranges_to_the_lower(self):
        expected = {'0': 'entry', '14': 'entry', '15': 'entry', '17': 'entry', '17.50': 'entry', '17.99': 'entry',
                    '18': 'senior', '19': 'senior', '19.50': 'senior', '20': 'manager', '27.25': 'manager'}
        for pay, level in expected.items():
            self.assertEqual(pay_levels.level_for_pay(pay), level, pay)

    def test_a_pay_outside_the_range_gets_a_warning_that_does_not_block(self):
        self.assertEqual(pay_levels.warning('16.50', 'entry'), '')
        self.assertEqual(pay_levels.warning('0', 'entry'), '')  # not set yet
        text = pay_levels.warning('18.50', 'entry')
        self.assertIn('$18.50 an hour is outside the Entry range ($15 to $17)', text)
        self.assertIn('You can still save it', text)
        self.assertIn('outside the Manager range ($20+)', pay_levels.warning('15', 'manager'))
        self.assertEqual(pay_levels.warning('17.50', 'entry'), pay_levels.warning('17.50', 'entry'))
        self.assertNotEqual(pay_levels.warning('17.50', 'entry'), '')  # between the ranges is outside both

    def test_the_ranges_are_one_owner_editable_setting(self):
        AppSetting.objects.update_or_create(key='hr.pay_levels', defaults={'value': {
            'entry': {'min': 16, 'max': 18}, 'senior': {'min': 19, 'max': 21}, 'manager': {'min': 22, 'max': None}}})
        self.assertEqual(pay_levels.level_for_pay('18.50'), 'entry')
        self.assertEqual(pay_levels.level_for_pay('19'), 'senior')
        self.assertEqual([lvl['text'] for lvl in pay_levels.payload()], ['$16 to $18', '$19 to $21', '$22+'])
        AppSetting.objects.filter(key='hr.pay_levels').update(value='garbage')
        self.assertEqual(pay_levels.level_for_pay('18'), 'senior')  # a bad value falls back to the defaults

    def test_the_migration_seeds_the_setting_and_puts_everyone_in_the_level_their_pay_falls_in(self):
        import importlib

        from django.apps import apps as django_apps

        migration = importlib.import_module('apps.accounts.migrations.0013_pay_level_overtime')
        AppSetting.objects.filter(key='hr.pay_levels').delete()
        pays = {'a': '0', 'b': '15', 'c': '17.50', 'd': '18', 'e': '19.99', 'f': '20', 'g': '31'}
        for name, pay in pays.items():
            _user(f'{name}@example.com', pay=pay, level='manager' if name == 'a' else 'entry')
        migration.backfill(django_apps, None)
        got = {p.user.email[0]: p.level for p in EmployeeProfile.objects.select_related('user')}
        self.assertEqual(got, {'a': 'entry', 'b': 'entry', 'c': 'entry', 'd': 'senior', 'e': 'senior',
                               'f': 'manager', 'g': 'manager'})
        self.assertEqual(AppSetting.objects.get(key='hr.pay_levels').value['senior'], {'min': 18, 'max': 19})
        self.assertTrue(EmployeeProfile.objects.get(user__email='a@example.com').overtime_allowance_hours == 0)


class LevelApiTests(APITestCase):
    def setUp(self):
        self.admin = _user('admin@example.com', 'Admin')
        self.client.force_authenticate(self.admin)

    def create(self, **extra):
        return self.client.post('/api/accounts/users/', {
            'email': 'new@example.com', 'first_name': 'New', 'last_name': 'Hire', 'role': 'Employee',
            'pay_rate': '15.00', **extra}, format='json')

    def test_a_new_employee_gets_a_level_from_the_pay_or_the_one_chosen(self):
        self.assertEqual(self.create().status_code, 201)
        self.assertEqual(User.objects.get(email='new@example.com').employee.level, 'entry')
        self.assertEqual(self.create(email='b@example.com', pay_rate='18.50').status_code, 201)
        self.assertEqual(User.objects.get(email='b@example.com').employee.level, 'senior')
        self.assertEqual(self.create(email='c@example.com', pay_rate='15', level='manager').status_code, 201)
        self.assertEqual(User.objects.get(email='c@example.com').employee.level, 'manager')  # a warning, not a block
        self.assertEqual(self.create(email='d@example.com', level='boss').status_code, 400)

    def test_edit_level_and_overtime_on_the_profile_and_see_them_back(self):
        emp = _user('emp@example.com', pay='16')
        url = f'/api/accounts/users/{emp.pk}/employee_profile/'
        res = self.client.patch(url, {'level': 'senior', 'overtime_allowance_hours': '5'}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual((res.data['level'], res.data['overtime_allowance_hours']), ('senior', '5.00'))
        # Pay outside the level's range still saves.
        self.assertEqual(self.client.patch(url, {'pay_rate': '25'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'overtime_allowance_hours': '41'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(url, {'level': 'chief'}, format='json').status_code, 400)
        shown = self.client.get(f'/api/accounts/users/{emp.pk}/').data['employee']
        self.assertEqual((shown['level'], shown['overtime_allowance_hours']), ('senior', '5.00'))

    def test_the_screens_read_the_ranges_from_one_endpoint(self):
        manager = _user('mgr@example.com', 'Manager')
        self.client.force_authenticate(manager)
        res = self.client.get('/api/accounts/pay-levels/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual([(lvl['key'], lvl['min'], lvl['max']) for lvl in res.data['levels']],
                         [('entry', 15.0, 17.0), ('senior', 18.0, 19.0), ('manager', 20.0, None)])
        self.client.force_authenticate(_user('plain@example.com'))
        self.assertEqual(self.client.get('/api/accounts/pay-levels/').status_code, 403)

    def test_only_the_owner_changes_the_ranges(self):
        AppSetting.objects.update_or_create(key='hr.pay_levels', defaults={'value': pay_levels.DEFAULT_RANGES})
        self.client.force_authenticate(_user('mgr@example.com', 'Manager'))
        res = self.client.patch('/api/core/settings/hr.pay_levels/', {'value': pay_levels.DEFAULT_RANGES}, format='json')
        self.assertEqual(res.status_code, 403)
        self.client.force_authenticate(self.admin)
        res = self.client.patch('/api/core/settings/hr.pay_levels/', {'value': {
            'entry': {'min': 15, 'max': 17}, 'senior': {'min': 18, 'max': 19}, 'manager': {'min': 21, 'max': None}}},
            format='json')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(pay_levels.level_for_pay('20'), 'senior')
