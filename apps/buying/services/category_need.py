"""Category need panel: inventory aggregates by taxonomy_v1 bucket."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.buying.models import PricingRule
from apps.buying.services.buying_settings import get_pricing_need_window_days
from apps.buying.taxonomy_v1 import (
    MIXED_LOTS_UNCATEGORIZED,
    TAXONOMY_V1_CATEGORY_NAMES,
)
from apps.inventory.models import Item


def _sell_through_by_category() -> dict[str, Decimal]:
    """Flat PricingRule rates (same source as valuation sumproduct)."""
    out: dict[str, Decimal] = {}
    for pr in PricingRule.objects.all().only('category', 'sell_through_rate'):
        out[pr.category] = pr.sell_through_rate
    return out


_TAXONOMY_SET = frozenset(TAXONOMY_V1_CATEGORY_NAMES)


def taxonomy_bucket_for_item(item: Item) -> str:
    """Map an inventory item to a taxonomy_v1 category name."""
    raw = (item.category or '').strip()
    if raw in _TAXONOMY_SET:
        return raw
    if item.product_id:
        pc = (item.product.category or '').strip()
        if pc in _TAXONOMY_SET:
            return pc
    return MIXED_LOTS_UNCATEGORIZED


@dataclass
class _Agg:
    shelf_count: int = 0
    sold_count: int = 0
    sum_sale: Decimal = field(default_factory=lambda: Decimal('0'))
    sale_lines: int = 0
    sum_retail: Decimal = field(default_factory=lambda: Decimal('0'))
    retail_lines: int = 0
    sum_cost: Decimal = field(default_factory=lambda: Decimal('0'))
    cost_lines: int = 0
    paired_sale: Decimal = field(default_factory=lambda: Decimal('0'))
    paired_cost: Decimal = field(default_factory=lambda: Decimal('0'))
    paired_count: int = 0


def _sale_amount(item: Item) -> Decimal | None:
    if item.sold_for is not None:
        return item.sold_for
    if item.price is not None:
        return item.price
    return None


def _retail_amount(item: Item) -> Decimal | None:
    if item.price is not None:
        return item.price
    if item.product_id and item.product.default_price is not None:
        return item.product.default_price
    return None


def build_category_need_rows() -> list[dict[str, Any]]:
    """
    Return one row per taxonomy_v1 category (19), sorted by need_gap descending.

    Shelf % / sold % are shares of store-wide on-shelf and sold-in-window totals.
    """
    window_days = get_pricing_need_window_days()
    since = timezone.now() - timedelta(days=window_days)

    per: dict[str, _Agg] = {name: _Agg() for name in TAXONOMY_V1_CATEGORY_NAMES}

    shelf_qs = Item.objects.filter(status='on_shelf').select_related('product')
    for item in shelf_qs.iterator(chunk_size=2000):
        per[taxonomy_bucket_for_item(item)].shelf_count += 1

    sold_qs = (
        Item.objects.filter(status='sold', sold_at__gte=since)
        .filter(Q(sold_for__isnull=False) | Q(price__isnull=False))
        .select_related('product')
    )
    for item in sold_qs.iterator(chunk_size=2000):
        b = taxonomy_bucket_for_item(item)
        a = per[b]
        a.sold_count += 1
        sale = _sale_amount(item)
        if sale is not None:
            a.sum_sale += sale
            a.sale_lines += 1
        retail = _retail_amount(item)
        if retail is not None:
            a.sum_retail += retail
            a.retail_lines += 1
        if item.cost is not None:
            a.sum_cost += item.cost
            a.cost_lines += 1
            if sale is not None:
                a.paired_sale += sale
                a.paired_cost += item.cost
                a.paired_count += 1

    total_shelf = sum(p.shelf_count for p in per.values())
    total_sold = sum(p.sold_count for p in per.values())
    sell_through_rates = _sell_through_by_category()

    rows: list[dict[str, Any]] = []
    bar_max = Decimal('0')
    for name in TAXONOMY_V1_CATEGORY_NAMES:
        a = per[name]
        shelf_pct = (
            (Decimal(a.shelf_count) / Decimal(total_shelf) * Decimal('100'))
            if total_shelf
            else Decimal('0')
        )
        sold_pct = (
            (Decimal(a.sold_count) / Decimal(total_sold) * Decimal('100')) if total_sold else Decimal('0')
        )
        bar_max = max(bar_max, shelf_pct, sold_pct)
        need_gap = sold_pct - shelf_pct
        denom_movement = a.sold_count + a.shelf_count
        sell_through_pct = (
            (Decimal(a.sold_count) / Decimal(denom_movement) * Decimal('100'))
            if denom_movement
            else Decimal('0')
        )
        avg_sale = (a.sum_sale / a.sale_lines) if a.sale_lines else None
        avg_retail = (a.sum_retail / a.retail_lines) if a.retail_lines else None
        avg_cost = (a.sum_cost / a.cost_lines) if a.cost_lines else None
        if a.paired_count:
            profit_per_item = (a.paired_sale - a.paired_cost) / Decimal(a.paired_count)
        else:
            profit_per_item = None
        if a.paired_sale > 0:
            profit_sales = (a.paired_sale - a.paired_cost) / a.paired_sale
        else:
            profit_sales = None
        if a.paired_cost > 0:
            roc = (a.paired_sale - a.paired_cost) / a.paired_cost
        else:
            roc = None

        rows.append(
            {
                'category': name,
                'shelf_count': a.shelf_count,
                'sold_count': a.sold_count,
                'shelf_pct': shelf_pct,
                'sold_pct': sold_pct,
                'avg_sale': avg_sale,
                'avg_retail': avg_retail,
                'avg_cost': avg_cost,
                'profit_per_item': profit_per_item,
                'profit_sales_ratio': profit_sales,
                'return_on_cost': roc,
                'sell_through_pct': sell_through_pct,
                'need_gap': need_gap,
                'sell_through_rate': sell_through_rates.get(name, Decimal('0')),
            }
        )

    cap = Decimal('20')
    scale = bar_max if bar_max > 0 else cap
    if scale > cap:
        scale = cap
    for row in rows:
        row['bar_scale_max'] = scale

    rows.sort(key=lambda r: r['need_gap'], reverse=True)
    return rows
