"""
The Context layer's daily snapshot: what the owner (and the AI supervisor) needs to decide fast
(data_platform Phase 2).

``build_snapshot(day)`` curates yesterday's numbers, against the same weekday before and the
week so far, plus what is waiting on the owner, into one JSON document:
- sales;
- labor (hours, open punches, the weekly 40);
- routines;
- inventory flow (processed, on the floor, aging, POs waiting);
- buying (Today's plan, nags, wins, report cards);
- approvals waiting in Requests;
- Thrift+;
- data QA: checks that got worse overnight (data_platform Phase 3).

The AI brief is written from this snapshot and only this, so every number it says can be
traced here.

Each section is built on its own. A section that fails records its error instead of sinking the
whole snapshot. Numbers reuse the dashboard's own services where they exist, so the brief and
the dashboard agree.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Callable

from django.db.models import Count, Q, Sum
from django.utils import timezone

logger = logging.getLogger(__name__)

AGING_DAYS = 90


def _money(value: Any) -> str:
    return str(Decimal(value or 0).quantize(Decimal('0.01')))


def _day_bounds(day: date) -> tuple[datetime, datetime]:
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(day, time.min), tz)
    return start, start + timedelta(days=1)


def _sales(day: date) -> dict:
    from apps.pos.services.dashboard_metrics import _daily_items_sold_series, _daily_sales_series

    start = day - timedelta(days=35)
    revenue = _daily_sales_series(start, day)
    items = _daily_items_sold_series(start, day)
    same_weekdays = [revenue.get(day - timedelta(days=7 * k), Decimal('0')) for k in range(1, 5)]
    week_start = day - timedelta(days=day.weekday())  # Monday
    wtd = sum((revenue.get(week_start + timedelta(days=i), Decimal('0')) for i in range((day - week_start).days + 1)), Decimal('0'))
    last_wtd = sum((revenue.get(week_start - timedelta(days=7) + timedelta(days=i), Decimal('0')) for i in range((day - week_start).days + 1)), Decimal('0'))
    return {
        'day': day.isoformat(),
        'revenue': _money(revenue.get(day)),
        'items_sold': items.get(day, 0),
        'same_weekday_last_week': _money(same_weekdays[0]),
        'same_weekday_4wk_avg': _money(sum(same_weekdays, Decimal('0')) / 4),
        'week_to_date': _money(wtd),
        'last_week_same_point': _money(last_wtd),
    }


def _labor(day: date, now: datetime) -> dict:
    from apps.accounts.models import User
    from apps.hr.models import TimeEntry, TimeEntryModificationRequest
    from apps.hr.services.time_clock_utils import weekly_status_for_employee

    worked = TimeEntry.objects.filter(date=day).aggregate(hours=Sum('total_hours'), people=Count('employee', distinct=True))
    open_punches = []
    for entry in TimeEntry.objects.filter(clock_out__isnull=True).select_related('employee'):
        hours = (now - entry.clock_in).total_seconds() / 3600
        open_punches.append({'who': entry.employee.full_name, 'since': entry.clock_in.isoformat(), 'hours_open': round(hours, 1)})
    near_limit = []
    week_start = now.date() - timedelta(days=now.weekday())
    ids = TimeEntry.objects.filter(date__gte=week_start).values_list('employee', flat=True).distinct()
    for employee in User.objects.filter(pk__in=list(ids)):
        status = weekly_status_for_employee(employee, now)
        if status['hours_worked'] >= 36:
            near_limit.append({'who': employee.full_name, 'hours': str(status['hours_worked']), 'limit': str(status['hours_limit'])})
    return {
        'hours_worked': _money(worked['hours']),
        'people_worked': worked['people'] or 0,
        'open_punches': open_punches,
        'stale_open_punches': [p for p in open_punches if p['hours_open'] >= 14],
        'near_weekly_limit': near_limit,
        'time_change_requests_waiting': TimeEntryModificationRequest.objects.filter(status='pending').count(),
    }


def _routines(day: date) -> dict:
    from apps.routines.models import RoutineRun

    start, end = _day_bounds(day)
    runs = RoutineRun.objects.filter(due_at__gte=start, due_at__lt=end)
    done_late = runs.filter(status=RoutineRun.STATUS_DONE, completed_at__gt=end).count()
    missed = list(
        runs.filter(Q(status=RoutineRun.STATUS_MISSED) | Q(status=RoutineRun.STATUS_OPEN))
        .select_related('routine', 'assigned_to')[:15]
    )
    return {
        'due': runs.count(),
        'done': runs.filter(status=RoutineRun.STATUS_DONE).count(),
        'done_after_the_day': done_late,
        'missed_or_open': [
            {'routine': r.routine.title,
             'who': r.assigned_to.full_name if r.assigned_to_id else '', 'status': r.status}
            for r in missed
        ],
        'link': '/admin/routines',
    }


def _inventory(day: date, now: datetime) -> dict:
    from apps.inventory.models import Item, PurchaseOrder

    start, end = _day_bounds(day)
    on_shelf = Item.objects.filter(status='on_shelf')
    aged_cut = now - timedelta(days=AGING_DAYS)
    shelf = on_shelf.aggregate(n=Count('pk'), value=Sum('price'))
    aged = on_shelf.filter(Q(listed_at__lt=aged_cut) | Q(listed_at__isnull=True, checked_in_at__lt=aged_cut)).aggregate(n=Count('pk'), value=Sum('price'))
    return {
        'checked_in': Item.objects.filter(checked_in_at__gte=start, checked_in_at__lt=end).count(),
        'on_shelf': shelf['n'] or 0,
        'on_shelf_value': _money(shelf['value']),
        f'on_shelf_over_{AGING_DAYS}_days': aged['n'] or 0,
        f'on_shelf_over_{AGING_DAYS}_days_value': _money(aged['value']),
        'pos_delivered_not_processed': PurchaseOrder.objects.filter(status='delivered').count(),
        'pos_in_processing': PurchaseOrder.objects.filter(status='processing').count(),
        'link': '/inventory/orders',
    }


def _buying(day: date) -> dict:
    from apps.buying.models import Outcome
    from apps.buying.services.buying_nags import buying_nags
    from apps.buying.services.wishlist import build_wishlist
    from apps.buying.services.won_to_po import calibration

    wish = build_wishlist()
    soon = [r for r in wish['results'] if r['end_time'] and r['end_time'] - timezone.now() < timedelta(days=1)][:2]
    nags = buying_nags()
    start, end = _day_bounds(day)
    return {
        'live_auctions': wish['live_total'],
        'passing_max': wish['eligible'],
        'todays_plan': [
            {'id': r['id'], 'seller': r['marketplace'], 'category': r['top_category'],
             'ends_central': timezone.localtime(r['end_time']).strftime('%a %b %d, %I:%M %p'),
             'max': str(r['max_bid']) if r['max_bid'] is not None else None, 'priority': r['priority'],
             'link': f"/buying/auctions/{r['id']}"}
            for r in soon
        ],
        'link': '/buying/wishlist',
        'bid_now': len(nags['ending']),
        'ended_without_result': len(nags['unrecorded']),
        'won_yesterday': Outcome.objects.filter(win=True, captured_at__gte=start, captured_at__lt=end).count(),
        'report_cards': calibration(),
    }


def _requests() -> dict:
    from apps.core.models import ApprovalRequest

    waiting = ApprovalRequest.objects.filter(status=ApprovalRequest.STATUS_PENDING)
    return {
        'waiting': waiting.count(),
        'titles': list(waiting.values_list('title', flat=True)[:10]),
        'failed': ApprovalRequest.objects.filter(status=ApprovalRequest.STATUS_FAILED).count(),
        'link': '/admin/requests',
    }


def _thrift_plus(day: date) -> dict:
    from apps.thriftplus.models import Account, Card
    from apps.thriftplus.services.members import is_enabled

    start, end = _day_bounds(day)
    return {
        'switch_on': is_enabled(),
        'members': Account.objects.filter(status=Account.STATUS_ACTIVE).count(),
        'signups_yesterday': Account.objects.filter(created_at__gte=start, created_at__lt=end).count(),
        'blank_cards_left': Card.objects.filter(status=Card.STATUS_UNISSUED).count(),
    }


def _hiring(day: date) -> dict:
    """Hiring and new hires: who applied, who waits, interviews today, onboarding overdue, check-ins due."""
    from apps.hiring import checkins
    from apps.hiring.models import Application, CheckIn, Interview, Onboarding, OnboardingTask

    start, end = _day_bounds(day)
    today = timezone.localdate()
    real = Application.objects.filter(is_practice=False)
    due = [c for c in CheckIn.objects.filter(status=CheckIn.STATUS_SCHEDULED).select_related('user')
           if checkins.is_due(c, today)]
    return {
        'applied_yesterday': real.filter(created_at__gte=start, created_at__lt=end).count(),
        'new_waiting': real.filter(stage=Application.STAGE_NEW).count(),
        'interviews_today': Interview.objects.filter(status=Interview.STATUS_SCHEDULED, start__date=today).count(),
        'offers_waiting': real.filter(stage=Application.STAGE_OFFER).count(),
        'onboarding_in_progress': Onboarding.objects.filter(status=Onboarding.STATUS_ACTIVE).count(),
        'onboarding_overdue_items': OnboardingTask.objects.filter(
            onboarding__status=Onboarding.STATUS_ACTIVE, status=OnboardingTask.STATUS_OPEN, due_date__lt=today).count(),
        'checkins_due': [
            {'who': (c.user.full_name or c.user.email), 'day': c.day, 'due': c.due_date.isoformat(),
             'overdue': checkins.is_overdue(c, today)} for c in due[:10]
        ],
        'link': '/people/checkins',
    }


def _qa() -> dict:
    """The last nightly QA run: what got worse, what is high severity with rows, and the AI's headline."""
    from apps.qa.models import QARun

    run = QARun.objects.filter(finished_at__isnull=False).first()
    if run is None:
        return {'last_run': None}
    findings = list(run.findings.all())
    return {
        'last_run': run.finished_at.isoformat(),
        'worse': [{'check': f.check_id, 'title': f.title, 'count': f.count, 'was': f.previous}
                  for f in findings if f.previous is not None and f.count > f.previous],
        'high_with_rows': [{'check': f.check_id, 'title': f.title, 'count': f.count}
                           for f in findings if f.severity == 'high' and f.count > 0],
        'failed_checks': [f.check_id for f in findings if f.error],
        'triage_headline': (run.triage or {}).get('headline', ''),
    }


