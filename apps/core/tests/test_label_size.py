"""The store-wide label size (Settings > Printing, owner 2026-10-28)."""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AppSetting, AppSettingHistory

URL = '/api/core/printing/label-size/'


def _client(email, role):
    user = get_user_model().objects.create_user(email, 'Test', 'User', password='x')
    user.groups.add(Group.objects.get_or_create(name=role)[0])
    client = APIClient()
    client.force_authenticate(user)
    return client


class LabelSizeTests(TestCase):
    def test_default_is_one_and_a_half_by_one(self):
        r = _client('emp@example.com', 'Employee').get(URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['value'], {'w_in': 1.5, 'h_in': 1.0, 'dpi': 203})

    def test_a_manager_sets_it_and_the_change_is_kept(self):
        mgr = _client('mgr@example.com', 'Manager')
        r = mgr.put(URL, {'w_in': 2.25, 'h_in': 1.25, 'dpi': 203}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        r = mgr.put(URL, {'w_in': '3', 'h_in': 2, 'dpi': 300}, format='json')
        self.assertEqual(r.data['value'], {'w_in': 3.0, 'h_in': 2.0, 'dpi': 300})
        self.assertEqual(AppSetting.objects.get(key='printing.label_size').value['dpi'], 300)
        change = AppSettingHistory.objects.get(key='printing.label_size')
        self.assertEqual(change.old_value['w_in'], 2.25)
        self.assertEqual(_client('emp@example.com', 'Employee').get(URL).data['value']['w_in'], 3.0)

    def test_an_employee_cannot_change_it(self):
        r = _client('emp@example.com', 'Employee').put(URL, {'w_in': 2, 'h_in': 1, 'dpi': 203}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_a_typo_is_refused(self):
        mgr = _client('mgr@example.com', 'Manager')
        for bad in ({'w_in': 15, 'h_in': 1, 'dpi': 203}, {'w_in': 1.5, 'h_in': 1, 'dpi': 600}, {'w_in': 'x', 'h_in': 1}):
            self.assertEqual(mgr.put(URL, bad, format='json').status_code, 400, bad)

    def test_a_bad_saved_row_reads_as_the_default(self):
        AppSetting.objects.create(key='printing.label_size', value={'w_in': 99})
        self.assertEqual(_client('emp@example.com', 'Employee').get(URL).data['value']['w_in'], 1.5)


class PriceTagSwitchTests(TestCase):
    SWITCH = '/api/core/printing/price-tag-in-dash/'

    def test_off_until_a_manager_turns_it_on(self):
        emp = _client('emp@example.com', 'Employee')
        self.assertIs(emp.get(URL).data['price_tag_in_dash'], False)
        self.assertEqual(emp.put(self.SWITCH, {'on': True}, format='json').status_code, 403)
        mgr = _client('mgr@example.com', 'Manager')
        self.assertEqual(mgr.put(self.SWITCH, {'on': True}, format='json').data, {'price_tag_in_dash': True})
        self.assertIs(emp.get(URL).data['price_tag_in_dash'], True)
        mgr.put(self.SWITCH, {'on': False}, format='json')
        self.assertIs(emp.get(URL).data['price_tag_in_dash'], False)
        self.assertEqual(AppSettingHistory.objects.filter(key='printing.price_tag_in_dash').count(), 1)

    def test_only_true_or_false(self):
        mgr = _client('mgr@example.com', 'Manager')
        self.assertEqual(mgr.put(self.SWITCH, {'on': 'yes'}, format='json').status_code, 400)
