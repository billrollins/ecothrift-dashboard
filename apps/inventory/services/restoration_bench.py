"""TARS bench workflow â€” timer, hold/pending, queue, disposition."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from uuid import UUID, uuid4

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.inventory.models import RestorationAction, RestorationJob
from apps.inventory.services.tars_purchase import (
    LEGACY_HOLD_REASONS,
    WAIT_KEYS,
    derive_hold_label,
    hold_has_substance,
    hold_story,
    normalize_purchase_section,
    pending_from_legacy_reason,
)

PENDING_REASONS = LEGACY_HOLD_REASONS


class BenchOccupiedError(ValueError):
    def __init__(self, job: RestorationJob):
        self.job_id = job.pk
        self.job_sku = (
            job.item_check_in.items.order_by('id').values_list('sku', flat=True).first()
            if job.item_check_in_id
            else ''
        )
        super().__init__(
            f'Your bench already has {self.job_sku or f"job {job.pk}"}. '
            'Move it to Pending, Inbox, Processing, or finish it before checking in another item.'
        )


def _timeline_event(
    job: RestorationJob,
    event_type: str,
    payload: dict | None = None,
    *,
    actor=None,
    entity_id: str = '',
    correlation_id: UUID | None = None,
):
    from apps.inventory.services.restoration_timeline import append_timeline_event

    return append_timeline_event(
        job,
        event_type,
        payload or {},
        actor=actor,
        entity_id=entity_id,
        correlation_id=correlation_id,
    )


def elapsed_active_seconds(job: RestorationJob) -> int:
    extra = 0
    if job.timer_is_running and job.timer_started_at:
        # Clamp against clock skew â€” a timer_started_at in the future must not
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
    return [
        'active_seconds',
        'timer_is_running',
        'timer_started_at',
        'timer_started_by',
        'timer_mode',
        'timer_grade',
        'look_seconds',
        'work_seconds',
        'current_action',
        'updated_at',
    ]


def _accrue_to_action(job: RestorationJob, seconds: int) -> None:
    """Bank newly elapsed seconds against the action the clock is attached to.

    The action carries the *why*; the job's buckets carry the totals. Both are
    written from the same delta so a report built on either agrees with the
    other.
    """

    if seconds <= 0 or job.current_action_id is None:
        return
    RestorationAction.objects.filter(pk=job.current_action_id).update(
        seconds=F('seconds') + seconds,
        updated_at=timezone.now(),
    )


def _accrue_to_mode(job: RestorationJob, seconds: int) -> None:
    """Route newly elapsed seconds to looking or working.

    Investigation is charged to the item and performance to a grade, so the two
    buckets together must always account for active_seconds.
    """

    if seconds <= 0:
        return
    if job.timer_mode == RestorationJob.TIMER_MODE_WORK:
        job.work_seconds = int(job.work_seconds or 0) + seconds
    else:
        job.look_seconds = int(job.look_seconds or 0) + seconds


def _reconcile_attribution(job: RestorationJob) -> None:
    """Restore `look + work == active_seconds` after a manual total adjustment.

    A correction to the total says nothing about which bucket was wrong, so the
    difference lands on whatever the clock is currently attributing to, and any
    shortfall is taken from the other bucket rather than left inconsistent.
    """

    total = int(job.active_seconds or 0)
    look = max(int(job.look_seconds or 0), 0)
    work = max(int(job.work_seconds or 0), 0)
    drift = total - (look + work)
    if drift == 0:
        job.look_seconds, job.work_seconds = look, work
        return

    working = job.timer_mode == RestorationJob.TIMER_MODE_WORK
    primary, other = (work, look) if working else (look, work)
    primary += drift
    if primary < 0:
        other = max(other + primary, 0)
        primary = 0
    if working:
        job.work_seconds, job.look_seconds = primary, other
    else:
        job.look_seconds, job.work_seconds = primary, other


def _pause_timer(job: RestorationJob) -> None:
    if job.timer_is_running and job.timer_started_at:
        before = int(job.active_seconds or 0)
        job.active_seconds = elapsed_active_seconds(job)
        delta = job.active_seconds - before
        _accrue_to_mode(job, delta)
        _accrue_to_action(job, delta)
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
        before = elapsed_active_seconds(other)
        _pause_timer(other)
        other.save(update_fields=_timer_save_fields())
        _timeline_event(
            other,
            'timer.paused',
            {
                'active_seconds': other.active_seconds,
                'previous_elapsed_seconds': before,
                'reason': 'timer_switched',
            },
            actor=user,
            entity_id=f'timer:{other.pk}',
        )


def _start_timer(
    job: RestorationJob,
    user=None,
    *,
    mode: str | None = None,
    grade: str | None = None,
) -> None:
    _pause_other_running_timers(user=user, exclude_job_id=job.pk)
    switching = mode is not None and mode != job.timer_mode
    if switching or (grade is not None and grade != job.timer_grade):
        # Bank what the previous attribution earned before the clock changes
        # meaning, otherwise looking time would be booked as work.
        _pause_timer(job)
    if mode is not None:
        job.timer_mode = mode
    if grade is not None:
        job.timer_grade = grade
    if job.timer_mode != RestorationJob.TIMER_MODE_WORK:
        job.timer_grade = ''
    if not job.timer_is_running:
        job.timer_started_at = timezone.now()
        job.timer_is_running = True
    if user is not None:
        job.timer_started_by = user


def _lock_and_assert_bench_available(*, user, exclude_job_id: int | None = None) -> None:
    if user is None or not getattr(user, 'pk', None):
        return
    # Lock the technician row so concurrent scans cannot both pass the preflight.
    user.__class__.objects.select_for_update().get(pk=user.pk)
    qs = RestorationJob.objects.select_for_update().filter(
        stage=RestorationJob.STAGE_BENCH,
        bench_owner=user,
    )
    if exclude_job_id is not None:
        qs = qs.exclude(pk=exclude_job_id)
    occupied = qs.select_related('item_check_in').prefetch_related('item_check_in__items').first()
    if occupied is not None:
        raise BenchOccupiedError(occupied)


@transaction.atomic
def check_in_restoration_job(
    job: RestorationJob,
    user=None,
    item_id: int | None = None,
) -> RestorationJob:
    from apps.inventory.services.restoration import split_restoration_job

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)

    if job.stage not in (
        RestorationJob.STAGE_QUEUED,
        RestorationJob.STAGE_SENT,
        RestorationJob.STAGE_PENDING,
    ):
        raise ValueError('Only queued, sent, or pending jobs can be checked in to the bench.')
    # Incomplete grade values no longer block check-in â€” cockpit shows amber MISSING
    # and Mike can request valuations from Processing while assessing.
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
    from_stage = job.stage
    correlation_id = uuid4()
    _lock_and_assert_bench_available(user=user, exclude_job_id=job.pk)
    now = timezone.now()
    if not job.bench_started_at:
        job.bench_started_at = now
    job.stage = RestorationJob.STAGE_BENCH
    job.bench_owner = user if user is not None else job.bench_owner
    job.pending_reason = ''
    job.pending_notes = ''
    job.pending_storage_location = ''
    job.pending_started_at = None
    from apps.inventory.services.restoration_actions import open_bench_action

    job.current_action = open_bench_action(job, user=user)
    _sync_work_state(job, 'bench')
    job.save(
        update_fields=[
            'stage',
            'bench_started_at',
            'bench_owner',
            'current_action',
            'pending_reason',
            'pending_notes',
            'pending_storage_location',
            'pending_started_at',
            'work_session',
            'updated_at',
        ],
    )
    _timeline_event(
        job,
        'hold.resumed' if from_stage == RestorationJob.STAGE_PENDING else 'job.checked_in',
        {
            'from_stage': from_stage,
            'to_stage': RestorationJob.STAGE_BENCH,
        },
        actor=user,
        entity_id=f'job:{job.pk}',
        correlation_id=correlation_id,
    )
    return job


QUEUE_RETURN_REASONS = {
    'not_ready': 'Not ready',
    'question': 'Question for Processing',
    'grades': "Don't agree with grades/values",
}

SENT_BACK_NOTE_PREFIX = '{Sent Back to Queue}'
QUEUE_NOTE_MAX = 2000


def append_sent_back_note(existing: str, addition: str) -> str:
    """Keep the standing item note; tag the send-back line so it does not replace it."""

    addition = (addition or '').strip()
    existing = (existing or '').rstrip()
    if not addition:
        return existing
    line = f'{SENT_BACK_NOTE_PREFIX}: {addition}'
    combined = line if not existing else f'{existing}\n{line}'
    return combined[:QUEUE_NOTE_MAX]


@transaction.atomic
def move_restoration_job_back_to_queue(
    job: RestorationJob,
    *,
    user=None,
    note: str = '',
    reason: str = '',
) -> RestorationJob:
    """Send an item back unfinished. Not a hold, and not a finish.

    From the bench the reasons are: not ready (no note), a question for
    Processing, or disagreement with the posted grades. The last two mark the
    job for Processing's TO desk.
    """

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in (RestorationJob.STAGE_BENCH, RestorationJob.STAGE_PENDING):
        raise ValueError('Only bench or pending jobs can move back to queue.')
    reason = str(reason or '').strip()
    if reason and reason not in QUEUE_RETURN_REASONS:
        raise ValueError('Unknown return reason.')
    note = str(note or '').strip()[:2000]
    if reason in ('question', 'grades') and not note:
        raise ValueError('Write what Processing needs to know.')
    from_stage = job.stage
    correlation_id = uuid4()
    from apps.inventory.services.restoration_actions import close_open_actions

    close_open_actions(job)
    old_note = job.queue_note or ''
    if note:
        job.queue_note = append_sent_back_note(old_note, note)
    job.stage = RestorationJob.STAGE_SENT
    job.bench_owner = None
    job.pending_reason = ''
    job.pending_notes = ''
    job.pending_storage_location = ''
    job.pending_started_at = None
    _sync_work_state(job, 'queue')
    job.save(
        update_fields=[
            'stage',
            'bench_owner',
            'queue_note',
            'pending_reason',
            'pending_notes',
            'pending_storage_location',
            'pending_started_at',
            'work_session',
            'updated_at',
        ],
    )
    _timeline_event(
        job,
        'job.moved_to_queue',
        {
            'from_stage': from_stage,
            'to_stage': RestorationJob.STAGE_SENT,
            'note': note,
            'reason': reason,
        },
        actor=user,
        entity_id=f'job:{job.pk}',
        correlation_id=correlation_id,
    )
    if note and job.queue_note != old_note:
        from apps.inventory.services.item_notes import record_surface_note_for_job
        from apps.inventory.services.restoration_comments import record_queue_note_change

        record_surface_note_for_job(
            job,
            'send_back',
            note,
            author=user,
            source_key='send_back',
        )
        record_queue_note_change(
            job,
            previous=old_note,
            next_text=job.queue_note or '',
            actor=user,
            correlation_id=correlation_id,
        )
    if reason == 'question':
        from apps.inventory.services.restoration import request_restoration_valuation

        job = request_restoration_valuation(job, notes=note, user=user, kind='question')
    elif reason == 'grades':
        from apps.inventory.services.restoration import request_restoration_valuation

        job = request_restoration_valuation(job, notes=note, user=user, kind='disagree')
    return job


def _live_hold_orders(job: RestorationJob) -> list[dict]:
    from apps.inventory.services.restoration_parts import OPEN_STATUSES

    rows: list[dict] = []
    orders = (
        job.parts_orders.filter(status__in=OPEN_STATUSES)
        .prefetch_related('lines__part')
        .order_by('id')
    )
    for order in orders:
        sections: list[str] = []
        for line in order.lines.all():
            section = normalize_purchase_section(getattr(line.part, 'category', None))
            if section not in sections:
                sections.append(section)
        if not sections:
            sections = ['parts']
        rows.append({
            'name': order.name,
            'status': order.status,
            'sections': sections,
        })
    return rows


def _wait_for_payload(wait_for: dict | None) -> dict:
    raw = wait_for if isinstance(wait_for, dict) else {}
    return {key: str(raw.get(key) or '').strip() for key in WAIT_KEYS}


@transaction.atomic
def hold_restoration_job(
    job: RestorationJob,
    *,
    reason: str = '',
    storage_location: str = '',
    wait_for: dict | None = None,
    user=None,
) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage != RestorationJob.STAGE_BENCH:
        raise ValueError('Only bench jobs can be placed on hold.')

    live_orders = _live_hold_orders(job)
    needs: list[str] = []
    for order in live_orders:
        for section in order['sections']:
            if section not in needs:
                needs.append(section)
    wait = _wait_for_payload(wait_for)
    other = None

    if reason and reason not in PENDING_REASONS:
        raise ValueError('Invalid hold reason.')
    if not hold_has_substance(needs_purchased=needs, wait_for=wait):
        if reason:
            mapped = pending_from_legacy_reason(reason)
            if not needs:
                needs = list(mapped.get('needsPurchased') or [])
            if not any(wait.get(key) for key in WAIT_KEYS):
                mapped_wait = mapped.get('waitFor') or {}
                wait = _wait_for_payload(mapped_wait)
            other = mapped.get('withOtherItems')
        if not hold_has_substance(needs_purchased=needs, wait_for=wait, with_other_items=other):
            raise ValueError('Say what this item is waiting on.')

    label = derive_hold_label(needs_purchased=needs, wait_for=wait, with_other_items=other)
    story = hold_story(
        live_orders=live_orders,
        wait_for=wait,
        storage_location=storage_location,
    )
    correlation_id = uuid4()
    # Work stops when the item leaves the bench. Coming back opens a new
    # action, so what was done before the hold stays a closed piece of work.
    from apps.inventory.services.restoration_actions import close_open_actions

    close_open_actions(job)
    now = timezone.now()
    job.stage = RestorationJob.STAGE_PENDING
    job.bench_owner = None
    job.pending_reason = label
    job.pending_notes = story
    job.pending_storage_location = storage_location or ''
    job.pending_started_at = now
    session = dict(job.work_session or {})
    session['workState'] = 'pending'
    session['pending'] = {
        'reason': label,
        'needsPurchased': needs,
        'waitFor': wait,
        'withOtherItems': other,
        'notes': story,
        'storageLocation': storage_location or '',
        'pendingStartedAt': now.isoformat(),
        'receivedSections': [],
        'legacyReason': reason if reason in PENDING_REASONS else None,
    }
    job.work_session = session
    job.save(
        update_fields=[
            'stage',
            'bench_owner',
            'pending_reason',
            'pending_notes',
            'pending_storage_location',
            'pending_started_at',
            'work_session',
            'updated_at',
        ],
    )
    _timeline_event(
        job,
        'hold.placed',
        {
            'reason': label,
            'needs_purchased': needs,
            'wait_for': wait,
            'story': story,
            'storage_location': storage_location or '',
        },
        actor=user,
        entity_id=f'hold:{job.pk}',
        correlation_id=correlation_id,
    )
    from apps.inventory.services.item_notes import record_surface_note_for_job

    record_surface_note_for_job(
        job,
        'hold',
        story,
        author=user,
        source_key='hold',
    )
    return job


def _actual_parts_cost_for_job(job: RestorationJob) -> Decimal:
    """Sum of purchased/received order costs. FFE and Supplies are bought,
    but only the Parts share of freight enters the repair."""

    from apps.inventory.services.restoration_parts import actual_parts_cost_for_job

    return actual_parts_cost_for_job(job)


FINISHABLE_STAGES = (
    RestorationJob.STAGE_QUEUED,
    RestorationJob.STAGE_SENT,
    RestorationJob.STAGE_BENCH,
    RestorationJob.STAGE_PENDING,
)


def _job_sale_state(job: RestorationJob) -> str:
    from apps.inventory.services.restoration import _sale_state_from_session

    return str(_sale_state_from_session(job.work_session) or '').strip().lower()


def _assert_finish_payload(
    job: RestorationJob,
    *,
    destination: str,
    final_grade: str,
    notes: str,
    skip_grade_gates: bool = False,
) -> None:
    from apps.inventory.services.restoration import (
        grades_for_scale,
        job_has_restoration_actions,
        restoration_job_needs_setup,
    )

    valid = {c[0] for c in RestorationJob.BENCH_DISPOSITION_CHOICES}
    if destination not in valid:
        raise ValueError('Invalid destination.')
    from apps.inventory.services.restoration_parts import (
        FINISH_BLOCKED_MESSAGE,
        job_has_open_parts_order,
    )

    if job_has_open_parts_order(job):
        raise ValueError(FINISH_BLOCKED_MESSAGE)
    has_actions = job_has_restoration_actions(job)
    notes = (notes or '').strip()
    if not has_actions and not notes:
        raise ValueError('Say why this item is leaving restoration. Nothing was done to it.')
    if has_actions and not skip_grade_gates:
        if restoration_job_needs_setup(job):
            raise ValueError('Enter a value for every grade before completing the job.')
        if not final_grade:
            raise ValueError('Final grade is required.')
        if job.scale and final_grade not in grades_for_scale(job.scale):
            raise ValueError('Choose a final grade from the job grade scale.')
    elif final_grade and job.scale:
        if final_grade not in grades_for_scale(job.scale):
            raise ValueError('Choose a final grade from the job grade scale.')


@transaction.atomic
def complete_restoration_job(
    job: RestorationJob,
    *,
    destination: str,
    final_grade: str,
    notes: str = '',
    starting_grade: str = '',
    spent_hours: Decimal | float | None = None,
    spent_parts_cost: Decimal | float | None = None,
    outputs: list[dict] | None = None,
    skip_grade_gates: bool = False,
    user=None,
) -> RestorationJob:
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    if job.stage not in FINISHABLE_STAGES:
        raise ValueError('Only queued, bench, or holding jobs can be finished.')
    if job.quantity > 1:
        raise ValueError('Scan one item tag to split it off the stack first. Finish takes one item at a time.')
    _assert_finish_payload(
        job,
        destination=destination,
        final_grade=final_grade,
        notes=notes,
        skip_grade_gates=skip_grade_gates,
    )
    if spent_parts_cost is None:
        spent_parts_cost = _actual_parts_cost_for_job(job)
    if starting_grade:
        job.starting_grade = str(starting_grade).strip()[:64]
    else:
        from apps.inventory.services.tars_value import sync_starting_grade

        sync_starting_grade(job)

    correlation_id = uuid4()
    # Nothing is still being done to a finished item.
    from apps.inventory.services.restoration_actions import close_open_actions

    close_open_actions(job)
    now = timezone.now()
    job.stage = RestorationJob.STAGE_DONE
    job.bench_owner = None
    job.bench_disposition = destination
    job.final_grade = final_grade
    job.disposition_notes = notes or ''
    job.spent_hours = Decimal(str(spent_hours if spent_hours is not None else 0))
    job.spent_parts_cost = Decimal(str(spent_parts_cost))
    job.dispositioned_at = now
    job.dispositioned_by = user
    # Freeze what the work earned. Grade scales get edited; history should not
    # move when they do.
    from apps.inventory.services.tars_value import compute_value_added

    job.value_added = compute_value_added(job, final_grade=final_grade)
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
            'bench_owner',
            'bench_disposition',
            'starting_grade',
            'final_grade',
            'disposition_notes',
            'spent_hours',
            'spent_parts_cost',
            'value_added',
            'dispositioned_at',
            'dispositioned_by',
            'work_session',
            'updated_at',
        ],
    )
    _move_items_for_disposition(
        job,
        destination=destination,
        final_grade=final_grade,
        notes=notes or '',
        user=user,
    )
    _timeline_event(
        job,
        'disposition.completed',
        {
            'destination': destination,
            'final_grade': final_grade,
            'spent_hours': str(job.spent_hours),
            'spent_parts_cost': str(job.spent_parts_cost),
            'notes': notes or '',
        },
        actor=user,
        entity_id=f'disposition:{job.pk}',
        correlation_id=correlation_id,
    )
    write_restoration_outputs(job, outputs or [], user=user)
    from apps.inventory.services.item_notes import record_surface_note_for_job

    record_surface_note_for_job(
        job,
        'finish',
        notes or '',
        author=user,
        source_key='finish',
    )
    return job


def write_restoration_outputs(job: RestorationJob, outputs: list[dict], *, user=None) -> list:
    """Replace the job's output lines. Seq 0 is always the main item."""

    from apps.inventory.models import RestorationOutput

    RestorationOutput.objects.filter(job=job).delete()
    items = list(job.item_check_in.items.order_by('id')) if job.item_check_in_id else []
    main = items[0] if items else None
    destination = job.bench_disposition or 'processing'
    by_seq = {
        int(row.get('seq', 0)): row
        for row in outputs
        if isinstance(row, dict)
    }
    written = []
    main_payload = by_seq.get(0) or {}
    written.append(
        RestorationOutput.objects.create(
            job=job,
            seq=0,
            label=str(main_payload.get('label') or 'Whole item').strip()[:200] or 'Whole item',
            notes=str(main_payload.get('notes') or '').strip(),
            destination=str(main_payload.get('destination') or destination).strip()[:32],
            suggested_product_id=main_payload.get('suggested_product_id'),
            item=main,
            created_by=user if getattr(user, 'pk', None) else None,
        )
    )
    next_seq = 1
    extras = [
        row
        for seq, row in sorted(by_seq.items())
        if seq != 0
    ]
    for row in extras:
        label = str(row.get('label') or '').strip()[:200]
        if not label:
            continue
        written.append(
            RestorationOutput.objects.create(
                job=job,
                seq=next_seq,
                label=label,
                notes=str(row.get('notes') or '').strip(),
                destination=str(row.get('destination') or destination).strip()[:32],
                suggested_product_id=row.get('suggested_product_id'),
                created_by=user if getattr(user, 'pk', None) else None,
            )
        )
        next_seq += 1
    from apps.inventory.services.item_notes import record_surface_note_for_job

    for row in written:
        if row.notes:
            record_surface_note_for_job(
                job,
                'output',
                row.notes,
                author=user,
                source_key=f'output:{row.seq}',
            )
    return written


