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


class ScanMismatchError(ValueError):
    """Scanned code does not match the stop item SKU; includes DB lookup for the driver UI."""

    def __init__(
        self,
        *,
        scanned_code: str,
        expected_sku: str,
        expected_description: str,
        found: dict[str, Any],
    ):
        self.scanned_code = scanned_code
        self.expected_sku = expected_sku
        self.expected_description = expected_description
        self.found = found
        super().__init__(f'Scan does not match expected SKU {expected_sku}')

    def as_api_payload(self) -> dict[str, Any]:
        return {
            'detail': str(self),
            'code': 'SCAN_MISMATCH',
            'scanned_code': self.scanned_code,
            'expected_sku': self.expected_sku,
            'expected_description': self.expected_description,
            'found': self.found,
        }


def lookup_scanned_code(*, run: DeliveryRun, scanned_code: str) -> dict[str, Any]:
    """Identify a scanned SKU from this run's items, then inventory."""
    code = (scanned_code or '').strip()
    empty = {
        'source': 'unknown',
        'sku': code,
        'description': '',
        'stop_item_id': None,
        'stop_id': None,
        'customer_name': '',
        'inventory_item_id': None,
    }
    if not code:
        return empty

    match = (
        DeliveryRunStopItem.objects.filter(stop__run=run, sku__iexact=code)
        .select_related('stop__job')
        .order_by('id')
        .first()
    )
    if match:
        job = match.stop.job if match.stop_id else None
        return {
            'source': 'run_item',
            'sku': match.sku,
            'description': match.description or match.sku,
            'stop_item_id': match.id,
            'stop_id': match.stop_id,
            'customer_name': (job.customer_name if job else '') or '',
            'inventory_item_id': None,
        }

    from apps.inventory.models import Item

    inv = Item.objects.filter(sku__iexact=code).select_related('product').first()
    if inv:
        title = ''
        if inv.product_id:
            title = (getattr(inv.product, 'title', None) or '').strip()
        return {
            'source': 'inventory',
            'sku': inv.sku,
            'description': title or inv.sku,
            'stop_item_id': None,
            'stop_id': None,
            'customer_name': '',
            'inventory_item_id': inv.id,
        }

    return empty


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
    """Verified (or skip) + loaded. Truck photos are taken once at closeout, not per item."""
    return bool(item.loaded_at) and stop_item_is_verified(item)


def mark_item_loaded_when_verified(item: DeliveryRunStopItem, *, user) -> None:
    """After scan/skip completes verification, mark the line loaded in the same step."""
    if not stop_item_is_verified(item):
        return
    if item.loaded_at:
        return
    item.loaded_at = timezone.now()
    item.loaded_by = user
    item.save(update_fields=['loaded_at', 'loaded_by'])


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


def stop_is_out_of_load_pool(stop: DeliveryRunStop) -> bool:
    """Stops that are not part of truck loading (terminal / cancel / reschedule)."""
    if stop.state in (
        DeliveryRunStop.STATE_COMPLETED,
        DeliveryRunStop.STATE_FAILED,
        DeliveryRunStop.STATE_RESCHEDULED,
    ):
        return True
    disp = stop_disposition(stop)
    return disp in (
        DeliveryRunStop.DISPOSITION_CANCEL_REQUESTED,
        DeliveryRunStop.DISPOSITION_RESCHEDULE_REQUESTED,
    )


def truck_close_items_ok(run: DeliveryRun) -> tuple[bool, str]:
    """
    Truck seal gate for the load board:
    - at least one delivery fully on the truck
    - no partially loaded deliveries
    - unloaded / not-on-truck deliveries do not block seal
    """
    on_truck = 0
    for stop in run.stops.prefetch_related('stop_items__scans', 'stop_items__attachments'):
        if stop_is_out_of_load_pool(stop):
            continue
        items = list(stop.stop_items.all())
        if not items:
            continue
        ready_n = sum(1 for i in items if stop_item_is_ready(i))
        if ready_n == 0:
            continue
        if ready_n < len(items):
            return False, 'Finish or unload partially loaded deliveries before sealing the truck'
        on_truck += 1
    if on_truck == 0:
        return False, 'Load at least one delivery onto the truck before sealing'
    return True, ''


def all_candidate_items_ready(run: DeliveryRun) -> bool:
    """True when every load-pool stop is fully ready (nothing left off the truck)."""
    any_pool = False
    for stop in run.stops.prefetch_related('stop_items__scans', 'stop_items__attachments'):
        if stop_is_out_of_load_pool(stop):
            continue
        items = list(stop.stop_items.all())
        if not items:
            return False
        if not all(stop_item_is_ready(i) for i in items):
            return False
        any_pool = True
    return any_pool


