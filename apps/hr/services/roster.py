"""Super-admin time entry roster with running weekly / payroll totals."""
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


def build_time_roster(date_from, date_to) -> list[dict]:
    """All shifts in range, sorted for running cumulative columns."""
    qs = (
        TimeEntry.objects.filter(date__gte=date_from, date__lte=date_to)
        .select_related('employee', 'employee__employee')
        .order_by('employee__last_name', 'employee__first_name', 'date', 'clock_in')
    )

    week_running: dict[tuple[int, date], Decimal] = {}
    payroll_running: dict[int, Decimal] = {}
    rows = []

    for entry in qs:
        hrs = _entry_hours(entry)
        ws, we = week_bounds(entry.date)
        week_key = (entry.employee_id, ws)
        week_running[week_key] = week_running.get(week_key, Decimal('0')) + hrs
        payroll_running[entry.employee_id] = payroll_running.get(entry.employee_id, Decimal('0')) + hrs

        if entry.clock_out:
            entry.compute_total_hours()

        shift_hours = (entry.total_hours if entry.clock_out else hrs).quantize(Decimal('0.01'))
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
            'total_hours': shift_hours,
            'pay_rate': rate.quantize(Decimal('0.01')),
            'pay': (shift_hours * rate).quantize(Decimal('0.01')),
            'week_start': ws.isoformat(),
            'week_end': we.isoformat(),
            'weekly_cumulative_hours': week_running[week_key].quantize(Decimal('0.01')),
            'payroll_cumulative_hours': payroll_running[entry.employee_id].quantize(Decimal('0.01')),
            'is_open': entry.clock_out is None,
        })

    return rows
