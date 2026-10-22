"""Restoration tracking (E3): each item's path through restoration, where it goes next, and how long it has been.

Nothing new is recorded: the path and the dates already exist on the job.

- **Path** = the kinds of work logged on the bench (``RestorationAction.category``): tested, assembled, repaired,
  salvaged, each with the day it was first done. A salvaged part line (``RestorationOutput`` sent to salvage) also
  counts as salvaged. Inspection alone is not a path step.
- **Stage dates**: queued (``created_at``), sent, bench, holding (``pending_started_at``), done
  (``dispositioned_at``), returned untouched (``returned_at``), then checked back in by Processing
  (``processing_handled_at``).
- **Next** = where restoration sent it (``bench_disposition``: processing, back stock, salvage, online) or, before
  that, where it is meant to go (``intended_destination``). **Landed** = the main item once Processing checked it back
  in: floor, back stock, online, salvage, sold.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from typing import Any

from django.db.models import Min, Prefetch, Q
from django.utils import timezone

from apps.inventory.models import Item, RestorationAction, RestorationJob, RestorationOutput

PATH_STEPS = (
    (RestorationAction.CATEGORY_TEST, 'tested'),
    (RestorationAction.CATEGORY_ASSEMBLE, 'assembled'),
    (RestorationAction.CATEGORY_REPAIR, 'repaired'),
    (RestorationAction.CATEGORY_SALVAGE, 'salvaged'),
)
_STEP_OF = dict(PATH_STEPS)

STAGE_LABEL = {
    RestorationJob.STAGE_QUEUED: 'Queued',
    RestorationJob.STAGE_SENT: 'Sent',
    RestorationJob.STAGE_BENCH: 'On a bench',
    RestorationJob.STAGE_PENDING: 'Holding',
    RestorationJob.STAGE_DONE: 'Done',
    RestorationJob.STAGE_RETURNED: 'Returned untouched',
}
NEXT_LABEL = {
    RestorationJob.BENCH_DISPOSITION_PROCESSING: 'Back to processing',
    RestorationJob.BENCH_DISPOSITION_STORAGE: 'Back stock',
    RestorationJob.BENCH_DISPOSITION_SALVAGE: 'Salvage',
    RestorationJob.BENCH_DISPOSITION_ONLINE_SALES: 'Online sales',
}
INTENDED_LABEL = dict(RestorationJob.INTENDED_DESTINATION_CHOICES)
LANDED_LABEL = {
    'on_shelf': 'Floor',
    'back_storage': 'Back stock',
    'online_sales': 'Online sales',
    'salvage': 'Salvage',
    'processing': 'Processing',
    'restoration': 'Restoration',
}
OPEN_STAGES = (
    RestorationJob.STAGE_QUEUED,
    RestorationJob.STAGE_SENT,
    RestorationJob.STAGE_BENCH,
    RestorationJob.STAGE_PENDING,
)


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _days(start, end) -> float | None:
    if not start:
        return None
    return round(max(0.0, (end - start).total_seconds()) / 86400.0, 1)


def stage_entered_at(job: RestorationJob):
    return {
        RestorationJob.STAGE_QUEUED: job.created_at,
        RestorationJob.STAGE_SENT: job.sent_at or job.created_at,
        RestorationJob.STAGE_BENCH: job.bench_started_at or job.sent_at or job.created_at,
        RestorationJob.STAGE_PENDING: job.pending_started_at or job.updated_at,
        RestorationJob.STAGE_DONE: job.dispositioned_at or job.updated_at,
        RestorationJob.STAGE_RETURNED: job.returned_at or job.updated_at,
    }.get(job.stage, job.updated_at)


def landed(item: Item | None) -> str:
    if item is None:
        return ''
    if item.status == 'sold':
        return 'Sold'
    if item.status in ('scrapped', 'lost'):
        return 'Gone' if item.status == 'lost' else 'Scrapped'
    return LANDED_LABEL.get(item.location or '', item.location or '')


def _path_by_job(job_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    first: dict[int, dict[str, Any]] = defaultdict(dict)
    for row in (
        RestorationAction.objects.filter(job_id__in=job_ids, category__in=list(_STEP_OF))
        .values('job_id', 'category')
        .annotate(first_at=Min('started_at'))
    ):
        first[row['job_id']][_STEP_OF[row['category']]] = row['first_at']
    for row in (
        RestorationOutput.objects.filter(job_id__in=job_ids, seq__gt=0, destination='salvage')
        .values('job_id')
        .annotate(first_at=Min('created_at'))
    ):
        first[row['job_id']].setdefault('salvaged', row['first_at'])
    out = {}
    for job_id in job_ids:
        steps = first.get(job_id, {})
        out[job_id] = [
            {'step': name, 'first_at': _iso(steps[name])}
            for _, name in PATH_STEPS
            if name in steps
        ]
    return out


def tracking_rows(*, scope: str = 'open', days: int = 30, limit: int = 500) -> dict[str, Any]:
    """The restoration list: open jobs (oldest first), or jobs finished in the last ``days``."""
    now = timezone.now()
    qs = RestorationJob.objects.select_related('product').prefetch_related(
        Prefetch('item_check_in__items', queryset=Item.objects.order_by('id')),
    )
    if scope == 'done':
        since = now - timedelta(days=max(1, days))
        qs = qs.filter(
            Q(stage=RestorationJob.STAGE_DONE, dispositioned_at__gte=since)
            | Q(stage=RestorationJob.STAGE_RETURNED, returned_at__gte=since),
        ).order_by('-dispositioned_at', '-returned_at', '-id')
    else:
        # Open = still in restoration, or finished but not yet checked back in by Processing.
        qs = qs.filter(
            Q(stage__in=OPEN_STAGES)
            | Q(stage__in=(RestorationJob.STAGE_DONE, RestorationJob.STAGE_RETURNED), processing_handled_at__isnull=True),
        ).order_by('created_at', 'id')
    jobs = list(qs[:limit])
    paths = _path_by_job([j.pk for j in jobs])

    rows = []
    for job in jobs:
        items = list(job.item_check_in.items.all()) if job.item_check_in_id else []
        main = items[0] if items else None
        finished_at = job.dispositioned_at or job.returned_at
        end = job.processing_handled_at or now
        entered = stage_entered_at(job)
        awaiting_processing = job.stage in (RestorationJob.STAGE_DONE, RestorationJob.STAGE_RETURNED) and not job.processing_handled_at
        if job.bench_disposition:
            next_label = NEXT_LABEL.get(job.bench_disposition, job.bench_disposition)
        elif job.stage == RestorationJob.STAGE_RETURNED:
            next_label = 'Back to processing'
        elif job.intended_destination:
            next_label = f'Meant for {INTENDED_LABEL.get(job.intended_destination, job.intended_destination).lower()}'
        else:
            next_label = ''
        rows.append({
            'job_id': job.pk,
            'sku': main.sku if main else '',
            'title': getattr(job.product, 'title', '') or '',
            'quantity': job.quantity,
            'stage': job.stage,
            'stage_label': 'Waiting for processing' if awaiting_processing else STAGE_LABEL.get(job.stage, job.stage),
            'path': paths.get(job.pk, []),
            'next': next_label,
            'landed': landed(main) if job.processing_handled_at else '',
            'sent_at': _iso(job.created_at),
            'bench_started_at': _iso(job.bench_started_at),
            'finished_at': _iso(finished_at),
            'checked_back_at': _iso(job.processing_handled_at),
            'days_in_restoration': _days(job.created_at, end),
            'days_in_stage': _days(entered, now) if not job.processing_handled_at else None,
            'final_grade': job.final_grade,
            'value_added': str(job.value_added) if job.value_added is not None else None,
        })

    in_progress = [r for r in rows if r['checked_back_at'] is None]
    ages = sorted(r['days_in_restoration'] for r in in_progress if r['days_in_restoration'] is not None)
    return {
        'scope': 'done' if scope == 'done' else 'open',
        'days': days if scope == 'done' else None,
        'count': len(rows),
        'truncated': len(jobs) >= limit,
        'summary': {
            'by_stage': {
                label: sum(1 for r in in_progress if r['stage_label'] == label)
                for label in [*(STAGE_LABEL[s] for s in OPEN_STAGES), 'Waiting for processing']
            },
            'median_days': ages[len(ages) // 2] if ages else None,
            'over_30_days': sum(1 for a in ages if a > 30),
        },
        'rows': rows,
    }
