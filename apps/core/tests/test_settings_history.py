"""Settings page (owner, 2026-10-07): each change is on record, and Undo puts back the value before it."""
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting


class SettingHistoryTests(TestCase):
    def setUp(self):
        self.mgr = User.objects.create_user(email='m@example.com', first_name='Mo', last_name='M', password='Shelf-life-42')
        self.mgr.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.api = APIClient()
        self.api.force_authenticate(self.mgr)
        AppSetting.objects.create(key='tax_rate', value=0.07)

    def test_a_change_is_on_record_and_undo_puts_it_back(self):
        self.assertEqual(self.api.patch('/api/core/settings/tax_rate/', {'value': 0.075}, format='json').status_code, 200)
        history = self.api.get('/api/core/settings/history/', {'key': 'tax_rate'}).data
        self.assertEqual((history[0]['old_value'], history[0]['new_value'], history[0]['changed_by']), (0.07, 0.075, 'Mo M'))
        self.api.patch('/api/core/settings/tax_rate/', {'value': history[0]['old_value']}, format='json')
        self.assertEqual(AppSetting.objects.get(key='tax_rate').value, 0.07)
        self.assertEqual(len(self.api.get('/api/core/settings/history/', {'key': 'tax_rate'}).data), 2)
        row = self.api.get('/api/core/settings/tax_rate/').data
        self.assertEqual(row['updated_by_name'], 'Mo M')

    def test_staff_cannot_read_it(self):
        emp = User.objects.create_user(email='e@example.com', first_name='Em', last_name='E', password='Shelf-life-42')
        emp.groups.add(Group.objects.get_or_create(name='Employee')[0])
        api = APIClient()
        api.force_authenticate(emp)
        self.assertEqual(api.get('/api/core/settings/history/').status_code, 403)
