"""Search tag + Google query helpers for manual Add Item / check-in."""

from django.test import SimpleTestCase

from apps.inventory.services.manual_item import (
    build_google_query,
    normalize_search_tags,
)
from apps.inventory.product_identity import merge_tags


class ManualItemSearchTagTests(SimpleTestCase):
    def test_normalize_search_tags_dedupes_and_caps(self):
        tags = normalize_search_tags(['24 fl oz', 'Body Wash', 'body wash', 'x' * 50])
        self.assertEqual(tags, ['24 fl oz', 'Body Wash', 'x' * 40])

    def test_build_google_query_prefers_identity_fields(self):
        query = build_google_query(
            brand='Old Spice',
            title='Captain Body Wash',
            model='24 oz',
            search_tags=['body wash'],
        )
        self.assertEqual(query, 'Old Spice Captain Body Wash 24 oz body wash')

    def test_merge_search_tags_preserves_existing_product_tags(self):
        merged = merge_tags(['body wash'], ['24 fl oz', 'body wash'])
        self.assertEqual(merged, ['body wash', '24 fl oz'])