@transaction.atomic
def reject_restoration_job(job: RestorationJob, *, reason: str, user=None) -> RestorationJob:
    """Send the item to Processing as rejected - no restoration attempted."""

    reason = (reason or '').strip()
    if not reason:
        raise ValueError('Say why this item is being rejected.')
    job = complete_restoration_job(
        job,
        destination=RestorationJob.BENCH_DISPOSITION_PROCESSING,
        final_grade=job.starting_grade or job.final_grade or '',
        starting_grade=job.starting_grade,
        notes=reason,
        skip_grade_gates=True,
        user=user,
    )
    job.return_disposition_type = RestorationJob.RETURN_DISPOSITION_UNTOUCHED
    job.return_reason = 'rejected'
    job.return_notes = reason
    job.save(
        update_fields=[
            'return_disposition_type',
            'return_reason',
            'return_notes',
            'updated_at',
        ],
    )
    from apps.inventory.services.item_notes import record_surface_note_for_job

    record_surface_note_for_job(
        job,
        'reject',
        reason,
        author=user,
        source_key='reject',
    )
    return job


def family_retail_for_item(item) -> Decimal:
    from apps.inventory.models import Item

    root = item.parent_item if item.parent_item_id else item
    ids = [root.pk, *root.child_items.values_list('pk', flat=True)]
    total = Decimal('0')
    for row in Item.objects.filter(pk__in=ids).only('retail'):
        total += row.retail or Decimal('0')
    return total


