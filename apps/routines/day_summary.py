"""Staff-readable Retail day/week aggregates. No names, no per-person rows."""
from __future__ import annotations

from datetime import date

from django.utils import timezone

from apps.pos.models import DashboardDepartmentGoal
from apps.pos.services.dashboard_metrics import letter_meets, retail_goal_letter
from apps.webstore.services.hours import is_open_day

from .grading import PERFORMED_KEYS, this_monday, week_grade, week_label
from .schedule import SYSTEM_TALLY, cross_check_day_for
from .settings import WALK_FLOOR, retail_qa_settings


class DaySummaryError(ValueError):
    pass


def parse_week_strict(raw: str) -> date:
    try:
        year, week = raw.split('-W')
        return date.fromisocalendar(int(year), int(week), 1)
    except (ValueError, TypeError) as exc:
        raise DaySummaryError('invalid week') from exc


def _goal_letter() -> str | None:
    row = DashboardDepartmentGoal.objects.filter(
        department=DashboardDepartmentGoal.RETAIL,
    ).only('value').first()
    return retail_goal_letter(row.value if row else None)


def _walks_done(day_row: dict | None) -> int:
    spots = ((day_row or {}).get('owner') or {}).get('spots') or []
    return sum(
        1
        for row in spots
        if row.get('status') != 'projected' and row.get('spot_score') is not None
    )


def _doing_parts(day_row: dict | None) -> tuple[dict[str, int], dict[str, int]]:
    routines = ((day_row or {}).get('doing') or {}).get('routines') or []
    section_done = section_expected = odc_done = odc_expected = 0
    for row in routines:
        finished = row.get('status') in ('done', 'late')
        key = row.get('key')
        if key in PERFORMED_KEYS:
            odc_expected += 1
            if finished:
                odc_done += 1
        elif key == SYSTEM_TALLY:
            section_expected += 1
            if finished:
                section_done += 1
    return (
        {'done': section_done, 'expected': section_expected},
        {'done': odc_done, 'expected': odc_expected},
    )


def _cross_counts(week: dict) -> tuple[int, int]:
    audits = [
        row
        for row in (week.get('cross_checks') or [])
        if row.get('status') != 'projected'
    ]
    done = sum(1 for row in audits if row.get('status') == 'done')
    return done, len(audits)


def _spot_state(*, day: date, today: date, walks: int) -> str:
    """not_yet is only for today. A past open day with no walk is none."""
    if walks > 0:
        return 'done'
    if day == today:
        return 'not_yet'
    return 'none'


def _grade_scale() -> dict[str, int]:
    cfg = retail_qa_settings()
    return {
        'a': int(cfg['grade_a']),
        'b': int(cfg['grade_b']),
        'c': int(cfg['grade_c']),
        'd': int(cfg['grade_d']),
    }


def _closed_payload(day: date, goal: str | None) -> dict:
    return {
        'date': day.isoformat(),
        'open': False,
        'letter': None,
        'score': None,
        'goal_letter': goal,
        'goal_met': False,
        'grade_scale': _grade_scale(),
        'weights': {},
        'excluded': [],
        'do': None,
        'spot': None,
        'cross': None,
        'cross_info': None,
    }


def day_summary_for_date(day: date, *, today: date | None = None) -> dict:
    today = today or timezone.localdate()
    if day > today:
        raise DaySummaryError('date is in the future')
    goal = _goal_letter()
    if not is_open_day(day):
        return _closed_payload(day, goal)

    week = week_grade(this_monday(day))
    day_row = next(
        (row for row in (week.get('days') or []) if row.get('date') == day.isoformat()),
        None,
    )
    letter = None if day_row is None else day_row.get('letter')
    score = None if day_row is None else day_row.get('score')
    doing = (day_row or {}).get('doing') or {}
    section_checks, open_day_close = _doing_parts(day_row)
    walks = _walks_done(day_row)
    cfg = retail_qa_settings()
    min_walks = int(cfg.get('walk_floor', WALK_FLOOR))
    due = cross_check_day_for(day)
    cross_done, cross_due = _cross_counts(week)
    day_audits = ((day_row or {}).get('cross') or {}).get('audits') or []
    done_on_this_day = sum(1 for row in day_audits if row.get('status') == 'done')
    if due and day < due:
        cross_state = 'pending'
    elif cross_due and cross_done >= cross_due:
        cross_state = 'done'
    else:
        cross_state = 'live'
    return {
        'date': day.isoformat(),
        'open': True,
        'letter': letter,
        'score': score,
        'goal_letter': goal,
        'goal_met': letter_meets(letter, goal),
        'grade_scale': _grade_scale(),
        'weights': (day_row or {}).get('weights') or {},
        'excluded': (day_row or {}).get('excluded') or [],
        'do': {
            'score': doing.get('score'),
            'section_checks': section_checks,
            'open_day_close': open_day_close,
        },
        'spot': {
            'score': ((day_row or {}).get('owner') or {}).get('score'),
            'walks': {'done': walks, 'min_for_week': min_walks},
            'state': _spot_state(day=day, today=today, walks=walks),
        },
        'cross_info': {
            'done': cross_done,
            'due': cross_due,
            'due_date': due.isoformat() if due else None,
            'state': cross_state,
            'done_on_this_day': done_on_this_day,
        },
    }


def week_summary_for_staff(monday: date, *, today: date | None = None) -> dict:
    today = today or timezone.localdate()
    current = this_monday(today)
    if monday > current:
        raise DaySummaryError('week is in the future')
    goal = _goal_letter()
    week = week_grade(monday)
    cfg = retail_qa_settings()
    min_walks = int(cfg.get('walk_floor', WALK_FLOOR))
    section = {'done': 0, 'expected': 0}
    odc = {'done': 0, 'expected': 0}
    walks = 0
    for row in week.get('days') or []:
        try:
            day = date.fromisoformat(row['date'])
        except (KeyError, ValueError):
            continue
        if day > today or not row.get('open_day'):
            continue
        sc, od = _doing_parts(row)
        section['done'] += sc['done']
        section['expected'] += sc['expected']
        odc['done'] += od['done']
        odc['expected'] += od['expected']
        walks += _walks_done(row)
    due = cross_check_day_for(monday)
    cross_done, cross_due = _cross_counts(week)
    thirds = week.get('thirds') or {}
    letter = week.get('letter')
    spot_state = 'done' if walks else ('not_yet' if monday == current else 'none')
    return {
        'week': week_label(monday),
        'open': True,
        'letter': letter,
        'score': week.get('score'),
        'goal_letter': goal,
        'goal_met': letter_meets(letter, goal),
        'grade_scale': _grade_scale(),
        'weights': week.get('weights') or {},
        'excluded': week.get('excluded') or [],
        'do': {
            'score': thirds.get('doing'),
            'section_checks': section,
            'open_day_close': odc,
        },
        'spot': {
            'score': thirds.get('owner'),
            'walks': {'done': walks, 'min_for_week': min_walks},
            'state': spot_state,
        },
        'cross': {
            'score': thirds.get('cross'),
            'done': cross_done,
            'due': cross_due,
            'due_date': due.isoformat() if due else None,
            'state': 'pending' if due and today < due else 'live',
        },
    }
