"""Turning a day of retail work into a letter.

Three ideas hold the whole thing up.

**Doing the work is most of the grade.** Open, Day, and Close are pass/fail
checklists, and what they score on is whether they happened on time - not what
they found. A closing walk that turns up four problems is a good closing walk.
Marking the day down for it would teach everyone to find nothing.

**The owner's look is the other half.** A spot check is a small sample, but it
is an unannounced one, so on the days it happens it carries as much weight as
the three checklists combined. On the days it does not, the checklists carry
the day alone: the CEO being busy is not the floor's fault.

**Cross-checks are weekly, not daily.** One Tuesday audit per section is too
sparse to move a single day and too important to leave out, so it lands on the
week at a quarter of the weight.

Everything numeric here comes from Settings > Retail QA.
"""
from __future__ import annotations

from datetime import date, timedelta
from statistics import mean

from django.utils import timezone

from apps.webstore.services.hours import _local_now, is_open_day

from .models import Routine, RoutineRun, RoutineSubmission, WorkCyclePrompt
from .schedule import (
    SYSTEM_CLOSE,
    SYSTEM_CROSS_CHECK,
    SYSTEM_DAY,
    SYSTEM_OPEN,
    SYSTEM_OWNER_SPOT,
    SYSTEM_TALLY,
    SYSTEM_WORK_CYCLE,
    was_late,
    week_days,
)
from .settings import letter_for, retail_qa_settings
from .taxonomy import (
    GRADED,
    GRADED_KEYS,
    RECORDED_KEYS,
    SAFETY_CAP,
    SAFETY_FLAG,
    group_sum,
    rollup_counts,
)

PERFORMED_KEYS = (SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE)


def _counts_score(counts: dict, cfg: dict) -> float:
    """Mean of the graded groups, each stepped down by the sum of its items."""
    minor = int(cfg['audit_minor_max'])
    needs_work = int(cfg['audit_needs_work_max'])
    points = []
    for key in GRADED_KEYS:
        found = group_sum(counts or {}, key)
        if found == 0:
            points.append(100.0)
        elif found <= minor:
            points.append(75.0)
        elif found <= needs_work:
            points.append(50.0)
        else:
            points.append(0.0)
    return mean(points) if points else 100.0


def audit_score(audit: dict, cfg: dict) -> float:
    """A cross-check's section score. A safety flag caps it however tidy the rest."""
    score = _counts_score(audit.get('counts') or {}, cfg)
    if SAFETY_FLAG in (audit.get('flags') or []):
        score = min(score, SAFETY_CAP)
    return round(score, 1)


def checklist_score(run: RoutineRun | None, cfg: dict) -> float:
    """Done on time is full marks, done late keeps `late_credit`, not done is zero."""
    if run is None or run.status != RoutineRun.STATUS_DONE:
        return 0.0
    return 100.0 if not was_late(run) else round(float(cfg['late_credit']) * 100, 1)


def score_run(run: RoutineRun, cfg: dict | None = None) -> float | None:
    """This one run's contribution, or None when the kind is not scored."""
    cfg = cfg or retail_qa_settings()
    kind = run.routine.kind
    if kind == Routine.KIND_CHECKLIST:
        return checklist_score(run, cfg)
    if kind in (Routine.KIND_SECTION_TALLY, Routine.KIND_WORK_CYCLE):
        # Counting your own mess is a record, not a report card.
        return None
    responses = run.submission.responses if run.submission_id else {}
    if kind == Routine.KIND_SECTION_AUDIT:
        if run.status != RoutineRun.STATUS_DONE:
            return 0.0
        return audit_score(responses or {}, cfg)
    if run.status != RoutineRun.STATUS_DONE:
        return 0.0
    # The spot check is the two drawn checks and the section, weighted evenly.
    checks = [row for row in (responses.get('checks') or []) if row.get('result') in ('pass', 'fail')]
    parts = [100.0 if row['result'] == 'pass' else 0.0 for row in checks]
    parts.append(audit_score(responses.get('audit') or {}, cfg))
    return round(mean(parts), 1)


