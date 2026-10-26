"""
The nightly inventory rollup ``InventoryWeek`` (inventory review, owner 2026-10-22). Rebuilt from items, never counted
up as things happen, so voids, returns and edits correct themselves on the next run.

One row per (week starting Monday, dimension, key):

- **category**: the 23 taxonomy_v1 names, Mixed lots included (``taxonomy_bucket_case_sql``, which honours the
  ``category_from_profile`` switch the same way Buying does);
- **subcategory**: ``ProductProfile.subcategory`` under its category (``parent``); '' is "No subcategory";
- **vendor**: the order's vendor code ('' is "No vendor"; Misfit items sit on MIS);
- **price_point**: the tag price band (``PRICE_POINTS``);
- **all**: the whole store, one row a week (key ''), so every Review tab shows the same total.

How an item is counted:

- **In**: its check-in (``checked_in_at``), falling back to ``created_at`` for items on the floor or sold with no
  check-in date (counted in ``on_hand_no_checkin`` / ``sold_no_checkin``). Scrapped or lost items that were never
  checked in never reached the floor and are left out. Items in intake or processing are not on the floor.
- **Old-system imports** (notes ``BACKFILL:``, data-quality eras V1/V2): their check-in and created dates are not
  real. Every sold one counts in ``legacy_sold`` instead of ``units_in`` (and in ``units_sold`` and the money when it
  has a sale date); it is never
  on hand and has no days to sell. Their "scrapped" rows are unsold imports, not shrink (standing decision 3), and are
  left out.
- **Out**: sold at ``sold_at``; scrapped, lost or the old "returned" status at the history row that set it, falling
  back to ``updated_at``. A "sold" item with no ``sold_at`` (SAL-04) is not a sale: it counts in ``units_out_other``.
  So: on hand = last week's + in + legacy_sold - sold - scrapped - lost - out_other.
- **On hand** at the week's end (now, for the open week): in before the end and not out by then.
- **Stale**: on hand and in more than ``inventory_review_stale_days`` (90) days. **Bulk**: units of a product with
  ``group_min_units`` (10, Thrift+ rulebook P6) or more on hand.
- **Sold money**: ``sales`` is ``sold_for``, ``net`` is ``sold_net`` (``sold_for`` where empty). Retail and cost are
  summed only over sold items that have them (``sold_with_retail``, ``sold_with_cost``), with the net of the same items,
  so recovery compares like with like.
- Thrift+ returns (``ReturnRecord``) are counted in the week they came back; the item stays sold.

Price points use today's tag price (no price history).
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db import connection, transaction
from django.utils import timezone

from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql

STALE_DAYS_KEY = 'inventory_review_stale_days'
DEFAULT_STALE_DAYS = 90
RECENT_WEEKS = 8
BACKFILL_YEARS = 2
WEEKS_PER_QUERY = 13

PRICE_POINTS = [
    ('u5', 'Under $5', None, 5),
    ('5-10', '$5 to $10', 5, 10),
    ('10-25', '$10 to $25', 10, 25),
    ('25-50', '$25 to $50', 25, 50),
    ('50-100', '$50 to $100', 50, 100),
    ('100+', '$100 and up', 100, None),
]
PRICE_POINT_LABELS = {k: label for k, label, _lo, _hi in PRICE_POINTS}
NO_SUBCATEGORY = 'No subcategory'
NO_VENDOR = 'No vendor'

# GROUPING(cat, sub, vcode, band): a 1 bit is a column not grouped.
_GROUPS = {7: 'category', 3: 'subcategory', 13: 'vendor', 14: 'price_point', 15: 'all'}
_SETS = 'GROUPING SETS ((ws, cat), (ws, cat, sub), (ws, vcode, vname), (ws, band), (ws))'

FLOW_FIELDS = ('units_in', 'legacy_sold', 'units_sold', 'units_scrapped', 'units_lost', 'units_out_other', 'sales', 'net',
               'sold_retail', 'sold_with_retail', 'sold_net_with_retail', 'sold_cost', 'sold_with_cost',
               'sold_net_with_cost', 'sold_no_checkin', 'median_days_to_sell')
STOCK_FIELDS = ('on_hand', 'stale_on_hand', 'bulk_on_hand', 'on_hand_retail', 'on_hand_no_retail',
                'on_hand_no_checkin')


def stale_days() -> int:
    from apps.core.models import AppSetting

    raw = AppSetting.objects.filter(key=STALE_DAYS_KEY).values_list('value', flat=True).first()
    try:
        n = int(raw)
        return n if 1 <= n <= 3650 else DEFAULT_STALE_DAYS
    except (TypeError, ValueError):
        return DEFAULT_STALE_DAYS


def bulk_min_units() -> int:
    from apps.thriftplus.services.rewards import rules

    return rules().group_min_units


def week_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _start(day: date) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.min))


def band_sql() -> str:
    whens = []
    for key, _label, _lo, hi in PRICE_POINTS:
        if hi is not None:
            whens.append(f"WHEN COALESCE(i.price, 0) < {hi} THEN '{key}'")
    return f"CASE {' '.join(whens)} ELSE '{PRICE_POINTS[-1][0]}' END"


def _base_sql() -> str:
    """Every item that reached the floor: its keys, money, in and out times. Alias ``b``."""
    case = taxonomy_bucket_case_sql()
    return f"""
    base AS (
        SELECT i.id, i.product_id, i.status, i.retail, i.cost, i.sold_for,
               (i.status = 'sold' AND i.sold_at IS NOT NULL) AS sale,
               (i.notes LIKE 'BACKFILL:%%') AS legacy,
               COALESCE(i.sold_net, i.sold_for) AS sold_net,
               ({case}) AS cat,
               TRIM(COALESCE(pp.subcategory, '')) AS sub,
               COALESCE(v.code, '') AS vcode, COALESCE(v.name, '') AS vname,
               {band_sql()} AS band,
               (i.checked_in_at IS NULL OR i.notes LIKE 'BACKFILL:%%') AS no_checkin,
               CASE WHEN i.notes LIKE 'BACKFILL:%%' AND i.status = 'sold' THEN COALESCE(i.sold_at, i.updated_at)
                    ELSE COALESCE(i.checked_in_at, i.created_at) END AS in_raw,
               CASE WHEN i.status = 'sold' THEN COALESCE(i.sold_at, i.updated_at)
                    WHEN i.status IN ('scrapped', 'lost', 'returned') THEN COALESCE(h.at, i.updated_at)
               END AS out_at
        FROM inventory_item i
        LEFT JOIN inventory_product p ON p.id = i.product_id
        LEFT JOIN inventory_manifestrow mr ON mr.id = i.manifest_row_id
        LEFT JOIN inventory_productprofile pp ON pp.product_id = i.product_id
        LEFT JOIN inventory_purchaseorder po ON po.id = i.purchase_order_id
        LEFT JOIN inventory_vendor v ON v.id = po.vendor_id
        LEFT JOIN LATERAL (
            SELECT MAX(ih.created_at) AS at FROM inventory_itemhistory ih
            WHERE ih.item_id = i.id AND ih.new_value = i.status
        ) h ON i.status IN ('scrapped', 'lost', 'returned')
        WHERE (i.status IN ('on_shelf', 'sold')
               OR (i.status IN ('scrapped', 'lost', 'returned') AND i.checked_in_at IS NOT NULL))
          AND NOT (i.status = 'scrapped' AND i.notes LIKE 'BACKFILL:%%')
    ),
    b AS (
        SELECT base.*, LEAST(in_raw, COALESCE(out_at, in_raw)) AS in_at FROM base
    )"""


_KEYS = 'ws, GROUPING(cat, sub, vcode, band) AS g, cat, sub, vcode, vname, band'


def _flows(start: datetime, end: datetime) -> list[tuple]:
    sql = f"""
    WITH {_base_sql()},
    f AS (
        SELECT b.*, 'in' AS kind, date_trunc('week', b.in_at AT TIME ZONE %(tz)s)::date AS ws, NULL::float AS days
        FROM b WHERE b.in_at >= %(start)s AND b.in_at < %(end)s AND NOT (b.legacy AND b.status = 'sold')
        UNION ALL
        SELECT b.*, 'out', date_trunc('week', b.out_at AT TIME ZONE %(tz)s)::date,
               EXTRACT(EPOCH FROM (b.out_at - b.in_at)) / 86400.0
        FROM b WHERE b.out_at >= %(start)s AND b.out_at < %(end)s
    )
    SELECT {_KEYS},
        COUNT(*) FILTER (WHERE kind = 'in'),
        COUNT(*) FILTER (WHERE kind = 'out' AND legacy AND status = 'sold'),
        COUNT(*) FILTER (WHERE kind = 'out' AND sale),
        COUNT(*) FILTER (WHERE kind = 'out' AND status = 'scrapped'),
        COUNT(*) FILTER (WHERE kind = 'out' AND status = 'lost'),
        COUNT(*) FILTER (WHERE kind = 'out' AND (status = 'returned' OR (status = 'sold' AND NOT sale))),
        COALESCE(SUM(sold_for) FILTER (WHERE kind = 'out' AND sale), 0),
        COALESCE(SUM(sold_net) FILTER (WHERE kind = 'out' AND sale), 0),
        COALESCE(SUM(retail) FILTER (WHERE kind = 'out' AND sale AND retail > 0), 0),
        COUNT(*) FILTER (WHERE kind = 'out' AND sale AND retail > 0),
        COALESCE(SUM(sold_net) FILTER (WHERE kind = 'out' AND sale AND retail > 0), 0),
        COALESCE(SUM(cost) FILTER (WHERE kind = 'out' AND sale AND cost > 0), 0),
        COUNT(*) FILTER (WHERE kind = 'out' AND sale AND cost > 0),
        COALESCE(SUM(sold_net) FILTER (WHERE kind = 'out' AND sale AND cost > 0), 0),
        COUNT(*) FILTER (WHERE kind = 'out' AND sale AND no_checkin),
        percentile_cont(0.5) WITHIN GROUP (ORDER BY days) FILTER (WHERE kind = 'out' AND sale AND NOT legacy)
    FROM f
    GROUP BY {_SETS}
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, {'tz': timezone.get_current_timezone_name(), 'start': start, 'end': end})
        return cursor.fetchall()


