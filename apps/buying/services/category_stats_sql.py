"""Raw SQL aggregates for ``CategoryStats`` (daily job). Uses ``taxonomy_bucket_case_sql``."""

from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import connection

from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES


def _case() -> str:
    return taxonomy_bucket_case_sql()


def _have_rows() -> list[tuple[str, int, Decimal]]:
    """Return (bucket, have_units, have_retail) for on_shelf items."""
    case = _case()
    sql = f"""
        SELECT b.bucket, COUNT(*)::int, COALESCE(SUM(b.retail_line), 0)::numeric
        FROM (
            SELECT
                ({case}) AS bucket,
                COALESCE(i.retail_value, i.price, 0)::numeric AS retail_line
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            WHERE i.status = 'on_shelf'
        ) b
        GROUP BY b.bucket
    """
    out: list[tuple[str, int, Decimal]] = []
    with connection.cursor() as cursor:
        cursor.execute(sql)
        for bucket, units, retail in cursor.fetchall():
            out.append((bucket, int(units or 0), Decimal(str(retail or 0))))
    return out


def _want_rows(since: datetime) -> list[tuple[str, int, Decimal]]:
    """Sold in pricing window (want mix): sold_at >= since, with sale + retail filters."""
    case = _case()
    sql = f"""
        SELECT b.bucket, COUNT(*)::int, COALESCE(SUM(b.retail_line), 0)::numeric
        FROM (
            SELECT
                ({case}) AS bucket,
                COALESCE(i.retail_value, i.price, 0)::numeric AS retail_line
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            WHERE i.status = 'sold'
              AND i.sold_at >= %s
              AND COALESCE(i.sold_for, i.price) >= 0.01
        ) b
        GROUP BY b.bucket
    """
    out: list[tuple[str, int, Decimal]] = []
    with connection.cursor() as cursor:
        cursor.execute(sql, [since])
        for bucket, units, retail in cursor.fetchall():
            out.append((bucket, int(units or 0), Decimal(str(retail or 0))))
    return out


def _want_avg_rows(
    since: datetime,
) -> list[tuple[str, Decimal | None, Decimal | None, Decimal | None]]:
    """Per bucket: AVG sale, AVG retail line, AVG cost — same cohort as ``_want_rows``."""
    case = _case()
    sql = f"""
        SELECT b.bucket,
               AVG(b.sale_amt)::numeric,
               AVG(b.retail_line)::numeric,
               AVG(b.cost_line)::numeric
        FROM (
            SELECT
                ({case}) AS bucket,
                COALESCE(i.sold_for, i.price)::numeric AS sale_amt,
                COALESCE(i.retail_value, i.price, 0)::numeric AS retail_line,
                i.cost AS cost_line
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            WHERE i.status = 'sold'
              AND i.sold_at >= %s
              AND COALESCE(i.sold_for, i.price) >= 0.01
        ) b
        GROUP BY b.bucket
    """
    q = Decimal('0.01')
    out: list[tuple[str, Decimal | None, Decimal | None, Decimal | None]] = []
    with connection.cursor() as cursor:
        cursor.execute(sql, [since])
        for bucket, avg_sale, avg_ret, avg_co in cursor.fetchall():
            out.append(
                (
                    bucket,
                    Decimal(str(avg_sale)).quantize(q) if avg_sale is not None else None,
                    Decimal(str(avg_ret)).quantize(q) if avg_ret is not None else None,
                    Decimal(str(avg_co)).quantize(q) if avg_co is not None else None,
                )
            )
    return out


def _sell_through_counts() -> list[tuple[str, int, int]]:
    """
    Per bucket: (qualifying_sold_count, on_shelf_count).
    Qualifying sold: sold + sale amount + retail filters (Bill).
    """
    case = _case()
    sql = f"""
        SELECT bucket, COALESCE(SUM(sold_c), 0)::int, COALESCE(SUM(shelf_c), 0)::int
        FROM (
            SELECT ({case}) AS bucket,
                   CASE WHEN i.status = 'sold'
                        AND COALESCE(i.sold_for, i.price) >= 0.01
                        AND COALESCE(i.retail_value, i.price) >= 0.50
                   THEN 1 ELSE 0 END AS sold_c,
                   CASE WHEN i.status = 'on_shelf' THEN 1 ELSE 0 END AS shelf_c
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
        ) t
        GROUP BY bucket
    """
    out: list[tuple[str, int, int]] = []
    with connection.cursor() as cursor:
        cursor.execute(sql)
        for bucket, sold_c, shelf_c in cursor.fetchall():
            out.append((bucket, int(sold_c or 0), int(shelf_c or 0)))
    return out


def _unit_raw_leg(want_u: int, have_u: int) -> Decimal:
    if have_u == 0 and want_u > 0:
        return Decimal('1')
    if want_u == 0 and have_u > 0:
        return Decimal('0')
    if have_u == 0 and want_u == 0:
        return Decimal('0.5')
    return (Decimal(want_u) / Decimal(have_u)).quantize(Decimal('0.000001'))


