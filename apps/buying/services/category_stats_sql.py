"""Raw SQL aggregates for ``CategoryStats`` (daily job). Uses ``taxonomy_bucket_case_sql``."""

from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import connections

from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES


def _case() -> str:
    return taxonomy_bucket_case_sql()


def _have_rows(*, using: str = 'default') -> list[tuple[str, int, Decimal]]:
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
    with connections[using].cursor() as cursor:
        cursor.execute(sql)
        for bucket, units, retail in cursor.fetchall():
            out.append((bucket, int(units or 0), Decimal(str(retail or 0))))
    return out


def _want_rows(since: datetime, *, using: str = 'default') -> list[tuple[str, int, Decimal]]:
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
    with connections[using].cursor() as cursor:
        cursor.execute(sql, [since])
        for bucket, units, retail in cursor.fetchall():
            out.append((bucket, int(units or 0), Decimal(str(retail or 0))))
    return out


def _profitability_aggregates(*, using: str = 'default') -> list[tuple[str, Decimal, Decimal, Decimal, int]]:
    """
    Per bucket: SUM(sold_for), SUM(retail_value), SUM(cost), COUNT(*) for all-time sold rows.

    Qualifying sold: status sold; sold_for, retail_value, and cost each between 0.01 and 9999.
    Recovery rate in Python: sum_sold / sum_retail. Averages: sum / count.
    """
    case = _case()
    sql = f"""
        SELECT b.bucket,
               COALESCE(SUM(b.sold_amt), 0)::numeric,
               COALESCE(SUM(b.retail_amt), 0)::numeric,
               COALESCE(SUM(b.cost_amt), 0)::numeric,
               COUNT(*)::int
        FROM (
            SELECT
                ({case}) AS bucket,
                i.sold_for::numeric AS sold_amt,
                i.retail_value::numeric AS retail_amt,
                i.cost::numeric AS cost_amt
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            WHERE i.status = 'sold'
              AND i.sold_for BETWEEN 0.01 AND 9999
              AND i.retail_value BETWEEN 0.01 AND 9999
              AND i.cost BETWEEN 0.01 AND 9999
        ) b
        GROUP BY b.bucket
    """
    out: list[tuple[str, Decimal, Decimal, Decimal, int]] = []
    with connections[using].cursor() as cursor:
        cursor.execute(sql)
        for bucket, sold_sum, retail_sum, cost_sum, n in cursor.fetchall():
            out.append(
                (
                    bucket,
                    Decimal(str(sold_sum or 0)),
                    Decimal(str(retail_sum or 0)),
                    Decimal(str(cost_sum or 0)),
                    int(n or 0),
                )
            )
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


def compute_category_stats_payloads(*, since: datetime, using: str = 'default') -> dict[str, dict[str, Any]]:
    """
    Merge raw aggregates into per-canonical-category dicts ready for CategoryStats upsert.

    Keys are exactly ``TAXONOMY_V1_CATEGORY_NAMES``; missing buckets get zeros.
    """
    have_map = {name: (0, Decimal('0')) for name in TAXONOMY_V1_CATEGORY_NAMES}
    for bucket, u, r in _have_rows(using=using):
        if bucket in have_map:
            have_map[bucket] = (u, r)

    want_map = {name: (0, Decimal('0')) for name in TAXONOMY_V1_CATEGORY_NAMES}
    for bucket, u, r in _want_rows(since, using=using):
        if bucket in want_map:
            want_map[bucket] = (u, r)

    profit_map: dict[str, dict[str, Any]] = {}
    q = Decimal('0.01')
    for bucket, sold_d, retail_d, cost_d, n in _profitability_aggregates(using=using):
        if bucket not in TAXONOMY_V1_CATEGORY_NAMES:
            continue
        rate = (sold_d / retail_d) if retail_d > 0 else Decimal('0')
        profit_map[bucket] = {
            'rate': rate.quantize(Decimal('0.000001')),
            'sold_amount': sold_d.quantize(q),
            'retail_amount': retail_d.quantize(q) if retail_d > 0 else None,
            'cost_amount': cost_d.quantize(q),
            'sample_size': n,
            'avg_sold_price': (sold_d / Decimal(n)).quantize(q) if n else None,
            'avg_retail': (retail_d / Decimal(n)).quantize(q) if n else None,
            'avg_cost': (cost_d / Decimal(n)).quantize(q) if n else None,
        }

    out: dict[str, dict[str, Any]] = {}
    for name in TAXONOMY_V1_CATEGORY_NAMES:
        hu, hr = have_map[name]
        wu, wr = want_map[name]
        st = profit_map.get(name)
        rate = st['rate'] if st else Decimal('0')
        need_r = (wr - hr).quantize(Decimal('0.01'))
        need_u = wu - hu
        if st:
            a_sale, a_ret, a_cost = st['avg_sold_price'], st['avg_retail'], st['avg_cost']
        else:
            a_sale, a_ret, a_cost = None, None, None
        out[name] = {
            'have_units': hu,
            'have_retail': hr.quantize(Decimal('0.01')),
            'want_units': wu,
            'want_retail': wr.quantize(Decimal('0.01')),
            'need_retail': need_r,
            'need_units': need_u,
            'recovery_rate': rate,
            'recovery_sold_amount': st['sold_amount'] if st else None,
            'recovery_retail_amount': st['retail_amount'] if st else None,
            'recovery_cost_amount': st['cost_amount'] if st else None,
            'good_data_sample_size': st['sample_size'] if st else 0,
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


def upsert_category_stats_from_sql(*, since: datetime, using: str = 'default') -> None:
    """Persist ``compute_category_stats_payloads`` into ``CategoryStats`` rows."""
    from apps.buying.models import CategoryStats

    payloads = compute_category_stats_payloads(since=since, using=using)
    for name, d in payloads.items():
        CategoryStats.objects.using(using).filter(category=name).update(
            recovery_rate=d['recovery_rate'],
            have_retail=d['have_retail'],
            have_units=d['have_units'],
            want_retail=d['want_retail'],
            want_units=d['want_units'],
            need_retail=d['need_retail'],
            need_units=d['need_units'],
            recovery_sold_amount=d['recovery_sold_amount'],
            recovery_retail_amount=d['recovery_retail_amount'],
            recovery_cost_amount=d['recovery_cost_amount'],
            good_data_sample_size=d['good_data_sample_size'],
            avg_sold_price=d['avg_sold_price'],
            avg_retail=d['avg_retail'],
            avg_cost=d['avg_cost'],
            need_score_1to99=d['need_score_1to99'],
        )
