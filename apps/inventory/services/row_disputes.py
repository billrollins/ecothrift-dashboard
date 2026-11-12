"""Dispute a manifest row straight from the Processing queue (Dash Update #100, Bill 2026-11-11).

His words: "Dispute is unit/manifest ROW based. NOT Product or Item. ... This is for rows that do not come. It does
not make sense to create a product and check in just to dispute that it did not come. ALSO this should be something
that we see (and maybe even a quick action) from the queue page."

- A dispute is some units of one queue row, a reason, and a note (``ManifestRowDispute``). No product, item or
  check-in is made.
- Photos (Dash Update #101, Bill: "we need to take photos if it is anything other than missing"): every reason but
  "did not come" needs at least one, sent with the dispute (``ManifestRowDisputePhoto``, up to ``PHOTOS_MAX``). They
  go to the B-Stock dispute page beside their line and into its photos zip (``photos_by_line``).
- Its units count as handled on the row (``refresh_processing_rows_denorm`` adds them to ``qty_dispositioned``, so
  check-in offers only what is left) and the row reads "Disputed".
- The truck numbers read them (``truck_pallets.manifest_line_accounting``), one rule with item disputes:
  "did not come" = not received; "arrived broken" and "wrong item" = damaged; "missing parts" and "other" = partly
  damaged at their % lost. The header, Close the truck and the B-Stock dispute list all come from there.
- Undo keeps the record, marks it undone, and gives the units back to the row.
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.core.models import S3File
from apps.inventory.models import Item, ManifestRowDispute, ManifestRowDisputePhoto, ProcessingRow, PurchaseOrder

logger = logging.getLogger(__name__)

R = ManifestRowDispute
REASONS: dict[str, dict[str, Any]] = {
    R.REASON_DID_NOT_COME: {'label': 'Did not come', 'bucket': 'missing', 'partial': False, 'photos': False},
    R.REASON_BROKEN: {'label': 'Arrived broken', 'bucket': 'broken', 'partial': False, 'photos': True},
    R.REASON_WRONG_ITEM: {'label': 'Wrong item came', 'bucket': 'broken', 'partial': False, 'photos': True},
    R.REASON_MISSING_PARTS: {'label': 'Missing parts', 'bucket': 'partial', 'partial': True, 'photos': True},
    R.REASON_OTHER: {'label': 'Other problem', 'bucket': 'partial', 'partial': True, 'photos': True},
}
DEFAULT_PCT_LOST = 50      # a partial problem starts at half the value lost; the person sets it
NOTE_MAX = 2000
PHOTOS_MAX = 6             # B-Stock asks for 1-4 photos per pallet; a few more for one row's problem (guessed)
PHOTO_BYTES_MAX = 25 * 1024 * 1024


class RowDisputeError(ValueError):
    """Plain words for the person."""


def _user_name(user) -> str:
    if user is None:
        return ''
    full = f'{getattr(user, "first_name", "") or ""} {getattr(user, "last_name", "") or ""}'.strip()
    return full or getattr(user, 'email', '') or ''


def active(order: PurchaseOrder | int):
    oid = order.pk if isinstance(order, PurchaseOrder) else int(order)
    return ManifestRowDispute.objects.filter(purchase_order_id=oid, undone_at__isnull=True)


def disputed_units_by_processing_row(order: PurchaseOrder | int, row_ids: list[int] | None = None) -> dict[int, int]:
    """Active disputed units per queue row that count as handled on that row. A dispute about a checked-in item
    adds nothing here: the item already counts."""
    qs = active(order).filter(processing_row_id__isnull=False, item_id__isnull=True)
    if row_ids is not None:
        qs = qs.filter(processing_row_id__in=list(row_ids))
    out: dict[int, int] = defaultdict(int)
    for pr_id, units in qs.values_list('processing_row_id', 'units'):
        out[pr_id] += int(units or 0)
    return out


def disputed_rows(order: PurchaseOrder | int, row_ids: list[int] | None = None) -> set[int]:
    """Queue rows with any active dispute (units or a checked-in item): the row reads Disputed."""
    qs = active(order).filter(processing_row_id__isnull=False)
    if row_ids is not None:
        qs = qs.filter(processing_row_id__in=list(row_ids))
    return set(qs.values_list('processing_row_id', flat=True))


def items_with_row_disputes(order: PurchaseOrder | int) -> list[int]:
    """Items a row dispute names (active or undone): counted by row disputes only, never by their own marks."""
    oid = order.pk if isinstance(order, PurchaseOrder) else int(order)
    return list(
        ManifestRowDispute.objects.filter(purchase_order_id=oid, item_id__isnull=False)
        .values_list('item_id', flat=True).distinct()
    )


def accounting_by_manifest_row(order: PurchaseOrder | int) -> dict[int, dict[str, int]]:
    """Per manifest row, in queue (processing) units like item counts: missing, broken, partial units, the partial %
    summed over units (``partial_pct`` / 100 = units of value lost), and ``received``: the broken and partial units
    with no item (they came but were never checked in; a checked-in item is already counted as received)."""
    out: dict[int, dict[str, int]] = defaultdict(
        lambda: {'missing': 0, 'broken': 0, 'partial': 0, 'partial_pct': 0, 'received': 0},
    )
    for mr_id, reason, units, pct, item_id in active(order).values_list(
        'manifest_row_id', 'reason', 'units', 'pct_lost', 'item_id',
    ):
        info = REASONS.get(reason)
        if info is None:
            continue
        units = int(units or 0)
        bucket = out[mr_id]
        bucket[info['bucket']] += units
        if info['partial']:
            bucket['partial_pct'] += units * max(0, min(100, int(pct or 0)))
        if info['bucket'] != 'missing' and not item_id:
            bucket['received'] += units
    return out


def _row(order: PurchaseOrder, processing_row_id: Any, *, lock: bool = False) -> ProcessingRow:
    try:
        pk = int(processing_row_id)
    except (TypeError, ValueError):
        raise RowDisputeError('Pick a row.')
    qs = ProcessingRow.objects.select_for_update() if lock else ProcessingRow.objects
    row = qs.filter(purchase_order=order, pk=pk).first()
    if row is None:
        raise RowDisputeError('That row is not on this truck.')
    if row.row_kind == ProcessingRow.ROW_KIND_ADDED or not row.manifest_row_id:
        raise RowDisputeError('Only manifest rows can be disputed; this one was added here.')
    return row


def _item_for(order: PurchaseOrder, row: ProcessingRow, item_id: Any, reason: str) -> Item:
    """The checked-in item a dispute is about (Dash Update #102): on this row (or its combined group), not already
    disputed. It came, so "did not come" is not a reason for it."""
    try:
        pk = int(item_id)
    except (TypeError, ValueError):
        raise RowDisputeError('Pick an item.')
    mr_ids = {row.manifest_row_id, *ProcessingRow.objects.filter(collapse_master_id=row.pk)
              .exclude(manifest_row_id__isnull=True).values_list('manifest_row_id', flat=True)}
    item = Item.objects.select_for_update().filter(pk=pk, purchase_order=order).first()
    if item is None or item.manifest_row_id not in mr_ids:
        raise RowDisputeError(f'That item is not on row {row.row_number}.')
    if reason == ManifestRowDispute.REASON_DID_NOT_COME:
        raise RowDisputeError(f'{item.sku or "This item"} is checked in, so it came. Pick what is wrong with it.')
    if active(order).filter(item=item).exists():
        raise RowDisputeError(f'{item.sku or "This item"} is already disputed. Undo that dispute first to change it.')
    return item


def remaining_units(row: ProcessingRow) -> int:
    return max(0, int(row.quantity or 0) - int(row.qty_dispositioned or 0))


def photo_out(p: ManifestRowDisputePhoto) -> dict[str, Any]:
    url = p.s3_file.url if p.s3_file_id else None
    return {'id': p.pk, 'url': url, 'thumb_url': (p.thumbnail_file.url if p.thumbnail_file_id else None) or url}


def dispute_out(d: ManifestRowDispute) -> dict[str, Any]:
    info = REASONS.get(d.reason, {})
    return {
        'photos': [photo_out(p) for p in d.photos.all()],
        'id': d.pk,
        'item_id': d.item_id,
        'item_sku': d.item.sku if d.item_id and d.item else '',
        'reason': d.reason,
        'reason_label': info.get('label', d.reason),
        'units': d.units,
        'pct_lost': d.pct_lost if info.get('partial') else 100,
        'note': d.note,
        'by': _user_name(d.created_by),
        'at': d.created_at.isoformat() if d.created_at else None,
        'undone_at': d.undone_at.isoformat() if d.undone_at else None,
        'undone_by': _user_name(d.undone_by) if d.undone_at else '',
    }


def row_disputes(order: PurchaseOrder, processing_row_id: Any) -> dict[str, Any]:
    """What the Dispute window shows for one queue row: the row, what is left, and its disputes (undone ones too)."""
    row = _row(order, processing_row_id)
    disputes = list(
        ManifestRowDispute.objects.filter(purchase_order=order, processing_row=row)
        .select_related('created_by', 'undone_by', 'item')
        .prefetch_related('photos__s3_file', 'photos__thumbnail_file')
    )
    return {
        'row': {
            'processing_row_id': row.pk,
            'row_number': row.row_number,
            'title': row.title,
            'quantity': int(row.quantity or 0),
            'remaining': remaining_units(row),
            'unit_retail': None if row.unit_retail is None else str(row.unit_retail),
            'disputed': sum(d.units for d in disputes if d.undone_at is None),
        },
        'disputes': [dispute_out(d) for d in disputes],
        'reasons': [
            {'value': k, 'label': v['label'], 'partial': v['partial'], 'photos': v['photos']}
            for k, v in REASONS.items()
        ],
        'default_pct_lost': DEFAULT_PCT_LOST,
        'photos_max': PHOTOS_MAX,
    }


def _prepare_photos(files: list) -> list[tuple[bytes, bytes, str]]:
    """Read and encode every photo before anything is saved, so a bad file stops the dispute with plain words."""
    from apps.inventory.services.receiving_photos import ReceivingPhotoError, prepare_high_res_and_thumb

    out = []
    for n, f in enumerate(files, start=1):
        raw = f.read() if hasattr(f, 'read') else bytes(f)
        if not raw:
            raise RowDisputeError(f'Photo {n} is empty. Take it again.')
        if len(raw) > PHOTO_BYTES_MAX:
            raise RowDisputeError(f'Photo {n} is too big (over 25 MB).')
        try:
            high, thumb = prepare_high_res_and_thumb(raw)
        except ReceivingPhotoError:
            raise RowDisputeError(f'Photo {n} could not be read as a picture. Take it again or pick another.') from None
        out.append((high, thumb, str(getattr(f, 'name', '') or '')[:200]))
    return out


def _save_photos(user, order: PurchaseOrder, dispute: ManifestRowDispute, prepared, saved_keys: list[str]) -> None:
    from apps.inventory.services.receiving_photos import _save_bytes, thumb_key_for_high_res

    who = user if getattr(user, 'pk', None) else None
    for i, (high, thumb, name) in enumerate(prepared):
        hex_id = uuid.uuid4().hex
        high_key = _save_bytes(f'disputes/orders/{order.pk}/rows/{hex_id}.jpg', high)
        saved_keys.append(high_key)
        thumb_key = _save_bytes(thumb_key_for_high_res(high_key), thumb)
        saved_keys.append(thumb_key)
        base = (name.rsplit('.', 1)[0] if name else '') or hex_id
        high_sf = S3File.objects.create(key=high_key, filename=f'{base}.jpg', size=len(high),
                                        content_type='image/jpeg', uploaded_by=who)
        thumb_sf = S3File.objects.create(key=thumb_key, filename=f'{base}_thumb.jpg', size=len(thumb),
                                         content_type='image/jpeg', uploaded_by=who)
        ManifestRowDisputePhoto.objects.create(dispute=dispute, s3_file=high_sf, thumbnail_file=thumb_sf, position=i)


def photos_by_line(order: PurchaseOrder | int) -> dict[tuple[int, str], list[ManifestRowDisputePhoto]]:
    """Active row disputes' photos per (manifest row, truck bucket: broken or partial), oldest first, for the
    B-Stock dispute list."""
    out: dict[tuple[int, str], list[ManifestRowDisputePhoto]] = defaultdict(list)
    qs = (
        ManifestRowDisputePhoto.objects.filter(dispute__in=active(order))
        .select_related('dispute', 's3_file', 'thumbnail_file')
        .order_by('dispute__created_at', 'dispute_id', 'position', 'id')
    )
    for p in qs:
        info = REASONS.get(p.dispute.reason)
        if info:
            out[(p.dispute.manifest_row_id, info['bucket'])].append(p)
    return out


def _refresh(order: PurchaseOrder, row: ProcessingRow) -> None:
    from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm

    refresh_processing_rows_denorm(order, processing_row_ids=[row.pk])


def create(user, order: PurchaseOrder, data: dict, photos: list | None = None) -> dict[str, Any]:
    """Dispute some units of one queue row, with its photos. Nothing else is made. Raises RowDisputeError with
    plain words."""
    reason = str(data.get('reason') or '').strip()
    if reason not in REASONS:
        raise RowDisputeError('Pick what is wrong: did not come, arrived broken, wrong item, missing parts or other.')
    try:
        units = int(str(data.get('units') if data.get('units') is not None else '').strip())
    except (TypeError, ValueError):
        raise RowDisputeError('Say how many units.')
    if units < 1:
        raise RowDisputeError('Say how many units (at least 1).')
    pct = 100
    if REASONS[reason]['partial']:
        try:
            pct = int(str(data.get('pct_lost') if data.get('pct_lost') is not None else DEFAULT_PCT_LOST).strip())
        except (TypeError, ValueError):
            raise RowDisputeError('Say how much of the value is lost, as a percent.')
        if not 1 <= pct <= 100:
            raise RowDisputeError('How much of the value is lost must be between 1% and 100%.')
    note = str(data.get('note') or '').strip()[:NOTE_MAX]
    photos = list(photos or [])
    if not REASONS[reason]['photos']:
        photos = []        # "did not come": there is nothing to take a picture of; any photos sent are not kept
    if len(photos) > PHOTOS_MAX:
        raise RowDisputeError(f'Up to {PHOTOS_MAX} photos per dispute. Take out {len(photos) - PHOTOS_MAX}.')
    prepared = _prepare_photos(photos)
    saved_keys: list[str] = []
    try:
        with transaction.atomic():
            row = _row(order, data.get('processing_row_id'), lock=True)
            item = _item_for(order, row, data.get('item_id'), reason) if data.get('item_id') not in (None, '') else None
            if item is not None:
                units = 1                   # one checked-in item: it already counts as received and handled
            else:
                left = remaining_units(row)
                if left <= 0:
                    raise RowDisputeError(f'Row {row.row_number} has nothing left to dispute: every unit is checked '
                                          'in or already disputed. Undo one first, or dispute the checked-in items.')
                if units > left:
                    raise RowDisputeError(
                        f'Row {row.row_number} has {left} unit{"" if left == 1 else "s"} left to dispute.')
            if REASONS[reason]['photos'] and not prepared:
                raise RowDisputeError('Add a photo of the problem. Every reason but "did not come" needs at least '
                                      'one (B-Stock asks for them).')
            dispute = ManifestRowDispute.objects.create(
                purchase_order=order, manifest_row_id=item.manifest_row_id if item else row.manifest_row_id,
                processing_row=row, item=item, reason=reason, units=units, pct_lost=pct, note=note,
                created_by=user if getattr(user, 'pk', None) else None,
            )
            _save_photos(user, order, dispute, prepared, saved_keys)
            _refresh(order, row)
    except Exception:
        from django.core.files.storage import default_storage

        for key in saved_keys:          # nothing was kept, so no photo file is left behind either
            try:
                default_storage.delete(key)
            except Exception:  # noqa: BLE001
                logger.warning('row dispute photo cleanup failed key=%s', key, exc_info=True)
        raise
    dispute = ManifestRowDispute.objects.prefetch_related('photos__s3_file', 'photos__thumbnail_file').get(pk=dispute.pk)
    return {'dispute': dispute_out(dispute), **row_disputes(order, row.pk)}


def undo(user, order: PurchaseOrder, dispute_id: Any) -> dict[str, Any]:
    """Undo a dispute: kept as undone, its units go back to the row to process."""
    try:
        pk = int(dispute_id)
    except (TypeError, ValueError):
        raise RowDisputeError('Pick a dispute.')
    with transaction.atomic():
        dispute = ManifestRowDispute.objects.select_for_update().filter(purchase_order=order, pk=pk).first()
        if dispute is None:
            raise RowDisputeError('That dispute is not on this truck.')
        if dispute.undone_at is not None:
            raise RowDisputeError('That dispute was already undone.')
        dispute.undone_at = timezone.now()
        dispute.undone_by = user if getattr(user, 'pk', None) else None
        dispute.save(update_fields=['undone_at', 'undone_by'])
        row = dispute.processing_row
        if row is not None:
            _refresh(order, row)
    return row_disputes(order, row.pk) if row is not None else {'disputes': []}


def as_partial_units(bucket: dict[str, int]) -> Decimal:
    return Decimal(bucket.get('partial_pct', 0)) / 100
