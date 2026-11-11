"""Processing Command Center (Dash Update #87, decision D17): who did what on a day and in its week, read only.

Per processor: items checked in (``Item.checked_in_by`` / ``checked_in_at``), tag dollars (the price on the tag),
both per hour on the clock, the average tag, big items, tag errors traced to them and items sent to Restoration.
The room: the Dashboard's own Processing number against the day's share of the weekly goal, so the two pages agree.

Rules:
- Hours come from the time clock, Processing punches only. No punch = no hours = a blank per-hour cell, never a guess.
- Pace (items and dollars an hour) counts only the days that have a punch: a day's check-ins with no punch add
  to the items and the dollars, never to the pace (``items_off_clock`` says how many were left out). Hours with
  no check-ins give no pace either: a pace of zero is not a known fact when a shared PC stays signed in as
  someone else.
- The week is Monday to the picked day, like the Dashboard's cards.
- A new hire is a person whose first check-in ever was under 30 days before the picked day (or, before their
  first check-in, whose hire date is).
- No pay data. A person who cannot see everyone gets their own line plus the room numbers.
"""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.contrib.auth import get_user_model
from django.db.models import Count, Min, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.hr.models import Shift, TimeEntry
from apps.inventory.models import Item, RestorationJob
from apps.pos.models import DashboardDepartmentGoal
from apps.pos.services.dashboard_metrics import _day_range, _processing_on_shelf_aggregate
from apps.stocktake.models import BadTag

BIG_ITEM_PRICE = Decimal('25')
NEW_HIRE_DAYS = 30
PROCESSING_SLUG = 'processing'
# Monday to Friday unless the goal's own schedule says otherwise.
DEFAULT_WORK_DAYS = (0, 1, 2, 3, 4)
CENT = Decimal('0.01')
ZERO = Decimal('0')


