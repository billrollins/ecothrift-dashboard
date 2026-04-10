"""Unit tests for auction valuation (mocked dependencies)."""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from apps.buying.filters import AuctionFilter
from apps.buying.models import Auction, Marketplace, PricingRule
from apps.buying.services.category_need import build_category_need_rows
from apps.buying.services.valuation import (
    compute_and_save_manifest_distribution,
    get_valuation_source,
    recompute_auction_valuation,
)
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES


def _need_rows_zero():
    return [{"category": n, "need_gap": Decimal("0")} for n in TAXONOMY_V1_CATEGORY_NAMES]


class GetValuationSourceTests(TestCase):
    def test_manifest_wins(self):
        mp = Marketplace.objects.create(name="M", slug="m-src")
        a = Auction.objects.create(
            marketplace=mp,
            external_id="e1",
            manifest_category_distribution={"Electronics": 100.0},
            ai_category_estimates={"Toys & games": 100.0},
        )
        self.assertEqual(get_valuation_source(a), "manifest")

    def test_ai_only(self):
        mp = Marketplace.objects.create(name="M2", slug="m-src2")
        a = Auction.objects.create(
            marketplace=mp,
            external_id="e2",
            ai_category_estimates={"Electronics": 100.0},
        )
        self.assertEqual(get_valuation_source(a), "ai")

    def test_none(self):
        mp = Marketplace.objects.create(name="M3", slug="m-src3")
        a = Auction.objects.create(marketplace=mp, external_id="e3")
        self.assertEqual(get_valuation_source(a), "none")


class RecomputeAuctionValuationTests(TestCase):
    @patch("apps.buying.services.valuation.build_category_need_rows", return_value=_need_rows_zero())
    @patch("apps.buying.services.valuation.PricingRule.objects")
    def test_recompute_sets_estimated_revenue(self, mock_pr_mgr, _mock_need):
        rule = MagicMock()
        rule.category = "Electronics"
        rule.sell_through_rate = Decimal("0.5")
        qs = MagicMock()
        mock_pr_mgr.all.return_value = qs
        qs.only.return_value = [rule]

        mp = Marketplace.objects.create(
            name="M",
            slug="m-val",
            default_fee_rate=Decimal("0.10"),
            default_shipping_rate=Decimal("0.05"),
        )
        a = Auction.objects.create(
            marketplace=mp,
            external_id="e-val",
            current_price=Decimal("100"),
            total_retail_value=Decimal("1000"),
            ai_category_estimates={n: (100.0 / len(TAXONOMY_V1_CATEGORY_NAMES)) for n in TAXONOMY_V1_CATEGORY_NAMES},
        )
        recompute_auction_valuation(a)
        a.refresh_from_db()
        self.assertIsNotNone(a.estimated_revenue)
        self.assertIsNotNone(a.estimated_fees)
        self.assertIsNotNone(a.estimated_total_cost)


class ManifestDistributionTests(TestCase):
    def test_null_fast_cat_buckets_mixed(self):
        mp = Marketplace.objects.create(name="M", slug="m-dist")
        a = Auction.objects.create(marketplace=mp, external_id="e-dist", has_manifest=True)
        from apps.buying.models import ManifestRow

        ManifestRow.objects.create(
            auction=a,
            row_number=1,
            fast_cat_value=None,
            retail_value=Decimal("10"),
        )
        ManifestRow.objects.create(
            auction=a,
            row_number=2,
            fast_cat_value="Electronics",
            retail_value=Decimal("10"),
        )
        out = compute_and_save_manifest_distribution(a)
        a.refresh_from_db()
        self.assertIn(MIXED_LOTS_UNCATEGORIZED, out)
        self.assertIn("Electronics", out)
        self.assertAlmostEqual(sum(out.values()), 100.0, places=1)
        self.assertEqual(get_valuation_source(a), "manifest")


class AuctionFilterProfitableNeededTests(TestCase):
    def setUp(self):
        self.mp = Marketplace.objects.create(name="FilterMp", slug="filter-mp")

    def test_profitable_true_filters_gte_1_5(self):
        hi = Auction.objects.create(
            marketplace=self.mp,
            external_id="pf-hi",
            profitability_ratio=Decimal("2.0"),
            need_score=Decimal("0"),
        )
        Auction.objects.create(
            marketplace=self.mp,
            external_id="pf-lo",
            profitability_ratio=Decimal("1.0"),
            need_score=Decimal("0"),
        )
        f = AuctionFilter(data={"profitable": True}, queryset=Auction.objects.all())
        self.assertEqual(list(f.qs), [hi])

    def test_needed_true_filters_need_score_positive(self):
        hi = Auction.objects.create(
            marketplace=self.mp,
            external_id="nd-hi",
            profitability_ratio=None,
            need_score=Decimal("2"),
        )
        Auction.objects.create(
            marketplace=self.mp,
            external_id="nd-lo",
            profitability_ratio=None,
            need_score=Decimal("0"),
        )
        f = AuctionFilter(data={"needed": True}, queryset=Auction.objects.all())
        self.assertEqual(list(f.qs), [hi])


class CategoryNeedSellThroughRateTests(TestCase):
    def test_sell_through_rate_from_pricing_rule(self):
        cat = TAXONOMY_V1_CATEGORY_NAMES[0]
        PricingRule.objects.create(
            category=cat,
            sell_through_rate=Decimal("0.1234"),
            version_date=timezone.now().date(),
        )
        rows = build_category_need_rows()
        row = next(r for r in rows if r["category"] == cat)
        self.assertEqual(row["sell_through_rate"], Decimal("0.1234"))
