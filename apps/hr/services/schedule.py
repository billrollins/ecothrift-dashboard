"""The week schedule and call-ins (owner 2026-10-21, digest point 5).

- **The week.** A manager builds each week: one ``ScheduledShift`` per person per day they work (department, start,
  end, note). "Copy last week" and "Fill from usual shifts" (the weekly ``ShiftAssignment`` patterns) start it; neither
  touches a day a person already has.
- **Fixed or flexible.** Retail keeps fixed shifts. Every other department flexes: leave early on a slow day, come in
  or stay late on a busy one, so its times are the plan. The fixed departments are one owner-editable setting,
  ``hr.fixed_schedule_departments`` (department slugs, default ``["retail-operations"]``).
- **My week.** Each person sees their own shifts for this week and next (Me page).
- **Call-ins.** Who, which shift, when they called (or a no-call no-show) and why; counted per person over the last 30
  and 90 days. Managers only: staff see the week without them.
- **At a glance** (Bill, Dash Updates #55, 2026-11-03). The week also carries each person's usual weekly shifts (so
  flexible departments show only the days that differ) and the store hours per day (the Retail timeline and floor
  coverage). Store hours come from the online-sales hours setting and its overrides, never hard-coded.
- **Actual** (Bill, Dash Updates #55 part A, 2026-11-03). Each clock-in to clock-out in the week, drawn under the
  scheduled bar, and the actual hours beside the scheduled ones. Managers see everyone's; staff see only their own.
- **Requests** (Bill, Dash Updates #60 and #61, 2026-11-03). Anyone asks a manager for unpaid days off (one day or a
  run of days) or new times on one day (a different start or end, or a day they don't usually work), with a note.
  Managers (``hr.schedule:write``) approve or decline with a reply; approving a day off removes those shifts, and
  approving new times changes (or adds) that day's shift. Staff see their own requests; managers see everyone's.
- **Right now** (Bill, Dash Updates #6, 2026-11-02). Everyone sees the week, and next to each person their state now from
  the time clock: on shift, on break, late (a shift that has started, not clocked in, no call-in) or off.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

FIXED_SETTING_KEY = 'hr.fixed_schedule_departments'
DEFAULT_FIXED = ['retail-operations']
WINDOWS = (30, 90)


def fixed_departments() -> set[str]:
    from apps.core.models import AppSetting

    row = AppSetting.objects.filter(key=FIXED_SETTING_KEY).first()
    value = row.value if row is not None else None
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        value = DEFAULT_FIXED
    return {v.strip() for v in value if v.strip()}


def week_start(day: date | None = None) -> date:
    day = day or timezone.localdate()
    return day - timedelta(days=day.weekday())


def parse_day(raw, field: str = 'start') -> date | None:
    if not raw:
        return None
    try:
        return date.fromisoformat(str(raw))
    except ValueError as exc:
        raise ValidationError({field: 'Use YYYY-MM-DD.'}) from exc


def clock_text(t: time) -> str:
    hour = (t.hour + 11) % 12 + 1
    return f'{hour}{f":{t.minute:02d}" if t.minute else ""}{"am" if t.hour < 12 else "pm"}'


def shift_hours(row) -> float:
    start = datetime.combine(row.date, row.start_time)
    end = datetime.combine(row.date, row.end_time)
    if end <= start:
        end += timedelta(days=1)
    return round((end - start).total_seconds() / 3600, 2)


def shift_payload(row, fixed: set[str] | None = None) -> dict:
    fixed = fixed if fixed is not None else fixed_departments()
    dept = row.department
    return {
        'id': row.pk, 'employee': row.employee_id, 'employee_name': row.employee.full_name,
        'date': row.date.isoformat(), 'start_time': row.start_time.strftime('%H:%M'),
        'end_time': row.end_time.strftime('%H:%M'),
        'text': f'{clock_text(row.start_time)}-{clock_text(row.end_time)}',
        'hours': shift_hours(row),
        'department': dept.pk if dept else None, 'department_name': dept.name if dept else '',
        'flexible': not (dept and dept.slug in fixed), 'note': row.note,
    }


def call_in_payload(row) -> dict:
    return {
        'id': row.pk, 'employee': row.employee_id, 'employee_name': row.employee.full_name,
        'shift_date': row.shift_date.isoformat(), 'scheduled_shift': row.scheduled_shift_id,
        'shift_text': row.shift_text, 'kind': row.kind, 'kind_label': row.get_kind_display(),
        'called_at': row.called_at, 'reason': row.reason,
        'recorded_by': row.recorded_by.full_name if row.recorded_by_id else '', 'created_at': row.created_at,
    }


def call_in_counts(employee_ids=None, today: date | None = None) -> dict[int, dict]:
    """{employee_id: {'d30': n, 'd90': n, 'no_show_90': n}} by shift date."""
    from apps.hr.models import CallIn

    today = today or timezone.localdate()
    since = today - timedelta(days=max(WINDOWS))
    qs = CallIn.objects.filter(shift_date__gt=since, shift_date__lte=today)
    if employee_ids is not None:
        qs = qs.filter(employee_id__in=list(employee_ids))
    rows = qs.values('employee_id').annotate(
        d30=Count('id', filter=Q(shift_date__gt=today - timedelta(days=30))),
        d90=Count('id'),
        no_show_90=Count('id', filter=Q(kind='no_show')),
    )
    return {r['employee_id']: {'d30': r['d30'], 'd90': r['d90'], 'no_show_90': r['no_show_90']} for r in rows}


def schedulable_people():
    """Active staff with an employee profile whose job has not ended."""
    from apps.accounts.services.staff_customer import staff_users

    today = timezone.localdate()
    return (staff_users().filter(employee__isnull=False)
            .exclude(employee__termination_date__lte=today)
            .select_related('employee', 'employee__department')
            .order_by('employee__department__sort_order', 'first_name', 'last_name'))


def now_states(people_ids, now: datetime | None = None) -> dict[int, str]:
    """{person id: 'on_shift' | 'on_break' | 'late' | 'off'} right now, from the time clock and today's shifts.

    Late is for fixed shifts only (Retail): flexible departments' times are the plan, so coming in later is not late.
    Late = the shift has started and not ended, nobody clocked in today, and no call-in today (a call-in reads as off,
    like any day off). A clock-in left open since before yesterday is a forgotten clock-out, not "on shift"."""
    from apps.hr.models import CallIn, ScheduledShift, TimeEntry

    now = timezone.localtime(now or timezone.now())
    today = now.date()
    ids = set(people_ids)
    states = {pk: 'off' for pk in ids}
    fixed = fixed_departments()
    called = set(CallIn.objects.filter(shift_date=today, employee_id__in=ids).values_list('employee_id', flat=True))
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    clocked_today = set(TimeEntry.objects.filter(employee_id__in=ids, clock_in__gte=midnight)
                        .values_list('employee_id', flat=True))
    wall = now.replace(tzinfo=None)
    for s in ScheduledShift.objects.filter(date=today, employee_id__in=ids).select_related('department'):
        if not (s.department and s.department.slug in fixed):
            continue
        start = datetime.combine(s.date, s.start_time)
        end = datetime.combine(s.date, s.end_time)
        if end <= start:
            end += timedelta(days=1)
        if start <= wall < end and s.employee_id not in called and s.employee_id not in clocked_today:
            states[s.employee_id] = 'late'
    for entry in TimeEntry.objects.filter(employee_id__in=ids, clock_out__isnull=True, clock_in__gte=now - timedelta(hours=16)):
        states[entry.employee_id] = 'on_break' if entry.on_break else 'on_shift'
    return states


def usual_shifts(people_ids, fixed: set[str]) -> dict[int, list[dict]]:
    """{person id: [{weekday, start_time, end_time, department, department_name, flexible}]} from the usual weekly
    shifts (Admin → Shifts assignments), Monday first."""
    from apps.hr.models import ShiftAssignment

    out: dict[int, list[dict]] = {}
    rows = (ShiftAssignment.objects.filter(shift__is_active=True, employee_id__in=list(people_ids))
            .select_related('shift', 'shift__department'))
    for a in rows:
        dept = a.shift.department
        for weekday in a.weekday_list():
            out.setdefault(a.employee_id, []).append({
                'weekday': weekday, 'start_time': a.shift.time_in.strftime('%H:%M'),
                'end_time': a.shift.time_out.strftime('%H:%M'),
                'department': dept.pk if dept else None, 'department_name': dept.name if dept else '',
                'flexible': not (dept and dept.slug in fixed),
            })
    for rows_ in out.values():
        rows_.sort(key=lambda r: (r['weekday'], r['start_time']))
    return out


def store_hours(days) -> list[dict]:
    """[{date, open, start, end}] for each day, from the store hours setting and its overrides."""
    from apps.webstore.services.hours import effective_day, get_hours_config

    cfg = get_hours_config()
    out = []
    for day in days:
        h = effective_day(day, cfg=cfg)
        out.append({'date': day.isoformat(), 'open': h.open, 'start': h.open_hhmm, 'end': h.close_hhmm})
    return out


def actual_times(start: date, end: date, ids) -> tuple[list[dict], dict[int, float]]:
    """Clock-ins in the week: ([{employee, date, start, end, open}], {person id: hours}). An open punch runs to now
    (its hours less any break so far); one left open since before yesterday is a forgotten clock-out and is skipped."""
    from apps.hr.models import TimeEntry

    now = timezone.now()
    spans: list[dict] = []
    hours: dict[int, float] = {}
    rows = TimeEntry.objects.filter(employee_id__in=list(ids), date__gte=start, date__lte=end).order_by('clock_in')
    for e in rows:
        if e.clock_out is None and e.clock_in < now - timedelta(hours=16):
            continue
        cin = timezone.localtime(e.clock_in)
        cout = timezone.localtime(e.clock_out) if e.clock_out else None
        spans.append({'employee': e.employee_id, 'date': e.date.isoformat(), 'start': cin.strftime('%H:%M'),
                      'end': cout.strftime('%H:%M') if cout and cout.date() == cin.date() else ('23:59' if cout else None),
                      'open': cout is None})
        if e.total_hours is not None:
            worked = float(e.total_hours)
        elif cout is None:
            worked = max((now - e.clock_in).total_seconds() / 3600 - (e.break_minutes or 0) / 60, 0)
        else:
            worked = 0
        hours[e.employee_id] = round(hours.get(e.employee_id, 0) + worked, 2)
    return spans, hours


def request_payload(row) -> dict:
    return {
        'id': row.pk, 'employee': row.employee_id, 'employee_name': row.employee.full_name, 'kind': row.kind,
        'date': row.date.isoformat(), 'end_date': row.end_date.isoformat(),
        'start_time': row.start_time.strftime('%H:%M') if row.start_time else None,
        'end_time': row.end_time.strftime('%H:%M') if row.end_time else None,
        'note': row.note, 'status': row.status, 'reply': row.reply,
        'decided_by_name': row.decided_by.full_name if row.decided_by_id else '',
        'decided_at': row.decided_at.isoformat() if row.decided_at else None,
        'created_at': row.created_at.isoformat(),
    }


def decide_request(row, approve: bool, reply: str, actor) -> None:
    """Approve or decline a waiting request. Approving a day off removes the person's shifts on those days; approving
    new times changes that day's shift, or adds one in their home department when they had none."""
    from apps.hr.models import ScheduledShift, ScheduleRequest

    if row.status != ScheduleRequest.PENDING:
        raise ValidationError({'detail': 'That request has already been answered.'})
    if approve:
        shifts = ScheduledShift.objects.filter(employee_id=row.employee_id)
        if row.kind == ScheduleRequest.KIND_OFF:
            shifts.filter(date__gte=row.date, date__lte=row.end_date).delete()
        else:
            day = shifts.filter(date=row.date).order_by('start_time').first()
            if day is None:
                emp = getattr(row.employee, 'employee', None)
                ScheduledShift.objects.create(employee_id=row.employee_id, date=row.date,
                                              department_id=emp.department_id if emp else None,
                                              start_time=row.start_time, end_time=row.end_time, created_by=actor)
            else:
                day.start_time, day.end_time = row.start_time, row.end_time
                day.save(update_fields=['start_time', 'end_time', 'updated_at'])
    row.status = ScheduleRequest.APPROVED if approve else ScheduleRequest.DECLINED
    row.reply = (reply or '')[:300]
    row.decided_by = actor
    row.decided_at = timezone.now()
    row.save(update_fields=['status', 'reply', 'decided_by', 'decided_at'])


