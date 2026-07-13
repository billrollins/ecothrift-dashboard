"""TARS bench workflow — timer, hold/pending, queue, disposition."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone

from apps.inventory.models import (
    RestorationJob,
    RestorationPartsOrder,
    RestorationPartsOrderLine,
    RestorationPartsRequest,
    RestorationPartsRequestLine,
    RestorationPartsRequestSite,
)

PENDING_REASONS = {
    'parts_needed': 'Parts needed',
    'need_more_time': 'Need more time',
    'pending_test': 'Pending test',
    'repair_time_needed': 'Repair time needed',
    'tools_needed': 'Tools needed',
    'needs_approval': 'Needs approval',
    'research_sop': 'Research / SOP',
    'safety_hold': 'Safety hold',
    'between_steps': 'Between steps',
    'other': 'Other',
}


def elapsed_active_seconds(job: RestorationJob) -> int:
    extra = 0
    if job.timer_is_running and job.timer_started_at:
        # Clamp against clock skew — a timer_started_at in the future must not
        # subtract from the accumulated total.
        extra = max(int((timezone.now() - job.timer_started_at).total_seconds()), 0)
    return int(job.active_seconds or 0) + extra


def elapsed_active_hours(job: RestorationJob) -> Decimal:
    return Decimal(elapsed_active_seconds(job)) / Decimal('3600')


def _sync_work_state(job: RestorationJob, work_state: str) -> None:
    session = dict(job.work_session or {})
    session['workState'] = work_state
    job.work_session = session


def _timer_save_fields() -> list[str]:
    return ['active_seconds', 'timer_is_running', 'timer_started_at', 'timer_started_by', 'updated_at']


def _pause_timer(job: RestorationJob) -> None:
    if job.timer_is_running and job.timer_started_at:
        job.active_seconds = elapsed_active_seconds(job)
    job.timer_is_running = False


def _pause_other_running_timers(*, user, exclude_job_id: int | None = None) -> None:
    """Pause any other running restoration timer owned by this user."""

    if user is None:
        return
    qs = RestorationJob.objects.select_for_update().filter(
        timer_is_running=True,
        timer_started_by=user,
    )
    if exclude_job_id is not None:
        qs = qs.exclude(pk=exclude_job_id)
    for other in qs:
        _pause_timer(other)
        other.save(update_fields=_timer_save_fields())


def _start_timer(job: RestorationJob, user=None) -> None:
    _pause_other_running_timers(user=user, exclude_job_id=job.pk)
    if not job.timer_is_running:
        job.timer_started_at = timezone.now()
        job.timer_is_running = True
    if user is not None:
        job.timer_started_by = user


@transaction.atomic
def pause_running_restoration_timer_for_user(user, reason: str = '') -> RestorationJob | None:
    """Pause the user's active restoration timer (e.g. HR break or clock-out)."""

    if user is None:
        return None
    job = (
        RestorationJob.objects.select_for_update()
        .filter(timer_is_running=True, timer_started_by=user)
        .order_by('-timer_started_at')
        .first()
    )
    if job is None:
        return None
    _pause_timer(job)
    job.save(update_fields=_timer_save_fields())
    return job


