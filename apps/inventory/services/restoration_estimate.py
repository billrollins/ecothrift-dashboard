"""
Restoration estimates (owner, 2026-10-22 for Add item; 2026-10-26 for all of Processing: "All items processing is
sending to restoration requires estimates").

Every path that sends an item to Restoration sends `restoration: {work, hours, parts_cost, value_after}`:
- the work it needs (test, assemble, repair, salvage; one or more),
- the hours or the parts cost (or both),
- what it is worth after the work.

The API refuses without them (a ValueError, so a 400 with the message). The estimate is kept on the check-in
(`defaults_snapshot.restoration_estimate`) and is the job's queue note, so the Restoration queue shows it.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.utils import timezone

WORK_KINDS = ('test', 'assemble', 'repair', 'salvage')
SNAPSHOT_KEY = 'restoration_estimate'


class RestorationEstimateError(ValueError):
    pass


def _amount(value, label: str) -> Decimal | None:
    from apps.inventory.processing_ops import parse_decimal

    if value in (None, ''):
        return None
    amount = parse_decimal(value)
    if amount is None or amount < 0:
        raise RestorationEstimateError(f'Restoration: the {label} must be a number.')
    return amount.quantize(Decimal('0.01'))


def restoration_estimate(raw: Any) -> dict[str, Any]:
    """The checked estimate, or RestorationEstimateError saying what is missing."""
    raw = raw if isinstance(raw, dict) else {}
    work = [w for w in WORK_KINDS if w in {str(x).strip().lower() for x in (raw.get('work') or [])}]
    if not work:
        raise RestorationEstimateError('Restoration: pick the work it needs (test, assemble, repair or salvage).')
    hours = _amount(raw.get('hours'), 'hours')
    parts = _amount(raw.get('parts_cost'), 'parts cost')
    if not (hours or parts):
        raise RestorationEstimateError('Restoration: give the hours or the parts cost (or both).')
    value_after = _amount(raw.get('value_after'), 'value after')
    if not value_after:
        raise RestorationEstimateError('Restoration: give what it is worth after the work.')
    return {'work': work, 'hours': str(hours) if hours else None, 'parts_cost': str(parts) if parts else None,
            'value_after': str(value_after)}


def saved_estimate(snapshot: Any) -> dict[str, Any] | None:
    """The estimate already on a check-in, when it is still a whole one."""
    saved = snapshot.get(SNAPSHOT_KEY) if isinstance(snapshot, dict) else None
    try:
        return restoration_estimate(saved) if saved else None
    except RestorationEstimateError:
        return None


def estimate_line(estimate: dict[str, Any]) -> str:
    bits = [', '.join(estimate['work'])]
    if estimate.get('hours'):
        bits.append(f"about {Decimal(estimate['hours']).normalize():f} h")
    if estimate.get('parts_cost'):
        bits.append(f"parts ${estimate['parts_cost']}")
    bits.append(f"worth ${estimate['value_after']} after")
    return 'Estimate: ' + ' · '.join(bits)


def stamped(estimate: dict[str, Any], user) -> dict[str, Any]:
    """For the check-in's snapshot: the estimate with who and when."""
    return {**estimate, 'recorded_at': timezone.now().isoformat(), 'recorded_by_id': getattr(user, 'pk', None)}


def note_on_job(job, estimate: dict[str, Any], user) -> None:
    """The job's queue note is the estimate, so the Restoration queue shows it."""
    from apps.inventory.services.item_notes import record_surface_note_for_job

    if job is None:
        return
    job.queue_note = estimate_line(estimate)
    job.save(update_fields=['queue_note', 'updated_at'])
    record_surface_note_for_job(job, 'queue', job.queue_note, author=user, source_key='queue')
