"""Phase 5: category need helpers (no DB for bucket tests)."""

from __future__ import annotations

from unittest.mock import MagicMock

from django.test import SimpleTestCase

from apps.buying.services.category_need import taxonomy_bucket_for_item
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED


class TaxonomyBucketTests(SimpleTestCase):
    def test_item_category_exact(self):
        item = MagicMock()
        item.category = 'Toys & games'
        item.product_id = None
        self.assertEqual(taxonomy_bucket_for_item(item), 'Toys & games')

    def test_fallback_product_category(self):
        item = MagicMock()
        item.category = 'Unknown retail string'
        item.product_id = 1
        item.product.category = 'Electronics'
        self.assertEqual(taxonomy_bucket_for_item(item), 'Electronics')

    def test_mixed_when_unknown(self):
        item = MagicMock()
        item.category = 'not in taxonomy'
        item.product_id = 1
        item.product.category = 'also unknown'
        self.assertEqual(taxonomy_bucket_for_item(item), MIXED_LOTS_UNCATEGORIZED)
