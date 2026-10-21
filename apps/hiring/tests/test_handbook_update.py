"""Owner 2026-10-21: the handbook matches Dash (no sick leave, the schedule, call-ins, overtime at 1.5). The default
draft carries the new text, and the migration moves a stored draft's old sentences to it, leaving rewritten ones."""
import importlib

from django.test import SimpleTestCase

from apps.hiring.careers import DEFAULT_HANDBOOK

migration = importlib.import_module('apps.hiring.migrations.0020_handbook_schedule_call_ins')


class HandbookTextTests(SimpleTestCase):
    def test_the_default_draft_has_the_new_rules(self):
        text = DEFAULT_HANDBOOK['text']
        for old, new in migration.PAIRS:
            self.assertIn(new, text)
            self.assertNotIn(old, text)
        self.assertNotIn('2027', text)
        self.assertIn('Retail shifts are fixed times. Other areas flex', text)
        self.assertIn('Every call-in is written down in Dash', text)
        self.assertIn('1.5 times your rate', text)

    def test_a_stored_draft_moves_only_its_untouched_sentences(self):
        old_sick = migration.PAIRS[-1][0]
        stored = 'Intro.\n' + old_sick + '- My own rewritten schedule rule.\n'
        updated = migration.update(stored)
        self.assertIn('There is no paid sick leave.', updated)
        self.assertIn('- My own rewritten schedule rule.\n', updated)
        self.assertNotIn('2027', updated)
        self.assertEqual(migration.update(updated), updated)