def _stock(weeks: list[date], ends: list[datetime], stale: int, bulk: int) -> list[tuple]:
    sql = f"""
    WITH {_base_sql()},
    w AS (SELECT * FROM unnest(%(weeks)s::date[], %(ends)s::timestamptz[]) AS w(ws, we)),
    s AS (
        SELECT w.ws, w.we, b.*, COUNT(*) OVER (PARTITION BY w.ws, b.product_id) AS product_units
        FROM w JOIN b ON b.in_at < w.we AND (b.out_at IS NULL OR b.out_at >= w.we)
    )
    SELECT {_KEYS},
        COUNT(*),
        COUNT(*) FILTER (WHERE in_at < we - make_interval(days => %(stale)s)),
        COUNT(*) FILTER (WHERE product_units >= %(bulk)s),
        COALESCE(SUM(retail) FILTER (WHERE retail > 0), 0),
        COUNT(*) FILTER (WHERE retail IS NULL OR retail <= 0),
        COUNT(*) FILTER (WHERE no_checkin)
    FROM s
    GROUP BY {_SETS}
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, {'weeks': weeks, 'ends': ends, 'stale': stale, 'bulk': bulk})
        return cursor.fetchall()


def _returns(start: datetime, end: datetime) -> list[tuple]:
    sql = f"""
    WITH {_base_sql()},
    r AS (
        SELECT b.*, date_trunc('week', rr.created_at AT TIME ZONE %(tz)s)::date AS ws
        FROM thriftplus_returnrecord rr JOIN b ON b.id = rr.item_id
        WHERE rr.created_at >= %(start)s AND rr.created_at < %(end)s
    )
    SELECT {_KEYS}, COUNT(*) FROM r GROUP BY {_SETS}
    """
    with connection.cursor() as cursor:
        cursor.execute(sql, {'tz': timezone.get_current_timezone_name(), 'start': start, 'end': end})
        return cursor.fetchall()


def _ident(g: int, cat, sub, vcode, vname, band) -> tuple[str, str, str, str]:
    """(dimension, parent, key, label) for one grouped row."""
    dim = _GROUPS[g]
    if dim == 'all':
        return dim, '', '', 'All'
    if dim == 'category':
        return dim, '', cat, cat
    if dim == 'subcategory':
        return dim, cat, sub, sub or NO_SUBCATEGORY
    if dim == 'vendor':
        return dim, '', vcode, (f'{vname} ({vcode})' if vname else vcode) if vcode else NO_VENDOR
    return dim, '', band, PRICE_POINT_LABELS.get(band, band)


def compute(weeks: list[date], *, now: datetime | None = None) -> list[dict]:
    """The rows for these week starts (Mondays), not saved. The open week's stock is as of ``now``."""
    if not weeks:
        return []
    now = now or timezone.now()
    weeks = sorted(set(weeks))
    rows: dict[tuple, dict] = {}

    def row(ws, g, cat, sub, vcode, vname, band) -> dict:
        dim, parent, key, label = _ident(g, cat, sub, vcode, vname, band)
        k = (ws, dim, parent, key)
        if k not in rows:
            rows[k] = {'week_start': ws, 'dimension': dim, 'parent': parent, 'key': key, 'label': label}
        return rows[k]

    wanted = set(weeks)
    start, end = _start(weeks[0]), _start(weeks[-1] + timedelta(days=7))
    for ws, g, cat, sub, vcode, vname, band, *vals in _flows(start, end):
        if ws in wanted:
            row(ws, g, cat, sub, vcode, vname, band).update(zip(FLOW_FIELDS, vals))
    for ws, g, cat, sub, vcode, vname, band, n in _returns(start, end):
        if ws in wanted:
            row(ws, g, cat, sub, vcode, vname, band)['units_returned'] = n
    ends = [min(_start(ws + timedelta(days=7)), now) for ws in weeks]
    for ws, g, cat, sub, vcode, vname, band, *vals in _stock(weeks, ends, stale_days(), bulk_min_units()):
        row(ws, g, cat, sub, vcode, vname, band).update(zip(STOCK_FIELDS, vals))
    out = []
    for r in rows.values():
        for name in (*FLOW_FIELDS, *STOCK_FIELDS, 'units_returned'):
            r.setdefault(name, None if name == 'median_days_to_sell' else 0)
        for name in ('sales', 'net', 'sold_retail', 'sold_net_with_retail', 'sold_cost', 'sold_net_with_cost',
                     'on_hand_retail'):
            r[name] = Decimal(str(r.get(name) or 0)).quantize(Decimal('0.01'))
        out.append(r)
    return out


