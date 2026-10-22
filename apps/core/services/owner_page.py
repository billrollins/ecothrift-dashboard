"""The Owner page (critic review digest points 4 and 9, 2026-10-21). Superuser only.

One page that pulls the owner's numbers together, in place of the retired morning brief:

* **Scorecard** for this week, last week, this month and last month: Net item sales (``sales_numbers``),
  buying % of processing (target 40-50%), processing % of sales (target 120%), labor $ and % of sales, shrink
  (a slot until shrink by age lands), and what Thrift+ members are owed with its trend.
* **Needs you**: what is waiting on the owner, each with a count and a link (site errors from ``app_errors``).
* **AI spend**: every AI call's cost (``AIUsage``), one total plus by feature and by who, for today, this week
  or this month.

Weeks run Monday to Sunday (the store's pay week). Money is returned as strings with two decimals.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Count, Q, Sum
from django.utils import timezone

ZERO = Decimal('0')
CENT = Decimal('0.01')

TARGETS_KEY = 'owner.scorecard_targets'
DEFAULT_TARGETS = {
    # Buying spend (landed cost) as % of what Processing put on the floor (at tag): the equilibrium band.
    'buying_pct_of_processing': [40, 50],
    # What Processing put on the floor (at tag) as % of Net item sales.
    'processing_pct_of_sales': 120,
}
OWED_TREND_WEEKS = 8
SPEND_RANGES = ('today', 'week', 'month')

# Plain names for the code paths that call AI (``AIUsage.source``). Anything not listed shows its own name.
FEATURE_LABELS = {
    'ai_chat_proxy': 'AI chat',
    'settings_ai_test': 'Settings > AI: Test',
    'ai_price_check': 'Settings > AI: price check',
    'qa_triage': 'Nightly data checks (QA)',
    'hiring.ai': 'Hiring: writing help',
    'floorplan_ai': 'Floor plan',
    'label_ai_structure': 'Label designer',
    'label_ai_image': 'Label designer: background image',
    'ai_cleanup_rows': 'Order manifest cleanup',
    'ai_cleanup_batch': 'Order manifest cleanup',
    'inventory_cleanup_model_verify': 'Order manifest cleanup',
    'intake_standard': 'Intake: standardize rows',
    'ai_formula_job': 'Intake: manifest formulas',
    'ai_suggest_finalization': 'Intake: finalize suggestions',
    'suggest_product': 'Processing: product suggestions',
    'suggest_item': 'Processing: item suggestions',
    'inventory_llm_classify': 'Item categorizer',
    'standardize_products': 'Products: standardize',
    'vet_standardize': 'Products: standardize',
    'audition_standardize': 'Products: standardize',
    'dedupe_products': 'Products: dedupe',
    'dedupe_escalate': 'Products: dedupe',
    'vet_dedupe': 'Products: dedupe',
    'categorize_category_bins': 'Category research',
    'compare_category_taxonomy_models': 'Category research',
    'categorize_manifests': 'Buying: manifest categories',
    'ai_template_creation': 'Buying: manifest templates',
    'ai_key_mapping': 'Buying: manifest key mapping',
    'marketing.post_ideas': 'Social Studio: post ideas',
    'marketing.rewrite': 'Social Studio: rewrites',
    'ai_title_category_estimate': 'Buying: auction category estimates',
    'daily_brief': 'Morning brief (retired)',
}


def _money(value) -> str:
    return str(Decimal(value or 0).quantize(CENT))


def _cost(value) -> str:
    """AI cost to the hundredth of a cent: most single calls cost less than a cent."""
    return str(Decimal(value or 0).quantize(Decimal('0.0001')))


def _pct(part: Decimal, whole: Decimal) -> str | None:
    """``part`` as a whole-number-ish percent of ``whole`` (one decimal), or None when there is no whole."""
    if not whole:
        return None
    return str((Decimal(part) * 100 / Decimal(whole)).quantize(Decimal('0.1')))


def _midnight(day: date) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.min), timezone.get_current_timezone())


def targets() -> dict:
    """The Scorecard targets: the owner's ``owner.scorecard_targets`` setting over the defaults."""
    from apps.core.models import AppSetting

    value = AppSetting.objects.filter(key=TARGETS_KEY).values_list('value', flat=True).first()
    out = dict(DEFAULT_TARGETS)
    if isinstance(value, dict):
        band = value.get('buying_pct_of_processing')
        if isinstance(band, (list, tuple)) and len(band) == 2 and all(isinstance(v, (int, float)) for v in band):
            out['buying_pct_of_processing'] = [min(band), max(band)]
        if isinstance(value.get('processing_pct_of_sales'), (int, float)):
            out['processing_pct_of_sales'] = value['processing_pct_of_sales']
    return out


