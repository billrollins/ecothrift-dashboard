"""Weekly hours and overtime helpers for time clock MVP."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.local_dates import local_day
from apps.hr.models import TimeEntry

WEEKLY_HOUR_LIMIT = Decimal('40.00')
MAX_SHIFT_HOURS = Decimal('16.00')


def validate_shift_duration(
    clock_in,
    clock_out,
    break_minutes=0,
    *,
    skip_max_duration: bool = False,
) -> None:
    """Reject clock spans that cannot represent a single work shift."""
    if not clock_in or not clock_out:
        return
    delta = clock_out - clock_in
    hours = Decimal(str(delta.total_seconds())) / Decimal('3600')
    break_hours = Decimal(str(break_minutes or 0)) / Decimal('60')
    worked = hours - break_hours
    if not skip_max_duration and worked > MAX_SHIFT_HOURS:
        raise ValidationError(
            {
                'detail': (
                    f'Shift duration is {worked.quantize(Decimal("0.01"))} hours after breaks '
                    f'(max {MAX_SHIFT_HOURS} per shift). Check clock in/out dates and times.'
                ),
            }
        )
    if worked < Decimal('0'):
        raise ValidationError({'detail': 'Clock out must be after clock in.'})


def week_bounds(for_day: date | None = None) -> tuple[date, date]:
    """Calendar week Mon-Sun containing for_day (local date)."""
    d = for_day or timezone.localdate()
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _entry_hours(entry: TimeEntry, as_of: datetime | None = None) -> Decimal:
    """Billable hours for one entry; open shifts use as_of (default now)."""
    if entry.clock_out:
        entry.compute_total_hours()
        return entry.total_hours or Decimal('0')

    end = as_of or timezone.now()
    delta = end - entry.clock_in
    hours = Decimal(str(delta.total_seconds())) / Decimal('3600')
    break_mins = entry.break_minutes or 0
    if entry.on_break and entry.break_started_at:
        active_break = (end - entry.break_started_at).total_seconds() / 60
        break_mins += int(active_break)
    break_hours = Decimal(str(break_mins)) / Decimal('60')
    return max(hours - break_hours, Decimal('0'))


def weekly_hours_for_employee(employee, as_of: datetime | None = None) -> Decimal:
    """Sum hours for employee in the current calendar week (Mon-Sun)."""
    as_of = as_of or timezone.now()
    week_start, week_end = week_bounds(local_day(as_of))
    entries = TimeEntry.objects.filter(
        employee=employee,
        date__gte=week_start,
        date__lte=week_end,
    )
    total = Decimal('0')
    for entry in entries:
        total += _entry_hours(entry, as_of)
    return total.quantize(Decimal('0.01'))


def completed_hours_for_employee(
    employee,
    date_from: date,
    date_to: date,
) -> Decimal:
    """Sum hours from completed shifts only (clock in and out) in a date range."""
    entries = TimeEntry.objects.filter(
        employee=employee,
        date__gte=date_from,
        date__lte=date_to,
        clock_out__isnull=False,
    )
    total = Decimal('0')
    for entry in entries:
        entry.compute_total_hours()
        total += entry.total_hours or Decimal('0')
    return total.quantize(Decimal('0.01'))


def completed_hours_this_week_for_employee(employee, as_of: datetime | None = None) -> Decimal:
    """Completed shift hours for the calendar week containing as_of."""
    as_of = as_of or timezone.now()
    week_start, week_end = week_bounds(local_day(as_of))
    return completed_hours_for_employee(employee, week_start, week_end)


def overtime_allowance_for(employee) -> Decimal:
    """Hours past the weekly 40 this person is cleared to work (0 when none, or no employee profile)."""
    profile = getattr(employee, 'employee', None)
    allowance = getattr(profile, 'overtime_allowance_hours', None)
    return Decimal(allowance) if allowance and allowance > 0 else Decimal('0.00')


def week_hours_by_user(as_of: datetime | None = None) -> dict:
    """{user id: hours this calendar week} for everyone with a time entry this week (one query)."""
    as_of = as_of or timezone.now()
    week_start, week_end = week_bounds(timezone.localtime(as_of).date())
    totals: dict = {}
    for entry in TimeEntry.objects.filter(date__gte=week_start, date__lte=week_end, deleted_at__isnull=True):
        totals[entry.employee_id] = totals.get(entry.employee_id, Decimal('0')) + _entry_hours(entry, as_of)
    return {key: value.quantize(Decimal('0.01')) for key, value in totals.items()}


def hours_text(value) -> str:
    """43.20 -> '43.2', 40.00 -> '40'."""
    return f'{Decimal(value):.2f}'.rstrip('0').rstrip('.')


def over_hours_flag(hours, allowance, employee_id=None) -> dict | None:
    """The red flag when a week is past 40 plus the allowance: ``hours``, ``limit`` (what they are cleared for),
    ``base`` (40) and ``link`` to their time entries so the entry can be fixed. None when they are within it."""
    hours, allowance = Decimal(hours or 0), Decimal(allowance or 0)
    limit = WEEKLY_HOUR_LIMIT + allowance
    if hours <= limit:
        return None
    return {
        'hours': hours.quantize(Decimal('0.01')), 'limit': limit, 'base': WEEKLY_HOUR_LIMIT, 'allowance': allowance,
        'hours_text': hours_text(hours), 'limit_text': hours_text(limit),
        'text': f'Over their hours: {hours_text(hours)} of {hours_text(limit)}. Forgot to clock out? '
                f'Fix the time entry.',
        'link': f'/admin/time-payroll?employee={employee_id}' if employee_id else '/admin/time-payroll',
    }


def weekly_status_for_employee(employee, as_of: datetime | None = None) -> dict:
    """Payload for weekly overtime UI. ``hours_limit`` is what this person is cleared for: 40 plus their overtime
    allowance (0 for almost everyone). ``overtime_hours`` is the part past the base 40 (what payroll pays at 1.5)."""
    as_of = as_of or timezone.now()
    week_start, week_end = week_bounds(local_day(as_of))
    hours = weekly_hours_for_employee(employee, as_of)
    allowance = overtime_allowance_for(employee)
    limit = WEEKLY_HOUR_LIMIT + allowance
    remaining = max(limit - hours, Decimal('0'))
    return {
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'hours_worked': hours,
        'hours_limit': limit,
        'base_limit': WEEKLY_HOUR_LIMIT,
        'overtime_allowance': allowance,
        'hours_remaining': remaining,
        'is_at_limit': hours >= limit,
        'is_over_limit': hours > limit,
        'overtime_hours': max(hours - WEEKLY_HOUR_LIMIT, Decimal('0')),
    }