GRADED_KINDS = PERFORMED_KEYS + (SYSTEM_OWNER_SPOT,)


def _runs_by_day(days) -> dict[str, dict[str, RoutineRun]]:
    """Every run the grade reads, one query, keyed by period then system key."""
    rows = (
        RoutineRun.objects.filter(
            routine__system_key__in=GRADED_KINDS,
            period_key__in=[day.isoformat() for day in days],
        )
        .select_related('routine', 'submission', 'completed_by', 'section')
        .order_by('id')
    )
    found: dict[str, dict[str, RoutineRun]] = {}
    for run in rows:
        bucket = found.setdefault(run.period_key, {})
        key = run.routine.system_key
        # A done run beats an open one when a routine somehow has both.
        if key not in bucket or run.status == RoutineRun.STATUS_DONE:
            bucket[key] = run
    return found


def day_grade(day: date, cfg: dict | None = None) -> dict:
    """The day's letter and every part that made it."""
    cfg = cfg or retail_qa_settings()
    return _grade_day(day, _runs_by_day([day]).get(day.isoformat(), {}), cfg)


def day_grades(days, cfg: dict | None = None) -> list[dict]:
    """Grades for a whole window on two queries rather than two per day."""
    cfg = cfg or retail_qa_settings()
    found = _runs_by_day(days)
    return [_grade_day(day, found.get(day.isoformat(), {}), cfg) for day in days]


def _grade_day(day: date, found: dict[str, RoutineRun], cfg: dict) -> dict:
    runs = {key: run for key, run in found.items() if key in PERFORMED_KEYS}
    performed = {
        key: {
            'score': checklist_score(runs.get(key), cfg),
            'status': runs[key].status if key in runs else 'missing',
            'late': was_late(runs[key]) if key in runs else False,
            'completed_by_name': (
                runs[key].completed_by.full_name
                if key in runs and runs[key].completed_by_id else None
            ),
            'title': runs[key].routine.title if key in runs else key,
            'verify': (
                (runs[key].submission.responses or {}).get('verify')
                if key in runs and runs[key].submission_id else None
            ),
        }
        for key in PERFORMED_KEYS
    }
    p = round(mean(row['score'] for row in performed.values()), 1)

    spot = found.get(SYSTEM_OWNER_SPOT)
    # A spot check nobody opened is silence, not a zero. Only a finished one
    # gets a say, which is what lets the CEO skip a day without punishing anyone.
    o = score_run(spot, cfg) if spot and spot.status == RoutineRun.STATUS_DONE else None

    if o is None:
        score = p
    else:
        weight = float(cfg['owner_weight'])
        score = round(weight * o + (1 - weight) * p, 1)

    return {
        'date': day.isoformat(),
        'open_day': is_open_day(day),
        # Nothing was ever scheduled on this day, so there is nothing to grade.
        # Days before the program started should read blank, not F.
        'graded': bool(runs) or spot is not None,
        'score': score,
        'letter': letter_for(score, cfg),
        'performed': performed,
        'performed_score': p,
        'owner_score': o,
        'owner_run_id': spot.pk if spot else None,
        'owner_section': spot.section.name if spot and spot.section_id else None,
    }


def _tally_rows(days) -> dict:
    """Every daily tally in the window, folded into per-section category totals."""
    runs = (
        RoutineRun.objects.filter(
            routine__system_key=SYSTEM_TALLY,
            status=RoutineRun.STATUS_DONE,
            period_key__in=[d.isoformat() for d in days],
        )
        .select_related('submission')
    )
    totals: dict[int, dict] = {}
    for run in runs:
        if not run.submission_id:
            continue
        for row in (run.submission.responses or {}).get('sections') or []:
            bucket = totals.setdefault(row.get('section_id'), {
                'section_id': row.get('section_id'),
                'section_name': row.get('section_name') or '',
                'counts': {},
                'walks': 0,
            })
            bucket['walks'] += 1
            for key, value in rollup_counts(row.get('counts') or {}).items():
                if key in GRADED_KEYS or key in RECORDED_KEYS:
                    bucket['counts'][key] = bucket['counts'].get(key, 0) + int(value or 0)
    return totals


