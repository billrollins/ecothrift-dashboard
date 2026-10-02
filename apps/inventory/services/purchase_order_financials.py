"""Authoritative Cost / Retail / Priced / Sold / Profit numbers for purchase orders (the Orders page).

The owner's definitions (2026-10-02, `.ai/initiatives/intake_updates.md` Phase 1):

- **Cost:** total cost = price + fees + shipping. Second line: **recovery expected** = Priced (starting) / Cost.
- **Retail:** **total from the manifest** = sum of quantity x unit retail on the order's manifest rows, flagged when it
  is more than 2% off the listing retail (`retail_value`, the vendor's number, kept only to compare with). Second
  line: **retail processed** = the manifest retail of the items checked in from manifest rows (not disputed), and its
  share of the manifest total. Items not received, disputed, or not on the manifest are left out.
- **Priced:** **Priced (starting)** = the starting price of **every** item checked in from the order, extras
  included. Starting = the price at check-in: the old value of the first price change after check-in, else today's
  price (no later change). Second line: the processor-approved retail (`Item.retail`) of every checked-in item / the
  manifest total, which should land near 100%.
- **Sold:** net sold (completed register carts after discounts, plus old `sold_for`). Second line: **% sold** =
  Sold / Priced (starting), and **unsold left** = today's price of items still unsold (on the shelf, in processing,
  or returned), shrink (lost, scrapped) not counted.
- **Profit:** Sold - Cost.

Missing data is `None` (the page shows `-`) with a flag, never a made-up `0`.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Iterable

from django.db import connection
from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, PurchaseOrder
from apps.pos.models import CartLine

ZERO = Decimal('0.00')
MAX_SELECTED_IDS = 200
SOLD_LAST_WEEK_DAYS = 7
# Manifest total vs listing retail: more apart than this is flagged.
MISMATCH_SHARE = Decimal('0.02')
# A price change this soon after check-in is part of checking in (the check-in writes its own history line).
CHECK_IN_GRACE_SECONDS = 60


def _q2(value: Decimal | None) -> Decimal:
    if value is None:
        return ZERO
    return Decimal(str(value)).quantize(Decimal('0.01'))


def parse_id_list(raw: str | None, *, limit: int = MAX_SELECTED_IDS) -> list[int]:
    """Parse comma-separated ids; ignore invalid tokens; cap length."""
    if not raw:
        return []
    out: list[int] = []
    seen: set[int] = set()
    for part in str(raw).split(','):
        part = part.strip()
        if not part:
            continue
        try:
            pk = int(part)
        except (TypeError, ValueError):
            continue
        if pk in seen:
            continue
        seen.add(pk)
        out.append(pk)
        if len(out) >= limit:
            break
    return out


def shelf_eligible_item_ids(po_ids: Iterable[int]) -> set[int]:
    """Items that ever reached shelf for the given POs."""
    ids = list(po_ids)
    if not ids:
        return set()

    ever_shelf = ItemHistory.objects.filter(
        item_id=OuterRef('pk'),
        event_type='status_change',
        new_value='on_shelf',
    )
    qs = (
        Item.objects.filter(purchase_order_id__in=ids)
        .annotate(_ever_shelf=Exists(ever_shelf))
        .filter(
            Q(listed_at__isnull=False)
            | Q(status__in=('on_shelf', 'sold'))
            | Q(_ever_shelf=True)
        )
        .values_list('id', flat=True)
    )
    return set(qs)


def priced_by_po(po_ids: Iterable[int]) -> dict[int, dict[str, Decimal]]:
    """Shelf-eligible Item.price and Item.retail totals, grouped by PO.

    Returns ``{po_id: {'priced': …, 'priced_retail': …}}``.
    ``priced_retail`` is listing retail on those same items (manifest + extras).
    """
    ids = list(po_ids)
    if not ids:
        return {}
    eligible = shelf_eligible_item_ids(ids)
    out = {pk: {'priced': ZERO, 'priced_retail': ZERO} for pk in ids}
    if not eligible:
        return out

    rows = (
        Item.objects.filter(id__in=eligible, purchase_order_id__in=ids)
        .values('purchase_order_id')
        .annotate(priced_total=Sum('price'), retail_total=Sum('retail'))
    )
    for row in rows:
        out[int(row['purchase_order_id'])] = {
            'priced': _q2(row['priced_total']),
            'priced_retail': _q2(row['retail_total']),
        }
    return out


def sold_by_po(
    po_ids: Iterable[int],
    *,
    since: datetime | None = None,
) -> dict[int, Decimal]:
    """Net sold revenue per PO from completed carts (discounts allocated) + historical fallback.

    When ``since`` is set, only carts with ``completed_at >= since`` and fallback items with
    ``sold_at >= since`` are included (sold in the recent window).
    """
    ids = list(po_ids)
    if not ids:
        return {}
    out: dict[int, Decimal] = {pk: ZERO for pk in ids}

    item_po = dict(
        Item.objects.filter(purchase_order_id__in=ids).values_list('id', 'purchase_order_id')
    )
    if not item_po:
        return out

    item_ids = list(item_po.keys())
    cart_line_qs = CartLine.objects.filter(
        cart__status='completed',
        item_id__in=item_ids,
    ).exclude(line_kind=CartLine.LINE_KIND_DELIVERY)
    if since is not None:
        cart_line_qs = cart_line_qs.filter(cart__completed_at__gte=since)
    cart_ids = list(cart_line_qs.values_list('cart_id', flat=True).distinct())

    items_with_cart_revenue: set[int] = set()
    if cart_ids:
        all_lines = list(
            CartLine.objects.filter(cart_id__in=cart_ids)
            .exclude(line_kind=CartLine.LINE_KIND_DELIVERY)
            .only('id', 'cart_id', 'item_id', 'line_total', 'line_kind', 'meta')
        )
        by_cart: dict[int, list[CartLine]] = defaultdict(list)
        for ln in all_lines:
            by_cart[ln.cart_id].append(ln)

        for cart_lines in by_cart.values():
            positive = [ln for ln in cart_lines if ln.line_kind != CartLine.LINE_KIND_DISCOUNT]
            discounts = [ln for ln in cart_lines if ln.line_kind == CartLine.LINE_KIND_DISCOUNT]
            if not positive:
                continue

            net: dict[int, Decimal] = {
                ln.id: _q2(ln.line_total) for ln in positive
            }

            for disc in discounts:
                amount = abs(_q2(disc.line_total))
                if amount <= 0:
                    continue
                meta = disc.meta if isinstance(disc.meta, dict) else {}
                scope = meta.get('scope') or 'cart'
                target_id = meta.get('target_line_id')
                if scope == 'line' and target_id is not None:
                    try:
                        tid = int(target_id)
                    except (TypeError, ValueError):
                        tid = None
                    if tid is not None and tid in net:
                        net[tid] = max(ZERO, net[tid] - amount)
                        continue
                # Cart-wide: allocate proportionally across positive lines.
                gross_sum = sum(net.values(), ZERO)
                if gross_sum <= 0:
                    continue
                remaining = amount
                ordered = list(net.items())
                for i, (lid, val) in enumerate(ordered):
                    if i == len(ordered) - 1:
                        share = remaining
                    else:
                        share = (amount * val / gross_sum).quantize(Decimal('0.01'))
                        remaining -= share
                    net[lid] = max(ZERO, val - share)

            for ln in positive:
                if not ln.item_id or ln.item_id not in item_po:
                    continue
                po_id = int(item_po[ln.item_id])
                out[po_id] += net.get(ln.id, ZERO)
                items_with_cart_revenue.add(ln.item_id)

    # Historical fallback: sold items with sold_for and no completed cart line.
    fallback_qs = Item.objects.filter(
        purchase_order_id__in=ids,
        status='sold',
        sold_for__isnull=False,
    ).exclude(id__in=items_with_cart_revenue)
    if since is not None:
        fallback_qs = fallback_qs.filter(sold_at__gte=since)
    fallback = fallback_qs.values('purchase_order_id').annotate(total=Sum('sold_for'))
    for row in fallback:
        out[int(row['purchase_order_id'])] += _q2(row['total'])

    return {pk: _q2(v) for pk, v in out.items()}


def _ratio(part: Decimal | None, whole: Decimal | None) -> Decimal | None:
    """part / whole as a whole-number percent (None when either side is missing or the whole is 0)."""
    if part is None or whole is None or whole <= 0:
        return None
    return (Decimal(part) / Decimal(whole) * 100).quantize(Decimal('1'))


def manifest_by_po(po_ids: list[int]) -> dict[int, dict]:
    """Manifest total retail (quantity x unit retail) per order, and how many rows it has."""
    if not po_ids:
        return {}
    with connection.cursor() as cur:
        cur.execute(
            """
            SELECT purchase_order_id, COUNT(*), SUM(quantity * unit_retail), COUNT(unit_retail)
            FROM inventory_manifestrow
            WHERE purchase_order_id = ANY(%s)
            GROUP BY purchase_order_id
            """,
            [po_ids],
        )
        return {int(r[0]): {'rows': int(r[1]), 'total': _q2(r[2]) if r[3] else None} for r in cur.fetchall()}


def items_by_po(po_ids: list[int]) -> dict[int, dict]:
    """Per order, over every item checked in from it: starting price, approved retail, retail processed from the
    manifest (not disputed), unsold left, and how many items have any history (to flag old data).

    One grouped statement per call; the manifest is joined one row per item, never fanned out (the v2.115.1 rule).
    """
    if not po_ids:
        return {}
    with connection.cursor() as cur:
        cur.execute(
            f"""
            WITH first_change AS (
                SELECT DISTINCT ON (ih.item_id) ih.item_id, ih.old_value::numeric AS old_price
                FROM inventory_itemhistory ih
                JOIN inventory_item i2 ON i2.id = ih.item_id
                WHERE i2.purchase_order_id = ANY(%s)
                  AND ih.event_type = 'price_change'
                  AND ih.old_value ~ '^[0-9]+(\\.[0-9]+)?$'
                  AND (i2.checked_in_at IS NULL OR ih.created_at > i2.checked_in_at + interval '{CHECK_IN_GRACE_SECONDS} seconds')
                ORDER BY ih.item_id, ih.created_at, ih.id
            )
            SELECT
                i.purchase_order_id,
                COUNT(*) AS items,
                SUM(COALESCE(fc.old_price, i.price)) AS priced_start,
                SUM(i.retail) AS approved_retail,
                SUM(mr.unit_retail) FILTER (
                    WHERE i.manifest_row_id IS NOT NULL AND NOT EXISTS (
                        SELECT 1 FROM inventory_dispute d WHERE d.subject_item_id = i.id AND d.status <> 'cancelled'
                    )
                ) AS retail_processed,
                SUM(i.price) FILTER (WHERE i.status IN ('on_shelf', 'processing', 'returned')) AS unsold_left,
                COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM inventory_itemhistory h WHERE h.item_id = i.id)) AS with_history
            FROM inventory_item i
            LEFT JOIN first_change fc ON fc.item_id = i.id
            LEFT JOIN inventory_manifestrow mr ON mr.id = i.manifest_row_id
            WHERE i.purchase_order_id = ANY(%s)
              AND NOT (i.status = 'intake' AND i.checked_in_at IS NULL)
            GROUP BY i.purchase_order_id
            """,
            [po_ids, po_ids],
        )
        out = {}
        for po, items, start, approved, processed, unsold, with_history in cur.fetchall():
            out[int(po)] = {
                'items': int(items), 'priced_start': _q2(start), 'approved_retail': _q2(approved),
                'retail_processed': _q2(processed), 'unsold_left': _q2(unsold), 'with_history': int(with_history),
            }
        return out


def _numbers(cost: Decimal, listing: Decimal | None, manifest: dict | None, items: dict | None, sold: Decimal) -> dict:
    """The page's numbers for one order (or for a sum of orders: the same arithmetic on the sums)."""
    manifest_total = (manifest or {}).get('total')
    priced_start = (items or {}).get('priced_start')
    flags = []
    if not manifest or not manifest.get('rows'):
        flags.append('no_manifest')
    elif manifest_total is None:
        flags.append('manifest_without_retail')
    if not listing:
        flags.append('no_listing_retail')
    elif manifest_total is not None and abs(manifest_total - listing) > listing * MISMATCH_SHARE:
        flags.append('manifest_mismatch')
    if items and items['items'] and not items['with_history']:
        flags.append('no_price_history')
    return {
        'manifest_retail': manifest_total,
        'listing_retail': listing,
        'retail_processed': (items or {}).get('retail_processed') if manifest_total is not None else None,
        'retail_processed_pct': _ratio((items or {}).get('retail_processed'), manifest_total),
        'priced_start': priced_start,
        'approved_retail': (items or {}).get('approved_retail'),
        'approved_pct_of_manifest': _ratio((items or {}).get('approved_retail'), manifest_total),
        'unsold_left': (items or {}).get('unsold_left'),
        'sold_pct': _ratio(sold, priced_start),
        'recovery_expected': _ratio(priced_start, cost),
        'recovery_actual': _ratio(sold, cost),
        'items_checked_in': (items or {}).get('items', 0),
        'flags': flags,
    }


