"""Delivery day run wizard — start, load, calls, route/ETAs, proof, finish."""

from __future__ import annotations

import uuid
from datetime import timedelta
from typing import Any

from django.db import transaction
from django.db.models import Prefetch
from django.utils import timezone
from django.core.files.storage import default_storage

from apps.core.models import S3File
from apps.pos.models import (
    CartLine,
    DeliveryAddressRevision,
    DeliveryAttachment,
    DeliveryAvailability,
    DeliveryCallAttempt,
    DeliveryJob,
    DeliveryRun,
    DeliveryRunEvent,
    DeliveryRunStop,
)
from apps.pos.services.delivery_distance import (
    SERVICE_SECONDS_PER_STOP,
    build_google_maps_route_url,
    plan_delivery_route_with_etas,
)

MAX_TRUCK_PHOTOS = 4
ALLOWED_IMAGE_TYPES = {
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
}
MAX_UPLOAD_BYTES = 12 * 1024 * 1024

# User-facing phases for the revised wizard (legacy values remapped).
ACTIVE_PHASES = {
    DeliveryRun.PHASE_START,
    DeliveryRun.PHASE_CALLS,
    DeliveryRun.PHASE_ROUTE,
    DeliveryRun.PHASE_LOAD,
    DeliveryRun.PHASE_ACTIVE,
    DeliveryRun.PHASE_RETURN,
}
LEGACY_PHASE_MAP = {
    DeliveryRun.PHASE_REVIEW: DeliveryRun.PHASE_CALLS,
    DeliveryRun.PHASE_TRUCK: DeliveryRun.PHASE_LOAD,
}
RETURN_ISSUE_CODES = {
    'no_customer': 'No customer',
    'customer_refused': 'Customer refused',
    'could_not_access': 'Could not access',
    'item_issue': 'Item issue',
    'other': 'Other',
}

# Stops excluded from route / next-up promotion.
EXCLUDED_ROUTE_STATES = (
    DeliveryRunStop.STATE_COMPLETED,
    DeliveryRunStop.STATE_FAILED,
    DeliveryRunStop.STATE_ON_HOLD,
    DeliveryRunStop.STATE_RESCHEDULED,
)


def normalize_phase(phase: str) -> str:
    """Map legacy phase values onto the five-step flow."""
    mapped = LEGACY_PHASE_MAP.get(phase, phase)
    # Old "route" meant the begin-departure screen; new "route" is confirmed ETAs.
    # En-route runs with leftover "route" should be treated as active driving.
    return mapped


def ensure_canonical_phase(run: DeliveryRun) -> DeliveryRun:
    """Persist legacy phase remaps when a run is touched."""
    if run.phase in LEGACY_PHASE_MAP:
        run.phase = LEGACY_PHASE_MAP[run.phase]
        run.save(update_fields=['phase', 'updated_at'])
    return run


def latest_call_attempt(stop: DeliveryRunStop) -> DeliveryCallAttempt | None:
    attempts = getattr(stop, '_prefetched_objects_cache', {}).get('call_attempts')
    if attempts is not None:
        return attempts[0] if attempts else None
    return stop.call_attempts.order_by('-created_at', '-id').first()


def is_stop_confirmed(stop: DeliveryRunStop) -> bool:
    latest = latest_call_attempt(stop)
    return bool(
        latest
        and latest.result == DeliveryCallAttempt.RESULT_ANSWERED_WILL_BE_THERE
    )


def stop_needs_call_again(stop: DeliveryRunStop) -> bool:
    latest = latest_call_attempt(stop)
    if latest is None:
        return True
    return latest.result != DeliveryCallAttempt.RESULT_ANSWERED_WILL_BE_THERE


def stop_has_any_call(stop: DeliveryRunStop) -> bool:
    return latest_call_attempt(stop) is not None


def all_stops_have_call_result(run: DeliveryRun) -> bool:
    stops = list(run.stops.all())
    if not stops:
        return False
    return all(stop_has_any_call(s) for s in stops)


def _actor_label(user) -> str:
    if user is None:
        return ''
    name = f'{getattr(user, "first_name", "")} {getattr(user, "last_name", "")}'.strip()
    return name or getattr(user, 'email', '') or str(user.pk)


def log_event(
    run: DeliveryRun,
    event_type: str,
    *,
    actor=None,
    stop: DeliveryRunStop | None = None,
    payload: dict | None = None,
) -> DeliveryRunEvent:
    return DeliveryRunEvent.objects.create(
        run=run,
        stop=stop,
        event_type=event_type,
        actor=actor,
        payload=payload or {},
    )


def format_stop_address(job: DeliveryJob) -> str:
    rev = (
        job.address_revisions.filter(is_active=True)
        .order_by('-created_at', '-id')
        .first()
    )
    if rev:
        base = (rev.address or '').strip()
        if rev.is_apt and rev.unit:
            return f'{base}, Unit {rev.unit}'
        return base
    base = (job.address or '').strip()
    if job.is_apt and job.unit:
        return f'{base}, Unit {job.unit}'
    return base


def _eligible_jobs_for_date(date) -> list[DeliveryJob]:
    return list(
        DeliveryJob.objects.filter(
            scheduled_date=date,
            status=DeliveryJob.STATUS_SCHEDULED,
        ).order_by('id')
    )


def sync_job_onto_open_run(job: DeliveryJob, *, user=None) -> DeliveryRun | None:
    """If an open run exists for the job's date, ensure a stop exists for it."""
    if not job.scheduled_date or job.status != DeliveryJob.STATUS_SCHEDULED:
        return None
    run = get_open_run_for_date(job.scheduled_date)
    if not run:
        return None
    if run.stops.filter(job=job).exists():
        return run
    max_pos = run.stops.order_by('-position').values_list('position', flat=True).first()
    pos = (max_pos + 1) if max_pos is not None else 0
    DeliveryRunStop.objects.create(
        run=run,
        job=job,
        position=pos,
        state=DeliveryRunStop.STATE_QUEUED,
    )
    ensure_next_up(run)
    if user is not None:
        log_event(run, 'note', actor=user, payload={'added_job_id': job.id})
    return run