def seal_window_photos_qs(run: DeliveryRun):
    """Truck photos that count for the current seal attempt.

    When the truck has been reopened, only photos taken at or after
    ``truck_reopened_at`` satisfy reseal. Full history remains on the run
    for desk/audit via unfiltered attachment queries.
    """
    qs = run.attachments.filter(kind=DeliveryAttachment.KIND_TRUCK)
    if run.truck_reopened_at:
        qs = qs.filter(created_at__gte=run.truck_reopened_at)
    return qs


def truck_is_closed(run: DeliveryRun) -> bool:
    return bool(run.truck_closed_at) and seal_window_photos_qs(run).exists()


def departure_gates_ok(run: DeliveryRun) -> tuple[bool, str]:
    if not all_candidate_stops_resolved(run):
        return False, 'Every stop must be confirmed, rescheduled/cancelled, or explicitly excluded'
    confirmed = [
        s
        for s in run.stops.select_related('job').all()
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
        ready_n = sum(1 for i in items if stop_item_is_ready(i))
        if items and ready_n == len(items):
            continue
        name = (getattr(stop.job, 'customer_name', None) or f'Stop {stop.id}').strip()
        name = name.replace('[TEST] ', '')
        if not items or ready_n == 0:
            return (
                False,
                f'{name} is confirmed but not on the truck — remove from route, or reopen the truck to load it',
            )
        return (
            False,
            f'{name} is only partially loaded — finish loading or unload before Start Deliveries',
        )
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
    was_confirmed = is_stop_confirmed(stop)
    stop.contact_disposition = disposition
    stop.contact_disposition_at = timezone.now()
    stop.contact_disposition_by = user
    # First-time confirm clears an "unconfirmed exclusion". Re-tapping Confirmed on a
    # stop that was deliberately taken off route must NOT force it back on.
    fields = [
        'contact_disposition',
        'contact_disposition_at',
        'contact_disposition_by',
        'updated_at',
    ]
    if (
        disposition == DeliveryRunStop.DISPOSITION_CONFIRMED
        and stop.excluded_unconfirmed_at
        and not was_confirmed
    ):
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
    refresh_route: bool = True,
) -> DeliveryRunStop:
    """Take a stop off the route plan (contact outcome is unchanged)."""
    reason = (reason or '').strip() or 'Taken off route'
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
    from apps.pos.services.delivery_run import apply_route_plan, ensure_next_up, log_event

    items = list(stop.stop_items.all())
    on_truck_count = sum(1 for i in items if stop_item_is_ready(i) or i.loaded_at)
    log_event(
        stop.run,
        'override',
        actor=user,
        stop=stop,
        payload={
            'excluded_unconfirmed': True,
            'off_route': True,
            'reason': reason[:120],
            'on_truck_item_count': on_truck_count,
            'unload_reminder': (
                f'Remember to unload {on_truck_count} item(s) when you get back'
                if on_truck_count
                else ''
            ),
        },
    )
    ensure_next_up(stop.run)
    if refresh_route:
        apply_route_plan(stop.run, user=user, optimize=False)
    return stop


@transaction.atomic
def clear_unconfirmed_exclusion(
    stop: DeliveryRunStop,
    *,
    user,
    refresh_route: bool = True,
) -> DeliveryRunStop:
    """Put an off-route stop back onto the route plan."""
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
    from apps.pos.services.delivery_run import apply_route_plan, ensure_next_up, log_event

    log_event(
        stop.run,
        'override',
        actor=user,
        stop=stop,
        payload={'excluded_unconfirmed': False, 'off_route': False},
    )
    ensure_next_up(stop.run)
    if refresh_route and is_stop_confirmed(stop):
        apply_route_plan(stop.run, user=user, optimize=False)
    return stop


@transaction.atomic
def scan_stop_item(
    item: DeliveryRunStopItem,
    *,
    user,
    scanned_code: str,
    client_scan_id: str | None = None,
    allow_mismatch: bool = False,
) -> DeliveryItemScan:
    assert_run_action(item.stop.run, 'scan_verify', user)
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
            mark_item_loaded_when_verified(item, user=user)
            mirror_stop_load_state(item.stop)
            return last
    mismatch_override = False
    if item.is_scannable and item.sku:
        if code.upper() != item.sku.strip().upper():
            if not allow_mismatch:
                found = lookup_scanned_code(run=item.stop.run, scanned_code=code)
                raise ScanMismatchError(
                    scanned_code=code[:64],
                    expected_sku=item.sku,
                    expected_description=item.description or item.sku,
                    found=found,
                )
            mismatch_override = True
    scan = DeliveryItemScan.objects.create(
        stop_item=item,
        scanned_code=code[:64],
        client_scan_id=cid,
        scanned_by=user,
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        item.stop.run,
        'load' if not mismatch_override else 'override',
        actor=user,
        stop=item.stop,
        payload={
            'stop_item_id': item.id,
            'scanned_code': code[:64],
            'client_scan_id': str(cid) if cid else None,
            'expected_sku': item.sku or '',
            'mismatch_override': mismatch_override,
            'reason': (
                f'Driver confirmed scanned {code[:64]} is the correct ID for expected {item.sku}'
                if mismatch_override
                else None
            ),
        },
    )
    mark_item_loaded_when_verified(item, user=user)
    mirror_stop_load_state(item.stop)
    return scan


