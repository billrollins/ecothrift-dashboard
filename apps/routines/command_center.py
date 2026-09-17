"""Command Center board: statuses, issues, call-ins, and week tiles.

Scoring stays in grading.py. This module only names what that engine already
knows and adds the live attendance / overdue words the page prints.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.hr.models import Shift, ShiftAssignment, TimeEntry
from apps.hr.shifts import shift_department, shift_label
from apps.webstore.services.hours import (
    _local_now,
    _parse_hhmm,
    close_on,
    effective_day,
    get_hours_config,
    is_open_day,
)

from .grading import (
    closed_section_ids,
    day_grade,
    expected_parts,
    this_monday,
    week_grade,
    week_label,
)
from .models import QaCallIn, QaDayExclusion, QaDayOverride, QaNudge, Routine, RoutineRun, Section
from .schedule import (
    SYSTEM_CLOSE,
    SYSTEM_CROSS_CHECK,
    SYSTEM_DAY,
    SYSTEM_OPEN,
    SYSTEM_OWNER_SPOT,
    SYSTEM_TALLY,
    SYSTEM_WORK_CYCLE,
    cross_check_day_for,
    due_at_for,
    hard_at_for,
    maybe_draw_spot,
    week_days,
)
from .settings import (
    CALL_IN_UNDO_SECONDS,
    LATE_AMBER_MINUTES,
    LATE_RED_MINUTES,
    NUDGE_UNSEEN_MINUTES,
    SECTION_DUE_AFTER_PUNCH_MINUTES,
    SPOT_ISSUE_HOURS_AFTER_OPEN,
    SPOT_ISSUE_HOURS_BEFORE_CLOSE,
)

User = get_user_model()

PERFORMED = (SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE)
CALL_IN_KEYS = (SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE, SYSTEM_TALLY, SYSTEM_CROSS_CHECK)
PERFORMED_TITLES = {
    SYSTEM_OPEN: 'Retail open',
    SYSTEM_DAY: 'Retail day',
    SYSTEM_CLOSE: 'Retail close',
}

STATUS_DONE = 'Done'
STATUS_EXPECTED = 'Expected'
STATUS_DUE = 'Due'
STATUS_OVERDUE = 'Overdue'
STATUS_MISSED = 'Missed'
STATUS_NOT_TALLIED = 'Not tallied'
STATUS_IN = 'In'
STATUS_LATE = 'Late'
STATUS_CALLED_IN = 'Called in'
STATUS_LEFT = 'Left'
STATUS_UNASSIGNED = 'Unassigned'
STATUS_OFF = 'Off'
STATUS_CLOSED = 'Closed'
STATUS_PROJECTED = 'Projected'
STATUS_NOT_DONE = 'Not done'
STATUS_VALIDATED = 'Validated'
STATUS_ISSUES_FOUND = 'Issues found'

RAW_STATUS = {
    'done': STATUS_DONE,
    'late': STATUS_DONE,
    'in_progress': STATUS_DUE,
    'not_started': STATUS_DUE,
    'not_assigned': STATUS_UNASSIGNED,
    'missed': STATUS_MISSED,
    'open': STATUS_DUE,
    'own_part': STATUS_DUE,
    'projected': STATUS_PROJECTED,
}


def status_word(raw: str | None) -> str:
    """Map a stored or engine key to a printed word. Never return the raw key."""
    if not raw:
        return STATUS_DUE
    if raw in (
        STATUS_DONE, STATUS_EXPECTED, STATUS_DUE, STATUS_OVERDUE, STATUS_MISSED,
        STATUS_NOT_TALLIED, STATUS_IN, STATUS_LATE, STATUS_CALLED_IN, STATUS_LEFT, STATUS_UNASSIGNED,
        STATUS_OFF, STATUS_CLOSED, STATUS_PROJECTED, STATUS_NOT_DONE, STATUS_VALIDATED,
        STATUS_ISSUES_FOUND,
    ):
        return raw
    return RAW_STATUS.get(str(raw).strip().lower(), STATUS_DUE)


def short_day(day: date) -> str:
    return f'{day.strftime("%a")} {day.strftime("%b")} {day.day}'


def closed_label(day: date) -> str:
    return f'Store closed {short_day(day)}'


def due_date_label(day: date) -> str:
    return f'due {short_day(day)}'


def clock_hhmm(value: time | datetime | None) -> str:
    if value is None:
        return ''
    if isinstance(value, datetime):
        value = timezone.localtime(value).time()
    return value.strftime('%H:%M')


def open_on(day: date, *, cfg: dict | None = None, tz: ZoneInfo | None = None):
    cfg = cfg or get_hours_config()
    if tz is None:
        tz = ZoneInfo(cfg.get('timezone') or 'America/Chicago')
    hours = effective_day(day, cfg=cfg)
    open_t = _parse_hhmm(hours.open_hhmm)
    return timezone.make_aware(datetime.combine(day, open_t), tz)


def at_clock(day: date, clock: time, tz) -> datetime:
    return timezone.make_aware(datetime.combine(day, clock), tz)


def can_call_in_on(day: date, *, today: date | None = None) -> bool:
    today = today or timezone.localdate()
    sunday = today + timedelta(days=(6 - today.weekday()))
    return today <= day <= sunday


def _person(user) -> dict | None:
    if user is None:
        return None
    return {'id': user.pk, 'name': user.full_name}


def performed_title(key: str, run=None) -> str:
    title = getattr(getattr(run, 'routine', None), 'title', '') or ''
    if title and '.' not in title:
        return title
    return PERFORMED_TITLES.get(key, title or key)


def assignment_for(user_id: int, day: date) -> ShiftAssignment | None:
    for row in ShiftAssignment.objects.filter(
        employee_id=user_id, shift__is_active=True,
    ).select_related('shift', 'shift__department'):
        if row.runs_on(day):
            return row
    return None


def owner_start_on(user_id: int, day: date, tz) -> datetime | None:
    """Clock-in start if this person is on today's roster or a one-day override."""
    assignment = assignment_for(user_id, day)
    if assignment:
        return at_clock(day, assignment.shift.time_in, tz)
    override = (
        QaDayOverride.objects.filter(employee_id=user_id, date=day)
        .select_related('shift')
        .first()
    )
    if override is None:
        return None
    clock = override.time_in or override.shift.time_in
    return at_clock(day, clock, tz) if clock else None


def shift_end_on(shift: Shift, day: date, tz) -> datetime:
    if shift.time_out <= shift.time_in:
        return at_clock(day + timedelta(days=1), shift.time_out, tz)
    return at_clock(day, shift.time_out, tz)


def miss_boundary(run: RoutineRun, day: date, tz, hours_cfg=None) -> datetime:
    """Overdue until this instant; Missed after. Shift end, else store close."""
    if run.assigned_to_id:
        row = assignment_for(run.assigned_to_id, day)
        if row:
            return shift_end_on(row.shift, day, tz)
    shift = locked_shift_for(getattr(run, 'routine', None))
    if shift:
        return shift_end_on(shift, day, tz)
    return close_on(day, cfg=hours_cfg, tz=tz)


