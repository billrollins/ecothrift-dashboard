from datetime import date

from django.test import TestCase

from apps.routines.day_summary import _spot_state, day_summary_for_date
from apps.routines.settings import retail_qa_settings


class DaySummaryStateTests(TestCase):
    def test_spot_state_is_none_on_a_past_day(self):
        today = date(2026, 9, 18)
        self.assertEqual(_spot_state(day=date(2026, 9, 16), today=today, walks=0), 'none')
        payload = day_summary_for_date(date(2026, 9, 16), today=today)
        self.assertTrue(payload['open'])
        self.assertEqual(payload['spot']['state'], 'none')

    def test_spot_state_is_not_yet_today(self):
        today = date(2026, 9, 18)
        self.assertEqual(_spot_state(day=today, today=today, walks=0), 'not_yet')
        payload = day_summary_for_date(today, today=today)
        self.assertTrue(payload['open'])
        self.assertEqual(payload['spot']['state'], 'not_yet')

    def test_day_payload_carries_weights_and_cross_info(self):
        payload = day_summary_for_date(date(2026, 9, 16), today=date(2026, 9, 18))
        self.assertIn('weights', payload)
        self.assertIn('excluded', payload)
        self.assertIn('cross_info', payload)
        self.assertNotIn('cross', payload)
        self.assertIn('done_on_this_day', payload['cross_info'])
        self.assertIn('spot', payload['excluded'])
        self.assertEqual(payload['weights'].get('do'), 100.0)
        self.assertNotIn('cross', payload['weights'])

    def test_grade_scale_matches_settings(self):
        payload = day_summary_for_date(date(2026, 9, 16), today=date(2026, 9, 18))
        cfg = retail_qa_settings()
        self.assertEqual(payload['grade_scale'][0], {'letter': 'A+', 'min': 97})
        self.assertEqual(len(payload['grade_scale']), 12)
        self.assertEqual(payload['grade_scale'][-1]['letter'], cfg['grade_scale'][-1]['letter'])
