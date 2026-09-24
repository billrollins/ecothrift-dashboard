"""Raw SQL aggregates for ``CategoryStats`` (daily job). Uses ``taxonomy_bucket_case_sql``."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.db import connections
from django.utils import timezone

from apps.buying.services.buying_settings import (
    GOAL_TARGET_MULTIPLIER,
    get_category_goals,
    get_pipeline_max_age_days,
    get_target_cover_weeks,
)
from apps.buying.services.taxonomy_bucket_sql import taxonomy_bucket_case_sql
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_ADDED_2026_09, TAXONOMY_V1_CATEGORY_NAMES


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
                COALESCE(i.retail, i.price, 0)::numeric AS retail_line
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON i.manifest_row_id = mr.id
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
                COALESCE(i.retail, i.price, 0)::numeric AS retail_line
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON i.manifest_row_id = mr.id
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
    Per bucket: SUM(sold_for), SUM(retail), SUM(cost), COUNT(*) for all-time sold rows.

    Qualifying sold: status sold; sold_for, retail, and cost each between 0.01 and 9999.
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
                i.retail::numeric AS retail_amt,
                i.cost::numeric AS cost_amt
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON i.manifest_row_id = mr.id
            WHERE i.status = 'sold'
              AND i.sold_for BETWEEN 0.01 AND 9999
              AND i.retail BETWEEN 0.01 AND 9999
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


# Open POs whose lines are not items yet: bought, not processed.
OPEN_PO_STATUSES = ('ordered', 'paid', 'shipped', 'delivered', 'processing')
# Items we own that are not on the shelf yet.
IN_BUILDING_ITEM_STATUSES = ('intake', 'processing')


def _in_building_rows(*, using: str = 'default') -> list[tuple[str, int, Decimal]]:
    """(bucket, units, retail) for items in intake or processing."""
    case = _case()
    sql = f"""
        SELECT b.bucket, COUNT(*)::int, COALESCE(SUM(b.retail_line), 0)::numeric
        FROM (
            SELECT
                ({case}) AS bucket,
                COALESCE(i.retail, i.price, 0)::numeric AS retail_line
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON i.manifest_row_id = mr.id
            WHERE i.status IN %s
        ) b
        GROUP BY b.bucket
    """
    out: list[tuple[str, int, Decimal]] = []
    with connections[using].cursor() as cursor:
        cursor.execute(sql, [IN_BUILDING_ITEM_STATUSES])
        for bucket, units, retail in cursor.fetchall():
            out.append((bucket, int(units or 0), Decimal(str(retail or 0))))
    return out


def category_code_to_taxonomy(codes: set[str], *, using: str = 'default') -> dict[str, str]:
    """
    Taxonomy name for PO manifest category codes (B-Stock codes such as ``OFFICE_SUPPLIES``):
    a taxonomy name maps to itself; a code takes the canonical category most of the learned
    ``CategoryMapping`` rows for it agree on (``*-api-office-supplies*``: at least 2 rows and
    60%). Anything else is left out (the caller puts it in Mixed lots).
    """
    from collections import Counter

    from apps.buying.models import CategoryMapping

    from apps.inventory.canonical_categories import BSTOCK_CODE_TO_CANONICAL

    out: dict[str, str] = {}
    for code in codes:
        if code in TAXONOMY_V1_CATEGORY_NAMES:
            out[code] = code
            continue
        if code in BSTOCK_CODE_TO_CANONICAL:
            out[code] = BSTOCK_CODE_TO_CANONICAL[code]
            continue
        slug = code.strip().lower().replace('_', '-').replace(' ', '-')
        if not slug:
            continue
        votes = Counter(
            CategoryMapping.objects.using(using)
            .filter(source_key__contains=f'-api-{slug}')
            .values_list('canonical_category', flat=True)
        )
        if not votes:
            continue
        top, n = votes.most_common(1)[0]
        if top in TAXONOMY_V1_CATEGORY_NAMES and n >= 2 and n / sum(votes.values()) >= 0.6:
            out[code] = top
    return out


def _on_order_rows(*, using: str = 'default') -> list[tuple[str, int, Decimal]]:
    """
    (bucket, units, retail) for manifest lines on open POs that no item came from yet,
    ordered inside ``buying_pipeline_max_age_days`` (older open POs are done but never closed).
    Category: the preprocessing row's ``final_category`` (the AI cleanup's pick from the 19)
    when it is a taxonomy name; else the PO line's B-Stock code, mapped by
    :func:`category_code_to_taxonomy` (lines not preprocessed yet). Register PO-03.
    """
    since = timezone.localdate() - timedelta(days=get_pipeline_max_age_days(using=using))
    in_list = ', '.join("'" + n.replace("'", "''") + "'" for n in TAXONOMY_V1_CATEGORY_NAMES)
    sql = f"""
        SELECT COALESCE(
                   (SELECT MAX(TRIM(pr.final_category)) FROM inventory_preprocessingrow pr
                    WHERE pr.manifest_row_id = mr.id AND TRIM(pr.final_category) IN ({in_list})),
                   TRIM(COALESCE(mr.category, ''))
               ),
               COALESCE(SUM(GREATEST(COALESCE(mr.quantity, 1), 1)), 0)::int,
               COALESCE(SUM(GREATEST(COALESCE(mr.quantity, 1), 1) * COALESCE(mr.unit_retail, 0)), 0)::numeric
        FROM inventory_manifestrow mr
        JOIN inventory_purchaseorder po ON po.id = mr.purchase_order_id
        WHERE po.status IN %s
          AND po.ordered_date >= %s
          AND NOT EXISTS (SELECT 1 FROM inventory_item i WHERE i.manifest_row_id = mr.id)
        GROUP BY 1
    """
    with connections[using].cursor() as cursor:
        cursor.execute(sql, [OPEN_PO_STATUSES, since])
        raw = [(code or '', int(units or 0), Decimal(str(retail or 0))) for code, units, retail in cursor.fetchall()]
    names = category_code_to_taxonomy({code for code, _, _ in raw if code}, using=using)
    totals: dict[str, tuple[int, Decimal]] = {}
    for code, units, retail in raw:
        bucket = names.get(code, MIXED_LOTS_UNCATEGORIZED)
        u, r = totals.get(bucket, (0, Decimal('0')))
        totals[bucket] = (u + units, r + retail)
    return [(bucket, u, r) for bucket, (u, r) in totals.items()]


def _speed_rows(since: datetime, *, using: str = 'default') -> dict[str, tuple[int | None, Decimal | None]]:
    """
    Per bucket, for items sold since ``since`` that have a shelf date: median days from
    ``listed_at`` to ``sold_at``, and the % sold within 90 days. Only ``listed_at`` is
    trustworthy (runner R-004): ``created_at`` is often stamped after the sale by imports.
    """
    case = _case()
    sql = f"""
        SELECT b.bucket,
               percentile_cont(0.5) WITHIN GROUP (ORDER BY b.days),
               100.0 * AVG(CASE WHEN b.days <= 90 THEN 1 ELSE 0 END)
        FROM (
            SELECT
                ({case}) AS bucket,
                EXTRACT(EPOCH FROM (i.sold_at - i.listed_at)) / 86400.0 AS days
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON i.manifest_row_id = mr.id
            WHERE i.status = 'sold'
              AND i.sold_at >= %s
              AND i.listed_at IS NOT NULL
              AND i.listed_at <= i.sold_at
        ) b
        GROUP BY b.bucket
    """
    out: dict[str, tuple[int | None, Decimal | None]] = {}
    with connections[using].cursor() as cursor:
        cursor.execute(sql, [since])
        for bucket, median_days, within_90 in cursor.fetchall():
            out[bucket] = (
                int(round(float(median_days))) if median_days is not None else None,
                Decimal(str(within_90)).quantize(Decimal('0.1')) if within_90 is not None else None,
            )
    return out


SELL_THROUGH_MIN_ITEMS = 20


def _sell_through_rows(*, using: str = 'default') -> dict[str, Decimal]:
    """
    Per bucket: of items put on the shelf 30 to 180 days ago, the % that sold within 30 days.
    Unsold items count against it, so this is not flattered the way sold-only medians are
    (runner R-025: tools that sold took 23 days; tools still listed are 93 days old).
    Only ``listed_at`` is used (V3 era; V1/V2 have no list date). Buckets under
    ``SELL_THROUGH_MIN_ITEMS`` are left out.
    """
    case = _case()
    sql = f"""
        SELECT b.bucket, COUNT(*),
               100.0 * AVG(CASE WHEN b.sold_in_30 THEN 1 ELSE 0 END)
        FROM (
            SELECT
                ({case}) AS bucket,
                (i.status = 'sold' AND i.sold_at IS NOT NULL
                 AND i.sold_at <= i.listed_at + INTERVAL '30 days') AS sold_in_30
            FROM inventory_item i
            LEFT JOIN inventory_product p ON i.product_id = p.id
            LEFT JOIN inventory_manifestrow mr ON i.manifest_row_id = mr.id
            WHERE i.listed_at IS NOT NULL
              AND i.listed_at >= NOW() - INTERVAL '180 days'
              AND i.listed_at <= NOW() - INTERVAL '30 days'
              AND i.status <> 'scrapped'
        ) b
        GROUP BY b.bucket
    """
    out: dict[str, Decimal] = {}
    with connections[using].cursor() as cursor:
        cursor.execute(sql)
        for bucket, n, pct in cursor.fetchall():
            if n >= SELL_THROUGH_MIN_ITEMS and pct is not None:
                out[bucket] = Decimal(str(pct)).quantize(Decimal('0.1'))
    return out


def effective_target_weeks(
    supply_by: dict[str, int], weekly_by: dict[str, Decimal], *, using: str = 'default'
) -> Decimal:
    """
    The target weeks of cover: the Assumptions number, or when it is 0 (auto) the store's own
    cover, all supply / all weekly sales, so each category is compared with the store.
    """
    setting = get_target_cover_weeks(using=using)
    if setting > 0:
        return Decimal(setting)
    weekly = sum(weekly_by.values(), Decimal('0'))
    if weekly <= 0:
        return Decimal('8')
    return max(Decimal('1'), (Decimal(sum(supply_by.values())) / weekly).quantize(Decimal('0.1')))


def need_from_cover(
    *,
    supply_units: int,
    weekly_sales: Decimal,
    target_weeks: Decimal,
    goal: str = 'normal',
) -> tuple[int, Decimal | None, Decimal]:
    """
    Need v2 for one category: ``(need 1-99, cover weeks or None, target weeks)``.

    cover = (shelf + pipeline) / weekly sales; target = target weeks x the goal (more 1.5,
    less 0.5). need = 100 x (1 - cover / target / 2), so 50 is on target, 99 is empty, and
    twice the target or more is 1. A category that sold nothing is 1 when we hold stock and
    50 when we hold none (no signal either way). A ``stop`` goal is always 1.
    """
    target = (Decimal(target_weeks) * Decimal(str(GOAL_TARGET_MULTIPLIER.get(goal, 1.0)))).quantize(Decimal('0.1'))
    cover = None
    if weekly_sales > 0:
        cover = (Decimal(supply_units) / weekly_sales).quantize(Decimal('0.1'))
    if goal == 'stop':
        return 1, cover, target
    if cover is None:
        return (50 if supply_units <= 0 else 1), None, target
    ratio = cover / target if target > 0 else Decimal('99')
    need = int((Decimal('100') * (Decimal('1') - ratio / Decimal('2'))).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    return max(1, min(99, need)), cover, target


def compute_category_stats_payloads(*, since: datetime, using: str = 'default') -> dict[str, dict[str, Any]]:
    """
    Merge raw aggregates into per-canonical-category dicts ready for CategoryStats upsert.

    Keys are exactly ``TAXONOMY_V1_CATEGORY_NAMES``; missing buckets get zeros.
    ``need_score_1to99`` is Need v2 (:func:`need_from_cover`): weeks of cover of shelf +
    pipeline (in building + on order) against the target weeks and the manager's goal.
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

    in_building = {name: (0, Decimal('0')) for name in TAXONOMY_V1_CATEGORY_NAMES}
    for bucket, u, r in _in_building_rows(using=using):
        if bucket in in_building:
            in_building[bucket] = (u, r)
    on_order = {name: (0, Decimal('0')) for name in TAXONOMY_V1_CATEGORY_NAMES}
    for bucket, u, r in _on_order_rows(using=using):
        if bucket in on_order:
            on_order[bucket] = (u, r)
    speed = _speed_rows(since, using=using)
    sell_through = _sell_through_rows(using=using)

    window_days = max((timezone.now() - since).total_seconds() / 86400.0, 1.0)
    weeks = Decimal(str(window_days / 7.0))
    supply_by = {
        n: int(out[n]['have_units']) + in_building[n][0] + on_order[n][0] for n in TAXONOMY_V1_CATEGORY_NAMES
    }
    weekly_by = {
        n: (Decimal(int(out[n]['want_units'])) / weeks).quantize(Decimal('0.01')) for n in TAXONOMY_V1_CATEGORY_NAMES
    }
    target_weeks = effective_target_weeks(supply_by, weekly_by, using=using)
    goals = get_category_goals(using=using)
    for name in TAXONOMY_V1_CATEGORY_NAMES:
        d = out[name]
        bu, br = in_building[name]
        ou, orr = on_order[name]
        weekly = weekly_by[name]
        need, cover, target = need_from_cover(
            supply_units=int(d['have_units']) + bu + ou,
            weekly_sales=weekly,
            target_weeks=target_weeks,
            goal=goals.get(name, 'normal'),
        )
        if weekly <= 0 and name in TAXONOMY_ADDED_2026_09:
            need = 50  # new category: no sales history yet (ITM-12)
        median_days, within_90 = speed.get(name, (None, None))
        d.update(
            {
                'in_building_units': bu,
                'in_building_retail': br.quantize(Decimal('0.01')),
                'on_order_units': ou,
                'on_order_retail': orr.quantize(Decimal('0.01')),
                'weekly_sales_units': weekly,
                'cover_weeks': cover,
                'target_weeks': target,
                'median_days_to_sell': median_days,
                'sold_within_90_pct': within_90,
                'sell_through_30_pct': sell_through.get(name),
                'need_score_1to99': need,
            }
        )

    return out


