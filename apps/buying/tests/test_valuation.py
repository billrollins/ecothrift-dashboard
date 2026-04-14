"""Unit tests for auction valuation (mocked dependencies)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

from django.test import TestCase
from django.utils import timezone

from apps.buying.filters import AuctionFilter
from apps.buying.models import Auction, Marketplace, PricingRule
from apps.buying.services.category_need import build_category_need_rows
from apps.inventory.models import Item
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


class AuctionFilterQTests(TestCase):
    """Text search: q splits on spaces; AND across terms; title OR marketplace name per term."""

    def setUp(self):
        self.mp_a = Marketplace.objects.create(name="AlphaMart", slug="alpha-mart")
        self.mp_b = Marketplace.objects.create(name="Beta Wholesale", slug="beta-wh")

    def test_q_matches_title_single_term(self):
        match = Auction.objects.create(
            marketplace=self.mp_a,
            external_id="q-t1",
            title="Blue widget pallet",
        )
        Auction.objects.create(
            marketplace=self.mp_a,
            external_id="q-t2",
            title="Red shoes only",
        )
        f = AuctionFilter(data={"q": "widget"}, queryset=Auction.objects.all())
        self.assertEqual(list(f.qs), [match])

    def test_q_matches_marketplace_name(self):
        match = Auction.objects.create(
            marketplace=self.mp_b,
            external_id="q-mp",
            title="Untitled lot",
        )
        Auction.objects.create(
            marketplace=self.mp_a,
            external_id="q-mp2",
            title="Other",
        )
        f = AuctionFilter(data={"q": "Beta"}, queryset=Auction.objects.all())
        self.assertEqual(list(f.qs), [match])

    def test_q_multiple_terms_and_logic(self):
        ok = Auction.objects.create(
            marketplace=self.mp_a,
            external_id="q-and-ok",
            title="Summer pallet sale",
        )
        Auction.objects.create(
            marketplace=self.mp_a,
            external_id="q-and-miss",
            title="Winter sale only",
        )
        f = AuctionFilter(data={"q": "summer pallet"}, queryset=Auction.objects.all())
        self.assertEqual(list(f.qs), [ok])

    def test_q_empty_returns_all(self):
        Auction.objects.create(marketplace=self.mp_a, external_id="q-e1", title="A")
        f = AuctionFilter(data={"q": "   "}, queryset=Auction.objects.all())
        self.assertEqual(f.qs.count(), Auction.objects.count())


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


class CategoryNeedWindowingTests(TestCase):
    """Regression: sold_count is windowed; financials and Thru numerator use all-time sold."""

    def test_windowed_sold_count_vs_all_time_financials(self):
        frozen_now = datetime(2026, 4, 12, 12, 0, 0, tzinfo=dt_timezone.utc)
        cat = TAXONOMY_V1_CATEGORY_NAMES[0]
        costs = [
            Decimal("10"),
            Decimal("20"),
            Decimal("30"),
            Decimal("100"),
            Decimal("200"),
        ]
        expected_avg_cost = sum(costs, Decimal("0")) / Decimal("5")

        with (
            patch(
                "apps.buying.services.category_need.get_pricing_need_window_days",
                return_value=90,
            ),
            patch("apps.buying.services.category_need.timezone.now", return_value=frozen_now),
        ):
            for i in range(3):
                Item.objects.create(
                    sku=f"CN-WIN-{i}",
                    title="w",
                    category=cat,
                    status="sold",
                    sold_at=frozen_now - timedelta(days=30),
                    sold_for=Decimal("10"),
                    price=Decimal("10"),
                    cost=costs[i],
                )
            for i in range(2):
                Item.objects.create(
                    sku=f"CN-OLD-{i}",
                    title="o",
                    category=cat,
                    status="sold",
                    sold_at=frozen_now - timedelta(days=180),
                    sold_for=Decimal("10"),
                    price=Decimal("10"),
                    cost=costs[3 + i],
                )

            rows = build_category_need_rows()
        row = next(r for r in rows if r["category"] == cat)
        self.assertEqual(row["sold_count"], 3)
        self.assertEqual(row["sell_through_pct"], Decimal("100"))
        self.assertEqual(row["avg_cost"], expected_avg_cost)

    def test_windowing_with_shelf_in_sell_through_denominator(self):
        """Thru = all_time_sold / (all_time_sold + shelf); shelf items in fixture."""
        frozen_now = datetime(2026, 4, 12, 12, 0, 0, tzinfo=dt_timezone.utc)
        cat = TAXONOMY_V1_CATEGORY_NAMES[1]
        costs = [
            Decimal("10"),
            Decimal("20"),
            Decimal("30"),
            Decimal("100"),
            Decimal("200"),
        ]
        expected_avg_cost = sum(costs, Decimal("0")) / Decimal("5")
        all_time_sold = 5
        shelf_n = 2
        expected_thru = (Decimal(all_time_sold) / Decimal(all_time_sold + shelf_n)) * Decimal("100")

        with (
            patch(
                "apps.buying.services.category_need.get_pricing_need_window_days",
                return_value=90,
            ),
            patch("apps.buying.services.category_need.timezone.now", return_value=frozen_now),
        ):
            for i in range(shelf_n):
                Item.objects.create(
                    sku=f"CN-SHF-{i}",
                    title="s",
                    category=cat,
                    status="on_shelf",
                    price=Decimal("5"),
                )
            for i in range(3):
                Item.objects.create(
                    sku=f"CN-WIN2-{i}",
                    title="w",
                    category=cat,
                    status="sold",
                    sold_at=frozen_now - timedelta(days=30),
                    sold_for=Decimal("10"),
                    price=Decimal("10"),
                    cost=costs[i],
                )
            for i in range(2):
                Item.objects.create(
                    sku=f"CN-OLD2-{i}",
                    title="o",
                    category=cat,
                    status="sold",
                    sold_at=frozen_now - timedelta(days=180),
                    sold_for=Decimal("10"),
                    price=Decimal("10"),
                    cost=costs[3 + i],
                )

            rows = build_category_need_rows()
        row = next(r for r in rows if r["category"] == cat)
        self.assertEqual(row["sold_count"], 3)
        self.assertEqual(row["shelf_count"], shelf_n)
        self.assertEqual(row["sell_through_pct"], expected_thru)
        self.assertEqual(row["avg_cost"], expected_avg_cost)
