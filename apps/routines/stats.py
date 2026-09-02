"""Per-routine run history for the Admin control page.

One pass over runs for every routine at once, so the page costs a handful of
queries however many routines there are.
"""
from __future__ import annotations

from django.db.models import Count, Max, Min, Q
from django.utils import timezone

from .models import Routine, RoutineRun
from .schedule import is_overdue, resolve_assignees


def empty_stats() -> dict:
    return {
        'done': 0,
        'passed': 0,
        'critical_fails': 0,
        'open': 0,
        'overdue': 0,
        'missed': 0,
        'last_completed_at': None,
        'last_completed_by_name': None,
        'next_due_at': None,
        'assignee_count': 0,
    }


def routine_stats(routines: list[Routine], *, now=None) -> dict[int, dict]:
    now = now or timezone.now()
    ids = [routine.pk for routine in routines]
    out = {pk: empty_stats() for pk in ids}
    if not ids:
        return out

    rows = (
        RoutineRun.objects.filter(routine_id__in=ids)
        .values('routine_id')
        .annotate(
            done=Count('id', filter=Q(status=RoutineRun.STATUS_DONE)),
            passed=Count('id', filter=Q(
                status=RoutineRun.STATUS_DONE,
                submission__failed_count=0,
                submission__has_critical_fail=False,
            )),
            critical_fails=Count('id', filter=Q(
                status=RoutineRun.STATUS_DONE, submission__has_critical_fail=True,
            )),
            open=Count('id', filter=Q(status=RoutineRun.STATUS_OPEN)),
            missed=Count('id', filter=Q(status=RoutineRun.STATUS_MISSED)),
            last_completed_at=Max('completed_at', filter=Q(status=RoutineRun.STATUS_DONE)),
            next_due_at=Min('due_at', filter=Q(status=RoutineRun.STATUS_OPEN)),
        )
    )
    last_by_routine: dict[int, object] = {}
    for row in rows:
        stats = out[row['routine_id']]
        for key in ('done', 'passed', 'critical_fails', 'open', 'missed', 'last_completed_at', 'next_due_at'):
            stats[key] = row[key]
        if row['last_completed_at']:
            last_by_routine[row['routine_id']] = row['last_completed_at']

    if last_by_routine:
        finished = RoutineRun.objects.filter(
            status=RoutineRun.STATUS_DONE,
            routine_id__in=list(last_by_routine),
            completed_at__in=list(last_by_routine.values()),
        ).select_related('completed_by')
        for run in finished:
            if last_by_routine.get(run.routine_id) == run.completed_at and run.completed_by_id:
                out[run.routine_id]['last_completed_by_name'] = run.completed_by.full_name

    # Overdue depends on each routine's own deadline rule, so it is counted in
    # Python rather than in SQL.
    by_id = {routine.pk: routine for routine in routines}
    open_runs = RoutineRun.objects.filter(
        routine_id__in=ids, status=RoutineRun.STATUS_OPEN,
    )
    for run in open_runs:
        run.routine = by_id[run.routine_id]
        if is_overdue(run, now=now):
            out[run.routine_id]['overdue'] += 1

    for routine in routines:
        out[routine.pk]['assignee_count'] = resolve_assignees(routine).count()
    return out