def financials_for_orders(po_ids: Iterable[int]) -> dict[int, dict]:
    """Per-order numbers: cost, the owner's Retail / Priced / Sold definitions, profit, and flags."""
    ids = list(po_ids)
    if not ids:
        return {}

    cost_retail = {
        int(row['id']): {
            'cost': _q2(row['total_cost']),
            'listing': _q2(row['retail_value']) if row['retail_value'] is not None else None,
        }
        for row in PurchaseOrder.objects.filter(pk__in=ids).values('id', 'total_cost', 'retail_value')
    }
    manifests = manifest_by_po(ids)
    items = items_by_po(ids)
    sold = sold_by_po(ids)

    out: dict[int, dict] = {}
    for pk in ids:
        base = cost_retail.get(pk, {'cost': ZERO, 'listing': None})
        s = sold.get(pk, ZERO)
        c = base['cost']
        numbers = _numbers(c, base['listing'], manifests.get(pk), items.get(pk), s)
        out[pk] = {
            'cost': c,
            # Kept for older readers: Retail = the manifest total when there is one, else the listing.
            'retail': numbers['manifest_retail'] if numbers['manifest_retail'] is not None else (base['listing'] or ZERO),
            'priced': numbers['priced_start'] or ZERO,
            'sold': s,
            'profit': _q2(s - c),
            **numbers,
        }
    return out


