from django.test import SimpleTestCase

from apps.inventory.services.category_taxonomy import (
    extract_json_object,
    validate_assignment,
)
from apps.inventory.views import _suggest_item_parse_suggestions_from_text

_SUGGEST_ALLOWED = {
    'title', 'brand', 'category', 'condition', 'specifications', 'notes', 'price',
    'model', 'retail_value', 'search_tags', 'google_query',
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

    def test_suggest_item_parse_retail_tags_and_google_query(self):
        raw = (
            '{"suggestions": {"title": "Old Spice Body Wash", "brand": "Old Spice", '
            '"model": "Captain 24 oz", "retail_value": "8.99", '
            '"search_tags": ["24 fl oz", "body wash"], "google_query": "Old Spice Captain body wash 24 fl oz"}}'
        )
        out, parsed = _suggest_item_parse_suggestions_from_text(
            raw,
            ['title', 'brand', 'model', 'retail_value', 'search_tags', 'google_query'],
            _SUGGEST_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['retail_value'], '8.99')
        self.assertEqual(out['model'], 'Captain 24 oz')
        self.assertEqual(out['search_tags'], ['24 fl oz', 'body wash'])
        self.assertEqual(out['google_query'], 'Old Spice Captain body wash 24 fl oz')
