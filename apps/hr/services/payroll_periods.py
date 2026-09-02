"""Biweekly payroll periods anchored to the last manual run (Jun 8-21, 2026)."""
from datetime import date, timedelta

from django.utils import timezone

# Last payroll before biweekly cadence: Jun 8-21, 2026 (14 days inclusive).
PAYROLL_ANCHOR_START = date(2026, 6, 8)
PAYROLL_PERIOD_DAYS = 14


def payroll_period_bounds(for_day: date | None = None) -> tuple[date, date]:
    """Return (start, end) inclusive for the payroll period containing for_day."""
    d = for_day or timezone.localdate()
    days_since = (d - PAYROLL_ANCHOR_START).days
    if days_since >= 0:
        period_index = days_since // PAYROLL_PERIOD_DAYS
    else:
        period_index = -1 - ((-days_since - 1) // PAYROLL_PERIOD_DAYS)
    start = PAYROLL_ANCHOR_START + timedelta(days=period_index * PAYROLL_PERIOD_DAYS)
    end = start + timedelta(days=PAYROLL_PERIOD_DAYS - 1)
    return start, end


def payroll_period_label(start: date, end: date) -> str:
    if start.year == end.year:
        if start.month == end.month:
            return f'{start.strftime("%b %d")} - {end.day}, {end.year}'
        return f'{start.strftime("%b %d")} - {end.strftime("%b %d, %Y")}'
    return f'{start.strftime("%b %d, %Y")} - {end.strftime("%b %d, %Y")}'


def list_payroll_periods(count: int = 16, reference_date: date | None = None) -> list[dict]:
    """Most recent payroll period first (current or containing reference_date)."""
    ref = reference_date or timezone.localdate()
    start, end = payroll_period_bounds(ref)
    periods = []
    for _ in range(max(count, 1)):
        periods.append({
            'date_from': start.isoformat(),
            'date_to': end.isoformat(),
            'label': payroll_period_label(start, end),
            'is_current': start <= ref <= end,
        })
        start = start - timedelta(days=PAYROLL_PERIOD_DAYS)
        end = end - timedelta(days=PAYROLL_PERIOD_DAYS)
    return periods