SALVAGE_PRODUCT_NUMBER = 'PRD-SALVAGE'


def ensure_salvage_product():
    """One catalog sink for parts that leave as salvage - never picked by staff."""

    from apps.inventory.models import Product

    product, _created = Product.objects.get_or_create(
        product_number=SALVAGE_PRODUCT_NUMBER,
        defaults={'title': 'Salvage', 'brand': 'Generic'},
    )
    return product


@transaction.atomic
def create_item_from_restoration_output(
    output,
    *,
    product,
    retail,
    price,
    parent_retail,
    condition: str = '',
    dispatch: str = '',
    notes: str = '',
    specifications: dict | None = None,
    user=None,
):
    """Mint a salvaged-part SKU that inherits the truck and the parent item."""

    from apps.inventory.models import Item, Product, RestorationOutput
    from apps.inventory.processing_ops import _resolve_condition_db
    from apps.inventory.services.processing_workspace import dispatch_to_location

    output = RestorationOutput.objects.select_for_update().get(pk=output.pk)
    if output.seq == 0:
        raise ValueError('The main item already has a SKU.')
    if output.item_id:
        raise ValueError('This part already has a SKU.')
    if product is None:
        product = ensure_salvage_product()
    if not isinstance(product, Product):
        raise ValueError('Choose a product for this part.')
    parent = None
    main = RestorationOutput.objects.filter(job_id=output.job_id, seq=0).first()
    if main and main.item_id:
        parent = Item.objects.select_for_update().get(pk=main.item_id)
    elif output.job.item_check_in_id:
        parent_id = (
            Item.objects.filter(check_in_id=output.job.item_check_in_id)
            .order_by('id')
            .values_list('pk', flat=True)
            .first()
        )
        if parent_id:
            parent = Item.objects.select_for_update().get(pk=parent_id)
    if parent is None:
        raise ValueError('No main item to inherit from.')
    try:
        part_retail = Decimal(str(retail))
        part_price = Decimal(str(price))
        new_parent_retail = Decimal(str(parent_retail))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError('Retail and price must be numbers.') from exc
    if part_retail < 0 or part_price < 0 or new_parent_retail < 0:
        raise ValueError('Retail and price cannot be negative.')
    old_parent_retail = parent.retail or Decimal('0')
    salvage_skip = part_retail == 0 and new_parent_retail == old_parent_retail
    if not salvage_skip and new_parent_retail >= old_parent_retail:
        raise ValueError('Reduce the main item retail when minting a part.')

    cond_db = _resolve_condition_db(condition) if condition else (parent.condition or 'unknown')
    if dispatch:
        location = 'salvage' if cond_db == 'salvage' else dispatch_to_location(dispatch)
    else:
        location = 'processing'
    specs = specifications if isinstance(specifications, dict) else {}

    item = Item(
        sku=Item.generate_sku(),
        product=product,
        purchase_order=parent.purchase_order,
        manifest_row=parent.manifest_row,
        check_in=parent.check_in,
        parent_item=parent,
        price=part_price,
        retail=part_retail,
        source=parent.source,
        status='intake',
        condition=cond_db,
        location=location,
        notes=(notes or '').strip(),
        specifications=specs,
    )
    item.save()
    parent.retail = new_parent_retail
    parent.save(update_fields=['retail', 'updated_at'])
    output.item = item
    output.suggested_product = product
    output.save(update_fields=['item', 'suggested_product'])
    return item


