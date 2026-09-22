"""Command Center board: statuses, issues, call-ins, and week tiles.

Scoring stays in grading.py. This module only names what that engine already
knows and adds the live attendance / overdue words the page prints.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.hr.models import Shift, ShiftAssignment, TimeEntry
from apps.hr.shifts import shift_label
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
    day_expected,
    day_grade,
    day_is_graded,
    expected_parts,
    section_owner_people,
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
    covered_section_ids,
    department_sections,
    due_at_for,
    hard_at_for,
    maybe_draw_spot,
    user_in_audience,
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
    SYSTEM_OPEN: 'Opening checklist',
    SYSTEM_DAY: 'Midday checklist',
    SYSTEM_CLOSE: 'Closing checklist',
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


def short_person_name(user) -> str:
    first = (getattr(user, 'first_name', '') or '').strip()
    last = (getattr(user, 'last_name', '') or '').strip()
    if first and last:
        return f'{first} {last[0]}.'
    return first or (getattr(user, 'full_name', '') or '').strip()


def joined_owner_name(people) -> str:
    return ', '.join(short_person_name(user) for user in people if user)


def join_shift_names(names: list[str]) -> str:
    cleaned = [name for name in names if name]
    if len(cleaned) <= 1:
        return cleaned[0] if cleaned else ''
    parts = [name.split(' - ', 1) for name in cleaned]
    if all(len(part) == 2 for part in parts) and len({part[0] for part in parts}) == 1:
        return f'{parts[0][0]} - {" + ".join(part[1] for part in parts)}'
    return ' + '.join(cleaned)


def shift_owner_payload(owner, owner_state: str | None, scheduled: list):
    if owner is not None:
        return _person(owner), owner_state
    if owner_state == 'pool' and scheduled:
        return {'id': None, 'name': f'Pool · {joined_owner_name(scheduled)}'}, 'pool'
    if owner_state == 'scheduled' and len(scheduled) > 1:
        return {'id': None, 'name': joined_owner_name(scheduled)}, 'scheduled'
    if owner_state == 'scheduled' and len(scheduled) == 1:
        return _person(scheduled[0]), 'scheduled'
    return None, owner_state


def performed_title(key: str, run=None) -> str:
    title = getattr(getattr(run, 'routine', None), 'title', '') or ''
    if title:
        return title
    return PERFORMED_TITLES.get(key, key)


def assignments_for(user_id: int, day: date) -> list[ShiftAssignment]:
    rows = []
    for row in ShiftAssignment.objects.filter(
        employee_id=user_id, shift__is_active=True,
    ).select_related('shift', 'shift__department'):
        if row.runs_on(day):
            rows.append(row)
    rows.sort(key=lambda row: (row.shift.time_in, row.shift.name))
    return rows


def assignment_for(user_id: int, day: date) -> ShiftAssignment | None:
    rows = assignments_for(user_id, day)
    return rows[0] if rows else None


def _held_clock(row, which: str):
    extra = getattr(row, which, None)
    return extra if extra is not None else getattr(row.shift, which)


def owner_start_on(user_id: int, day: date, tz) -> datetime | None:
    """Clock-in start if this person is on today's roster or a one-day override."""
    clocks = [row.shift.time_in for row in assignments_for(user_id, day)]
    for override in QaDayOverride.objects.filter(employee_id=user_id, date=day).select_related('shift'):
        clock = override.time_in or override.shift.time_in
        if clock:
            clocks.append(clock)
    if not clocks:
        return None
    return at_clock(day, min(clocks), tz)


def owner_known_off_today(user_id: int, day: date) -> bool:
    """True only when they work some days and today is not one of them."""
    if assignment_for(user_id, day):
        return False
    if QaDayOverride.objects.filter(employee_id=user_id, date=day).exists():
        return False
    return ShiftAssignment.objects.filter(
        employee_id=user_id, shift__is_active=True,
    ).exists()


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


def pool_department_id(routine) -> int | None:
    if getattr(routine, 'assigned_department_id', None):
        return routine.assigned_department_id
    shift = getattr(routine, 'shift', None) or locked_shift_for(routine)
    return getattr(shift, 'department_id', None)


