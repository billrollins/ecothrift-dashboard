"""Phase 5: category need helpers (no DB for bucket tests)."""

from __future__ import annotations

from unittest.mock import MagicMock

from django.test import SimpleTestCase

from apps.buying.services.category_need import taxonomy_bucket_for_item
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED


class TaxonomyBucketTests(SimpleTestCase):
    def test_product_category_exact(self):
        item = MagicMock()
        item.product_id = 1
        item.product.category = 'Toys & games'
        item.manifest_row_id = None
        self.assertEqual(taxonomy_bucket_for_item(item), 'Toys & games')

    def test_fallback_manifest_row_category(self):
        item = MagicMock()
        item.product_id = None
        item.manifest_row_id = 2
        item.manifest_row.category = 'Electronics'
        self.assertEqual(taxonomy_bucket_for_item(item), 'Electronics')

    def test_mixed_when_unknown(self):
        item = MagicMock()
        item.product_id = 1
        item.product.category = 'not in taxonomy'
        item.manifest_row_id = 2
        item.manifest_row.category = 'also unknown'
        self.assertEqual(taxonomy_bucket_for_item(item), MIXED_LOTS_UNCATEGORIZED)