def _cross_checks(days, cfg) -> list[dict]:
    runs = (
        RoutineRun.objects.filter(
            routine__system_key=SYSTEM_CROSS_CHECK,
            period_key__in=[d.isoformat() for d in days],
        )
        .select_related('assigned_to', 'section', 'submission', 'routine')
        .order_by('period_key', 'id')
    )
    out = []
    for run in runs:
        responses = run.submission.responses if run.submission_id else {}
        done = run.status == RoutineRun.STATUS_DONE
        out.append({
            'run_id': run.pk,
            'date': run.period_key,
            'section_id': run.section_id,
            'section_name': run.section.name if run.section_id else run.subject,
            'auditor_name': run.assigned_to.full_name if run.assigned_to_id else None,
            'status': run.status,
            # An assigned audit that never happened is a zero, not an absence:
            # the section went a week without a second pair of eyes.
            'score': audit_score(responses or {}, cfg) if done else 0.0,
            'photo': (responses or {}).get('photo'),
            'items_inspected': (responses or {}).get('items_inspected') or 0,
            'counts': rollup_counts((responses or {}).get('counts') or {}),
            'flags': (responses or {}).get('flags') or [],
            'notes': (responses or {}).get('notes') or '',
        })
    return out


def _calibration(days, cross_checks, cfg) -> list[dict]:
    """Where the owner's own walk of a section disagrees with the week's audit.

    Never scored, always visible. A checker who logs zero in a category the
    owner then finds eight of is not cheating on the record, but the gap is
    the kind of thing that should be said in front of both of them.
    """
    spots = (
        RoutineRun.objects.filter(
            routine__system_key=SYSTEM_OWNER_SPOT,
            status=RoutineRun.STATUS_DONE,
            period_key__in=[d.isoformat() for d in days],
            section__isnull=False,
        )
        .select_related('section', 'submission', 'completed_by')
    )
    by_section = {row['section_id']: row for row in cross_checks if row['status'] == 'done'}
    out = []
    for spot in spots:
        checked = by_section.get(spot.section_id)
        if not checked or not spot.submission_id:
            continue
        audit = (spot.submission.responses or {}).get('audit') or {}
        gaps = []
        owner_counts = rollup_counts(audit.get('counts') or {})
        for key, label in GRADED:
            owner_found = int(owner_counts.get(key) or 0)
            checker_found = int((checked['counts'] or {}).get(key) or 0)
            if owner_found > 0 and checker_found == 0:
                gaps.append({'key': key, 'label': label, 'owner': owner_found, 'checker': 0})
        out.append({
            'section_id': spot.section_id,
            'section_name': spot.section.name,
            'owner_score': audit_score(audit, cfg),
            'checker_score': checked['score'],
            'checker_name': checked['auditor_name'],
            'gaps': gaps,
        })
    return out


def combine_week(day_scores, cross_scores, cfg: dict | None = None) -> tuple:
    """(score, letter, daily average, cross-check average) for one week's parts."""
    cfg = cfg or retail_qa_settings()
    daily_avg = round(mean(day_scores), 1) if day_scores else None
    cross_avg = round(mean(cross_scores), 1) if cross_scores else None
    weight = float(cfg['weekly_daily_weight'])
    if daily_avg is None:
        score = cross_avg
    elif cross_avg is None:
        # No Tuesday audit means no cross-check evidence, so the daily average
        # stands on its own rather than being diluted by a zero it did not earn.
        score = daily_avg
    else:
        score = round(weight * daily_avg + (1 - weight) * cross_avg, 1)
    return score, (letter_for(score, cfg) if score is not None else None), daily_avg, cross_avg


