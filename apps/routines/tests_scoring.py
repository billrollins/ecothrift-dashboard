from django.test import TestCase

from apps.routines.grading import combine_weighted


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