def week(start: date, *, manager: bool = True, viewer_id: int | None = None) -> dict:
    from apps.hr.models import CallIn, ScheduledShift, ScheduleRequest

    start = week_start(start)
    end = start + timedelta(days=6)
    fixed = fixed_departments()
    people = list(schedulable_people())
    shifts = list(ScheduledShift.objects.filter(date__gte=start, date__lte=end)
                  .select_related('employee', 'department'))
    ids = {p.pk for p in people} | {s.employee_id for s in shifts}
    counts = call_in_counts(ids)
    call_ins = CallIn.objects.filter(shift_date__gte=start, shift_date__lte=end).select_related('employee', 'recorded_by')
    hours: dict[int, float] = {}
    for s in shifts:
        hours[s.employee_id] = round(hours.get(s.employee_id, 0) + shift_hours(s), 2)
    today = timezone.localdate()
    usual = usual_shifts(ids, fixed)
    actual, actual_hours = actual_times(start, end, ids if manager else ({viewer_id} if viewer_id else set()))
    days = [start + timedelta(days=n) for n in range(7)]
    requests = (ScheduleRequest.objects.filter(date__lte=end, end_date__gte=start)
                .exclude(status=ScheduleRequest.WITHDRAWN).select_related('employee', 'decided_by'))
    if not manager:  # Staff see their own requests only.
        requests = requests.filter(employee_id=viewer_id)
    payload = {
        'start': start.isoformat(), 'end': end.isoformat(),
        'days': [d.isoformat() for d in days],
        'store_hours': store_hours(days),
        'people': [
            {'id': p.pk, 'name': p.full_name,
             'department': p.employee.department_id, 'department_name': p.employee.department.name if p.employee.department_id else '',
             'fixed': bool(p.employee.department_id and p.employee.department.slug in fixed),
             'usual': usual.get(p.pk, []),
             'hours': hours.get(p.pk, 0), 'actual_hours': actual_hours.get(p.pk),
             'call_ins': counts.get(p.pk, {'d30': 0, 'd90': 0, 'no_show_90': 0})}
            for p in people
        ],
        'shifts': [shift_payload(s, fixed) for s in shifts],
        'call_ins': [call_in_payload(c) for c in call_ins],
        'actual': actual,
        'requests': [request_payload(r) for r in requests],
        'fixed_departments': sorted(fixed),
        'can_edit': manager,
        'now': {str(k): v for k, v in now_states(ids).items()} if start <= today <= end else {},
    }
    if not manager:  # Call-ins (with reasons) and shift notes are the manager's: staff see the times only.
        payload['call_ins'] = []
        for person in payload['people']:
            person.pop('call_ins')
        for shift in payload['shifts']:
            shift['note'] = ''
    return payload