@transaction.atomic
def create_delivery_job(
    *,
    user,
    customer_name: str,
    phone: str,
    address: str,
    items_delivered: str,
    is_apt: bool = False,
    unit: str = '',
    notes: str = '',
    availability: DeliveryAvailability | None = None,
    schedule_later: bool = False,
    tier: str = '',
    fee=None,
    distance_miles=None,
    distance_mode: str = '',
    item_count: int | None = None,
    cart=None,
    source_cart_line_ids: list[int] | None = None,
) -> DeliveryJob:
    """Create a board/manual delivery job (optionally linked to a past sale, no fee line)."""
    from decimal import Decimal, InvalidOperation

    name = (customer_name or '').strip()
    phone_val = (phone or '').strip()
    address_val = (address or '').strip()
    items = (items_delivered or '').strip()
    if not name or not phone_val or not address_val or not items:
        raise ValueError('customer_name, phone, address, and items_delivered are required')
    if is_apt and not (unit or '').strip():
        raise ValueError('Unit # is required when Apt is checked')

    # Normalize US 10-digit phones to (xxx) xxx-xxxx
    digits = ''.join(ch for ch in phone_val if ch.isdigit())
    if len(digits) == 11 and digits.startswith('1'):
        digits = digits[1:]
    if len(digits) == 10:
        phone_val = f'({digits[:3]}) {digits[3:6]}-{digits[6:]}'

    tier_val = (tier or '').strip().lower()
    fee_map = {
        '5mi': Decimal('50.00'),
        '10mi': Decimal('75.00'),
    }
    if tier_val and tier_val not in fee_map:
        raise ValueError('tier must be 5mi, 10mi, or blank')
    if fee is not None and fee != '':
        try:
            fee_val = Decimal(str(fee))
        except (InvalidOperation, ValueError, TypeError) as exc:
            raise ValueError('Invalid fee') from exc
    elif tier_val in fee_map:
        fee_val = fee_map[tier_val]
    else:
        fee_val = Decimal('0.00')

    miles = None
    if distance_miles not in (None, ''):
        try:
            miles = Decimal(str(distance_miles))
        except (InvalidOperation, ValueError, TypeError):
            miles = None

    if availability is not None and not schedule_later:
        job_status = DeliveryJob.STATUS_SCHEDULED
        scheduled_date = availability.date
    else:
        job_status = DeliveryJob.STATUS_NEEDS_SCHEDULING
        scheduled_date = None
        availability = None

    linked_qty = 0
    if source_cart_line_ids:
        for ln in CartLine.objects.filter(pk__in=source_cart_line_ids):
            if cart is not None and ln.cart_id != cart.id:
                continue
            try:
                linked_qty += max(1, int(ln.quantity or 1))
            except (TypeError, ValueError):
                linked_qty += 1
    if linked_qty >= 1:
        count = min(linked_qty, 99)
    elif item_count is not None and item_count != '':
        try:
            count = max(1, min(99, int(item_count)))
        except (TypeError, ValueError):
            count = 1
    else:
        parts = [p.strip() for p in items.replace(';', ',').split(',') if p.strip()]
        count = max(1, len(parts)) if parts else 1
    note_parts = [(notes or '').strip()]
    if source_cart_line_ids:
        note_parts.append(
            f'Source cart lines: {", ".join(str(i) for i in source_cart_line_ids)}'
        )
    note_text = '\n'.join(p for p in note_parts if p)[:2000]

    job = DeliveryJob.objects.create(
        availability=availability,
        scheduled_date=scheduled_date,
        cart=cart,
        cart_line=None,
        customer_name=name[:120],
        phone=phone_val[:40],
        address=address_val[:200],
        is_apt=bool(is_apt),
        unit=(unit or '').strip()[:40],
        items_delivered=items[:300],
        item_count=count,
        tier=tier_val[:10],
        fee=fee_val,
        distance_miles=miles,
        distance_mode=(distance_mode or '')[:20],
        notes=note_text,
        status=job_status,
        created_by=user,
    )
    sync_job_onto_open_run(job, user=user)
    return job


def _stop_is_routable(stop: DeliveryRunStop) -> bool:
    """Confirmed, not held, not terminal — eligible for route / next-up."""
    if stop.state in EXCLUDED_ROUTE_STATES:
        return False
    return is_stop_confirmed(stop)


def _promote_next_up(run: DeliveryRun) -> DeliveryRunStop | None:
    """Ensure exactly one next_up among confirmed, non-held stops (or none)."""
    DeliveryRunStop.objects.filter(run=run, state=DeliveryRunStop.STATE_NEXT_UP).update(
        state=DeliveryRunStop.STATE_QUEUED
    )
    candidates = (
        DeliveryRunStop.objects.filter(run=run)
        .exclude(state__in=EXCLUDED_ROUTE_STATES)
        .prefetch_related(
            Prefetch(
                'call_attempts',
                queryset=DeliveryCallAttempt.objects.order_by('-created_at', '-id'),
            )
        )
        .order_by('position', 'id')
    )
    for nxt in candidates:
        if is_stop_confirmed(nxt):
            nxt.state = DeliveryRunStop.STATE_NEXT_UP
            nxt.save(update_fields=['state', 'updated_at'])
            return nxt
    return None


def ensure_next_up(run: DeliveryRun) -> DeliveryRunStop | None:
    current = (
        DeliveryRunStop.objects.filter(run=run, state=DeliveryRunStop.STATE_NEXT_UP)
        .prefetch_related(
            Prefetch(
                'call_attempts',
                queryset=DeliveryCallAttempt.objects.order_by('-created_at', '-id'),
            )
        )
        .first()
    )
    if current and _stop_is_routable(current):
        return current
    if current and not _stop_is_routable(current):
        current.state = DeliveryRunStop.STATE_QUEUED
        current.save(update_fields=['state', 'updated_at'])
    return _promote_next_up(run)


@transaction.atomic
def start_or_resume_run(*, date, user, availability_id: int | None = None) -> DeliveryRun:
    run = (
        DeliveryRun.objects.select_for_update()
        .filter(date=date)
        .exclude(status=DeliveryRun.STATUS_COMPLETED)
        .order_by('-id')
        .first()
    )
    availability = None
    if availability_id:
        availability = DeliveryAvailability.objects.filter(pk=availability_id).first()
    elif not run:
        availability = (
            DeliveryAvailability.objects.filter(date=date, is_active=True)
            .order_by('time_start')
            .first()
        )

    if run is None:
        run = DeliveryRun.objects.create(
            date=date,
            availability=availability,
            status=DeliveryRun.STATUS_PREPARING,
            phase=DeliveryRun.PHASE_CALLS,
            started_at=timezone.now(),
            started_by=user,
        )
        jobs = _eligible_jobs_for_date(date)
        for idx, job in enumerate(jobs):
            DeliveryRunStop.objects.create(
                run=run,
                job=job,
                position=idx,
                state=DeliveryRunStop.STATE_QUEUED,
            )
        ensure_next_up(run)
        log_event(run, 'start', actor=user, payload={'job_count': len(jobs)})
        log_event(run, 'phase', actor=user, payload={'phase': run.phase})
    else:
        if run.started_at is None:
            run.started_at = timezone.now()
            run.started_by = user
            run.save(update_fields=['started_at', 'started_by', 'updated_at'])
        # Sync any newly scheduled jobs onto the run
        existing = set(run.stops.values_list('job_id', flat=True))
        max_pos = run.stops.order_by('-position').values_list('position', flat=True).first()
        pos = (max_pos + 1) if max_pos is not None else 0
        for job in _eligible_jobs_for_date(date):
            if job.id in existing:
                continue
            DeliveryRunStop.objects.create(
                run=run,
                job=job,
                position=pos,
                state=DeliveryRunStop.STATE_QUEUED,
            )
            pos += 1
        ensure_next_up(run)
        log_event(run, 'start', actor=user, payload={'resumed': True})

    ensure_canonical_phase(run)
    return run


def elapsed_seconds(run: DeliveryRun) -> int:
    if run.ended_at and run.started_at:
        return max(0, int((run.ended_at - run.started_at).total_seconds()))
    if run.started_at:
        return max(0, int((timezone.now() - run.started_at).total_seconds()))
    return int(run.active_seconds or 0)


def set_phase(run: DeliveryRun, phase: str, *, user) -> DeliveryRun:
    phase = normalize_phase(phase)
    if phase not in ACTIVE_PHASES:
        raise ValueError('Invalid phase')
    if phase == DeliveryRun.PHASE_ACTIVE:
        raise ValueError('Use begin_route to start driving')
    if phase == DeliveryRun.PHASE_RETURN:
        raise ValueError('Use return-store endpoint to mark returned to store')
    if phase == DeliveryRun.PHASE_ROUTE and not all_stops_have_call_result(run):
        raise ValueError('Every stop needs a call result before route review')
    if phase == DeliveryRun.PHASE_LOAD:
        confirmed = confirmed_stops_qs(run)
        if not confirmed.exists():
            raise ValueError('Confirm at least one stop before loading')
    run.phase = phase
    run.save(update_fields=['phase', 'updated_at'])
    log_event(run, 'phase', actor=user, payload={'phase': phase})
    return run


def confirmed_stops_qs(run: DeliveryRun):
    """Stops whose latest call result is answered_will_be_there."""
    confirmed_ids = []
    for stop in run.stops.prefetch_related(
        Prefetch(
            'call_attempts',
            queryset=DeliveryCallAttempt.objects.order_by('-created_at', '-id'),
        )
    ):
        if is_stop_confirmed(stop):
            confirmed_ids.append(stop.id)
    return run.stops.filter(id__in=confirmed_ids)


