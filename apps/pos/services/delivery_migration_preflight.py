"""Read-only conflict report for Delivery Day migration / constraint rollout."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any

from django.db.models import Count

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import (
    CartLine,
    DeliveryAttachment,
    DeliveryAvailability,
    DeliveryJob,
    DeliveryRun,
)
from apps.pos.services.delivery_run import resolved_delivery_item_count

SOURCE_CART_LINES_RE = re.compile(
    r'Source cart lines:\s*([0-9,\s]+)',
    re.IGNORECASE,
)


@dataclass
class ConflictBucket:
    code: str
    title: str
    severity: str  # blocker | warning
    count: int = 0
    samples: list[dict[str, Any]] = field(default_factory=list)

    def add(self, sample: dict[str, Any], *, limit: int = 25) -> None:
        self.count += 1
        if len(self.samples) < limit:
            self.samples.append(sample)


def _parse_source_cart_line_ids(notes: str) -> list[int] | None:
    if not notes:
        return None
    match = SOURCE_CART_LINES_RE.search(notes)
    if not match:
        return None
    ids: list[int] = []
    for part in match.group(1).split(','):
        part = part.strip()
        if not part:
            continue
        try:
            ids.append(int(part))
        except ValueError:
            return []
    return ids


def report_delivery_migration_conflicts(*, sample_limit: int = 25) -> dict[str, Any]:
    """Return a structured conflict report. Does not mutate data."""
    buckets = {
        'duplicate_day_dates': ConflictBucket(
            'duplicate_day_dates',
            'Duplicate DeliveryAvailability rows for the same date',
            'blocker',
        ),
        'date_fk_mismatch': ConflictBucket(
            'date_fk_mismatch',
            'Job scheduled_date differs from linked availability.date',
            'blocker',
        ),
        'orphan_scheduled_jobs': ConflictBucket(
            'orphan_scheduled_jobs',
            'Scheduled jobs with a date but no availability row for that date',
            'blocker',
        ),
        'multiple_open_runs': ConflictBucket(
            'multiple_open_runs',
            'Multiple non-completed runs for the same date',
            'blocker',
        ),
        'completed_runs_without_availability': ConflictBucket(
            'completed_runs_without_availability',
            'Completed runs with no availability_id (orphan day linkage)',
            'warning',
        ),
        'malformed_source_line_ids': ConflictBucket(
            'malformed_source_line_ids',
            'Board jobs with Source cart lines notes that cannot be resolved',
            'warning',
        ),
        'item_count_mismatch': ConflictBucket(
            'item_count_mismatch',
            'Stored job.item_count differs from resolved quantity',
            'warning',
        ),
        'ambiguous_assigned_to': ConflictBucket(
            'ambiguous_assigned_to',
            'assigned_to text does not uniquely match one active employee',
            'warning',
        ),
        'multiple_active_locations': ConflictBucket(
            'multiple_active_locations',
            'Multiple active WorkLocations make default Day location ambiguous',
            'blocker',
        ),
        'attachment_orphans': ConflictBucket(
            'attachment_orphans',
            'Attachments whose stop does not belong to the attachment run',
            'blocker',
        ),
    }

    active_locations = list(
        WorkLocation.objects.filter(is_active=True).order_by('id').values('id', 'name')
    )
    if len(active_locations) > 1:
        buckets['multiple_active_locations'].add(
            {'active_location_count': len(active_locations), 'locations': active_locations},
            limit=sample_limit,
        )
        buckets['multiple_active_locations'].count = len(active_locations)

    date_counts = (
        DeliveryAvailability.objects.values('date')
        .annotate(n=Count('id'))
        .filter(n__gt=1)
        .order_by('date')
    )
    for row in date_counts:
        ids = list(
            DeliveryAvailability.objects.filter(date=row['date'])
            .order_by('id')
            .values_list('id', flat=True)
        )
        buckets['duplicate_day_dates'].add(
            {'date': row['date'].isoformat(), 'ids': ids, 'count': row['n']},
            limit=sample_limit,
        )

    jobs = DeliveryJob.objects.select_related('availability', 'cart_line').all()
    avail_dates = set(DeliveryAvailability.objects.values_list('date', flat=True))

    for job in jobs.iterator(chunk_size=200):
        if job.availability_id and job.scheduled_date and job.availability:
            if job.scheduled_date != job.availability.date:
                buckets['date_fk_mismatch'].add(
                    {
                        'job_id': job.id,
                        'scheduled_date': job.scheduled_date.isoformat(),
                        'availability_id': job.availability_id,
                        'availability_date': job.availability.date.isoformat(),
                    },
                    limit=sample_limit,
                )
        if (
            job.scheduled_date
            and job.status == DeliveryJob.STATUS_SCHEDULED
            and job.scheduled_date not in avail_dates
            and not job.availability_id
        ):
            buckets['orphan_scheduled_jobs'].add(
                {
                    'job_id': job.id,
                    'scheduled_date': job.scheduled_date.isoformat(),
                    'customer_name': job.customer_name,
                },
                limit=sample_limit,
            )

        parsed = _parse_source_cart_line_ids(job.notes or '')
        if parsed is not None:
            if not parsed:
                buckets['malformed_source_line_ids'].add(
                    {'job_id': job.id, 'reason': 'unparseable_ids'},
                    limit=sample_limit,
                )
            else:
                existing = set(
                    CartLine.objects.filter(pk__in=parsed).values_list('id', flat=True)
                )
                missing = [i for i in parsed if i not in existing]
                if missing:
                    buckets['malformed_source_line_ids'].add(
                        {
                            'job_id': job.id,
                            'reason': 'missing_cart_lines',
                            'missing_ids': missing,
                        },
                        limit=sample_limit,
                    )
                elif job.cart_id:
                    wrong_cart = list(
                        CartLine.objects.filter(pk__in=parsed)
                        .exclude(cart_id=job.cart_id)
                        .values_list('id', flat=True)
                    )
                    if wrong_cart:
                        buckets['malformed_source_line_ids'].add(
                            {
                                'job_id': job.id,
                                'reason': 'wrong_cart',
                                'line_ids': wrong_cart,
                            },
                            limit=sample_limit,
                        )

        try:
            resolved = resolved_delivery_item_count(job)
            stored = int(job.item_count or 1)
        except (TypeError, ValueError):
            resolved = 1
            stored = 1
        if resolved != stored:
            buckets['item_count_mismatch'].add(
                {
                    'job_id': job.id,
                    'stored': stored,
                    'resolved': resolved,
                },
                limit=sample_limit,
            )

    open_runs = (
        DeliveryRun.objects.exclude(status=DeliveryRun.STATUS_COMPLETED)
        .values('date')
        .annotate(n=Count('id'))
        .filter(n__gt=1)
        .order_by('date')
    )
    for row in open_runs:
        ids = list(
            DeliveryRun.objects.filter(date=row['date'])
            .exclude(status=DeliveryRun.STATUS_COMPLETED)
            .order_by('id')
            .values_list('id', flat=True)
        )
        buckets['multiple_open_runs'].add(
            {'date': row['date'].isoformat(), 'run_ids': ids, 'count': row['n']},
            limit=sample_limit,
        )

    for run in (
        DeliveryRun.objects.filter(
            status=DeliveryRun.STATUS_COMPLETED,
            availability_id__isnull=True,
        )
        .order_by('id')
        .iterator(chunk_size=200)
    ):
        buckets['completed_runs_without_availability'].add(
            {'run_id': run.id, 'date': run.date.isoformat()},
            limit=sample_limit,
        )

    assigned_values = list(
        DeliveryAvailability.objects.exclude(assigned_to='')
        .values_list('id', 'assigned_to')
    )
    active_users = list(User.objects.filter(is_active=True))
    for avail_id, assigned_to in assigned_values:
        text = (assigned_to or '').strip()
        if not text:
            continue
        # Exact unique active employee match on full name only.
        exact = [u for u in active_users if u.full_name.strip().lower() == text.lower()]
        if len(exact) != 1:
            buckets['ambiguous_assigned_to'].add(
                {
                    'availability_id': avail_id,
                    'assigned_to': text,
                    'exact_match_count': len(exact),
                },
                limit=sample_limit,
            )

    for att in (
        DeliveryAttachment.objects.filter(stop__isnull=False)
        .select_related('stop')
        .iterator(chunk_size=200)
    ):
        if att.stop_id and att.stop.run_id != att.run_id:
            buckets['attachment_orphans'].add(
                {
                    'attachment_id': att.id,
                    'run_id': att.run_id,
                    'stop_id': att.stop_id,
                    'stop_run_id': att.stop.run_id,
                },
                limit=sample_limit,
            )

    blocker_count = sum(b.count for b in buckets.values() if b.severity == 'blocker')
    warning_count = sum(b.count for b in buckets.values() if b.severity == 'warning')
    return {
        'ok_for_constraints': blocker_count == 0,
        'blocker_count': blocker_count,
        'warning_count': warning_count,
        'active_location_count': len(active_locations),
        'default_location_id': active_locations[0]['id'] if len(active_locations) == 1 else None,
        'buckets': {code: asdict(bucket) for code, bucket in buckets.items()},
    }
