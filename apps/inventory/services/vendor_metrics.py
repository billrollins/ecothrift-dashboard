"""How each vendor performs (intake_updates Phase 6). Rolls up the Orders page numbers (Phase 1) by vendor.

Every percent is weighted: the sum of the top over the sum of the bottom across the vendor's orders, never an average
of per-order percents. Percents of the manifest use only orders that have one. Missing data is ``None`` (shown as ``-``).
Old-era orders are counted and flagged (``orders_old_data``), not dropped.

The per-order numbers come from ``purchase_order_financials`` (the Orders page's own code), so a vendor's numbers are
the sum of its orders on that page. Extra grouped statements add disputes, days to sell and sold-item counts. The list
is cached for six hours per period (``warm_vendor_metrics`` refreshes it; the page shows when it was worked out).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.db import connection
from django.utils import timezone

from apps.inventory.models import PurchaseOrder
from apps.inventory.services.purchase_order_financials import ZERO, _q2, _ratio, financials_for_orders

PERIODS = {'90d': 90, '12m': 365, 'all': None}
DEFAULT_PERIOD = '12m'
CACHE_SECONDS = 6 * 3600  # all time takes ~6 s; the page shows when the numbers were worked out, with Refresh


def period_start(period: str):
    days = PERIODS.get(period, PERIODS[DEFAULT_PERIOD])
    return None if days is None else timezone.localdate() - timedelta(days=days)


def _orders(period: str, vendor_id: int | None = None):
    qs = PurchaseOrder.objects.all()
    start = period_start(period)
    if start is not None:
        qs = qs.filter(ordered_date__gte=start)
    if vendor_id is not None:
        qs = qs.filter(vendor_id=vendor_id)
    return qs


def _extras(po_ids: list[int]) -> dict[int, dict]:
    """Per order: sold items, their starting price, disputes, and disputed manifest retail."""
    if not po_ids:
        return {}
    out: dict[int, dict] = defaultdict(dict)
    with connection.cursor() as cur:
        cur.execute(
            """
            WITH first_change AS (
                SELECT DISTINCT ON (ih.item_id) ih.item_id, ih.old_value::numeric AS old_price
                FROM inventory_itemhistory ih
                JOIN inventory_item i2 ON i2.id = ih.item_id
                WHERE i2.purchase_order_id = ANY(%s) AND i2.status = 'sold'
                  AND ih.event_type = 'price_change'
                  AND ih.old_value ~ '^[0-9]+(\\.[0-9]+)?$'
                  AND (i2.checked_in_at IS NULL OR ih.created_at > i2.checked_in_at + interval '60 seconds')
                ORDER BY ih.item_id, ih.created_at, ih.id
            )
            SELECT i.purchase_order_id, COUNT(*), SUM(COALESCE(fc.old_price, i.price))
            FROM inventory_item i
            LEFT JOIN first_change fc ON fc.item_id = i.id
            WHERE i.purchase_order_id = ANY(%s) AND i.status = 'sold'
            GROUP BY i.purchase_order_id
            """,
            [po_ids, po_ids],
        )
        for po, n, start in cur.fetchall():
            out[int(po)].update(sold_items=int(n), sold_start=_q2(start))
        cur.execute(
            """
            SELECT d.purchase_order_id,
                   COUNT(*) FILTER (WHERE d.status <> 'cancelled'),
                   COUNT(*) FILTER (WHERE d.status = 'open'),
                   SUM(CASE
                         WHEN d.status = 'cancelled' THEN 0
                         WHEN d.subject_manifest_row_id IS NOT NULL THEN COALESCE(mr.quantity * mr.unit_retail, 0)
                         WHEN d.subject_item_id IS NOT NULL THEN COALESCE(imr.unit_retail, it.retail, 0)
                         ELSE 0 END)
            FROM inventory_dispute d
            LEFT JOIN inventory_manifestrow mr ON mr.id = d.subject_manifest_row_id
            LEFT JOIN inventory_item it ON it.id = d.subject_item_id
            LEFT JOIN inventory_manifestrow imr ON imr.id = it.manifest_row_id
            WHERE d.purchase_order_id = ANY(%s)
            GROUP BY d.purchase_order_id
            """,
            [po_ids],
        )
        for po, opened, still_open, retail in cur.fetchall():
            out[int(po)].update(disputes=int(opened), disputes_open=int(still_open), disputed_retail=_q2(retail))
    return out


def _days_to_sell(po_ids: list[int]) -> dict[int, float]:
    """Median days from check-in to sale, sold items only, per vendor."""
    if not po_ids:
        return {}
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT po.vendor_id,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.sold_at - i.checked_in_at)) / 86400.0)
            FROM inventory_item i
            JOIN inventory_purchaseorder po ON po.id = i.purchase_order_id
            WHERE i.purchase_order_id = ANY(%s) AND i.status = 'sold'
              AND i.sold_at IS NOT NULL AND i.checked_in_at IS NOT NULL AND i.sold_at >= i.checked_in_at
            GROUP BY po.vendor_id
            """,
            [po_ids],
        )
        return {int(v): round(float(d), 1) for v, d in cur.fetchall() if d is not None}


def _div(top: Decimal | None, bottom: Decimal | int | None) -> Decimal | None:
    if top is None or not bottom:
        return None
    return _q2(Decimal(top) / Decimal(bottom))