def can_see_everyone(user) -> bool:
    """Leads and the owner: a superuser, a Manager or Admin, or a Processing dial at Manage."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return False
    if user.is_superuser or getattr(user, 'role', None) in ('Manager', 'Admin'):
        return True
    from apps.accounts.services.access import holds

    return holds(user, 'processing:manage')


def _money(value) -> str:
    return str(Decimal(value or 0).quantize(CENT, rounding=ROUND_HALF_UP))


def _rate(amount, hours: Decimal | None) -> str | None:
    """Per clocked hour; blank when there are no hours."""
    if not hours or hours <= 0:
        return None
    return str((Decimal(amount) / hours).quantize(CENT, rounding=ROUND_HALF_UP))


def _blank() -> dict[str, Any]:
    return {
        'items': 0, 'dollars': ZERO, 'big_items': 0, 'big_dollars': ZERO,
        'hours': None, 'tag_errors': 0, 'tag_errors_fixed': 0, 'to_restoration': 0,
        # Check-ins on days that have a punch: the only ones a pace can rest on.
        'paced_items': 0, 'paced_dollars': ZERO,
    }


def _processing_punch_codes() -> set[str]:
    codes = set(Shift.objects.filter(department__slug=PROCESSING_SLUG).values_list('punch_code', flat=True))
    codes.discard('')
    codes.add(PROCESSING_SLUG)
    return codes


def _clocked_hours(start: date, end: date, now) -> dict[tuple[int, date], Decimal]:
    """(person, day) -> hours on Processing punches. An open punch counts up to now, less its breaks."""
    hours: dict[tuple[int, date], Decimal] = {}
    entries = TimeEntry.objects.filter(
        date__gte=start, date__lte=end, shift__in=_processing_punch_codes(),
    ).values('employee_id', 'date', 'clock_in', 'clock_out', 'total_hours', 'break_minutes', 'on_break',
             'break_started_at')
    for row in entries:
        if row['clock_out'] is not None:
            worked = row['total_hours']
            if worked is None:
                seconds = (row['clock_out'] - row['clock_in']).total_seconds() - (row['break_minutes'] or 0) * 60
                worked = Decimal(str(max(seconds, 0))) / Decimal('3600')
        else:
            seconds = (now - row['clock_in']).total_seconds() - (row['break_minutes'] or 0) * 60
            if row['on_break'] and row['break_started_at']:
                seconds -= (now - row['break_started_at']).total_seconds()
            worked = Decimal(str(max(seconds, 0))) / Decimal('3600')
        key = (row['employee_id'], row['date'])
        hours[key] = hours.get(key, ZERO) + Decimal(worked)
    return hours


def _goal(day: date) -> dict[str, Any]:
    """The weekly Processing goal (the Dashboard's) and the picked day's share of it."""
    row = DashboardDepartmentGoal.objects.filter(department=DashboardDepartmentGoal.PROCESSING).first()
    try:
        week = Decimal(str(row.value)) if row is not None else None
    except Exception:
        week = None
    work_days = [d for d in ((row.schedule or {}).get('weekdays') or []) if isinstance(d, int)] if row else []
    work_days = sorted(set(work_days)) or list(DEFAULT_WORK_DAYS)
    if week is None or week <= 0:
        return {'week': None, 'day': None, 'work_days': work_days}
    share = week / len(work_days) if day.weekday() in work_days else None
    return {'week': _money(week), 'day': _money(share) if share is not None else None, 'work_days': work_days}


def _cells(stats: dict[str, Any]) -> dict[str, Any]:
    hours = stats['hours']
    items, dollars = stats['items'], stats['dollars']
    paced = stats['paced_items']
    return {
        'items': items,
        'dollars': _money(dollars),
        'hours': str(hours.quantize(CENT, rounding=ROUND_HALF_UP)) if hours is not None else None,
        'items_per_hour': _rate(paced, hours) if paced else None,
        'dollars_per_hour': _rate(stats['paced_dollars'], hours) if paced else None,
        # Checked in on a day with no punch: in the items and the dollars, left out of the pace.
        'items_off_clock': items - paced,
        'average_tag': _money(dollars / items) if items else None,
        'big_items': stats['big_items'],
        # Share of their tag dollars that came from big items, 0 to 100.
        'big_share': int((stats['big_dollars'] / dollars * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        if dollars > 0 else None,
        'tag_errors': stats['tag_errors'],
        # Already fixed in PR Fix-it, so a fixed one does not read as fresh trouble.
        'tag_errors_fixed': stats['tag_errors_fixed'],
        'to_restoration': stats['to_restoration'],
    }


def _room_average(people: dict[int, dict[str, Any]]) -> dict[str, Any]:
    """The room's check-in pace: people who checked in on the clock, their items and dollars over their hours.

    A person on the Processing clock with no check-ins (receiving, sorting, or working under another sign-in) is
    left out, so a new hire is compared with people doing the same job.
    """
    items, dollars, hours, count = 0, ZERO, ZERO, 0
    for stats in people.values():
        if stats['hours'] and stats['paced_items']:
            items += stats['paced_items']
            dollars += stats['paced_dollars']
            hours += stats['hours']
            count += 1
    # ``people``: how many lines the pace rests on; with one it is that person's own pace, no yardstick.
    return {'items_per_hour': _rate(items, hours), 'dollars_per_hour': _rate(dollars, hours), 'people': count}


def _whole_room(days: list[dict[str, Any]]) -> dict[str, Any]:
    """The room as one: every check-in over every Processing hour. A shared sign-in cannot blur this one.

    ``days`` is one totals dict per day (every person added up). A day with check-ins and no Processing hours in
    the whole room adds to ``items`` but not to the pace, so a week's pace always sits between its days' paces
    (the +1 critic: Monday's 479 no-punch items had pushed the week to 16.5 an hour when its days ran 8 and 10).
    """
    items = sum(d['items'] for d in days)
    paced = [d for d in days if d['hours'] > 0]
    paced_items = sum(d['items'] for d in paced)
    dollars = sum((d['dollars'] for d in paced), ZERO)
    hours = sum((d['hours'] for d in paced), ZERO)
    return {
        'items': items,
        'hours': str(hours.quantize(CENT, rounding=ROUND_HALF_UP)) if hours > 0 else None,
        'items_per_hour': _rate(paced_items, hours) if paced_items else None,
        'dollars_per_hour': _rate(dollars, hours) if paced_items else None,
        'items_off_clock': items - paced_items,
    }


def _shared_sign_in(people: dict[int, dict[str, Any]]) -> bool:
    """Someone clocked Processing hours with no check-ins of their own: lines may hold other people's items."""
    return any(stats['hours'] and not stats['items'] for stats in people.values())


def build(user, day: date | None = None, *, mine: bool = False) -> dict[str, Any]:
    today = timezone.localdate()
    day = min(day or today, today)
    week_start = day - timedelta(days=day.weekday())
    start_dt, end_dt = _day_range(week_start, day)
    now = timezone.now()
    see_all = can_see_everyone(user) and not mine

    # (person, day) -> numbers, for the week up to the picked day. One grouped query per source.
    per_day: dict[tuple[int, date], dict[str, Any]] = {}

    def cell(person_id: int, on: date) -> dict[str, Any]:
        return per_day.setdefault((person_id, on), _blank())

    big = Q(price__gte=BIG_ITEM_PRICE)
    check_ins = (
        Item.objects.filter(checked_in_at__gte=start_dt, checked_in_at__lt=end_dt, checked_in_by__isnull=False)
        .order_by()
        .annotate(day=TruncDate('checked_in_at'))
        .values('checked_in_by_id', 'day')
        .annotate(items=Count('id'), dollars=Sum('price'), big_items=Count('id', filter=big),
                  big_dollars=Sum('price', filter=big))
    )
    for row in check_ins:
        stats = cell(row['checked_in_by_id'], row['day'])
        stats['items'] = row['items']
        stats['dollars'] = row['dollars'] or ZERO
        stats['big_items'] = row['big_items']
        stats['big_dollars'] = row['big_dollars'] or ZERO

    bad_tags = (
        BadTag.objects.filter(found_at__gte=start_dt, found_at__lt=end_dt, checked_in_by__isnull=False)
        .order_by()
        .annotate(day=TruncDate('found_at'))
        .values('checked_in_by_id', 'day')
        .annotate(n=Count('id'), fixed=Count('id', filter=Q(issue__fixed_at__isnull=False)))
    )
    for row in bad_tags:
        stats = cell(row['checked_in_by_id'], row['day'])
        stats['tag_errors'] = row['n']
        stats['tag_errors_fixed'] = row['fixed']

    sent = (
        RestorationJob.objects.filter(created_at__gte=start_dt, created_at__lt=end_dt, created_by__isnull=False)
        .order_by()
        .annotate(day=TruncDate('created_at'))
        .values('created_by_id', 'day')
        .annotate(n=Sum('quantity'))
    )
    for row in sent:
        cell(row['created_by_id'], row['day'])['to_restoration'] = row['n'] or 0

    for (person_id, on), worked in _clocked_hours(week_start, day, now).items():
        cell(person_id, on)['hours'] = worked

    # A person is on the page when they checked in or clocked Processing hours this week. Tag errors and items
    # sent to Restoration show on their line, but alone they do not put someone here (Restoration's own staff
    # open jobs too).
    active = {
        person_id for (person_id, _), stats in per_day.items()
        if stats['items'] or stats['hours'] is not None
    }
    if not see_all:
        active = {user.id}

    def total(person_id: int, days: list[date]) -> dict[str, Any]:
        out = _blank()
        for on in days:
            stats = per_day.get((person_id, on))
            if not stats:
                continue
            for key in ('items', 'dollars', 'big_items', 'big_dollars', 'tag_errors', 'tag_errors_fixed', 'to_restoration'):
                out[key] += stats[key]
            if stats['hours'] is not None:
                out['hours'] = (out['hours'] or ZERO) + stats['hours']
                if stats['hours'] > 0:
                    out['paced_items'] += stats['items']
                    out['paced_dollars'] += stats['dollars']
        return out

    def by_day(person_id: int) -> list[dict[str, Any]]:
        """The week one day at a time, so a trend and a day with no punch both show."""
        out = []
        for on in week_days:
            cells = _cells(total(person_id, [on]))
            out.append({'date': on.isoformat(), 'items': cells['items'], 'dollars': cells['dollars'],
                        'hours': cells['hours'], 'items_per_hour': cells['items_per_hour'],
                        'dollars_per_hour': cells['dollars_per_hour']})
        return out

    week_days = [week_start + timedelta(days=n) for n in range((day - week_start).days + 1)]
    everyone = {person_id for (person_id, _) in per_day}
    day_all = {person_id: total(person_id, [day]) for person_id in everyone}
    week_all = {person_id: total(person_id, week_days) for person_id in everyone}

    def room_on(on: date) -> dict[str, Any]:
        """Everyone added up for one day."""
        cells = [per_day[key] for key in per_day if key[1] == on]
        return {
            'items': sum(c['items'] for c in cells),
            'dollars': sum((c['dollars'] for c in cells), ZERO),
            'hours': sum((c['hours'] or ZERO for c in cells), ZERO),
        }

    room_days = {on: room_on(on) for on in week_days}

    # New hires: the first check-in ever, only looked up for people with no check-in older than the window.
    cutoff_dt = _day_range(day - timedelta(days=NEW_HIRE_DAYS - 1), day)[0]
    # One short "is there any" look per person: a DISTINCT over a busy sign-in's whole history is far slower.
    veterans = {
        person_id for person_id in active
        if Item.objects.filter(checked_in_by_id=person_id, checked_in_at__lt=cutoff_dt).order_by().exists()
    }
    firsts = dict(
        Item.objects.filter(checked_in_by_id__in=active - veterans, checked_in_at__isnull=False)
        .order_by().values_list('checked_in_by_id').annotate(first=Min('checked_in_at'))
    )

    # No check-in yet (their first days): the hire date decides.
    new_floor = day - timedelta(days=NEW_HIRE_DAYS - 1)
    from apps.accounts.models import EmployeeProfile

    hired = dict(
        EmployeeProfile.objects.filter(user_id__in=active - veterans - set(firsts), hire_date__gte=new_floor)
        .values_list('user_id', 'hire_date')
    )

    rows = list(get_user_model().objects.filter(id__in=active)
                .values('id', 'first_name', 'last_name', 'email', 'is_superuser'))
    names = {row['id']: (f"{row['first_name']} {row['last_name']}".strip() or row['email']) for row in rows}
    owners = {row['id'] for row in rows if row['is_superuser']}
    people = []
    for person_id in active:
        first = firsts.get(person_id)
        people.append({
            'user_id': person_id,
            'name': names.get(person_id, 'Unknown'),
            'is_new': first is not None or person_id in hired,
            'first_check_in': timezone.localtime(first).date().isoformat() if first else None,
            'hired': hired[person_id].isoformat() if person_id in hired else None,
            # The owner checks in now and then without a Processing punch; that is not a missed punch.
            'is_owner': person_id in owners,
            'days': by_day(person_id),
            'day': _cells(day_all.get(person_id) or _blank()),
            'week': _cells(week_all.get(person_id) or _blank()),
        })
    people.sort(key=lambda p: (-Decimal(p['week']['dollars']), p['name']))

    room_week, room_by_day = _processing_on_shelf_aggregate(week_start, day)
    return {
        'date': day.isoformat(),
        'today': today.isoformat(),
        'week_start': week_start.isoformat(),
        'can_see_everyone': see_all,
        'me': user.id,
        'big_item_price': _money(BIG_ITEM_PRICE),
        'new_hire_days': NEW_HIRE_DAYS,
        'goal': _goal(day),
        'room': {
            # The Dashboard's Processing number: everything put on the floor, each item once.
            'day_dollars': _money(room_by_day.get(day, ZERO)),
            'week_dollars': _money(room_week),
            'day_average': _room_average(day_all),
            'week_average': _room_average(week_all),
            # Every check-in over every Processing hour: the pace a shared sign-in cannot blur.
            'day_whole': _whole_room([room_days[day]]),
            'week_whole': _whole_room(list(room_days.values())),
            'shared_sign_in': {'day': _shared_sign_in(day_all), 'week': _shared_sign_in(week_all)},
            'by_day': [{'date': on.isoformat(), 'dollars': _money(room_by_day.get(on, ZERO))} for on in week_days],
        },
        'people': people,
    }
