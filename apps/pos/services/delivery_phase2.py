"""Phase 2 delivery run helpers: contact truth, stop-item execution, workflow gates."""

from __future__ import annotations

import uuid
from typing import Any

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone

from apps.pos.models import (
    DeliveryAttachment,
    DeliveryCallAttempt,
    DeliveryItemScan,
    DeliveryJob,
    DeliveryJobItem,
    DeliveryRun,
    DeliveryRunStop,
    DeliveryRunStopItem,
)


RESULT_TO_DISPOSITION = {
    DeliveryCallAttempt.RESULT_ANSWERED_WILL_BE_THERE: DeliveryRunStop.DISPOSITION_CONFIRMED,
    DeliveryCallAttempt.RESULT_ANSWERED_NOT_AVAILABLE: DeliveryRunStop.DISPOSITION_RESCHEDULE_REQUESTED,
    DeliveryCallAttempt.RESULT_NO_ANSWER: DeliveryRunStop.DISPOSITION_NO_ANSWER,
    DeliveryCallAttempt.RESULT_VOICEMAIL_LEFT: DeliveryRunStop.DISPOSITION_VOICEMAIL,
    DeliveryCallAttempt.RESULT_TEXT_SENT: DeliveryRunStop.DISPOSITION_AWAITING_REPLY,
    DeliveryCallAttempt.RESULT_WRONG_NUMBER: DeliveryRunStop.DISPOSITION_WRONG_NUMBER,
    DeliveryCallAttempt.RESULT_OTHER: DeliveryRunStop.DISPOSITION_OTHER,
}

DISPOSITION_TO_COMPAT_RESULT = {
    DeliveryRunStop.DISPOSITION_CONFIRMED: DeliveryCallAttempt.RESULT_ANSWERED_WILL_BE_THERE,
    DeliveryRunStop.DISPOSITION_RESCHEDULE_REQUESTED: DeliveryCallAttempt.RESULT_ANSWERED_NOT_AVAILABLE,
    DeliveryRunStop.DISPOSITION_CANCEL_REQUESTED: DeliveryCallAttempt.RESULT_ANSWERED_NOT_AVAILABLE,
    DeliveryRunStop.DISPOSITION_NO_ANSWER: DeliveryCallAttempt.RESULT_NO_ANSWER,
    DeliveryRunStop.DISPOSITION_VOICEMAIL: DeliveryCallAttempt.RESULT_VOICEMAIL_LEFT,
    DeliveryRunStop.DISPOSITION_AWAITING_REPLY: DeliveryCallAttempt.RESULT_TEXT_SENT,
    DeliveryRunStop.DISPOSITION_WRONG_NUMBER: DeliveryCallAttempt.RESULT_WRONG_NUMBER,
    DeliveryRunStop.DISPOSITION_OTHER: DeliveryCallAttempt.RESULT_OTHER,
}

VALID_DISPOSITIONS = {c[0] for c in DeliveryRunStop.DISPOSITION_CHOICES}
VALID_ATTEMPT_ACTIONS = {c[0] for c in DeliveryCallAttempt.ACTION_CHOICES}
VALID_CHANNELS = {c[0] for c in DeliveryCallAttempt.CHANNEL_CHOICES}


def stop_disposition(stop: DeliveryRunStop) -> str:
    if stop.contact_disposition:
        return stop.contact_disposition
    # Legacy fallback: derive from latest call result.
    attempts = getattr(stop, '_prefetched_objects_cache', {}).get('call_attempts')
    if attempts is not None:
        latest = attempts[0] if attempts else None
    else:
        latest = stop.call_attempts.order_by('-created_at', '-id').first()
    if latest and latest.result:
        return RESULT_TO_DISPOSITION.get(latest.result, '')
    return ''


def is_stop_confirmed(stop: DeliveryRunStop) -> bool:
    return stop_disposition(stop) == DeliveryRunStop.DISPOSITION_CONFIRMED


