"""Canonical DeliveryDay list/detail/actions."""

from __future__ import annotations

from datetime import date, time
from typing import Any

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.pos.models import (
    DeliveryChangeEvent,
    DeliveryDay,
    DeliveryDayAssignment,
    DeliveryJob,
    DeliveryJobItem,
    DeliveryRun,
)
from apps.pos.services.delivery_audit import day_snapshot, record_change
from apps.pos.services.delivery_migration_backfill import default_location_id


def _today() -> date:
    return timezone.localdate()


def annotate_day_queryset(qs):
    return qs.annotate(
        delivery_count=Count(
            'jobs',
            filter=Q(
                jobs__status=DeliveryJob.STATUS_SCHEDULED,
                jobs__archived_at__isnull=True,
            ),
            distinct=True,
        ),
        items_booked=Coalesce(
            Sum(
                'jobs__items__quantity',
                filter=Q(
                    jobs__status=DeliveryJob.STATUS_SCHEDULED,
                    jobs__archived_at__isnull=True,
                    jobs__items__is_active=True,
                ),
            ),
            0,
        ),
        completed_count=Count(
            'jobs',
            filter=Q(jobs__status=DeliveryJob.STATUS_COMPLETED, jobs__archived_at__isnull=True),
            distinct=True,
        ),
        cancelled_count=Count(
            'jobs',
            filter=Q(jobs__status=DeliveryJob.STATUS_CANCELLED, jobs__archived_at__isnull=True),
            distinct=True,
        ),
    )


def day_list_queryset(
    *,
    bucket: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    disposition: str | None = None,
    driver_id: int | None = None,
    search: str | None = None,
    include_test: bool = False,
    include_archived: bool = False,
):
    qs = annotate_day_queryset(
        DeliveryDay.objects.select_related('location', 'primary_driver', 'test_dataset')
    )
    if not include_archived:
        qs = qs.filter(archived_at__isnull=True)
    if not include_test:
        qs = qs.filter(test_dataset__isnull=True)

    today = _today()
    if bucket == 'past':
        qs = qs.filter(date__lt=today)
    elif bucket == 'today':
        qs = qs.filter(date=today)
    elif bucket == 'future':
        qs = qs.filter(date__gt=today)

    if date_from:
        qs = qs.filter(date__gte=date_from)
    if date_to:
        qs = qs.filter(date__lte=date_to)
    if disposition:
        qs = qs.filter(planning_disposition=disposition)
    if driver_id:
        qs = qs.filter(
            Q(primary_driver_id=driver_id) | Q(assignments__user_id=driver_id)
        ).distinct()
    if search:
        term = search.strip()
        if term:
            qs = qs.filter(
                Q(assigned_to__icontains=term)
                | Q(notes__icontains=term)
                | Q(primary_driver__first_name__icontains=term)
                | Q(primary_driver__last_name__icontains=term)
                | Q(jobs__customer_name__icontains=term)
            ).distinct()
    return qs.order_by('date', 'time_start', 'id')


def serialize_day_summary(day: DeliveryDay) -> dict[str, Any]:
    run = (
        day.runs.filter(is_canonical=True)
        .order_by('-id')
        .first()
    )
    elapsed = 0
    if run:
        elapsed = int(run.active_seconds or 0)
        if run.started_at and run.status != DeliveryRun.STATUS_COMPLETED and not run.ended_at:
            elapsed += max(0, int((timezone.now() - run.started_at).total_seconds()))

    display_state = day.planning_disposition
    if run and run.status == DeliveryRun.STATUS_COMPLETED:
        display_state = 'completed'
    elif run and run.status in (DeliveryRun.STATUS_PREPARING, DeliveryRun.STATUS_EN_ROUTE):
        display_state = 'active'

    return {
        'id': day.id,
        'date': day.date.isoformat(),
        'time_start': day.time_start.isoformat() if day.time_start else None,
        'time_end': day.time_end.isoformat() if day.time_end else None,
        'crew_size': day.crew_size,
        'assigned_to': day.assigned_to,
        'notes': day.notes,
        'is_active': day.is_active,
        'is_bookable': day.is_bookable,
        'planning_disposition': day.planning_disposition,
        'display_state': display_state,
        'location_id': day.location_id,
        'primary_driver_id': day.primary_driver_id,
        'primary_driver_name': (
            day.primary_driver.full_name if day.primary_driver_id and day.primary_driver else None
        ),
        'delivery_count': int(getattr(day, 'delivery_count', 0) or 0),
        'items_booked': int(getattr(day, 'items_booked', 0) or 0),
        'completed_count': int(getattr(day, 'completed_count', 0) or 0),
        'cancelled_count': int(getattr(day, 'cancelled_count', 0) or 0),
        'is_test': day.test_dataset_id is not None,
        'test_dataset_key': day.test_dataset.key if day.test_dataset_id else None,
        'run': (
            {
                'id': run.id,
                'status': run.status,
                'phase': run.phase,
                'active_seconds': elapsed,
                'started_at': run.started_at.isoformat() if run.started_at else None,
                'ended_at': run.ended_at.isoformat() if run.ended_at else None,
            }
            if run
            else None
        ),
        'created_at': day.created_at.isoformat() if day.created_at else None,
        'updated_at': day.updated_at.isoformat() if day.updated_at else None,
    }


