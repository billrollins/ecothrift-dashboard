"""Authoritative Cost / Retail / Priced / Sold / Profit aggregates for purchase orders.

Definitions (Orders dashboard):
- Cost: PurchaseOrder.total_cost (purchase + shipping + fees)
- Retail: PurchaseOrder.retail_value (vendor listing estimate)
- Priced: sum of Item.price for items that ever reached shelf
- Sold: net item revenue from completed POS carts after discounts
- Profit: Sold - Cost
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Iterable

from django.db.models import Count, Exists, OuterRef, Q, Sum
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, PurchaseOrder
from apps.pos.models import CartLine

ZERO = Decimal('0.00')
MAX_SELECTED_IDS = 200
SOLD_LAST_WEEK_DAYS = 7


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


def financials_for_orders(po_ids: Iterable[int]) -> dict[int, dict[str, Decimal]]:
    """Per-order financial dict with cost/retail/priced/sold/sold_last_week/profit."""
    ids = list(po_ids)
    if not ids:
        return {}

    cost_retail = {
        int(row['id']): {
            'cost': _q2(row['total_cost']),
            'retail': _q2(row['retail_value']),
        }
        for row in PurchaseOrder.objects.filter(pk__in=ids).values('id', 'total_cost', 'retail_value')
    }
    priced_map = priced_by_po(ids)
    sold = sold_by_po(ids)
    week_since = timezone.now() - timedelta(days=SOLD_LAST_WEEK_DAYS)
    sold_week = sold_by_po(ids, since=week_since)

    out: dict[int, dict[str, Decimal]] = {}
    for pk in ids:
        base = cost_retail.get(pk, {'cost': ZERO, 'retail': ZERO})
        s = sold.get(pk, ZERO)
        c = base['cost']
        priced_row = priced_map.get(pk, {'priced': ZERO, 'priced_retail': ZERO})
        out[pk] = {
            'cost': c,
            'retail': base['retail'],
            'priced': priced_row['priced'],
            'priced_retail': priced_row['priced_retail'],
            'sold': s,
            'sold_last_week': sold_week.get(pk, ZERO),
            'profit': _q2(s - c),
        }
    return out


def aggregate_financials(po_qs) -> dict:
    """Aggregate Cost/Retail/Priced/Sold/Profit across a PurchaseOrder queryset."""
    ids = list(po_qs.values_list('id', flat=True))
    agg = po_qs.aggregate(
        n=Count('pk'),
        tc=Sum('total_cost'),
        rv=Sum('retail_value'),
        ic=Sum('item_count'),
    )
    total_orders = agg['n'] or 0
    cost = _q2(agg['tc'])
    retail = _q2(agg['rv'])
    items_received = agg['ic'] if agg['ic'] is not None else 0

    if not ids:
        return {
            'total_orders': 0,
            'total_cost': str(ZERO),
            'retail_value': str(ZERO),
            'priced': str(ZERO),
            'sold': str(ZERO),
            'profit': str(ZERO),
            'items_received': 0,
            'delivered_count': 0,
            'margin_percent': None,
            'cost': str(ZERO),
            'retail': str(ZERO),
        }

    fin = financials_for_orders(ids)
    priced_total = _q2(sum((v['priced'] for v in fin.values()), ZERO))
    priced_retail_total = _q2(sum((v['priced_retail'] for v in fin.values()), ZERO))
    sold_total = _q2(sum((v['sold'] for v in fin.values()), ZERO))
    profit_total = _q2(sold_total - cost)
    delivered_count = po_qs.filter(status='delivered').count()
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
        'priced_retail': str(priced_retail_total),
        'sold': str(sold_total),
        'profit': str(profit_total),
        'items_received': items_received,
        'delivered_count': delivered_count,
        'margin_percent': margin_percent,
    }


def serialize_order_metrics(po_ids: Iterable[int]) -> dict[str, dict[str, str]]:
    """Stringified metrics keyed by order id (API payload)."""
    fin = financials_for_orders(po_ids)
    return {
        str(pk): {
            'cost': str(v['cost']),
            'retail': str(v['retail']),
            'priced': str(v['priced']),
            'priced_retail': str(v['priced_retail']),
            'sold': str(v['sold']),
            'sold_last_week': str(v['sold_last_week']),
            'profit': str(v['profit']),
        }
        for pk, v in fin.items()
    }
