"""Timed benchmarks for auction valuation and category need (stdout under -v2).

Run: python manage.py test apps.buying.tests.test_valuation_benchmarks -v2
"""

from __future__ import annotations

import time
from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.utils import timezone

from apps.buying.models import Auction, CategoryStats, ManifestRow, Marketplace
from apps.buying.services.buying_settings import get_pricing_need_window_days
from apps.buying.services.category_need import build_category_need_rows
from apps.buying.services.valuation import (
    _auction_need_from_mix,
    _manifest_retail_sum,
    _mix_for_auction,
    get_global_shrinkage,
    load_category_stats_dict,
    recompute_all_open_auctions,
    recompute_auction_valuation,
)
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES
from apps.core.models import AppSetting
from apps.inventory.models import Item


def _print(msg: str) -> None:
    print(f"\n[BENCHMARK] {msg}")


class ValuationBenchmarkTests(TestCase):
    """Heavy fixture once per class; timings stored for summary."""

    _timings: dict[str, float] = {}

    @classmethod
    def setUpTestData(cls):
        cls._timings.clear()
        for name in TAXONOMY_V1_CATEGORY_NAMES:
            CategoryStats.objects.filter(category=name).update(recovery_rate=Decimal('0.1000'))

        AppSetting.objects.update_or_create(
            key="pricing_shrinkage_factor",
            defaults={"value": "0.10", "description": "benchmark"},
        )
        AppSetting.objects.update_or_create(
            key="pricing_need_window_days",
            defaults={"value": "90", "description": "benchmark"},
        )

        cls.mp1 = Marketplace.objects.create(
            name="Bench MP1",
            slug="bench-mp1",
            default_fee_rate=Decimal("0.03"),
            default_shipping_rate=Decimal("0.02"),
        )
        cls.mp2 = Marketplace.objects.create(
            name="Bench MP2",
            slug="bench-mp2",
            default_fee_rate=Decimal("0.04"),
            default_shipping_rate=Decimal("0.05"),
        )

        now = timezone.now()
        mix = {"Electronics": 100.0}
        cls.auctions = []
        for i in range(20):
            st = Auction.STATUS_OPEN if i < 10 else Auction.STATUS_CLOSING
            end = now + timedelta(hours=1 + i * 2)
            a = Auction.objects.create(
                marketplace=cls.mp1 if i % 2 == 0 else cls.mp2,
                external_id=f"bench-ext-{i:03d}",
                current_price=Decimal("100.00"),
                total_retail_value=Decimal("1000.00"),
                status=st,
                end_time=end,
                ai_category_estimates=mix,
                has_manifest=False,
            )
            cls.auctions.append(a)

        for i in range(5):
            a = cls.auctions[i]
            a.has_manifest = True
            a.save(update_fields=["has_manifest"])
            rows = [
                ManifestRow(
                    auction=a,
                    row_number=r + 1,
                    retail_value=Decimal("100.00"),
                    fast_cat_value="Electronics",
                )
                for r in range(50)
            ]
            ManifestRow.objects.bulk_create(rows)

        cls.auction_open = cls.auctions[10]
        cls.auction_with_manifest = cls.auctions[0]

    def test_bench_build_category_need_rows(self):
        t0 = time.perf_counter()
        build_category_need_rows()
        self._timings["build_category_need_rows"] = time.perf_counter() - t0
        _print(f"build_category_need_rows: {self._timings['build_category_need_rows']:.4f}s")

    def test_bench_load_category_stats_dict(self):
        t0 = time.perf_counter()
        load_category_stats_dict()
        self._timings["load_category_stats_dict"] = time.perf_counter() - t0
        _print(f"load_category_stats_dict: {self._timings['load_category_stats_dict']:.4f}s")

    def test_bench_mix_for_auction(self):
        t0 = time.perf_counter()
        _mix_for_auction(self.auction_open)
        self._timings["mix_for_auction"] = time.perf_counter() - t0
        _print(f"_mix_for_auction: {self._timings['mix_for_auction']:.4f}s")

    def test_bench_manifest_retail_sum(self):
        t0 = time.perf_counter()
        _manifest_retail_sum(self.auction_with_manifest)
        self._timings["manifest_retail_sum"] = time.perf_counter() - t0
        _print(f"_manifest_retail_sum: {self._timings['manifest_retail_sum']:.4f}s")

    def test_bench_auction_need_from_mix(self):
        stats = load_category_stats_dict()
        mix = _mix_for_auction(self.auction_open)
        t0 = time.perf_counter()
        _auction_need_from_mix(mix, stats)
        self._timings["auction_need_from_mix"] = time.perf_counter() - t0
        _print(f"_auction_need_from_mix: {self._timings['auction_need_from_mix']:.4f}s")

    def test_bench_global_shrinkage(self):
        t0 = time.perf_counter()
        get_global_shrinkage()
        self._timings["global_shrinkage"] = time.perf_counter() - t0
        _print(f"get_global_shrinkage: {self._timings['global_shrinkage']:.4f}s")

    def test_bench_recompute_single_no_cache(self):
        t0 = time.perf_counter()
        recompute_auction_valuation(self.auction_open)
        self._timings["recompute_single_no_need_cache"] = time.perf_counter() - t0
        _print(f"recompute_auction_valuation (no need_rows): {self._timings['recompute_single_no_need_cache']:.4f}s")

    def test_bench_recompute_single_with_cache(self):
        need_rows = build_category_need_rows()
        t0 = time.perf_counter()
        recompute_auction_valuation(self.auction_open, need_rows)
        self._timings["recompute_single_with_need_cache"] = time.perf_counter() - t0
        _print(
            f"recompute_auction_valuation (with need_rows arg ignored): "
            f"{self._timings['recompute_single_with_need_cache']:.4f}s"
        )

    def test_bench_recompute_all_open(self):
        t0 = time.perf_counter()
        n = recompute_all_open_auctions()
        self._timings["recompute_all_open_auctions"] = time.perf_counter() - t0
        self._timings["recompute_all_open_count"] = float(n)
        _print(f"recompute_all_open_auctions n={n}: {self._timings['recompute_all_open_auctions']:.4f}s")

    def test_bench_sql_recovery_aggregate(self):
        tbl = Item._meta.db_table
        t0 = time.perf_counter()
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT category,
                       SUM(sold_for) / NULLIF(SUM(retail_value), 0)
                FROM {tbl}
                WHERE status = %s
                  AND sold_for BETWEEN 0.01 AND 9999
                  AND retail_value BETWEEN 0.01 AND 9999
                  AND cost BETWEEN 0.01 AND 9999
                GROUP BY category
                """,
                ["sold"],
            )
            list(cursor.fetchall())
        self._timings["sql_recovery_ratio_by_category"] = time.perf_counter() - t0
        _print(f"SQL recovery SUM ratio by category: {self._timings['sql_recovery_ratio_by_category']:.4f}s")

    def test_bench_sql_shelf_aggregate(self):
        tbl = Item._meta.db_table
        t0 = time.perf_counter()
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT category, SUM(price), COUNT(*)
                FROM {tbl}
                WHERE status = %s
                GROUP BY category
                """,
                ["on_shelf"],
            )
            list(cursor.fetchall())
        self._timings["sql_shelf_sum_count"] = time.perf_counter() - t0
        _print(f"SQL on_shelf SUM/COUNT by category: {self._timings['sql_shelf_sum_count']:.4f}s")

    def test_bench_sql_window_sold_aggregate(self):
        tbl = Item._meta.db_table
        days = get_pricing_need_window_days()
        t0 = time.perf_counter()
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                SELECT category, SUM(price), COUNT(*)
                FROM {tbl}
                WHERE status = %s
                  AND sold_at >= NOW() - (INTERVAL '1 day' * %s)
                GROUP BY category
                """,
                ["sold", days],
            )
            list(cursor.fetchall())
        self._timings["sql_window_sold_sum_count"] = time.perf_counter() - t0
        _print(f"SQL window sold SUM/COUNT by category: {self._timings['sql_window_sold_sum_count']:.4f}s")

    def test_zzz_print_summary(self):
        order = [
            ("build_category_need_rows", "build_category_need_rows()"),
            ("load_category_stats_dict", "load_category_stats_dict()"),
            ("mix_for_auction", "_mix_for_auction(auction)"),
            ("manifest_retail_sum", "_manifest_retail_sum(auction with manifest)"),
            ("auction_need_from_mix", "_auction_need_from_mix(mix, stats)"),
            ("global_shrinkage", "get_global_shrinkage()"),
            ("recompute_single_no_need_cache", "recompute_auction_valuation (no cached need_rows)"),
            ("recompute_single_with_need_cache", "recompute_auction_valuation (cached need_rows ignored)"),
            ("recompute_all_open_auctions", "recompute_all_open_auctions() full batch"),
            ("sql_sold_ratio_by_category", "Raw SQL sold ratio by category"),
            ("sql_shelf_sum_count", "Raw SQL on_shelf SUM/COUNT by category"),
            ("sql_window_sold_sum_count", "Raw SQL window sold SUM/COUNT by category"),
        ]
        lines = [
            "",
            "=" * 72,
            "VALUATION BENCHMARK SUMMARY (seconds, time.perf_counter)",
            "=" * 72,
        ]
        for key, label in order:
            t = self._timings.get(key)
            if t is not None:
                lines.append(f"  {label:<52} {t:.6f}")
        n = self._timings.get("recompute_all_open_count")
        if n is not None:
            lines.append(f"  {'open/closing auction count':<52} {int(n)}")
        lines.append("=" * 72)
        msg = "\n".join(lines)
        print(msg)
        self.assertGreater(len(self._timings), 5)