def mark_loaded(stop: DeliveryRunStop, *, user, loaded: bool = True) -> DeliveryRunStop:
    if loaded and not is_stop_confirmed(stop):
        raise ValueError('Only confirmed stops can be loaded')
    stop.loaded_at = timezone.now() if loaded else None
    stop.loaded_by = user if loaded else None
    stop.save(update_fields=['loaded_at', 'loaded_by', 'updated_at'])
    log_event(stop.run, 'load', actor=user, stop=stop, payload={'loaded': loaded})
    return stop


def mark_secured(stop: DeliveryRunStop, *, user, secured: bool = True) -> DeliveryRunStop:
    if secured and not is_stop_confirmed(stop):
        raise ValueError('Only confirmed stops can be secured')
    stop.secured_at = timezone.now() if secured else None
    stop.secured_by = user if secured else None
    stop.save(update_fields=['secured_at', 'secured_by', 'updated_at'])
    log_event(stop.run, 'secure', actor=user, stop=stop, payload={'secured': secured})
    return stop


def all_confirmed_loaded_and_secured(run: DeliveryRun) -> bool:
    stops = list(
        confirmed_stops_qs(run).exclude(
            state__in=[
                DeliveryRunStop.STATE_COMPLETED,
                DeliveryRunStop.STATE_FAILED,
                DeliveryRunStop.STATE_RESCHEDULED,
            ]
        )
    )
    if not stops:
        return False
    return all(s.loaded_at and s.secured_at for s in stops)


def all_stops_loaded_and_secured(run: DeliveryRun) -> bool:
    """Backward-compatible alias — gates on confirmed stops only."""
    return all_confirmed_loaded_and_secured(run)


def truck_photo_count(run: DeliveryRun) -> int:
    return run.attachments.filter(kind=DeliveryAttachment.KIND_TRUCK).count()


@transaction.atomic
def add_call_attempt(
    stop: DeliveryRunStop,
    *,
    user,
    result: str,
    note: str = '',
) -> DeliveryCallAttempt:
    if result not in dict(DeliveryCallAttempt.RESULT_CHOICES):
        raise ValueError('Invalid call result')
    attempt = DeliveryCallAttempt.objects.create(
        stop=stop,
        result=result,
        note=(note or '')[:300],
        created_by=user,
    )
    log_event(
        stop.run,
        'call',
        actor=user,
        stop=stop,
        payload={'result': result, 'note': note[:120]},
    )
    # Confirmation changes who is eligible for next-up / route ETAs
    run = stop.run
    if result == DeliveryCallAttempt.RESULT_ANSWERED_WILL_BE_THERE:
        ensure_next_up(run)
        if run.status == DeliveryRun.STATUS_EN_ROUTE and stop.state not in EXCLUDED_ROUTE_STATES:
            apply_route_plan(run, user=user, optimize=False)
    else:
        if stop.state == DeliveryRunStop.STATE_NEXT_UP:
            stop.state = DeliveryRunStop.STATE_QUEUED
            stop.save(update_fields=['state', 'updated_at'])
        ensure_next_up(run)
        if run.status == DeliveryRun.STATUS_EN_ROUTE:
            apply_route_plan(run, user=user, optimize=False)
    return attempt


@transaction.atomic
def hold_stop(stop: DeliveryRunStop, *, user, reason: str = '') -> DeliveryRunStop:
    stop.state = DeliveryRunStop.STATE_ON_HOLD
    stop.hold_reason = (reason or '')[:300]
    stop.save(update_fields=['state', 'hold_reason', 'updated_at'])
    log_event(stop.run, 'hold', actor=user, stop=stop, payload={'reason': reason[:120]})
    ensure_next_up(stop.run)
    return stop


@transaction.atomic
def release_stop(stop: DeliveryRunStop, *, user) -> DeliveryRunStop:
    stop.state = DeliveryRunStop.STATE_QUEUED
    stop.hold_reason = ''
    stop.save(update_fields=['state', 'hold_reason', 'updated_at'])
    log_event(stop.run, 'release', actor=user, stop=stop)
    # If nothing is next_up, promote this one (or earliest)
    ensure_next_up(stop.run)
    return stop


@transaction.atomic
def append_address(
    job: DeliveryJob,
    *,
    user,
    address: str,
    is_apt: bool = False,
    unit: str = '',
    reason: str = '',
) -> DeliveryAddressRevision:
    address = (address or '').strip()
    if not address:
        raise ValueError('Address is required')
    DeliveryAddressRevision.objects.filter(job=job, is_active=True).update(is_active=False)
    rev = DeliveryAddressRevision.objects.create(
        job=job,
        address=address[:200],
        is_apt=bool(is_apt),
        unit=(unit or '')[:40],
        reason=(reason or '')[:300],
        is_active=True,
        created_by=user,
    )
    stop = (
        DeliveryRunStop.objects.filter(job=job)
        .exclude(run__status=DeliveryRun.STATUS_COMPLETED)
        .select_related('run')
        .order_by('-id')
        .first()
    )
    if stop:
        log_event(
            stop.run,
            'address',
            actor=user,
            stop=stop,
            payload={'address': address[:120], 'reason': reason[:80]},
        )
        run = stop.run
        if run.status == DeliveryRun.STATUS_EN_ROUTE or _stop_is_routable(stop):
            apply_route_plan(run, user=user, optimize=False)
    return rev


def _routable_stops(run: DeliveryRun) -> list[DeliveryRunStop]:
    """Confirmed, non-terminal, non-hold stops in position order."""
    stops = list(
        run.stops.select_related('job')
        .exclude(state__in=EXCLUDED_ROUTE_STATES)
        .prefetch_related(
            Prefetch(
                'call_attempts',
                queryset=DeliveryCallAttempt.objects.order_by('-created_at', '-id'),
            )
        )
        .order_by('position', 'id')
    )
    return [s for s in stops if is_stop_confirmed(s)]


@transaction.atomic
def reorder_stops(run: DeliveryRun, stop_ids: list[int], *, user) -> DeliveryRun:
    """Reorder the confirmed/routable subset. Unconfirmed stops keep relative tails."""
    routable = _routable_stops(run)
    routable_ids = {s.id for s in routable}
    if not stop_ids:
        raise ValueError('stop_ids required')
    if len(stop_ids) != len(set(stop_ids)):
        raise ValueError('stop_ids must be unique')
    if set(stop_ids) != routable_ids:
        raise ValueError('stop_ids must include every confirmed stop exactly once')

    all_stops = {s.id: s for s in run.stops.select_for_update()}
    # Assign contiguous positions to confirmed order, then append others
    next_pos = 0
    for sid in stop_ids:
        s = all_stops[sid]
        if s.position != next_pos:
            s.position = next_pos
            s.save(update_fields=['position', 'updated_at'])
        next_pos += 1
    for s in sorted(
        (x for x in all_stops.values() if x.id not in routable_ids),
        key=lambda x: (x.position, x.id),
    ):
        if s.position != next_pos:
            s.position = next_pos
            s.save(update_fields=['position', 'updated_at'])
        next_pos += 1

    run.route_revision += 1
    run.save(update_fields=['route_revision', 'updated_at'])
    log_event(run, 'reorder', actor=user, payload={'stop_ids': stop_ids})
    apply_route_plan(run, user=user, optimize=False)
    return run