# ── Scorecard ───────────────────────────────────────────────────────────────────


def periods(today: date) -> list[dict]:
    """This week (Mon to today), last week, this month (1st to today), last month."""
    monday = today - timedelta(days=today.weekday())
    first = today.replace(day=1)
    last_month_end = first - timedelta(days=1)
    return [
        {'key': 'this_week', 'label': 'This week', 'start': monday, 'end': today},
        {'key': 'last_week', 'label': 'Last week', 'start': monday - timedelta(days=7), 'end': monday - timedelta(days=1)},
        {'key': 'this_month', 'label': 'This month', 'start': first, 'end': today},
        {'key': 'last_month', 'label': 'Last month', 'start': last_month_end.replace(day=1), 'end': last_month_end},
    ]


def labor_cost(start: date, end: date) -> tuple[Decimal, Decimal]:
    """(hours, pay) worked from ``start`` to ``end``: each shift's hours times the person's pay rate.

    Straight time; overtime at 1.5x comes with the pay release. A shift still open counts up to now."""
    from apps.hr.models import TimeEntry
    from apps.hr.services.roster import _pay_rate_for, shift_hours

    hours, pay = ZERO, ZERO
    for entry in TimeEntry.objects.filter(date__gte=start, date__lte=end).select_related('employee', 'employee__employee'):
        h = shift_hours(entry)
        hours += h
        pay += h * _pay_rate_for(entry)
    return hours.quantize(CENT), pay.quantize(CENT)


def period_numbers(start: date, end: date) -> dict:
    from apps.pos.services import sales_numbers
    from apps.pos.services.dashboard_metrics import _buying_total, _processing_on_shelf_value

    sales = sum(sales_numbers.net_item_sales_by_day(start, end).values(), ZERO)
    buying = _buying_total(start, end)
    processing = _processing_on_shelf_value(start, end)
    hours, labor = labor_cost(start, end)
    return {
        'start': start.isoformat(),
        'end': end.isoformat(),
        'net_item_sales': _money(sales),
        'buying': _money(buying),
        'processing': _money(processing),
        'buying_pct_of_processing': _pct(buying, processing),
        'processing_pct_of_sales': _pct(processing, sales),
        'labor_hours': _money(hours),
        'labor': _money(labor),
        'labor_pct_of_sales': _pct(labor, sales),
        # Shrink by age (items unseen on the floor past 90 / 180 days) is its own release; the slot waits for it.
        'shrink': None,
    }


def owed_on(day: date) -> Decimal:
    """What members were owed at the end of ``day``: kept ThriftBucks plus store credit, as booked by then.

    ThriftBucks past their date count until the nightly run writes them off, the way the ledger saw it then."""
    from apps.thriftplus.models import LedgerEntry

    rows = LedgerEntry.objects.filter(account__is_practice=False, created_at__lt=_midnight(day + timedelta(days=1)))
    bank = rows.filter(kind=LedgerEntry.KIND_BANK).aggregate(s=Sum('amount'))['s'] or ZERO
    credit = rows.filter(kind=LedgerEntry.KIND_CREDIT).aggregate(s=Sum('amount'))['s'] or ZERO
    return max(ZERO, bank) + max(ZERO, credit)


def thrift_plus_owed(today: date) -> dict:
    """Owed now (the Thrift+ page's own figure) and the last weeks' trend (each Sunday, then today)."""
    from apps.thriftplus.services.overview import overview

    owed = overview()['owed']
    sunday = today - timedelta(days=today.weekday() + 1)
    trend = [
        {'day': d.isoformat(), 'owed': _money(owed_on(d))}
        for d in (sunday - timedelta(days=7 * k) for k in range(OWED_TREND_WEEKS - 1, -1, -1))
    ]
    trend.append({'day': today.isoformat(), 'owed': owed['total']})
    return {**owed, 'trend': trend, 'link': '/thrift-plus'}


