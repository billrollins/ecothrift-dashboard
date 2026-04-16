"""Category need panel: taxonomy aggregates from ``CategoryStats`` (daily SQL)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from apps.buying.models import CategoryStats
from apps.buying.services.category_stats_sql import _retail_raw_leg, _unit_raw_leg
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES

_RAW_Q = Decimal('0.000001')
_MONEY_Q = Decimal('0.01')


def taxonomy_bucket_for_item(item) -> str:
    """Map an inventory item to a taxonomy_v1 category name (Python path / fixtures)."""
    from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES as NAMES

    _TAXONOMY_SET = frozenset(NAMES)
    raw = (item.category or '').strip()
    if raw in _TAXONOMY_SET:
        return raw
    if item.product_id:
        pc = (item.product.category or '').strip()
        if pc in _TAXONOMY_SET:
            return pc
    return MIXED_LOTS_UNCATEGORIZED


def _profit_from_avgs(
    avg_sale: Decimal | None, avg_cost: Decimal | None
) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    """Derive profit / item, profit/sales, and return-on-cost from window averages."""
    if avg_sale is None or avg_cost is None:
        return None, None, None
    pip = (avg_sale - avg_cost).quantize(Decimal('0.01'))
    psr: Decimal | None = None
    roc: Decimal | None = None
    if avg_sale > 0:
        psr = (pip / avg_sale).quantize(Decimal('0.0001'))
    if avg_cost > 0:
        roc = (pip / avg_cost).quantize(Decimal('0.0001'))
    return pip, psr, roc


def build_category_need_rows() -> list[dict[str, Any]]:
    """
    Return one row per taxonomy_v1 category (19), sorted by need_gap descending.

    Backed by ``CategoryStats`` (populated by ``compute_daily_category_stats``).
    Shelf/sold percentages are unit shares; Thru uses ``sell_through_rate`` from SQL.
    Sale/retail/cost averages come from ``CategoryStats`` (90-day sold cohort SQL).

    Raw need-score legs (``need_raw_*``) mirror ``category_stats_sql``:
    ``_unit_raw_leg(want_units, have_units)``, ``_retail_raw_leg(want_retail, have_retail)``,
    combined average, then min–max scale to ``need_score_1to99`` (API uses
    :func:`build_category_need_payload` for string serialization).
    """
    stats_map = {c.category: c for c in CategoryStats.objects.filter(category__in=TAXONOMY_V1_CATEGORY_NAMES)}
    total_shelf = sum(stats_map[n].have_units for n in TAXONOMY_V1_CATEGORY_NAMES if n in stats_map)
    total_want = sum(stats_map[n].want_units for n in TAXONOMY_V1_CATEGORY_NAMES if n in stats_map)

    rows: list[dict[str, Any]] = []
    bar_max = Decimal('0')
    for name in TAXONOMY_V1_CATEGORY_NAMES:
        c = stats_map.get(name)
        if c is None:
            c = CategoryStats(
                category=name,
                sell_through_rate=Decimal('0'),
                have_retail=Decimal('0'),
                have_units=0,
                want_retail=Decimal('0'),
                want_units=0,
                need_retail=Decimal('0'),
                need_units=0,
                need_score_1to99=50,
            )
        shelf_pct = (
            (Decimal(c.have_units) / Decimal(total_shelf) * Decimal('100')) if total_shelf else Decimal('0')
        )
        sold_pct = (
            (Decimal(c.want_units) / Decimal(total_want) * Decimal('100')) if total_want else Decimal('0')
        )
        bar_max = max(bar_max, shelf_pct, sold_pct)
        need_gap = sold_pct - shelf_pct
        st_rate = c.sell_through_rate or Decimal('0')
        sell_through_pct = (st_rate * Decimal('100')).quantize(Decimal('0.01'))

        avg_sale = c.avg_sold_price
        avg_retail = c.avg_retail
        avg_cost = c.avg_cost
        pip, psr, roc = _profit_from_avgs(avg_sale, avg_cost)

        need_1_99 = int(getattr(c, 'need_score_1to99', 50))

        hu, wu = int(c.have_units), int(c.want_units)
        hr = c.have_retail if c.have_retail is not None else Decimal('0')
        wr = c.want_retail if c.want_retail is not None else Decimal('0')
        u_leg = _unit_raw_leg(wu, hu)
        r_leg = _retail_raw_leg(wr, hr)
        raw_combined = ((u_leg + r_leg) / Decimal('2')).quantize(_RAW_Q)

        rows.append(
            {
                'category': name,
                'shelf_count': hu,
                'sold_count': wu,
                'have_retail': hr.quantize(_MONEY_Q),
                'want_retail': wr.quantize(_MONEY_Q),
                'need_raw_unit_leg': u_leg,
                'need_raw_retail_leg': r_leg,
                'need_raw_combined': raw_combined,
                'shelf_pct': shelf_pct,
                'sold_pct': sold_pct,
                'avg_sale': avg_sale,
                'avg_retail': avg_retail,
                'avg_cost': avg_cost,
                'profit_per_item': pip,
                'profit_sales_ratio': psr,
                'return_on_cost': roc,
                'sell_through_pct': sell_through_pct,
                'need_gap': need_gap,
                'sell_through_rate': st_rate,
                'need_score_1to99': need_1_99,
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


def build_category_need_payload() -> dict[str, Any]:
    """API payload for ``CategoryNeedView``: rows plus global min/max for ``need_score_1to99`` scaling."""
    rows = build_category_need_rows()
    raw_vals = [r['need_raw_combined'] for r in rows]
    mn = min(raw_vals) if raw_vals else None
    mx = max(raw_vals) if raw_vals else None
    str_keys = (
        'have_retail',
        'want_retail',
        'need_raw_unit_leg',
        'need_raw_retail_leg',
        'need_raw_combined',
    )
    categories: list[dict[str, Any]] = []
    for r in rows:
        row = dict(r)
        for k in str_keys:
            row[k] = str(row[k])
        categories.append(row)
    return {
        'categories': categories,
        'need_score_raw_global_min': str(mn) if mn is not None else None,
        'need_score_raw_global_max': str(mx) if mx is not None else None,
    }