def _retail_raw_leg(want_r: Decimal, have_r: Decimal) -> Decimal:
    if have_r <= 0 and want_r > 0:
        return Decimal('1')
    if want_r <= 0 and have_r > 0:
        return Decimal('0')
    if have_r <= 0 and want_r <= 0:
        return Decimal('0.5')
    return (want_r / have_r).quantize(Decimal('0.000001'))


def compute_category_stats_payloads(*, since: datetime) -> dict[str, dict[str, Any]]:
    """
    Merge raw aggregates into per-canonical-category dicts ready for CategoryStats upsert.

    Keys are exactly ``TAXONOMY_V1_CATEGORY_NAMES``; missing buckets get zeros.
    """
    have_map = {name: (0, Decimal('0')) for name in TAXONOMY_V1_CATEGORY_NAMES}
    for bucket, u, r in _have_rows():
        if bucket in have_map:
            have_map[bucket] = (u, r)

    want_map = {name: (0, Decimal('0')) for name in TAXONOMY_V1_CATEGORY_NAMES}
    for bucket, u, r in _want_rows(since):
        if bucket in want_map:
            want_map[bucket] = (u, r)

    avg_map: dict[str, tuple[Decimal | None, Decimal | None, Decimal | None]] = {
        name: (None, None, None) for name in TAXONOMY_V1_CATEGORY_NAMES
    }
    for bucket, a_sale, a_ret, a_cost in _want_avg_rows(since):
        if bucket in avg_map:
            avg_map[bucket] = (a_sale, a_ret, a_cost)

    rate_map: dict[str, dict[str, Any]] = {}
    for bucket, sold_c, shelf_c in _sell_through_counts():
        if bucket not in TAXONOMY_V1_CATEGORY_NAMES:
            continue
        denom = sold_c + shelf_c
        num = Decimal(sold_c)
        den = Decimal(denom)
        rate = (num / den) if den > 0 else Decimal('0')
        rate_map[bucket] = {
            'rate': rate,
            'numerator': num.quantize(Decimal('0.01')),
            'denominator': den.quantize(Decimal('0.01')) if den > 0 else None,
        }

    out: dict[str, dict[str, Any]] = {}
    for name in TAXONOMY_V1_CATEGORY_NAMES:
        hu, hr = have_map[name]
        wu, wr = want_map[name]
        st = rate_map.get(name)
        rate = st['rate'] if st else Decimal('0')
        need_r = (wr - hr).quantize(Decimal('0.01'))
        need_u = wu - hu
        a_sale, a_ret, a_cost = avg_map[name]
        if wu == 0:
            a_sale, a_ret, a_cost = None, None, None
        out[name] = {
            'have_units': hu,
            'have_retail': hr.quantize(Decimal('0.01')),
            'want_units': wu,
            'want_retail': wr.quantize(Decimal('0.01')),
            'need_retail': need_r,
            'need_units': need_u,
            'sell_through_rate': rate.quantize(Decimal('0.000001')),
            'sell_through_numerator': st['numerator'] if st else None,
            'sell_through_denominator': st['denominator'] if st else None,
            'avg_sold_price': a_sale,
            'avg_retail': a_ret,
            'avg_cost': a_cost,
        }

    raw_pairs: list[tuple[str, Decimal]] = []
    for name in TAXONOMY_V1_CATEGORY_NAMES:
        d = out[name]
        u_leg = _unit_raw_leg(int(d['want_units']), int(d['have_units']))
        r_leg = _retail_raw_leg(d['want_retail'], d['have_retail'])
        raw = ((u_leg + r_leg) / Decimal('2')).quantize(Decimal('0.000001'))
        raw_pairs.append((name, raw))

    raw_vals = [r for _, r in raw_pairs]
    mn, mx = min(raw_vals), max(raw_vals)
    for name, raw in raw_pairs:
        if mx == mn:
            ns = 50
        else:
            scaled = Decimal('1') + (raw - mn) / (mx - mn) * Decimal('98')
            ns = int(scaled.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
            ns = max(1, min(99, ns))
        out[name]['need_score_1to99'] = ns

    return out


def upsert_category_stats_from_sql(*, since: datetime) -> None:
    """Persist ``compute_category_stats_payloads`` into ``CategoryStats`` rows."""
    from apps.buying.models import CategoryStats

    payloads = compute_category_stats_payloads(since=since)
    for name, d in payloads.items():
        CategoryStats.objects.filter(category=name).update(
            sell_through_rate=d['sell_through_rate'],
            have_retail=d['have_retail'],
            have_units=d['have_units'],
            want_retail=d['want_retail'],
            want_units=d['want_units'],
            need_retail=d['need_retail'],
            need_units=d['need_units'],
            sell_through_numerator=d['sell_through_numerator'],
            sell_through_denominator=d['sell_through_denominator'],
            avg_sold_price=d['avg_sold_price'],
            avg_retail=d['avg_retail'],
            avg_cost=d['avg_cost'],
            need_score_1to99=d['need_score_1to99'],
        )