def _assert_not_handled(job: RestorationJob) -> None:
    if job.processing_handled_at is not None:
        raise ValueError('Processing has already checked this in.')


@transaction.atomic
def reopen_restoration_job(job: RestorationJob, *, user=None, note: str = '') -> RestorationJob:
    """Send a finished item back to the Queue before Processing takes it in."""

    from apps.inventory.services.restoration import (
        _apply_restoration_dispatch_to_check_in,
        _requeue_restoration_job,
    )

    note = str(note or '').strip()[:2000]
    if not note:
        raise ValueError('Write why this is coming back.')
    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    _assert_not_handled(job)
    if job.stage not in (RestorationJob.STAGE_DONE, RestorationJob.STAGE_RETURNED):
        raise ValueError('Only finished items can come back to restoration.')
    from_stage = job.stage
    job = _requeue_restoration_job(job)
    if job.item_check_in_id:
        _apply_restoration_dispatch_to_check_in(job.item_check_in, user)
    _timeline_event(
        job,
        'job.reopened',
        {'from_stage': from_stage, 'to_stage': RestorationJob.STAGE_QUEUED, 'note': note},
        actor=user,
        entity_id=f'job:{job.pk}',
    )
    from apps.inventory.services.item_notes import record_surface_note_for_job

    record_surface_note_for_job(
        job,
        'send_back',
        note,
        author=user,
        source_key='reopen',
    )
    return job


