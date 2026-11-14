"""My pay period, for the Time clock tab's Mine view (Dash Update #137; Bill 2026-11-13, .ai/extended/
home-and-hr-structure.md decisions 4 and 12).

One read for the signed-in person: every day of the current biweekly period with what was scheduled and what was
worked, the hours and pay so far, and what the scheduled shifts still ahead add if they are worked as scheduled.

- **So far** is what ``my_pay`` shows for the current period: every shift in it, approved or not, the open one up to now;
  overtime is the part past 40 in a Mon-Sun week, paid at 1.5.
- **Ahead** is the schedule from now to the end of the period: a later day counts in full; today counts from now (or
  its start) to its end, and not at all once they have clocked out today. Breaks are not known ahead, so it is the
  scheduled time.
- **Expected** is the two together, overtime split per week again (a week the schedule pushes past 40 pays the extra
  at 1.5). ``weeks`` carries each week's worked, ahead and cleared hours so the page can warn ahead of time.
- **Off payroll** (family, #121): the hours are the same; every pay figure is None, so the page shows no dollars.
- **Requests:** each worked shift carries its latest "fix this shift" request (``TimeEntryModificationRequest``), and
  ``requests`` lists the person's own schedule requests (unpaid days off, new times) from the period start on.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

CENT = Decimal('0.01')


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(value.quantize(CENT))


def _hours(value: Decimal) -> str:
    return str(value.quantize(CENT))


def _week_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def scheduled_left(row, now: datetime, clocked_out_today: bool) -> Decimal:
    """Hours of one scheduled shift still ahead of ``now`` (local, aware)."""
    today = timezone.localdate(now)
    if row.date < today or (row.date == today and clocked_out_today):
        return Decimal('0')
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(row.date, row.start_time), tz)
    end = timezone.make_aware(datetime.combine(row.date, row.end_time), tz)
    if end <= start:
        end += timedelta(days=1)
    seconds = (end - max(start, now)).total_seconds()
    return (Decimal(max(seconds, 0)) / Decimal(3600)).quantize(CENT)


def my_period(user, now: datetime | None = None, request=None) -> dict:
    from apps.hr.models import ScheduledShift, ScheduleRequest, TimeEntry, TimeEntryModificationRequest
    from apps.hr.serializers import TimeEntrySerializer
    from apps.hr.services import pay_periods
    from apps.hr.services.payroll_people import is_on_payroll
    from apps.hr.services.payroll_periods import payroll_period_bounds, payroll_period_label
    from apps.hr.services.roster import shift_hours
    from apps.hr.services.schedule import fixed_departments, request_payload, shift_payload
    from apps.hr.services.time_clock_utils import WEEKLY_HOUR_LIMIT, overtime_allowance_for

    now = now or timezone.now()
    today = timezone.localdate(now)
    start, end = payroll_period_bounds(today)
    on_payroll = is_on_payroll(user)
    profile = getattr(user, 'employee', None) if hasattr(user, 'employee') else None
    rate = Decimal(getattr(profile, 'pay_rate', 0) or 0)

    entries = list(TimeEntry.objects.filter(employee=user, date__gte=start, date__lte=end)
                   .select_related('employee', 'approved_by').order_by('date', 'clock_in'))
    shifts = list(ScheduledShift.objects.filter(employee=user, date__gte=start, date__lte=end)
                  .select_related('employee', 'department').order_by('date', 'start_time'))
    latest_change: dict[int, TimeEntryModificationRequest] = {}
    for change in (TimeEntryModificationRequest.objects.filter(time_entry__in=[e.pk for e in entries])
                   .order_by('created_at')):
        latest_change[change.time_entry_id] = change
    requests = list(ScheduleRequest.objects.filter(employee=user, end_date__gte=start)
                    .exclude(status=ScheduleRequest.WITHDRAWN).select_related('employee', 'decided_by')
                    .order_by('date', 'created_at'))

    clocked_out_today = any(e.date == today and e.clock_out for e in entries) and not any(
        e.date == today and not e.clock_out for e in entries)
    worked_by_week: dict[date, Decimal] = defaultdict(Decimal)
    for entry in entries:
        worked_by_week[_week_of(entry.date)] += shift_hours(entry)
    ahead_by_week: dict[date, Decimal] = defaultdict(Decimal)
    ahead_count = 0
    ahead_of: dict[int, Decimal] = {}
    for row in shifts:
        left = scheduled_left(row, now, clocked_out_today)
        ahead_of[row.pk] = left
        if left > 0:
            ahead_by_week[_week_of(row.date)] += left
            ahead_count += 1

    regular, overtime = pay_periods.split_hours_by_week(entries, include_open=True)
    worked = regular + overtime
    exp_regular = exp_overtime = Decimal('0')
    for week in set(worked_by_week) | set(ahead_by_week):
        r, o = pay_periods.split_week((worked_by_week[week] + ahead_by_week[week]).quantize(CENT))
        exp_regular, exp_overtime = exp_regular + r, exp_overtime + o
    ahead = sum(ahead_by_week.values(), Decimal('0'))
    pay_so_far = pay_periods.gross(regular, overtime, rate) if on_payroll else None
    pay_expected = pay_periods.gross(exp_regular, exp_overtime, rate) if on_payroll else None
    pending = sum((shift_hours(e) for e in entries if e.status != 'approved'), Decimal('0'))

    limit = WEEKLY_HOUR_LIMIT + overtime_allowance_for(user)
    weeks = []
    week = _week_of(start)
    while week <= end:
        weeks.append({
            'start': week.isoformat(), 'end': (week + timedelta(days=6)).isoformat(),
            'worked': _hours(worked_by_week[week]), 'ahead': _hours(ahead_by_week[week]), 'limit': _hours(limit),
            'is_current': week <= today <= week + timedelta(days=6),
        })
        week += timedelta(days=7)

    fixed = fixed_departments()
    serializer_context = {'request': request}
    days = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        day_entries = [e for e in entries if e.date == day]
        day_shifts = [s for s in shifts if s.date == day]
        day_off = [r for r in requests if r.kind == ScheduleRequest.KIND_OFF and r.date <= day <= r.end_date
                   and r.status != ScheduleRequest.DECLINED]
        if not (day_entries or day_shifts or day_off):
            continue
        worked_rows = []
        for entry in day_entries:
            row = TimeEntrySerializer(entry, context=serializer_context).data
            if entry.clock_out is None:
                row['hours_so_far'] = _hours(shift_hours(entry))
            change = latest_change.get(entry.pk)
            row['change'] = ({'id': change.pk, 'status': change.status, 'review_note': change.review_note}
                             if change else None)
            worked_rows.append(row)
        days.append({
            'date': day.isoformat(),
            'is_today': day == today,
            'is_past': day < today,
            'scheduled': [{**shift_payload(s, fixed), 'note': '', 'hours_ahead': _hours(ahead_of[s.pk])}
                          for s in day_shifts],
            'worked': worked_rows,
            'day_off': request_payload(day_off[0]) if day_off else None,
        })

    return {
        'date_from': start.isoformat(),
        'date_to': end.isoformat(),
        'label': payroll_period_label(start, end),
        'today': today.isoformat(),
        'days_left': max((end - today).days, 0),
        'on_payroll': on_payroll,
        'so_far': {
            'hours': _hours(worked),
            'overtime_hours': _hours(overtime),
            'pending_hours': _hours(pending),
            'shift_count': len(entries),
            'pay': _money(pay_so_far),
        },
        'ahead': {
            'hours': _hours(ahead),
            'shift_count': ahead_count,
            'pay': _money(None if pay_expected is None or pay_so_far is None else pay_expected - pay_so_far),
        },
        'expected': {
            'hours': _hours(worked + ahead),
            'overtime_hours': _hours(exp_overtime),
            'pay': _money(pay_expected),
        },
        'weeks': weeks,
        'days': days,
        'requests': [request_payload(r) for r in requests],
    }