@transaction.atomic
def skip_stop_item_verification(
    item: DeliveryRunStopItem,
    *,
    user,
    reason: str,
) -> DeliveryRunStopItem:
    assert_run_action(item.stop.run, 'skip_verification', user)
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
    mark_item_loaded_when_verified(item, user=user)
    mirror_stop_load_state(item.stop)
    return item


@transaction.atomic
def set_stop_item_loaded(
    item: DeliveryRunStopItem,
    *,
    user,
    loaded: bool = True,
    reason: str = '',
) -> DeliveryRunStopItem:
    assert_run_action(item.stop.run, 'load', user)
    item.loaded_at = timezone.now() if loaded else None
    item.loaded_by = user if loaded else None
    item.save(update_fields=['loaded_at', 'loaded_by'])
    from apps.pos.services.delivery_run import log_event

    note = (reason or '').strip()
    log_event(
        item.stop.run,
        'load' if loaded else 'override',
        actor=user,
        stop=item.stop,
        payload={
            'stop_item_id': item.id,
            'loaded': loaded,
            'reason': note[:120] if note else None,
        },
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
    # Prefer actionable load/photo errors over a generic phase denial when the
    # client enables Seal ahead of allowed_actions refresh.
    if not seal_window_photos_qs(run).exists():
        if run.truck_reopened_at:
            raise ValueError('Capture a new closed-door truck photo before resealing the truck')
        raise ValueError('Capture a closed-door truck photo before closing the truck')
    items_ok, items_msg = truck_close_items_ok(run)
    if not items_ok and not run.departure_override:
        raise ValueError(items_msg)
    try:
        assert_run_action(run, 'close_truck', user)
    except RunActionDenied as exc:
        raise ValueError(str(exc)) from exc
    run.truck_closed_at = timezone.now()
    run.truck_closed_by = user
    run.phase = DeliveryRun.PHASE_TRUCK
    run.save(update_fields=['truck_closed_at', 'truck_closed_by', 'phase', 'updated_at'])
    from apps.pos.services.delivery_run import log_event

    log_event(run, 'phase', actor=user, payload={'phase': run.phase, 'truck_closed': True})
    return run


@transaction.atomic
def reopen_truck(run: DeliveryRun, *, user, reason: str = '') -> DeliveryRun:
    """Unseal the truck so the driver can load more before departure.

    Rolls phase back to ``truck``, clears the seal and any manager departure
    override, and starts a new seal window (fresh photo required to reseal).
    Route order and already-loaded items are left untouched.
    """
    if not run.truck_closed_at:
        raise ValueError('Truck is not sealed')
    try:
        assert_run_action(run, 'reopen_truck', user)
    except RunActionDenied as exc:
        raise ValueError(str(exc)) from exc
    had_override = bool(run.departure_override)
    run.phase = DeliveryRun.PHASE_TRUCK
    run.truck_closed_at = None
    run.truck_closed_by = None
    run.truck_reopened_at = timezone.now()
    run.truck_reopened_by = user
    run.departure_override = False
    run.departure_override_reason = ''
    run.departure_override_by = None
    run.save(
        update_fields=[
            'phase',
            'truck_closed_at',
            'truck_closed_by',
            'truck_reopened_at',
            'truck_reopened_by',
            'departure_override',
            'departure_override_reason',
            'departure_override_by',
            'updated_at',
        ]
    )
    from apps.pos.services.delivery_run import log_event

    log_event(
        run,
        'phase',
        actor=user,
        payload={
            'reopened_truck': True,
            'reason': (reason or '')[:120],
            'cleared_departure_override': had_override,
        },
    )
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
    items = []
    for stop in run.stops.prefetch_related('stop_items__scans', 'stop_items__attachments'):
        if stop_is_out_of_load_pool(stop):
            continue
        items.extend(list(stop.stop_items.all()))
    total = len(items)
    verified = sum(1 for i in items if stop_item_is_verified(i))
    loaded = sum(1 for i in items if i.loaded_at)
    photographed = sum(1 for i in items if stop_item_has_photo(i))
    ready = sum(1 for i in items if stop_item_is_ready(i))
    can_close, _ = truck_close_items_ok(run)
    return {
        'total_items': total,
        'verified': verified,
        'loaded': loaded,
        'photographed': photographed,
        'ready': ready,
        'all_ready': total > 0 and ready == total,
        'can_close_truck': can_close,
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