def pool_for_routine(routine, day: date, call_ins: set[int]) -> list:
    """Everyone on any active shift in this routine's department today."""
    dept_id = pool_department_id(routine)
    if not dept_id:
        return []
    blocked = set(call_ins) | excluded_ids(day) | left_ids(day)
    seen: set[int] = set()
    people = []
    for row in ShiftAssignment.objects.filter(
        shift__is_active=True, shift__department_id=dept_id,
    ).select_related('employee', 'shift'):
        if not row.runs_on(day) or row.employee_id in blocked or row.employee_id in seen:
            continue
        seen.add(row.employee_id)
        people.append(row.employee)
    for row in QaDayOverride.objects.filter(date=day).select_related('employee', 'shift'):
        if not row.shift.is_active or row.shift.department_id != dept_id:
            continue
        if row.employee_id in blocked or row.employee_id in seen:
            continue
        seen.add(row.employee_id)
        people.append(row.employee)
    people.sort(key=lambda user: ((user.first_name or ''), (user.last_name or ''), user.pk))
    return people


def resolve_shift_owner(routine, day: date, *, punches: dict, call_ins: set[int]):
    """Anyone in with any open punch who holds this shift; else scheduled names; else pool.

    Does not persist assigned_to for a scheduled-only or pool name.
    """
    scheduled = scheduled_for_routine(routine, day, call_ins)
    in_now = open_punch_ids(day)
    punched = [user for user in scheduled if user.pk in in_now]
    if punched:
        return punched[0], 'in', scheduled
    if scheduled:
        return None, 'scheduled', scheduled
    pool = pool_for_routine(routine, day, call_ins)
    if pool:
        return None, 'pool', pool
    return None, None, pool


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
    if employee is not None:
        targets = [employee]
    elif run.assigned_to_id:
        targets = [run.assigned_to]
    else:
        day = date.fromisoformat(run.period_key) if run.period_key else timezone.localdate()
        targets = pool_for_routine(run.routine, day, called_in_ids(day))
    created = None
    if not targets:
        return QaNudge.objects.create(
            run=run, created_by=created_by, source=source, message=message, employee=None,
        )
    for user in targets:
        created = QaNudge.objects.create(
            run=run, created_by=created_by, source=source, message=message, employee=user,
        )
    return created


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
    if row.ack_kind == 'resolved':
        ack_label = 'Resolved'
    elif row.acked_at and row.ack_kind == 'heard':
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
    rows = []
    for row in QaNudge.objects.filter(employee=user, acked_at__isnull=True).select_related(
        'run', 'created_by', 'employee',
    ).order_by('created_at'):
        if row.ack_kind == 'resolved':
            continue
        if row.run_id and row.run.status == RoutineRun.STATUS_DONE:
            continue
        rows.append(row)
    return rows


def resolve_nudges_for_run(run, *, now: datetime | None = None) -> int:
    """Mark leftover nudges resolved when the run is completed."""
    now = now or timezone.now()
    return QaNudge.objects.filter(run=run, acked_at__isnull=True).update(
        acked_at=now, ack_kind='resolved',
    )


def pooled_open_runs_for(user, day: date, *, skip_ids: set[int] | None = None) -> list:
    skip = skip_ids or set()
    found = []
    for run in RoutineRun.objects.filter(
        period_key=day.isoformat(),
        assigned_to=None,
        status=RoutineRun.STATUS_OPEN,
        routine__is_active=True,
        routine__shift_locked=True,
    ).select_related('routine', 'routine__shift', 'section', 'submission'):
        if run.pk in skip:
            continue
        if user_in_audience(run.routine, user):
            found.append(run)
    return found


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


def open_punch_ids(day: date) -> set[int]:
    return set(
        TimeEntry.objects.filter(date=day, clock_out__isnull=True).values_list('employee_id', flat=True)
    )