def _empty_aggregate() -> dict:
    return {
        'total_orders': 0,
        'total_cost': str(ZERO),
        'retail_value': str(ZERO),
        'priced': str(ZERO),
        'sold': str(ZERO),
        'profit': str(ZERO),
        'items_received': 0,
        'pallet_count': 0,
        'delivered_count': 0,
        'in_transit_count': 0,
        'in_transit_cost': str(ZERO),
        'margin_percent': None,
        'cost': str(ZERO),
        'retail': str(ZERO),
    }


def aggregate_financials(po_qs) -> dict:
    """Aggregate Cost/Retail/Priced/Sold/Profit (+ ops counts) across a PurchaseOrder queryset."""
    ids = list(po_qs.values_list('id', flat=True))
    agg = po_qs.aggregate(
        n=Count('pk'),
        tc=Sum('total_cost'),
        rv=Sum('retail_value'),
        ic=Sum('item_count'),
        pc=Sum('pallet_count'),
    )
    total_orders = agg['n'] or 0
    cost = _q2(agg['tc'])
    retail = _q2(agg['rv'])
    items_received = agg['ic'] if agg['ic'] is not None else 0
    pallet_count = int(agg['pc'] or 0)

    if not ids:
        return _empty_aggregate()

    fin = financials_for_orders(ids)
    priced_total = _q2(sum((v['priced'] for v in fin.values()), ZERO))
    sold_total = _q2(sum((v['sold'] for v in fin.values()), ZERO))
    profit_total = _q2(sold_total - cost)

    def total(key: str, only=None) -> Decimal | None:
        values = [v[key] for v in fin.values() if v[key] is not None and (only is None or only(v))]
        return _q2(sum(values, ZERO)) if values else None

    with_manifest = lambda v: v['manifest_retail'] is not None  # noqa: E731
    manifest_total = total('manifest_retail')
    # Percents of the manifest use only the orders that have one, so a missing manifest never drags them down.
    sums = {
        'manifest_retail': manifest_total,
        'retail_processed': total('retail_processed', with_manifest),
        'retail_processed_pct': _ratio(total('retail_processed', with_manifest), manifest_total),
        'priced_start': priced_total,
        'approved_retail': total('approved_retail'),
        'approved_pct_of_manifest': _ratio(total('approved_retail', with_manifest), manifest_total),
        'unsold_left': total('unsold_left'),
        'sold_pct': _ratio(sold_total, priced_total),
        'recovery_expected': _ratio(priced_total, cost),
        'recovery_actual': _ratio(sold_total, cost),
        'listing_retail': retail,
        'orders_flagged': {f: sum(1 for v in fin.values() if f in v['flags'])
                           for f in ('no_manifest', 'manifest_without_retail', 'manifest_mismatch', 'no_listing_retail', 'no_price_history')},
    }
    delivered_count = po_qs.filter(status='delivered').count()
    in_transit_agg = po_qs.filter(status='shipped').aggregate(
        n=Count('pk'),
        tc=Sum('total_cost'),
    )
    in_transit_count = in_transit_agg['n'] or 0
    in_transit_cost = _q2(in_transit_agg['tc'])
    margin_percent = None
    if retail > 0:
        margin_percent = float(((retail - cost) / retail * Decimal('100')).quantize(Decimal('0.01')))

    return {
        'total_orders': total_orders,
        'total_cost': str(cost),
        'retail_value': str(retail),
        'cost': str(cost),
        'retail': str(retail),
        'priced': str(priced_total),
        'sold': str(sold_total),
        'profit': str(profit_total),
        **{k: (str(v) if isinstance(v, Decimal) else v) for k, v in sums.items()},
        'items_received': items_received,
        'pallet_count': pallet_count,
        'delivered_count': delivered_count,
        'in_transit_count': in_transit_count,
        'in_transit_cost': str(in_transit_cost),
        'margin_percent': margin_percent,
    }


def serialize_order_metrics(po_ids: Iterable[int]) -> dict[str, dict]:
    """Stringified metrics keyed by order id (API payload)."""
    fin = financials_for_orders(po_ids)
    return {str(pk): {k: (str(x) if isinstance(x, Decimal) else x) for k, x in v.items()} for pk, v in fin.items()}
