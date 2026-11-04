"""Clock-in rules the Wi-Fi time clock pilot (``wifi_clock.py``) reads.

The time kiosk itself was removed (Dash Update #64, 2026-11-03). What is left here is only what the pilot's shadow
mode checks before a would-be clock-in: who counts as staff, the open punch, a stale punch, and the clock-in gate
(missed ``gate_on_miss`` routines with no reason yet, and pending nudges). The time helpers live in
``services/forgotten_punch.py``.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from apps.hr.models import TimeEntry
from apps.hr.services.forgotten_punch import is_stale, local_now, suggested_clock_out
from apps.hr.shifts import active_punch_codes

__all__ = [
    'STAFF_ROLES', 'GATE_WINDOW_DAYS', 'active_punch_codes', 'build_gate', 'is_stale', 'local_now',
    'missed_runs_for', 'open_punch_for', 'pending_nudges',
]

GATE_WINDOW_DAYS = 30
STAFF_ROLES = ('Employee', 'Manager', 'Admin')


def open_punch_for(user) -> TimeEntry | None:
    return (
        TimeEntry.objects.filter(employee=user, clock_out__isnull=True)
        .order_by('-clock_in')
        .first()
    )


def missed_runs_for(user, *, now: datetime) -> list:
    """Missed, owned, gate_on_miss runs with no reason yet, due within the window."""
    from apps.routines.models import RoutineRun
    return list(
        RoutineRun.objects.filter(
            assigned_to=user,
            status=RoutineRun.STATUS_MISSED,
            routine__gate_on_miss=True,
            routine__is_active=True,
            miss_reason='',
            due_at__lte=now,
            due_at__gte=now - timedelta(days=GATE_WINDOW_DAYS),
        )
        .select_related('routine')
        .order_by('due_at', 'id')
    )


def pending_nudges(user, *, now: datetime) -> list:
    from apps.routines.command_center import pending_nudges_for
    return pending_nudges_for(user, now=now)


def build_gate(user, punch: TimeEntry | None, *, now: datetime) -> list[dict]:
    gate: list[dict] = []
    if is_stale(punch, now):
        gate.append({
            'kind': 'stale_punch',
            'since': punch.clock_in,
            'suggested_clock_out': suggested_clock_out(punch, now=now),
        })
    runs = missed_runs_for(user, now=now)
    if runs:
        gate.append({
            'kind': 'missed_routines',
            'runs': [
                {
                    'id': run.pk,
                    'title': run.routine.title,
                    'due_at': run.due_at,
                    'subject': run.subject or '',
                }
                for run in runs
            ],
        })
    nudges = pending_nudges(user, now=now)
    if nudges:
        gate.append({
            'kind': 'nudge',
            'nudges': [
                {
                    'id': row.pk,
                    'message': row.message or '',
                    'routine_title': row.run.routine.title if row.run_id else '',
                    'created_at': row.created_at,
                }
                for row in nudges
            ],
        })
    return gate