def stop_is_excluded_unconfirmed(stop: DeliveryRunStop) -> bool:
    return bool(stop.excluded_unconfirmed_at)


def stop_has_contact_resolution(stop: DeliveryRunStop) -> bool:
    """Stop is resolved for departure: confirmed, terminal, or explicitly excluded."""
    if stop.state in (
        DeliveryRunStop.STATE_COMPLETED,
        DeliveryRunStop.STATE_FAILED,
        DeliveryRunStop.STATE_RESCHEDULED,
    ):
        return True
    if stop_is_excluded_unconfirmed(stop):
        return True
    disp = stop_disposition(stop)
    return disp in (
        DeliveryRunStop.DISPOSITION_CONFIRMED,
        DeliveryRunStop.DISPOSITION_CANCEL_REQUESTED,
    )


def stop_needs_contact(stop: DeliveryRunStop) -> bool:
    if stop.state in (
        DeliveryRunStop.STATE_COMPLETED,
        DeliveryRunStop.STATE_FAILED,
        DeliveryRunStop.STATE_RESCHEDULED,
    ):
        return False
    if stop_is_excluded_unconfirmed(stop):
        return False
    return stop_disposition(stop) != DeliveryRunStop.DISPOSITION_CONFIRMED


def all_candidate_stops_resolved(run: DeliveryRun) -> bool:
    stops = list(run.stops.all())
    if not stops:
        return False
    return all(stop_has_contact_resolution(s) for s in stops)


def unconfirmed_pool_stops(run: DeliveryRun) -> list[DeliveryRunStop]:
    out = []
    for stop in run.stops.exclude(
        state__in=[
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_FAILED,
            DeliveryRunStop.STATE_RESCHEDULED,
        ]
    ):
        if is_stop_confirmed(stop):
            continue
        out.append(stop)
    return out


def ensure_job_items_for_job(job: DeliveryJob, *, user=None) -> list[DeliveryJobItem]:
    existing = list(DeliveryJobItem.objects.filter(job=job, is_active=True).order_by('position', 'id'))
    if existing:
        return existing
    # Prefer cart-line resolution (SKU-aware) before plain text fallback.
    from apps.pos.services.delivery_run import resolve_job_line_items

    resolved = resolve_job_line_items(job)
    created = []
    for idx, part in enumerate(resolved):
        sku = str(part.get('sku') or '').strip()[:64]
        created.append(
            DeliveryJobItem.objects.create(
                job=job,
                source_cart_line_id=part.get('line_id'),
                sku=sku,
                description=(str(part.get('description') or 'Item').strip() or 'Item')[:300],
                quantity=max(1, int(part.get('quantity') or 1)),
                position=idx,
                is_scannable=bool(part.get('scannable') and sku),
                created_by=user,
            )
        )
    return created


@transaction.atomic
def snapshot_stop_items(stop: DeliveryRunStop, *, user=None) -> list[DeliveryRunStopItem]:
    """Create immutable stop-item snapshots if none exist yet."""
    existing = list(stop.stop_items.order_by('position', 'id'))
    if existing:
        return existing
    job_items = ensure_job_items_for_job(stop.job, user=user)
    created = []
    for idx, ji in enumerate(job_items):
        created.append(
            DeliveryRunStopItem.objects.create(
                stop=stop,
                job_item=ji,
                sku=(ji.sku or '')[:64],
                description=(ji.description or 'Item')[:300],
                quantity=max(1, int(ji.quantity or 1)),
                position=idx,
                is_scannable=bool(ji.is_scannable and ji.sku),
                source_cart_line_id_snapshot=ji.source_cart_line_id,
            )
        )
    return created


def sync_stop_item_snapshots_for_run(run: DeliveryRun, *, user=None) -> None:
    for stop in run.stops.select_related('job').all():
        snapshot_stop_items(stop, user=user)


