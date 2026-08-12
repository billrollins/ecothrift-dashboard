"""What restoration earned.

Two questions, one source of truth:

* **Per job** — how much value did this job add? `value_added` is stamped at
  completion so a later edit to a grade scale cannot rewrite what a finished job
  earned. Where it cannot be computed honestly it stays null and the job is
  excluded from every rate, counted instead as unmeasured.

* **Across a window** — the scoreboard on the TARS home screen. Value added and
  items finished per day, per week and over a trailing four weeks, plus the rate
  those came to per hour on the bench.

The rate here **includes** investigation time. That is deliberate and it is the
opposite of the bench's rule: a forward-looking decision ignores minutes already
spent, but a report of what an item earned must count every minute it consumed,
or restoration reads as more profitable than it is.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Count, Sum
from django.utils import timezone

from apps.inventory.models import RestorationJob

# Bill's pay-rate unit: what an hour of bench time costs. Recorded here rather
# than derived — it is a policy number, not a measurement.
PAY_RATE_UNIT = Decimal('20.00')

# The trailing average is only meaningful once it has something to average, and
# an unreachable target set by one lucky item is worse than no target at all.
BENCHMARK_WINDOW_DAYS = 28
BENCHMARK_MINIMUM_JOBS = 10

CENTS = Decimal('0.01')


def _money(value: Decimal | None) -> str | None:
    if value is None:
        return None
    return str(Decimal(value).quantize(CENTS))


def _grade_value(grade_values: Any, grade: str) -> Decimal | None:
    """Read one grade's price, tolerating whatever shape the JSON is in."""

    if not grade or not isinstance(grade_values, dict):
        return None
    if grade not in grade_values:
        return None
    try:
        return Decimal(str(grade_values[grade]))
    except (TypeError, ValueError, ArithmeticError):
        return None


def compute_value_added(
    job: RestorationJob,
    *,
    final_grade: str | None = None,
    parts_cost: Decimal | None = None,
) -> Decimal | None:
    """What the work added, forward from where the item arrived.

    `(price at final grade) - (price at starting grade) - parts spent`.

    Returns None when either end of that subtraction is unknown. Guessing would
    be worse than admitting it: with no starting grade the whole final price
    looks like value the bench created, which flatters every report built on it.
    """

    grade_values = job.grade_values
    end = _grade_value(grade_values, final_grade or job.final_grade)
    start = _grade_value(grade_values, job.starting_grade)
    if end is None or start is None:
        return None
    spent = parts_cost if parts_cost is not None else job.spent_parts_cost
    return end - start - (spent or Decimal('0'))


def starting_grade_from_session(session: Any) -> str:
    """The datum Mike recorded — the grade the item arrived at.

    The bench writes `benchPlan.startingGrade`. The retired decision cockpit
    wrote it inside `decisionWork.condition`, and jobs it touched are still in
    the database, so both are read.
    """

    if not isinstance(session, dict):
        return ''

    plan = session.get('benchPlan')
    if isinstance(plan, dict):
        grade = str(plan.get('startingGrade') or '').strip()
        if grade:
            return grade[:64]

    decision = session.get('decisionWork')
    if not isinstance(decision, dict):
        return ''
    condition = decision.get('condition')
    if not isinstance(condition, dict):
        return ''
    return str(condition.get('currentGrade') or '').strip()[:64]


def sync_starting_grade(job: RestorationJob) -> bool:
    """Mirror the datum onto the row so it can be reported on. True if changed.

    Corrections are honoured: if Mike revises the grade the item arrived at, the
    value the job is credited with should follow.
    """

    grade = starting_grade_from_session(job.work_session)
    if not grade or grade == job.starting_grade:
        return False
    job.starting_grade = grade
    return True


def job_hours_on_bench(job: RestorationJob) -> Decimal:
    """Hours the item actually consumed, looking included."""

    seconds = int(job.look_seconds or 0) + int(job.work_seconds or 0)
    if not seconds:
        seconds = int(job.active_seconds or 0)
    return Decimal(seconds) / Decimal('3600')