def apply_route_plan(
    run: DeliveryRun,
    *,
    user,
    optimize: bool = True,
    origin_address: str | None = None,
) -> dict[str, Any]:
    """Optimize (optional) and write ETA windows onto confirmed routable stops."""
    active = _routable_stops(run)
    addresses = [format_stop_address(s.job) for s in active]
    plan = plan_delivery_route_with_etas(
        addresses,
        origin_address=origin_address,
        optimize=optimize,
        start_at=timezone.now(),
    )
    # Reorder positions if optimized (confirmed only; others trail)
    if plan.get('optimized') and plan.get('order_indices') and active:
        ordered_stops = [active[i] for i in plan['order_indices'] if 0 <= i < len(active)]
        seen = {s.id for s in ordered_stops}
        ordered_stops.extend([s for s in active if s.id not in seen])
        others = list(
            run.stops.exclude(id__in={s.id for s in ordered_stops}).order_by('position', 'id')
        )
        for idx, s in enumerate(ordered_stops + others):
            if s.position != idx:
                s.position = idx
                s.save(update_fields=['position', 'updated_at'])
        active = ordered_stops

    etas = plan.get('etas') or []
    for idx, s in enumerate(active):
        eta = etas[idx] if idx < len(etas) else None
        if eta:
            s.eta_arrive_at = eta.get('arrive_at')
            s.eta_window_end_at = eta.get('window_end_at')
            s.drive_seconds_from_prev = eta.get('drive_seconds')
        else:
            s.eta_arrive_at = None
            s.eta_window_end_at = None
            s.drive_seconds_from_prev = None
        s.save(
            update_fields=[
                'eta_arrive_at',
                'eta_window_end_at',
                'drive_seconds_from_prev',
                'updated_at',
            ]
        )
    # Clear ETAs on non-routable open stops
    for s in run.stops.exclude(id__in=[x.id for x in active]).exclude(
        state__in=[
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_FAILED,
            DeliveryRunStop.STATE_RESCHEDULED,
        ]
    ):
        if s.eta_arrive_at or s.eta_window_end_at or s.drive_seconds_from_prev:
            s.eta_arrive_at = None
            s.eta_window_end_at = None
            s.drive_seconds_from_prev = None
            s.save(
                update_fields=[
                    'eta_arrive_at',
                    'eta_window_end_at',
                    'drive_seconds_from_prev',
                    'updated_at',
                ]
            )

    maps_url = plan.get('maps_url') or build_google_maps_route_url(addresses) or ''
    run.maps_url = maps_url
    run.route_summary = {
        'optimized': bool(plan.get('optimized')),
        'etas_available': bool(plan.get('etas_available')),
        'total_drive_seconds': plan.get('total_drive_seconds'),
        'total_distance_meters': plan.get('total_distance_meters'),
        'return_drive_seconds': plan.get('return_drive_seconds'),
        'return_distance_meters': plan.get('return_distance_meters'),
        'estimated_finish_at': (
            plan['estimated_finish_at'].isoformat()
            if plan.get('estimated_finish_at')
            else None
        ),
        'stop_count': len(active),
        'confirmed_count': len(active),
    }
    run.last_optimized_at = timezone.now()
    run.route_revision += 1
    run.save(
        update_fields=[
            'maps_url',
            'route_summary',
            'last_optimized_at',
            'route_revision',
            'updated_at',
        ]
    )
    log_event(
        run,
        'route',
        actor=user,
        payload={
            'optimized': bool(plan.get('optimized')),
            'stop_count': len(active),
            'etas_available': bool(etas),
        },
    )
    ensure_next_up(run)
    return plan


@transaction.atomic
def begin_route(run: DeliveryRun, *, user) -> DeliveryRun:
    if not all_confirmed_loaded_and_secured(run):
        raise ValueError('All confirmed stops must be loaded and secured before departure')
    if truck_photo_count(run) < 1:
        raise ValueError('At least one truck photo is required before departure')
    apply_route_plan(run, user=user, optimize=True)
    run.status = DeliveryRun.STATUS_EN_ROUTE
    run.phase = DeliveryRun.PHASE_ACTIVE
    run.save(update_fields=['status', 'phase', 'updated_at'])
    log_event(run, 'phase', actor=user, payload={'phase': run.phase, 'status': run.status})
    ensure_next_up(run)
    return run


def _stop_has_proof(stop: DeliveryRunStop) -> bool:
    kinds = set(stop.attachments.values_list('kind', flat=True))
    return (
        DeliveryAttachment.KIND_DELIVERY_PROOF in kinds
        and DeliveryAttachment.KIND_SIGNATURE in kinds
    )


def mark_contact_present(
    stop: DeliveryRunStop, *, user, present: bool = True
) -> DeliveryRunStop:
    stop.contact_present_at = timezone.now() if present else None
    stop.contact_present_by = user if present else None
    stop.save(update_fields=['contact_present_at', 'contact_present_by', 'updated_at'])
    log_event(
        stop.run, 'contact', actor=user, stop=stop, payload={'present': present}
    )
    return stop


def mark_delivered(stop: DeliveryRunStop, *, user, delivered: bool = True) -> DeliveryRunStop:
    stop.delivered_at = timezone.now() if delivered else None
    stop.delivered_by = user if delivered else None
    stop.save(update_fields=['delivered_at', 'delivered_by', 'updated_at'])
    log_event(
        stop.run, 'delivered', actor=user, stop=stop, payload={'delivered': delivered}
    )
    return stop


def mark_returned_to_store(run: DeliveryRun, *, user) -> DeliveryRun:
    run.returned_to_store_at = timezone.now()
    if run.phase != DeliveryRun.PHASE_RETURN:
        run.phase = DeliveryRun.PHASE_RETURN
        run.save(update_fields=['returned_to_store_at', 'phase', 'updated_at'])
    else:
        run.save(update_fields=['returned_to_store_at', 'updated_at'])
    log_event(run, 'return', actor=user, payload={'arrived_store': True})
    return run


def update_return_checklist(
    stop: DeliveryRunStop,
    *,
    user,
    unloaded: bool | None = None,
    items_stored: bool | None = None,
    issue_code: str | None = None,
    issue_notes: str | None = None,
    reconcile: bool | None = None,
) -> DeliveryRunStop:
    """Update return-to-store checklist; fail the job only after reconcile."""
    if stop.state == DeliveryRunStop.STATE_COMPLETED:
        raise ValueError('Completed stops do not need return reconciliation')
    fields = ['updated_at']
    if unloaded is not None:
        stop.returned_unloaded_at = timezone.now() if unloaded else None
        stop.returned_unloaded_by = user if unloaded else None
        fields.extend(['returned_unloaded_at', 'returned_unloaded_by'])
    if items_stored is not None:
        stop.returned_items_stored_at = timezone.now() if items_stored else None
        stop.returned_items_stored_by = user if items_stored else None
        fields.extend(['returned_items_stored_at', 'returned_items_stored_by'])
    if issue_code is not None:
        code = (issue_code or '').strip()
        if code and code not in RETURN_ISSUE_CODES:
            raise ValueError('Invalid return issue code')
        stop.return_issue_code = code
        fields.append('return_issue_code')
    if issue_notes is not None:
        stop.return_issue_notes = (issue_notes or '')[:500]
        fields.append('return_issue_notes')

    if reconcile:
        if not stop.returned_unloaded_at or not stop.returned_items_stored_at:
            raise ValueError('Unload and put-back are required before reconcile')
        if not stop.return_issue_code:
            raise ValueError('Select an issue reason before reconcile')
        if not (stop.return_issue_notes or '').strip():
            raise ValueError('Issue notes are required for return exceptions')
        stop.return_reconciled_at = timezone.now()
        stop.return_reconciled_by = user
        stop.state = DeliveryRunStop.STATE_FAILED
        fields.extend(['return_reconciled_at', 'return_reconciled_by', 'state'])
        # Fail the job for reschedule — do not mutate inventory Item.status
        job = stop.job
        if job.status == DeliveryJob.STATUS_SCHEDULED:
            job.status = DeliveryJob.STATUS_FAILED
            job.save(update_fields=['status', 'updated_at'])

    stop.save(update_fields=list(dict.fromkeys(fields)))
    log_event(
        stop.run,
        'return',
        actor=user,
        stop=stop,
        payload={
            'unloaded': bool(stop.returned_unloaded_at),
            'stored': bool(stop.returned_items_stored_at),
            'reconciled': bool(stop.return_reconciled_at),
            'issue_code': stop.return_issue_code,
        },
    )
    ensure_next_up(stop.run)
    return stop


