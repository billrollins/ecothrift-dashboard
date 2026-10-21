"""The week schedule and call-ins (owner 2026-10-21, digest point 5).

- **The week.** A manager builds each week: one ``ScheduledShift`` per person per day they work (department, start,
  end, note). "Copy last week" and "Fill from usual shifts" (the weekly ``ShiftAssignment`` patterns) start it; neither
  touches a day a person already has.
- **Fixed or flexible.** Retail keeps fixed shifts. Every other department flexes: leave early on a slow day, come in
  or stay late on a busy one, so its times are the plan. The fixed departments are one owner-editable setting,
  ``hr.fixed_schedule_departments`` (department slugs, default ``["retail-operations"]``).
- **My week.** Each person sees their own shifts for this week and next (Me page).
- **Call-ins.** Who, which shift, when they called (or a no-call no-show) and why; counted per person over the last 30
  and 90 days.
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


def week(start: date) -> dict:
    from apps.hr.models import CallIn, ScheduledShift

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
    return {
        'start': start.isoformat(), 'end': end.isoformat(),
        'days': [(start + timedelta(days=n)).isoformat() for n in range(7)],
        'people': [
            {'id': p.pk, 'name': p.full_name,
             'department': p.employee.department_id, 'department_name': p.employee.department.name if p.employee.department_id else '',
             'hours': hours.get(p.pk, 0), 'call_ins': counts.get(p.pk, {'d30': 0, 'd90': 0, 'no_show_90': 0})}
            for p in people
        ],
        'shifts': [shift_payload(s, fixed) for s in shifts],
        'call_ins': [call_in_payload(c) for c in call_ins],
        'fixed_departments': sorted(fixed),
    }


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