def _store_open(day: date) -> bool | None:
    try:
        from apps.webstore.services.hours import is_open_day

        return bool(is_open_day(day))
    except Exception:
        return None


def _last_week(day: date) -> dict:
    """Monday's look back: the week that ended on ``day`` (Mon to Sun) against the week before."""
    from apps.hr.models import TimeEntry
    from apps.pos.services.dashboard_metrics import _daily_sales_series
    from apps.routines.models import RoutineRun

    start = day - timedelta(days=6)
    revenue = _daily_sales_series(start - timedelta(days=7), day)
    this_week = sum((revenue.get(start + timedelta(days=i), Decimal('0')) for i in range(7)), Decimal('0'))
    prior = sum((revenue.get(start - timedelta(days=7) + timedelta(days=i), Decimal('0')) for i in range(7)), Decimal('0'))
    runs = RoutineRun.objects.filter(due_at__gte=_day_bounds(start)[0], due_at__lt=_day_bounds(day)[1])
    by_routine = (
        runs.exclude(status=RoutineRun.STATUS_DONE).values('routine__title').annotate(n=Count('pk')).order_by('-n')[:8]
    )
    return {
        'from': start.isoformat(), 'to': day.isoformat(),
        'revenue': _money(this_week), 'revenue_week_before': _money(prior),
        'hours_worked': _money(TimeEntry.objects.filter(date__gte=start, date__lte=day).aggregate(h=Sum('total_hours'))['h']),
        'routines_due': runs.count(), 'routines_done': runs.filter(status=RoutineRun.STATUS_DONE).count(),
        'most_missed': [{'routine': r['routine__title'], 'missed': r['n']} for r in by_routine],
        'link': '/admin/routines',
    }


def build_snapshot(day: date | None = None) -> dict[str, Any]:
    """The snapshot for the morning after ``day`` (default: yesterday)."""
    now = timezone.now()
    day = day or (timezone.localdate() - timedelta(days=1))
    sections: dict[str, Callable[[], dict]] = {
        'sales': lambda: _sales(day),
        'labor': lambda: _labor(day, now),
        'routines': lambda: _routines(day),
        'inventory': lambda: _inventory(day, now),
        'buying': lambda: _buying(day),
        'requests': _requests,
        'thrift_plus': lambda: _thrift_plus(day),
        'qa': _qa,
        'hiring': lambda: _hiring(day),
    }
    if day.weekday() == 6:  # the Monday brief looks back at the whole week
        sections['last_week'] = lambda: _last_week(day)
    data: dict[str, Any] = {
        'for_day': day.isoformat(), 'weekday': day.strftime('%A'), 'store_open': _store_open(day),
        'built_at': timezone.localtime(now).isoformat(), 'errors': {},
    }
    for name, build in sections.items():
        try:
            data[name] = build()
        except Exception as exc:  # one broken section never sinks the brief
            logger.exception('context snapshot section %s failed', name)
            data['errors'][name] = str(exc)[:300]
    return data