def rescore_needs_from_stored(*, using: str = 'default') -> int:
    """
    Recompute Need v2 from the stored inputs (no SQL aggregates): after a goal or the target
    weeks change. Returns rows updated.
    """
    from apps.buying.models import CategoryStats

    rows = list(CategoryStats.objects.using(using).filter(category__in=TAXONOMY_V1_CATEGORY_NAMES))
    target_weeks = effective_target_weeks(
        {c.category: int(c.have_units) + int(c.in_building_units) + int(c.on_order_units) for c in rows},
        {c.category: c.weekly_sales_units or Decimal('0') for c in rows},
        using=using,
    )
    goals = get_category_goals(using=using)
    n = 0
    for c in rows:
        need, cover, target = need_from_cover(
            supply_units=int(c.have_units) + int(c.in_building_units) + int(c.on_order_units),
            weekly_sales=c.weekly_sales_units or Decimal('0'),
            target_weeks=target_weeks,
            goal=goals.get(c.category, 'normal'),
        )
        if (c.weekly_sales_units or Decimal('0')) <= 0 and c.category in TAXONOMY_ADDED_2026_09:
            need = 50  # new category: no sales history yet (ITM-12)
        CategoryStats.objects.using(using).filter(pk=c.pk).update(
            need_score_1to99=need, cover_weeks=cover, target_weeks=target
        )
        n += 1
    return n


def upsert_category_stats_from_sql(*, since: datetime, using: str = 'default') -> None:
    """Persist ``compute_category_stats_payloads`` into ``CategoryStats`` rows."""
    from apps.buying.models import CategoryStats

    payloads = compute_category_stats_payloads(since=since, using=using)
    now = timezone.now()
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
            in_building_units=d['in_building_units'],
            in_building_retail=d['in_building_retail'],
            on_order_units=d['on_order_units'],
            on_order_retail=d['on_order_retail'],
            weekly_sales_units=d['weekly_sales_units'],
            cover_weeks=d['cover_weeks'],
            target_weeks=d['target_weeks'],
            median_days_to_sell=d['median_days_to_sell'],
            sold_within_90_pct=d['sold_within_90_pct'],
            sell_through_30_pct=d['sell_through_30_pct'],
            computed_at=now,
        )
