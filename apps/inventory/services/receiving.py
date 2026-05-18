"""Receiving draft persistence and completion validation."""

from __future__ import annotations

from collections import defaultdict

from django.utils import timezone

from apps.inventory.models import PurchaseOrder, Receiving, ReceivingPallet


REQUIRED_PALLET_SIDES = ('front', 'right', 'back', 'left')


def get_or_create_receiving(order: PurchaseOrder, user) -> Receiving:
    rec, created = Receiving.objects.get_or_create(
        purchase_order=order,
        defaults={'created_by': user},
    )
    now = timezone.localtime()
    today = timezone.localdate()
    update_fields = []
    if created:
        rec.received_date = today
        update_fields.append('received_date')
        rec.start_time = now.time().replace(microsecond=0)
        update_fields.append('start_time')
    elif not rec.start_time:
        rec.start_time = now.time().replace(microsecond=0)
        update_fields.append('start_time')
    if update_fields:
        rec.save(update_fields=list(set(update_fields)))
    touch_receiving_track_active(order)
    return rec


def touch_receiving_track_active(order: PurchaseOrder) -> None:
    """First touch promotes PO receiving train from not_started → active (+ started_at)."""

    if order.receiving_status == 'done':
        return
    now = timezone.now()
    updates: dict = {}
    if order.receiving_status == 'not_started':
        updates['receiving_status'] = 'active'
    if order.receiving_started_at is None:
        updates['receiving_started_at'] = now
    if updates:
        PurchaseOrder.objects.filter(pk=order.pk).update(**updates)
        for k, v in updates.items():
            setattr(order, k, v)


def _bump(rec: Receiving):
    """Increment draft_version after client-visible draft changes."""
    Receiving.objects.filter(pk=rec.pk).update(
        draft_version=(rec.draft_version or 0) + 1,
        updated_at=timezone.now(),
    )
    rec.refresh_from_db(fields=['draft_version', 'updated_at'])


def patch_receiving_draft(rec: Receiving, data: dict, _user=None) -> Receiving:
    """Last-write-wins merge of PATCH body (draft only)."""
    if rec.completed_at is not None:
        raise ValueError('receiving_already_complete')

    scalar = (
        'received_date',
        'start_time',
        'end_time',
        'condition',
        'issues',
        'received_pallet_count',
    )

    touched = []
    for key in scalar:
        if key in data:
            setattr(rec, key, data[key])
            touched.append(key)

    if touched:
        rec.save(update_fields=list(set(touched + ['updated_at'])))

    if 'pallets' in data and data['pallets'] is not None:
        _sync_pallets(rec, data['pallets'], data.get('received_pallet_count'))
    elif 'received_pallet_count' in data:
        _ensure_pallet_rows_for_count(rec, rec.received_pallet_count)

    _bump(rec)
    touch_receiving_track_active(rec.purchase_order)
    return rec


def _sync_pallets(rec: Receiving, pallets: list, pallet_count_hint):
    normalized = []
    for row in pallets:
        normalized.append({
            'pallet_number': int(row['pallet_number']),
            'damaged': bool(row.get('damaged', False)),
        })
    max_num = max((p['pallet_number'] for p in normalized), default=0)
    if pallet_count_hint is not None:
        count = max(0, min(99, int(pallet_count_hint)))
    else:
        count = max_num
    count = max(0, min(99, max(count, max_num)))
    rec.received_pallet_count = count
    rec.save(update_fields=['received_pallet_count', 'updated_at'])

    ReceivingPallet.objects.filter(receiving=rec).delete()
    damaged_by_num = {p['pallet_number']: p['damaged'] for p in normalized}
    for n in range(1, count + 1):
        ReceivingPallet.objects.create(
            receiving=rec,
            pallet_number=n,
            damaged=damaged_by_num.get(n, False),
        )


def _ensure_pallet_rows_for_count(rec: Receiving, count: int):
    count = max(0, min(99, int(count or 0)))
    rec.received_pallet_count = count
    rec.save(update_fields=['received_pallet_count', 'updated_at'])

    existing = {p.pallet_number: p for p in rec.pallets.all()}
    for n in range(1, count + 1):
        if n not in existing:
            ReceivingPallet.objects.create(receiving=rec, pallet_number=n, damaged=False)
    for num, row in list(existing.items()):
        if num > count:
            row.delete()


def validate_complete(rec: Receiving) -> list[str]:
    """Return blocking reasons for complete (empty = ok)."""
    reasons = []
    if rec.received_pallet_count < 1:
        reasons.append('Set at least one pallet before completing.')
    if not (rec.condition or '').strip():
        reasons.append('Select load condition (good / mixed / damaged).')

    sides_by_pallet: dict[int, set[str]] = defaultdict(set)
    for att in rec.attachments.all():
        if att.kind != 'pallet_side' or att.pallet_number is None:
            continue
        if att.side in REQUIRED_PALLET_SIDES:
            sides_by_pallet[att.pallet_number].add(att.side)

    for n in range(1, rec.received_pallet_count + 1):
        have = sides_by_pallet.get(n, set())
        for side in REQUIRED_PALLET_SIDES:
            if side not in have:
                reasons.append(f'Pallet {n} missing {side} photo.')
    return reasons