def locked_shift_for(routine) -> Shift | None:
    if routine is None:
        return None
    if getattr(routine, 'shift_id', None):
        return routine.shift
    code = punch_code_for_routine(routine)
    if not code:
        return None
    return Shift.objects.filter(is_active=True, punch_code=code).first()


def resolve_shift_owner(routine, day: date, *, punches: dict, call_ins: set[int]):
    """Punched on the locked shift, else scheduled (grey), else nobody.

    Does not persist assigned_to for a scheduled-only name.
    """
    punched = [user for user in punched_on_code(day, punch_code_for_routine(routine)) if user.pk not in call_ins]
    scheduled = scheduled_for_routine(routine, day, call_ins)
    if punched:
        return punched[0], 'in', scheduled
    if scheduled:
        return scheduled[0], 'scheduled', scheduled
    return None, None, scheduled


def routine_due_at(run: RoutineRun | None, day: date, tz, hours_cfg=None):
    if run is None:
        return None
    if getattr(run, 'routine', None):
        return due_at_for(run.routine, day, tz=tz, cfg=hours_cfg)
    due = run.due_at
    if due is not None and timezone.is_naive(due):
        due = timezone.make_aware(due, tz)
    return due


def routine_hard_at(run: RoutineRun | None, day: date, tz, hours_cfg=None):
    if run is None or not getattr(run, 'routine', None):
        return None
    return hard_at_for(run.routine, day, tz=tz, cfg=hours_cfg)


def job_urgency(status: str, *, hard, now) -> str | None:
    if status == STATUS_DUE:
        return 'due'
    if status == STATUS_MISSED:
        return 'missed'
    if status == STATUS_OVERDUE:
        if hard is not None and now >= hard:
            return 'hard'
        return 'overdue'
    return None


def routine_live_status(run: RoutineRun | None, *, day: date, now: datetime, tz, hours_cfg=None) -> str:
    if run is None:
        return STATUS_UNASSIGNED
    if run.status == RoutineRun.STATUS_DONE:
        return STATUS_DONE
    if run.assigned_to_id is None:
        return STATUS_UNASSIGNED
    due = routine_due_at(run, day, tz, hours_cfg)
    boundary = miss_boundary(run, day, tz, hours_cfg)
    if due is not None and now < due:
        return STATUS_DUE
    if now < boundary:
        return STATUS_OVERDUE
    return STATUS_MISSED


def fire_hard_deadline_nudges(day: date, *, now: datetime, tz, hours_cfg=None) -> None:
    """Write one auto nudge per open Open/Day/Close run that has passed hard_time."""
    for key in PERFORMED:
        run = RoutineRun.objects.filter(
            routine__system_key=key, period_key=day.isoformat(),
        ).select_related('routine', 'assigned_to').first()
        if run is None or run.status == RoutineRun.STATUS_DONE:
            continue
        hard = routine_hard_at(run, day, tz, hours_cfg)
        if hard is None or now < hard:
            continue
        if now >= miss_boundary(run, day, tz, hours_cfg):
            continue
        if QaNudge.objects.filter(run=run, source='auto').exists():
            continue
        title = performed_title(key, run)
        create_nudge(
            run=run,
            created_by=None,
            source='auto',
            message=f'{title} is past its hard deadline ({clock_hhmm(hard)}).',
        )


def create_nudge(*, run, message='', created_by=None, source='manual', employee=None) -> QaNudge:
    return QaNudge.objects.create(
        run=run,
        created_by=created_by,
        source=source,
        message=message,
        employee=employee or run.assigned_to,
    )


def latest_nudges(run_ids: list[int]) -> dict[int, QaNudge]:
    found: dict[int, QaNudge] = {}
    if not run_ids:
        return found
    for row in QaNudge.objects.filter(run_id__in=run_ids).select_related('created_by').order_by('created_at'):
        found[row.run_id] = row
    return found


def called_in_ids(day: date) -> set[int]:
    return set(QaCallIn.objects.filter(date=day).values_list('employee_id', flat=True))


def call_in_rows(day: date) -> list[QaCallIn]:
    return list(QaCallIn.objects.filter(date=day).select_related('employee', 'shift', 'marked_by'))


def serialize_call_in(row: QaCallIn) -> dict:
    return {
        'id': row.pk,
        'employee': _person(row.employee),
        'date': row.date.isoformat(),
        'shift_id': row.shift_id,
        'shift_name': row.shift.name if row.shift_id else '',
        'marked_by': _person(row.marked_by),
        'created_at': row.created_at,
        'cleared': row.cleared or [],
    }


def serialize_nudge(row: QaNudge, *, now: datetime | None = None) -> dict:
    local = timezone.localtime(row.created_at)
    now = now or timezone.now()
    ack_label = f'Nudged {local.strftime("%H:%M")}'
    if row.acked_at and row.ack_kind == 'heard':
        ack_label = f'Heard {timezone.localtime(row.acked_at).strftime("%H:%M")}'
    elif row.acked_at and row.ack_kind == 'not_me':
        ack_label = 'Not me'
    elif not row.acked_at and (now - row.created_at).total_seconds() >= NUDGE_UNSEEN_MINUTES * 60:
        ack_label = 'Not seen'
    return {
        'id': row.pk,
        'run_id': row.run_id,
        'created_by': _person(row.created_by),
        'created_at': row.created_at,
        'at_label': local.strftime('%H:%M'),
        'ack_label': ack_label,
        'message': row.message or '',
        'source': row.source,
        'employee': _person(row.employee) if row.employee_id else None,
        'acked_at': row.acked_at,
        'ack_kind': row.ack_kind or '',
        'acked_by_device': row.acked_by_device or '',
    }


def pending_nudges_for(user, *, now: datetime | None = None) -> list[QaNudge]:
    now = now or timezone.now()
    day = timezone.localtime(now).date()
    hours_cfg = get_hours_config()
    tz = ZoneInfo(hours_cfg.get('timezone') or 'America/Chicago')
    fire_hard_deadline_nudges(day, now=now, tz=tz, hours_cfg=hours_cfg)
    return list(
        QaNudge.objects.filter(employee=user, acked_at__isnull=True).select_related(
            'run', 'created_by', 'employee',
        ).order_by('created_at')
    )


def ack_nudge(row: QaNudge, *, kind: str, device: str, now: datetime | None = None) -> QaNudge:
    if kind not in ('heard', 'not_me'):
        raise ValueError('Ack must be heard or not_me.')
    if row.acked_at:
        return row
    row.acked_at = now or timezone.now()
    row.ack_kind = kind
    row.acked_by_device = (device or 'Browser')[:80]
    row.save(update_fields=['acked_at', 'ack_kind', 'acked_by_device'])
    return row


