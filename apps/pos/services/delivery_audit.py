"""Append-only DeliveryChangeEvent writers."""

from __future__ import annotations

from typing import Any

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