def _day_bounds(start: date, end: date):
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(
        timezone.datetime.combine(start, timezone.datetime.min.time()), tz,
    )
    end_dt = timezone.make_aware(
        timezone.datetime.combine(end + timedelta(days=1), timezone.datetime.min.time()), tz,
    )
    return start_dt, end_dt


def _week_start_sunday(day: date) -> date:
    return day - timedelta(days=(day.weekday() + 1) % 7)


def _finished_jobs(start: date, end: date):
    start_dt, end_dt = _day_bounds(start, end)
    return RestorationJob.objects.filter(
        stage=RestorationJob.STAGE_DONE,
        dispositioned_at__gte=start_dt,
        dispositioned_at__lt=end_dt,
    )


def _window(start: date, end: date) -> dict[str, Any]:
    """Value, items and rate for one span of days."""

    rows = _finished_jobs(start, end).values(
        'value_added', 'look_seconds', 'work_seconds', 'active_seconds',
    )

    value = Decimal('0')
    seconds = 0
    items = 0
    measured = 0
    unmeasured = 0

    for row in rows:
        items += 1
        added = row['value_added']
        if added is None:
            unmeasured += 1
            continue
        measured += 1
        value += Decimal(added)
        attributed = int(row['look_seconds'] or 0) + int(row['work_seconds'] or 0)
        seconds += attributed or int(row['active_seconds'] or 0)

    hours = Decimal(seconds) / Decimal('3600')
    per_hour = (value / hours) if hours > 0 else None

    return {
        'start': start.isoformat(),
        'end': end.isoformat(),
        'value_added': _money(value),
        'items': items,
        'items_measured': measured,
        'items_unmeasured': unmeasured,
        'hours': str(hours.quantize(CENTS)),
        'per_hour': _money(per_hour),
    }


def _by_day(start: date, end: date) -> list[dict[str, Any]]:
    rows = (
        _finished_jobs(start, end)
        .values('dispositioned_at__date')
        .annotate(items=Count('id'), value=Sum('value_added'))
    )
    totals: dict[date, dict[str, Any]] = defaultdict(lambda: {'items': 0, 'value': None})
    for row in rows:
        totals[row['dispositioned_at__date']] = {
            'items': row['items'],
            'value': row['value'],
        }

    out: list[dict[str, Any]] = []
    day = start
    while day <= end:
        entry = totals.get(day, {'items': 0, 'value': None})
        out.append(
            {
                'date': day.isoformat(),
                'items': entry['items'],
                'value_added': _money(entry['value']) if entry['value'] is not None else '0.00',
            },
        )
        day += timedelta(days=1)
    return out


def build_restoration_scoreboard(today: date | None = None) -> dict[str, Any]:
    """The TARS home screen, at a glance from across the room."""

    today = today or timezone.localdate()
    week_start = _week_start_sunday(today)
    four_week_start = today - timedelta(days=BENCHMARK_WINDOW_DAYS - 1)

    day = _window(today, today)
    week = _window(week_start, today)
    four_week = _window(four_week_start, today)

    weeks = Decimal(BENCHMARK_WINDOW_DAYS) / Decimal('7')
    total_four_week = Decimal(four_week['value_added'] or '0')
    four_week['weekly_average_value'] = _money(total_four_week / weeks)
    four_week['weekly_average_items'] = str(
        (Decimal(four_week['items']) / weeks).quantize(CENTS),
    )

    # The bar to beat is the trailing rate, but only once it is built on enough
    # jobs to mean something. Until then the floor stands alone.
    benchmark = four_week['per_hour']
    benchmark_ready = four_week['items_measured'] >= BENCHMARK_MINIMUM_JOBS
    if not benchmark_ready:
        benchmark = None

    return {
        'as_of': today.isoformat(),
        'today': day,
        'week': week,
        'four_week': four_week,
        'per_hour_while_working': four_week['per_hour'],
        'floor_rate': _money(PAY_RATE_UNIT),
        'benchmark_rate': benchmark,
        'benchmark_ready': benchmark_ready,
        'benchmark_minimum_jobs': BENCHMARK_MINIMUM_JOBS,
        'days': _by_day(today - timedelta(days=13), today),
    }