def _roll_up(orders: list[dict], fin: dict[int, dict], extras: dict[int, dict]) -> dict[str, Any]:
    """One vendor's metrics from its orders."""
    cost = sum((fin[o['id']]['cost'] for o in orders), ZERO)
    sold = sum((fin[o['id']]['sold'] for o in orders), ZERO)
    with_manifest = [fin[o['id']] for o in orders if fin[o['id']]['manifest_retail'] is not None]
    manifest = sum((f['manifest_retail'] for f in with_manifest), ZERO) if with_manifest else None
    manifest_cost = sum((f['cost'] for f in with_manifest), ZERO) if with_manifest else None
    checked = [fin[o['id']] for o in orders if fin[o['id']]['items_checked_in']]
    items = sum(f['items_checked_in'] for f in checked)
    priced = sum((f['priced_start'] or ZERO for f in checked), ZERO) if checked else None
    approved = sum((f['approved_retail'] or ZERO for f in checked), ZERO) if checked else None
    approved_m = sum((f['approved_retail'] or ZERO for f in with_manifest), ZERO) if with_manifest else None
    processed_m = sum((f['retail_processed'] or ZERO for f in with_manifest), ZERO) if with_manifest else None
    ex = [extras.get(o['id'], {}) for o in orders]
    sold_items = sum(e.get('sold_items', 0) for e in ex)
    sold_start = sum((e.get('sold_start', ZERO) for e in ex), ZERO)
    disputed_m = sum((extras.get(o['id'], {}).get('disputed_retail', ZERO) for o in orders
                      if fin[o['id']]['manifest_retail'] is not None), ZERO)
    has_sales = sold > 0 or sold_items > 0
    return {
        'orders': len(orders),
        'last_ordered': max((o['ordered_date'] for o in orders if o['ordered_date']), default=None),
        'spent': _q2(cost),
        'manifest_retail': manifest,
        'landed_pct': _ratio(manifest_cost, manifest),
        'priced_pct_of_retail': _ratio(priced, approved),
        'manifest_accuracy': _ratio(approved_m, manifest),
        'received_pct': _ratio(processed_m, manifest),
        'disputes': sum(e.get('disputes', 0) for e in ex),
        'disputes_open': sum(e.get('disputes_open', 0) for e in ex),
        'disputed_pct': _ratio(disputed_m, manifest) if manifest else None,
        'priced_start': priced,
        'recovery_expected': _ratio(priced, cost),
        'sold': _q2(sold) if has_sales else None,
        'recovery_actual': _ratio(sold, cost) if has_sales else None,
        'sold_pct': _ratio(sold, priced) if has_sales else None,
        'kept_of_start': _ratio(sold, sold_start) if sold_items else None,
        'items_checked_in': items,
        'items_sold': sold_items,
        'avg_cost': _div(cost, items),
        'avg_start': _div(priced, items),
        'avg_sold': _div(sold, sold_items) if sold_items else None,
        'profit': _q2(sold - cost) if has_sales else None,
        'orders_old_data': sum(1 for o in orders if 'no_price_history' in fin[o['id']]['flags']),
        'orders_no_manifest': sum(1 for o in orders if 'no_manifest' in fin[o['id']]['flags']),
    }


def compute(period: str = DEFAULT_PERIOD, vendor_id: int | None = None) -> dict[int, dict]:
    """``{vendor_id: metrics}`` for every vendor with orders in the period (or one vendor)."""
    rows = list(_orders(period, vendor_id).values('id', 'vendor_id', 'ordered_date'))
    ids = [r['id'] for r in rows]
    fin = financials_for_orders(ids)
    extras = _extras(ids)
    days = _days_to_sell(ids)
    by_vendor: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        by_vendor[r['vendor_id']].append(r)
    out = {}
    for vid, orders in by_vendor.items():
        m = _roll_up(orders, fin, extras)
        m['days_to_sell'] = days.get(vid)
        out[vid] = m
    return out


def _plain(m: dict) -> dict:
    return {k: (str(v) if isinstance(v, Decimal) else (v.isoformat() if hasattr(v, 'isoformat') else v)) for k, v in m.items()}


def all_vendors(period: str = DEFAULT_PERIOD, *, fresh: bool = False) -> dict[str, Any]:
    """The Vendors list payload, cached for six hours: ``{period, start, computed_at, vendors: {id: metrics}}``."""
    period = period if period in PERIODS else DEFAULT_PERIOD
    key = f'vendor_metrics:v1:{period}'
    if not fresh:
        hit = cache.get(key)
        if hit is not None:
            return hit
    start = period_start(period)
    payload = {
        'period': period,
        'start': start.isoformat() if start else None,
        'computed_at': timezone.now().isoformat(),
        'vendors': {str(vid): _plain(m) for vid, m in compute(period).items()},
    }
    cache.set(key, payload, CACHE_SECONDS)
    return payload


def one_vendor(vendor_id: int, period: str = DEFAULT_PERIOD) -> dict[str, Any]:
    period = period if period in PERIODS else DEFAULT_PERIOD
    start = period_start(period)
    m = compute(period, vendor_id).get(vendor_id)
    return {'period': period, 'start': start.isoformat() if start else None, 'metrics': _plain(m) if m else None}
