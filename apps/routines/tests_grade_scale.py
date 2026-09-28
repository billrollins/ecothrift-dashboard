from datetime import date

from django.test import TestCase

from apps.routines.command_center import week_tiles
from apps.routines.grading import (
    _week_letter, day_expected, day_is_graded, expected_parts_live, week_grade,
)
from apps.routines.settings import cap_letter_at, letter_for, letter_meets, retail_qa_settings


class GradeScaleTests(TestCase):
    def test_letter_for_boundaries(self):
        cases = (
            (97, 'A+'),
            (93, 'A'),
            (90, 'A-'),
            (87, 'B+'),
            (83, 'B'),
            (80, 'B-'),
            (77, 'C+'),
            (73, 'C'),
            (70, 'C-'),
            (67, 'D+'),
            (65, 'D'),
            (60, 'D-'),
            (59, 'F'),
        )
        for score, letter in cases:
            self.assertEqual(letter_for(score), letter, score)

    def test_letter_meets_uses_list_position(self):
        self.assertFalse(letter_meets('B+', 'A-'))
        self.assertTrue(letter_meets('B+', 'B'))
        self.assertTrue(letter_meets('A-', 'B+'))

    def test_few_walks_no_longer_cap_the_week(self):
        cfg = retail_qa_settings()
        self.assertEqual(cap_letter_at('A-', 'B', cfg), 'B')
        _score, letter = _week_letter(90.0, cfg)
        self.assertEqual(letter, letter_for(90.0, cfg))
        self.assertNotEqual(letter, 'B')

    def test_spot_walks_status_warns_only_at_zero(self):
        from apps.routines.grading import spot_walks_status
        cfg = retail_qa_settings()
        self.assertEqual(spot_walks_status(0, cfg)['warning'], 'No spot walks this week')
        self.assertIsNone(spot_walks_status(1, cfg)['warning'])
        self.assertEqual(spot_walks_status(2, cfg)['goal'], int(cfg.get('walk_floor', 3)))

    def test_past_snapshot_with_capped_letter_reads_uncapped(self):
        from apps.routines.models import WeekScoreSnapshot
        monday = date(2026, 9, 7)
        WeekScoreSnapshot.objects.create(
            week_monday=monday,
            score=96.9,
            letter='C',
            settings=retail_qa_settings(),
            payload={'score': 96.9, 'letter': 'C', 'days': [], 'thirds': {}},
        )
        week = week_grade(monday)
        self.assertEqual(week['letter'], letter_for(96.9, retail_qa_settings()))
        self.assertEqual(week['spot_walks']['warning'], 'No spot walks this week')

    def test_week_snapshot_stores_a_plus(self):
        from apps.routines.grading import _store_week_snapshot
        from apps.routines.models import WeekScoreSnapshot
        monday = date(2026, 9, 7)
        _store_week_snapshot(
            monday,
            {
                'score': 97.0,
                'letter': 'A+',
                'thirds': {'doing': 97.0, 'cross': 97.0, 'owner': 97.0},
            },
            {'cfg': retail_qa_settings()},
            finalize=False,
        )
        self.assertEqual(WeekScoreSnapshot.objects.get(week_monday=monday).letter, 'A+')


class ClosedMondayExpectedTests(TestCase):
    def test_live_monday_rule_includes_sections_sunday_does_not(self):
        from apps.routines.models import QaDayExpected
        monday = date(2026, 9, 21)
        sunday = date(2026, 9, 20)
        QaDayExpected.objects.filter(date=monday).delete()
        self.assertEqual(day_expected(monday)['section_checks'], True)
        self.assertEqual(day_expected(monday)['open_day_close'], False)
        self.assertTrue(day_is_graded(monday))
        self.assertFalse(day_is_graded(sunday))
        keys, _sections = expected_parts_live(sunday)
        self.assertEqual(keys, set())

    def test_frozen_empty_monday_tile_has_no_letter(self):
        from apps.routines.models import QaDayExpected
        monday = date(2026, 9, 14)
        QaDayExpected.objects.update_or_create(date=monday, defaults={'expected': 0})
        week = week_grade(monday)
        tiles = week_tiles(monday, week, today=date(2026, 9, 18), due=None)
        by_date = {row['date']: row for row in week['days']}
        for tile in tiles:
            row = by_date.get(tile['date']) or {}
            self.assertEqual(tile['letter'], row.get('letter'))
            self.assertEqual(tile['graded'], row.get('graded'))
        monday_tile = next(row for row in tiles if row['date'] == monday.isoformat())
        self.assertFalse(monday_tile['graded'])
        self.assertIsNone(monday_tile['letter'])
        self.assertFalse(monday_tile['open'])
