"""REG-09 / NUM-02: drawers and the dashboard use the store's day (America/Chicago), not the UTC day."""
from datetime import date, datetime, timezone as dt_timezone
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.local_dates import local_day
from apps.core.models import WorkLocation
from apps.pos.models import Drawer, Register
from apps.pos.services import dashboard_metrics

# 8:30 PM Tuesday Oct 20 in Omaha is already Wednesday Oct 21 in UTC.
EVENING_UTC = datetime(2026, 10, 21, 1, 30, tzinfo=dt_timezone.utc)


class LocalDayTests(TestCase):
    def test_an_evening_moment_is_still_the_store_day(self):
        self.assertEqual(local_day(EVENING_UTC), date(2026, 10, 20))

    def test_a_naive_moment_is_taken_as_local(self):
        self.assertEqual(local_day(datetime(2026, 10, 20, 23, 0)), date(2026, 10, 20))


class EveningDrawerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email='eve@example.com', first_name='Eve', last_name='Ning', password='x')
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.register = Register.objects.create(location=WorkLocation.objects.create(name='Eve Loc'), name='R1', code='R1')

    def test_a_drawer_opened_at_8_30_pm_is_dated_today(self):
        with mock.patch('django.utils.timezone.now', return_value=EVENING_UTC):
            r = self.client.post('/api/pos/drawers/', {'register': self.register.id, 'opening_total': '100.00'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Drawer.objects.get().date, date(2026, 10, 20))

    def test_the_evening_alert_counts_todays_open_drawer(self):
        Drawer.objects.create(register=self.register, date=date(2026, 10, 20), status='open', opening_total=Decimal('0'),
                              opened_by=self.user, current_cashier=self.user, opened_at=EVENING_UTC)
        with mock.patch('django.utils.timezone.now', return_value=EVENING_UTC):
            r = self.client.get('/api/pos/dashboard/alerts/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('drawers', [a['type'] for a in r.data])


class DashboardTodayTests(TestCase):
    def test_the_dashboard_today_is_the_store_day(self):
        seen = {}

        def by_day(start, end):
            seen['end'] = end
            raise RuntimeError('stop here')

        with mock.patch('django.utils.timezone.now', return_value=EVENING_UTC), \
                mock.patch.object(dashboard_metrics.sales_numbers, 'by_day', side_effect=by_day):
            with self.assertRaises(RuntimeError):
                dashboard_metrics.build_sales_metrics()
        self.assertEqual(seen['end'], date(2026, 10, 20))