@transaction.atomic
def check_in_restoration_job(
    job: RestorationJob,
    user=None,
    item_id: int | None = None,
    *,
    start_timer: bool = True,
) -> RestorationJob:
    from apps.inventory.services.restoration import restoration_job_needs_setup, split_restoration_job

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)

    if job.stage not in (
        RestorationJob.STAGE_QUEUED,
        RestorationJob.STAGE_SENT,
        RestorationJob.STAGE_PENDING,
    ):
        raise ValueError('Only queued, sent, or pending jobs can be checked in to the bench.')
    if restoration_job_needs_setup(job):
        raise ValueError('Enter a value for every grade before starting work on the bench.')
    if job.quantity > 1:
        if item_id is None:
            raise ValueError('Scan the item tag or select a single item from this stack to check in.')
        item_pk = int(item_id)
        if not job.item_check_in.items.filter(pk=item_pk).exists():
            raise ValueError('Item is not part of this restoration stack.')
        result = split_restoration_job(job, groups=[[item_pk]], user=user)
        if not result['created_jobs']:
            raise ValueError('Could not split item from stack for check-in.')
        job = RestorationJob.objects.select_for_update().get(pk=result['created_jobs'][0].pk)
    now = timezone.now()
    if not job.bench_started_at:
        job.bench_started_at = now
    job.stage = RestorationJob.STAGE_BENCH
    job.pending_reason = ''
    job.pending_notes = ''
    job.pending_storage_location = ''
    job.pending_started_at = None
    if start_timer:
        _start_timer(job, user=user)
    _sync_work_state(job, 'bench')
    job.save(
        update_fields=[
            'stage',
            'bench_started_at',
            'timer_started_at',
            'timer_is_running',
            'timer_started_by',
            'active_seconds',
            'pending_reason',
            'pending_notes',
            'pending_storage_location',
            'pending_started_at',
            'work_session',
            'updated_at',
        ],
    )
    return job


@transaction.atomic
def move_restoration_job_back_to_queue(job: RestorationJob) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_BENCH, RestorationJob.STAGE_PENDING):
        raise ValueError('Only bench or pending jobs can move back to queue.')
    _pause_timer(job)
    job.stage = RestorationJob.STAGE_SENT
    job.pending_reason = ''
    job.pending_notes = ''
    job.pending_storage_location = ''
    job.pending_started_at = None
    _sync_work_state(job, 'queue')
    job.save(
        update_fields=[
            'stage',
            *_timer_save_fields(),
            'pending_reason',
            'pending_notes',
            'pending_storage_location',
            'pending_started_at',
            'work_session',
        ],
    )
    return job


@transaction.atomic
def hold_restoration_job(
    job: RestorationJob,
    *,
    reason: str,
    notes: str = '',
    storage_location: str = '',
) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage != RestorationJob.STAGE_BENCH:
        raise ValueError('Only bench jobs can be placed on hold.')
    if reason not in PENDING_REASONS:
        raise ValueError('Invalid hold reason.')
    _pause_timer(job)
    now = timezone.now()
    job.stage = RestorationJob.STAGE_PENDING
    job.pending_reason = reason
    job.pending_notes = notes or ''
    job.pending_storage_location = storage_location or ''
    job.pending_started_at = now
    session = dict(job.work_session or {})
    session['workState'] = 'pending'
    session['pending'] = {
        'reason': reason,
        'notes': notes or '',
        'storageLocation': storage_location or '',
        'pendingStartedAt': now.isoformat(),
    }
    job.work_session = session
    job.save(
        update_fields=[
            'stage',
            *_timer_save_fields(),
            'pending_reason',
            'pending_notes',
            'pending_storage_location',
            'pending_started_at',
            'work_session',
        ],
    )
    return job


@transaction.atomic
def start_restoration_timer(job: RestorationJob, user=None) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_BENCH, RestorationJob.STAGE_PENDING):
        raise ValueError('Timer can only run on bench or pending jobs.')
    _start_timer(job, user=user)
    job.save(update_fields=['timer_started_at', 'timer_is_running', 'timer_started_by', 'updated_at'])
    return job


@transaction.atomic
def pause_restoration_timer(job: RestorationJob) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    _pause_timer(job)
    job.save(update_fields=_timer_save_fields())
    return job


@transaction.atomic
def adjust_restoration_timer(job: RestorationJob, *, active_seconds: int) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_BENCH, RestorationJob.STAGE_PENDING):
        raise ValueError('Timer can only be adjusted on bench or pending jobs.')
    job.active_seconds = max(int(active_seconds), 0)
    if job.timer_is_running:
        job.timer_started_at = timezone.now()
    job.save(update_fields=_timer_save_fields())
    return job


