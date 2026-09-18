from datetime import date

from django.test import TestCase

from apps.routines.command_center import week_tiles
from apps.routines.grading import (
    _walk_cap, day_expected, day_is_graded, expected_parts_live, week_grade,
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

    def test_walk_cap_maps_a_minus_to_b(self):
        cfg = retail_qa_settings()
        self.assertEqual(cap_letter_at('A-', 'B', cfg), 'B')
        _score, letter = _walk_cap(90.0, 2, cfg)
        self.assertEqual(letter, 'B')


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
