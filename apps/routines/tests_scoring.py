from datetime import date

from django.test import TestCase

from apps.routines.grading import (
    _doing_for_week,
    _owner_for_week,
    _walk_cap,
    combine_weighted,
    excluded_reasons,
)
from apps.routines.settings import retail_qa_settings


class CombineWeightedTests(TestCase):
    def test_all_three_present_keeps_nominal_weights(self):
        result = combine_weighted([
            ('spot', 60, 91.0),
            ('do', 25, 88.0),
            ('cross', 15, 100.0),
        ])
        self.assertEqual(result['weights'], {'spot': 60, 'do': 25, 'cross': 15})
        self.assertEqual(result['excluded'], [])
        self.assertEqual(result['score'], round(0.60 * 91 + 0.25 * 88 + 0.15 * 100, 1))

    def test_spot_excluded_scales_do_and_cross(self):
        result = combine_weighted([
            ('spot', 60, None),
            ('do', 25, 80.0),
            ('cross', 15, 100.0),
        ])
        self.assertEqual(result['weights']['spot'], 0.0)
        self.assertEqual(result['weights']['do'], 62.5)
        self.assertEqual(result['weights']['cross'], 37.5)
        self.assertEqual(result['excluded'], ['spot'])

    def test_daily_spot_excluded_gives_do_100(self):
        result = combine_weighted([
            ('spot', 60, None),
            ('do', 25, 92.0),
        ])
        self.assertEqual(result['weights'], {'spot': 0.0, 'do': 100.0})
        self.assertEqual(result['excluded'], ['spot'])
        self.assertEqual(result['score'], 92.0)
        self.assertNotIn('cross', result['weights'])

    def test_daily_both_present_scales_to_70_59_and_29_41(self):
        result = combine_weighted([
            ('spot', 60, 91.0),
            ('do', 25, 70.0),
        ])
        self.assertEqual(result['weights']['spot'], 70.59)
        self.assertEqual(result['weights']['do'], 29.41)
        self.assertEqual(result['excluded'], [])
        self.assertNotIn('cross', result['weights'])


class DailyWeeklyFormulaTests(TestCase):
    def test_daily_no_walk_is_do_100_without_cross(self):
        result = combine_weighted([
            ('spot', 60, None),
            ('do', 25, 88.0),
        ])
        self.assertEqual(result['weights']['do'], 100.0)
        self.assertEqual(result['excluded'], ['spot'])
        self.assertNotIn('cross', result['weights'])
        self.assertEqual(result['score'], 88.0)

    def test_daily_with_walk_uses_70_59_and_29_41(self):
        result = combine_weighted([
            ('spot', 60, 91.0),
            ('do', 25, 70.0),
        ])
        self.assertEqual(result['weights']['spot'], 70.59)
        self.assertEqual(result['weights']['do'], 29.41)
        self.assertNotIn('cross', result['weights'])

    def test_weekly_zero_walks_is_62_5_37_5_and_caps_at_c(self):
        result = combine_weighted([
            ('spot', 60, None),
            ('do', 25, 100.0),
            ('cross', 15, 100.0),
        ])
        self.assertEqual(result['weights']['spot'], 0.0)
        self.assertEqual(result['weights']['do'], 62.5)
        self.assertEqual(result['weights']['cross'], 37.5)
        _capped, letter = _walk_cap(result['score'], 0, retail_qa_settings())
        self.assertEqual(letter, 'C')

    def test_weekly_spot_averages_walked_days_only(self):
        daily = [
            {'date': '2026-09-15', 'open_day': True, 'thirds': {'owner': 80.0}, 'doing': {'done': 5, 'needed': 10}},
            {'date': '2026-09-16', 'open_day': True, 'thirds': {'owner': None}, 'doing': {'done': 5, 'needed': 10}},
            {'date': '2026-09-17', 'open_day': True, 'thirds': {'owner': 100.0}, 'doing': {'done': 5, 'needed': 10}},
        ]
        owner, walks = _owner_for_week(daily, today=date(2026, 9, 17), project=False)
        self.assertEqual(walks, 2)
        self.assertEqual(owner, 90.0)

    def test_weekly_do_is_done_over_expected_not_a_mean(self):
        daily = [
            {'date': '2026-09-15', 'open_day': True, 'doing': {'done': 1, 'needed': 4}, 'thirds': {'doing': 25.0}},
            {'date': '2026-09-16', 'open_day': True, 'doing': {'done': 1, 'needed': 8}, 'thirds': {'doing': 12.5}},
        ]
        doing = _doing_for_week(daily, today=date(2026, 9, 16), project=False)
        self.assertEqual(doing, 16.7)
        self.assertNotEqual(doing, 18.8)

    def test_pending_cross_excluded_scales_like_daily_spot_and_do(self):
        result = combine_weighted([
            ('spot', 60, 91.0),
            ('do', 25, 70.0),
            ('cross', 15, None),
        ])
        self.assertEqual(result['weights']['spot'], 70.59)
        self.assertEqual(result['weights']['do'], 29.41)
        self.assertEqual(result['excluded'], ['cross'])

    def test_projection_fills_remaining_expected_and_walks_at_100(self):
        daily = [
            {'date': '2026-09-15', 'open_day': True, 'thirds': {'doing': 0.0, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
            {'date': '2026-09-16', 'open_day': True, 'thirds': {'doing': 0.0, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
            {'date': '2026-09-17', 'open_day': True, 'thirds': {'doing': 40.0, 'owner': 20.0}, 'doing': {'done': 4, 'needed': 10}},
            {'date': '2026-09-18', 'open_day': True, 'thirds': {'doing': None, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
            {'date': '2026-09-19', 'open_day': True, 'thirds': {'doing': None, 'owner': None}, 'doing': {'done': 0, 'needed': 10}},
        ]
        today = date(2026, 9, 17)
        doing = _doing_for_week(daily, today=today, project=True)
        owner, walks = _owner_for_week(daily, today=today, project=True)
        self.assertEqual(doing, 60.0)
        self.assertEqual(owner, 73.3)
        self.assertEqual(walks, 3)

    def test_excluded_reasons_match_the_band_copy(self):
        self.assertEqual(
            excluded_reasons(['spot'], period='week')['spot'],
            'No walks this week · not counted',
        )
        self.assertEqual(
            excluded_reasons(['cross'], due=date(2026, 9, 15), period='week')['cross'],
            'Cross-checks pending until Tue Sep 15',
        )
