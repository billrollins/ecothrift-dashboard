"""Aggregate dashboard sales and department metrics."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.inventory.models import ItemHistory, PurchaseOrder, RestorationJob
from apps.pos.models import Cart, DashboardDepartmentGoal, DashboardSalesGoal

DASHBOARD_CACHE_SECONDS = 45
QUICK_REPRICE_NOTE = 'Quick reprice'


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


def _daily_sales_series(start: date, end: date) -> dict[date, Decimal]:
    rows = (
        Cart.objects.filter(
            status='completed',
            completed_at__date__gte=start,
            completed_at__date__lte=end,
        )
        .values('completed_at__date')
        .annotate(total=Sum('total'))
    )
    return {row['completed_at__date']: _dec(row['total']) for row in rows}


def _day_payload(day: date, revenue: Decimal) -> dict[str, str]:
    return {
        'date': day.isoformat(),
        'day': day.strftime('%A'),
        'revenue': _str_dec(revenue),
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
        for day in _monday_sunday_days(week_start):
            rev = revenue_by_day.get(day, Decimal('0'))
            week_total += rev
            days.append(_day_payload(day, rev))
        weekly_last_14_weeks.append({
            'week_start': week_start.isoformat(),
            'week_end': week_end.isoformat(),
            'week_total': _str_dec(week_total),
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
) -> tuple[Decimal, dict[date, Decimal]]:
    """Return week-range total (unique items) and per-day totals."""
    base_qs = (
        ItemHistory.objects.filter(
            event_type='status_change',
            new_value='on_shelf',
            created_at__date__gte=start,
            created_at__date__lte=end,
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

    unique_rows = list(
        base_qs.order_by('item_id', '-created_at')
        .distinct('item_id')
        .values('item_id', 'item__price', 'item__retail', 'item__check_in_id')
    )

    check_in_ids = {
        row['item__check_in_id']
        for row in (*daily_rows, *unique_rows)
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

    def _skip(row) -> bool:
        check_in_id = row['item__check_in_id']
        return bool(check_in_id and check_in_id in restoration_check_ins)

    range_total = sum(
        (_shelf_value(row) for row in unique_rows if not _skip(row)),
        Decimal('0'),
    )

    by_day: dict[date, Decimal] = defaultdict(lambda: Decimal('0'))
    for row in daily_rows:
        if _skip(row):
            continue
        by_day[row['day']] += _shelf_value(row)

    return range_total, dict(by_day)


def _processing_on_shelf_value(start: date, end: date) -> Decimal:
    total, _ = _processing_on_shelf_aggregate(start, end)
    return total


def _restoration_done_by_day(start: date, end: date) -> dict[date, int]:
    rows = (
        RestorationJob.objects.filter(
            stage=RestorationJob.STAGE_DONE,
            updated_at__date__gte=start,
            updated_at__date__lte=end,
        )
        .values('updated_at__date')
        .annotate(count=Count('id'))
    )
    return {row['updated_at__date']: row['count'] for row in rows}


def _count_tars_actions(jobs, action_type: str) -> int:
    count = 0
    for job in jobs:
        session = job.work_session or {}
        for action in session.get('actions') or []:
            if action.get('type') != action_type:
                continue
            if action_type == 'test':
                tests = action.get('tests') or []
                count += len(tests) if tests else 1
            elif action_type == 'assemble':
                steps = action.get('steps') or []
                done_steps = [s for s in steps if s.get('status') == 'done']
                count += len(done_steps) if done_steps else (
                    1 if action.get('status') == 'complete' else 0
                )
            else:
                if action.get('status') == 'complete':
                    count += 1
    return count


def _restoration_metrics(today: date) -> dict[str, Any]:
    week_start = _week_start_sunday(today)

    done_filter = {
        'stage': RestorationJob.STAGE_DONE,
        'updated_at__date__gte': week_start,
        'updated_at__date__lte': today,
    }
    week_jobs_done = RestorationJob.objects.filter(**done_filter).count()
    today_jobs_done = RestorationJob.objects.filter(
        stage=RestorationJob.STAGE_DONE,
        updated_at__date=today,
    ).count()

    week_jobs = list(
        RestorationJob.objects.filter(
            updated_at__date__gte=week_start,
            updated_at__date__lte=today,
        ).only('work_session', 'updated_at'),
    )
    today_jobs = [job for job in week_jobs if job.updated_at.date() == today]

    return {
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
        'ready': False,
        'note': 'TARS detail counts are derived from work session actions; full reporting pending.',
    }


def _department_daily_weeks(
    today: date,
    *,
    buying_by_day: dict[date, Decimal],
    processing_by_day: dict[date, Decimal],
    restoration_by_day: dict[date, int],
) -> list[dict[str, Any]]:
    this_week_start = _week_start_monday(today)
    week_specs = [
        ('Last Week', this_week_start - timedelta(days=7), False),
        ('This Week', this_week_start, True),
    ]
    weeks = []
    for label, week_start, is_current in week_specs:
        days = []
        for offset in range(7):
            day = week_start + timedelta(days=offset)
            is_future = is_current and day > today
            days.append({
                'date': day.isoformat(),
                'day': day.strftime('%A'),
                'buying': '0' if is_future else _str_dec(buying_by_day.get(day, Decimal('0'))),
                'processing': '0' if is_future else _str_dec(processing_by_day.get(day, Decimal('0'))),
                'restoration': 0 if is_future else restoration_by_day.get(day, 0),
                'retail': None,
                'is_future': is_future,
            })
        weeks.append({
            'label': label,
            'week_start': week_start.isoformat(),
            'week_end': (week_start + timedelta(days=6)).isoformat(),
            'days': days,
        })
    return weeks


def _department_goals() -> dict[str, dict[str, Any]]:
    goals: dict[str, dict[str, Any]] = {}
    for goal in DashboardDepartmentGoal.objects.all().only('id', 'department', 'value', 'description'):
        goals[goal.department] = {
            'id': goal.id,
            'department': goal.department,
            'value': goal.value,
            'description': goal.description,
        }
    return goals


def build_department_metrics(today: date | None = None) -> dict[str, Any]:
    today = today or timezone.now().date()
    week_start = _week_start_sunday(today)
    this_week_start = _week_start_monday(today)
    last_week_start = this_week_start - timedelta(days=7)

    buying_by_day = _buying_by_day(last_week_start, today)
    processing_week_total, processing_by_day = _processing_on_shelf_aggregate(week_start, today)
    restoration_by_day = _restoration_done_by_day(last_week_start, today)

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
        'retail': {
            'ready': False,
            'average_grade': None,
            'last_grade': None,
            'note': 'Retail QA scoring not yet implemented.',
        },
        'goals': _department_goals(),
        'daily_weeks': _department_daily_weeks(
            today,
            buying_by_day=buying_by_day,
            processing_by_day=processing_by_day,
            restoration_by_day=restoration_by_day,
        ),
    }


def build_dashboard_metrics(today: date | None = None) -> dict[str, Any]:
    today = today or timezone.now().date()
    return {
        'sales': build_sales_metrics(today),
        'department_metrics': build_department_metrics(today),
    }


def get_dashboard_metrics(today: date | None = None) -> dict[str, Any]:
    """Cached dashboard payload for the API."""
    today = today or timezone.now().date()
    cache_key = f'dashboard:metrics:{today.isoformat()}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    payload = build_dashboard_metrics(today)
    cache.set(cache_key, payload, DASHBOARD_CACHE_SECONDS)
    return payload
