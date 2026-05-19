"""On-demand processing stats for a PO (one GROUP BY on items + one batch_groups aggregate)."""

from __future__ import annotations

from django.db.models import Count, Q

from apps.inventory.models import BatchGroup, Item

_ITEM_STATUSES = (
    'intake',
    'processing',
    'on_shelf',
    'sold',
    'returned',
    'scrapped',
    'lost',
)


def compute_processing_stats(purchase_order_id: int) -> dict:
    status_counts = {s: 0 for s in _ITEM_STATUSES}
    for row in (
        Item.objects.filter(purchase_order_id=purchase_order_id)
        .values('status')
        .annotate(c=Count('id'))
    ):
        st = row['status']
        if st in status_counts:
            status_counts[st] = row['c']

    batch_agg = BatchGroup.objects.filter(purchase_order_id=purchase_order_id).aggregate(
        batch_groups_total=Count('id'),
        batch_groups_pending=Count('id', filter=~Q(status='complete')),
    )
    pending = status_counts['intake'] + status_counts['processing']
    return {
        'item_status_counts': status_counts,
        'pending_items': pending,
        'batch_groups_pending': batch_agg['batch_groups_pending'] or 0,
        'batch_groups_total': batch_agg['batch_groups_total'] or 0,
    }
