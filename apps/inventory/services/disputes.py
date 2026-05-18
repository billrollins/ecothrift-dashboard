"""Create/update disputes and recompute PO dispute rollups."""

from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import Dispute, Item, PurchaseOrder


def _rollup_value_for_kind(order_id: int, kind: str) -> str:
    qs = Dispute.objects.filter(purchase_order_id=order_id, kind=kind)
    if not qs.exists():
        return 'none'
    if qs.filter(status=Dispute.STATUS_OPEN).exists():
        return 'active'
    return 'resolved'


@transaction.atomic
def recompute_dispute_rollups(order_id: int) -> None:
    intake = _rollup_value_for_kind(order_id, Dispute.KIND_INTAKE)
    proc = _rollup_value_for_kind(order_id, Dispute.KIND_PROCESSING)
    PurchaseOrder.objects.filter(pk=order_id).update(
        intake_dispute_status=intake,
        processing_dispute_status=proc,
    )


def list_disputes(
    order: PurchaseOrder,
    *,
    kind: str | None = None,
    status: str | None = None,
):
    qs = Dispute.objects.filter(purchase_order=order).order_by('-opened_at')
    if kind:
        qs = qs.filter(kind=kind)
    if status:
        qs = qs.filter(status=status)
    return qs


@transaction.atomic
def create_dispute(
    *,
    order: PurchaseOrder,
    kind: str,
    title: str,
    description: str = '',
    user=None,
    subject_receiving_id: int | None = None,
    subject_pallet_id: int | None = None,
    subject_manifest_row_id: int | None = None,
    subject_processing_row_id: int | None = None,
    subject_item_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> Dispute:
    d = Dispute.objects.create(
        purchase_order=order,
        kind=kind,
        status=Dispute.STATUS_OPEN,
        title=title[:300],
        description=description or '',
        opened_by=user if user and getattr(user, 'is_authenticated', False) else None,
        subject_receiving_id=subject_receiving_id,
        subject_pallet_id=subject_pallet_id,
        subject_manifest_row_id=subject_manifest_row_id,
        subject_processing_row_id=subject_processing_row_id,
        subject_item_id=subject_item_id,
        payload=dict(payload or {}),
    )
    recompute_dispute_rollups(order.id)
    return d


@transaction.atomic
def resolve_dispute(
    *,
    dispute: Dispute,
    user,
) -> Dispute:
    dispute.status = Dispute.STATUS_RESOLVED
    dispute.resolved_by = user if user and getattr(user, 'is_authenticated', False) else None
    dispute.resolved_at = timezone.now()
    dispute.save(update_fields=['status', 'resolved_by', 'resolved_at'])
    recompute_dispute_rollups(dispute.purchase_order_id)
    return dispute


@transaction.atomic
def cancel_dispute(
    *,
    dispute: Dispute,
    user,
) -> Dispute:
    dispute.status = Dispute.STATUS_CANCELLED
    dispute.resolved_by = user if user and getattr(user, 'is_authenticated', False) else None
    dispute.resolved_at = timezone.now()
    dispute.save(update_fields=['status', 'resolved_by', 'resolved_at'])
    recompute_dispute_rollups(dispute.purchase_order_id)
    return dispute


def record_processing_dispute_for_items(
    user,
    order: PurchaseOrder,
    target_items: list[Item],
    dtype: str,
    pct: int | None,
    desc: str,
) -> Dispute:
    """Persist a processing dispute after item state mutation (one row per API call)."""

    ids = [it.pk for it in target_items]
    title = f'Processing dispute ({dtype}) — {len(ids)} items'
    payload: dict[str, Any] = {
        'item_ids': ids,
        'dispute_type': dtype,
        'dispute_pct_loss': pct,
        'dispute_description': desc,
        'source': 'processing_dispute_endpoint',
    }
    with transaction.atomic():
        d = Dispute.objects.create(
            purchase_order=order,
            kind=Dispute.KIND_PROCESSING,
            status=Dispute.STATUS_OPEN,
            title=title[:300],
            description=str(desc or ''),
            opened_by=user if user and getattr(user, 'is_authenticated', False) else None,
            subject_item_id=target_items[0].pk if len(target_items) == 1 else None,
            payload=payload,
        )
        recompute_dispute_rollups(order.id)
    return d