def punched_on_code(day: date, code: str, *, exclude_id: int | None = None) -> list:
    """Holders of this punch with any open punch, plus anyone who tapped this tile."""
    if not code:
        return []
    in_now = open_punch_ids(day)
    if exclude_id:
        in_now.discard(exclude_id)
    seen: set[int] = set()
    people = []
    for row in ShiftAssignment.objects.filter(shift__punch_code=code).select_related('employee', 'shift'):
        if not row.runs_on(day) or row.employee_id not in in_now or row.employee_id in seen:
            continue
        seen.add(row.employee_id)
        people.append(row.employee)
    for row in QaDayOverride.objects.filter(date=day, shift__punch_code=code).select_related('employee'):
        if row.employee_id not in in_now or row.employee_id in seen:
            continue
        seen.add(row.employee_id)
        people.append(row.employee)
    for entry in TimeEntry.objects.filter(
        date=day, clock_out__isnull=True, shift=code,
    ).select_related('employee'):
        if entry.employee_id not in in_now or entry.employee_id in seen:
            continue
        seen.add(entry.employee_id)
        people.append(entry.employee)
    return people


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
    people.sort(key=lambda user: ((user.first_name or ''), (user.last_name or ''), user.pk))
    return people


def _dept_fields(department=None) -> dict:
    if department is None:
        return {
            'department': 'Unscheduled',
            'department_slug': 'unscheduled',
            'department_icon': 'none',
            'department_sort': 99,
            'department_active': True,
        }
    return {
        'department': department.name,
        'department_slug': getattr(department, 'slug', '') or 'unscheduled',
        'department_icon': getattr(department, 'icon', None) or 'none',
        'department_sort': getattr(department, 'sort_order', 99),
        'department_active': bool(getattr(department, 'is_active', True)),
    }


def _shift_for_punch(code: str):
    if not code:
        return None
    return (
        Shift.objects.filter(punch_code=code, is_active=True)
        .select_related('department')
        .first()
    )


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
            **_dept_fields(shift.department if shift else None),
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

    held: dict[int, list] = {}
    for assignment in ShiftAssignment.objects.filter(
        shift__is_active=True,
    ).select_related('employee', 'shift', 'shift__department'):
        if not assignment.runs_on(day):
            continue
        held.setdefault(assignment.employee_id, []).append(assignment)

    for override in QaDayOverride.objects.filter(date=day).select_related(
        'employee', 'shift', 'shift__department',
    ):
        if override.employee_id in skipped:
            continue
        existing = held.get(override.employee_id, [])
        if any(row.shift_id == override.shift_id for row in existing):
            continue
        held.setdefault(override.employee_id, []).append(override)

    for user_id, rows in held.items():
        if user_id in skipped:
            continue
        rows.sort(key=lambda row: (_held_clock(row, 'time_in'), row.shift.name))
        user = rows[0].employee
        seen.add(user.pk)
        first = rows[0]
        time_in = min(_held_clock(row, 'time_in') for row in rows)
        time_out = max(_held_clock(row, 'time_out') for row in rows)
        added = any(isinstance(row, QaDayOverride) for row in rows) and all(
            isinstance(row, QaDayOverride) for row in rows
        )
        staff_row = row_for(
            user=user, shift=first.shift,
            time_in=time_in, time_out=time_out,
            on_roster=True, added=added,
        )
        staff_row['shift_name'] = join_shift_names([row.shift.name for row in rows])
        scheduled.append(staff_row)

    for employee_id, punch in punches.items():
        if employee_id in seen or employee_id in skipped:
            continue
        user = punch.employee
        seen.add(user.pk)
        code = punch.shift or ''
        matched = _shift_for_punch(code)
        status, late_minutes, late_severity = staff_status(
            punch=punch, called_in=False, start=None, now=now, on_roster=False,
        )
        call = call_ins.get(user.pk)
        scheduled.append({
            'id': user.pk,
            'name': user.full_name,
            'role': getattr(user, 'role', '') or '',
            **_dept_fields(matched.department if matched else None),
            'shift_id': matched.pk if matched else None,
            'shift_name': matched.name if matched else (shift_label(code) if code else ''),
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
            **_dept_fields(assignment.shift.department),
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
    tally_runs = list(
        RoutineRun.objects.filter(
            routine__system_key=SYSTEM_TALLY, period_key=day.isoformat(),
        ).select_related('assigned_to', 'completed_by', 'routine', 'submission', 'section')
    )
    covers = {
        run.section_id: run
        for run in tally_runs
        if run.section_scoped and run.section_id
    }
    tallies = {
        run.assigned_to_id: run
        for run in tally_runs
        if not run.section_scoped and run.assigned_to_id
    }
    unassigned_tallies = [
        run for run in tally_runs
        if run.assigned_to_id is None and not run.section_scoped
    ]

    for section in Section.objects.filter(is_active=True).select_related('owner').order_by('sort_order', 'name'):
        if section.pk not in expected_sections:
            continue
        run = covers.get(section.pk)
        if run is None:
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
                'section_owner_id': section.owner_id,
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
            'section_owner_id': section.owner_id,
            **miss_fields(run),
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
            taken = RoutineRun.objects.filter(
                routine=run.routine, period_key=run.period_key, assigned_to=owner,
            ).exclude(pk=run.pk).first()
            if taken:
                run = taken
            else:
                try:
                    run.assigned_to = owner
                    run.unassign_key = ''
                    run.save(update_fields=['assigned_to', 'unassign_key'])
                except IntegrityError:
                    run = RoutineRun.objects.get(
                        routine=run.routine, period_key=run.period_key, assigned_to=owner,
                    )
        if run and owner is None and owner_state != 'scheduled' and run.assigned_to_id and run.assigned_to_id not in call_ins:
            owner = run.assigned_to
            owner_state = 'in' if owner.pk in punches else 'scheduled'
        owner_payload, owner_state = shift_owner_payload(owner, owner_state, scheduled)
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
        if owner_payload:
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
            'owner': owner_payload,
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
            **miss_fields(run),
        })
    return jobs