def scorecard(today: date | None = None) -> dict[str, Any]:
    today = today or timezone.localdate()
    return {
        'today': today.isoformat(),
        'targets': targets(),
        'periods': [
            {'key': p['key'], 'label': p['label'], **period_numbers(p['start'], p['end'])}
            for p in periods(today)
        ],
        'thrift_plus_owed': thrift_plus_owed(today),
    }


# ── Needs you ───────────────────────────────────────────────────────────────────


def _item(key: str, label: str, count: int, link: str, *, detail: str = '', tone: str = 'warning') -> dict:
    return {'key': key, 'label': label, 'count': count, 'link': link, 'detail': detail, 'tone': tone}


def _over_hours(now: datetime) -> list[str]:
    """Who is past 40 hours (plus any overtime the owner cleared) this week."""
    from apps.accounts.models import User
    from apps.hr.models import TimeEntry
    from apps.hr.services.time_clock_utils import over_hours_flag, weekly_status_for_employee

    week_start = timezone.localtime(now).date() - timedelta(days=timezone.localtime(now).weekday())
    ids = TimeEntry.objects.filter(date__gte=week_start).values_list('employee', flat=True).distinct()
    out = []
    for employee in User.objects.filter(pk__in=list(ids)).select_related('employee'):
        status = weekly_status_for_employee(employee, now)
        flag = over_hours_flag(status['hours_worked'], status['overtime_allowance'], employee.pk)
        if flag:
            out.append(f"{employee.full_name}: {flag['hours_text']} of {flag['limit_text']}")
    return out


def needs_you(now: datetime | None = None) -> dict[str, Any]:
    """What is waiting on the owner. Every source is counted on its own: one that fails shows as an error row."""
    now = now or timezone.now()
    items: list[dict] = []
    errors: list[str] = []

    def add(build):
        try:
            items.extend(build())
        except Exception as exc:  # noqa: BLE001 - one broken source never blanks the list
            errors.append(f'{build.__name__}: {exc}')

    def requests():
        from apps.core.models import ApprovalRequest

        waiting = ApprovalRequest.objects.filter(status=ApprovalRequest.STATUS_PENDING)
        titles = list(waiting.values_list('title', flat=True)[:3])
        failed = ApprovalRequest.objects.filter(status=ApprovalRequest.STATUS_FAILED).count()
        return [
            _item('requests', 'Requests to approve', waiting.count(), '/admin/requests', detail='; '.join(titles)),
            _item('requests_failed', 'Requests that failed', failed, '/admin/requests', tone='error'),
        ]

    def time_changes():
        from apps.hr.models import TimeEntryModificationRequest

        n = TimeEntryModificationRequest.objects.filter(status='pending').count()
        over = _over_hours(now)
        return [
            _item('time_changes', 'Time-change requests', n, '/admin/time-payroll'),
            _item('over_hours', 'Over their hours this week', len(over), '/admin/time-payroll', detail='; '.join(over)),
        ]

    def returns():
        from apps.thriftplus.models import LateReturnMark, ReturnRecord

        late = LateReturnMark.objects.filter(created_at__gte=now - timedelta(days=7)).count()
        waiting = ReturnRecord.objects.filter(status=ReturnRecord.STATUS_OPEN).count()
        return [
            _item('late_returns', 'Late returns taken (last 7 days)', late, '/pos/returns'),
            _item('returns_waiting', 'Returned items waiting for staff', waiting, '/pos/returns', tone='info'),
        ]

    def offers():
        from apps.hiring.models import Application, Offer

        real = Application.objects.filter(is_practice=False)
        to_send = real.filter(stage=Application.STAGE_OFFER).exclude(offers__status__in=Offer.OPEN).count()
        out = Offer.objects.filter(status__in=Offer.OPEN, application__is_practice=False).count()
        return [
            _item('offers_to_send', 'Offers to send', to_send, '/people/applicants'),
            _item('offers_out', 'Offers waiting for a signature', out, '/people/applicants', tone='info'),
        ]

    def checkins():
        from apps.hiring import checkins as hiring_checkins
        from apps.hiring.models import CheckIn

        today = timezone.localdate()
        due = [c for c in CheckIn.objects.filter(status=CheckIn.STATUS_SCHEDULED).select_related('user')
               if hiring_checkins.is_due(c, today)]
        late = [c for c in due if hiring_checkins.is_overdue(c, today)]
        names = '; '.join(f"{c.user.full_name or c.user.email} ({c.day}-day)" for c in due[:5])
        return [_item('checkins_due', 'New-hire check-ins due', len(due), '/people/checkins', detail=names,
                      tone='error' if late else 'warning')]

    def data_checks():
        from apps.qa.models import QARun

        run = QARun.objects.filter(finished_at__isnull=False).first()
        findings = list(run.findings.all()) if run else []
        worse = [f for f in findings if f.previous is not None and f.count > f.previous]
        return [_item('qa_worse', 'Data checks that got worse last night', len(worse), '/admin/qa',
                      detail='; '.join(f.title for f in worse[:3]), tone='info')]

    def site_errors():
        from apps.core.services.app_errors import summary

        s = summary(limit=0)
        return [_item('site_errors', 'Site errors not yet seen', s['open_count'], '/owner#site-errors',
                      detail=f"{s['last_24h']} in the last 24 hours", tone='error')]

    def thrift_plus():
        from apps.thriftplus.services import watchdog

        run = watchdog.nightly_run(now)
        missing = watchdog.sales_missing_ledger(now)
        return [
            _item('thrift_run', 'Nightly ThriftBucks run did not finish', 1 if run else 0, '/thrift-plus?tab=rewards',
                  detail=run['text'] if run else '', tone='error'),
            _item('thrift_ledger', 'Member sales with no ThriftBucks record (7 days)', len(missing), '/pos/transactions',
                  detail=', '.join(m['ticket'] for m in missing[:5]), tone='error'),
        ]

    for build in (requests, time_changes, returns, offers, checkins, data_checks, site_errors, thrift_plus):
        add(build)
    return {'items': items, 'errors': errors}


