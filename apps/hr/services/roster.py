"""Super-admin time entry roster with weekly totals (Mon–Sun per employee)."""
from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.hr.models import TimeEntry
from apps.hr.services.time_clock_utils import _entry_hours, week_bounds


def _break_label(entry: TimeEntry) -> str:
    if entry.on_break and entry.break_started_at:
        local = timezone.localtime(entry.break_started_at)
        return f'On break since {local.strftime("%I:%M %p").lstrip("0")}'
    mins = entry.break_minutes or 0
    if mins <= 0:
        return '—'
    hours, rem = divmod(mins, 60)
    if hours:
        return f'{hours}h {rem}m'
    return f'{rem}m'


def _pay_rate_for(entry: TimeEntry) -> Decimal:
    """Hourly pay rate from the employee profile (0 when missing)."""
    profile = getattr(entry.employee, 'employee', None)
    rate = getattr(profile, 'pay_rate', None)
    return Decimal(rate) if rate is not None else Decimal('0')


def shift_hours(entry: TimeEntry) -> Decimal:
    if entry.clock_out:
        entry.compute_total_hours()
        return (entry.total_hours or Decimal('0')).quantize(Decimal('0.01'))
    return _entry_hours(entry).quantize(Decimal('0.01'))


def _week_partition_totals(week_keys: set[tuple[int, date]]) -> dict[tuple[int, date], Decimal]:
    """SUM(hours) per (employee, calendar week) — full Mon–Sun week, not running."""
    totals: dict[tuple[int, date], Decimal] = {}
    for employee_id, week_start in week_keys:
        week_end = week_start + timedelta(days=6)
        entries = TimeEntry.objects.filter(
            employee_id=employee_id,
            date__gte=week_start,
            date__lte=week_end,
        )
        total = Decimal('0')
        for entry in entries:
            total += shift_hours(entry)
        totals[(employee_id, week_start)] = total.quantize(Decimal('0.01'))
    return totals


def build_time_roster(date_from, date_to) -> list[dict]:
    """Shifts in range; weekly_cumulative_hours = full-week sum per employee (same on every row)."""
    qs = (
        TimeEntry.objects.filter(date__gte=date_from, date__lte=date_to)
        .select_related('employee', 'employee__employee')
        .order_by('employee__last_name', 'employee__first_name', 'date', 'clock_in')
    )

    rows: list[dict] = []
    week_keys: set[tuple[int, date]] = set()

    for entry in qs:
        ws, we = week_bounds(entry.date)
        week_key = (entry.employee_id, ws)
        week_keys.add(week_key)

        hours = shift_hours(entry)
        rate = _pay_rate_for(entry)

        rows.append({
            'id': entry.id,
            'employee_id': entry.employee_id,
            'employee_name': entry.employee.full_name,
            'date': entry.date.isoformat(),
            'clock_in': entry.clock_in.isoformat() if entry.clock_in else None,
            'clock_out': entry.clock_out.isoformat() if entry.clock_out else None,
            'break_minutes': entry.break_minutes or 0,
            'break_label': _break_label(entry),
            'on_break': entry.on_break,
            'total_hours': hours,
            'pay_rate': rate.quantize(Decimal('0.01')),
            'pay': (hours * rate).quantize(Decimal('0.01')),
            'week_start': ws.isoformat(),
            'week_end': we.isoformat(),
            'is_open': entry.clock_out is None,
        })

    week_totals = _week_partition_totals(week_keys)
    for row in rows:
        ws = date.fromisoformat(row['week_start'])
        key = (row['employee_id'], ws)
        row['weekly_cumulative_hours'] = week_totals.get(key, Decimal('0'))

    return rows