MISS_REASON_LABELS = {code: label for code, label in RoutineRun.MISS_REASON_CHOICES}


def miss_fields(run) -> dict:
    """Why a run was missed, answered at the kiosk. Empty strings when unanswered."""
    reason = (getattr(run, 'miss_reason', '') or '') if run is not None else ''
    return {
        'miss_reason': reason,
        'miss_reason_label': MISS_REASON_LABELS.get(reason, ''),
        'miss_reason_note': (getattr(run, 'miss_reason_note', '') or '') if run is not None else '',
    }


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
    """Keep the owner unless called in, rostered off today, or removed from today.

    A punch counts as being here. No roster row is not the same as a day off.
    Late is a schedule problem: the row stays theirs with Due after clock-in.
    """
    if status == STATUS_DONE:
        done = f'Done {clock_hhmm(run.completed_at)}' if run and run.completed_at else 'Done'
        return (run.due_at if run else None), done, status, False
    if run is not None and getattr(run, 'section_scoped', False) and run.assigned_to_id:
        punch = punches.get(run.assigned_to_id)
        keep = STATUS_NOT_TALLIED if status in (STATUS_DUE, STATUS_NOT_TALLIED, STATUS_UNASSIGNED) else status
        if punch is None:
            return None, 'Due after clock-in', keep, False
        due = punch.clock_in + timedelta(minutes=SECTION_DUE_AFTER_PUNCH_MINUTES)
        if timezone.is_naive(due):
            due = timezone.make_aware(due, tz)
        label = f'Due {clock_hhmm(due)}'
        if now < due:
            return due, label, keep, False
        return due, label, STATUS_OVERDUE, False
    owner = section.owner
    if owner is None:
        return None, '', STATUS_UNASSIGNED, False
    if owner.pk in call_ins or owner.pk in excluded_ids(day):
        return None, '', STATUS_UNASSIGNED, False
    punch = punches.get(owner.pk)
    start = owner_start_on(owner.pk, day, tz)
    if start is None and punch is None and owner_known_off_today(owner.pk, day):
        return None, '', STATUS_UNASSIGNED, False
    keep = STATUS_NOT_TALLIED if status in (STATUS_DUE, STATUS_NOT_TALLIED, STATUS_UNASSIGNED) else status
    if punch is None:
        late = bool(start) and now >= start + timedelta(minutes=LATE_AMBER_MINUTES)
        return None, 'Due after clock-in', keep, late
    # Closed days use the same punch-plus-60 rule. The owner's shift that day is Retail Reset.
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


