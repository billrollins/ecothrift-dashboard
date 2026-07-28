"""Canonical Delivery (job) search, CRUD, items, archive/restore."""

from __future__ import annotations

import re
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.pos.models import (
    DeliveryChangeEvent,
    DeliveryDay,
    DeliveryJob,
    DeliveryJobItem,
)
from apps.pos.services.delivery_audit import item_snapshot, job_snapshot, record_change
from apps.pos.services.delivery_run import create_delivery_job, resolved_delivery_item_count


def _digits(phone: str) -> str:
    return re.sub(r'\D+', '', phone or '')


def delivery_search_queryset(
    *,
    search: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    day_id: int | None = None,
    include_test: bool = False,
    include_archived: bool = False,
):
    qs = DeliveryJob.objects.select_related(
        'availability',
        'cart',
        'cart__receipt',
        'cart_line',
        'created_by',
        'test_dataset',
    ).prefetch_related('address_revisions', 'items')
    if not include_archived:
        qs = qs.filter(archived_at__isnull=True)
    if not include_test:
        qs = qs.filter(test_dataset__isnull=True)
    if status:
        qs = qs.filter(status=status)
    if day_id:
        qs = qs.filter(availability_id=day_id)
    if date_from:
        qs = qs.filter(Q(scheduled_date__gte=date_from) | Q(status=DeliveryJob.STATUS_NEEDS_SCHEDULING))
    if date_to:
        qs = qs.filter(Q(scheduled_date__lte=date_to) | Q(status=DeliveryJob.STATUS_NEEDS_SCHEDULING))
    if search:
        term = search.strip()
        if term:
            phone_digits = _digits(term)
            q = (
                Q(customer_name__icontains=term)
                | Q(phone__icontains=term)
                | Q(address__icontains=term)
                | Q(notes__icontains=term)
                | Q(items_delivered__icontains=term)
                | Q(items__sku__icontains=term)
                | Q(items__description__icontains=term)
                | Q(cart__receipt__receipt_number__icontains=term)
            )
            if phone_digits and len(phone_digits) >= 3:
                q |= Q(phone__icontains=phone_digits)
            qs = qs.filter(q).distinct()
    return qs.order_by('-scheduled_date', '-id')


def ensure_job_items(job: DeliveryJob, *, user=None) -> list[DeliveryJobItem]:
    existing = list(DeliveryJobItem.objects.filter(job=job).order_by('position', 'id'))
    if existing:
        return existing
    from apps.pos.services.delivery_run import resolve_job_line_items

    resolved = resolve_job_line_items(job)
    created: list[DeliveryJobItem] = []
    for idx, it in enumerate(resolved):
        created.append(
            DeliveryJobItem.objects.create(
                job=job,
                source_cart_line_id=it.get('line_id'),
                sku=(it.get('sku') or '')[:64],
                description=(it.get('description') or 'Item')[:300],
                quantity=max(1, int(it.get('quantity') or 1)),
                position=idx,
                is_scannable=bool(it.get('scannable')),
                created_by=user,
            )
        )
    return created


@transaction.atomic
def create_delivery(
    *,
    user,
    customer_name: str,
    phone: str,
    address: str,
    items_delivered: str = '',
    is_apt: bool = False,
    unit: str = '',
    notes: str = '',
    day: DeliveryDay | None = None,
    schedule_later: bool = False,
    tier: str = '',
    fee=None,
    distance_miles=None,
    distance_mode: str = '',
    item_count=None,
    cart=None,
    source_cart_line_ids: list[int] | None = None,
    item_rows: list[dict[str, Any]] | None = None,
) -> DeliveryJob:
    job = create_delivery_job(
        user=user,
        customer_name=customer_name,
        phone=phone,
        address=address,
        items_delivered=items_delivered or 'Delivery items',
        is_apt=is_apt,
        unit=unit,
        notes=notes,
        availability=day,
        schedule_later=schedule_later or day is None,
        tier=tier,
        fee=fee,
        distance_miles=distance_miles,
        distance_mode=distance_mode,
        item_count=item_count,
        cart=cart,
        source_cart_line_ids=source_cart_line_ids,
    )
    if item_rows:
        for idx, row in enumerate(item_rows):
            DeliveryJobItem.objects.create(
                job=job,
                sku=str(row.get('sku') or '')[:64],
                description=str(row.get('description') or 'Item')[:300],
                quantity=max(1, int(row.get('quantity') or 1)),
                position=idx,
                is_scannable=bool(row.get('sku')),
                created_by=user,
            )
    else:
        ensure_job_items(job, user=user)
    # Keep stored item_count aligned with normalized items.
    job.item_count = resolved_delivery_item_count(job)
    job.save(update_fields=['item_count', 'updated_at'])
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_JOB,
        entity_id=job.id,
        action='create',
        actor=user,
        day=job.availability,
        job=job,
        after=job_snapshot(job),
    )
    return job