def staff_status(
    *,
    punch: TimeEntry | None,
    called_in: bool,
    start: datetime | None,
    now: datetime,
    on_roster: bool,
) -> tuple[str, int | None, str | None]:
    """Return (status, late_minutes, late_severity)."""
    if punch and punch.clock_out:
        return STATUS_LEFT, None, None
    if punch:
        return STATUS_IN, None, None
    if called_in:
        return STATUS_CALLED_IN, None, None
    if not on_roster:
        return STATUS_OFF, None, None
    if start is None or now < start:
        return STATUS_EXPECTED, None, None
    minutes = int((now - start).total_seconds() // 60)
    if minutes < LATE_AMBER_MINUTES:
        return STATUS_EXPECTED, None, None
    if minutes >= LATE_RED_MINUTES:
        return STATUS_LATE, minutes, 'red'
    return STATUS_LATE, minutes, 'amber'


def format_late_sentence(name: str, minutes: int, shift: str, time_in: str) -> str:
    if minutes > 4 * 60:
        expected = time_in or 'their start'
        return f'{name}: Expected {expected}, not in'
    if minutes >= 60:
        hours, leftover = divmod(minutes, 60)
        return f'{name} is {hours} h {leftover} min late for {shift}.'
    return f'{name} is {minutes} min late for {shift}.'


def punched_on_code(day: date, code: str, *, exclude_id: int | None = None) -> list:
    if not code:
        return []
    qs = TimeEntry.objects.filter(date=day, shift=code, clock_out__isnull=True).select_related('employee')
    if exclude_id:
        qs = qs.exclude(employee_id=exclude_id)
    return [row.employee for row in qs if row.employee_id]


def punch_code_for_routine(routine) -> str:
    if getattr(routine, 'shift_id', None) and routine.shift and routine.shift.punch_code:
        return routine.shift.punch_code
    codes = list(getattr(routine, 'assigned_shifts', None) or [])
    return codes[0] if codes else ''


def excluded_ids(day: date) -> set[int]:
    return set(QaDayExclusion.objects.filter(date=day).values_list('employee_id', flat=True))


def left_ids(day: date) -> set[int]:
    clocked_out = set(
        TimeEntry.objects.filter(date=day, clock_out__isnull=False).values_list('employee_id', flat=True)
    )
    still_in = set(
        TimeEntry.objects.filter(date=day, clock_out__isnull=True).values_list('employee_id', flat=True)
    )
    return clocked_out - still_in


def scheduled_for_routine(routine, day: date, call_ins: set[int]) -> list:
    """People on this routine's shift today, plus overrides, minus call-ins / exclusions / left."""
    if routine is None:
        return []
    blocked = set(call_ins) | excluded_ids(day) | left_ids(day)
    seen: set[int] = set()
    people = []
    shift_ids = set()
    if getattr(routine, 'shift_id', None):
        shift_ids.add(routine.shift_id)
    code = punch_code_for_routine(routine)
    if getattr(routine, 'shift_id', None):
        rows = ShiftAssignment.objects.filter(
            shift_id=routine.shift_id,
        ).select_related('employee', 'shift')
        for row in rows:
            if row.runs_on(day) and row.employee_id not in blocked and row.employee_id not in seen:
                seen.add(row.employee_id)
                people.append(row.employee)
    if code:
        rows = ShiftAssignment.objects.filter(
            shift__is_active=True, shift__punch_code=code,
        ).select_related('employee', 'shift')
        for row in rows:
            shift_ids.add(row.shift_id)
            if row.runs_on(day) and row.employee_id not in blocked and row.employee_id not in seen:
                seen.add(row.employee_id)
                people.append(row.employee)
    for row in QaDayOverride.objects.filter(date=day).select_related('employee', 'shift'):
        match = (row.shift_id in shift_ids) or (code and row.shift.punch_code == code)
        if not match or row.employee_id in blocked or row.employee_id in seen:
            continue
        seen.add(row.employee_id)
        people.append(row.employee)
    return people


def week_roster_ids(monday: date) -> set[int]:
    ids: set[int] = set()
    rows = ShiftAssignment.objects.filter(shift__is_active=True).select_related('shift', 'employee')
    for day in week_days(monday):
        for row in rows:
            if row.runs_on(day):
                ids.add(row.employee_id)
    return ids


def build_staff(day: date, *, now: datetime, tz, today: date) -> list[dict]:
    punches = {
        row.employee_id: row
        for row in TimeEntry.objects.filter(date=day).select_related('employee')
    }
    call_ins = {row.employee_id: row for row in call_in_rows(day)}
    skipped = excluded_ids(day)
    allowed = can_call_in_on(day, today=today)
    scheduled: list[dict] = []
    seen: set[int] = set()

    def row_for(*, user, shift, time_in, time_out, on_roster, added=False):
        punch = punches.get(user.pk)
        start = at_clock(day, time_in, tz) if time_in else None
        status, late_minutes, late_severity = staff_status(
            punch=punch,
            called_in=user.pk in call_ins,
            start=start,
            now=now,
            on_roster=on_roster,
        )
        call = call_ins.get(user.pk)
        in_now = bool(punch) and punch.clock_out is None
        return {
            'id': user.pk,
            'name': user.full_name,
            'role': getattr(user, 'role', '') or '',
            'department': shift.department.name if shift else '',
            'shift_id': shift.pk if shift else None,
            'shift_name': shift.name if shift else '',
            'time_in': time_in.strftime('%H:%M') if time_in else '',
            'time_out': time_out.strftime('%H:%M') if time_out else '',
            'clocked_in': in_now,
            'arrival': punch.clock_in if punch else None,
            'expected_not_in': punch is None and status != STATUS_CALLED_IN,
            'on_roster': on_roster,
            'status': status,
            'late_minutes': late_minutes,
            'late_severity': late_severity,
            'call_in_id': call.pk if call else None,
            'can_call_in': allowed and status in (STATUS_EXPECTED, STATUS_LATE),
            'called_in': status == STATUS_CALLED_IN,
            'added': added,
        }

    for assignment in ShiftAssignment.objects.filter(
        shift__is_active=True,
    ).select_related('employee', 'shift', 'shift__department'):
        if not assignment.runs_on(day):
            continue
        user = assignment.employee
        if user.pk in seen or user.pk in skipped:
            continue
        seen.add(user.pk)
        scheduled.append(row_for(
            user=user, shift=assignment.shift,
            time_in=assignment.shift.time_in, time_out=assignment.shift.time_out,
            on_roster=True,
        ))

    for override in QaDayOverride.objects.filter(date=day).select_related(
        'employee', 'shift', 'shift__department',
    ):
        user = override.employee
        if user.pk in seen or user.pk in skipped:
            continue
        seen.add(user.pk)
        scheduled.append(row_for(
            user=user, shift=override.shift,
            time_in=override.time_in or override.shift.time_in,
            time_out=override.time_out or override.shift.time_out,
            on_roster=True, added=True,
        ))

    for employee_id, punch in punches.items():
        if employee_id in seen or employee_id in skipped:
            continue
        user = punch.employee
        seen.add(user.pk)
        code = punch.shift or ''
        status, late_minutes, late_severity = staff_status(
            punch=punch, called_in=False, start=None, now=now, on_roster=False,
        )
        call = call_ins.get(user.pk)
        scheduled.append({
            'id': user.pk,
            'name': user.full_name,
            'role': getattr(user, 'role', '') or '',
            'department': shift_department(code) if code else '',
            'shift_id': None,
            'shift_name': shift_label(code) if code else '',
            'time_in': '',
            'time_out': '',
            'clocked_in': punch.clock_out is None,
            'arrival': punch.clock_in,
            'expected_not_in': False,
            'on_roster': False,
            'status': status,
            'late_minutes': late_minutes,
            'late_severity': late_severity,
            'call_in_id': call.pk if call else None,
            'can_call_in': False,
            'called_in': False,
            'added': False,
        })

    rank = {
        STATUS_LATE: 0,
        STATUS_EXPECTED: 1,
        STATUS_CALLED_IN: 2,
        STATUS_IN: 3,
        STATUS_LEFT: 4,
        STATUS_OFF: 5,
    }
    scheduled.sort(key=lambda row: (rank.get(row['status'], 9), row['name'] or ''))
    return scheduled


def build_off(day: date, staff: list[dict]) -> list[dict]:
    seen = {row['id'] for row in staff}
    off: list[dict] = []
    for assignment in ShiftAssignment.objects.filter(
        shift__is_active=True,
        employee_id__in=week_roster_ids(this_monday(day)),
    ).select_related('employee', 'shift', 'shift__department'):
        user = assignment.employee
        if user.pk in seen or not user.is_active:
            continue
        seen.add(user.pk)
        off.append({
            'id': user.pk,
            'name': user.full_name,
            'role': getattr(user, 'role', '') or '',
            'department': assignment.shift.department.name,
            'shift_id': assignment.shift_id,
            'shift_name': assignment.shift.name,
            'time_in': assignment.shift.time_in.strftime('%H:%M'),
            'time_out': assignment.shift.time_out.strftime('%H:%M'),
            'clocked_in': False,
            'arrival': None,
            'expected_not_in': False,
            'on_roster': False,
            'status': STATUS_OFF,
            'late_minutes': None,
            'late_severity': None,
            'call_in_id': None,
            'can_call_in': False,
            'called_in': False,
        })
    off.sort(key=lambda row: row['name'] or '')
    return off


def build_jobs(day: date, day_row: dict, *, now: datetime, tz, hours_cfg) -> list[dict]:
    expected_keys, expected_sections = expected_parts(day)
    closed = closed_section_ids(day)
    punches = {
        row.employee_id: row
        for row in TimeEntry.objects.filter(date=day).select_related('employee')
    }
    call_ins = called_in_ids(day)
    jobs: list[dict] = []
    tallies = {
        run.assigned_to_id: run
        for run in RoutineRun.objects.filter(
            routine__system_key=SYSTEM_TALLY, period_key=day.isoformat(),
        ).select_related('assigned_to', 'completed_by', 'routine', 'submission', 'section')
    }
    unassigned_tallies = [
        run for run in RoutineRun.objects.filter(
            routine__system_key=SYSTEM_TALLY,
            period_key=day.isoformat(),
            assigned_to__isnull=True,
        ).select_related('assigned_to', 'completed_by', 'routine', 'submission', 'section')
    ]

    for section in Section.objects.filter(is_active=True).select_related('owner').order_by('sort_order', 'name'):
        if section.pk not in expected_sections:
            continue
        run = tallies.get(section.owner_id)
        if run is None:
            run = next((row for row in unassigned_tallies if row.section_id == section.pk), None)
        if run is None and unassigned_tallies:
            # Per-person tally with no section FK: match leftover unassigned by owner name in subject.
            run = next(
                (row for row in unassigned_tallies if section.name in (row.subject or '')),
                None,
            )
        tallied = False
        if run and run.submission_id:
            for row in (run.submission.responses or {}).get('sections') or []:
                if row.get('section_id') == section.pk:
                    tallied = True
                    break
        if run is None:
            status = STATUS_UNASSIGNED if not section.owner_id else STATUS_NOT_TALLIED
            due_at, due_label, status, owner_late = section_due_state(
                section, run=None, status=STATUS_DONE if tallied else status,
                day=day, now=now, tz=tz, punches=punches, call_ins=call_ins,
            )
            shown, owner_state = section_owner_view(
                section, run=None, status=status, punches=punches,
            )
            jobs.append({
                'group': 'section',
                'key': SYSTEM_TALLY,
                'title': section.name,
                'run_id': None,
                'section_id': section.pk,
                'owner': shown,
                'owner_state': owner_state,
                'owner_late': owner_late,
                'due_at': due_at,
                'due_label': due_label,
                'hard_label': '',
                'urgency': job_urgency(STATUS_DONE if tallied else status, hard=None, now=now),
                'completed_label': clock_hhmm(run.completed_at) if run and run.completed_at else '',
                'status': STATUS_DONE if tallied else status,
                'closed': section.pk in closed,
                'can_close': tallied or section.pk in closed,
                'shift_people': [],
            })
            continue
        status = routine_live_status(run, day=day, now=now, tz=tz, hours_cfg=hours_cfg)
        if tallied:
            status = STATUS_DONE
        due_at, due_label, status, owner_late = section_due_state(
            section, run=run, status=status,
            day=day, now=now, tz=tz, punches=punches, call_ins=call_ins,
        )
        shown, owner_state = section_owner_view(
            section, run=run, status=status, punches=punches,
        )
        jobs.append({
            'group': 'section',
            'key': SYSTEM_TALLY,
            'title': section.name,
            'run_id': run.pk,
            'section_id': section.pk,
            'owner': shown,
            'owner_state': owner_state,
            'owner_late': owner_late,
            'due_at': due_at,
            'due_label': due_label,
            'hard_label': '',
            'urgency': job_urgency(status, hard=None, now=now),
            'completed_label': clock_hhmm(run.completed_at) if run.completed_at else '',
            'status': status,
            'closed': section.pk in closed,
            'can_close': status == STATUS_DONE or section.pk in closed,
            'shift_people': [],
        })

    for key in PERFORMED:
        if key not in expected_keys:
            continue
        run = RoutineRun.objects.filter(
            routine__system_key=key, period_key=day.isoformat(),
        ).select_related('assigned_to', 'completed_by', 'routine', 'routine__shift').first()
        routine = run.routine if run else Routine.objects.filter(system_key=key).select_related('shift').first()
        owner, owner_state, scheduled = resolve_shift_owner(
            routine, day, punches=punches, call_ins=call_ins,
        )
        if run and owner is not None and owner_state == 'in' and run.assigned_to_id != owner.pk:
            run.assigned_to = owner
            run.unassign_key = ''
            run.save(update_fields=['assigned_to', 'unassign_key'])
        if run and owner is None and run.assigned_to_id and run.assigned_to_id not in call_ins:
            owner = run.assigned_to
            owner_state = 'in' if owner.pk in punches else 'scheduled'
        status = routine_live_status(run, day=day, now=now, tz=tz, hours_cfg=hours_cfg)
        due_at = routine_due_at(run, day, tz, hours_cfg) if run else None
        hard_at = routine_hard_at(run, day, tz, hours_cfg) if run else None
        due_label = f'Due {clock_hhmm(due_at)}' if due_at else ''
        if status == STATUS_DONE:
            due_label = f'Done {clock_hhmm(run.completed_at)}' if run and run.completed_at else 'Done'
        shift_people = [
            {'id': user.pk, 'name': user.full_name, 'full_name': user.full_name}
            for user in scheduled
        ]
        if owner:
            if status == STATUS_UNASSIGNED:
                if due_at is not None and now >= due_at:
                    boundary = miss_boundary(run, day, tz, hours_cfg) if run else now
                    status = STATUS_MISSED if now >= boundary else STATUS_OVERDUE
                else:
                    status = STATUS_DUE
        shift = locked_shift_for(routine)
        jobs.append({
            'group': 'shift',
            'key': key,
            'title': performed_title(key, run),
            'run_id': run.pk if run else None,
            'section_id': None,
            'owner': _person(owner),
            'owner_state': owner_state,
            'due_at': due_at,
            'due_label': due_label,
            'hard_label': clock_hhmm(hard_at) if hard_at else '',
            'urgency': job_urgency(status, hard=hard_at, now=now),
            'completed_label': clock_hhmm(run.completed_at) if run and run.completed_at else '',
            'status': status,
            'closed': False,
            'can_close': False,
            'shift_id': shift.pk if shift else None,
            'shift_name': shift.name if shift else '',
            'shift_people': shift_people,
        })
    return jobs


def section_owner_view(section, *, run, status, punches) -> tuple[dict | None, str | None]:
    """Keep the owner on the row unless the three Unassigned cases already fired."""
    if status == STATUS_UNASSIGNED:
        return None, None
    person = run.assigned_to if run and run.assigned_to_id else section.owner
    if person is None:
        return None, None
    state = 'in' if person.pk in punches else 'scheduled'
    return _person(person), state


def section_due_state(section, *, run, status, day, now, tz, punches, call_ins):
    """Keep the owner unless called in, not scheduled today, or removed from today.

    Late is a schedule problem: the row stays theirs with Due after clock-in.
    """
    if status == STATUS_DONE:
        done = f'Done {clock_hhmm(run.completed_at)}' if run and run.completed_at else 'Done'
        return (run.due_at if run else None), done, status, False
    owner = section.owner
    if owner is None:
        return None, '', STATUS_UNASSIGNED, False
    if owner.pk in call_ins or owner.pk in excluded_ids(day):
        return None, '', STATUS_UNASSIGNED, False
    start = owner_start_on(owner.pk, day, tz)
    if start is None:
        return None, '', STATUS_UNASSIGNED, False
    keep = STATUS_NOT_TALLIED if status in (STATUS_DUE, STATUS_NOT_TALLIED, STATUS_UNASSIGNED) else status
    punch = punches.get(owner.pk)
    if punch is None:
        late = now >= start + timedelta(minutes=LATE_AMBER_MINUTES)
        return None, 'Due after clock-in', keep, late
    due = punch.clock_in + timedelta(minutes=SECTION_DUE_AFTER_PUNCH_MINUTES)
    if timezone.is_naive(due):
        due = timezone.make_aware(due, tz)
    label = f'Due {clock_hhmm(due)}'
    if now < due:
        return due, label, keep, False
    assignment = assignment_for(owner.pk, day)
    end = shift_end_on(assignment.shift, day, tz) if assignment else None
    if end and now >= end:
        return due, label, STATUS_MISSED, False
    return due, label, STATUS_OVERDUE, False


def owner_check_gate(*, section, day: date, now: datetime | None = None) -> dict:
    """Whether a spot/cross runner may walk this section today."""
    from .settings import LATE_RED_MINUTES as red
    now = now or timezone.now()
    tz = timezone.get_current_timezone()
    if section is None:
        return {'allowed': True, 'reason': 'ready', 'message': '', 'owner_id': None, 'owner_name': None, 'tally_run_id': None}
    tally = RoutineRun.objects.filter(
        routine__system_key=SYSTEM_TALLY,
        period_key=day.isoformat(),
        section=section,
        status=RoutineRun.STATUS_DONE,
    ).first()
    if tally is None:
        # Per-person tally may not have section FK.
        if section.owner_id:
            tally = RoutineRun.objects.filter(
                routine__system_key=SYSTEM_TALLY,
                period_key=day.isoformat(),
                assigned_to_id=section.owner_id,
                status=RoutineRun.STATUS_DONE,
            ).first()
    open_tally = RoutineRun.objects.filter(
        routine__system_key=SYSTEM_TALLY,
        period_key=day.isoformat(),
        status=RoutineRun.STATUS_OPEN,
    )
    if section.owner_id:
        open_tally = open_tally.filter(assigned_to_id=section.owner_id).first()
    else:
        open_tally = open_tally.filter(section=section).first()
    if tally:
        return {
            'allowed': True,
            'reason': 'ready',
            'message': '',
            'owner_id': section.owner_id,
            'owner_name': section.owner.full_name if section.owner_id else None,
            'tally_run_id': tally.pk,
        }
    called = section.owner_id in called_in_ids(day) if section.owner_id else False
    punch = TimeEntry.objects.filter(date=day, employee_id=section.owner_id).first() if section.owner_id else None
    assignment = assignment_for(section.owner_id, day) if section.owner_id else None
    never_in = False
    if section.owner_id and punch is None:
        start = at_clock(day, assignment.shift.time_in, tz) if assignment else None
        never_in = start is None or now >= start + timedelta(minutes=red)
    if called or never_in:
        return {
            'allowed': True,
            'reason': 'missed',
            'message': 'Owner check missed',
            'owner_id': section.owner_id,
            'owner_name': section.owner.full_name if section.owner_id else None,
            'tally_run_id': None,
        }
    return {
        'allowed': False,
        'reason': 'blocked',
        'message': "Owner check for this section isn't done yet.",
        'owner_id': section.owner_id,
        'owner_name': section.owner.full_name if section.owner_id else None,
        'tally_run_id': open_tally.pk if open_tally else None,
    }


def spot_issue_at(day: date, tz, hours_cfg) -> datetime:
    start = open_on(day, cfg=hours_cfg, tz=tz)
    end = close_on(day, cfg=hours_cfg, tz=tz)
    after_open = start + timedelta(hours=SPOT_ISSUE_HOURS_AFTER_OPEN)
    before_close = end - timedelta(hours=SPOT_ISSUE_HOURS_BEFORE_CLOSE)
    return min(after_open, before_close)


def spot_payload(day: date, day_row: dict) -> dict:
    run = RoutineRun.objects.filter(
        routine__system_key=SYSTEM_OWNER_SPOT, period_key=day.isoformat(),
    ).select_related('routine').first()
    state = maybe_draw_spot(run) if run else 'waiting'
    spots = (day_row.get('owner') or {}).get('spots') or []
    first = spots[0] if spots else None
    return {
        'done': bool(spots),
        'run_id': run.pk if run else (day_row.get('owner_run_id')),
        'score': None if first is None else first.get('spot_score'),
        'state': state,
    }


def cross_payload(day: date, week: dict, *, due: date | None) -> dict:
    from .grading import _active_sections
    today = timezone.localdate()
    monday = this_monday(day)
    period_keys = {item.isoformat() for item in week_days(monday)}
    audits = {
        row.get('section_id'): row
        for row in (week.get('cross_checks') or [])
        if row.get('section_id')
    }
    assigned = {
        run.section_id: run
        for run in RoutineRun.objects.filter(
            routine__system_key=SYSTEM_CROSS_CHECK,
            period_key__in=period_keys,
            section_id__isnull=False,
        ).select_related('assigned_to', 'section')
    }
    before_due = bool(due and today < due)
    due_label = f'Due {short_day(due)}' if due else 'Due'
    table = []
    missing = []
    done = 0
    for section in _active_sections():
        audit = audits.get(section.pk)
        run = assigned.get(section.pk)
        owner = (audit or {}).get('section_owner') or _person(section.owner)
        checker = (audit or {}).get('checker')
        if not checker and run is not None:
            checker = _person(run.assigned_to)
        run_id = (audit or {}).get('run_id') or (run.pk if run else None)
        if audit and audit.get('status') == 'done':
            found = int(audit.get('found') or 0)
            flags = audit.get('flags') or []
            issues = found > 0 or bool(flags) or (audit.get('score') or 100) < 100
            status = STATUS_ISSUES_FOUND if issues else STATUS_VALIDATED
            table.append({
                'run_id': run_id,
                'section_id': section.pk,
                'section_name': section.name,
                'owner': owner,
                'checker': checker,
                'status': status,
                'status_label': status,
                'tone': '',
                'items_fixed': found,
                'score': audit.get('score'),
                'notes': audit.get('notes') or '',
            })
            done += 1
            continue
        status = STATUS_DUE if before_due else STATUS_NOT_DONE
        label = due_label if before_due else STATUS_NOT_DONE
        table.append({
            'run_id': run_id,
            'section_id': section.pk,
            'section_name': section.name,
            'owner': owner,
            'checker': checker,
            'status': status,
            'status_label': label,
            'tone': 'grey' if before_due else 'bad',
            'items_fixed': None,
            'score': None,
            'notes': '',
        })
        missing.append({
            'run_id': run_id,
            'section_id': section.pk,
            'section_name': section.name,
            'owner': owner,
            'checker': checker,
        })
    return {
        'due': due.isoformat() if due else None,
        'due_label': short_day(due) if due else '',
        'total': len(table),
        'done': done,
        'missing': missing,
        'rows': table,
        'score': (week.get('thirds') or {}).get('cross'),
    }


def score_items_for_day(day_row: dict) -> list[str]:
    items: list[str] = []
    if not day_row:
        return items
    day = date.fromisoformat(day_row['date'])
    stamp = short_day(day)
    for row in (day_row.get('doing') or {}).get('routines') or []:
        status = status_word(row.get('status'))
        if status in (STATUS_DONE, STATUS_PROJECTED):
            continue
        title = {
            SYSTEM_OPEN: 'Retail open',
            SYSTEM_DAY: 'Retail day',
            SYSTEM_CLOSE: 'Retail close',
        }.get(row.get('key') or '', row.get('title') or row.get('key') or 'Routine')
        if status == STATUS_MISSED:
            items.append(f'{title} missed {stamp}')
        else:
            items.append(f'{title} not done {stamp}')
    for row in (day_row.get('cross') or {}).get('verify') or []:
        score = row.get('score')
        if score is None or float(score) >= 100:
            continue
        items.append(f'{row.get("title") or "Verify"} verify {stamp}')
    for row in (day_row.get('cross') or {}).get('audits') or []:
        if row.get('status') == 'projected':
            continue
        score = row.get('score')
        name = row.get('section_name') or 'Section'
        if row.get('status') != 'done':
            items.append(f'{name} cross-check not done')
        elif score is not None and float(score) < 100:
            items.append(f'{name} cross-check')
    for row in (day_row.get('owner') or {}).get('spots') or []:
        score = row.get('spot_score')
        if score is None or float(score) >= 100:
            continue
        items.append(f'{row.get("section_name") or "Spot"} spot')
    return items


def score_items_for_week(week: dict) -> list[str]:
    items: list[str] = []
    for day_row in week.get('days') or []:
        items.extend(score_items_for_day(day_row))
    return items


def pos_on_task_line(week: dict) -> str:
    cycles = week.get('work_cycles') or []
    shelf = sum(int(row.get('shelf') or 0) for row in cycles)
    non = sum(int(row.get('non_shelf') or 0) for row in cycles)
    prompts = week.get('idle_prompts') or []
    dismissed = sum(1 for row in prompts if row.get('outcome') == 'dismissed')
    done = shelf + non
    asked = done + dismissed
    if asked <= 0:
        return 'POS on-task: no register prompts this week.'
    pct = round(100.0 * done / asked)
    return f'POS on-task {pct}% · {done} work cycles · {dismissed} idle prompts dismissed'


def build_issues(
    *,
    day: date,
    open_day: bool,
    staff: list[dict],
    jobs: list[dict],
    spot: dict,
    cross: dict,
    nudges: dict[int, QaNudge],
    now: datetime,
    tz,
    hours_cfg,
    today: date,
) -> list[dict]:
    issues: list[dict] = []

    for row in staff:
        if row['status'] != STATUS_LATE or row.get('late_minutes') is None:
            continue
        minutes = int(row['late_minutes'])
        severity = row.get('late_severity') or 'amber'
        shift = row.get('shift_name') or 'their shift'
        issues.append({
            'id': f'late-{row["id"]}',
            'type': 'late',
            'severity': severity,
            'sentence': format_late_sentence(
                row['name'], minutes, shift, row.get('time_in') or '',
            ),
            'action': 'call_in',
            'person_id': row['id'],
            'person_name': row['name'],
            'run_id': None,
            'call_in_id': None,
            'nudged_at': None,
            'can_act': can_call_in_on(day, today=today),
        })

    called = [row for row in staff if row['status'] == STATUS_CALLED_IN]
    unassigned = [job for job in jobs if job['status'] == STATUS_UNASSIGNED]
    for job in jobs:
        if job.get('group') != 'shift' or job.get('shift_people'):
            continue
        if not job.get('shift_name') and not job.get('shift_id'):
            continue
        name = job.get('shift_name') or job.get('title') or 'This shift'
        issues.append({
            'id': f'empty-shift-{job.get("key") or job.get("shift_id") or job["title"]}',
            'type': 'empty_shift',
            'severity': 'amber',
            'sentence': f'{name} has nobody scheduled today',
            'action': 'open_shifts',
            'person_id': None,
            'person_name': None,
            'run_id': job.get('run_id'),
            'call_in_id': None,
            'nudged_at': None,
            'can_act': True,
        })
    if unassigned:
        count = len(unassigned)
        issues.append({
            'id': 'call-in-unassigned',
            'type': 'call_in_unassigned',
            'severity': 'amber',
            'sentence': f'{count} routine{"s" if count != 1 else ""} need{"s" if count == 1 else ""} a new owner',
            'action': 'reassign',
            'person_id': called[0]['id'] if called else None,
            'person_name': called[0]['name'] if called else None,
            'run_id': None,
            'call_in_id': called[0].get('call_in_id') if called else None,
            'nudged_at': None,
            'can_act': True,
        })

    for job in jobs:
        if job['status'] not in (STATUS_OVERDUE, STATUS_MISSED) or not job.get('run_id'):
            continue
        due_hhmm = clock_hhmm(job.get('due_at')) if job.get('due_at') else ''
        hard_hhmm = job.get('hard_label') or ''
        if job['status'] == STATUS_MISSED:
            sentence = f'{job["title"]} was missed.'
            severity = 'red'
            issue_type = 'overdue_routine'
        elif job.get('urgency') == 'hard':
            sentence = f'{job["title"]} is past its hard deadline ({hard_hhmm}).' if hard_hhmm else f'{job["title"]} is past its hard deadline.'
            severity = 'red'
            issue_type = 'overdue_routine'
        else:
            sentence = f'{job["title"]} was due {due_hhmm} and is not started.' if due_hhmm else f'{job["title"]} is overdue.'
            severity = 'amber'
            issue_type = 'overdue_routine'
        nudge = nudges.get(job['run_id'])
        packed = serialize_nudge(nudge, now=now) if nudge else None
        unseen = bool(nudge and not nudge.acked_at and packed and packed['ack_label'] == 'Not seen')
        issues.append({
            'id': f'routine-{job["run_id"]}',
            'type': issue_type,
            'severity': severity,
            'sentence': sentence,
            'action': 're_nudge' if unseen else 'nudge',
            'person_id': (job.get('owner') or {}).get('id'),
            'person_name': (job.get('owner') or {}).get('name'),
            'run_id': job['run_id'],
            'call_in_id': None,
            'nudged_at': packed['ack_label'] if packed else None,
            'can_act': True,
        })

    for nudge in nudges.values():
        if nudge.ack_kind != 'not_me' or not nudge.acked_at:
            continue
        raw_name = (nudge.employee.full_name if nudge.employee_id else '') or 'Someone'
        parts = raw_name.split()
        name = f'{parts[0]} {parts[-1][0]}.' if len(parts) >= 2 else raw_name
        device = nudge.acked_by_device or 'a device'
        issues.append({
            'id': f'nudge-not-me-{nudge.pk}',
            'type': 'nudge_not_me',
            'severity': 'red',
            'sentence': f"Nudge to {name} was answered 'not me' on {device}.",
            'action': 're_nudge',
            'person_id': nudge.employee_id,
            'person_name': name,
            'run_id': nudge.run_id,
            'call_in_id': None,
            'nudged_at': 'Not me',
            'can_act': True,
        })

    due = date.fromisoformat(cross['due']) if cross.get('due') else None
    if due and day > due and (cross.get('total') or 0) and cross['done'] < cross['total']:
        left = cross['total'] - cross['done']
        issues.append({
            'id': 'cross-overdue',
            'type': 'cross_overdue',
            'severity': 'red',
            'sentence': (
                f'Cross-checks were due {short_day(due)} and {left} of {cross["total"]} are not done.'
            ),
            'action': 'open_cross',
            'person_id': None,
            'person_name': None,
            'run_id': None,
            'call_in_id': None,
            'nudged_at': None,
            'can_act': True,
        })

    threshold = spot_issue_at(day, tz, hours_cfg)
    if not spot.get('done') and now >= threshold:
        issues.append({
            'id': 'no-spot',
            'type': 'no_spot',
            'severity': 'amber' if day >= today else 'grey',
            'sentence': 'No owner spot check yet today.' if day == today else f'No owner spot check on {short_day(day)}.',
            'action': 'do_spot',
            'person_id': None,
            'person_name': None,
            'run_id': spot.get('run_id'),
            'call_in_id': None,
            'nudged_at': None,
            'can_act': bool(spot.get('run_id')) and day == today,
        })

    rank = {'red': 0, 'amber': 1, 'grey': 2}
    issues.sort(key=lambda row: (rank.get(row['severity'], 9), row['sentence']))
    return issues


def week_tiles(monday: date, week: dict, *, today: date, due: date | None) -> list[dict]:
    by_date = {row['date']: row for row in week.get('days') or []}
    week_cross = (week.get('thirds') or {}).get('cross')
    projected_letter = (week.get('projected') or {}).get('letter')
    tiles = []
    for offset in range(7):
        day = monday + timedelta(days=offset)
        row = by_date.get(day.isoformat())
        open_day = is_open_day(day)
        spot_score = None if row is None else (row.get('thirds') or {}).get('owner')
        doing = None if row is None else (row.get('thirds') or {}).get('doing')
        letter = None if row is None else row.get('letter')
        future = day > today
        cross = None if (due is None or day < due) else week_cross
        tiles.append({
            'date': day.isoformat(),
            'weekday': day.strftime('%a'),
            'open': open_day,
            'letter': letter,
            'projected_letter': projected_letter if future and open_day else None,
            'doing': doing,
            'spot': spot_score,
            'cross': cross,
            'is_today': day == today,
            'is_future': future,
        })
    return tiles


def today_payload(day: date, *, now: datetime | None = None) -> dict:
    local, hours_cfg, tz = _local_now(now)
    now = local
    today = local.date()
    monday = this_monday(day)
    week = week_grade(monday)
    day_row = next((row for row in week['days'] if row['date'] == day.isoformat()), None)
    if day_row is None:
        day_row = day_grade(day)
    open_day = is_open_day(day)
    hours = effective_day(day, cfg=hours_cfg)
    due = cross_check_day_for(day, hours_cfg=hours_cfg)
    staff = build_staff(day, now=now, tz=tz, today=today)
    off = build_off(day, staff)
    fire_hard_deadline_nudges(day, now=now, tz=tz, hours_cfg=hours_cfg)
    jobs = build_jobs(day, day_row, now=now, tz=tz, hours_cfg=hours_cfg)
    spot = spot_payload(day, day_row)
    cross = cross_payload(day, week, due=due)
    nudges = latest_nudges([job['run_id'] for job in jobs if job.get('run_id')])
    for job in jobs:
        nudge = nudges.get(job.get('run_id'))
        if nudge:
            job['nudged_at'] = serialize_nudge(nudge, now=now)['ack_label']
    issues = build_issues(
        day=day,
        open_day=open_day,
        staff=staff,
        jobs=jobs,
        spot=spot,
        cross=cross,
        nudges=nudges,
        now=now,
        tz=tz,
        hours_cfg=hours_cfg,
        today=today,
    )
    alert_total = sum(1 for row in issues if row['severity'] in ('red', 'amber'))
    return {
        'date': day.isoformat(),
        'open': open_day,
        'closed_label': closed_label(day),
        'hours': {'open': hours.open_hhmm, 'close': hours.close_hhmm},
        'cross_check_due': due.isoformat() if due else None,
        'week': {
            'monday': monday.isoformat(),
            'label': week_label(monday),
            'thirds': week['thirds'],
            'letter': week['letter'],
            'score': week['score'],
            'projected': week.get('projected'),
        },
        'alerts': {
            'unassigned_cross_checks': 0,
            'sections_without_owner': 0,
            'checker_flags': 0,
            'safety_flags': 0,
            'total': alert_total,
        },
        'doing': day_row.get('doing'),
        'staff': staff,
        'off': off,
        'jobs': jobs,
        'issues': issues,
        'call_ins': [serialize_call_in(row) for row in call_in_rows(day)],
        'nudges': [serialize_nudge(row) for row in nudges.values()],
        'spot': spot,
        'cross': cross,
        'score_items': {
            'day': score_items_for_day(day_row),
            'week': score_items_for_week(week),
        },
        'pos_on_task': pos_on_task_line(week),
        'can_call_in': can_call_in_on(day, today=today),
    }


def week_payload(monday: date) -> dict:
    week = week_grade(monday)
    today = timezone.localdate()
    due = cross_check_day_for(monday)
    return {
        **week,
        'cross_check_due': due.isoformat() if due else None,
        'tiles': week_tiles(monday, week, today=today, due=due),
        'score_items': score_items_for_week(week),
        'pos_on_task': pos_on_task_line(week),
        'projected': week.get('projected'),
        'section_checks': [
            {
                'id': row['id'],
                'name': row['name'],
                'days': row.get('section_days') or ['none'] * 7,
                'done': row.get('done'),
                'assigned': row.get('assigned'),
                'on_task': row.get('on_task'),
            }
            for row in (week.get('people') or [])
        ],
    }


def unassign_open_runs(*, employee, day: date) -> list[dict]:
    """Clear this person's open QA runs; shift jobs fall back to the next punch."""
    cleared = []
    runs = list(
        RoutineRun.objects.filter(
            period_key=day.isoformat(),
            assigned_to=employee,
            routine__system_key__in=CALL_IN_KEYS,
            status=RoutineRun.STATUS_OPEN,
        ).select_related('routine', 'routine__shift')
    )
    for run in runs:
        cleared.append({
            'run_id': run.pk,
            'assigned_to_id': employee.pk,
            'unassign_key': run.unassign_key or '',
        })
        fallback = None
        if run.routine.system_key in PERFORMED or getattr(run.routine, 'shift_id', None):
            code = punch_code_for_routine(run.routine)
            others = punched_on_code(day, code, exclude_id=employee.pk)
            fallback = others[0] if others else None
        run.assigned_to = fallback
        run.unassign_key = '' if run.routine.system_key in PERFORMED else f'u{run.pk}'
        run.save(update_fields=['assigned_to', 'unassign_key'])
    return cleared


def apply_call_in(*, employee, day: date, marked_by, today: date | None = None) -> QaCallIn:
    today = today or timezone.localdate()
    if not can_call_in_on(day, today=today):
        raise ValueError('Called in is only for today and later days this week.')
    if QaCallIn.objects.filter(employee=employee, date=day).exists():
        raise ValueError('That person is already marked called in.')
    assignment = assignment_for(employee.pk, day)
    with transaction.atomic():
        cleared = unassign_open_runs(employee=employee, day=day)
        return QaCallIn.objects.create(
            employee=employee,
            date=day,
            shift=assignment.shift if assignment else None,
            marked_by=marked_by,
            cleared=cleared,
        )


def clear_call_in(row: QaCallIn) -> None:
    """Delete the flag. Assignments stay as they are."""
    row.delete()


def undo_call_in(row: QaCallIn, *, now: datetime | None = None) -> None:
    clear_call_in(row)


def apply_left_early(*, employee, day: date, now: datetime | None = None) -> int:
    now = now or timezone.now()
    closed = 0
    with transaction.atomic():
        for entry in TimeEntry.objects.filter(employee=employee, date=day, clock_out__isnull=True):
            entry.clock_out = now
            if hasattr(entry, 'compute_total_hours'):
                entry.total_hours = entry.compute_total_hours()
            entry.save()
            closed += 1
        unassign_open_runs(employee=employee, day=day)
    return closed


def apply_exclusion(*, employee, day: date, marked_by) -> QaDayExclusion:
    row, _ = QaDayExclusion.objects.get_or_create(
        employee=employee, date=day, defaults={'marked_by': marked_by},
    )
    unassign_open_runs(employee=employee, day=day)
    return row


def apply_override(*, employee, day: date, shift, time_in=None, time_out=None, marked_by=None) -> QaDayOverride:
    row, created = QaDayOverride.objects.get_or_create(
        employee=employee,
        date=day,
        shift=shift,
        defaults={'time_in': time_in, 'time_out': time_out, 'marked_by': marked_by},
    )
    if not created:
        row.time_in = time_in
        row.time_out = time_out
        row.marked_by = marked_by
        row.save(update_fields=['time_in', 'time_out', 'marked_by'])
    return row


def assign_run(*, run: RoutineRun, user, marked_by=None) -> RoutineRun:
    if run.routine.system_key == SYSTEM_WORK_CYCLE:
        raise ValueError('Work cycles are not assigned from this board.')
    run.assigned_to = user
    run.unassign_key = ''
    run.save(update_fields=['assigned_to', 'unassign_key'])
    if run.section_id and run.routine.system_key == SYSTEM_TALLY and user is not None:
        section = run.section
        if section.owner_id != user.pk:
            section.owner = user
            section.save(update_fields=['owner', 'updated_at'])
    if user is not None:
        title = getattr(run.routine, 'title', '') or 'This routine'
        create_nudge(
            run=run,
            created_by=marked_by,
            source='assign',
            employee=user,
            message=f'{title} was assigned to you.',
        )
    return run