def person_work_state(user_id, staff: list[dict], *, owner_id=None, section_done=False) -> str:
    """working, not_scheduled, called_in, left, leaves_early, or unassigned."""
    if not user_id:
        return 'unassigned'
    row = next((item for item in staff if item.get('id') == user_id), None)
    if row is None:
        return 'not_scheduled'
    if row.get('called_in') or row.get('status') == STATUS_CALLED_IN:
        return 'called_in'
    if row.get('status') == STATUS_LEFT:
        return 'left'
    if not section_done and owner_id:
        owner = next((item for item in staff if item.get('id') == owner_id), None)
        checker_out = row.get('time_out') or ''
        owner_in = (owner or {}).get('time_in') or ''
        if checker_out and owner_in and checker_out <= owner_in:
            return 'leaves_early'
    return 'working'


def owner_check_gate(*, section, day: date, now: datetime | None = None, run=None) -> dict:
    """Whether a spot/cross runner may walk this section today."""
    from .settings import LATE_RED_MINUTES as red
    now = now or timezone.now()
    tz = timezone.get_current_timezone()
    if (
        run is not None
        and getattr(getattr(run, 'routine', None), 'system_key', None) == SYSTEM_CROSS_CHECK
        and (run.generated or {}).get('owner_check_waived')
    ):
        owner = section.owner if section is not None and section.owner_id else None
        return {
            'allowed': True,
            'reason': 'waived',
            'message': '',
            'owner_id': section.owner_id if section is not None else None,
            'owner_name': owner.full_name if owner else None,
            'tally_run_id': None,
        }
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


def _cross_flags(section, run, checker, day: date, staff: list[dict]) -> dict:
    checker_id = checker.get('id') if isinstance(checker, dict) else None
    on_this_day = bool(run and run.period_key == day.isoformat())
    if not on_this_day:
        return {
            'checker_state': 'working' if checker_id else 'unassigned',
            'blocked': False,
            'waived': False,
            'checker_out': '',
            'owner_in': '',
        }
    gate = owner_check_gate(section=section, day=day, run=run)
    owner_id = section.owner_id if section is not None else None
    checker_row = next((item for item in staff if item.get('id') == checker_id), None)
    owner_row = next((item for item in staff if item.get('id') == owner_id), None)
    return {
        'checker_state': person_work_state(
            checker_id, staff, owner_id=owner_id, section_done=gate.get('reason') == 'ready',
        ),
        'blocked': not gate['allowed'],
        'waived': gate.get('reason') == 'waived',
        'checker_out': (checker_row or {}).get('time_out') or '',
        'owner_in': (owner_row or {}).get('time_in') or '',
    }