def rebuild(weeks: list[date], *, now: datetime | None = None) -> int:
    """Replace the saved rows of these weeks. Answers rows written."""
    from apps.inventory.models import InventoryWeek

    written = 0
    weeks = sorted(set(weeks))
    for i in range(0, len(weeks), WEEKS_PER_QUERY):
        chunk = weeks[i:i + WEEKS_PER_QUERY]
        rows = compute(chunk, now=now)
        with transaction.atomic():
            InventoryWeek.objects.filter(week_start__in=chunk).delete()
            InventoryWeek.objects.bulk_create([InventoryWeek(**r) for r in rows], batch_size=2000)
        written += len(rows)
    return written


def recent_weeks(n: int = RECENT_WEEKS, today: date | None = None) -> list[date]:
    """The open week and the ``n - 1`` before it."""
    this = week_of(today or timezone.localdate())
    return [this - timedelta(weeks=k) for k in range(n)]


def all_weeks(years: int = BACKFILL_YEARS, today: date | None = None) -> list[date]:
    return recent_weeks(years * 52 + 1, today)


def nightly(*, full: bool = False, weeks: int = RECENT_WEEKS) -> tuple[int, int]:
    """The nightly run: the last ``weeks`` weeks, or every week of the backfill when ``full`` or when the table is
    empty (the first run). Answers (weeks rebuilt, rows written)."""
    from apps.inventory.models import InventoryWeek

    chosen = all_weeks() if full or not InventoryWeek.objects.exists() else recent_weeks(weeks)
    return len(chosen), rebuild(chosen)
