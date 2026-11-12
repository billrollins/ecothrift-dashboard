"""Dispute a manifest row straight from the Processing queue (Dash Update #100, Bill 2026-11-11).

His words: "Dispute is unit/manifest ROW based. NOT Product or Item. ... This is for rows that do not come. It does
not make sense to create a product and check in just to dispute that it did not come. ALSO this should be something
that we see (and maybe even a quick action) from the queue page."

- A dispute is some units of one queue row, a reason, and a note (``ManifestRowDispute``). No product, item or
  check-in is made. Photos for every reason except "did not come" come with Dash Update #101.
- Its units count as handled on the row (``refresh_processing_rows_denorm`` adds them to ``qty_dispositioned``, so
  check-in offers only what is left) and the row reads "Disputed".
- The truck numbers read them (``truck_pallets.manifest_line_accounting``), one rule with item disputes:
  "did not come" = not received; "arrived broken" and "wrong item" = damaged; "missing parts" and "other" = partly
  damaged at their % lost. The header, Close the truck and the B-Stock dispute list all come from there.
- Undo keeps the record, marks it undone, and gives the units back to the row.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import ManifestRowDispute, ProcessingRow, PurchaseOrder

R = ManifestRowDispute
REASONS: dict[str, dict[str, Any]] = {
    R.REASON_DID_NOT_COME: {'label': 'Did not come', 'bucket': 'missing', 'partial': False},
    R.REASON_BROKEN: {'label': 'Arrived broken', 'bucket': 'broken', 'partial': False},
    R.REASON_WRONG_ITEM: {'label': 'Wrong item came', 'bucket': 'broken', 'partial': False},
    R.REASON_MISSING_PARTS: {'label': 'Missing parts', 'bucket': 'partial', 'partial': True},
    R.REASON_OTHER: {'label': 'Other problem', 'bucket': 'partial', 'partial': True},
}
DEFAULT_PCT_LOST = 50      # a partial problem starts at half the value lost; the person sets it
NOTE_MAX = 2000


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
    """Active disputed units per queue row (they count as handled on that row)."""
    qs = active(order).filter(processing_row_id__isnull=False)
    if row_ids is not None:
        qs = qs.filter(processing_row_id__in=list(row_ids))
    out: dict[int, int] = defaultdict(int)
    for pr_id, units in qs.values_list('processing_row_id', 'units'):
        out[pr_id] += int(units or 0)
    return out


def accounting_by_manifest_row(order: PurchaseOrder | int) -> dict[int, dict[str, int]]:
    """Per manifest row, in queue (processing) units like item counts: missing, broken, partial units and the
    partial % summed over units (``partial_pct`` / 100 = units of value lost)."""
    out: dict[int, dict[str, int]] = defaultdict(lambda: {'missing': 0, 'broken': 0, 'partial': 0, 'partial_pct': 0})
    for mr_id, reason, units, pct in active(order).values_list('manifest_row_id', 'reason', 'units', 'pct_lost'):
        info = REASONS.get(reason)
        if info is None:
            continue
        units = int(units or 0)
        bucket = out[mr_id]
        bucket[info['bucket']] += units
        if info['partial']:
            bucket['partial_pct'] += units * max(0, min(100, int(pct or 0)))
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


def remaining_units(row: ProcessingRow) -> int:
    return max(0, int(row.quantity or 0) - int(row.qty_dispositioned or 0))


def dispute_out(d: ManifestRowDispute) -> dict[str, Any]:
    info = REASONS.get(d.reason, {})
    return {
        'id': d.pk,
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
        .select_related('created_by', 'undone_by')
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
            {'value': k, 'label': v['label'], 'partial': v['partial']} for k, v in REASONS.items()
        ],
        'default_pct_lost': DEFAULT_PCT_LOST,
    }


def _refresh(order: PurchaseOrder, row: ProcessingRow) -> None:
    from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm

    refresh_processing_rows_denorm(order, processing_row_ids=[row.pk])


def create(user, order: PurchaseOrder, data: dict) -> dict[str, Any]:
    """Dispute some units of one queue row. Nothing else is made. Raises RowDisputeError with plain words."""
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
    with transaction.atomic():
        row = _row(order, data.get('processing_row_id'), lock=True)
        left = remaining_units(row)
        if left <= 0:
            raise RowDisputeError(f'Row {row.row_number} has nothing left to dispute: every unit is checked in '
                                  'or already disputed. Undo one first, or dispute the checked-in items.')
        if units > left:
            raise RowDisputeError(f'Row {row.row_number} has {left} unit{"" if left == 1 else "s"} left to dispute.')
        dispute = ManifestRowDispute.objects.create(
            purchase_order=order, manifest_row_id=row.manifest_row_id, processing_row=row, reason=reason,
            units=units, pct_lost=pct, note=note, created_by=user if getattr(user, 'pk', None) else None,
        )
        _refresh(order, row)
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