def undelivered_stops_needing_reconcile(run: DeliveryRun) -> list[DeliveryRunStop]:
    return list(
        run.stops.exclude(
            state__in=[
                DeliveryRunStop.STATE_COMPLETED,
                DeliveryRunStop.STATE_RESCHEDULED,
            ]
        )
        .exclude(return_reconciled_at__isnull=False)
        .order_by('position', 'id')
    )


def can_finish_run(run: DeliveryRun) -> bool:
    if not run.returned_to_store_at:
        return False
    return not undelivered_stops_needing_reconcile(run)


@transaction.atomic
def complete_stop(
    stop: DeliveryRunStop,
    *,
    user,
    override: bool = False,
    override_reason: str = '',
) -> DeliveryRunStop:
    if stop.state in (DeliveryRunStop.STATE_COMPLETED, DeliveryRunStop.STATE_FAILED):
        return stop

    if not override:
        if not stop.contact_present_at:
            raise ValueError('Contact present checkpoint is required')
        if not stop.delivered_at:
            raise ValueError('Items delivered checkpoint is required')
        if not _stop_has_proof(stop):
            raise ValueError('Proof photo and signature are required (or use override)')
    if override and not (override_reason or '').strip():
        raise ValueError('Override reason is required')

    now = timezone.now()
    stop.state = DeliveryRunStop.STATE_COMPLETED
    stop.completed_at = now
    stop.completed_by = user
    if override:
        stop.proof_override = True
        stop.proof_override_reason = override_reason.strip()[:300]
        stop.proof_override_by = user
        if not stop.contact_present_at:
            stop.contact_present_at = now
            stop.contact_present_by = user
        if not stop.delivered_at:
            stop.delivered_at = now
            stop.delivered_by = user
    stop.save(
        update_fields=[
            'state',
            'completed_at',
            'completed_by',
            'proof_override',
            'proof_override_reason',
            'proof_override_by',
            'contact_present_at',
            'contact_present_by',
            'delivered_at',
            'delivered_by',
            'updated_at',
        ]
    )
    job = stop.job
    if job.status == DeliveryJob.STATUS_SCHEDULED:
        job.status = DeliveryJob.STATUS_COMPLETED
        job.save(update_fields=['status', 'updated_at'])

    log_event(
        stop.run,
        'override' if override else 'complete',
        actor=user,
        stop=stop,
        payload={'override': override, 'reason': (override_reason or '')[:120]},
    )
    ensure_next_up(stop.run)
    remaining = bool(_routable_stops(stop.run))
    if remaining:
        apply_route_plan(
            stop.run,
            user=user,
            optimize=False,
            origin_address=format_stop_address(job),
        )
    return stop


@transaction.atomic
def finish_run(
    run: DeliveryRun,
    *,
    user,
    force: bool = False,
    reason: str = '',
) -> DeliveryRun:
    open_stops = undelivered_stops_needing_reconcile(run)
    if open_stops and not force:
        raise ValueError(
            'Cannot finish until undelivered stops are reconciled (or use force with reason)'
        )
    if force and open_stops and not (reason or '').strip():
        raise ValueError('Force-finish reason is required')
    if not force and not run.returned_to_store_at:
        raise ValueError('Mark arrived back at store before ending the day')
    run.status = DeliveryRun.STATUS_COMPLETED
    run.ended_at = timezone.now()
    run.active_seconds = elapsed_seconds(run)
    run.phase = DeliveryRun.PHASE_RETURN
    run.save(update_fields=['status', 'ended_at', 'active_seconds', 'phase', 'updated_at'])
    log_event(
        run,
        'finish',
        actor=user,
        payload={'force': force, 'reason': (reason or '')[:120]},
    )
    return run


def save_attachment(
    *,
    run: DeliveryRun,
    user,
    uploaded_file,
    kind: str,
    stop: DeliveryRunStop | None = None,
    client_photo_id: str | None = None,
) -> DeliveryAttachment:
    if kind not in dict(DeliveryAttachment.KIND_CHOICES):
        raise ValueError('Invalid attachment kind')
    if kind == DeliveryAttachment.KIND_TRUCK:
        if truck_photo_count(run) >= MAX_TRUCK_PHOTOS:
            raise ValueError(f'Maximum {MAX_TRUCK_PHOTOS} truck photos')
        stop = None
    else:
        if stop is None:
            raise ValueError('stop is required for proof/signature')

    if client_photo_id:
        try:
            cid = uuid.UUID(str(client_photo_id))
        except (ValueError, TypeError) as exc:
            raise ValueError('Invalid client_photo_id') from exc
        existing = DeliveryAttachment.objects.filter(run=run, client_photo_id=cid).first()
        if existing:
            return existing
    else:
        cid = None

    content_type = getattr(uploaded_file, 'content_type', '') or 'application/octet-stream'
    if content_type not in ALLOWED_IMAGE_TYPES and not content_type.startswith('image/'):
        raise ValueError('File must be an image')
    size = getattr(uploaded_file, 'size', 0) or 0
    if size > MAX_UPLOAD_BYTES:
        raise ValueError('File too large')

    ext = 'jpg'
    name = getattr(uploaded_file, 'name', '') or ''
    if '.' in name:
        ext = name.rsplit('.', 1)[-1].lower()[:8] or 'jpg'
    key = f'delivery/runs/{run.id}/{uuid.uuid4().hex}.{ext}'
    saved_key = default_storage.save(key, uploaded_file)
    s3 = S3File.objects.create(
        key=saved_key,
        filename=name or f'{kind}.{ext}',
        size=size,
        content_type=content_type,
        uploaded_by=user,
    )
    att = DeliveryAttachment.objects.create(
        run=run,
        stop=stop,
        s3_file=s3,
        kind=kind,
        client_photo_id=cid,
        created_by=user,
    )
    log_event(
        run,
        'photo',
        actor=user,
        stop=stop,
        payload={'kind': kind, 'attachment_id': att.id},
    )
    return att


def delete_attachment(att: DeliveryAttachment, *, user) -> None:
    run = att.run
    s3 = att.s3_file
    key = s3.key
    att.delete()
    try:
        if key and default_storage.exists(key):
            default_storage.delete(key)
    except Exception:
        pass
    s3.delete()
    log_event(run, 'photo', actor=user, payload={'deleted': True, 'kind': att.kind})


def customer_text_templates(stop: DeliveryRunStop) -> list[dict[str, str]]:
    job = stop.job
    name = (job.customer_name or 'there').split()[0]
    date_label = ''
    if job.scheduled_date:
        date_label = job.scheduled_date.strftime('%A, %B %d').replace(' 0', ' ')
    eta = ''
    if stop.eta_arrive_at:
        local = timezone.localtime(stop.eta_arrive_at)
        end = (
            timezone.localtime(stop.eta_window_end_at)
            if stop.eta_window_end_at
            else local + timedelta(minutes=20)
        )
        eta = f'{local.strftime("%I:%M %p").lstrip("0")}–{end.strftime("%I:%M %p").lstrip("0")}'

    templates = [
        {
            'key': 'day_of',
            'label': 'Day-of confirmation',
            'body': (
                f'Hi {name}, this is Eco-Thrift. Your delivery is scheduled for {date_label}. '
                'Please confirm someone will be home — we call the day of delivery and again when we arrive. '
                'Signature required; drop-off only (end of driveway / apartment lot).'
            ),
        },
        {
            'key': 'on_my_way',
            'label': 'On my way',
            'body': (
                f'Hi {name}, Eco-Thrift is on the way with your delivery'
                + (f'. Estimated arrival window: {eta}' if eta else '')
                + '. Please be ready to meet us and sign.'
            ),
        },
        {
            'key': 'delayed',
            'label': 'Delayed / update',
            'body': (
                f'Hi {name}, Eco-Thrift delivery update'
                + (f': new estimated window {eta}' if eta else ': we are running a bit behind')
                + '. Thank you for your patience — we will call when we are close.'
            ),
        },
        {
            'key': 'no_answer',
            'label': 'No answer',
            'body': (
                f'Hi {name}, Eco-Thrift tried to reach you about today’s delivery. '
                'Please call us back. If we cannot confirm someone will be home, we may need to hold the delivery.'
            ),
        },
        {
            'key': 'completed',
            'label': 'Completed / thank you',
            'body': (
                f'Hi {name}, Eco-Thrift has completed your delivery. Thank you — '
                'please keep your receipt for warranty/policy details.'
            ),
        },
    ]
    return templates


