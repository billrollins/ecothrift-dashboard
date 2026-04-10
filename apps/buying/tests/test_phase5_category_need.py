"""Phase 5: category need / want helpers (no DB for bucket tests)."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase
from django.utils import timezone

from apps.buying.services.category_need import taxonomy_bucket_for_item
from apps.buying.services.want_vote import effective_want_value
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


class EffectiveWantTests(SimpleTestCase):
    def test_no_vote_returns_neutral(self):
        self.assertEqual(effective_want_value(8, None), 5.0)

    @patch('apps.buying.services.want_vote.get_want_vote_decay_per_day', return_value=1.0)
    def test_two_steps_over_two_days(self, _mock_decay):
        now = timezone.now()
        voted = now - timedelta(days=2)
        self.assertEqual(effective_want_value(8, voted), 6.0)

    @patch('apps.buying.services.want_vote.get_want_vote_decay_per_day', return_value=1.0)
    def test_clamps_low_side(self, _mock_decay):
        now = timezone.now()
        voted = now - timedelta(days=10)
        self.assertEqual(effective_want_value(1, voted), 5.0)
