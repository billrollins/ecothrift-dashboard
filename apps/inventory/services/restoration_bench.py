"""TARS bench workflow — timer, hold/pending, queue, disposition."""

from __future__ import annotations

from decimal import Decimal

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
        extra = int((timezone.now() - job.timer_started_at).total_seconds())
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

    _pause_timer(job)
    now = timezone.now()
    default_hours = elapsed_active_hours(job)
    job.stage = RestorationJob.STAGE_DONE
    job.bench_disposition = destination
    job.final_grade = final_grade
    job.disposition_notes = notes or ''
    job.spent_hours = Decimal(str(spent_hours if spent_hours is not None else default_hours))
    job.spent_parts_cost = Decimal(str(spent_parts_cost if spent_parts_cost is not None else 0))
    job.dispositioned_at = now
    job.dispositioned_by = user
    _sync_work_state(job, 'done')
    session = dict(job.work_session or {})
    session['selectedGrade'] = final_grade
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
    return job


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


@transaction.atomic
def upsert_parts_request_from_work_session(
    job: RestorationJob,
    *,
    user,
    eval_snapshot: dict | None = None,
) -> RestorationPartsRequest:
    session = job.work_session or {}
    selected_grade = str(session.get('selectedGrade') or job.final_grade or '')
    snapshot = eval_snapshot if eval_snapshot is not None else session.get('evalSnapshot') or {}

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

    # Clear and rebuild sites/lines from repair actions in work_session.
    request.sites.all().delete()
    site_map: dict[str, RestorationPartsRequestSite] = {}
    procurement_groups = session.get('procurementGroups') or []
    group_by_id = {g.get('id'): g for g in procurement_groups if isinstance(g, dict)}

    for action in session.get('actions') or []:
        if not isinstance(action, dict) or action.get('type') != 'repair':
            continue
        for option in action.get('options') or []:
            if not isinstance(option, dict):
                continue
            for part in option.get('parts') or []:
                if not isinstance(part, dict):
                    continue
                group_id = part.get('procurementGroupId')
                group = group_by_id.get(group_id) if group_id else None
                supplier = (group or {}).get('supplierName') or 'Unassigned'
                site = site_map.get(supplier)
                if site is None:
                    site = RestorationPartsRequestSite.objects.create(
                        parts_request=request,
                        supplier_name=supplier,
                        sort_order=len(site_map),
                    )
                    site_map[supplier] = site
                RestorationPartsRequestLine.objects.create(
                    site=site,
                    part_number=str(part.get('partNumber') or ''),
                    description=str(part.get('description') or ''),
                    url=str(part.get('url') or ''),
                    qty=int(part.get('qty') or 1),
                    unit_price_estimate=Decimal(str(part.get('unitPriceEstimate') or 0)),
                    unit_price_actual=Decimal(str(part.get('unitPriceActual') or 0)),
                    status=str(part.get('status') or RestorationPartsRequestLine.STATUS_PLANNED),
                    linked_grade=str(action.get('linkedGrade') or selected_grade),
                )

    return request


@transaction.atomic
def submit_parts_request(request: RestorationPartsRequest) -> RestorationPartsRequest:
    if request.status not in (
        RestorationPartsRequest.STATUS_DRAFT,
        RestorationPartsRequest.STATUS_SUBMITTED,
    ):
        raise ValueError('Request cannot be submitted in its current status.')
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
) -> RestorationPartsOrder:
    site = None
    if site_id:
        site = request.sites.filter(pk=site_id).first()
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
    lines_qs = RestorationPartsRequestLine.objects.filter(site__parts_request=request)
    if site:
        lines_qs = lines_qs.filter(site=site)
    if line_ids:
        lines_qs = lines_qs.filter(pk__in=line_ids)
    for line in lines_qs:
        unit = line.unit_price_actual or line.unit_price_estimate
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