def _actual_parts_cost_for_job(job: RestorationJob) -> Decimal:
    """Sum of ordered/received line costs (qty x actual unit price) across the
    job's parts requests — the default spend when the payload omits it."""

    total = Decimal('0')
    lines = RestorationPartsRequestLine.objects.filter(
        site__parts_request__job=job,
        status__in=[
            RestorationPartsRequestLine.STATUS_ORDERED,
            RestorationPartsRequestLine.STATUS_RECEIVED,
        ],
    )
    for line in lines:
        total += (line.unit_price_actual or Decimal('0')) * line.qty
    return total


@transaction.atomic
def complete_restoration_job(
    job: RestorationJob,
    *,
    destination: str,
    final_grade: str,
    notes: str = '',
    spent_hours: Decimal | float | None = None,
    spent_parts_cost: Decimal | float | None = None,
    user=None,
) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_BENCH, RestorationJob.STAGE_PENDING):
        raise ValueError('Only bench or pending jobs can be completed.')
    valid = {c[0] for c in RestorationJob.BENCH_DISPOSITION_CHOICES}
    if destination not in valid:
        raise ValueError('Invalid disposition destination.')
    if not final_grade:
        raise ValueError('Final grade is required.')
    if job.scale:
        from apps.inventory.services.restoration import grades_for_scale

        if final_grade not in grades_for_scale(job.scale):
            raise ValueError('Choose a final grade from the job grade scale.')
    from apps.inventory.services.tars_decision_work import (
        DecisionWorkValidationError,
        validate_job_completion,
    )

    try:
        validate_job_completion(
            job,
            final_grade=final_grade,
            destination=destination,
        )
    except DecisionWorkValidationError as exc:
        raise ValueError(str(exc)) from exc
    if spent_parts_cost is None:
        spent_parts_cost = _actual_parts_cost_for_job(job)

    _pause_timer(job)
    now = timezone.now()
    default_hours = elapsed_active_hours(job)
    job.stage = RestorationJob.STAGE_DONE
    job.bench_disposition = destination
    job.final_grade = final_grade
    job.disposition_notes = notes or ''
    job.spent_hours = Decimal(str(spent_hours if spent_hours is not None else default_hours))
    job.spent_parts_cost = Decimal(str(spent_parts_cost))
    job.dispositioned_at = now
    job.dispositioned_by = user
    _sync_work_state(job, 'done')
    session = dict(job.work_session or {})
    session['selectedGrade'] = final_grade
    decision = session.get('decisionWork')
    if isinstance(decision, dict):
        selection = dict(decision.get('selection') or {})
        selection['grade'] = final_grade
        decision = dict(decision)
        decision['selection'] = selection
        timestamps = dict(decision.get('timestamps') or {})
        timestamps['completedAt'] = now.isoformat()
        timestamps['updatedAt'] = now.isoformat()
        if user is not None and getattr(user, 'is_authenticated', False):
            timestamps['updatedById'] = getattr(user, 'pk', None)
        decision['timestamps'] = timestamps
        session['decisionWork'] = decision
    job.work_session = session
    job.save(
        update_fields=[
            'stage',
            *_timer_save_fields(),
            'bench_disposition',
            'final_grade',
            'disposition_notes',
            'spent_hours',
            'spent_parts_cost',
            'dispositioned_at',
            'dispositioned_by',
            'work_session',
        ],
    )
    _move_items_for_disposition(
        job,
        destination=destination,
        final_grade=final_grade,
        notes=notes or '',
        user=user,
    )
    return job


# Bench disposition destinations -> Item.location values.
_DISPOSITION_LOCATION = {
    RestorationJob.BENCH_DISPOSITION_PROCESSING: 'processing',
    RestorationJob.BENCH_DISPOSITION_STORAGE: 'back_storage',
    RestorationJob.BENCH_DISPOSITION_SALVAGE: 'salvage',
    RestorationJob.BENCH_DISPOSITION_ONLINE_SALES: 'online_sales',
}


