from django.test import SimpleTestCase

from apps.inventory.services.category_taxonomy import (
    extract_json_object,
    validate_assignment,
)


class TestCategoryTaxonomy(SimpleTestCase):
    def test_validate_assignment_ok(self):
        m = {1: 'A', 2: 'B'}
        ok, msg = validate_assignment(1, 'A', m)
        self.assertTrue(ok)
        self.assertEqual(msg, '')

    def test_validate_assignment_name_mismatch(self):
        m = {1: 'A', 2: 'B'}
        ok, msg = validate_assignment(1, 'Wrong', m)
        self.assertFalse(ok)

    def test_extract_json_object_strips_fence(self):
        text = '```json\n{"assignments": []}\n```'
        self.assertEqual(extract_json_object(text), {'assignments': []})