def _cart_line_ids_from_job(job: DeliveryJob) -> list[int]:
    meta = {}
    if job.cart_line_id and isinstance(getattr(job.cart_line, 'meta', None), dict):
        meta = job.cart_line.meta or {}
    raw_ids = meta.get('cart_line_ids') if isinstance(meta.get('cart_line_ids'), list) else []
    cleaned: list[int] = []
    for raw in raw_ids:
        try:
            cleaned.append(int(raw))
        except (TypeError, ValueError):
            continue
    return cleaned


def resolve_job_line_items(job: DeliveryJob) -> list[dict[str, Any]]:
    """Resolve scannable cart lines linked at sale time; fallback to text parts."""
    items: list[dict[str, Any]] = []
    cleaned_ids = _cart_line_ids_from_job(job)

    if cleaned_ids:
        lines = (
            CartLine.objects.filter(pk__in=cleaned_ids)
            .select_related('item')
            .order_by('id')
        )
        by_id = {ln.id: ln for ln in lines}
        for lid in cleaned_ids:
            ln = by_id.get(lid)
            if not ln:
                continue
            sku = ''
            if ln.item_id and ln.item:
                sku = (ln.item.sku or '').strip()
            if not sku:
                sku = (ln.resale_source_sku or '').strip()
            items.append(
                {
                    'line_id': ln.id,
                    'sku': sku,
                    'description': (ln.description or '').strip() or 'Item',
                    'quantity': int(ln.quantity or 1),
                    'scannable': bool(sku),
                }
            )

    if items:
        return items

    # Fallback: split items_delivered text into non-scannable rows
    parts = [
        p.strip()
        for p in (job.items_delivered or '').replace(';', ',').split(',')
        if p.strip()
    ]
    if not parts:
        parts = ['Delivery items']
    return [
        {
            'line_id': None,
            'sku': '',
            'description': part,
            'quantity': 1,
            'scannable': False,
        }
        for part in parts
    ]


def resolved_delivery_item_count(job: DeliveryJob) -> int:
    """Authoritative item count from linked sale lines (qty sum), else stored/text estimate."""
    items = resolve_job_line_items(job)
    total = sum(max(1, int(it.get('quantity') or 1)) for it in items)
    if total >= 1:
        return min(total, 99)
    try:
        stored = int(job.item_count or 1)
    except (TypeError, ValueError):
        stored = 1
    return max(1, min(stored, 99))


def verify_stop_scan(stop: DeliveryRunStop, *, user, sku: str) -> dict[str, Any]:
    """Match a scanned SKU to a line item on this stop (optional load check)."""
    raw = (sku or '').strip()
    if not raw:
        raise ValueError('SKU is required')
    needle = raw.upper()
    line_items = resolve_job_line_items(stop.job)
    match = next(
        (
            it
            for it in line_items
            if it.get('scannable') and str(it.get('sku') or '').strip().upper() == needle
        ),
        None,
    )
    if match is None:
        raise ValueError(f'No matching item for SKU {raw} on this stop')

    verified = list(stop.scan_verified or [])
    already = any(
        str(v.get('sku') or '').strip().upper() == needle
        or (match.get('line_id') and v.get('line_id') == match.get('line_id'))
        for v in verified
        if isinstance(v, dict)
    )
    if not already:
        verified.append(
            {
                'line_id': match.get('line_id'),
                'sku': match.get('sku') or raw,
                'description': match.get('description') or '',
                'verified_at': timezone.now().isoformat(),
                'verified_by': _actor_label(user),
            }
        )
        stop.scan_verified = verified
        stop.save(update_fields=['scan_verified', 'updated_at'])
        log_event(
            stop.run,
            'load',
            actor=user,
            stop=stop,
            payload={'scan_verified': match.get('sku') or raw},
        )
    return {'matched': match, 'scan_verified': verified}


def serialize_attachment(att: DeliveryAttachment) -> dict[str, Any]:
    url = ''
    try:
        url = att.s3_file.url
    except Exception:
        url = ''
    return {
        'id': att.id,
        'kind': att.kind,
        'stop_id': att.stop_id,
        'client_photo_id': str(att.client_photo_id) if att.client_photo_id else None,
        'url': url,
        'filename': att.s3_file.filename,
        'created_at': att.created_at.isoformat(),
    }


def serialize_stop(stop: DeliveryRunStop) -> dict[str, Any]:
    job = stop.job
    # Ensure cart_line.meta is available for line-item resolution
    if job.cart_line_id and not hasattr(job, '_cart_line_cache'):
        try:
            _ = job.cart_line
        except Exception:
            pass
    latest_addr = format_stop_address(job)
    line_items = resolve_job_line_items(job)
    verified = [v for v in (stop.scan_verified or []) if isinstance(v, dict)]
    verified_keys = {
        str(v.get('sku') or '').strip().upper()
        for v in verified
        if str(v.get('sku') or '').strip()
    }
    verified_line_ids = {
        int(v['line_id'])
        for v in verified
        if v.get('line_id') is not None
    }
    for it in line_items:
        sku_u = str(it.get('sku') or '').strip().upper()
        lid = it.get('line_id')
        it['scan_verified'] = bool(
            (sku_u and sku_u in verified_keys)
            or (lid is not None and int(lid) in verified_line_ids)
        )
    scannable = [it for it in line_items if it.get('scannable')]
    call_list = list(stop.call_attempts.all()[:20])
    calls = [
        {
            'id': c.id,
            'result': c.result,
            'note': c.note,
            'created_at': c.created_at.isoformat(),
            'created_by': _actor_label(c.created_by),
        }
        for c in call_list
    ]
    latest = call_list[0] if call_list else None
    confirmed = bool(
        latest and latest.result == DeliveryCallAttempt.RESULT_ANSWERED_WILL_BE_THERE
    )
    attachments = [serialize_attachment(a) for a in stop.attachments.select_related('s3_file')]
    revisions = [
        {
            'id': r.id,
            'address': r.address,
            'is_apt': r.is_apt,
            'unit': r.unit,
            'reason': r.reason,
            'is_active': r.is_active,
            'created_at': r.created_at.isoformat(),
            'created_by': _actor_label(r.created_by),
        }
        for r in job.address_revisions.all()[:10]
    ]
    return {
        'id': stop.id,
        'job_id': job.id,
        'position': stop.position,
        'state': stop.state,
        'customer_name': job.customer_name,
        'phone': job.phone,
        'original_address': job.address,
        'address': latest_addr,
        'is_apt': job.is_apt,
        'unit': job.unit,
        'items_delivered': job.items_delivered,
        'item_count': resolved_delivery_item_count(job),
        'line_items': line_items,
        'scan_verified': verified,
        'scan_verified_count': sum(1 for it in line_items if it.get('scan_verified')),
        'scannable_count': len(scannable),
        'notes': job.notes,
        'job_status': job.status,
        'loaded_at': stop.loaded_at.isoformat() if stop.loaded_at else None,
        'secured_at': stop.secured_at.isoformat() if stop.secured_at else None,
        'contact_present_at': (
            stop.contact_present_at.isoformat() if stop.contact_present_at else None
        ),
        'delivered_at': stop.delivered_at.isoformat() if stop.delivered_at else None,
        'eta_arrive_at': stop.eta_arrive_at.isoformat() if stop.eta_arrive_at else None,
        'eta_window_end_at': stop.eta_window_end_at.isoformat() if stop.eta_window_end_at else None,
        'drive_seconds_from_prev': stop.drive_seconds_from_prev,
        'completed_at': stop.completed_at.isoformat() if stop.completed_at else None,
        'proof_override': stop.proof_override,
        'proof_override_reason': stop.proof_override_reason,
        'hold_reason': stop.hold_reason,
        'has_proof_photo': any(
            a.kind == DeliveryAttachment.KIND_DELIVERY_PROOF for a in stop.attachments.all()
        ),
        'has_signature': any(
            a.kind == DeliveryAttachment.KIND_SIGNATURE for a in stop.attachments.all()
        ),
        'latest_call_result': latest.result if latest else None,
        'latest_call_at': latest.created_at.isoformat() if latest else None,
        'latest_call_note': latest.note if latest else '',
        'is_confirmed': confirmed,
        'needs_call_again': (not confirmed),
        'has_call_result': latest is not None,
        'returned_unloaded_at': (
            stop.returned_unloaded_at.isoformat() if stop.returned_unloaded_at else None
        ),
        'returned_items_stored_at': (
            stop.returned_items_stored_at.isoformat()
            if stop.returned_items_stored_at
            else None
        ),
        'return_issue_code': stop.return_issue_code,
        'return_issue_notes': stop.return_issue_notes,
        'return_reconciled_at': (
            stop.return_reconciled_at.isoformat() if stop.return_reconciled_at else None
        ),
        'rescheduled_at': stop.rescheduled_at.isoformat() if stop.rescheduled_at else None,
        'rescheduled_to_date': (
            stop.rescheduled_to_date.isoformat() if stop.rescheduled_to_date else None
        ),
        'call_attempts': calls,
        'attachments': attachments,
        'address_revisions': revisions,
        'text_templates': customer_text_templates(stop),
    }


