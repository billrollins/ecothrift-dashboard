"""Weekly hours and overtime helpers for time clock MVP."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError

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
    """Calendar week Mon–Sun containing for_day (local date)."""
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
    """Sum hours for employee in the current calendar week (Mon–Sun)."""
    as_of = as_of or timezone.now()
    week_start, week_end = week_bounds(as_of.date())
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
    week_start, week_end = week_bounds(as_of.date())
    return completed_hours_for_employee(employee, week_start, week_end)


def weekly_status_for_employee(employee, as_of: datetime | None = None) -> dict:
    """Payload for weekly overtime UI."""
    as_of = as_of or timezone.now()
    week_start, week_end = week_bounds(as_of.date())
    hours = weekly_hours_for_employee(employee, as_of)
    limit = WEEKLY_HOUR_LIMIT
    remaining = max(limit - hours, Decimal('0'))
    return {
        'week_start': week_start.isoformat(),
        'week_end': week_end.isoformat(),
        'hours_worked': hours,
        'hours_limit': limit,
        'hours_remaining': remaining,
        'is_at_limit': hours >= limit,
        'is_over_limit': hours > limit,
        'overtime_hours': max(hours - limit, Decimal('0')),
    }
