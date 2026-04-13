from django.test import SimpleTestCase

from apps.inventory.services.category_taxonomy import (
    extract_json_object,
    validate_assignment,
)
from apps.inventory.views import _suggest_item_parse_suggestions_from_text

_SUGGEST_ALLOWED = {
    'title', 'brand', 'category', 'condition', 'specifications', 'notes', 'price',
}


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

    def test_suggest_item_parse_suggestions_from_text(self):
        raw = '{"suggestions": {"category": "Electronics", "title": "Cam"}}'
        out, parsed = _suggest_item_parse_suggestions_from_text(
            raw, ['category', 'title'], _SUGGEST_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['category'], 'Electronics')
        self.assertEqual(out['title'], 'Cam')