def _move_items_for_disposition(
    job: RestorationJob,
    *,
    destination: str,
    final_grade: str,
    notes: str,
    user,
) -> None:
    """Move the job's items to the disposition location and, for Processing,
    record the achieved grade on the check-in snapshot so Processing can retag."""
    from apps.inventory.models import ItemCheckIn, ItemHistory

    new_location = _DISPOSITION_LOCATION.get(destination)
    if not new_location or not job.item_check_in_id:
        return

    check_in = ItemCheckIn.objects.select_for_update().get(pk=job.item_check_in_id)

    if destination == RestorationJob.BENCH_DISPOSITION_PROCESSING:
        snapshot = dict(check_in.defaults_snapshot or {})
        snapshot['dispatch'] = 'processing'
        snapshot['location'] = 'processing'
        snapshot['restoration_return_disposition_type'] = RestorationJob.RETURN_DISPOSITION_TARS_COMPLETED
        snapshot['restoration_return_reason'] = ''
        snapshot['restoration_return_scale'] = job.scale or ''
        snapshot['restoration_return_grade'] = final_grade
        snapshot['restoration_return_notes'] = notes
        check_in.defaults_snapshot = snapshot
        check_in.save(update_fields=['defaults_snapshot', 'updated_at'])

    histories: list[ItemHistory] = []
    for item in check_in.items.select_for_update().all():
        if item.status == 'sold' or item.sold_at:
            continue
        old_location = item.location or ''
        if old_location == new_location:
            continue
        item.location = new_location
        item.save(update_fields=['location', 'updated_at'])
        histories.append(
            ItemHistory(
                item=item,
                event_type='location_change',
                old_value=old_location,
                new_value=new_location,
                note=f'TARS disposition to {destination} (grade {final_grade})',
                created_by=user,
            ),
        )
    if histories:
        ItemHistory.objects.bulk_create(histories)

    if destination == RestorationJob.BENCH_DISPOSITION_PROCESSING:
        from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm

        refresh_processing_rows_denorm(job.purchase_order_id)


def timer_state_payload(job: RestorationJob) -> dict:
    return {
        'bench_started_at': job.bench_started_at,
        'timer_started_at': job.timer_started_at,
        'active_seconds': job.active_seconds,
        'timer_is_running': job.timer_is_running,
        'timer_started_by_id': job.timer_started_by_id,
        'elapsed_seconds': elapsed_active_seconds(job),
        'elapsed_hours': str(elapsed_active_hours(job).quantize(Decimal('0.01'))),
    }


def _parse_line_qty(value, *, field: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f'Invalid {field}: {value!r} is not a whole number.') from exc


def _parse_line_price(value, *, field: str) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError(f'Invalid {field}: {value!r} is not a number.') from exc


def _truncate_for_field(model, field_name: str, value) -> str:
    text = str(value or '')
    max_length = model._meta.get_field(field_name).max_length
    return text[:max_length] if max_length else text