def my_week(user, start: date | None = None) -> dict:
    """This week and next for one person."""
    from apps.hr.models import ScheduledShift

    start = week_start(start)
    end = start + timedelta(days=13)
    fixed = fixed_departments()
    rows = (ScheduledShift.objects.filter(employee=user, date__gte=start, date__lte=end)
            .select_related('employee', 'department'))
    return {'start': start.isoformat(), 'end': end.isoformat(), 'shifts': [shift_payload(r, fixed) for r in rows]}


def copy_week(source: date, target: date, actor) -> int:
    """Copy one week's shifts onto another. A person who already has a shift that day keeps theirs."""
    from apps.hr.models import ScheduledShift

    source, target = week_start(source), week_start(target)
    if source == target:
        raise ValidationError({'detail': 'Pick a different week to copy from.'})
    taken = set(ScheduledShift.objects.filter(date__gte=target, date__lte=target + timedelta(days=6))
                .values_list('employee_id', 'date'))
    made = 0
    active = set(schedulable_people().values_list('pk', flat=True))
    for row in ScheduledShift.objects.filter(date__gte=source, date__lte=source + timedelta(days=6)):
        day = target + (row.date - source)
        if row.employee_id not in active or (row.employee_id, day) in taken:
            continue
        ScheduledShift.objects.create(employee_id=row.employee_id, date=day, department_id=row.department_id,
                                      start_time=row.start_time, end_time=row.end_time, note=row.note,
                                      created_by=actor)
        taken.add((row.employee_id, day))
        made += 1
    return made