def stop_item_scan_count(item: DeliveryRunStopItem) -> int:
    scans = getattr(item, '_prefetched_objects_cache', {}).get('scans')
    if scans is not None:
        return len(scans)
    return item.scans.count()


def stop_item_is_verified(item: DeliveryRunStopItem) -> bool:
    if item.verification_skipped_at:
        return True
    return stop_item_scan_count(item) >= max(1, int(item.quantity or 1))


def stop_item_has_photo(item: DeliveryRunStopItem) -> bool:
    if item.photo_exception_at:
        return True
    atts = getattr(item, '_prefetched_objects_cache', {}).get('attachments')
    if atts is not None:
        return any(a.kind == DeliveryAttachment.KIND_LOAD_ITEM for a in atts)
    return item.attachments.filter(kind=DeliveryAttachment.KIND_LOAD_ITEM).exists()


def stop_item_is_ready(item: DeliveryRunStopItem) -> bool:
    return bool(item.loaded_at) and stop_item_is_verified(item) and stop_item_has_photo(item)


def mirror_stop_load_state(stop: DeliveryRunStop) -> None:
    """Keep stop.loaded_at / scan_verified as compatibility mirrors of item state."""
    items = list(stop.stop_items.prefetch_related('scans').all())
    if not items:
        return
    all_loaded = all(i.loaded_at for i in items)
    stop.loaded_at = timezone.now() if all_loaded else None
    # Prefer first loader as actor when all loaded.
    if all_loaded:
        stop.loaded_by = next((i.loaded_by for i in items if i.loaded_by_id), stop.loaded_by)
    else:
        stop.loaded_by = None
    verified = []
    for item in items:
        if stop_item_is_verified(item):
            verified.append(
                {
                    'stop_item_id': item.id,
                    'sku': item.sku,
                    'description': item.description,
                    'quantity': item.quantity,
                    'verified_at': timezone.now().isoformat(),
                    'skipped': bool(item.verification_skipped_at),
                }
            )
    stop.scan_verified = verified
    # Compatibility: secured_at mirrors loaded when all items ready with photos.
    all_ready = all(stop_item_is_ready(i) for i in items)
    if all_ready:
        stop.secured_at = stop.secured_at or timezone.now()
        if not stop.secured_by_id:
            stop.secured_by = stop.loaded_by
    else:
        stop.secured_at = None
        stop.secured_by = None
    stop.save(
        update_fields=[
            'loaded_at',
            'loaded_by',
            'secured_at',
            'secured_by',
            'scan_verified',
            'updated_at',
        ]
    )


def all_candidate_items_ready(run: DeliveryRun) -> bool:
    """Every non-terminal stop must have all stop items ready (or stop excluded/rescheduled)."""
    ready_any = False
    for stop in run.stops.prefetch_related('stop_items__scans', 'stop_items__attachments'):
        if stop.state in (
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_FAILED,
            DeliveryRunStop.STATE_RESCHEDULED,
        ):
            continue
        if stop_is_excluded_unconfirmed(stop) and stop_disposition(stop) != DeliveryRunStop.DISPOSITION_CONFIRMED:
            # Excluded unconfirmed stops do not need to travel, but if already loaded keep them.
            items = list(stop.stop_items.all())
            if not items:
                continue
        items = list(stop.stop_items.all())
        if not items:
            return False
        if not all(stop_item_is_ready(i) for i in items):
            return False
        ready_any = True
    return ready_any


def truck_is_closed(run: DeliveryRun) -> bool:
    return bool(run.truck_closed_at) and run.attachments.filter(
        kind=DeliveryAttachment.KIND_TRUCK
    ).exists()