@transaction.atomic
def fix_restoration_finish(
    job: RestorationJob,
    *,
    destination: str,
    final_grade: str,
    notes: str = '',
    starting_grade: str = '',
    user=None,
) -> RestorationJob:
    """Correct where a finished item went, before Processing takes it in."""

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    _assert_not_handled(job)
    if job.stage != RestorationJob.STAGE_DONE:
        raise ValueError('Only a finished item can have its finish corrected.')
    _assert_finish_payload(job, destination=destination, final_grade=final_grade, notes=notes)
    previous = job.bench_disposition
    job.bench_disposition = destination
    job.final_grade = final_grade or ''
    job.disposition_notes = notes or ''
    if starting_grade:
        job.starting_grade = str(starting_grade).strip()[:64]
    from apps.inventory.services.tars_value import compute_value_added

    job.value_added = compute_value_added(job, final_grade=final_grade or None)
    job.save(
        update_fields=[
            'bench_disposition',
            'starting_grade',
            'final_grade',
            'disposition_notes',
            'value_added',
            'updated_at',
        ],
    )
    if destination != previous:
        _move_items_for_disposition(
            job,
            destination=destination,
            final_grade=final_grade or '',
            notes=notes or '',
            user=user,
        )
    _timeline_event(
        job,
        'disposition.revised',
        {
            'destination': destination,
            'previous_destination': previous,
            'final_grade': final_grade or '',
            'notes': notes or '',
        },
        actor=user,
        entity_id=f'disposition:{job.pk}',
    )
    from apps.inventory.services.item_notes import record_surface_note_for_job

    record_surface_note_for_job(
        job,
        'finish',
        notes or '',
        author=user,
        source_key='finish',
    )
    return job