def serialize_run(run: DeliveryRun) -> dict[str, Any]:
    stops = list(
        run.stops.select_related('job', 'job__cart_line', 'job__cart_line__item', 'loaded_by', 'secured_by', 'completed_by')
        .prefetch_related(
            Prefetch(
                'call_attempts',
                queryset=DeliveryCallAttempt.objects.select_related('created_by').order_by(
                    '-created_at'
                ),
            ),
            Prefetch(
                'attachments',
                queryset=DeliveryAttachment.objects.select_related('s3_file'),
            ),
            Prefetch(
                'job__address_revisions',
                queryset=DeliveryAddressRevision.objects.select_related('created_by').order_by(
                    '-created_at'
                ),
            ),
        )
        .order_by('position', 'id')
    )
    truck = [
        serialize_attachment(a)
        for a in run.attachments.filter(kind=DeliveryAttachment.KIND_TRUCK).select_related(
            's3_file'
        )
    ]
    ensure_canonical_phase(run)
    stop_payloads = [serialize_stop(s) for s in stops]
    next_up = next((s for s in stop_payloads if s['state'] == DeliveryRunStop.STATE_NEXT_UP), None)
    confirmed = [s for s in stop_payloads if s.get('is_confirmed')]
    recent_events = [
        serialize_event(e)
        for e in run.events.select_related('actor').order_by('-created_at', '-id')[:50]
    ]
    return {
        'id': run.id,
        'date': run.date.isoformat(),
        'availability_id': run.availability_id,
        'status': run.status,
        'phase': run.phase,
        'started_at': run.started_at.isoformat() if run.started_at else None,
        'ended_at': run.ended_at.isoformat() if run.ended_at else None,
        'started_by': _actor_label(run.started_by),
        'elapsed_seconds': elapsed_seconds(run),
        'route_revision': run.route_revision,
        'last_optimized_at': run.last_optimized_at.isoformat() if run.last_optimized_at else None,
        'maps_url': run.maps_url,
        'route_summary': run.route_summary or {},
        'notes': run.notes,
        'returned_to_store_at': (
            run.returned_to_store_at.isoformat() if run.returned_to_store_at else None
        ),
        'truck_photos': truck,
        'truck_photo_count': len(truck),
        'max_truck_photos': MAX_TRUCK_PHOTOS,
        'all_loaded_secured': all_confirmed_loaded_and_secured(run),
        'all_stops_called': all(s.get('has_call_result') for s in stop_payloads) if stop_payloads else False,
        'can_finish': can_finish_run(run),
        'next_action': next_action_for_run(run),
        'allowed_actions': allowed_actions_for_run(run),
        'events': recent_events,
        'return_issue_codes': [
            {'value': k, 'label': v} for k, v in RETURN_ISSUE_CODES.items()
        ],
        'progress': {
            'total': len(stop_payloads),
            'confirmed': len(confirmed),
            'completed': sum(1 for s in stop_payloads if s['state'] == 'completed'),
            'on_hold': sum(1 for s in stop_payloads if s['state'] == 'on_hold'),
            'queued': sum(1 for s in stop_payloads if s['state'] in ('queued', 'next_up')),
            'failed': sum(1 for s in stop_payloads if s['state'] == 'failed'),
            'rescheduled': sum(
                1 for s in stop_payloads if s['state'] == DeliveryRunStop.STATE_RESCHEDULED
            ),
            'needs_reconcile': sum(
                1
                for s in stop_payloads
                if s['state'] != 'completed' and not s.get('return_reconciled_at')
            ),
        },
        'next_up': next_up,
        'stops': stop_payloads,
        'service_minutes_per_stop': SERVICE_SECONDS_PER_STOP // 60,
    }


def get_open_run_for_date(date) -> DeliveryRun | None:
    return (
        DeliveryRun.objects.filter(date=date)
        .exclude(status=DeliveryRun.STATUS_COMPLETED)
        .order_by('-id')
        .first()
    )


def open_stop_for_job(job: DeliveryJob) -> DeliveryRunStop | None:
    """Active stop on an open run for the job's scheduled date."""
    if not job.scheduled_date:
        return None
    return (
        DeliveryRunStop.objects.filter(job=job, run__date=job.scheduled_date)
        .exclude(run__status=DeliveryRun.STATUS_COMPLETED)
        .exclude(
            state__in=[
                DeliveryRunStop.STATE_COMPLETED,
                DeliveryRunStop.STATE_RESCHEDULED,
            ]
        )
        .select_related('run')
        .order_by('-id')
        .first()
    )


def _sync_job_cart_line_meta(job: DeliveryJob, *, notes: str | None = None) -> None:
    if not job.cart_line_id:
        return
    line = job.cart_line
    meta = dict(line.meta or {})
    meta['availability_id'] = job.availability_id
    meta['scheduled_date'] = job.scheduled_date.isoformat() if job.scheduled_date else None
    meta['schedule_later'] = False
    if job.availability:
        meta['time_start'] = job.availability.time_start.strftime('%H:%M')
        meta['time_end'] = job.availability.time_end.strftime('%H:%M')
    if notes is not None:
        meta['notes'] = notes
    line.meta = meta
    if job.scheduled_date and 'schedule later' in (line.description or '').lower():
        fee_label = (
            'Delivery 5 miles or less' if job.tier == '5mi' else 'Delivery 5 to 10 miles'
        )
        line.description = (
            f'{fee_label} — {job.items_delivered} — {job.customer_name} — '
            f'{job.scheduled_date.isoformat()}'
        )[:300]
    line.save(update_fields=['meta', 'description'])


