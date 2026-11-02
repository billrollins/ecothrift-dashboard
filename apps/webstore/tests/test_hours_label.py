from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import AppSetting
from apps.webstore.services.hours import DEFAULT_HOURS, format_hours_label, public_hours_payload


class HoursLabelTests(TestCase):
    def test_default_canfield_copy(self):
        self.assertEqual(
            format_hours_label(
                {
                    'open': '09:00',
                    'close': '18:00',
                    'closed_weekdays': [6],
                }
            ),
            '9 AM - 6 PM, Monday - Saturday · Closed Sunday',
        )

    def test_default_hours_open_monday_closed_sunday(self):
        # Eco-Thrift reopened Mondays on 2026-11-02: Monday has the same hours as Tuesday.
        self.assertEqual(DEFAULT_HOURS['closed_weekdays'], [6])
        self.assertEqual(format_hours_label(), '9 AM - 6 PM, Monday - Saturday · Closed Sunday')

    def test_old_sunday_and_monday_closure_still_renders(self):
        self.assertEqual(
            format_hours_label({'closed_weekdays': [0, 6]}),
            '9 AM - 6 PM, Tuesday - Saturday · Closed Sunday & Monday',
        )

    def test_monday_open_wednesday_closed(self):
        self.assertEqual(
            format_hours_label(
                {
                    'open': '09:00',
                    'close': '18:00',
                    'closed_weekdays': [2, 6],
                }
            ),
            '9 AM - 6 PM, Monday & Tuesday, Thursday - Saturday · Closed Wednesday & Sunday',
        )

    def test_all_days_open(self):
        self.assertEqual(
            format_hours_label({'open': '09:00', 'close': '18:00', 'closed_weekdays': []}),
            '9 AM - 6 PM, Monday - Sunday',
        )

    def test_all_days_closed(self):
        self.assertEqual(
            format_hours_label(
                {'open': '09:00', 'close': '18:00', 'closed_weekdays': [0, 1, 2, 3, 4, 5, 6]}
            ),
            'Closed · 9 AM - 6 PM',
        )

    def test_public_payload_reads_app_setting(self):
        AppSetting.objects.update_or_create(
            key='online_sales.hours',
            defaults={
                'value': {
                    'timezone': 'America/Chicago',
                    'open': '10:00',
                    'close': '17:00',
                    'closed_weekdays': [0, 2, 6],
                }
            },
        )
        payload = public_hours_payload()
        self.assertEqual(payload['open'], '10:00')
        self.assertEqual(payload['close'], '17:00')
        self.assertEqual(payload['closed_weekdays'], [0, 2, 6])
        self.assertIn('10 AM - 5 PM', payload['label'])

    def test_config_includes_hours(self):
        AppSetting.objects.update_or_create(
            key='online_sales.hours',
            defaults={
                'value': {
                    'timezone': 'America/Chicago',
                    'open': '09:00',
                    'close': '18:00',
                    'closed_weekdays': [6],
                }
            },
        )
        r = APIClient().get('/api/webstore/config/')
        self.assertEqual(r.status_code, 200)
        hours = r.json().get('hours')
        self.assertIsInstance(hours, dict)
        self.assertEqual(hours['closed_weekdays'], [6])
        self.assertEqual(
            hours['label'],
            '9 AM - 6 PM, Monday - Saturday · Closed Sunday',
        )
