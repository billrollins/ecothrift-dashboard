"""
Inventory → Review (inventory review phase 2, owner 2026-10-22): the Categories tab.

Flows (in, out, sold, money, days to sell) come from the weekly rollup ``InventoryWeek`` over complete weeks: **Week**
is the last complete Monday-to-Sunday week, **4 weeks** the last four. Stock (on hand, stale, bulk, missing data) is
**now**, read live from the items on the shelf in one grouped query (the rollup's open-week on hand is the same count).

- **Weeks of supply** = on hand ÷ average units sold per week over the last 4 complete weeks (whatever the toggle).
- **Recovery** = net ÷ retail, over sold items that have a retail; **net ÷ cost** where cost exists.
- **Days to sell**: the median of each week's median, weighted by units sold (4 weeks).

Flags, each limit an owner setting (``SETTINGS``):
- **overstocked**: more than ``inventory_review_overstock_weeks`` (12) weeks of supply, or stock with no sale in 4 weeks;
- **short**: under ``inventory_review_short_weeks`` (2) weeks of supply;
- **stale-heavy**: more than ``inventory_review_stale_heavy_share`` (40%) of on hand stale;
- **slowing**: 4-week sales ``inventory_review_slowing_share`` (30%) or more below the 12-week average (only with at
  least one sale a week over the 12 weeks, so a quiet category doesn't flag on noise);
- **missing data**: Mixed lots, or more than ``inventory_review_missing_share`` (10%) of on hand with no retail or no
  check-in date.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db import connection
from django.utils import timezone

from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED
from apps.inventory.services import inventory_week

SPANS = (1, 4)
SUPPLY_WEEKS = 4
TREND_WEEKS = 12
NO_SUBCATEGORY_KEY = '(none)'

SETTINGS = {
    'inventory_review_overstock_weeks': 12,
    'inventory_review_short_weeks': 2,
    'inventory_review_stale_heavy_share': 0.40,
    'inventory_review_slowing_share': 0.30,
    'inventory_review_missing_share': 0.10,
}

FLAGS = [
    ('overstocked', 'Overstocked'),
    ('short', 'Short'),
    ('stale', 'Stale-heavy'),
    ('slowing', 'Slowing'),
    ('missing', 'Missing data'),
]


def settings() -> dict[str, float]:
    from apps.core.models import AppSetting

    values = dict(AppSetting.objects.filter(key__in=SETTINGS).values_list('key', 'value'))
    out: dict[str, float] = {}
    for key, default in SETTINGS.items():
        try:
            n = float(values.get(key, default))
            out[key] = n if n >= 0 else default
        except (TypeError, ValueError):
            out[key] = default
    out['inventory_review_stale_days'] = inventory_week.stale_days()
    return out


def _stock_sql(by_sub: bool, stale_days: int, bulk: int) -> tuple[str, dict]:
    case = taxonomy_bucket_case_sql()
    group = 'cat, sub' if by_sub else 'cat'
    where = 'WHERE cat = %(category)s' if by_sub else ''
    sql = f"""
    SELECT {group},
        COUNT(*),
        COUNT(*) FILTER (WHERE in_at < now() - make_interval(days => %(stale)s)),
        COUNT(*) FILTER (WHERE product_units >= %(bulk)s),
        COUNT(*) FILTER (WHERE no_retail),
        COUNT(*) FILTER (WHERE no_checkin),
        COUNT(*) FILTER (WHERE no_retail OR no_checkin)
    FROM (
        SELECT ({case}) AS cat,
               TRIM(COALESCE(pp.subcategory, '')) AS sub,
               COALESCE(i.checked_in_at, i.created_at) AS in_at,
               (i.retail IS NULL OR i.retail <= 0) AS no_retail,
               (i.checked_in_at IS NULL OR i.notes LIKE 'BACKFILL:%%') AS no_checkin,
               COUNT(*) OVER (PARTITION BY i.product_id) AS product_units
        FROM inventory_item i
        LEFT JOIN inventory_product p ON p.id = i.product_id
        LEFT JOIN inventory_manifestrow mr ON mr.id = i.manifest_row_id
        LEFT JOIN inventory_productprofile pp ON pp.product_id = i.product_id
        WHERE i.status = 'on_shelf'
    ) s
    {where}
    GROUP BY {group}
    """
    return sql, {'stale': stale_days, 'bulk': bulk}


STOCK_FIELDS = ('on_hand', 'stale_on_hand', 'bulk_on_hand', 'on_hand_no_retail', 'on_hand_no_checkin',
                'on_hand_missing')


def live_stock(category: str | None, *, stale_days: int, bulk: int) -> dict[str, dict[str, int]]:
    """Per category (or per subcategory of ``category``): the shelf right now."""
    sql, params = _stock_sql(category is not None, stale_days, bulk)
    if category is not None:
        params['category'] = category
    out: dict[str, dict[str, int]] = {}
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        for row in cursor.fetchall():
            if category is not None:
                key, vals = row[1], row[2:]
            else:
                key, vals = row[0], row[1:]
            out[key] = dict(zip(STOCK_FIELDS, (int(v) for v in vals)))
    return out


def _weighted_median(pairs: list[tuple[float, int]]) -> float | None:
    pairs = sorted((m, w) for m, w in pairs if m is not None and w > 0)
    total = sum(w for _m, w in pairs)
    if not total:
        return None
    seen = 0
    for m, w in pairs:
        seen += w
        if seen * 2 >= total:
            return m
    return pairs[-1][0]


def _ratio(a, b) -> float | None:
    return round(float(a) / float(b), 4) if b else None


def _flags(row: dict, cfg: dict) -> list[str]:
    flags = []
    on_hand, wos = row['on_hand'], row['weeks_of_supply']
    if on_hand and ((wos is not None and wos > cfg['inventory_review_overstock_weeks']) or not row['sold_4wk']):
        flags.append('overstocked')
    if wos is not None and wos < cfg['inventory_review_short_weeks']:
        flags.append('short')
    if on_hand and row['stale_on_hand'] / on_hand > cfg['inventory_review_stale_heavy_share']:
        flags.append('stale')
    avg12 = row['sold_12wk'] / TREND_WEEKS
    if row['sold_12wk'] >= TREND_WEEKS and row['sold_4wk'] / SUPPLY_WEEKS < avg12 * (1 - cfg['inventory_review_slowing_share']):
        flags.append('slowing')
    if row['key'] == MIXED_LOTS_UNCATEGORIZED or (
            on_hand and row['on_hand_missing'] / on_hand > cfg['inventory_review_missing_share']):
        flags.append('missing')
    return flags


def _row(key: str, label: str, weeks: list[dict], stock: dict[str, int], span_weeks: set, supply_weeks: set,
         cfg: dict) -> dict[str, Any]:
    span = [w for w in weeks if w['week_start'] in span_weeks]

    def total(name, rows=span):
        return sum((r[name] for r in rows), Decimal('0') if isinstance(rows[0][name], Decimal) else 0) if rows else 0

    out_units = sum(r['units_sold'] + r['units_scrapped'] + r['units_lost'] + r['units_out_other'] for r in span)
    sold_4 = sum(r['units_sold'] for r in weeks if r['week_start'] in supply_weeks)
    sold_12 = sum(r['units_sold'] for r in weeks)
    on_hand = stock.get('on_hand', 0)
    row = {
        'key': key, 'label': label,
        'units_in': total('units_in'), 'legacy_sold': total('legacy_sold'), 'units_out': out_units,
        'units_sold': total('units_sold'), 'units_scrapped': total('units_scrapped'), 'units_lost': total('units_lost'),
        'units_returned': total('units_returned'),
        'sales': total('sales'), 'net': total('net'),
        'sold_retail': total('sold_retail'), 'sold_with_retail': total('sold_with_retail'),
        'sold_net_with_retail': total('sold_net_with_retail'),
        'sold_cost': total('sold_cost'), 'sold_with_cost': total('sold_with_cost'),
        'sold_net_with_cost': total('sold_net_with_cost'), 'sold_no_checkin': total('sold_no_checkin'),
        'median_days_to_sell': _weighted_median([(r['median_days_to_sell'], r['units_sold']) for r in span]),
        'sold_4wk': sold_4, 'sold_12wk': sold_12,
        **{name: stock.get(name, 0) for name in STOCK_FIELDS},
    }
    row['weeks_of_supply'] = round(on_hand / (sold_4 / SUPPLY_WEEKS), 1) if sold_4 else None
    row['stale_share'] = _ratio(row['stale_on_hand'], on_hand)
    row['bulk_share'] = _ratio(row['bulk_on_hand'], on_hand)
    row['recovery'] = _ratio(row['sold_net_with_retail'], row['sold_retail'])
    row['net_to_cost'] = _ratio(row['sold_net_with_cost'], row['sold_cost'])
    row['flags'] = _flags(row, cfg)
    for name in ('sales', 'net', 'sold_retail', 'sold_net_with_retail', 'sold_cost', 'sold_net_with_cost'):
        row[name] = str(row[name])
    return row


WEEK_FIELDS = ('week_start', 'parent', 'key', 'label', 'units_in', 'legacy_sold', 'units_sold', 'units_scrapped',
               'units_lost', 'units_out_other', 'units_returned', 'sales', 'net', 'sold_retail', 'sold_with_retail',
               'sold_net_with_retail', 'sold_cost', 'sold_with_cost', 'sold_net_with_cost', 'sold_no_checkin',
               'median_days_to_sell')


def review(span: int = 1, category: str | None = None, *, today: date | None = None) -> dict[str, Any]:
    """The Categories tab: one row per category, or per subcategory of ``category``, plus the total."""
    from apps.inventory.models import InventoryWeek

    span = span if span in SPANS else 1
    cfg = settings()
    last = inventory_week.week_of(today or timezone.localdate()) - timedelta(days=7)
    trend = [last - timedelta(weeks=k) for k in range(TREND_WEEKS)]
    span_weeks, supply_weeks = set(trend[:span]), set(trend[:SUPPLY_WEEKS])

    qs = InventoryWeek.objects.filter(week_start__in=trend)
    if category is None:
        qs = qs.filter(dimension=InventoryWeek.DIM_CATEGORY)
    else:
        qs = qs.filter(dimension=InventoryWeek.DIM_SUBCATEGORY, parent=category)
    weeks_by_key: dict[str, list[dict]] = defaultdict(list)
    labels: dict[str, str] = {}
    for r in qs.values(*WEEK_FIELDS):
        weeks_by_key[r['key']].append(r)
        labels[r['key']] = r['label']
    stock = live_stock(category, stale_days=int(cfg['inventory_review_stale_days']),
                       bulk=inventory_week.bulk_min_units())

    rows = []
    for key in sorted(set(weeks_by_key) | set(stock)):
        label = labels.get(key) or (key if category is None else (key or inventory_week.NO_SUBCATEGORY))
        rows.append(_row(key, label, weeks_by_key.get(key, []), stock.get(key, {}), span_weeks, supply_weeks, cfg))
    all_weeks = [w for ws in weeks_by_key.values() for w in ws]
    all_stock = {name: sum(s.get(name, 0) for s in stock.values()) for name in STOCK_FIELDS}
    total = _row(category or '', category or 'All categories', all_weeks, all_stock, span_weeks, supply_weeks, cfg)
    if category is None:
        total['flags'] = [f for f in total['flags'] if f != 'missing']  # the whole store always holds Mixed lots

    return {
        'span': span, 'category': category,
        'from': min(span_weeks).isoformat(), 'to': (max(span_weeks) + timedelta(days=6)).isoformat(),
        'as_of': timezone.localtime().isoformat(),
        'built': InventoryWeek.objects.filter(week_start=last).order_by('-computed_at')
        .values_list('computed_at', flat=True).first(),
        'rows': rows, 'total': total,
        'settings': cfg, 'flags': [{'key': k, 'label': v} for k, v in FLAGS],
    }


# ── Inventory search filters (the drill from a row to its items) ───────────────

def product_ids_sql(*, category: str = '', sub: str | None = None, stale: bool = False,
                    on_shelf: bool = True) -> tuple[str, list]:
    """SQL for the product ids with a unit matching the Review drill: its category (taxonomy bucket), subcategory
    (``NO_SUBCATEGORY_KEY`` = none), stale (on the shelf longer than the stale days). For ``pk__in=RawSQL(...)``."""
    where, params = [], []
    if on_shelf or stale:
        where.append("i.status = 'on_shelf'")
    if category:
        where.append(f'({taxonomy_bucket_case_sql()}) = %s')
        params.append(category)
    if sub is not None:
        where.append("TRIM(COALESCE(pp.subcategory, '')) = %s")
        params.append('' if sub == NO_SUBCATEGORY_KEY else sub)
    if stale:
        where.append('COALESCE(i.checked_in_at, i.created_at) < %s')
        params.append(timezone.now() - timedelta(days=inventory_week.stale_days()))
    sql = f"""
        SELECT DISTINCT i.product_id FROM inventory_item i
        LEFT JOIN inventory_product p ON p.id = i.product_id
        LEFT JOIN inventory_manifestrow mr ON mr.id = i.manifest_row_id
        LEFT JOIN inventory_productprofile pp ON pp.product_id = i.product_id
        WHERE {' AND '.join(where) or 'TRUE'}
    """
    return sql, params
