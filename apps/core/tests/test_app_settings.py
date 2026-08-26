from django.contrib.auth.models import Group
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.core.models import AppSetting


class DottedAppSettingTests(APITestCase):
    def setUp(self):
        group, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='mgr@example.com',
            password='x',
            first_name='Manager',
            last_name='User',
            is_staff=True,
        )
        self.user.groups.add(group)
        self.client.force_authenticate(self.user)
        AppSetting.objects.create(
            key='online_sales.hours',
            value={
                'timezone': 'America/Chicago',
                'open': '09:00',
                'close': '18:00',
                'closed_weekdays': [0, 6],
            },
        )

    def test_patch_dotted_key(self):
        res = self.client.patch(
            '/api/core/settings/online_sales.hours/',
            {
                'value': {
                    'timezone': 'America/Chicago',
                    'open': '10:00',
                    'close': '17:00',
                    'closed_weekdays': [0, 6],
                }
            },
            format='json',
        )
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data['value']['open'], '10:00')