@transaction.atomic
def upsert_parts_request_from_work_session(
    job: RestorationJob,
    *,
    user,
    grade: str | None = None,
    eval_snapshot: dict | None = None,
) -> RestorationPartsRequest:
    """Bundle the orders attached to a single grade option into one purchasing request.

    A request always carries a grade option so the owner knows what the spend is for.
    """

    session = job.work_session or {}
    selected_grade = str(grade or session.get('selectedGrade') or job.final_grade or '').strip()
    if not selected_grade:
        raise ValueError('Select a grade option before requesting parts.')

    snapshot = eval_snapshot if eval_snapshot is not None else session.get('evalSnapshot') or {}

    parts_by_id = {
        p.get('id'): p for p in (session.get('parts') or []) if isinstance(p, dict) and p.get('id')
    }
    orders = [o for o in (session.get('orders') or []) if isinstance(o, dict)]
    order_by_id = {o.get('id'): o for o in orders}
    grade_plans = session.get('gradePlans') or {}
    plan = grade_plans.get(selected_grade) or {}
    order_ids = [oid for oid in (plan.get('orderIds') or []) if oid in order_by_id]

    request = (
        RestorationPartsRequest.objects.filter(
            job=job,
            status__in=[
                RestorationPartsRequest.STATUS_DRAFT,
                RestorationPartsRequest.STATUS_SUBMITTED,
            ],
        )
        .order_by('-updated_at')
        .first()
    )
    if request is None:
        request = RestorationPartsRequest.objects.create(
            job=job,
            status=RestorationPartsRequest.STATUS_DRAFT,
            selected_grade=selected_grade,
            eval_snapshot=snapshot,
            requested_by=user,
        )
    else:
        request.selected_grade = selected_grade
        request.eval_snapshot = snapshot
        request.save(update_fields=['selected_grade', 'eval_snapshot', 'updated_at'])

    # Clear and rebuild sites/lines from the orders attached to the selected grade.
    request.sites.all().delete()
    site_map: dict[str, RestorationPartsRequestSite] = {}

    for order_id in order_ids:
        order = order_by_id.get(order_id)
        if not isinstance(order, dict):
            continue
        supplier = str(order.get('supplierName') or '').strip() or 'Unassigned'
        supplier = _truncate_for_field(RestorationPartsRequestSite, 'supplier_name', supplier)
        site = site_map.get(supplier)
        if site is None:
            site = RestorationPartsRequestSite.objects.create(
                parts_request=request,
                supplier_name=supplier,
                sort_order=len(site_map),
            )
            site_map[supplier] = site
        overrides = order.get('partQtyOverrides') or {}
        if not isinstance(overrides, dict):
            overrides = {}
        for part_id in order.get('partIds') or []:
            part = parts_by_id.get(part_id)
            if not isinstance(part, dict):
                continue
            override_qty = overrides.get(part_id)
            if override_qty not in (None, 0):
                qty = _parse_line_qty(override_qty, field='part quantity override')
            else:
                qty = _parse_line_qty(part.get('qty') or 1, field='part quantity')
            RestorationPartsRequestLine.objects.create(
                site=site,
                part_number=_truncate_for_field(
                    RestorationPartsRequestLine, 'part_number', part.get('partNumber'),
                ),
                description=_truncate_for_field(
                    RestorationPartsRequestLine, 'description', part.get('description'),
                ),
                url=_truncate_for_field(RestorationPartsRequestLine, 'url', part.get('url')),
                qty=max(qty, 1),
                unit_price_estimate=_parse_line_price(
                    part.get('unitPriceEstimate') or 0, field='part price estimate',
                ),
                unit_price_actual=_parse_line_price(
                    part.get('unitPriceActual') or 0, field='part actual price',
                ),
                status=_truncate_for_field(
                    RestorationPartsRequestLine,
                    'status',
                    part.get('status') or RestorationPartsRequestLine.STATUS_PLANNED,
                ),
                linked_grade=_truncate_for_field(
                    RestorationPartsRequestLine, 'linked_grade', selected_grade,
                ),
            )

    return request


@transaction.atomic
def submit_parts_request(request: RestorationPartsRequest) -> RestorationPartsRequest:
    if request.status != RestorationPartsRequest.STATUS_DRAFT:
        raise ValueError(
            f'Request cannot be submitted — it is already {request.get_status_display().lower()}.',
        )
    request.status = RestorationPartsRequest.STATUS_SUBMITTED
    request.save(update_fields=['status', 'updated_at'])
    return request


