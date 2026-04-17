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


def _profit_from_sums(
    sold_sum: Decimal | None,
    cost_sum: Decimal | None,
    sample_size: int,
) -> tuple[Decimal | None, Decimal | None]:
    """
    avg_profit = (sum_sold - sum_cost) / n; profit_margin = (sum_sold - sum_cost) / sum_sold.
    """
    if sample_size <= 0 or sold_sum is None or cost_sum is None:
        return None, None
    if sold_sum <= 0:
        return None, None
    avg_profit = ((sold_sum - cost_sum) / Decimal(sample_size)).quantize(Decimal('0.01'))
    profit_margin = ((sold_sum - cost_sum) / sold_sum).quantize(Decimal('0.0001'))
    return avg_profit, profit_margin


def build_category_need_rows() -> list[dict[str, Any]]:
    """
    Return one row per taxonomy_v1 category (19), sorted by need_gap descending.

    Backed by ``CategoryStats`` (populated by ``compute_daily_category_stats``).
    Shelf/sold percentages are unit shares; recovery is ``SUM(sold_for)/SUM(retail_value)``
    per bucket from SQL (all-time qualifying sold rows).
    Sale/retail/cost averages and profitability come from ``CategoryStats`` (good-data sold cohort SQL).

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
                recovery_rate=Decimal('0'),
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
        rec_rate = c.recovery_rate or Decimal('0')
        recovery_pct = (rec_rate * Decimal('100')).quantize(Decimal('0.01'))

        avg_sale = c.avg_sold_price
        avg_retail = c.avg_retail
        avg_cost = c.avg_cost
        sold_amt = c.recovery_sold_amount
        cost_amt = c.recovery_cost_amount
        n_good = int(getattr(c, 'good_data_sample_size', 0) or 0)
        avg_profit, profit_margin = _profit_from_sums(sold_amt, cost_amt, n_good)

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
                'avg_profit': avg_profit,
                'profit_margin': profit_margin,
                'good_data_sample_size': n_good,
                'recovery_pct': recovery_pct,
                'need_gap': need_gap,
                'recovery_rate': rec_rate,
                'need_score_1to99': need_1_99,
            }
        )

    floor = Decimal('20')
    scale = max(bar_max, floor)
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