def serialize_day_detail(day: DeliveryDay) -> dict[str, Any]:
    from apps.pos.serializers import DeliveryJobSerializer

    summary = serialize_day_summary(day)
    jobs = (
        DeliveryJob.objects.filter(availability=day, archived_at__isnull=True)
        .select_related('cart', 'cart__receipt', 'cart_line', 'created_by', 'availability')
        .prefetch_related('address_revisions', 'items')
        .order_by('id')
    )
    assignments = [
        {
            'id': a.id,
            'user_id': a.user_id,
            'user_name': a.user.full_name,
            'role': a.role,
            'display_order': a.display_order,
        }
        for a in day.assignments.select_related('user').order_by('display_order', 'id')
    ]
    summary['assignments'] = assignments
    summary['jobs'] = DeliveryJobSerializer(jobs, many=True).data
    summary['items'] = [
        {
            'id': it.id,
            'job_id': it.job_id,
            'sku': it.sku,
            'description': it.description,
            'quantity': it.quantity,
            'position': it.position,
            'is_scannable': it.is_scannable,
            'is_active': it.is_active,
        }
        for it in DeliveryJobItem.objects.filter(job__availability=day, is_active=True).order_by(
            'job_id', 'position', 'id'
        )
    ]
    return summary


@transaction.atomic
def create_day(
    *,
    user,
    day_date: date,
    time_start: time,
    time_end: time,
    crew_size: int = 2,
    assigned_to: str = '',
    notes: str = '',
    primary_driver=None,
    location_id: int | None = None,
) -> DeliveryDay:
    if time_end <= time_start:
        raise ValueError('End time must be after start time.')
    loc_id = location_id or default_location_id()
    if DeliveryDay.objects.filter(
        date=day_date,
        archived_at__isnull=True,
        location_id=loc_id,
    ).exists():
        raise ValueError('A delivery day already exists for that date.')
    day = DeliveryDay.objects.create(
        date=day_date,
        time_start=time_start,
        time_end=time_end,
        crew_size=crew_size,
        assigned_to=(assigned_to or '')[:200],
        notes=(notes or '')[:300],
        is_active=True,
        planning_disposition=DeliveryDay.DISPOSITION_PLANNED,
        primary_driver=primary_driver,
        location_id=loc_id,
    )
    if primary_driver:
        DeliveryDayAssignment.objects.create(
            day=day,
            user=primary_driver,
            role=DeliveryDayAssignment.ROLE_LEAD,
            display_order=0,
        )
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_DAY,
        entity_id=day.id,
        action='create',
        actor=user,
        day=day,
        after=day_snapshot(day),
    )
    return day


@transaction.atomic
def update_day(*, day: DeliveryDay, user, **fields) -> DeliveryDay:
    before = day_snapshot(day)
    update_fields = ['updated_at']
    for key in ('time_start', 'time_end', 'crew_size', 'assigned_to', 'notes', 'is_active', 'planning_disposition'):
        if key in fields and fields[key] is not None:
            setattr(day, key, fields[key])
            update_fields.append(key)
    if 'primary_driver' in fields:
        day.primary_driver = fields['primary_driver']
        update_fields.append('primary_driver')
    if day.time_end <= day.time_start:
        raise ValueError('End time must be after start time.')
    day.save(update_fields=list(set(update_fields)))
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_DAY,
        entity_id=day.id,
        action='update',
        actor=user,
        day=day,
        before=before,
        after=day_snapshot(day),
        reason=str(fields.get('reason') or ''),
    )
    return day


@transaction.atomic
def archive_day(*, day: DeliveryDay, user, reason: str = '') -> DeliveryDay:
    before = day_snapshot(day)
    day.archived_at = timezone.now()
    day.archived_by = user
    day.archive_reason = (reason or '')[:300]
    day.is_active = False
    day.save(update_fields=['archived_at', 'archived_by', 'archive_reason', 'is_active', 'updated_at'])
    record_change(
        entity_type=DeliveryChangeEvent.ENTITY_DAY,
        entity_id=day.id,
        action='archive',
        actor=user,
        day=day,
        before=before,
        after=day_snapshot(day),
        reason=reason,
    )
    return day


@transaction.atomic
def start_or_resume_day_run(*, day: DeliveryDay, user):
    """Today-only start/resume with completed-day immutability."""
    from apps.pos.services.delivery_run import start_or_resume_run

    today = _today()
    if day.date != today:
        raise ValueError('Only today\'s delivery day can be started.')
    if day.archived_at:
        raise ValueError('Archived days cannot be started.')
    if day.planning_disposition != DeliveryDay.DISPOSITION_PLANNED:
        raise ValueError('This day is not planned for execution.')
    existing = day.runs.filter(is_canonical=True).order_by('-id').first()
    if existing and existing.status == DeliveryRun.STATUS_COMPLETED:
        raise PermissionError('DAY_RUN_FINAL')
    return start_or_resume_run(date=day.date, user=user, availability_id=day.id)