def cross_payload(day: date, week: dict, *, due: date | None, staff: list[dict] | None = None) -> dict:
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
        flags_for_row = _cross_flags(section, run, checker, day, staff or [])
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
                'checker_state': 'working',
                'blocked': False,
                'waived': False,
            })
            done += 1
            continue
        due_today = bool(due and today == due)
        if before_due:
            status, label, tone = STATUS_DUE, due_label, 'grey'
        elif due_today:
            status = STATUS_DUE
            if flags_for_row.get('blocked'):
                label = 'Waiting on section check'
            elif flags_for_row.get('waived'):
                label = 'Unblocked'
            else:
                label = 'Ready to check'
            tone = 'grey'
        else:
            status, label, tone = STATUS_NOT_DONE, STATUS_NOT_DONE, 'bad'
        table.append({
            'run_id': run_id,
            'section_id': section.pk,
            'section_name': section.name,
            'owner': owner,
            'checker': checker,
            'status': status,
            'status_label': label,
            'tone': tone,
            'items_fixed': None,
            'score': None,
            'notes': '',
            **flags_for_row,
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
        title = row.get('title') or PERFORMED_TITLES.get(row.get('key') or '', 'Routine')
        if status == STATUS_MISSED:
            why = row.get('miss_reason_label') or MISS_REASON_LABELS.get(row.get('miss_reason') or '', '')
            items.append(f'{title} missed {stamp} · {why}' if why else f'{title} missed {stamp}')
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

    unassigned = [
        job for job in jobs
        if job['status'] == STATUS_UNASSIGNED and job.get('owner_state') != 'pool'
    ]
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
    for job in unassigned:
        title = job.get('title') or 'This routine'
        if job.get('group') == 'section':
            sentence = f'{title} section check has no one scheduled.'
            assign_kind = 'cover'
        else:
            sentence = f'{title} has no one scheduled.'
            assign_kind = 'run'
        issues.append({
            'id': f'unassigned-{job.get("section_id") or job.get("run_id") or title}',
            'type': 'call_in_unassigned',
            'severity': 'amber',
            'sentence': sentence,
            'action': 'reassign',
            'person_id': None,
            'person_name': None,
            'run_id': job.get('run_id'),
            'section_id': job.get('section_id'),
            'assign_kind': assign_kind,
            'exclude_user_id': job.get('section_owner_id'),
            'call_in_id': None,
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
        resolved = bool(
            nudge and (
                nudge.ack_kind == 'resolved'
                or (packed and packed['ack_label'] == 'Resolved')
            )
        )
        unseen = bool(
            nudge and not nudge.acked_at and not resolved
            and packed and packed['ack_label'] == 'Not seen'
        )
        issues.append({
            'id': f'routine-{job["run_id"]}',
            'type': issue_type,
            'severity': severity,
            'sentence': sentence,
            'action': 'nudge' if resolved or not unseen else 're_nudge',
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

    if due and day == due:
        for row in cross.get('rows') or []:
            if row.get('status') in (STATUS_VALIDATED, STATUS_ISSUES_FOUND, 'done'):
                continue
            state = row.get('checker_state')
            if state in (None, 'working'):
                continue
            section_name = row.get('section_name') or 'Section'
            checker = row.get('checker') or {}
            checker_name = checker.get('name') if isinstance(checker, dict) else None
            owner = row.get('owner') or {}
            owner_name = owner.get('name') if isinstance(owner, dict) else 'the owner'
            if state == 'called_in':
                sentence = f'{section_name} cross-check is assigned to {checker_name}, who called in.'
            elif state == 'leaves_early':
                sentence = (
                    f'{section_name} cross-check: {checker_name} leaves {row.get("checker_out") or ""}, '
                    f'before {owner_name} is in at {row.get("owner_in") or ""}.'
                )
            elif state == 'left':
                sentence = f'{section_name} cross-check: {checker_name} has clocked out.'
            elif state == 'unassigned' or not checker_name:
                sentence = f'{section_name} cross-check has no checker.'
            else:
                sentence = (
                    f'{section_name} cross-check is assigned to {checker_name}, '
                    'who is not scheduled today.'
                )
            issues.append({
                'id': f'cross-checker-{row.get("section_id") or row.get("run_id")}',
                'type': 'cross_uncovered',
                'severity': 'amber',
                'sentence': sentence,
                'action': 'reassign',
                'person_id': checker.get('id') if isinstance(checker, dict) else None,
                'person_name': checker_name,
                'run_id': row.get('run_id'),
                'section_id': row.get('section_id'),
                'assign_kind': 'cross_checker',
                'exclude_user_id': owner.get('id') if isinstance(owner, dict) else None,
                'blocked': bool(row.get('blocked')),
                'call_in_id': None,
                'nudged_at': None,
                'can_act': bool(row.get('run_id') and row.get('section_id')),
            })

    for nudge in QaNudge.objects.filter(
        source='early_check',
        acked_at__isnull=True,
        run__routine__system_key=SYSTEM_CROSS_CHECK,
        run__period_key=day.isoformat(),
        run__status=RoutineRun.STATUS_OPEN,
    ).select_related('run', 'run__section', 'run__routine', 'created_by'):
        gate = owner_check_gate(section=nudge.run.section, day=day, run=nudge.run, now=now)
        if gate['allowed']:
            nudge.acked_at = now
            nudge.ack_kind = 'resolved'
            nudge.save(update_fields=['acked_at', 'ack_kind'])
            continue
        issues.append({
            'id': f'early-check-{nudge.pk}',
            'type': 'early_check',
            'severity': 'amber',
            'sentence': nudge.message or 'A checker asked to walk before the section check.',
            'action': 'unblock',
            'person_id': nudge.created_by_id,
            'person_name': nudge.created_by.full_name if nudge.created_by_id else None,
            'run_id': nudge.run_id,
            'section_id': nudge.run.section_id,
            'assign_kind': None,
            'exclude_user_id': None,
            'call_in_id': None,
            'nudged_at': None,
            'can_act': True,
        })

    threshold = spot_issue_at(day, tz, hours_cfg)
    if not spot.get('done') and now >= threshold:
        spot_title = (
            Routine.objects.filter(system_key=SYSTEM_OWNER_SPOT)
            .values_list('title', flat=True)
            .first()
            or 'Spot walk'
        )
        issues.append({
            'id': 'no-spot',
            'type': 'no_spot',
            'severity': 'amber' if day >= today else 'grey',
            'sentence': (
                f'No {spot_title} yet today.' if day == today else f'No {spot_title} on {short_day(day)}.'
            ),
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
        expected = (row or {}).get('expected') or day_expected(day)
        graded = bool(row['graded']) if row and 'graded' in row else day_is_graded(day)
        spot_score = None if row is None else (row.get('thirds') or {}).get('owner')
        doing = None if row is None else (row.get('thirds') or {}).get('doing')
        letter = None if (row is None or not graded) else row.get('letter')
        future = day > today
        cross = None if (due is None or day < due) else week_cross
        tiles.append({
            'date': day.isoformat(),
            'weekday': day.strftime('%a'),
            'open': open_day,
            'graded': graded,
            'expected': expected,
            'letter': letter,
            'projected_letter': projected_letter if future and graded else None,
            'doing': doing,
            'spot': spot_score,
            'cross': cross,
            'weights': None if row is None else row.get('weights'),
            'excluded': None if row is None else row.get('excluded'),
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
    expected = day_expected(day)
    graded = day_is_graded(day)
    hours = effective_day(day, cfg=hours_cfg)
    due = cross_check_day_for(day, hours_cfg=hours_cfg)
    staff = build_staff(day, now=now, tz=tz, today=today)
    off = build_off(day, staff)
    fire_hard_deadline_nudges(day, now=now, tz=tz, hours_cfg=hours_cfg)
    jobs = build_jobs(day, day_row, now=now, tz=tz, hours_cfg=hours_cfg)
    spot = spot_payload(day, day_row)
    cross = cross_payload(day, week, due=due, staff=staff)
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
        'graded': graded,
        'expected': expected,
        'closed_label': None if graded else closed_label(day),
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
                'due_today': row.get('due_today') or 0,
                'on_task': row.get('on_task'),
            }
            for row in section_owner_people(week.get('people') or [])
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
    """Give today's cleared runs back, then delete the flag."""
    for item in row.cleared or []:
        run_id = item.get('run_id')
        user_id = item.get('assigned_to_id')
        if not run_id or not user_id:
            continue
        run = RoutineRun.objects.filter(pk=run_id).first()
        if run is None or run.status != RoutineRun.STATUS_OPEN:
            continue
        if run.assigned_to_id and run.assigned_to_id != user_id:
            continue
        if run.assigned_to_id == user_id:
            continue
        clash = RoutineRun.objects.filter(
            routine_id=run.routine_id,
            period_key=run.period_key,
            assigned_to_id=user_id,
            section_scoped=run.section_scoped,
        ).exclude(pk=run.pk)
        if run.section_id:
            clash = clash.filter(section_id=run.section_id)
        if clash.exists():
            run.delete()
            continue
        run.assigned_to_id = user_id
        run.unassign_key = ''
        run.save(update_fields=['assigned_to', 'unassign_key'])
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


def cover_section_today(*, section, helper, day, marked_by=None) -> RoutineRun:
    """Hand one aisle's section check to a helper for today. The owner stays the owner."""
    if helper is None:
        raise ValueError('Pick someone to cover this section today.')
    if section.owner_id and helper.pk == section.owner_id:
        raise ValueError('That person already owns this aisle.')
    routine = Routine.objects.filter(system_key=SYSTEM_TALLY, is_active=True).first()
    if routine is None:
        raise ValueError('Section check is not set up.')
    key = day.isoformat()
    owner = section.owner
    owner_run = None
    if owner is not None:
        owner_run = RoutineRun.objects.filter(
            routine=routine,
            period_key=key,
            assigned_to=owner,
            section_scoped=False,
            status=RoutineRun.STATUS_OPEN,
        ).first()
    cover = RoutineRun.objects.filter(
        routine=routine,
        period_key=key,
        section=section,
        section_scoped=True,
    ).first()
    if cover is not None and cover.status != RoutineRun.STATUS_OPEN:
        raise ValueError('That section check is already finished.')
    _local, cfg, tz = _local_now()
    due = owner_run.due_at if owner_run is not None else due_at_for(routine, day, tz=tz, cfg=cfg)
    generated = {'cover_for': owner.pk if owner is not None else None}
    if cover is None:
        cover = RoutineRun.objects.create(
            routine=routine,
            period_key=key,
            due_at=due,
            assigned_to=helper,
            section=section,
            subject=section.name,
            section_scoped=True,
            generated=generated,
            status=RoutineRun.STATUS_OPEN,
        )
    else:
        merged = dict(cover.generated or {})
        merged.update(generated)
        cover.assigned_to = helper
        cover.subject = section.name
        cover.section_scoped = True
        cover.unassign_key = ''
        cover.generated = merged
        cover.save(update_fields=[
            'assigned_to', 'subject', 'section_scoped', 'unassign_key', 'generated',
        ])
    if owner_run is not None:
        remaining = [
            item.name for item in department_sections(routine)
            if item.owner_id == owner.pk and item.pk not in covered_section_ids(day)
        ]
        if remaining:
            owner_run.subject = ', '.join(remaining)
            owner_run.save(update_fields=['subject'])
        else:
            owner_run.delete()
    title = getattr(routine, 'title', '') or 'Section check'
    create_nudge(
        run=cover,
        created_by=marked_by,
        source='assign',
        employee=helper,
        message=f'{title} for {section.name} was assigned to you for today.',
    )
    return cover


def assign_run(*, run: RoutineRun, user, marked_by=None) -> RoutineRun:
    if run.routine.system_key == SYSTEM_WORK_CYCLE:
        raise ValueError('Register activity is not assigned from this board.')
    with transaction.atomic():
        if user is None:
            run.assigned_to = None
            run.unassign_key = '' if run.routine.system_key in PERFORMED else f'u{run.pk}'
            run.save(update_fields=['assigned_to', 'unassign_key'])
            return run
        existing = (
            RoutineRun.objects.select_for_update()
            .filter(routine_id=run.routine_id, period_key=run.period_key, assigned_to=user)
            .first()
        )
        if existing is not None and existing.pk != run.pk:
            leftover = run
            run = existing
            if leftover.status == RoutineRun.STATUS_OPEN:
                leftover.delete()
        elif run.assigned_to_id != user.pk:
            try:
                with transaction.atomic():
                    run.assigned_to = user
                    run.unassign_key = ''
                    run.save(update_fields=['assigned_to', 'unassign_key'])
            except IntegrityError:
                kept = RoutineRun.objects.get(
                    routine_id=run.routine_id, period_key=run.period_key, assigned_to=user,
                )
                if run.status == RoutineRun.STATUS_OPEN and run.pk != kept.pk:
                    run.delete()
                run = kept
        if run.section_id and run.routine.system_key == SYSTEM_TALLY:
            section = run.section
            if section.owner_id != user.pk:
                section.owner = user
                section.save(update_fields=['owner', 'updated_at'])
        title = getattr(run.routine, 'title', '') or 'This routine'
        create_nudge(
            run=run,
            created_by=marked_by,
            source='assign',
            employee=user,
            message=f'{title} was assigned to you.',
        )
        return run
