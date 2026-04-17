"""Unit tests for auction valuation (mocked dependencies)."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from apps.buying.filters import AuctionFilter, cdt_today_window_utc
from apps.buying.models import Auction, CategoryStats, Marketplace
from apps.buying.services.category_need import build_category_need_rows
from apps.buying.services.category_stats_sql import upsert_category_stats_from_sql
from apps.inventory.models import Item
from unittest.mock import patch

from apps.buying.services.ai_title_category_estimate import estimate_batch
from apps.buying.services.valuation import (
    _mix_for_auction,
    compute_and_save_manifest_distribution,
    get_valuation_source,
    recompute_auction_valuation,
    run_ai_estimate_for_swept_auctions,
)
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES


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
    def test_recompute_sets_estimated_revenue(self):
        for name in TAXONOMY_V1_CATEGORY_NAMES:
            CategoryStats.objects.filter(category=name).update(
                recovery_rate=(Decimal("0.5") if name == "Electronics" else Decimal("0"))
            )

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

    def test_manifest_distribution_is_retail_weighted(self):
        mp = Marketplace.objects.create(name="M", slug="m-retail-w")
        a = Auction.objects.create(marketplace=mp, external_id="e-retail-w", has_manifest=True)
        from apps.buying.models import ManifestRow

        app = "Apparel & accessories"
        ManifestRow.objects.create(
            auction=a, row_number=1, fast_cat_value=app, retail_value=Decimal("10")
        )
        ManifestRow.objects.create(
            auction=a, row_number=2, fast_cat_value=app, retail_value=Decimal("10")
        )
        ManifestRow.objects.create(
            auction=a,
            row_number=3,
            fast_cat_value="Electronics",
            retail_value=Decimal("100"),
        )
        out = compute_and_save_manifest_distribution(a)
        # Row-count would be 2/3 vs 1/3; retail is 20/120 vs 100/120
        self.assertAlmostEqual(out["Electronics"], 100.0 * 100 / 120, delta=0.05)
        self.assertAlmostEqual(out[app], 100.0 * 20 / 120, delta=0.05)

    def test_manifest_distribution_qty_weighted(self):
        """SUM(qty * retail_value) per bucket; multi-qty rows get correct weight."""
        mp = Marketplace.objects.create(name="M", slug="m-qty-w")
        a = Auction.objects.create(marketplace=mp, external_id="e-qty-w", has_manifest=True)
        from apps.buying.models import ManifestRow

        app = "Apparel & accessories"
        ManifestRow.objects.create(
            auction=a, row_number=1, fast_cat_value=app,
            quantity=5, retail_value=Decimal("10"),
        )
        ManifestRow.objects.create(
            auction=a, row_number=2, fast_cat_value="Electronics",
            quantity=1, retail_value=Decimal("100"),
        )
        out = compute_and_save_manifest_distribution(a)
        # qty-weighted: app = 5*10 = 50, Electronics = 1*100 = 100, total=150
        self.assertAlmostEqual(out[app], 100.0 * 50 / 150, delta=0.05)
        self.assertAlmostEqual(out["Electronics"], 100.0 * 100 / 150, delta=0.05)

    def test_manifest_retail_sum_qty_weighted(self):
        """`_manifest_retail_sum` = SUM(Coalesce(qty, 1) * retail_value)."""
        from apps.buying.models import ManifestRow
        from apps.buying.services.valuation import _manifest_retail_sum

        mp = Marketplace.objects.create(name="M", slug="m-rsum")
        a = Auction.objects.create(marketplace=mp, external_id="e-rsum", has_manifest=True)
        ManifestRow.objects.create(
            auction=a, row_number=1, fast_cat_value="Electronics",
            quantity=5, retail_value=Decimal("10"),
        )
        ManifestRow.objects.create(
            auction=a, row_number=2, fast_cat_value="Electronics",
            quantity=None, retail_value=Decimal("7"),
        )
        # 5*10 + 1*7 = 57
        self.assertEqual(_manifest_retail_sum(a), Decimal("57.00"))

    def test_manifest_distribution_falls_back_to_count_when_all_retail_null(self):
        mp = Marketplace.objects.create(name="M", slug="m-null-r")
        a = Auction.objects.create(marketplace=mp, external_id="e-null-r", has_manifest=True)
        from apps.buying.models import ManifestRow

        ManifestRow.objects.create(
            auction=a, row_number=1, fast_cat_value="Electronics", retail_value=None
        )
        ManifestRow.objects.create(
            auction=a, row_number=2, fast_cat_value="Electronics", retail_value=None
        )
        ManifestRow.objects.create(
            auction=a,
            row_number=3,
            fast_cat_value="Toys & games",
            retail_value=Decimal("0"),
        )
        out = compute_and_save_manifest_distribution(a)
        self.assertAlmostEqual(out["Electronics"], 100.0 * 2 / 3, delta=0.05)
        self.assertAlmostEqual(out["Toys & games"], 100.0 * 1 / 3, delta=0.05)


class MixForAuctionBlendTests(TestCase):
    def test_mix_blend_mixed_lots_with_ai(self):
        mp = Marketplace.objects.create(name="M", slug="m-blend")
        a = Auction.objects.create(
            marketplace=mp,
            external_id="e-blend",
            manifest_category_distribution={
                "Apparel & accessories": 60.0,
                MIXED_LOTS_UNCATEGORIZED: 40.0,
            },
            ai_category_estimates={
                "Electronics": 50.0,
                "Kitchen & dining": 50.0,
            },
        )
        mix = _mix_for_auction(a)
        self.assertAlmostEqual(float(mix["Apparel & accessories"]), 0.6, places=4)
        self.assertAlmostEqual(float(mix["Electronics"]), 0.2, places=4)
        self.assertAlmostEqual(float(mix["Kitchen & dining"]), 0.2, places=4)
        self.assertNotIn(MIXED_LOTS_UNCATEGORIZED, mix)


class EstimateBatchNoTitleEchoTests(TestCase):
    """estimate_batch accepts model output keyed only by auction_id (no title_echo)."""

    def test_saves_distribution_without_title_echo(self):
        mp = Marketplace.objects.create(name="M", slug="m-est-no-echo")
        a = Auction.objects.create(
            marketplace=mp,
            external_id="e-no-echo",
            title="Truckload of Assorted Goods for Testing Purposes Here",
        )
        dist = {n: 0.0 for n in TAXONOMY_V1_CATEGORY_NAMES}
        dist["Health, beauty & personal care"] = 100.0
        payload = [{"auction_id": a.pk, "distribution": dist}]

        class FakeTextBlock:
            type = "text"

            def __init__(self, text: str):
                self.text = text

        class FakeResponse:
            def __init__(self):
                self.content = [FakeTextBlock(json.dumps(payload))]
                self.usage = None
                self.model = "claude-haiku-4-5-20251001"

        class FakeMessages:
            def create(self, **kwargs):
                return FakeResponse()

        class FakeClient:
            messages = FakeMessages()

        with patch(
            "apps.buying.services.ai_title_category_estimate.get_anthropic_client",
            return_value=FakeClient(),
        ):
            with patch(
                "apps.buying.services.ai_title_category_estimate.recompute_auction_valuation"
            ) as mock_recompute:
                out = estimate_batch([a.pk])
        self.assertEqual(out["estimated"], 1)
        mock_recompute.assert_called_once()
        a.refresh_from_db()
        self.assertIsNotNone(a.ai_category_estimates)
        self.assertGreater(
            a.ai_category_estimates.get("Health, beauty & personal care", 0),
            90.0,
        )


class EstimateAuctionCategoriesCommandTests(TestCase):
    def test_missing_both_calls_estimate_batch_with_filtered_ids(self):
        mp = Marketplace.objects.create(name="CmdMp", slug="cmd-mp-est")
        a1 = Auction.objects.create(
            marketplace=mp,
            external_id="cmd-e1",
            status=Auction.STATUS_OPEN,
            ai_category_estimates=None,
            manifest_category_distribution=None,
        )
        a2 = Auction.objects.create(
            marketplace=mp,
            external_id="cmd-e2",
            status=Auction.STATUS_OPEN,
        )
        with patch(
            "apps.buying.management.commands.estimate_auction_categories.estimate_batch"
        ) as mock_est:
            call_command("estimate_auction_categories", "--missing-both", "--limit", 10)
            mock_est.assert_called_once()
            passed = mock_est.call_args[0][0]
        self.assertIn(a1.pk, passed)
        self.assertIn(a2.pk, passed)


class RunAiEstimateSweepTests(TestCase):
    def test_run_ai_estimate_skips_auctions_with_ai_estimates(self):
        mp = Marketplace.objects.create(name="M", slug="m-ai-skip")
        a = Auction.objects.create(
            marketplace=mp,
            external_id="e-ai-skip",
            status=Auction.STATUS_OPEN,
            ai_category_estimates={"Electronics": 100.0},
        )
        with patch(
            "apps.buying.services.ai_title_category_estimate.estimate_batch"
        ) as mock_est:
            mock_est.return_value = {"estimated": 99, "items": []}
            out = run_ai_estimate_for_swept_auctions([a.pk])
            mock_est.assert_not_called()
        self.assertEqual(out.get("estimated"), 0)


class AuctionFilterTodayCdtTests(TestCase):
    def setUp(self):
        self.mp = Marketplace.objects.create(name="FilterMp", slug="filter-mp")

    def test_today_true_filters_end_time_on_cdt_calendar_day(self):
        start_utc, end_utc = cdt_today_window_utc()
        mid = start_utc + (end_utc - start_utc) / 2
        inside = Auction.objects.create(
            marketplace=self.mp,
            external_id="today-in",
            end_time=mid,
        )
        Auction.objects.create(
            marketplace=self.mp,
            external_id="not-today",
            end_time=start_utc - timedelta(hours=2),
        )
        f = AuctionFilter(data={"today": True}, queryset=Auction.objects.all())
        self.assertCountEqual(list(f.qs), [inside])


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


class CategoryNeedRecoveryRateTests(TestCase):
    def test_recovery_rate_from_category_stats(self):
        cat = TAXONOMY_V1_CATEGORY_NAMES[0]
        CategoryStats.objects.filter(category=cat).update(recovery_rate=Decimal("0.1234"))
        rows = build_category_need_rows()
        row = next(r for r in rows if r["category"] == cat)
        self.assertEqual(row["recovery_rate"], Decimal("0.1234"))


class CategoryNeedProfitabilityTests(TestCase):
    """Good-data cohort: sale, retail, cost each in [0.01, 9999]."""

    def test_profit_margin_and_avg_profit_from_sums(self):
        frozen_now = datetime(2026, 4, 12, 12, 0, 0, tzinfo=dt_timezone.utc)
        cat = TAXONOMY_V1_CATEGORY_NAMES[2]
        for i in range(2):
            Item.objects.create(
                sku=f"CN-PR-{i}",
                title="p",
                category=cat,
                status="sold",
                sold_at=frozen_now - timedelta(days=10),
                sold_for=Decimal("20"),
                price=Decimal("20"),
                retail_value=Decimal("40"),
                cost=Decimal("10"),
            )
        upsert_category_stats_from_sql(since=frozen_now - timedelta(days=90))
        rows = build_category_need_rows()
        row = next(r for r in rows if r["category"] == cat)
        self.assertEqual(row["recovery_rate"], Decimal("0.500000"))
        self.assertEqual(row["avg_sale"], Decimal("20.00"))
        self.assertEqual(row["avg_retail"], Decimal("40.00"))
        self.assertEqual(row["avg_cost"], Decimal("10.00"))
        self.assertEqual(row["avg_profit"], Decimal("10.00"))
        self.assertEqual(row["profit_margin"], Decimal("0.5000"))
        self.assertEqual(row["good_data_sample_size"], 2)


class CategoryNeedWindowingTests(TestCase):
    """sold_count uses the pricing window; recovery and profitability use all-time good-data cohort."""

    def test_windowed_sold_count_vs_window_avgs(self):
        frozen_now = datetime(2026, 4, 12, 12, 0, 0, tzinfo=dt_timezone.utc)
        cat = TAXONOMY_V1_CATEGORY_NAMES[0]
        costs = [
            Decimal("10"),
            Decimal("20"),
            Decimal("30"),
            Decimal("100"),
            Decimal("200"),
        ]
        for i in range(3):
            Item.objects.create(
                sku=f"CN-WIN-{i}",
                title="w",
                category=cat,
                status="sold",
                sold_at=frozen_now - timedelta(days=30),
                sold_for=Decimal("10"),
                price=Decimal("10"),
                retail_value=Decimal("10"),
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
                retail_value=Decimal("10"),
                cost=costs[3 + i],
            )

        upsert_category_stats_from_sql(since=frozen_now - timedelta(days=90))
        rows = build_category_need_rows()
        row = next(r for r in rows if r["category"] == cat)
        self.assertEqual(row["sold_count"], 3)
        self.assertEqual(row["recovery_pct"], Decimal("100.00"))
        self.assertEqual(row["avg_sale"], Decimal("10.00"))
        self.assertEqual(row["avg_retail"], Decimal("10.00"))
        # All 5 sold rows qualify for good-data cohort; mean cost (10+20+30+100+200)/5 = 72
        self.assertEqual(row["avg_cost"], Decimal("72.00"))
        self.assertEqual(row["avg_profit"], Decimal("-62.00"))
        self.assertEqual(row["profit_margin"], Decimal("-6.2000"))
        self.assertEqual(row["good_data_sample_size"], 5)

    def test_recovery_all_time_dollar_ratio_ignores_shelf(self):
        """Recovery = SUM(sold_for)/SUM(retail_value) on qualifying sold rows; shelf does not affect it."""
        frozen_now = datetime(2026, 4, 12, 12, 0, 0, tzinfo=dt_timezone.utc)
        cat = TAXONOMY_V1_CATEGORY_NAMES[1]
        costs = [
            Decimal("10"),
            Decimal("20"),
            Decimal("30"),
            Decimal("100"),
            Decimal("200"),
        ]
        shelf_n = 2

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
                retail_value=Decimal("10"),
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
                retail_value=Decimal("10"),
                cost=costs[3 + i],
            )

        upsert_category_stats_from_sql(since=frozen_now - timedelta(days=90))
        rows = build_category_need_rows()
        row = next(r for r in rows if r["category"] == cat)
        self.assertEqual(row["sold_count"], 3)
        self.assertEqual(row["shelf_count"], shelf_n)
        self.assertEqual(row["recovery_pct"], Decimal("100.00"))
        self.assertEqual(row["avg_sale"], Decimal("10.00"))
        self.assertEqual(row["avg_retail"], Decimal("10.00"))
        self.assertEqual(row["avg_cost"], Decimal("72.00"))
        self.assertEqual(row["avg_profit"], Decimal("-62.00"))
        self.assertEqual(row["profit_margin"], Decimal("-6.2000"))
        self.assertEqual(row["good_data_sample_size"], 5)