def cross_check_scores(monday: date, cfg: dict | None = None) -> list[float]:
    cfg = cfg or retail_qa_settings()
    return [row['score'] for row in _cross_checks(week_days(monday), cfg)]


def week_grade(monday: date, cfg: dict | None = None) -> dict:
    """The week: daily letters, the cross-check average, and how they combine."""
    cfg = cfg or retail_qa_settings()
    days = week_days(monday)
    daily = day_grades([day for day in days if is_open_day(day)], cfg)
    cross_checks = _cross_checks(days, cfg)
    score, letter, daily_avg, cross_avg = combine_week(
        [row['score'] for row in daily if row['graded']],
        [row['score'] for row in cross_checks],
        cfg,
    )

    return {
        'week': f'{monday.isocalendar().year}-W{monday.isocalendar().week:02d}',
        'monday': monday.isoformat(),
        'score': score,
        'letter': letter,
        'daily_average': daily_avg,
        'cross_check_average': cross_avg,
        'days': daily,
        'cross_checks': cross_checks,
        'tallies': list(_tally_rows(days).values()),
        'calibration': _calibration(days, cross_checks, cfg),
        'work_cycles': _work_cycles(days),
        'idle_prompts': _idle_prompts(days),
        'settings': cfg,
    }


def _work_cycles(days) -> list[dict]:
    """Submitted work-cycle walks for the week, one tile per day."""
    start, end = days[0], days[-1]
    rows = RoutineSubmission.objects.filter(
        routine__system_key=SYSTEM_WORK_CYCLE,
        status=RoutineSubmission.STATUS_SUBMITTED,
        submitted_at__isnull=False,
        submitted_at__date__gte=start,
        submitted_at__date__lte=end,
    ).values_list('submitted_at', 'responses')
    by_day = {
        day.isoformat(): {'date': day.isoformat(), 'shelf': 0, 'non_shelf': 0}
        for day in days
    }
    for submitted_at, responses in rows:
        local = timezone.localtime(submitted_at).date().isoformat()
        bucket = by_day.get(local)
        if not bucket:
            continue
        mode = (responses or {}).get('mode')
        if mode == 'shelf':
            bucket['shelf'] += 1
        elif mode == 'non_shelf':
            bucket['non_shelf'] += 1
    return [by_day[day.isoformat()] for day in days]


def _idle_prompts(days) -> list[dict]:
    """Every idle prompt shown this week, dismissed or started."""
    start, end = days[0], days[-1]
    rows = (
        WorkCyclePrompt.objects.filter(
            shown_at__date__gte=start,
            shown_at__date__lte=end,
        )
        .select_related('user')
        .order_by('-shown_at')
    )
    return [
        {
            'user_name': row.user.full_name if row.user_id else None,
            'shown_at': row.shown_at,
            'idle_minutes': round(row.idle_seconds / 60, 1),
            'outcome': row.outcome,
        }
        for row in rows
    ]


def parse_week(raw: str | None) -> date:
    """`YYYY-Www` to that week's Monday. Anything unparsable means this week."""
    local, _cfg, _tz = _local_now()
    today = local.date()
    if raw:
        try:
            year, week = raw.split('-W')
            return date.fromisocalendar(int(year), int(week), 1)
        except (ValueError, TypeError):
            pass
    return today - timedelta(days=today.weekday())


def missing_owners(day: date | None = None) -> list[dict]:
    """Section tallies still open today, so somebody can cover them."""
    day = day or timezone.localtime().date()
    runs = (
        RoutineRun.objects.filter(
            routine__system_key=SYSTEM_TALLY,
            period_key=day.isoformat(),
            status=RoutineRun.STATUS_OPEN,
        )
        .select_related('assigned_to')
        .order_by('assigned_to__last_name')
    )
    return [
        {
            'run_id': run.pk,
            'owner_name': run.assigned_to.full_name if run.assigned_to_id else 'Unassigned',
            'sections': run.subject,
        }
        for run in runs
    ]