@transaction.atomic
def record_parts_order(
    request: RestorationPartsRequest,
    *,
    site_id: int | None,
    po_number: str,
    supplier_name: str,
    subtotal: Decimal | float,
    shipping: Decimal | float,
    tax: Decimal | float,
    fees: Decimal | float,
    ship_to_address: str = '',
    expected_delivery=None,
    line_ids: list[int] | None = None,
    notes: str = '',
    supplier_url: str = '',
    lines: list[dict] | None = None,
) -> RestorationPartsOrder:
    if request.status in (
        RestorationPartsRequest.STATUS_RECEIVED,
        RestorationPartsRequest.STATUS_CANCELLED,
    ):
        raise ValueError(
            f'Cannot record an order on a {request.get_status_display().lower()} parts request.',
        )
    site = None
    if site_id:
        site = request.sites.filter(pk=site_id).first()
    elif not line_ids and request.sites.count() > 1:
        raise ValueError(
            'This parts request spans multiple supplier sites — specify site_id or line_ids '
            'so the order is recorded against the right lines.',
        )
    sub = Decimal(str(subtotal))
    ship = Decimal(str(shipping))
    tax_amt = Decimal(str(tax))
    fee_amt = Decimal(str(fees))
    total = sub + ship + tax_amt + fee_amt
    order = RestorationPartsOrder.objects.create(
        parts_request=request,
        site=site,
        po_number=po_number,
        supplier_name=supplier_name or (site.supplier_name if site else ''),
        supplier_url=supplier_url or '',
        subtotal=sub,
        shipping=ship,
        tax=tax_amt,
        fees=fee_amt,
        total=total,
        ship_to_address=ship_to_address,
        expected_delivery=expected_delivery,
        ordered_at=timezone.now(),
        notes=notes,
        status=RestorationPartsOrder.STATUS_ORDERED,
    )
    line_costs: dict[int, Decimal] = {}
    for entry in lines or []:
        try:
            lid = int(entry.get('id'))
        except (TypeError, ValueError):
            continue
        try:
            cost = Decimal(str(entry.get('unit_cost')))
        except Exception:
            cost = Decimal('0')
        if cost > 0:
            line_costs[lid] = cost
    lines_qs = RestorationPartsRequestLine.objects.filter(site__parts_request=request).exclude(
        status=RestorationPartsRequestLine.STATUS_SKIPPED,
    )
    if site:
        lines_qs = lines_qs.filter(site=site)
    if line_ids:
        lines_qs = lines_qs.filter(pk__in=line_ids)
    for line in lines_qs:
        unit = line_costs.get(line.id) or line.unit_price_actual or line.unit_price_estimate
        RestorationPartsOrderLine.objects.create(
            order=order,
            request_line=line,
            qty=line.qty,
            unit_cost=unit,
            line_total=unit * line.qty,
        )
        line.status = RestorationPartsRequestLine.STATUS_ORDERED
        line.unit_price_actual = unit
        line.save(update_fields=['status', 'unit_price_actual'])
    request.status = RestorationPartsRequest.STATUS_ORDERED
    request.save(update_fields=['status', 'updated_at'])
    return order


@transaction.atomic
def receive_parts_request(request: RestorationPartsRequest) -> RestorationPartsRequest:
    """Tech marks an approved/ordered request as received — archives it to the Received tab."""

    if request.status != RestorationPartsRequest.STATUS_ORDERED:
        raise ValueError('Only ordered requests can be marked received.')
    request.status = RestorationPartsRequest.STATUS_RECEIVED
    request.save(update_fields=['status', 'updated_at'])
    request.orders.exclude(status=RestorationPartsOrder.STATUS_RECEIVED).update(
        status=RestorationPartsOrder.STATUS_RECEIVED,
    )
    RestorationPartsRequestLine.objects.filter(site__parts_request=request).exclude(
        status=RestorationPartsRequestLine.STATUS_SKIPPED,
    ).update(
        status=RestorationPartsRequestLine.STATUS_RECEIVED,
    )

    # Signal the bench: if the job is parked in Pending waiting on these parts,
    # flag it so the workstation shows "parts in — ready to finish".
    if request.job_id:
        job = RestorationJob.objects.select_for_update().get(pk=request.job_id)
        if job.stage == RestorationJob.STAGE_PENDING:
            session = dict(job.work_session or {})
            pending = dict(session.get('pending') or {})
            pending['partsReceived'] = True
            pending['partsReceivedAt'] = timezone.now().isoformat()
            session['pending'] = pending
            job.work_session = session
            job.save(update_fields=['work_session', 'updated_at'])

    return request