@transaction.atomic
def report_issue(
    stop: DeliveryRunStop,
    *,
    user,
    issue_code: str,
    note: str = '',
    hold: bool = True,
) -> DeliveryRunStop:
    code = (issue_code or '').strip()
    if code and code not in RETURN_ISSUE_CODES:
        raise ValueError('Invalid issue code')
    note_text = (note or '')[:500]
    reason = RETURN_ISSUE_CODES.get(code, code) if code else 'Issue reported'
    if note_text:
        reason = f'{reason}: {note_text[:120]}'

    stop.return_issue_code = code
    stop.return_issue_notes = note_text
    if hold:
        stop.state = DeliveryRunStop.STATE_ON_HOLD
        stop.hold_reason = reason[:300]
    stop.save(
        update_fields=[
            'return_issue_code',
            'return_issue_notes',
            'state',
            'hold_reason',
            'updated_at',
        ]
    )
    run = stop.run
    log_event(
        run,
        'issue',
        actor=user,
        stop=stop,
        payload={'issue_code': code, 'note': note_text[:120], 'hold': hold},
    )
    ensure_next_up(run)
    if run.status == DeliveryRun.STATUS_EN_ROUTE:
        apply_route_plan(run, user=user, optimize=False)
    return stop


@transaction.atomic
def reschedule_job_from_run(
    job: DeliveryJob,
    *,
    user,
    availability: DeliveryAvailability,
    notes: str = '',
) -> DeliveryJob:
    if not availability.is_active:
        raise ValueError('That delivery date is not available')

    old_date = job.scheduled_date
    run = get_open_run_for_date(old_date) if old_date else None
    stop = open_stop_for_job(job) if run else None

    if stop and (stop.loaded_at or run.status == DeliveryRun.STATUS_EN_ROUTE):
        raise ValueError(
            'Cannot reschedule after load or en route — report an issue and reconcile return first'
        )

    new_date = availability.date
    note_text = (notes or '')[:2000]
    job_updates = ['availability', 'scheduled_date', 'status', 'updated_at']
    job.availability = availability
    job.scheduled_date = new_date
    job.status = DeliveryJob.STATUS_SCHEDULED
    if note_text:
        job.notes = note_text
        job_updates.append('notes')
    job.save(update_fields=job_updates)
    _sync_job_cart_line_meta(job, notes=note_text if note_text else None)

    if stop and run and run.status == DeliveryRun.STATUS_PREPARING and stop.loaded_at is None:
        now = timezone.now()
        stop.state = DeliveryRunStop.STATE_RESCHEDULED
        stop.rescheduled_at = now
        stop.rescheduled_by = user
        stop.rescheduled_to_date = new_date
        stop.save(
            update_fields=[
                'state',
                'rescheduled_at',
                'rescheduled_by',
                'rescheduled_to_date',
                'updated_at',
            ]
        )
        log_event(
            run,
            'reschedule',
            actor=user,
            stop=stop,
            payload={
                'job_id': job.id,
                'from_date': old_date.isoformat() if old_date else None,
                'to_date': new_date.isoformat(),
                'availability_id': availability.id,
            },
        )
        ensure_next_up(run)
        apply_route_plan(run, user=user, optimize=False)
    elif run:
        log_event(
            run,
            'reschedule',
            actor=user,
            stop=stop,
            payload={
                'job_id': job.id,
                'from_date': old_date.isoformat() if old_date else None,
                'to_date': new_date.isoformat(),
                'no_stop': stop is None,
            },
        )

    return job


@transaction.atomic
def cancel_job_with_run_sync(job: DeliveryJob, *, user) -> DeliveryJob:
    stop = open_stop_for_job(job)
    job.status = DeliveryJob.STATUS_CANCELLED
    job.save(update_fields=['status', 'updated_at'])

    if stop and stop.state not in (
        DeliveryRunStop.STATE_COMPLETED,
        DeliveryRunStop.STATE_RESCHEDULED,
    ):
        run = stop.run
        stop.state = DeliveryRunStop.STATE_FAILED
        stop.hold_reason = 'Cancelled'
        stop.return_issue_code = 'other'
        stop.return_issue_notes = 'Cancelled'
        stop.save(
            update_fields=[
                'state',
                'hold_reason',
                'return_issue_code',
                'return_issue_notes',
                'updated_at',
            ]
        )
        log_event(
            run,
            'cancel',
            actor=user,
            stop=stop,
            payload={'job_id': job.id},
        )
        ensure_next_up(run)
        if run.status == DeliveryRun.STATUS_EN_ROUTE:
            apply_route_plan(run, user=user, optimize=False)

    return job


def allowed_actions_for_run(run: DeliveryRun) -> list[str]:
    """Phase-gated actions the client may invoke."""
    if run.status == DeliveryRun.STATUS_COMPLETED:
        return []

    phase = normalize_phase(run.phase)
    actions: list[str] = ['append_address', 'reschedule', 'cancel']

    if phase == DeliveryRun.PHASE_CALLS:
        actions.extend(['call', 'hold', 'release', 'notes'])
        if all_stops_have_call_result(run):
            actions.append('set_phase:route')
    elif phase == DeliveryRun.PHASE_ROUTE:
        actions.extend(['call', 'hold', 'release', 'reorder', 'optimize', 'notes'])
        if confirmed_stops_qs(run).exists():
            actions.append('set_phase:load')
    elif phase == DeliveryRun.PHASE_LOAD:
        actions.extend(['load', 'secure', 'scan_verify', 'call', 'hold', 'release', 'notes'])
        actions.append('upload_truck_photo')
        if all_confirmed_loaded_and_secured(run) and truck_photo_count(run) >= 1:
            actions.append('begin_route')
        if all_stops_have_call_result(run):
            actions.append('set_phase:route')
    elif phase == DeliveryRun.PHASE_ACTIVE:
        actions.extend([
            'call',
            'hold',
            'release',
            'report_issue',
            'contact_present',
            'delivered',
            'complete',
            'upload_proof',
            'notes',
            'optimize',
        ])
    elif phase == DeliveryRun.PHASE_RETURN:
        actions.extend(['return_reconcile', 'notes'])
        if can_finish_run(run):
            actions.append('finish')
        if not run.returned_to_store_at:
            actions.insert(0, 'return_store')

    return actions


def next_action_for_run(run: DeliveryRun) -> str | None:
    """Primary recommended action for the unified day board."""
    if run.status == DeliveryRun.STATUS_COMPLETED:
        return None

    phase = normalize_phase(run.phase)
    stops = list(run.stops.all())

    if phase == DeliveryRun.PHASE_CALLS:
        if any(stop_needs_call_again(s) for s in stops if s.state not in EXCLUDED_ROUTE_STATES):
            return 'call'
        if all_stops_have_call_result(run):
            return 'set_phase:route'
        return 'call'

    if phase == DeliveryRun.PHASE_ROUTE:
        if not confirmed_stops_qs(run).exists():
            return 'call'
        return 'set_phase:load'

    if phase == DeliveryRun.PHASE_LOAD:
        if not all_stops_have_call_result(run):
            return 'call'
        if not all_confirmed_loaded_and_secured(run):
            return 'load'
        if truck_photo_count(run) < 1:
            return 'upload_truck_photo'
        return 'begin_route'

    if phase == DeliveryRun.PHASE_ACTIVE:
        if run.stops.filter(state=DeliveryRunStop.STATE_ON_HOLD).exists():
            return 'report_issue'
        next_up = run.stops.filter(state=DeliveryRunStop.STATE_NEXT_UP).first()
        if next_up:
            if not next_up.contact_present_at:
                return 'contact_present'
            if not next_up.delivered_at:
                return 'delivered'
            if not _stop_has_proof(next_up):
                return 'upload_proof'
            return 'complete'
        return 'return_store'

    if phase == DeliveryRun.PHASE_RETURN:
        if not run.returned_to_store_at:
            return 'return_store'
        if undelivered_stops_needing_reconcile(run):
            return 'return_reconcile'
        if can_finish_run(run):
            return 'finish'
        return None

    return None


def serialize_event(event: DeliveryRunEvent) -> dict[str, Any]:
    return {
        'id': event.id,
        'event_type': event.event_type,
        'created_at': event.created_at.isoformat(),
        'actor': _actor_label(event.actor),
        'stop_id': event.stop_id,
        'payload': event.payload or {},
    }