def fill_from_usual(target: date, actor) -> int:
    """Start a week from the usual weekly shifts (Admin → Shifts assignments). Days already set are kept."""
    from apps.hr.models import ScheduledShift, ShiftAssignment

    target = week_start(target)
    taken = set(ScheduledShift.objects.filter(date__gte=target, date__lte=target + timedelta(days=6))
                .values_list('employee_id', 'date'))
    active = set(schedulable_people().values_list('pk', flat=True))
    made = 0
    rows = ShiftAssignment.objects.filter(shift__is_active=True, employee_id__in=active).select_related('shift')
    for assignment in rows:
        for weekday in assignment.weekday_list():
            day = target + timedelta(days=weekday)
            if (assignment.employee_id, day) in taken:
                continue
            shift = assignment.shift
            ScheduledShift.objects.create(employee_id=assignment.employee_id, date=day,
                                          department_id=shift.department_id, start_time=shift.time_in,
                                          end_time=shift.time_out, created_by=actor)
            taken.add((assignment.employee_id, day))
            made += 1
    return made


def clear_week(target: date) -> int:
    """Empty one week's schedule (Dash Updates #74): every scheduled shift Monday to Sunday is removed.
    Call-ins and requests stay (a call-in only loses its link to the shift); clock times are not touched."""
    from apps.hr.models import ScheduledShift

    target = week_start(target)
    deleted, _ = ScheduledShift.objects.filter(date__gte=target, date__lte=target + timedelta(days=6)).delete()
    return deleted
