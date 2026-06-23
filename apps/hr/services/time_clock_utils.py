"""Weekly hours and overtime helpers for time clock MVP."""
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.hr.models import TimeEntry

WEEKLY_HOUR_LIMIT = Decimal('40.00')


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
