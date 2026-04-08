"""Tests for manifest tier 1 + tier 3 categorization."""

from __future__ import annotations

from django.test import TestCase

from apps.buying.models import Auction, CategoryMapping, ManifestRow, Marketplace
from apps.buying.serializers import AuctionDetailSerializer
from apps.buying.services.categorize_manifest import (
    apply_tier1_tier3_for_row,
    load_source_key_to_canonical,
    manifest_row_source_key,
)
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED


class CategorizeManifestTests(TestCase):
    def setUp(self) -> None:
        self.marketplace = Marketplace.objects.create(name='Test M', slug='test-m')
        self.auction = Auction.objects.create(
            marketplace=self.marketplace,
            external_id='listing-1',
            category='',
        )
        CategoryMapping.objects.create(
            source_key='test-kitchen-small-appliances',
            canonical_category='Kitchen & dining',
            rule_origin=CategoryMapping.RULE_SEEDED,
        )
        CategoryMapping.objects.create(
            source_key='Kitchen Small Appliances',
            canonical_category='Kitchen & dining',
            rule_origin=CategoryMapping.RULE_SEEDED,
        )

    def test_manifest_row_source_key_strip(self) -> None:
        self.assertEqual(manifest_row_source_key('  abc  '), 'abc')
        self.assertEqual(manifest_row_source_key(None), '')

    def test_tier1_direct_match(self) -> None:
        mapping = load_source_key_to_canonical()
        row = ManifestRow(
            auction=self.auction,
            row_number=1,
            fast_cat_key='test-kitchen-small-appliances',
        )
        canonical, conf = apply_tier1_tier3_for_row(row, mapping)
        self.assertEqual(canonical, 'Kitchen & dining')
        self.assertEqual(conf, ManifestRow.CONF_FAST_CAT)

    def test_tier3_auction_category_lookup(self) -> None:
        self.auction.category = 'Kitchen Small Appliances'
        self.auction.save()
        mapping = load_source_key_to_canonical()
        row = ManifestRow(
            auction=self.auction,
            row_number=1,
            fast_cat_key='',
        )
        canonical, conf = apply_tier1_tier3_for_row(row, mapping)
        self.assertEqual(canonical, 'Kitchen & dining')
        self.assertEqual(conf, ManifestRow.CONF_FALLBACK)

    def test_tier3_comma_segments(self) -> None:
        CategoryMapping.objects.create(
            source_key='Shelf Pulls',
            canonical_category='Apparel & accessories',
            rule_origin=CategoryMapping.RULE_SEEDED,
        )
        self.auction.category = 'Foo, Shelf Pulls, Bar'
        self.auction.save()
        mapping = load_source_key_to_canonical()
        row = ManifestRow(
            auction=self.auction,
            row_number=1,
            fast_cat_key='',
        )
        canonical, conf = apply_tier1_tier3_for_row(row, mapping)
        self.assertEqual(canonical, 'Apparel & accessories')
        self.assertEqual(conf, ManifestRow.CONF_FALLBACK)

    def test_tier3_mixed_when_no_match(self) -> None:
        mapping = load_source_key_to_canonical()
        row = ManifestRow(
            auction=self.auction,
            row_number=1,
            fast_cat_key='',
        )
        canonical, conf = apply_tier1_tier3_for_row(row, mapping)
        self.assertEqual(canonical, MIXED_LOTS_UNCATEGORIZED)
        self.assertEqual(conf, ManifestRow.CONF_FALLBACK)

    def test_category_distribution_serializer(self) -> None:
        ManifestRow.objects.create(
            auction=self.auction,
            row_number=1,
            fast_cat_key='a',
            fast_cat_value='Kitchen & dining',
            canonical_category=None,
            category_confidence=ManifestRow.CONF_FAST_CAT,
        )
        ManifestRow.objects.create(
            auction=self.auction,
            row_number=2,
            fast_cat_key='b',
            fast_cat_value='Kitchen & dining',
            canonical_category=None,
            category_confidence=ManifestRow.CONF_FAST_CAT,
        )
        ManifestRow.objects.create(
            auction=self.auction,
            row_number=3,
            fast_cat_key='c',
            fast_cat_value=None,
            canonical_category=None,
            category_confidence=None,
        )
        ser = AuctionDetailSerializer()
        dist = ser.get_category_distribution(self.auction)
        self.assertEqual(dist['total_rows'], 3)
        self.assertEqual(len(dist['top']), 1)
        self.assertEqual(dist['top'][0]['canonical_category'], 'Kitchen & dining')
        self.assertEqual(dist['not_yet_categorized']['count'], 1)
        self.assertGreater(dist['not_yet_categorized']['pct'], 0)
