"""Receiving draft persistence and completion validation."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import (
    PurchaseOrder,
    Receiving,
    ReceivingAttachment,
    ReceivingPallet,
    ReceivingPhotoOverride,
)


REQUIRED_PALLET_SIDES = ('front', 'right', 'back', 'left')


@dataclass(frozen=True)
class MissingPhotoSlot:
    kind: str
    pallet_number: int | None = None
    side: str = ''

    @property
    def key(self) -> str:
        if self.kind == 'pallet_side':
            return f'pallet_side:{self.pallet_number}:{self.side}'
        return self.kind

    @property
    def label(self) -> str:
        if self.kind == 'bol':
            return 'BOL photo'
        if self.kind == 'truck':
            return 'Truck photo'
        return f'Pallet {self.pallet_number} {self.side} photo'

    def as_dict(self) -> dict[str, Any]:
        return {
            'kind': self.kind,
            'pallet_number': self.pallet_number,
            'side': self.side or '',
            'key': self.key,
            'label': self.label,
        }


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


def list_missing_photo_slots(rec: Receiving) -> list[MissingPhotoSlot]:
    """Authoritative required photo slots that still lack an attachment."""
    kinds = {a.kind for a in rec.attachments.all()}
    missing: list[MissingPhotoSlot] = []
    if 'bol' not in kinds:
        missing.append(MissingPhotoSlot(kind='bol'))
    if 'truck' not in kinds:
        missing.append(MissingPhotoSlot(kind='truck'))

    sides_by_pallet: dict[int, set[str]] = defaultdict(set)
    for att in rec.attachments.all():
        if att.kind != 'pallet_side' or att.pallet_number is None:
            continue
        if att.side in REQUIRED_PALLET_SIDES:
            sides_by_pallet[att.pallet_number].add(att.side)

    for n in range(1, (rec.received_pallet_count or 0) + 1):
        have = sides_by_pallet.get(n, set())
        for side in REQUIRED_PALLET_SIDES:
            if side not in have:
                missing.append(MissingPhotoSlot(kind='pallet_side', pallet_number=n, side=side))
    return missing


def validate_complete(rec: Receiving, *, allow_photo_overrides: bool = False) -> list[str]:
    """Return blocking reasons for complete (empty = ok).

    Photo gaps are blocking unless the caller will supply per-slot overrides
    (``allow_photo_overrides=True``); non-photo gates always block.
    """
    reasons = []
    if rec.received_pallet_count < 1:
        reasons.append('Set at least one pallet before completing.')
    if not (rec.condition or '').strip():
        reasons.append('Select load condition (good / mixed / damaged).')

    if not allow_photo_overrides:
        for slot in list_missing_photo_slots(rec):
            reasons.append(f'Missing {slot.label}.')
    return reasons


def _normalize_override_row(row: dict) -> tuple[str, MissingPhotoSlot | None, str]:
    """Return (error_message, slot, reason). error_message empty when ok."""
    if not isinstance(row, dict):
        return ('Each photo override must be an object.', None, '')
    kind = str(row.get('kind') or '').strip().lower()
    reason = str(row.get('reason') or '').strip()
    if kind not in ('bol', 'truck', 'pallet_side'):
        return ('photo_overrides.kind must be bol, truck, or pallet_side.', None, '')
    if not reason:
        return ('Each missing photo requires a non-blank reason.', None, '')
    if kind in ('bol', 'truck'):
        return ('', MissingPhotoSlot(kind=kind), reason)
    try:
        pallet_number = int(row.get('pallet_number'))
    except (TypeError, ValueError):
        return ('pallet_number is required for pallet_side overrides.', None, '')
    side = str(row.get('side') or '').strip().lower()
    if side not in REQUIRED_PALLET_SIDES:
        return ('side must be one of front, right, back, left.', None, '')
    if pallet_number < 1 or pallet_number > 99:
        return ('pallet_number must be between 1 and 99.', None, '')
    return (
        '',
        MissingPhotoSlot(kind='pallet_side', pallet_number=pallet_number, side=side),
        reason,
    )


def apply_photo_overrides(
    rec: Receiving,
    overrides: list[dict] | None,
    user,
) -> list[str]:
    """Validate and persist per-slot photo overrides for currently missing slots.

    Returns a list of error strings (empty = success). On success, creates
    ``ReceivingPhotoOverride`` rows inside the caller's transaction.
    """
    missing = list_missing_photo_slots(rec)
    missing_by_key = {s.key: s for s in missing}
    if not missing:
        if overrides:
            return ['No photos are missing; photo_overrides must be empty.']
        return []

    if not overrides:
        return [
            f'Missing {s.label}. Provide a reason for each missing photo.'
            for s in missing
        ]

    seen: dict[str, str] = {}
    for row in overrides:
        err, slot, reason = _normalize_override_row(row)
        if err:
            return [err]
        assert slot is not None
        if slot.key not in missing_by_key:
            return [f'Override for {slot.label} is not needed (photo exists or slot invalid).']
        if slot.key in seen:
            return [f'Duplicate override for {slot.label}.']
        seen[slot.key] = reason

    for slot in missing:
        if slot.key not in seen:
            return [f'Missing reason for {slot.label}.']

    ReceivingPhotoOverride.objects.filter(receiving=rec).delete()
    for slot in missing:
        ReceivingPhotoOverride.objects.create(
            receiving=rec,
            kind=slot.kind,
            pallet_number=slot.pallet_number,
            side=slot.side or '',
            reason=seen[slot.key],
            overridden_by=user,
        )
    return []


def serialize_photo_override(ov: ReceivingPhotoOverride) -> dict[str, Any]:
    slot = MissingPhotoSlot(
        kind=ov.kind,
        pallet_number=ov.pallet_number,
        side=ov.side or '',
    )
    return {
        'id': ov.id,
        'kind': ov.kind,
        'pallet_number': ov.pallet_number,
        'side': ov.side or '',
        'key': slot.key,
        'label': slot.label,
        'reason': ov.reason,
        'overridden_by': ov.overridden_by_id,
        'overridden_by_name': (
            (ov.overridden_by.get_full_name() or ov.overridden_by.email)
            if ov.overridden_by_id and ov.overridden_by
            else None
        ),
        'created_at': ov.created_at,
    }
