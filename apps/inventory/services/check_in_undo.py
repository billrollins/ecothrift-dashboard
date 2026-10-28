"""Undo check-in: move a whole check-in somewhere else, or delete it (owner, 2026-10-28).

Processing reaches this from Prior check-ins; the Restoration queue reaches it from an item's
history drawer. It reuses the check-in edit (move) and delete paths, and refuses while any item has
been worked on or sold. Every undo is logged in CheckInUndo.
"""

from __future__ import annotations

from typing import Any

from django.db import transaction

from apps.inventory.models import CheckInUndo, ItemCheckIn, PurchaseOrder, RestorationJob
from apps.inventory.services.processing_workspace import DISPATCH_VALUES

# Restoration needs estimates and a job, so it is never an undo target: Edit check-in sends there.
MOVE_DESTINATIONS = tuple(sorted(DISPATCH_VALUES - {'restoration'}))
UNWORKED_JOB_STAGES = (RestorationJob.STAGE_QUEUED, RestorationJob.STAGE_SENT)


def _check_in_for(order: PurchaseOrder, check_in_id: int, *, for_update: bool = False) -> ItemCheckIn:
    qs = ItemCheckIn.objects.filter(pk=check_in_id, purchase_order=order)
    if for_update:
        qs = qs.select_for_update()
    check_in = qs.first()
    if check_in is None:
        raise ValueError('Check-in not found for this order.')
    return check_in


def _skus(items) -> str:
    shown = [i.sku for i in items[:3]]
    more = len(items) - len(shown)
    return ', '.join(shown) + (f' and {more} more' if more > 0 else '')


def undo_blocks(check_in: ItemCheckIn, items: list, job: RestorationJob | None) -> list[str]:
    """Plain reasons the undo is refused. Empty means it is safe."""

    from apps.inventory.services.restoration import job_has_restoration_actions
    from apps.pos.models import CartLine

    blocks: list[str] = []
    sold = [i for i in items if i.status == 'sold' or i.sold_at]
    if sold:
        blocks.append(f'{len(sold)} sold ({_skus(sold)}).')
    gone = [i for i in items if i.status in ('lost', 'scrapped')]
    if gone:
        blocks.append(f'{len(gone)} marked lost or scrapped ({_skus(gone)}).')
    carted_ids = set(CartLine.objects.filter(item_id__in=[i.pk for i in items]).values_list('item_id', flat=True))
    carted = [i for i in items if i.pk in carted_ids]
    if carted:
        blocks.append(f'{len(carted)} in a register cart ({_skus(carted)}).')
    if job is not None:
        if job.stage not in UNWORKED_JOB_STAGES:
            blocks.append(f'Restoration has it ({job.get_stage_display()}).')
        elif job_has_restoration_actions(job):
            blocks.append('Restoration has logged work on it.')
    return blocks


def check_in_undo_preview(order: PurchaseOrder, check_in_id: int) -> dict[str, Any]:
    """What an undo would do, and what blocks it."""

    check_in = _check_in_for(order, check_in_id)
    items = list(check_in.items.order_by('id'))
    job = RestorationJob.objects.filter(item_check_in=check_in).first()
    snapshot = check_in.defaults_snapshot if isinstance(check_in.defaults_snapshot, dict) else {}
    where: dict[str, int] = {}
    for item in items:
        where[item.location or 'on_shelf'] = where.get(item.location or 'on_shelf', 0) + 1
    row = check_in.processing_row
    pending_now = pending_after_delete = None
    if row is not None:
        pending_now = max(0, int(row.quantity or 0) - int(row.qty_dispositioned or 0))
        done_after = max(0, int(row.qty_dispositioned or 0) - len(items))
        pending_after_delete = max(0, int(row.quantity or 0) - done_after)
    created_by = check_in.created_by
    return {
        'item_check_in_id': check_in.pk,
        'purchase_order_id': order.pk,
        'purchase_order_number': order.order_number,
        'product_id': check_in.product_id,
        'product_title': check_in.product.title if check_in.product_id and check_in.product else '',
        'quantity': len(items),
        'skus': [i.sku for i in items],
        'dispatch': str(snapshot.get('dispatch') or ''),
        'where': where,
        'created_at': check_in.created_at,
        'created_by': (created_by.full_name or created_by.email) if created_by else '',
        'processing_row_id': row.pk if row else None,
        'processing_row_number': row.row_number if row else None,
        'pending_now': pending_now,
        'pending_after_delete': pending_after_delete,
        'restoration_job': {'id': job.pk, 'stage': job.stage} if job else None,
        'destinations': list(MOVE_DESTINATIONS),
        'blocks': undo_blocks(check_in, items, job),
    }


def undo_check_in(user, order: PurchaseOrder, check_in_id: int, data: dict) -> dict[str, Any]:
    """``action`` move (with ``dispatch``) or delete. Raises ValueError when refused."""

    from apps.inventory.processing_ops import delete_item_check_in, update_item_check_in

    action = str(data.get('action') or '').strip()
    if action not in (CheckInUndo.ACTION_MOVE, CheckInUndo.ACTION_DELETE):
        raise ValueError('Choose move or delete.')
    dispatch = str(data.get('dispatch') or '').strip()
    with transaction.atomic():
        check_in = _check_in_for(order, check_in_id, for_update=True)
        items = list(check_in.items.select_for_update().order_by('id'))
        job = RestorationJob.objects.select_for_update().filter(item_check_in=check_in).first()
        blocks = undo_blocks(check_in, items, job)
        if blocks:
            raise ValueError('Undo is blocked: ' + ' '.join(blocks))
        snapshot = check_in.defaults_snapshot if isinstance(check_in.defaults_snapshot, dict) else {}
        from_dispatch = str(snapshot.get('dispatch') or '')
        log = CheckInUndo(
            action=action,
            item_check_in_id=check_in.pk,
            purchase_order=order,
            processing_row_id=check_in.processing_row_id,
            product_id=check_in.product_id,
            product_title=(check_in.product.title if check_in.product_id and check_in.product else '')[:300],
            quantity=len(items),
            skus=[i.sku for i in items],
            from_dispatch=from_dispatch,
            restoration_job_ids=[job.pk] if job else [],
            created_by=user,
        )
        if action == CheckInUndo.ACTION_MOVE:
            if dispatch not in MOVE_DESTINATIONS:
                raise ValueError('Choose where these go.')
            if dispatch == from_dispatch and all(i.location == dispatch for i in items):
                raise ValueError('They are already there.')
            if job is not None:
                # Sent jobs too: nobody has started them (blocks above), so they can go.
                job.delete()
            result = update_item_check_in(user, order, check_in.pk, {'dispatch': dispatch})
            log.to_dispatch = dispatch
        else:
            result = delete_item_check_in(user, order, check_in.pk)
        log.save()
    return {**result, 'undo': {'id': log.pk, 'action': log.action, 'quantity': log.quantity, 'to': log.to_dispatch}}
