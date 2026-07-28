"""Append-only DeliveryChangeEvent writers plus the read side used by Desk history."""

from __future__ import annotations

from typing import Any

from django.db.models import Q, QuerySet

from apps.pos.models import DeliveryChangeEvent, DeliveryDay, DeliveryJob, DeliveryJobItem


def record_change(
    *,
    entity_type: str,
    entity_id: int,
    action: str,
    actor=None,
    day: DeliveryDay | None = None,
    job: DeliveryJob | None = None,
    reason: str = '',
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> DeliveryChangeEvent:
    return DeliveryChangeEvent.objects.create(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor=actor,
        day=day,
        job=job,
        reason=(reason or '')[:300],
        before=before or {},
        after=after or {},
    )


def job_snapshot(job: DeliveryJob) -> dict[str, Any]:
    return {
        'id': job.id,
        'status': job.status,
        'scheduled_date': job.scheduled_date.isoformat() if job.scheduled_date else None,
        'availability_id': job.availability_id,
        'customer_name': job.customer_name,
        'phone': job.phone,
        'address': job.address,
        'is_apt': job.is_apt,
        'unit': job.unit,
        'items_delivered': job.items_delivered,
        'item_count': job.item_count,
        'notes': job.notes,
        'archived_at': job.archived_at.isoformat() if job.archived_at else None,
    }


def day_snapshot(day: DeliveryDay) -> dict[str, Any]:
    return {
        'id': day.id,
        'date': day.date.isoformat(),
        'time_start': day.time_start.isoformat() if day.time_start else None,
        'time_end': day.time_end.isoformat() if day.time_end else None,
        'crew_size': day.crew_size,
        'assigned_to': day.assigned_to,
        'is_active': day.is_active,
        'planning_disposition': day.planning_disposition,
        'primary_driver_id': day.primary_driver_id,
        'archived_at': day.archived_at.isoformat() if day.archived_at else None,
    }


def item_snapshot(item: DeliveryJobItem) -> dict[str, Any]:
    return {
        'id': item.id,
        'job_id': item.job_id,
        'sku': item.sku,
        'description': item.description,
        'quantity': item.quantity,
        'position': item.position,
        'is_active': item.is_active,
        'is_scannable': item.is_scannable,
    }


# ── Read side ────────────────────────────────────────────────────────────────
# The audit table was write-only until Desk needed a history timeline. Reads stay
# here so the field vocabulary lives next to the snapshot writers above.

HISTORY_PAGE_LIMIT = 200

_ACTION_LABELS = {
    (DeliveryChangeEvent.ENTITY_DAY, 'create'): 'Day created',
    (DeliveryChangeEvent.ENTITY_DAY, 'update'): 'Day updated',
    (DeliveryChangeEvent.ENTITY_DAY, 'archive'): 'Day archived',
    (DeliveryChangeEvent.ENTITY_JOB, 'create'): 'Delivery created',
    (DeliveryChangeEvent.ENTITY_JOB, 'update'): 'Delivery updated',
    (DeliveryChangeEvent.ENTITY_JOB, 'schedule'): 'Scheduled',
    (DeliveryChangeEvent.ENTITY_JOB, 'archive'): 'Delivery archived',
    (DeliveryChangeEvent.ENTITY_JOB, 'restore'): 'Delivery restored',
    (DeliveryChangeEvent.ENTITY_ITEM, 'create'): 'Item added',
    (DeliveryChangeEvent.ENTITY_ITEM, 'update'): 'Item updated',
    (DeliveryChangeEvent.ENTITY_ITEM, 'remove'): 'Item removed',
}

_FIELD_LABELS = {
    'address': 'address',
    'assigned_to': 'crew',
    'availability_id': 'day',
    'crew_size': 'crew size',
    'customer_name': 'customer',
    'description': 'description',
    'is_active': 'active flag',
    'is_apt': 'apartment flag',
    'item_count': 'item count',
    'items_delivered': 'delivered count',
    'notes': 'notes',
    'phone': 'phone',
    'planning_disposition': 'planning state',
    'primary_driver_id': 'driver',
    'quantity': 'quantity',
    'scheduled_date': 'date',
    'sku': 'SKU',
    'status': 'status',
    'time_end': 'end time',
    'time_start': 'start time',
    'unit': 'unit',
}


def changed_fields(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """Keys whose value actually moved, ignoring keys absent from either side."""
    return sorted(k for k in set(before) & set(after) if before.get(k) != after.get(k))


def describe_change(event: DeliveryChangeEvent) -> str:
    """One human line for a timeline row."""
    label = _ACTION_LABELS.get((event.entity_type, event.action)) or (
        f'{event.entity_type.capitalize()} {event.action.replace("_", " ")}'
    )
    before = event.before or {}
    after = event.after or {}
    fields = changed_fields(before, after)
    if 'status' in fields:
        return f'{label} · status {before.get("status")} → {after.get("status")}'
    if 'scheduled_date' in fields:
        return f'{label} · {before.get("scheduled_date") or "unscheduled"} → {after.get("scheduled_date")}'
    if fields:
        named = ', '.join(_FIELD_LABELS.get(f, f.replace('_', ' ')) for f in fields[:4])
        more = f' +{len(fields) - 4} more' if len(fields) > 4 else ''
        return f'{label} · {named}{more}'
    return label


def serialize_change_event(event: DeliveryChangeEvent) -> dict[str, Any]:
    actor = event.actor
    return {
        'id': event.id,
        'entity_type': event.entity_type,
        'entity_id': event.entity_id,
        'day_id': event.day_id,
        'job_id': event.job_id,
        'action': event.action,
        'summary': describe_change(event),
        'reason': event.reason,
        'changed_fields': changed_fields(event.before or {}, event.after or {}),
        'before': event.before or {},
        'after': event.after or {},
        'actor_id': event.actor_id,
        'actor_name': (getattr(actor, 'full_name', '') or actor.username) if actor else '',
        'created_at': event.created_at.isoformat(),
    }


def _history_base() -> QuerySet[DeliveryChangeEvent]:
    return DeliveryChangeEvent.objects.select_related('actor').order_by('-created_at', '-id')


def day_history_queryset(day_id: int) -> QuerySet[DeliveryChangeEvent]:
    """Day events plus every job event for jobs currently on the day."""
    job_ids = list(DeliveryJob.objects.filter(availability_id=day_id).values_list('id', flat=True))
    condition = Q(day_id=day_id) | Q(entity_type=DeliveryChangeEvent.ENTITY_DAY, entity_id=day_id)
    if job_ids:
        condition |= Q(job_id__in=job_ids)
        condition |= Q(entity_type=DeliveryChangeEvent.ENTITY_JOB, entity_id__in=job_ids)
    return _history_base().filter(condition)


def job_history_queryset(job_id: int) -> QuerySet[DeliveryChangeEvent]:
    return _history_base().filter(
        Q(job_id=job_id) | Q(entity_type=DeliveryChangeEvent.ENTITY_JOB, entity_id=job_id)
    )
