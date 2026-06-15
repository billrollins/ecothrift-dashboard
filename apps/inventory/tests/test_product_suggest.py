from django.test import SimpleTestCase

from apps.inventory.views import _suggest_product_parse_suggestions_from_text

_SUGGEST_PRODUCT_ALLOWED = {
    'title', 'brand', 'model', 'category', 'tags', 'identifiers', 'specifications',
}


class TestProductSuggestParse(SimpleTestCase):
    def test_parse_basic_fields(self):
        raw = '{"suggestions": {"title": "LEGO Castle", "brand": "LEGO", "model": "10316", "category": "Toys / Building Sets"}}'
        out, parsed = _suggest_product_parse_suggestions_from_text(
            raw, ['title', 'brand', 'model', 'category'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['title'], 'LEGO Castle')
        self.assertEqual(out['brand'], 'LEGO')
        self.assertEqual(out['model'], '10316')
        self.assertEqual(out['category'], 'Toys / Building Sets')

    def test_parse_tags_identifiers_specifications(self):
        raw = (
            '{"suggestions": {"tags": ["vintage", "ceramic"], '
            '"identifiers": {"upc": "123"}, "specifications": {"color": "blue"}}}'
        )
        out, parsed = _suggest_product_parse_suggestions_from_text(
            raw, ['tags', 'identifiers', 'specifications'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['tags'], ['vintage', 'ceramic'])
        self.assertEqual(out['identifiers'], {'upc': '123'})
        self.assertEqual(out['specifications'], {'color': 'blue'})

    def test_parse_invalid_json_returns_none(self):
        out, parsed = _suggest_product_parse_suggestions_from_text(
            'not json at all', ['title'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNone(out)
        self.assertIsNone(parsed)

    def test_parse_strips_markdown_fence(self):
        raw = '```json\n{"suggestions": {"title": "Glass Vase"}}\n```'
        out, parsed = _suggest_product_parse_suggestions_from_text(
            raw, ['title'], _SUGGEST_PRODUCT_ALLOWED,
        )
        self.assertIsNotNone(parsed)
        self.assertEqual(out['title'], 'Glass Vase')