@transaction.atomic
def update_delivery(*, job: DeliveryJob, user, reason: str = '', **fields) -> DeliveryJob:
    before = job_snapshot(job)
    update_fields = ['updated_at', 'updated_by']
    job.updated_by = user
    for key in ('customer_name', 'phone', 'notes', 'items_delivered', 'is_apt', 'unit'):
        if key in fields and fields[key] is not None:
            setattr(job, key, fields[key])
            update_fields.append(key)
    job.save(update_fields=list(set(update_fields)))
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_JOB,
        entity_id=job.id,
        action='update',
        actor=user,
        day=job.availability,
        job=job,
        before=before,
        after=job_snapshot(job),
        reason=reason,
    )
    return job


@transaction.atomic
def assign_delivery_to_day(*, job: DeliveryJob, day: DeliveryDay, user, reason: str = '') -> DeliveryJob:
    from apps.pos.services.delivery_run import (
        apply_route_plan,
        ensure_next_up,
        log_event,
        open_stop_for_job,
        sync_job_onto_open_run,
    )
    from apps.pos.models import DeliveryRun, DeliveryRunStop

    before = job_snapshot(job)
    old_stop = open_stop_for_job(job)
    old_run = old_stop.run if old_stop else None

    # Same guard as reschedule_job_from_run: freight already on the truck cannot
    # be moved to another day from the Desk.
    if (
        old_stop
        and old_run
        and old_run.date != day.date
        and (old_stop.loaded_at or old_run.status == DeliveryRun.STATUS_EN_ROUTE)
    ):
        raise ValueError(
            'Cannot move a loaded or en-route delivery to another day — '
            'report an issue and reconcile the return first'
        )

    job.availability = day
    job.scheduled_date = day.date
    if job.status == DeliveryJob.STATUS_NEEDS_SCHEDULING:
        job.status = DeliveryJob.STATUS_SCHEDULED
    job.updated_by = user
    job.save(update_fields=['availability', 'scheduled_date', 'status', 'updated_by', 'updated_at'])
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_JOB,
        entity_id=job.id,
        action='schedule',
        actor=user,
        day=day,
        job=job,
        before=before,
        after=job_snapshot(job),
        reason=reason,
    )

    # Leave any previous open-run stop so the day board stays truthful.
    if (
        old_stop
        and old_run
        and old_stop.state not in (
            DeliveryRunStop.STATE_COMPLETED,
            DeliveryRunStop.STATE_RESCHEDULED,
            DeliveryRunStop.STATE_FAILED,
        )
        and old_run.date != day.date
    ):
        old_stop.state = DeliveryRunStop.STATE_RESCHEDULED
        old_stop.rescheduled_at = timezone.now()
        old_stop.rescheduled_by = user
        old_stop.rescheduled_to_date = day.date
        old_stop.save(
            update_fields=[
                'state',
                'rescheduled_at',
                'rescheduled_by',
                'rescheduled_to_date',
                'updated_at',
            ]
        )
        log_event(
            old_run,
            'reschedule',
            actor=user,
            stop=old_stop,
            payload={
                'job_id': job.id,
                'to_date': day.date.isoformat(),
                'via': 'assign_delivery_to_day',
            },
        )
        ensure_next_up(old_run)
        if old_run.status == DeliveryRun.STATUS_EN_ROUTE:
            apply_route_plan(old_run, user=user, optimize=False)

    sync_job_onto_open_run(job, user=user)
    return job