# ── AI spend ────────────────────────────────────────────────────────────────────


def spend_start(range_key: str, now: datetime | None = None) -> datetime:
    today = timezone.localtime(now or timezone.now()).date()
    if range_key == 'week':
        return _midnight(today - timedelta(days=today.weekday()))
    if range_key == 'month':
        return _midnight(today.replace(day=1))
    return _midnight(today)


def feature_label(source: str) -> str:
    return FEATURE_LABELS.get(source) or (source or 'Unnamed').replace('_', ' ').replace('.', ' ').capitalize()


def ai_spend(range_key: str = 'today', now: datetime | None = None) -> dict[str, Any]:
    """One total plus by feature (where) and by who (a login, or the job that ran it)."""
    from django.db.models.fields.json import KT

    from apps.accounts.models import User
    from apps.core.models import AIUsage

    range_key = range_key if range_key in SPEND_RANGES else 'today'
    since = spend_start(range_key, now)
    rows = AIUsage.objects.filter(created_at__gte=since)
    total = rows.aggregate(cost=Sum('estimated_cost_usd'), calls=Count('pk'), failed=Count('pk', filter=Q(success=False)))

    by_feature: dict[str, dict] = {}
    for r in rows.values('source').annotate(cost=Sum('estimated_cost_usd'), calls=Count('pk')):
        label = feature_label(r['source'])
        row = by_feature.setdefault(label, {'feature': label, 'sources': [], 'cost': ZERO, 'calls': 0})
        row['sources'].append(r['source'])
        row['cost'] += r['cost'] or ZERO
        row['calls'] += r['calls']

    by_who: list[dict] = []
    users = rows.filter(user__isnull=False).values('user').annotate(cost=Sum('estimated_cost_usd'), calls=Count('pk'))
    names = {u.pk: (u.full_name or u.email) for u in User.objects.filter(pk__in=[r['user'] for r in users])}
    for r in users:
        by_who.append({'who': names.get(r['user'], f"User {r['user']}"), 'kind': 'user', 'cost': r['cost'] or ZERO,
                       'calls': r['calls']})
    jobs = (rows.filter(user__isnull=True).annotate(job=KT('context__job')).values('job')
            .annotate(cost=Sum('estimated_cost_usd'), calls=Count('pk')))
    for r in jobs:
        by_who.append({'who': f"Job: {r['job'] or 'background'}", 'kind': 'job', 'cost': r['cost'] or ZERO,
                       'calls': r['calls']})

    def ordered(entries):
        return [{**e, 'cost': _cost(e['cost'])} for e in sorted(entries, key=lambda e: (-e['cost'], -e['calls']))]

    return {
        'range': range_key,
        'since': since.isoformat(),
        'total': _cost(total['cost']),
        'calls': total['calls'] or 0,
        'failed': total['failed'] or 0,
        'by_feature': ordered(by_feature.values()),
        'by_who': ordered(by_who),
    }
