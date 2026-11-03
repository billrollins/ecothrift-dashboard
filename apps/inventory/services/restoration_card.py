"""
The Restoration job window (Dash Updates #14): one bench job as staff need to see it, in one call, like the Item card.

GET /api/inventory/restoration-jobs/<id>/card/

The job's own facts are the Item card's Restoration block (one source), plus what Processing asked for (needs, done
price, as-is prices, hold-out), the item it is (and whether it sold), and the job's history from its timeline. The
timeline's high-volume bookkeeping (each grade value re-saved, each action's text) is left out; the work done is the
actions list. Read-only.
"""
from __future__ import annotations

from apps.inventory.models import RestorationJob, RestorationTimelineEvent
from apps.inventory.services.item_card import _iso, _money, _restoration, _who

HISTORY_LIMIT = 40
# Timeline kinds the window words; the rest (values re-saved, action text, legacy snapshots) are bookkeeping.
HISTORY_TYPES = (
    'processing.checked_in', 'job.checked_in', 'job.moved_to_queue', 'job.reopened', 'grade.claimed', 'action.started',
    'work.performed', 'test.added', 'hold.placed', 'hold.resumed', 'note.added', 'note.queue_changed',
    'plan.estimated', 'plan.estimate_changed', 'parts.order_requested', 'parts.order_withdrawn',
    'condition.current_grade.set', 'disposition.completed',
)


def restoration_card(job_id: int) -> dict | None:
    job = (RestorationJob.objects.select_related('item_check_in', 'product', 'bench_owner', 'purchase_order')
           .filter(pk=job_id).first())
    if job is None:
        return None
    item = job.item_check_in.items.select_related('product').order_by('id').first() if job.item_check_in_id else None
    product = job.product or (item.product if item else None)
    po = job.purchase_order
    history = [
        {'type': e.event_type, 'at': _iso(e.occurred_at), 'who': _who(e.actor)}
        for e in (RestorationTimelineEvent.objects.filter(job=job, event_type__in=HISTORY_TYPES)
                  .select_related('actor').order_by('-occurred_at', '-id')[:HISTORY_LIMIT])
    ]
    card = _restoration(job, lite=False) or {}
    card.update({
        'id': job.pk,
        'quantity': job.quantity,
        'title': product.title if product else '',
        'brand': product.brand if product else '',
        'model': product.model if product else '',
        'product_id': product.pk if product else None,
        'photo_url': None,
        'item': {'id': item.pk, 'sku': item.sku, 'status': item.status, 'status_label': item.get_status_display(),
                 'price': _money(item.price), 'sold_for': _money(item.sold_for), 'sold_at': _iso(item.sold_at)}
        if item else None,
        'order': {'id': po.pk, 'order_number': po.order_number} if po else None,
        'check_in_id': job.item_check_in_id,
        'request': {
            'needs': list(job.requested_needs or []),
            'found_needs': list(job.found_needs or []),
            'done_price': _money(job.done_price),
            'as_is_prices': job.as_is_prices or {},
            'value_at_stake': _money(job.value_at_stake),
            'holdout': bool(job.holdout),
        },
        'pending_notes': job.pending_notes,
        'created_at': _iso(job.created_at),
        'history': history,
    })
    if product is not None:
        from apps.inventory.services.item_card import _url
        card['photo_url'] = _url(product.photo) or _url(product.photo_thumb)
    return card
