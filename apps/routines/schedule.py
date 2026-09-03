"""Materialize routine runs. Honour store hours (closed Sunday and Monday)."""
from __future__ import annotations

import calendar
import random
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.webstore.services.hours import _local_now, is_open_day

from .models import Routine, RoutineRun, RoutineSubmission, Section
from .settings import retail_qa_settings

User = get_user_model()

STAFF_GROUPS = ('Employee', 'Manager', 'Admin')

# Seeded program routines, found by key rather than title so a rename is safe.
SYSTEM_OPEN = 'retail.open'
SYSTEM_DAY = 'retail.day'
SYSTEM_CLOSE = 'retail.close'
SYSTEM_TALLY = 'retail.section_tally'
SYSTEM_CROSS_CHECK = 'retail.section_audit'
SYSTEM_OWNER_SPOT = 'retail.owner_spot'
SYSTEM_WORK_CYCLE = 'retail.work_cycle'


def biweekly_period_start(anchor: date | None, day: date) -> date | None:
    """Start of the 14-day window that contains `day`, or None before the first due."""
    if not anchor or day < anchor:
        return None
    return anchor + timedelta(days=((day - anchor).days // 14) * 14)


def period_key_for(routine: Routine, day: date) -> str:
    trigger = routine.trigger
    if trigger == Routine.TRIGGER_ANNUAL:
        return f'{day.year}'
    if trigger == Routine.TRIGGER_QUARTERLY:
        return f'{day.year}-Q{(day.month - 1) // 3 + 1}'
    if trigger == Routine.TRIGGER_MONTHLY:
        return f'{day.year}-{day.month:02d}'
    if trigger == Routine.TRIGGER_WEEKLY:
        iso = day.isocalendar()
        return f'{iso.year}-W{iso.week:02d}'
    if trigger == Routine.TRIGGER_BIWEEKLY:
        start = biweekly_period_start(routine.anchor_date, day)
        return start.isoformat() if start else day.isoformat()
    return day.isoformat()


def should_run_on(routine: Routine, day: date, *, cfg: dict | None = None) -> bool:
    if routine.trigger == Routine.TRIGGER_ON_DEMAND:
        return False
    if not is_open_day(day, cfg=cfg):
        return False
    if routine.trigger == Routine.TRIGGER_BIWEEKLY:
        return biweekly_period_start(routine.anchor_date, day) is not None
    if routine.trigger in (
        Routine.TRIGGER_WEEKLY,
        Routine.TRIGGER_MONTHLY,
        Routine.TRIGGER_QUARTERLY,
        Routine.TRIGGER_ANNUAL,
    ):
        return True
    weekdays = []
    for value in routine.weekdays or []:
        try:
            weekday = int(value)
        except (TypeError, ValueError):
            continue
        if 0 <= weekday <= 6:
            weekdays.append(weekday)
    if weekdays:
        return day.weekday() in weekdays
    return True


def _last_open_day_on_or_before(last: date, floor: date, *, cfg: dict | None = None) -> date:
    day = last
    for _ in range(21):
        if day <= floor:
            return floor
        if is_open_day(day, cfg=cfg):
            return day
        day = day - timedelta(days=1)
    return floor


def period_end_day(routine: Routine, day: date, *, cfg: dict | None = None) -> date:
    trigger = routine.trigger
    if trigger == Routine.TRIGGER_DAILY:
        return day
    if trigger == Routine.TRIGGER_BIWEEKLY:
        start = biweekly_period_start(routine.anchor_date, day)
        last = start or day
        return _last_open_day_on_or_before(last, last - timedelta(days=6), cfg=cfg)
    if trigger == Routine.TRIGGER_WEEKLY:
        last = day + timedelta(days=6 - day.weekday())
    elif trigger == Routine.TRIGGER_MONTHLY:
        last = date(day.year, day.month, calendar.monthrange(day.year, day.month)[1])
    elif trigger == Routine.TRIGGER_QUARTERLY:
        end_month = ((day.month - 1) // 3 + 1) * 3
        last = date(day.year, end_month, calendar.monthrange(day.year, end_month)[1])
    else:
        last = date(day.year, 12, 31)
    return _last_open_day_on_or_before(last, day, cfg=cfg)


def due_at_for(routine: Routine, day: date, *, tz: ZoneInfo, cfg: dict | None = None) -> datetime:
    """The run's anchor instant. A clock-out routine anchors at the end of its day."""
    clock = routine.due_time or END_OF_DAY
    naive = datetime.combine(period_end_day(routine, day, cfg=cfg), clock)
    return timezone.make_aware(naive, tz)


END_OF_DAY = time(23, 59)


def run_moments(run: RoutineRun) -> dict:
    """The three instants that drive nagging, from the run's day and its routine.

    Derived rather than stored so retiming a routine also retimes the runs that
    are already open - the whole point of editing a due time mid-day.

    - `remind_at`: soft. Badges on the Routines link and in the list.
    - `nag_at`: hard. The app-bar alert. None means "when you clock out".
    - `late_at`: the run now counts against the day.
    """
    routine = run.routine
    local_due = timezone.localtime(run.due_at)
    tz = local_due.tzinfo
    day = local_due.date()

    def at(clock: time, on: date | None = None) -> datetime:
        return timezone.make_aware(datetime.combine(on or day, clock), tz)

    remind_at = at(routine.remind_time) if routine.remind_time else at(time(0, 0))
    nag_at = run.due_at if routine.due_time else None
    if routine.late_after == Routine.LATE_DUE:
        late_at = nag_at or at(END_OF_DAY)
    elif routine.late_after == Routine.LATE_GRACE:
        late_at = run.due_at + timedelta(days=routine.grace_days or 0)
    else:
        late_at = at(END_OF_DAY)
    # A hard nag that lands after the deadline it guards is a contradiction; the
    # deadline wins so nothing is late before it has ever nagged.
    if nag_at and late_at < nag_at:
        late_at = nag_at
    if remind_at > (nag_at or late_at):
        remind_at = nag_at or late_at
    return {'remind_at': remind_at, 'nag_at': nag_at, 'late_at': late_at}


def _add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day.day, last))


def miss_at(run: RoutineRun):
    """When an open run becomes missed and can no longer be filled. None = never."""
    routine = run.routine
    rule = routine.expire_rule or Routine.EXPIRE_NEVER
    if rule == Routine.EXPIRE_NEVER:
        return None
    local_due = timezone.localtime(run.due_at)
    tz = local_due.tzinfo
    day = local_due.date()

    def at_end(on: date) -> datetime:
        return timezone.make_aware(datetime.combine(on, END_OF_DAY), tz)

    if rule == Routine.EXPIRE_END_OF_DAY:
        return at_end(day)
    if rule == Routine.EXPIRE_END_OF_WEEK:
        sunday = day + timedelta(days=(6 - day.weekday()))
        return at_end(sunday)
    count = max(int(routine.expire_count or 1), 1)
    unit = routine.expire_unit or Routine.EXPIRE_UNIT_HOURS
    if unit == Routine.EXPIRE_UNIT_HOURS:
        start_clock = routine.expire_from_time or time(0, 0)
        start = timezone.make_aware(datetime.combine(day, start_clock), tz)
        return start + timedelta(hours=count)
    if unit == Routine.EXPIRE_UNIT_DAYS:
        return at_end(day + timedelta(days=count - 1))
    if unit == Routine.EXPIRE_UNIT_WEEKS:
        return at_end(day + timedelta(weeks=count - 1))
    if unit == Routine.EXPIRE_UNIT_MONTHS:
        return at_end(_add_months(day, count - 1))
    return None


def close_if_expired(run: RoutineRun, *, now=None) -> bool:
    """Flip an open run to missed if its expire clock has passed. True if missed."""
    if run.status == RoutineRun.STATUS_MISSED:
        return True
    if run.status != RoutineRun.STATUS_OPEN:
        return False
    when = miss_at(run)
    if when is None or (now or _local_now()[0]) <= when:
        return False
    RoutineSubmission.objects.filter(
        run=run, status=RoutineSubmission.STATUS_DRAFT,
    ).delete()
    run.status = RoutineRun.STATUS_MISSED
    run.save(update_fields=['status'])
    return True


def expire_open_runs(*, now=None) -> int:
    """Mark every open run past miss_at as missed. Returns how many flipped."""
    now = now or _local_now()[0]
    expired_ids = []
    for run in RoutineRun.objects.filter(
        status=RoutineRun.STATUS_OPEN,
    ).select_related('routine'):
        when = miss_at(run)
        if when is not None and now > when:
            expired_ids.append(run.pk)
    if not expired_ids:
        return 0
    RoutineSubmission.objects.filter(
        run_id__in=expired_ids,
        status=RoutineSubmission.STATUS_DRAFT,
    ).delete()
    return RoutineRun.objects.filter(
        pk__in=expired_ids, status=RoutineRun.STATUS_OPEN,
    ).update(status=RoutineRun.STATUS_MISSED)


def department_sections(routine: Routine):
    """Active sections of the routine's department, in floor order."""
    qs = Section.objects.filter(is_active=True).select_related('owner')
    if routine.assigned_department_id:
        qs = qs.filter(department_id=routine.assigned_department_id)
    return list(qs.order_by('sort_order', 'name'))


def section_owner_ids(sections) -> list[int]:
    """Distinct owners in floor order. The order is the rotation's spine."""
    seen: list[int] = []
    for section in sections:
        if section.owner_id and section.owner_id not in seen:
            seen.append(section.owner_id)
    return seen


def cross_check_pairs(sections, week: int) -> dict[int, Section]:
    """Who audits which section this week: `{owner_id: section}`.

    The offset walks with the ISO week so the same two people are not paired
    every Tuesday, and it never lands on your own aisle - the whole value of a
    cross-check is that the person did not put the stock there.
    """
    owners = section_owner_ids(sections)
    count = len(sections)
    if not owners or count < 2:
        return {}
    offset = 1 + (week % max(count - 1, 1))
    pairs: dict[int, Section] = {}
    for index, owner_id in enumerate(owners):
        for step in range(count):
            candidate = sections[(index + offset + step) % count]
            if candidate.owner_id != owner_id:
                pairs[owner_id] = candidate
                break
    return pairs


def draw_spot_checks(period_key: str, count: int) -> list[dict]:
    """`count` checks pulled at random from the Open / Day / Close checklists.

    Seeded by the period so a refresh cannot reroll a sample somebody dislikes.
    """
    pool: list[dict] = []
    for routine in Routine.objects.filter(
        is_active=True,
        system_key__in=(SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE),
    ).order_by('system_key'):
        for section in (routine.definition or {}).get('sections') or []:
            for check in section.get('checks') or []:
                if not check.get('id'):
                    continue
                pool.append({
                    'routine_key': routine.system_key,
                    'routine_title': routine.title,
                    'check_id': str(check['id']),
                    'label': check.get('label') or '',
                    'control': check.get('control') or 'pass_fail',
                    'result': '',
                })
    if not pool:
        return []
    rng = random.Random(f'spot:{period_key}')
    return rng.sample(pool, min(count, len(pool)))


def week_days(day: date) -> list[date]:
    monday = day - timedelta(days=day.weekday())
    return [monday + timedelta(days=offset) for offset in range(7)]


def unseen_spot_sections(
    routine: Routine, day: date, *, exclude_ids: list[int] | None = None,
) -> list[Section]:
    """Department sections with no owner-spot run this ISO week."""
    skip = set(exclude_ids or [])
    seen = set(
        RoutineRun.objects.filter(
            routine__kind=Routine.KIND_OWNER_SPOT,
            period_key__in=[d.isoformat() for d in week_days(day)],
            section__isnull=False,
        )
        .exclude(period_key=day.isoformat())
        .values_list('section_id', flat=True)
    )
    return [
        section for section in department_sections(routine)
        if section.pk not in seen and section.pk not in skip
    ]


def next_spot_section(routine: Routine, day: date) -> Section | None:
    """A random section the owner has not spot-checked yet this week.

    When every aisle has had a look, there is no wrap: the run is born
    without a section.
    """
    leftover = unseen_spot_sections(routine, day)
    if not leftover:
        return None
    return random.choice(leftover)


def _staff_qs():
    return User.objects.filter(is_active=True, groups__name__in=STAFF_GROUPS).distinct()


def current_shift(user) -> str:
    """The open punch's shift code, or blank when clocked out."""
    from apps.hr.models import TimeEntry
    entry = TimeEntry.objects.filter(employee=user, clock_out__isnull=True).first()
    return (entry.shift if entry else '') or ''


def audience_shift_codes(routine: Routine) -> list[str]:
    from apps.hr.shifts import SHIFT_ORDER
    raw = getattr(routine, 'assigned_shifts', None) or []
    return [str(code) for code in raw if str(code) in SHIFT_ORDER]


def audience_department_ids(routine: Routine) -> list[int]:
    ids: list[int] = []
    for value in getattr(routine, 'assigned_department_ids', None) or []:
        try:
            number = int(value)
        except (TypeError, ValueError):
            continue
        if number > 0 and number not in ids:
            ids.append(number)
    if not ids and getattr(routine, 'assigned_department_id', None):
        ids.append(routine.assigned_department_id)
    return ids


def user_in_audience(routine: Routine, user, shift=None) -> bool:
    """Whether this user matches the routine's person / shift / department rule."""
    if routine.subject_source in (Routine.SUBJECT_MY_SECTION, Routine.SUBJECT_OTHER_SECTION):
        return resolve_assignees(routine).filter(pk=user.pk).exists()
    kind = getattr(routine, 'audience_type', None) or Routine.AUDIENCE_PERSON
    everyone = bool(getattr(routine, 'audience_all', False))
    if kind == Routine.AUDIENCE_SHIFT:
        punch = current_shift(user) if shift is None else shift
        if not punch:
            return False
        if everyone:
            return True
        return punch in audience_shift_codes(routine)
    if not _staff_qs().filter(pk=user.pk).exists():
        return False
    if kind == Routine.AUDIENCE_DEPARTMENT:
        if everyone:
            return True
        dept_id = getattr(getattr(user, 'employee', None), 'department_id', None)
        return bool(dept_id) and dept_id in audience_department_ids(routine)
    if everyone:
        return True
    return routine.assigned_users.filter(pk=user.pk, is_active=True).exists()


def resolve_assignees(routine: Routine):
    if routine.subject_source in (Routine.SUBJECT_MY_SECTION, Routine.SUBJECT_OTHER_SECTION):
        # Section work belongs to whoever keeps a section. An owner list that
        # drifts from the floor plan is a bug.
        owners = section_owner_ids(department_sections(routine))
        return User.objects.filter(pk__in=owners, is_active=True)
    kind = getattr(routine, 'audience_type', None) or Routine.AUDIENCE_PERSON
    everyone = bool(getattr(routine, 'audience_all', False))
    if kind == Routine.AUDIENCE_SHIFT:
        from apps.hr.models import TimeEntry
        punches = TimeEntry.objects.filter(clock_out__isnull=True).exclude(shift='')
        if not everyone:
            codes = audience_shift_codes(routine)
            if not codes:
                return User.objects.none()
            punches = punches.filter(shift__in=codes)
        return _staff_qs().filter(pk__in=list(punches.values_list('employee_id', flat=True)))
    if kind == Routine.AUDIENCE_DEPARTMENT:
        qs = _staff_qs()
        if everyone:
            return qs
        ids = audience_department_ids(routine)
        if not ids:
            return User.objects.none()
        return qs.filter(employee__department_id__in=ids)
    if everyone:
        return _staff_qs()
    named = list(routine.assigned_users.filter(is_active=True))
    if named:
        return User.objects.filter(pk__in=[u.pk for u in named])
    return User.objects.none()


def _run_extras(routine: Routine, day: date, key: str, user_id: int | None) -> dict:
    """The section and the drawn sample a run is born with, per routine kind."""
    if routine.subject_source == Routine.SUBJECT_OTHER_SECTION:
        pairs = cross_check_pairs(department_sections(routine), day.isocalendar().week)
        section = pairs.get(user_id)
        return {'section': section, 'subject': section.name if section else '', 'generated': {}}
    if routine.kind == Routine.KIND_OWNER_SPOT:
        section = next_spot_section(routine, day)
        cfg = retail_qa_settings()
        return {
            'section': section,
            'subject': section.name if section else '',
            'generated': {
                'checks': draw_spot_checks(key, int(cfg['spot_check_count'])),
                'section_id': section.pk if section else None,
            },
        }
    if routine.subject_source == Routine.SUBJECT_MY_SECTION:
        # One run covers everything this person keeps, so no single section.
        owned = [s.name for s in department_sections(routine) if s.owner_id == user_id]
        return {'section': None, 'subject': ', '.join(owned), 'generated': {}}
    return {'section': None, 'subject': '', 'generated': {}}


def _upsert_run(routine: Routine, key: str, user, due, extras: dict) -> bool:
    # mine/ and today/ both materialize. After a fresh pull those two
    # requests race get_or_create and one used to 500.
    try:
        with transaction.atomic():
            run, was_created = RoutineRun.objects.get_or_create(
                routine=routine,
                period_key=key,
                assigned_to=user,
                defaults={
                    'due_at': due,
                    'status': RoutineRun.STATUS_OPEN,
                    **extras,
                },
            )
    except IntegrityError:
        lookup = RoutineRun.objects.filter(routine=routine, period_key=key)
        run = (
            lookup.filter(assigned_to__isnull=True).get()
            if user is None
            else lookup.get(assigned_to=user)
        )
        was_created = False
    if was_created:
        return True
    if run.status != RoutineRun.STATUS_OPEN:
        return False
    # An open run follows the plan: retiming the routine or moving a section to
    # a new owner has to reach the run someone is about to walk up to.
    changed = []
    if run.due_at != due:
        run.due_at = due
        changed.append('due_at')
    for field, value in extras.items():
        current = run.section_id if field == 'section' else getattr(run, field)
        wanted = (value.pk if value else None) if field == 'section' else value
        # A drawn sample is fixed once written; rerolling it every refresh would
        # let anyone shop for an easier audit. An empty owner-spot sample is the
        # exception: the run was born before any section existed, and it has to
        # pick one up the next time materialize runs.
        pinned_spot = (
            routine.kind == Routine.KIND_OWNER_SPOT
            and (run.generated or {}).get('section_id')
        )
        if pinned_spot and field in ('generated', 'section', 'subject'):
            continue
        if field == 'generated' and run.generated:
            hollow = (
                routine.kind == Routine.KIND_OWNER_SPOT
                and not (run.generated or {}).get('section_id')
                and (value or {}).get('section_id')
            )
            if not hollow:
                continue
        if current != wanted:
            setattr(run, field, value)
            changed.append('section_id' if field == 'section' else field)
    if changed:
        run.save(update_fields=changed)
    return False


def materialize_routines(day: date | None = None) -> int:
    local, cfg, tz = _local_now()
    expire_open_runs(now=local)
    day = day or local.date()
    created = 0
    for routine in Routine.objects.filter(is_active=True).exclude(
        trigger=Routine.TRIGGER_ON_DEMAND,
    ).select_related('assigned_department'):
        if not should_run_on(routine, day, cfg=cfg):
            continue
        assignees = list(resolve_assignees(routine))
        pooled = routine.assignment == Routine.ASSIGN_POOLED and routine.subject_source == Routine.SUBJECT_POOL
        if not pooled and not assignees:
            continue
        due = due_at_for(routine, day, tz=tz, cfg=cfg)
        key = period_key_for(routine, day)
        if pooled:
            if _upsert_run(routine, key, None, due, _run_extras(routine, day, key, None)):
                created += 1
            continue
        for user in assignees:
            extras = _run_extras(routine, day, key, user.pk)
            if routine.subject_source == Routine.SUBJECT_OTHER_SECTION and not extras['section']:
                continue
            if _upsert_run(routine, key, user, due, extras):
                created += 1
    return created


def cover_run(run: RoutineRun, user) -> None:
    """Hand an absent person's run to whoever is standing here instead.

    Section work cannot simply lapse because somebody called in: the aisle is
    still there. Reassigning keeps one run per section per day rather than
    inventing a second one for the stand-in.
    """
    run.assigned_to = user
    run.save(update_fields=['assigned_to'])


def is_overdue(run: RoutineRun, *, now=None) -> bool:
    if run.status != RoutineRun.STATUS_OPEN:
        return False
    return (now or timezone.now()) > run_moments(run)['late_at']


def was_late(run: RoutineRun) -> bool:
    """A finished run that closed after its deadline. Drives the performed score."""
    if not run.completed_at:
        return False
    return run.completed_at > run_moments(run)['late_at']


def user_can_see_run(run: RoutineRun, user) -> bool:
    if getattr(user, 'is_superuser', False):
        return True
    if not user_in_audience(run.routine, user):
        return False
    if run.assigned_to_id is None:
        return True
    return run.assigned_to_id == user.pk


def mine_queryset(user):
    open_runs = (
        RoutineRun.objects.filter(status=RoutineRun.STATUS_OPEN, routine__is_active=True)
        .select_related('routine', 'assigned_to')
        .prefetch_related('routine__assigned_users')
        .order_by('due_at', 'id')
    )
    punch = current_shift(user)
    keep = [
        run.pk for run in open_runs
        if user_in_audience(run.routine, user, shift=punch)
        and (run.assigned_to_id is None or run.assigned_to_id == user.pk)
    ]
    if not keep:
        return RoutineRun.objects.none()
    return open_runs.filter(pk__in=keep)


def overdue_queryset(*, now=None):
    now = now or timezone.now()
    pending = RoutineRun.objects.filter(
        status=RoutineRun.STATUS_OPEN, routine__is_active=True,
    ).select_related(
        'routine', 'routine__assigned_department', 'assigned_to',
        'assigned_to__employee', 'assigned_to__employee__department',
    )
    ids = [row.pk for row in pending if is_overdue(row, now=now)]
    return RoutineRun.objects.filter(pk__in=ids).select_related(
        'routine', 'routine__assigned_department', 'assigned_to',
        'assigned_to__employee', 'assigned_to__employee__department',
    ).order_by('due_at', 'id')


def done_this_week_queryset(user, *, now=None):
    now = now or timezone.now()
    local = timezone.localtime(now)
    week_start = local.date() - timedelta(days=local.date().weekday())
    return (
        RoutineRun.objects.filter(
            Q(assigned_to=user) | Q(completed_by=user),
            status=RoutineRun.STATUS_DONE,
            routine__is_active=True,
            completed_at__date__gte=week_start,
        )
        .select_related('routine')
        .order_by('-completed_at')
    )
