"""Aggregate dashboard sales and department metrics."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.inventory.models import Item, ItemHistory, PurchaseOrder, RestorationJob
from apps.pos.models import (
    Cart,
    CartLine,
    DashboardDepartmentGoal,
    DashboardSalesGoal,
    QualityAudit,
    QualityAuditForm,
)
DASHBOARD_CACHE_SECONDS = 45
QUICK_REPRICE_NOTE = 'Quick reprice'
DEFAULT_DEPARTMENT_WEEKS = 8
MIN_DEPARTMENT_WEEKS = 2
MAX_DEPARTMENT_WEEKS = 12


def clamp_department_weeks(raw: Any) -> int:
    """Clamp a weeks window for department daily grids (default 8)."""
    try:
        weeks = int(raw)
    except (TypeError, ValueError):
        return DEFAULT_DEPARTMENT_WEEKS
    return max(MIN_DEPARTMENT_WEEKS, min(MAX_DEPARTMENT_WEEKS, weeks))


def _dec(value: Decimal | None) -> Decimal:
    return value if value is not None else Decimal('0')


def _str_dec(value: Decimal) -> str:
    return str(_dec(value))


def _week_start_sunday(day: date) -> date:
    weekday = day.weekday()  # Mon=0, Sun=6
    days_since_sunday = (weekday + 1) % 7
    return day - timedelta(days=days_since_sunday)


def _week_start_monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _day_range(start: date, end: date) -> tuple[datetime, datetime]:
    """Aware [start 00:00, end+1day 00:00) bounds for the active timezone.

    Equivalent to ``field__date__gte=start, field__date__lte=end`` but sargable —
    plain range filters use the datetime indexes instead of a per-row date cast.
    """
    tz = timezone.get_current_timezone()
    start_dt = timezone.make_aware(datetime.combine(start, time.min), tz)
    end_dt = timezone.make_aware(datetime.combine(end + timedelta(days=1), time.min), tz)
    return start_dt, end_dt


def _daily_sales_series(start: date, end: date) -> dict[date, Decimal]:
    start_dt, end_dt = _day_range(start, end)
    rows = (
        Cart.objects.filter(
            status='completed',
            completed_at__gte=start_dt,
            completed_at__lt=end_dt,
        )
        .values('completed_at__date')
        .annotate(total=Sum('total'))
    )
    return {row['completed_at__date']: _dec(row['total']) for row in rows}


def _daily_items_sold_series(start: date, end: date) -> dict[date, int]:
    start_dt, end_dt = _day_range(start, end)
    rows = (
        CartLine.objects.filter(
            cart__status='completed',
            cart__completed_at__gte=start_dt,
            cart__completed_at__lt=end_dt,
        )
        .values('cart__completed_at__date')
        .annotate(total=Sum('quantity'))
    )
    return {row['cart__completed_at__date']: int(row['total'] or 0) for row in rows}


def _day_payload(day: date, revenue: Decimal, items_sold: int) -> dict[str, str | int]:
    return {
        'date': day.isoformat(),
        'day': day.strftime('%A'),
        'revenue': _str_dec(revenue),
        'items_sold': items_sold,
    }


def _monday_sunday_days(week_start_sunday: date) -> list[date]:
    """Return Mon–Sun dates for a Sun–Sat week bucket."""
    monday = week_start_sunday + timedelta(days=1)
    return [monday + timedelta(days=i) for i in range(7)]


def build_sales_metrics(today: date | None = None) -> dict[str, Any]:
    today = today or timezone.now().date()
    yesterday = today - timedelta(days=1)
    same_weekday_last_week = today - timedelta(days=7)

    ninety_start = today - timedelta(days=89)
    current_week_start = _week_start_sunday(today)
    earliest_week_start = current_week_start - timedelta(weeks=13)
    revenue_start = min(earliest_week_start, ninety_start - timedelta(days=27))
    revenue_by_day = _daily_sales_series(revenue_start, today)
    items_by_day = _daily_items_sold_series(revenue_start, today)

    daily_last_90_days = []
    for offset in range(89, -1, -1):
        day = today - timedelta(days=offset)
        week_start = _week_start_sunday(day)
        week_sum = sum(
            (revenue_by_day.get(day - timedelta(days=back), Decimal('0')) for back in range(7)),
            Decimal('0'),
        )
        four_week_sum = sum(
            (revenue_by_day.get(day - timedelta(days=back), Decimal('0')) for back in range(28)),
            Decimal('0'),
        )
        daily_last_90_days.append({
            'date': day.isoformat(),
            'day': day.strftime('%A'),
            'rolling_week_total': _str_dec(week_sum),
            'four_week_weekly_avg': _str_dec(four_week_sum / Decimal('4')),
            'week_start': week_start.isoformat(),
            'is_week_start': day == week_start,
        })

    weekly_last_14_weeks = []
    for week_index in range(14):
        week_start = current_week_start - timedelta(weeks=week_index)
        week_end = week_start + timedelta(days=6)
        days = []
        week_total = Decimal('0')
        week_items_sold = 0
        for day in _monday_sunday_days(week_start):
            rev = revenue_by_day.get(day, Decimal('0'))
            items = items_by_day.get(day, 0)
            week_total += rev
            week_items_sold += items
            days.append(_day_payload(day, rev, items))
        weekly_last_14_weeks.append({
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'week_total': _str_dec(week_total),
            'week_items_sold': week_items_sold,
            'days': days,
            'label': 'This Week' if week_index == 0 else (
                f'{week_index} Week{"s" if week_index > 1 else ""} Ago'
            ),
        })

    goal = DashboardSalesGoal.objects.order_by('-updated_at').only('id', 'amount', 'description').first()

    return {
        'today': _str_dec(revenue_by_day.get(today, Decimal('0'))),
        'yesterday': _str_dec(revenue_by_day.get(yesterday, Decimal('0'))),
        'same_weekday_last_week': _str_dec(revenue_by_day.get(same_weekday_last_week, Decimal('0'))),
        'goal': {
            'id': goal.id,
            'amount': _str_dec(goal.amount),
            'description': goal.description,
        } if goal else None,
        'daily_last_90_days': daily_last_90_days,
        'weekly_last_14_weeks': weekly_last_14_weeks,
    }


def _buying_by_day(start: date, end: date) -> dict[date, Decimal]:
    rows = (
        PurchaseOrder.objects.filter(
            ordered_date__gte=start,
            ordered_date__lte=end,
        )
        .exclude(status='cancelled')
        .values('ordered_date')
        .annotate(total=Sum('total_cost'))
    )
    return {row['ordered_date']: _dec(row['total']) for row in rows}


def _buying_total(start: date, end: date, *, buying_by_day: dict[date, Decimal] | None = None) -> Decimal:
    if buying_by_day is not None:
        return sum(
            (buying_by_day.get(start + timedelta(days=offset), Decimal('0')) for offset in range((end - start).days + 1)),
            Decimal('0'),
        )
    return _dec(
        PurchaseOrder.objects.filter(
            ordered_date__gte=start,
            ordered_date__lte=end,
        )
        .exclude(status='cancelled')
        .aggregate(total=Sum('total_cost'))['total'],
    )


def _processing_on_shelf_aggregate(
    start: date,
    end: date,
    *,
    total_start: date | None = None,
) -> tuple[Decimal, dict[date, Decimal]]:
    """Return range total (unique items) and per-day totals.

    ``total_start`` narrows the unique-item total to ``[total_start, end]`` while
    ``by_day`` still spans ``[start, end]`` — one query serves both windows.
    """
    if total_start is None:
        total_start = start
    start_dt, end_dt = _day_range(start, end)
    base_qs = (
        ItemHistory.objects.filter(
            event_type='status_change',
            new_value='on_shelf',
            created_at__gte=start_dt,
            created_at__lt=end_dt,
        )
        .exclude(old_value='on_shelf')
        .exclude(old_value='sold')
        .exclude(note__icontains=QUICK_REPRICE_NOTE)
    )

    daily_rows = list(
        base_qs.annotate(day=TruncDate('created_at'))
        .order_by('day', 'item_id', '-created_at')
        .distinct('day', 'item_id')
        .values('item_id', 'day', 'item__price', 'item__retail', 'item__check_in_id')
    )

    check_in_ids = {
        row['item__check_in_id']
        for row in daily_rows
        if row['item__check_in_id']
    }
    restoration_check_ins: set[int] = set()
    if check_in_ids:
        restoration_check_ins = set(
            RestorationJob.objects.filter(item_check_in_id__in=check_in_ids).values_list(
                'item_check_in_id',
                flat=True,
            ),
        )

    def _shelf_value(row) -> Decimal:
        return _dec(row['item__price'] or row['item__retail'])

    def _skip_send_to_restoration(row) -> bool:
        """Dispatch to Restoration is not processed. Credit lands on Overview check-in."""
        check_in_id = row['item__check_in_id']
        return bool(check_in_id and check_in_id in restoration_check_ins)

    # Unique-item total for [total_start, end]: shelf value comes from the item
    # join, so it is identical on every history row for a given item — counting
    # each item once from the per-(day, item) rows matches a distinct-item scan.
    range_total = Decimal('0')
    counted_items: set[int] = set()
    by_day: dict[date, Decimal] = defaultdict(lambda: Decimal('0'))
    for row in daily_rows:
        if _skip_send_to_restoration(row):
            continue
        by_day[row['day']] += _shelf_value(row)
        if row['day'] >= total_start and row['item_id'] not in counted_items:
            counted_items.add(row['item_id'])
            range_total += _shelf_value(row)

    for row in _processing_restoration_checkin_rows(start, end):
        value = _dec(row['price'] or row['retail'])
        by_day[row['day']] += value
        if row['day'] >= total_start and row['id'] not in counted_items:
            counted_items.add(row['id'])
            range_total += value

    return range_total, dict(by_day)


def _processing_restoration_checkin_rows(start: date, end: date) -> list[dict[str, Any]]:
    """Items Processing took in from Restoration Overview (`processing_handled_at`)."""
    start_dt, end_dt = _day_range(start, end)
    return list(
        Item.objects.filter(
            parent_item__isnull=True,
            check_in__restoration_job__processing_handled_at__gte=start_dt,
            check_in__restoration_job__processing_handled_at__lt=end_dt,
        )
        .annotate(day=TruncDate('check_in__restoration_job__processing_handled_at'))
        .values('id', 'day', 'price', 'retail')
    )


def _processing_on_shelf_value(start: date, end: date) -> Decimal:
    total, _ = _processing_on_shelf_aggregate(start, end)
    return total


def _restoration_done_by_day(start: date, end: date) -> dict[date, int]:
    start_dt, end_dt = _day_range(start, end)
    rows = (
        RestorationJob.objects.filter(
            stage=RestorationJob.STAGE_DONE,
            dispositioned_at__gte=start_dt,
            dispositioned_at__lt=end_dt,
        )
        .values('dispositioned_at__date')
        .annotate(count=Count('id'))
    )
    return {row['dispositioned_at__date']: row['count'] for row in rows}


def _count_tars_actions(jobs, action_type: str) -> int:
    """Count bench actions across work sessions — fully defensive against
    malformed work_session payloads (never raises)."""

    count = 0
    for job in jobs:
        session = job.work_session if isinstance(job.work_session, dict) else {}
        actions = session.get('actions')
        if not isinstance(actions, list):
            continue
        for action in actions:
            if not isinstance(action, dict):
                continue
            if action.get('type') != action_type:
                continue
            if action_type == 'test':
                tests = action.get('tests')
                if not isinstance(tests, list):
                    tests = []
                count += len(tests) if tests else 1
            elif action_type == 'assemble':
                steps = action.get('steps')
                if not isinstance(steps, list):
                    steps = []
                done_steps = [s for s in steps if isinstance(s, dict) and s.get('status') == 'done']
                count += len(done_steps) if done_steps else (
                    1 if action.get('status') == 'complete' else 0
                )
            else:
                if action.get('status') == 'complete':
                    count += 1
    return count


def _restoration_metrics(today: date) -> dict[str, Any]:
    week_start = _week_start_sunday(today)

    week_start_dt, week_end_dt = _day_range(week_start, today)
    today_start_dt, today_end_dt = _day_range(today, today)

    week_jobs_done = RestorationJob.objects.filter(
        stage=RestorationJob.STAGE_DONE,
        dispositioned_at__gte=week_start_dt,
        dispositioned_at__lt=week_end_dt,
    ).count()
    today_jobs_done = RestorationJob.objects.filter(
        stage=RestorationJob.STAGE_DONE,
        dispositioned_at__gte=today_start_dt,
        dispositioned_at__lt=today_end_dt,
    ).count()

    week_jobs = list(
        RestorationJob.objects.filter(
            updated_at__gte=week_start_dt,
            updated_at__lt=week_end_dt,
        ).only('work_session', 'updated_at'),
    )
    today_jobs = [job for job in week_jobs if job.updated_at.date() == today]

    active_stages = (
        RestorationJob.STAGE_QUEUED,
        RestorationJob.STAGE_SENT,
        RestorationJob.STAGE_BENCH,
        RestorationJob.STAGE_PENDING,
    )
    active_jobs = RestorationJob.objects.filter(stage__in=active_stages).count()
    awaiting_parts = RestorationJob.objects.filter(stage=RestorationJob.STAGE_PENDING).count()
    returns_pending = RestorationJob.objects.filter(
        processing_handled_at__isnull=True,
    ).filter(
        Q(stage=RestorationJob.STAGE_DONE, bench_disposition=RestorationJob.BENCH_DISPOSITION_PROCESSING)
        | Q(
            stage=RestorationJob.STAGE_RETURNED,
            return_disposition_type=RestorationJob.RETURN_DISPOSITION_TARS_COMPLETED,
        ),
    ).count()

    return {
        'active_jobs': active_jobs,
        'awaiting_parts': awaiting_parts,
        'returns_pending': returns_pending,
        'week_jobs_done': week_jobs_done,
        'today_jobs_done': today_jobs_done,
        'week_tested': _count_tars_actions(week_jobs, 'test'),
        'week_repairs': _count_tars_actions(week_jobs, 'repair'),
        'week_assembled': _count_tars_actions(week_jobs, 'assemble'),
        'week_salvaged': _count_tars_actions(week_jobs, 'salvage'),
        'today_tested': _count_tars_actions(today_jobs, 'test'),
        'today_repairs': _count_tars_actions(today_jobs, 'repair'),
        'today_assembled': _count_tars_actions(today_jobs, 'assemble'),
        'today_salvaged': _count_tars_actions(today_jobs, 'salvage'),
        'ready': True,
    }


_GRADE_POINTS = {
    'A+': 4.3,
    'A': 4.0,
    'A-': 3.7,
    'B+': 3.3,
    'B': 3.0,
    'B-': 2.7,
    'C+': 2.3,
    'C': 2.0,
    'C-': 1.7,
    'D+': 1.3,
    'D': 1.0,
    'D-': 0.7,
    'F': 0.0,
}


def _grade_meets_goal(actual: str | None, target: str | None) -> bool:
    """True when the submitted letter grade is at least the configured target."""
    actual_key = (actual or '').strip().upper()
    target_key = (target or '').strip().upper()
    if not target_key:
        return bool(actual_key)
    actual_points = _GRADE_POINTS.get(actual_key)
    target_points = _GRADE_POINTS.get(target_key)
    if actual_points is None or target_points is None:
        return actual_key == target_key
    return actual_points >= target_points


def _normalize_retail_schedule(raw: Any) -> dict[str, Any]:
    """Defensive normalization for legacy/malformed goal rows."""
    schedule = raw if isinstance(raw, dict) else {}
    weekdays = []
    for value in schedule.get('weekdays', []):
        try:
            day = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= day <= 6 and day not in weekdays:
            weekdays.append(day)
    try:
        audits_per_day = int(schedule.get('audits_per_day', 1))
    except (TypeError, ValueError):
        audits_per_day = 1
    return {
        'weekdays': sorted(weekdays),
        'audits_per_day': max(1, min(20, audits_per_day)),
    }


def _retail_audits_by_day(start: date, end: date) -> dict[date, dict[str, Any]]:
    """Count audits and retain the last submitted grade + ids per local calendar day."""
    start_dt, end_dt = _day_range(start, end)
    audits = (
        QualityAudit.objects.filter(
            form__feeds_dashboard=True,
            status=QualityAudit.STATUS_SUBMITTED,
            submitted_at__gte=start_dt,
            submitted_at__lt=end_dt,
        )
        .exclude(overall_grade='')
        .order_by('submitted_at')
        .only('id', 'overall_grade', 'submitted_at')
    )
    by_day: dict[date, dict[str, Any]] = {}
    for audit in audits:
        if not audit.submitted_at or not audit.overall_grade:
            continue
        day = timezone.localtime(audit.submitted_at).date()
        stats = by_day.setdefault(day, {'count': 0, 'last_grade': None, 'audit_ids': []})
        stats['count'] += 1
        # Query is ascending, so assignment preserves the last submitted grade.
        stats['last_grade'] = audit.overall_grade
        stats['audit_ids'].append(audit.id)
    return by_day


def _week_label(week_start: date, this_week_start: date) -> str:
    if week_start == this_week_start:
        return 'This Week'
    if week_start == this_week_start - timedelta(days=7):
        return 'Last Week'
    return week_start.isoformat()


def _department_daily_weeks(
    today: date,
    *,
    buying_by_day: dict[date, Decimal],
    processing_by_day: dict[date, Decimal],
    restoration_by_day: dict[date, int],
    retail_by_day: dict[date, dict[str, Any]] | None = None,
    retail_schedule: dict[str, Any] | None = None,
    retail_grade_goal: str = '',
    weeks_back: int = DEFAULT_DEPARTMENT_WEEKS,
) -> list[dict[str, Any]]:
    retail_by_day = retail_by_day or {}
    schedule = _normalize_retail_schedule(retail_schedule)
    scheduled_weekdays = set(schedule['weekdays'])
    audits_per_day = schedule['audits_per_day']
    this_week_start = _week_start_monday(today)
    weeks_back = clamp_department_weeks(weeks_back)
    # Oldest → newest so index 0 is the furthest week back.
    week_specs = [
        (this_week_start - timedelta(days=7 * i), i == 0)
        for i in reversed(range(weeks_back))
    ]
    weeks = []
    for week_start, is_current in week_specs:
        label = _week_label(week_start, this_week_start)
        week_end = week_start + timedelta(days=6)
        days = []
        for offset in range(7):
            day = week_start + timedelta(days=offset)
            is_future = is_current and day > today
            retail_stats = retail_by_day.get(day, {})
            retail_grade = retail_stats.get('last_grade')
            retail_count = int(retail_stats.get('count') or 0)
            retail_audit_ids = list(retail_stats.get('audit_ids') or [])
            retail_scheduled = offset in scheduled_weekdays
            retail_required = audits_per_day if retail_scheduled else 0
            retail_grade_met = _grade_meets_goal(retail_grade, retail_grade_goal)
            retail_goal_met = (
                retail_scheduled
                and retail_count >= retail_required
                and retail_grade_met
            )
            days.append({
                'date': day.isoformat(),
                'day': day.strftime('%A'),
                'buying': '0' if is_future else _str_dec(buying_by_day.get(day, Decimal('0'))),
                'processing': '0' if is_future else _str_dec(processing_by_day.get(day, Decimal('0'))),
                'restoration': 0 if is_future else restoration_by_day.get(day, 0),
                'retail': None if is_future else retail_grade,
                'retail_count': 0 if is_future else retail_count,
                'retail_required': retail_required,
                'retail_scheduled': retail_scheduled,
                'retail_grade_met': False if is_future else retail_grade_met,
                'retail_goal_met': False if is_future else retail_goal_met,
                'retail_audit_ids': [] if is_future else retail_audit_ids,
                'is_future': is_future,
            })
        last_grade = next(
            (
                day['retail']
                for day in reversed(days)
                if not day['is_future'] and day['retail']
            ),
            None,
        )
        scheduled_days = [day for day in days if day['retail_scheduled']]
        due_days = [day for day in scheduled_days if not day['is_future']]
        completed_days = [day for day in scheduled_days if day['retail_goal_met']]
        scheduled_count = len(scheduled_days)
        required_audits = scheduled_count * audits_per_day
        # Week counter includes every submitted audit in the week (on- or off-schedule).
        # Days-hit / goal achievement remain scheduled-days only.
        submitted_audits = sum(day['retail_count'] for day in days)
        due_goal_met = bool(due_days) and all(day['retail_goal_met'] for day in due_days)
        week_goal_met = (
            bool(scheduled_days)
            and not any(day['is_future'] for day in scheduled_days)
            and len(completed_days) == len(scheduled_days)
        )
        weeks.append({
            'label': label,
            'is_current': is_current,
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            # Spec: week score = last submitted grade, never average/highest.
            'retail_week_grade': last_grade,
            'retail_week_audits': submitted_audits,
            'retail_week_required': required_audits,
            'retail_completed_days': len(completed_days),
            'retail_scheduled_days': scheduled_count,
            'retail_due_days': len(due_days),
            'retail_due_goal_met': due_goal_met,
            'retail_week_goal_met': week_goal_met,
            'days': days,
        })
    return weeks


def _department_goals() -> dict[str, dict[str, Any]]:
    goals: dict[str, dict[str, Any]] = {}
    for goal in DashboardDepartmentGoal.objects.all().only(
        'id',
        'department',
        'value',
        'description',
        'schedule',
    ):
        goals[goal.department] = {
            'id': goal.id,
            'department': goal.department,
            'value': goal.value,
            'description': goal.description,
            'schedule': goal.schedule or {},
        }
    return goals


def build_department_metrics(
    today: date | None = None,
    *,
    weeks_back: int = DEFAULT_DEPARTMENT_WEEKS,
) -> dict[str, Any]:
    today = today or timezone.now().date()
    weeks_back = clamp_department_weeks(weeks_back)
    week_start = _week_start_sunday(today)
    this_week_start = _week_start_monday(today)
    history_start = this_week_start - timedelta(days=7 * (weeks_back - 1))

    buying_by_day = _buying_by_day(history_start, today)
    # One pass over the wide window: by-day spans (history_start, today) for the
    # daily grid while the unique-item week total is narrowed to (week_start, today).
    processing_week_total, processing_by_day = _processing_on_shelf_aggregate(
        min(history_start, week_start),
        today,
        total_start=week_start,
    )
    restoration_by_day = _restoration_done_by_day(history_start, today)
    goals = _department_goals()
    retail_goal = goals.get(DashboardDepartmentGoal.RETAIL, {})
    retail_schedule = _normalize_retail_schedule(retail_goal.get('schedule'))
    retail_by_day = _retail_audits_by_day(history_start, today)
    daily_weeks = _department_daily_weeks(
        today,
        buying_by_day=buying_by_day,
        processing_by_day=processing_by_day,
        restoration_by_day=restoration_by_day,
        retail_by_day=retail_by_day,
        retail_schedule=retail_schedule,
        retail_grade_goal=retail_goal.get('value', ''),
        weeks_back=weeks_back,
    )
    current_retail_week = next(
        (week for week in daily_weeks if week.get('is_current')),
        None,
    )

    dashboard_form = (
        QualityAuditForm.objects.filter(feeds_dashboard=True)
        .only('slug')
        .first()
    )
    form_slug = dashboard_form.slug if dashboard_form else None

    latest_retail = (
        QualityAudit.objects.filter(
            form__feeds_dashboard=True,
            status=QualityAudit.STATUS_SUBMITTED,
        )
        .order_by('-submitted_at')
        .only('overall_grade', 'submitted_at')
        .first()
    )
    if latest_retail and latest_retail.overall_grade:
        # Card Actual = last submitted overall (not a weekly average).
        # ``average_grade`` is a legacy alias of ``last_grade`` — do not interpret as mean.
        retail_metrics = {
            'ready': True,
            'average_grade': latest_retail.overall_grade,
            'last_grade': latest_retail.overall_grade,
            'note': None,
        }
    else:
        retail_metrics = {
            'ready': False,
            'average_grade': None,
            'last_grade': None,
            'note': 'No retail QA submitted yet.',
        }
    retail_metrics.update({
        'form_slug': form_slug,
        'schedule': retail_schedule,
        'grade_goal': retail_goal.get('value') or None,
        'week_audits': (current_retail_week or {}).get('retail_week_audits', 0),
        'week_required': (current_retail_week or {}).get('retail_week_required', 0),
        'completed_days': (current_retail_week or {}).get('retail_completed_days', 0),
        'scheduled_days': (current_retail_week or {}).get('retail_scheduled_days', 0),
        'due_days': (current_retail_week or {}).get('retail_due_days', 0),
        'due_goal_met': (current_retail_week or {}).get('retail_due_goal_met', False),
        'week_goal_met': (current_retail_week or {}).get('retail_week_goal_met', False),
    })

    return {
        'buying': {
            'week': _str_dec(_buying_total(week_start, today, buying_by_day=buying_by_day)),
            'today': _str_dec(buying_by_day.get(today, Decimal('0'))),
        },
        'processing': {
            'week': _str_dec(processing_week_total),
            'today': _str_dec(processing_by_day.get(today, Decimal('0'))),
        },
        'restoration': _restoration_metrics(today),
        'retail': retail_metrics,
        'goals': goals,
        'daily_weeks': daily_weeks,
    }


def build_dashboard_metrics(
    today: date | None = None,
    *,
    weeks_back: int = DEFAULT_DEPARTMENT_WEEKS,
) -> dict[str, Any]:
    today = today or timezone.now().date()
    return {
        'sales': build_sales_metrics(today),
        'department_metrics': build_department_metrics(today, weeks_back=weeks_back),
    }


def _metrics_cache_key(today: date, weeks_back: int) -> str:
    return f'dashboard:metrics:{today.isoformat()}:{clamp_department_weeks(weeks_back)}'


def invalidate_dashboard_metrics_cache(today: date | None = None) -> None:
    """Clear cached dashboard metrics for all week windows (e.g. after QA submit)."""
    today = today or timezone.now().date()
    # Legacy key (pre-weeks param) plus every clamped window.
    cache.delete(f'dashboard:metrics:{today.isoformat()}')
    for weeks in range(MIN_DEPARTMENT_WEEKS, MAX_DEPARTMENT_WEEKS + 1):
        cache.delete(_metrics_cache_key(today, weeks))


def get_dashboard_metrics(
    today: date | None = None,
    *,
    weeks_back: int = DEFAULT_DEPARTMENT_WEEKS,
) -> dict[str, Any]:
    """Cached dashboard payload for the API."""
    today = today or timezone.now().date()
    weeks_back = clamp_department_weeks(weeks_back)
    cache_key = _metrics_cache_key(today, weeks_back)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    payload = build_dashboard_metrics(today, weeks_back=weeks_back)
    cache.set(cache_key, payload, DASHBOARD_CACHE_SECONDS)
    return payload