def departure_gates_ok(run: DeliveryRun) -> tuple[bool, str]:
    if not all_candidate_stops_resolved(run):
        return False, 'Every stop must be confirmed, rescheduled/cancelled, or explicitly excluded'
    confirmed = [
        s
        for s in run.stops.all()
        if is_stop_confirmed(s)
        and s.state
        not in (
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_FAILED,
            DeliveryRunStop.STATE_RESCHEDULED,
        )
    ]
    if not confirmed:
        return False, 'Confirm at least one stop before departure'
    for stop in confirmed:
        items = list(stop.stop_items.prefetch_related('scans', 'attachments'))
        if not items or not all(stop_item_is_ready(i) for i in items):
            return False, 'All confirmed stop items must be verified, loaded, and photographed'
    if not truck_is_closed(run) and not run.departure_override:
        return False, 'Closed-door truck photo and truck closeout are required'
    return True, ''


def user_is_manager_or_admin(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    if getattr(user, 'is_superuser', False):
        return True
    return user.groups.filter(name__in=['Manager', 'Admin']).exists()


class RunActionDenied(PermissionError):
    def __init__(self, message: str, *, code: str = 'ACTION_DENIED'):
        super().__init__(message)
        self.code = code


def assert_run_action(run: DeliveryRun, action: str, user=None) -> None:
    """Enforce that an action is allowed for the run's current phase/status."""
    from apps.pos.services.delivery_run import allowed_actions_for_run, normalize_phase

    if run.status == DeliveryRun.STATUS_COMPLETED:
        raise RunActionDenied('Run is completed', code='RUN_COMPLETED')
    allowed = set(allowed_actions_for_run(run))
    # Normalize set_phase:X style.
    if action.startswith('set_phase:'):
        if action not in allowed:
            raise RunActionDenied(
                f'Phase transition {action} is not allowed from {normalize_phase(run.phase)}',
                code='PHASE_DENIED',
            )
        return
    if action not in allowed and action.split(':')[0] not in allowed:
        raise RunActionDenied(
            f'Action "{action}" is not allowed in phase {normalize_phase(run.phase)}',
            code='ACTION_DENIED',
        )


@transaction.atomic
def record_contact_attempt(
    stop: DeliveryRunStop,
    *,
    user,
    channel: str,
    action: str,
    note: str = '',
) -> DeliveryCallAttempt:
    channel = (channel or '').strip()
    action = (action or '').strip()
    if channel not in VALID_CHANNELS:
        raise ValueError('Invalid channel')
    if action not in VALID_ATTEMPT_ACTIONS:
        raise ValueError('Invalid attempt action')
    # Opening composer never implies sent/confirmed.
    compat_result = ''
    if action == DeliveryCallAttempt.ACTION_TEXT_MARKED_SENT:
        compat_result = DeliveryCallAttempt.RESULT_TEXT_SENT
    elif action == DeliveryCallAttempt.ACTION_CALL_PLACED:
        compat_result = DeliveryCallAttempt.RESULT_OTHER
    attempt = DeliveryCallAttempt.objects.create(
        stop=stop,
        channel=channel,
        action=action,
        result=compat_result,
        note=(note or '')[:300],
        created_by=user,
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        stop.run,
        'call',
        actor=user,
        stop=stop,
        payload={'channel': channel, 'action': action, 'note': (note or '')[:120]},
    )
    return attempt


@transaction.atomic
def set_contact_disposition(
    stop: DeliveryRunStop,
    *,
    user,
    disposition: str,
    note: str = '',
) -> DeliveryRunStop:
    disposition = (disposition or '').strip()
    if disposition not in VALID_DISPOSITIONS:
        raise ValueError('Invalid contact disposition')
    stop.contact_disposition = disposition
    stop.contact_disposition_at = timezone.now()
    stop.contact_disposition_by = user
    # Clear exclusion when confirmed.
    fields = [
        'contact_disposition',
        'contact_disposition_at',
        'contact_disposition_by',
        'updated_at',
    ]
    if disposition == DeliveryRunStop.DISPOSITION_CONFIRMED and stop.excluded_unconfirmed_at:
        stop.excluded_unconfirmed_at = None
        stop.excluded_unconfirmed_by = None
        stop.excluded_unconfirmed_reason = ''
        fields.extend(
            [
                'excluded_unconfirmed_at',
                'excluded_unconfirmed_by',
                'excluded_unconfirmed_reason',
            ]
        )
    stop.save(update_fields=fields)

    # Compatibility attempt row so legacy clients still see a latest result.
    compat = DISPOSITION_TO_COMPAT_RESULT.get(disposition, DeliveryCallAttempt.RESULT_OTHER)
    DeliveryCallAttempt.objects.create(
        stop=stop,
        channel='',
        action='',
        result=compat,
        note=(note or f'disposition:{disposition}')[:300],
        created_by=user,
    )
    from apps.pos.services.delivery_run import apply_route_plan, ensure_next_up, log_event

    log_event(
        stop.run,
        'call',
        actor=user,
        stop=stop,
        payload={'disposition': disposition, 'note': (note or '')[:120]},
    )
    run = stop.run
    if disposition == DeliveryRunStop.DISPOSITION_CONFIRMED:
        ensure_next_up(run)
        if run.status == DeliveryRun.STATUS_EN_ROUTE and stop.state not in (
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_FAILED,
            DeliveryRunStop.STATE_ON_HOLD,
            DeliveryRunStop.STATE_RESCHEDULED,
        ):
            apply_route_plan(run, user=user, optimize=False)
    else:
        if stop.state == DeliveryRunStop.STATE_NEXT_UP:
            stop.state = DeliveryRunStop.STATE_QUEUED
            stop.save(update_fields=['state', 'updated_at'])
        ensure_next_up(run)
        if run.status == DeliveryRun.STATUS_EN_ROUTE:
            apply_route_plan(run, user=user, optimize=False)
    return stop


@transaction.atomic
def exclude_unconfirmed_stop(
    stop: DeliveryRunStop,
    *,
    user,
    reason: str,
) -> DeliveryRunStop:
    reason = (reason or '').strip()
    if not reason:
        raise ValueError('Reason is required to exclude an unconfirmed stop')
    if is_stop_confirmed(stop):
        raise ValueError('Confirmed stops cannot be excluded as unconfirmed')
    stop.excluded_unconfirmed_at = timezone.now()
    stop.excluded_unconfirmed_by = user
    stop.excluded_unconfirmed_reason = reason[:300]
    if stop.state == DeliveryRunStop.STATE_NEXT_UP:
        stop.state = DeliveryRunStop.STATE_QUEUED
    stop.save(
        update_fields=[
            'excluded_unconfirmed_at',
            'excluded_unconfirmed_by',
            'excluded_unconfirmed_reason',
            'state',
            'updated_at',
        ]
    )
    from apps.pos.services.delivery_run import ensure_next_up, log_event

    log_event(
        stop.run,
        'override',
        actor=user,
        stop=stop,
        payload={'excluded_unconfirmed': True, 'reason': reason[:120]},
    )
    ensure_next_up(stop.run)
    return stop


@transaction.atomic
def clear_unconfirmed_exclusion(stop: DeliveryRunStop, *, user) -> DeliveryRunStop:
    stop.excluded_unconfirmed_at = None
    stop.excluded_unconfirmed_by = None
    stop.excluded_unconfirmed_reason = ''
    stop.save(
        update_fields=[
            'excluded_unconfirmed_at',
            'excluded_unconfirmed_by',
            'excluded_unconfirmed_reason',
            'updated_at',
        ]
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        stop.run,
        'override',
        actor=user,
        stop=stop,
        payload={'excluded_unconfirmed': False},
    )
    return stop


@transaction.atomic
def scan_stop_item(
    item: DeliveryRunStopItem,
    *,
    user,
    scanned_code: str,
    client_scan_id: str | None = None,
) -> DeliveryItemScan:
    code = (scanned_code or '').strip()
    if not code:
        raise ValueError('scanned_code is required')
    cid = None
    if client_scan_id:
        try:
            cid = uuid.UUID(str(client_scan_id))
        except (ValueError, TypeError) as exc:
            raise ValueError('Invalid client_scan_id') from exc
        existing = DeliveryItemScan.objects.filter(stop_item=item, client_scan_id=cid).first()
        if existing:
            return existing
    # Quantity-aware: allow up to quantity scans.
    if stop_item_scan_count(item) >= max(1, int(item.quantity or 1)) and not item.verification_skipped_at:
        # Already fully verified — idempotent no-op via returning last scan.
        last = item.scans.order_by('-scanned_at', '-id').first()
        if last:
            return last
    if item.is_scannable and item.sku:
        if code.upper() != item.sku.strip().upper():
            raise ValueError(f'Scan does not match expected SKU {item.sku}')
    scan = DeliveryItemScan.objects.create(
        stop_item=item,
        scanned_code=code[:64],
        client_scan_id=cid,
        scanned_by=user,
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        item.stop.run,
        'load',
        actor=user,
        stop=item.stop,
        payload={
            'stop_item_id': item.id,
            'scanned_code': code[:64],
            'client_scan_id': str(cid) if cid else None,
        },
    )
    mirror_stop_load_state(item.stop)
    return scan


@transaction.atomic
def skip_stop_item_verification(
    item: DeliveryRunStopItem,
    *,
    user,
    reason: str,
) -> DeliveryRunStopItem:
    reason = (reason or '').strip()
    if not reason:
        raise ValueError('Skip reason is required')
    item.verification_skipped_at = timezone.now()
    item.verification_skipped_by = user
    item.verification_skip_reason = reason[:300]
    item.save(
        update_fields=[
            'verification_skipped_at',
            'verification_skipped_by',
            'verification_skip_reason',
        ]
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        item.stop.run,
        'override',
        actor=user,
        stop=item.stop,
        payload={
            'stop_item_id': item.id,
            'verification_skipped': True,
            'reason': reason[:120],
        },
    )
    mirror_stop_load_state(item.stop)
    return item


@transaction.atomic
def set_stop_item_loaded(
    item: DeliveryRunStopItem,
    *,
    user,
    loaded: bool = True,
) -> DeliveryRunStopItem:
    item.loaded_at = timezone.now() if loaded else None
    item.loaded_by = user if loaded else None
    item.save(update_fields=['loaded_at', 'loaded_by'])
    from apps.pos.services.delivery_run import log_event

    log_event(
        item.stop.run,
        'load',
        actor=user,
        stop=item.stop,
        payload={'stop_item_id': item.id, 'loaded': loaded},
    )
    mirror_stop_load_state(item.stop)
    return item


@transaction.atomic
def set_stop_item_photo_exception(
    item: DeliveryRunStopItem,
    *,
    user,
    reason: str,
) -> DeliveryRunStopItem:
    reason = (reason or '').strip()
    if not reason:
        raise ValueError('Photo exception reason is required')
    item.photo_exception_at = timezone.now()
    item.photo_exception_by = user
    item.photo_exception_reason = reason[:300]
    item.save(
        update_fields=['photo_exception_at', 'photo_exception_by', 'photo_exception_reason']
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        item.stop.run,
        'override',
        actor=user,
        stop=item.stop,
        payload={
            'stop_item_id': item.id,
            'photo_exception': True,
            'reason': reason[:120],
        },
    )
    mirror_stop_load_state(item.stop)
    return item


@transaction.atomic
def close_truck(run: DeliveryRun, *, user) -> DeliveryRun:
    try:
        assert_run_action(run, 'close_truck', user)
    except RunActionDenied as exc:
        raise ValueError(str(exc)) from exc
    if not run.attachments.filter(kind=DeliveryAttachment.KIND_TRUCK).exists():
        raise ValueError('Capture a closed-door truck photo before closing the truck')
    # Item readiness for candidates that will travel or are still in the load pool.
    items_ok = True
    for stop in run.stops.prefetch_related('stop_items__scans', 'stop_items__attachments'):
        if stop.state in (
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_FAILED,
            DeliveryRunStop.STATE_RESCHEDULED,
        ):
            continue
        items = list(stop.stop_items.all())
        if not items or not all(stop_item_is_ready(i) for i in items):
            items_ok = False
            break
    if not items_ok and not run.departure_override:
        raise ValueError('All candidate items must be loaded with photos before truck close')
    run.truck_closed_at = timezone.now()
    run.truck_closed_by = user
    run.phase = DeliveryRun.PHASE_TRUCK
    run.save(update_fields=['truck_closed_at', 'truck_closed_by', 'phase', 'updated_at'])
    from apps.pos.services.delivery_run import log_event

    log_event(run, 'phase', actor=user, payload={'phase': run.phase, 'truck_closed': True})
    return run


@transaction.atomic
def set_departure_override(run: DeliveryRun, *, user, reason: str) -> DeliveryRun:
    if not user_is_manager_or_admin(user):
        raise PermissionError('Departure override requires a manager or admin.')
    reason = (reason or '').strip()
    if not reason:
        raise ValueError('Departure override reason is required')
    run.departure_override = True
    run.departure_override_reason = reason[:300]
    run.departure_override_by = user
    run.save(
        update_fields=[
            'departure_override',
            'departure_override_reason',
            'departure_override_by',
            'updated_at',
        ]
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        run,
        'override',
        actor=user,
        payload={'departure_override': True, 'reason': reason[:120]},
    )
    return run


def serialize_stop_item(item: DeliveryRunStopItem) -> dict[str, Any]:
    scans = list(item.scans.select_related('scanned_by').order_by('scanned_at', 'id'))
    photos = [
        {
            'id': a.id,
            'kind': a.kind,
            'url': getattr(a.s3_file, 'url', '') or '',
            'client_photo_id': str(a.client_photo_id) if a.client_photo_id else None,
            'created_at': a.created_at.isoformat(),
        }
        for a in item.attachments.filter(kind=DeliveryAttachment.KIND_LOAD_ITEM).select_related(
            's3_file'
        )
    ]
    scan_count = len(scans)
    qty = max(1, int(item.quantity or 1))
    return {
        'id': item.id,
        'stop_id': item.stop_id,
        'job_item_id': item.job_item_id,
        'sku': item.sku,
        'description': item.description,
        'quantity': qty,
        'position': item.position,
        'is_scannable': item.is_scannable,
        'scan_count': scan_count,
        'scans_required': qty,
        'is_verified': stop_item_is_verified(item),
        'verification_skipped': bool(item.verification_skipped_at),
        'verification_skip_reason': item.verification_skip_reason,
        'loaded_at': item.loaded_at.isoformat() if item.loaded_at else None,
        'has_load_photo': stop_item_has_photo(item),
        'photo_exception': bool(item.photo_exception_at),
        'photo_exception_reason': item.photo_exception_reason,
        'is_ready': stop_item_is_ready(item),
        'scans': [
            {
                'id': s.id,
                'scanned_code': s.scanned_code,
                'client_scan_id': str(s.client_scan_id) if s.client_scan_id else None,
                'scanned_at': s.scanned_at.isoformat(),
            }
            for s in scans
        ],
        'photos': photos,
    }


def contact_progress(run: DeliveryRun, stop_payloads: list[dict] | None = None) -> dict[str, Any]:
    stops = list(run.stops.all()) if stop_payloads is None else None
    if stop_payloads is not None:
        total = len(stop_payloads)
        confirmed = sum(1 for s in stop_payloads if s.get('is_confirmed'))
        awaiting = sum(
            1
            for s in stop_payloads
            if s.get('contact_disposition') == DeliveryRunStop.DISPOSITION_AWAITING_REPLY
        )
        excluded = sum(1 for s in stop_payloads if s.get('excluded_unconfirmed'))
        unresolved = sum(
            1
            for s in stop_payloads
            if not s.get('is_confirmed')
            and not s.get('excluded_unconfirmed')
            and s.get('state')
            not in (
                DeliveryRunStop.STATE_COMPLETED,
                DeliveryRunStop.STATE_FAILED,
                DeliveryRunStop.STATE_RESCHEDULED,
            )
        )
    else:
        total = len(stops)
        confirmed = sum(1 for s in stops if is_stop_confirmed(s))
        awaiting = sum(
            1 for s in stops if stop_disposition(s) == DeliveryRunStop.DISPOSITION_AWAITING_REPLY
        )
        excluded = sum(1 for s in stops if stop_is_excluded_unconfirmed(s))
        unresolved = sum(
            1
            for s in stops
            if not stop_has_contact_resolution(s)
        )
    return {
        'total': total,
        'confirmed': confirmed,
        'awaiting_reply': awaiting,
        'excluded_unconfirmed': excluded,
        'unresolved': unresolved,
        'all_resolved': unresolved == 0 and total > 0,
    }


def load_progress(run: DeliveryRun) -> dict[str, Any]:
    items = list(
        DeliveryRunStopItem.objects.filter(stop__run=run).prefetch_related('scans', 'attachments')
    )
    total = len(items)
    verified = sum(1 for i in items if stop_item_is_verified(i))
    loaded = sum(1 for i in items if i.loaded_at)
    photographed = sum(1 for i in items if stop_item_has_photo(i))
    ready = sum(1 for i in items if stop_item_is_ready(i))
    return {
        'total_items': total,
        'verified': verified,
        'loaded': loaded,
        'photographed': photographed,
        'ready': ready,
        'all_ready': total > 0 and ready == total,
    }


def monitor_aggregates(run: DeliveryRun, stop_payloads: list[dict]) -> dict[str, Any]:
    next_up = next((s for s in stop_payloads if s.get('state') == DeliveryRunStop.STATE_NEXT_UP), None)
    queued = [s for s in stop_payloads if s.get('state') in ('queued', 'next_up')]
    current = next_up or (queued[0] if queued else None)
    nxt = None
    if current:
        for s in stop_payloads:
            if s['id'] == current['id']:
                continue
            if s.get('state') in ('queued',) and s.get('is_confirmed'):
                nxt = s
                break
    route_summary = run.route_summary or {}
    return {
        'contact': contact_progress(run, stop_payloads),
        'load': load_progress(run),
        'truck_closed': truck_is_closed(run),
        'truck_closed_at': run.truck_closed_at.isoformat() if run.truck_closed_at else None,
        'departure_override': bool(run.departure_override),
        'current_stop': current,
        'next_stop': nxt,
        'unconfirmed': [s for s in stop_payloads if not s.get('is_confirmed') and s.get('state') not in (
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_FAILED,
            DeliveryRunStop.STATE_RESCHEDULED,
        )],
        'route': {
            'revision': run.route_revision,
            'optimized': bool(route_summary.get('optimized')),
            'etas_available': bool(route_summary.get('etas_available')),
            'provider_status': (
                'optimized'
                if route_summary.get('optimized')
                else 'fallback'
                if route_summary
                else 'none'
            ),
            'last_optimized_at': (
                run.last_optimized_at.isoformat() if run.last_optimized_at else None
            ),
        },
        'pending_media': 0,
        'exceptions': [
            s
            for s in stop_payloads
            if s.get('state') == DeliveryRunStop.STATE_ON_HOLD
            or s.get('return_issue_code')
            or s.get('proof_override')
        ],
    }