@transaction.atomic
def archive_delivery(*, job: DeliveryJob, user, reason: str = '') -> DeliveryJob:
    from apps.pos.services.delivery_run import cancel_job_with_run_sync

    before = job_snapshot(job)
    # Fail/remove the open-run stop before soft-archiving (same sync as cancel).
    cancel_job_with_run_sync(job, user=user)
    job.refresh_from_db()
    job.archived_at = timezone.now()
    job.archived_by = user
    job.archive_reason = (reason or '')[:300]
    job.updated_by = user
    job.save(
        update_fields=[
            'archived_at', 'archived_by', 'archive_reason', 'updated_by', 'updated_at',
        ]
    )
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_JOB,
        entity_id=job.id,
        action='archive',
        actor=user,
        day=job.availability,
        job=job,
        before=before,
        after=job_snapshot(job),
        reason=reason,
    )
    return job


@transaction.atomic
def restore_delivery(*, job: DeliveryJob, user, reason: str = '') -> DeliveryJob:
    from apps.pos.services.delivery_run import sync_job_onto_open_run

    before = job_snapshot(job)
    job.archived_at = None
    job.archived_by = None
    job.archive_reason = ''
    if job.scheduled_date:
        job.status = DeliveryJob.STATUS_SCHEDULED
    else:
        job.status = DeliveryJob.STATUS_NEEDS_SCHEDULING
    job.updated_by = user
    job.save(
        update_fields=[
            'archived_at', 'archived_by', 'archive_reason', 'status', 'updated_by', 'updated_at',
        ]
    )
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_JOB,
        entity_id=job.id,
        action='restore',
        actor=user,
        day=job.availability,
        job=job,
        before=before,
        after=job_snapshot(job),
        reason=reason,
    )
    # Archive failed the open-run stop; restoring must put it back on the route.
    sync_job_onto_open_run(job, user=user, requeue_inactive=True)
    return job


@transaction.atomic
def add_job_item(
    *,
    job: DeliveryJob,
    user,
    description: str,
    quantity: int = 1,
    sku: str = '',
    reason: str = '',
) -> DeliveryJobItem:
    pos = (
        DeliveryJobItem.objects.filter(job=job, is_active=True)
        .order_by('-position')
        .values_list('position', flat=True)
        .first()
    )
    item = DeliveryJobItem.objects.create(
        job=job,
        description=(description or 'Item')[:300],
        quantity=max(1, int(quantity or 1)),
        sku=(sku or '')[:64],
        position=(pos + 1) if pos is not None else 0,
        is_scannable=bool(sku),
        created_by=user,
    )
    job.item_count = resolved_delivery_item_count(job)
    job.updated_by = user
    job.save(update_fields=['item_count', 'updated_by', 'updated_at'])
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_ITEM,
        entity_id=item.id,
        action='create',
        actor=user,
        day=job.availability,
        job=job,
        after=item_snapshot(item),
        reason=reason,
    )
    return item


@transaction.atomic
def remove_job_item(*, item: DeliveryJobItem, user, reason: str = '') -> DeliveryJobItem:
    before = item_snapshot(item)
    item.is_active = False
    item.removed_at = timezone.now()
    item.removed_by = user
    item.remove_reason = (reason or '')[:300]
    item.save(update_fields=['is_active', 'removed_at', 'removed_by', 'remove_reason', 'updated_at'])
    job = item.job
    job.item_count = max(1, resolved_delivery_item_count(job))
    job.updated_by = user
    job.save(update_fields=['item_count', 'updated_by', 'updated_at'])
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_ITEM,
        entity_id=item.id,
        action='remove',
        actor=user,
        day=job.availability,
        job=job,
        before=before,
        after=item_snapshot(item),
        reason=reason,
    )
    return item
