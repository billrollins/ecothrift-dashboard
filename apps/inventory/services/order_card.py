"""
The Order window (Dash Updates #12): one purchase order as staff need to see it, in one call, like the Item card.

GET /api/inventory/orders/<id>/card/

What it cost and what it was worth (cost as a share of retail: Bill buys at about 20% landed), what has sold so far,
where its units are (checked in, on the shelf, sold, gone, disputed), its truck claim, and its journey from ordered
to closed. Counts and sums are one aggregate over its items, so a 2,000-unit truck costs the same as a small one.
"Sold" is status ``sold`` (the Item and Product windows' meaning). Read-only.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Q, Sum

from apps.inventory.models import BStockDispute, Dispute, Item, ManifestRow, PurchaseOrder


def _money(v) -> str | None:
    return str(Decimal(v).quantize(Decimal('0.01'))) if v is not None else None


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _pct(part, whole) -> float | None:
    if part is None or not whole:
        return None
    return round(float(Decimal(part) / Decimal(whole) * 100), 1)


def order_card(order_id: int) -> dict | None:
    po = PurchaseOrder.objects.select_related('vendor').filter(pk=order_id).first()
    if po is None:
        return None
    sold = Q(status='sold')
    stats = Item.objects.filter(purchase_order=po).aggregate(
        total=Count('id'),
        pending=Count('id', filter=Q(status__in=('intake', 'processing'))),
        on_shelf=Count('id', filter=Q(status='on_shelf')),
        sold=Count('id', filter=sold),
        returned=Count('id', filter=Q(status='returned')),
        gone=Count('id', filter=Q(status__in=('scrapped', 'lost'))),
        disputed=Count('id', filter=~Q(dispute_type='')),
        sold_for=Sum('sold_for', filter=sold),
        shelf_value=Sum('price', filter=Q(status='on_shelf')),
    )
    manifest = ManifestRow.objects.filter(purchase_order=po).aggregate(lines=Count('id'), units=Sum('quantity'))
    claim = BStockDispute.objects.filter(purchase_order=po).order_by('-created_at').first()
    disputes = list(Dispute.objects.filter(purchase_order=po).order_by('-id').values('kind', 'status', 'title')[:5])

    steps = [
        ('ordered', po.ordered_date), ('paid', po.paid_date), ('shipped', po.shipped_date),
        ('delivered', po.delivered_date), ('receiving_started', po.receiving_started_at),
        ('receiving_done', po.receiving_done_at), ('processing_started', po.processing_started_at),
        ('processing_done', po.processing_done_at), ('truck_finalized', po.truck_finalized_at),
        ('closed', po.closed_at),
    ]
    journey = [{'kind': k, 'at': _iso(v)} for k, v in steps if v]
    if claim and claim.filed_at:
        journey.append({'kind': 'claim_filed', 'at': _iso(claim.filed_at)})
    journey.sort(key=lambda e: e['at'] or '')

    vendor = po.vendor
    return {
        'id': po.pk,
        'order_number': po.order_number,
        'status': po.status,
        'status_label': po.get_status_display(),
        'vendor': {'id': vendor.pk, 'name': vendor.name} if vendor else None,
        'vendor_name': po.vendor_name_cache or (vendor.name if vendor else ''),
        'description': po.description,
        'condition': po.get_condition_display() if po.condition else '',
        'notes': po.notes,
        'ordered_date': po.ordered_date.isoformat() if po.ordered_date else None,
        'money': {
            'purchase': _money(po.purchase_cost), 'shipping': _money(po.shipping_cost), 'fees': _money(po.fees),
            'total': _money(po.total_cost), 'retail': _money(po.retail_value), 'est_shrink': _money(po.est_shrink),
            'sold_for': _money(stats['sold_for']), 'shelf_value': _money(stats['shelf_value']),
            'cost_pct_of_retail': _pct(po.total_cost, po.retail_value),
            'recovered_pct': _pct(stats['sold_for'] or 0, po.total_cost),
        },
        'units': {
            'manifest_lines': manifest['lines'] or 0, 'manifest_units': manifest['units'] or 0,
            'items': stats['total'], 'pending': stats['pending'], 'on_shelf': stats['on_shelf'], 'sold': stats['sold'],
            'returned': stats['returned'], 'gone': stats['gone'], 'disputed': stats['disputed'],
            'pallets': po.pallet_count,
        },
        'claim': {'status': claim.status, 'status_label': claim.get_status_display(),
                  'refund_expected': _money(claim.refund_expected), 'refund_received': _money(claim.refund_received)}
        if claim else None,
        'disputes': disputes,
        'journey': journey,
    }
