"""Pay numbers for QuickBooks Online, and the pay period lock (owner 2026-10-21, digest point 5).

- **Overtime.** Hours past 40 in a Mon-Sun week are overtime, paid at 1.5 times the rate. (The overtime allowance on the
  profile only says how far past 40 someone may go before the red flag; it never changes pay.) Pay periods are two
  Mon-Sun weeks (``payroll_periods.py``), so a week never splits across two periods.
- **The numbers.** Per person for one pay period: regular hours, overtime hours, rate, overtime rate, gross. Payroll
  stays in QuickBooks Online; these are the numbers to type there. Only finished shifts count; a shift still clocked in
  is flagged, not counted.
- **Closed.** A closed period's time entries can't be added, edited, approved or deleted (``TimeEntry.save`` asks
  ``assert_open_for_entry``) until the owner reopens it. A period with someone still clocked in can't be closed.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.hr.services.payroll_periods import payroll_period_bounds, payroll_period_label
from apps.hr.services.time_clock_utils import WEEKLY_HOUR_LIMIT

OVERTIME_RATE = Decimal('1.5')
CENT = Decimal('0.01')


class PeriodClosed(ValidationError):
    """Raised by ``TimeEntry.save`` for a closed period; DRF answers it as a 400."""

    def __init__(self, start: date, end: date):
        super().__init__({'detail': f'The pay period {payroll_period_label(start, end)} is closed. '
                                    'The owner can reopen it in Time & payroll.', 'code': 'PERIOD_CLOSED'})


def is_closed(day: date) -> bool:
    from apps.hr.models import PayPeriodClose

    start, _end = payroll_period_bounds(day)
    return PayPeriodClose.objects.filter(date_from=start, is_closed=True).exists()


def assert_open(day: date | None) -> None:
    if day is not None and is_closed(day):
        raise PeriodClosed(*payroll_period_bounds(day))


def assert_open_for_entry(entry) -> None:
    """A save of this entry would change a closed period: its new day, or the day it is moving from."""
    from apps.hr.models import TimeEntry

    assert_open(entry.date)
    if entry.pk:
        was = TimeEntry.all_objects.filter(pk=entry.pk).values_list('date', flat=True).first()
        if was and was != entry.date:
            assert_open(was)


def status(start: date) -> dict:
    from apps.hr.models import PayPeriodClose

    row = PayPeriodClose.objects.filter(date_from=start).select_related('closed_by', 'reopened_by').first()
    closed = bool(row and row.is_closed)
    return {
        'closed': closed,
        'closed_at': row.closed_at if closed else None,
        'closed_by': row.closed_by.full_name if closed and row.closed_by else '',
        'reopened_at': row.reopened_at if row and not closed else None,
        'reopened_by': row.reopened_by.full_name if row and not closed and row.reopened_by else '',
    }


def close(start: date, user) -> dict:
    from apps.hr.models import PayPeriodClose, TimeEntry

    start, end = payroll_period_bounds(start)
    if TimeEntry.objects.filter(date__gte=start, date__lte=end, clock_out__isnull=True).exists():
        raise ValidationError({'detail': 'Someone in this period is still clocked in. Close their shift first.',
                               'code': 'OPEN_SHIFT'})
    with transaction.atomic():
        row, _ = PayPeriodClose.objects.select_for_update().get_or_create(date_from=start, defaults={'date_to': end})
        row.date_to, row.is_closed, row.closed_by, row.closed_at = end, True, user, timezone.now()
        row.save()
    return status(start)


def reopen(start: date, user) -> dict:
    from apps.hr.models import PayPeriodClose

    start, _end = payroll_period_bounds(start)
    row = PayPeriodClose.objects.filter(date_from=start, is_closed=True).first()
    if row is not None:
        row.is_closed, row.reopened_by, row.reopened_at = False, user, timezone.now()
        row.save(update_fields=['is_closed', 'reopened_by', 'reopened_at'])
    return status(start)


def split_week(hours: Decimal) -> tuple[Decimal, Decimal]:
    """(regular, overtime) for one Mon-Sun week."""
    hours = max(hours, Decimal('0'))
    regular = min(hours, WEEKLY_HOUR_LIMIT)
    return regular, hours - regular


def split_hours_by_week(entries, *, include_open: bool = False) -> tuple[Decimal, Decimal]:
    """(regular, overtime) for one person's shifts, overtime counted per Mon-Sun week. Finished shifts only, unless
    ``include_open`` (my pay so far, with the shift still going)."""
    from apps.hr.services.roster import shift_hours

    weeks: dict[date, Decimal] = defaultdict(Decimal)
    for entry in entries:
        if entry.clock_out is None and not include_open:
            continue
        weeks[entry.date - timedelta(days=entry.date.weekday())] += shift_hours(entry)
    regular = overtime = Decimal('0')
    for hours in weeks.values():
        r, o = split_week(hours.quantize(CENT))
        regular, overtime = regular + r, overtime + o
    return regular.quantize(CENT), overtime.quantize(CENT)


def gross(regular: Decimal, overtime: Decimal, rate: Decimal) -> Decimal:
    return (regular * rate + overtime * rate * OVERTIME_RATE).quantize(CENT)


def period_numbers(start: date) -> dict:
    """QuickBooks numbers for the pay period that holds ``start``: one row per person who worked in it."""
    from apps.hr.models import TimeEntry
    from apps.hr.services.roster import shift_hours

    start, end = payroll_period_bounds(start)
    entries = (TimeEntry.objects.filter(date__gte=start, date__lte=end)
               .select_related('employee', 'employee__employee').order_by('employee__last_name', 'employee__first_name'))
    weeks: dict[int, dict[date, Decimal]] = defaultdict(lambda: defaultdict(Decimal))
    people: dict[int, dict] = {}
    for entry in entries:
        person = people.get(entry.employee_id)
        if person is None:
            profile = getattr(entry.employee, 'employee', None)
            person = people[entry.employee_id] = {
                'employee_id': entry.employee_id,
                'name': entry.employee.full_name,
                'employee_number': getattr(profile, 'employee_number', '') or '',
                'rate': Decimal(str(getattr(profile, 'pay_rate', 0) or 0)).quantize(CENT),
                'shifts': 0, 'open_shifts': 0, 'pending_shifts': 0,
            }
        if entry.clock_out is None:
            person['open_shifts'] += 1
            continue
        person['shifts'] += 1
        if entry.status != 'approved':
            person['pending_shifts'] += 1
        monday = entry.date - timedelta(days=entry.date.weekday())
        weeks[entry.employee_id][monday] += shift_hours(entry)
    rows = []
    for employee_id, person in people.items():
        regular = overtime = Decimal('0')
        for hours in weeks[employee_id].values():
            r, o = split_week(hours.quantize(CENT))
            regular, overtime = regular + r, overtime + o
        rate = person['rate']
        rows.append({
            **person,
            'regular_hours': regular.quantize(CENT), 'overtime_hours': overtime.quantize(CENT),
            'overtime_rate': (rate * OVERTIME_RATE).quantize(CENT),
            'regular_pay': (regular * rate).quantize(CENT),
            'overtime_pay': (overtime * rate * OVERTIME_RATE).quantize(CENT),
            'gross': gross(regular, overtime, rate),
        })
    totals = {key: sum((row[key] for row in rows), Decimal('0')).quantize(CENT)
              for key in ('regular_hours', 'overtime_hours', 'regular_pay', 'overtime_pay', 'gross')}
    return {
        'date_from': start.isoformat(), 'date_to': end.isoformat(), 'label': payroll_period_label(start, end),
        'overtime_multiplier': OVERTIME_RATE, 'rows': rows, 'totals': totals, **status(start),
    }


def as_text(value):
    """Money and hours as "76.00" strings, as the other pay endpoints send them (JSON would make them floats)."""
    if isinstance(value, Decimal):
        return f'{value:.2f}'
    if isinstance(value, dict):
        return {key: as_text(item) for key, item in value.items()}
    if isinstance(value, list):
        return [as_text(item) for item in value]
    return value