@transaction.atomic
def processing_check_in_restoration_job(
    job: RestorationJob,
    *,
    price,
    retail=None,
    condition: str = '',
    dispatch: str = 'on_shelf',
    notes: str = '',
    specifications: dict | None = None,
    user=None,
) -> tuple[RestorationJob, list]:
    """Processing takes a finished restoration item in: price, place, stamp handled."""

    from decimal import Decimal, InvalidOperation

    from apps.inventory.models import ItemCheckIn, ItemHistory
    from apps.inventory.processing_ops import apply_item_updates, _resolve_condition_db
    from apps.inventory.services.processing_workspace import (
        dispatch_to_location,
        printed_items_preview,
    )

    job = RestorationJob.objects.select_for_update().get(pk=job.pk)
    _assert_not_handled(job)
    if job.stage not in (RestorationJob.STAGE_DONE, RestorationJob.STAGE_RETURNED):
        raise ValueError('Only finished items can be checked in from restoration.')

    notes = (notes or '').strip()

    try:
        item_price = Decimal(str(price))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ValueError('Price is required.') from exc
    if item_price < 0:
        raise ValueError('Price cannot be negative.')

    item_retail = None
    if retail not in (None, ''):
        try:
            item_retail = Decimal(str(retail))
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError('Retail must be a number.') from exc

    cond_db = _resolve_condition_db(condition) if condition else ''
    location = 'salvage' if cond_db == 'salvage' else dispatch_to_location(dispatch)
    specs = specifications if isinstance(specifications, dict) else {}

    if not job.item_check_in_id:
        raise ValueError('This job has no check-in to update.')
    check_in = ItemCheckIn.objects.select_for_update().get(pk=job.item_check_in_id)
    snapshot = dict(check_in.defaults_snapshot or {})
    snapshot['dispatch'] = location if location == 'salvage' else dispatch
    snapshot['location'] = location
    snapshot['price'] = str(item_price)
    if item_retail is not None:
        snapshot['retail'] = str(item_retail)
    if cond_db:
        snapshot['condition'] = cond_db
    snapshot['notes'] = notes
    if specs:
        snapshot['specifications'] = specs
    check_in.defaults_snapshot = snapshot
    check_in.save(update_fields=['defaults_snapshot', 'updated_at'])

    histories: list[ItemHistory] = []
    items = list(check_in.items.select_for_update().all())
    main_items = [item for item in items if not item.parent_item_id]
    for item in main_items:
        if item.status == 'sold' or item.sold_at:
            continue
        updates = {'price': item_price, 'location': location, 'notes': notes}
        if item_retail is not None:
            updates['retail'] = item_retail
        if cond_db:
            updates['condition'] = cond_db
        if specs:
            updates['specifications'] = specs
        changed = apply_item_updates(item, updates)
        if changed:
            item.save(update_fields=[field for field, _old, _new in changed] + ['updated_at'])
            for field, old_value, new_value in changed:
                if field == 'location' and str(old_value or '') != str(new_value or ''):
                    histories.append(
                        ItemHistory(
                            item=item,
                            event_type='location_change',
                            old_value=str(old_value or ''),
                            new_value=str(new_value or ''),
                            note='Checked in from restoration',
                            created_by=user,
                        ),
                    )
    if histories:
        ItemHistory.objects.bulk_create(histories)

    now = timezone.now()
    job.processing_handled_at = now
    job.processing_handled_by = user if user is not None else job.processing_handled_by
    job.save(update_fields=['processing_handled_at', 'processing_handled_by', 'updated_at'])
    from apps.inventory.services.item_notes import record_surface_note_for_job

    record_surface_note_for_job(
        job,
        'processing_return',
        notes,
        author=user,
        source_key='processing_return',
    )
    _timeline_event(
        job,
        'processing.checked_in',
        {
            'price': str(item_price),
            'dispatch': dispatch,
            'sale_state': _job_sale_state(job),
        },
        actor=user,
        entity_id=f'processing-check-in:{job.pk}',
    )
    preview = printed_items_preview([item.pk for item in items])
    return job, preview


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

