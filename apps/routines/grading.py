"""Three-thirds Retail QA: Doing / Cross / Owner.

A day and a week use the same formula. Past weeks freeze the settings and
baselines they were scored under. The current week is always live.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any

from django.utils import timezone

from apps.webstore.services.hours import _local_now, is_open_day

from .baseline import log10_tail_score, section_baseline, store_baseline, tail_probs
from .models import (
    CheckerFlag,
    QaDayExpected,
    Routine,
    RoutineRun,
    RoutineSubmission,
    Section,
    SectionAssignmentEvent,
    SectionBaselineSnapshot,
    SectionObservation,
    WeekScoreSnapshot,
    WorkCyclePrompt,
)
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
from .settings import (
    WEIGHT_CROSS,
    WEIGHT_DO,
    WEIGHT_SPOT,
    WALK_FLOOR,
    letter_for,
    open_hours_for,
    retail_qa_settings,
    score_ladder,
    settings_snapshot,
    severity_map,
)
from .taxonomy import GRADED_GROUP_KEYS, SAFETY_FLAG, rollup_counts

PERFORMED_KEYS = (SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE)
PUNCH_FOR_KEY = {
    SYSTEM_OPEN: 'retail_open',
    SYSTEM_DAY: 'retail_day',
    SYSTEM_CLOSE: 'retail_close',
}
PERFORMED_TITLES = {
    SYSTEM_OPEN: 'Retail open',
    SYSTEM_DAY: 'Retail day',
    SYSTEM_CLOSE: 'Retail close',
}


def _weights(cfg: dict | None = None) -> tuple[float, float, float]:
    cfg = cfg or retail_qa_settings()
    return (
        float(cfg.get('weight_spot', WEIGHT_SPOT)),
        float(cfg.get('weight_do', WEIGHT_DO)),
        float(cfg.get('weight_cross', WEIGHT_CROSS)),
    )


def combine_weighted(
    components: list[tuple[str, float, float | None]],
) -> dict[str, Any]:
    """Drop excluded components (score is None) and scale the rest to 100.

    Returns score, effective weights for every submitted key, and excluded keys.
    When every component is present and the nominal weights already sum to 100,
    those weights are left unchanged.
    """
    keys = [key for key, _weight, _score in components]
    weights = {key: 0.0 for key in keys}
    included = [
        (key, float(weight), float(score))
        for key, weight, score in components
        if score is not None
    ]
    excluded = [key for key, _weight, score in components if score is None]
    if not included:
        return {'score': None, 'weights': weights, 'excluded': excluded}
    total = sum(weight for _key, weight, _score in included)
    if total <= 0:
        return {'score': None, 'weights': weights, 'excluded': excluded}
    all_present = len(included) == len(components)
    if all_present and abs(total - 100.0) < 1e-9:
        for key, weight, _score in included:
            weights[key] = weight
        score = sum(weight * score for _key, weight, score in included) / 100.0
        return {'score': round(score, 1), 'weights': weights, 'excluded': excluded}
    acc = 0.0
    last = len(included) - 1
    for index, (key, weight, _score) in enumerate(included):
        if index == last:
            scaled = round(100.0 - acc, 2)
        else:
            scaled = round(weight / total * 100.0, 2)
            acc += scaled
        weights[key] = scaled
    score = sum(weights[key] * score for key, _weight, score in included) / 100.0
    return {'score': round(score, 1), 'weights': weights, 'excluded': excluded}


def _renormalize(parts: list[tuple[float, float]]) -> float | None:
    """Weighted parts renormalized to 100. parts are (weight, score)."""
    present = [(weight, score) for weight, score in parts if score is not None]
    if not present:
        return None
    total_w = sum(weight for weight, _ in present)
    if total_w <= 0:
        return None
    return round(sum(weight * score for weight, score in present) / total_w, 1)


def section_checks_required(day: date, cfg: dict | None = None) -> bool:
    """True when retail_qa.section_check_weekdays is on for this weekday."""
    from .settings import SECTION_CHECK_WEEKDAYS

    flags = (cfg or retail_qa_settings()).get('section_check_weekdays') or SECTION_CHECK_WEEKDAYS
    if not isinstance(flags, list) or len(flags) < 7:
        flags = SECTION_CHECK_WEEKDAYS
    return bool(flags[day.weekday()])


def expected_parts(day: date) -> tuple[set[str], set[int]]:
    """Open/Day/Close on open store days; section checks keep their weekday flags."""
    keys = set(PERFORMED_KEYS) if is_open_day(day) else set()
    sections = {section.pk for section in _active_sections()} if section_checks_required(day) else set()
    return keys, sections


def compute_expected(day: date) -> int:
    keys, sections = expected_parts(day)
    return len(keys) + len(sections)


def expected_for_day(day: date) -> int:
    row = QaDayExpected.objects.filter(date=day).first()
    if row:
        return row.expected
    n = compute_expected(day)
    if day <= timezone.localdate():
        QaDayExpected.objects.get_or_create(date=day, defaults={'expected': n})
    return n


ALL_GRADED_KEYS = PERFORMED_KEYS + (SYSTEM_TALLY, SYSTEM_CROSS_CHECK, SYSTEM_OWNER_SPOT)


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


def this_monday(day: date | None = None) -> date:
    day = day or timezone.localtime().date()
    return day - timedelta(days=day.weekday())


def week_label(monday: date) -> str:
    iso = monday.isocalendar()
    return f'{iso.year}-W{iso.week:02d}'


def closed_section_ids(day: date) -> set[int]:
    closed: set[int] = set()
    rows = SectionAssignmentEvent.objects.filter(
        for_date=day,
        kind__in=(SectionAssignmentEvent.KIND_CLOSED_FOR_DAY, SectionAssignmentEvent.KIND_REOPENED),
    ).order_by('at', 'id')
    for row in rows:
        if row.kind == SectionAssignmentEvent.KIND_CLOSED_FOR_DAY:
            closed.add(row.section_id)
        else:
            closed.discard(row.section_id)
    return closed


def _active_sections():
    return list(Section.objects.filter(is_active=True).select_related('owner').order_by('sort_order', 'name'))


def _runs_for(days, keys=ALL_GRADED_KEYS):
    return list(
        RoutineRun.objects.filter(
            routine__system_key__in=keys,
            period_key__in=[day.isoformat() for day in days],
        ).select_related('routine', 'submission', 'completed_by', 'assigned_to', 'section')
        .order_by('id')
    )


def _by_day(runs: list[RoutineRun]) -> dict[str, list[RoutineRun]]:
    found: dict[str, list[RoutineRun]] = {}
    for run in runs:
        found.setdefault(run.period_key, []).append(run)
    return found


def _person(user) -> dict | None:
    if user is None:
        return None
    return {'id': user.pk, 'name': user.full_name}


def _seconds_taken(run: RoutineRun) -> float | None:
    submission = run.submission
    if not submission or not submission.started_at or not submission.submitted_at:
        return None
    return round((submission.submitted_at - submission.started_at).total_seconds(), 1)


def _run_status(run: RoutineRun | None) -> str:
    if run is None:
        return 'not_assigned'
    if run.status == RoutineRun.STATUS_DONE:
        return 'late' if was_late(run) else 'done'
    if run.status == RoutineRun.STATUS_MISSED:
        return 'missed'
    if run.submission_id:
        return 'in_progress'
    return 'not_started'


def _verify_fails(run: RoutineRun | None) -> int | None:
    """Fails found on verify, or None when verify does not apply or was not done.

    None means omit (no verify on this routine) or not performed (scores 0
    only when the routine actually has a verify block).
    """
    if run is None or not run.routine.verifies_id:
        return None
    if run.status != RoutineRun.STATUS_DONE or not run.submission_id:
        return None
    verify = (run.submission.responses or {}).get('verify')
    if not isinstance(verify, dict):
        return None
    checks = [row for row in (verify.get('checks') or []) if isinstance(row, dict)]
    if not checks:
        return None
    return sum(1 for row in checks if row.get('result') == 'fail')


def verify_score(fails: int | None, cfg: dict) -> float:
    if fails is None:
        return 0.0
    return score_ladder(fails, cfg.get('verify_ladder') or [])


def _found_total(counts: dict | None) -> int:
    rolled = rollup_counts(counts or {})
    return sum(int(rolled.get(key) or 0) for key in GRADED_GROUP_KEYS)


def residual_parts(
    *,
    found: int,
    mean: float,
    hours_since_tally: float | None,
    open_hours: float,
    cfg: dict,
    severity_adds: float = 0.0,
    safety: bool = False,
) -> dict:
    open_hours = max(float(open_hours or 0.0), 0.0)
    hours = max(float(hours_since_tally or 0.0), 0.0)
    expected_new = float(mean) * (hours / open_hours) if open_hours else 0.0
    grace = float(cfg.get('owner_grace', 1))
    excess = max(0.0, found - expected_new - grace)
    denom = max(float(mean), float(cfg.get('owner_divisor_floor', 2)))
    residual = (excess / denom) + max(severity_adds, 0.0)
    count_score = score_ladder(residual, cfg.get('owner_ladder') or [])
    return {
        'found': found,
        'expected_new': round(expected_new, 3),
        'excess': round(excess, 3),
        'R': round(residual, 4),
        'count_score': count_score,
        'safety': safety,
    }


def residual_from_observation(spot: SectionObservation, cfg: dict) -> dict | None:
    if spot.kind != SectionObservation.KIND_SPOT:
        return None
    day = timezone.localtime(spot.observed_at).date()
    base = section_baseline(spot.section_id, cfg, as_of=spot.observed_at)
    return residual_parts(
        found=spot.total,
        mean=base['mean'],
        hours_since_tally=spot.hours_since_tally,
        open_hours=open_hours_for(day),
        cfg=cfg,
        safety=spot.safety,
    )


def _check_score(checks: list[dict], cfg: dict) -> tuple[float, float]:
    groups = severity_map(cfg)
    weight_total = 0.0
    passed = 0.0
    r_add = 0.0
    for row in checks or []:
        result = str(row.get('result') or '')
        if result not in ('pass', 'fail'):
            continue
        key = str(row.get('severity') or row.get('severity_key') or 'standard')
        group = groups.get(key) or groups['standard']
        weight_total += group['weight']
        if result == 'pass':
            passed += group['weight']
        else:
            r_add += group['r_add']
    if weight_total <= 0:
        return 100.0, r_add
    return 100.0 * passed / weight_total, r_add


def score_spot(run: RoutineRun, cfg: dict, base: dict | None = None) -> dict | None:
    if run is None or run.status != RoutineRun.STATUS_DONE or not run.submission_id:
        return None
    responses = run.submission.responses or {}
    audit = responses.get('audit') if isinstance(responses.get('audit'), dict) else {}
    day = date.fromisoformat(run.period_key) if len(run.period_key) == 10 else timezone.localdate()
    if base is None and run.section_id:
        base = section_baseline(run.section_id, cfg, as_of=run.completed_at)
    mean = float((base or {}).get('mean') or 0.0)
    generated = run.generated or {}
    hours = generated.get('hours_since_tally')
    try:
        hours = float(hours) if hours is not None else None
    except (TypeError, ValueError):
        hours = None
    checks = responses.get('checks') or generated.get('checks') or []
    check_score, r_add = _check_score(checks, cfg)
    safety = SAFETY_FLAG in (audit.get('flags') or [])
    parts = residual_parts(
        found=_found_total(audit.get('counts')),
        mean=mean,
        hours_since_tally=hours,
        open_hours=open_hours_for(day),
        cfg=cfg,
        severity_adds=r_add,
        safety=safety,
    )
    spot = (parts['count_score'] + check_score) / 2.0
    cap = float(cfg.get('safety_cap', 50))
    if safety:
        spot = min(spot, cap)
    explanation = (
        f"Normal {mean:.1f}/day, tallied "
        f"{generated.get('tallied_at') or 'earlier'}, spot "
        f"{timezone.localtime(run.completed_at).strftime('%I:%M%p').lstrip('0') if run.completed_at else 'now'}, "
        f"expected ~{parts['expected_new']:.1f} new, found {parts['found']}, "
        f"R = {parts['R']:.2f} → {parts['count_score']:.0f}"
    )
    attributed = None
    tally_run_id = generated.get('tally_run_id')
    if tally_run_id:
        tally = RoutineRun.objects.filter(pk=tally_run_id).select_related('completed_by').first()
        if tally and tally.completed_by_id:
            attributed = _person(tally.completed_by)
    return {
        **parts,
        'check_score': round(check_score, 1),
        'spot_score': round(spot, 1),
        'mean': round(mean, 3),
        'warm': bool((base or {}).get('warm')),
        'explanation': explanation,
        'attributed_to': attributed,
        'run_id': run.pk,
        'section_id': run.section_id,
        'section_name': run.section.name if run.section_id else run.subject,
        'checks': [
            {
                'label': row.get('label') or '',
                'result': row.get('result') or '',
                'severity': row.get('severity') or 'standard',
            }
            for row in checks
        ],
        'safety': safety,
        'hours_since_tally': hours,
        'tallied_by': generated.get('tallied_by'),
        'tallied_at': generated.get('tallied_at'),
        'note': audit.get('notes') or '',
        'photo': audit.get('photo'),
        'completed_at': run.completed_at,
        'completed_by': _person(run.completed_by),
    }


def score_cross_check(run: RoutineRun, cfg: dict, base: dict | None = None) -> dict:
    done = run.status == RoutineRun.STATUS_DONE
    responses = run.submission.responses if run.submission_id else {}
    found = _found_total((responses or {}).get('counts'))
    if base is None and run.section_id:
        base = section_baseline(run.section_id, cfg, as_of=run.completed_at or timezone.now())
    base = base or {'mean': 0.0, 'var': 0.0, 'warm': True, 'family': 'poisson', 'r': 0, 'p': 0, 'lam': 0}
    warm = bool(base.get('warm'))
    if not done:
        score = 0.0
        tails = {'tail': None, 'p_low': None, 'p_high': None}
    elif warm:
        score = 100.0
        tails = {'tail': 1.0, 'p_low': 1.0, 'p_high': 1.0}
    else:
        tails = tail_probs(found, base)
        score = log10_tail_score(
            tails['tail'],
            float(cfg['cross_full_tail']),
            float(cfg['cross_zero_tail']),
        )
    obs = None
    if run.submission_id:
        obs = SectionObservation.objects.filter(
            submission_id=run.submission_id, kind=SectionObservation.KIND_AUDIT,
        ).first()
    return {
        'run_id': run.pk,
        'date': run.period_key,
        'section_id': run.section_id,
        'section_name': run.section.name if run.section_id else run.subject,
        'checker': _person(run.assigned_to) or _person(run.completed_by),
        'section_owner': _person(run.section.owner) if run.section_id and run.section.owner_id else None,
        'found': found,
        'section_mean': round(float(base.get('mean') or 0), 3),
        'tail': None if tails['tail'] is None else round(tails['tail'], 4),
        'score': round(score, 1),
        'status': run.status,
        'seconds_taken': _seconds_taken(run),
        'in_baseline': True if obs is None else obs.in_baseline,
        'excluded_reason': '' if obs is None else obs.excluded_reason,
        'photo': (responses or {}).get('photo'),
        'items_inspected': (responses or {}).get('items_inspected') or 0,
        'counts': rollup_counts((responses or {}).get('counts') or {}),
        'flags': (responses or {}).get('flags') or [],
        'notes': (responses or {}).get('notes') or '',
        'warm': warm,
    }


def _doing_for_day(day: date, runs: list[RoutineRun], *, project: bool = False) -> dict:
    sections = _active_sections()
    closed = closed_section_ids(day)
    checklists = {key: None for key in PERFORMED_KEYS}
    tallied: set[int] = set()
    for run in runs:
        key = run.routine.system_key
        if key in PERFORMED_KEYS:
            if checklists[key] is None or run.status == RoutineRun.STATUS_DONE:
                checklists[key] = run
        if run.status != RoutineRun.STATUS_DONE:
            continue
        if key == SYSTEM_TALLY:
            responses = run.submission.responses if run.submission_id else {}
            for row in (responses or {}).get('sections') or []:
                if row.get('section_id'):
                    tallied.add(int(row['section_id']))
        if key == SYSTEM_CROSS_CHECK and run.section_id:
            tallied.add(run.section_id)

    expected_keys, expected_sections = expected_parts(day)
    routines = []
    done = 0
    for key in PERFORMED_KEYS:
        if key not in expected_keys:
            continue
        run = checklists[key]
        status = _run_status(run)
        finished = status in ('done', 'late') or (project and status not in ('missed',))
        if finished:
            done += 1
            status = 'done' if project and status not in ('done', 'late') else status
        title = (run.routine.title if run and run.routine.title and '.' not in run.routine.title else PERFORMED_TITLES[key])
        routines.append({
            'key': key,
            'title': title,
            'run_id': run.pk if run else None,
            'status': status,
            'late': was_late(run) if run else False,
            'assigned_to': _person(run.assigned_to) if run else None,
            'completed_by': _person(run.completed_by) if run else None,
            'completed_at': run.completed_at if run else None,
        })

    needed_sections = [
        section for section in sections
        if section.pk not in closed and section.pk in expected_sections
    ]
    for section in needed_sections:
        is_done = section.pk in tallied
        if (is_done or project) and section.pk in expected_sections:
            done += 1
        routines.append({
            'key': SYSTEM_TALLY,
            'title': section.name,
            'section_id': section.pk,
            'status': 'done' if is_done or project else 'not_started',
            'run_id': None,
        })
    needed = expected_for_day(day)
    if project:
        done = needed
    score = 100.0 if needed == 0 else 100.0 * min(done, needed) / needed
    return {
        'done': done,
        'needed': needed,
        'score': round(score, 1),
        'routines': routines,
    }


def _cross_for_day(day: date, runs: list[RoutineRun], cfg: dict, bases: dict, *, project: bool = False) -> dict:
    verifies = []
    for key in PERFORMED_KEYS:
        run = next((row for row in runs if row.routine.system_key == key), None)
        applicable = bool(run and run.routine.verifies_id)
        if not applicable:
            continue
        fails = _verify_fails(run)
        performed = fails is not None
        if project and not performed:
            score = 100.0
            status = 'projected'
        elif not performed:
            # Done with no verify answers means nothing to confirm (first
            # shift of the week, or an older submission). Omit it so Cross
            # can stay N/A. An unfinished checklist still scores 0.
            if run.status == RoutineRun.STATUS_DONE:
                continue
            score = 0.0
            status = _run_status(run)
        else:
            score = verify_score(fails, cfg)
            status = _run_status(run)
        verifies.append({
            'key': key,
            'title': run.routine.title if run else key,
            'run_id': run.pk if run else None,
            'fails': fails,
            'score': score,
            'status': status,
            'items': [
                {
                    'label': row.get('label') or '',
                    'result': row.get('result') or '',
                    'photo_required': bool(row.get('photo_required')),
                }
                for row in (((run.submission.responses or {}).get('verify') or {}).get('checks') or [])
            ] if run and run.submission_id else [],
        })
    verify_avg = mean(row['score'] for row in verifies) if verifies else None

    audits = []
    for run in runs:
        if run.routine.system_key != SYSTEM_CROSS_CHECK:
            continue
        if project and run.status != RoutineRun.STATUS_DONE:
            audits.append({
                'run_id': run.pk,
                'section_id': run.section_id,
                'section_name': run.section.name if run.section_id else run.subject,
                'score': 100.0,
                'status': 'projected',
                'found': 0,
                'section_mean': 0,
                'tail': None,
                'seconds_taken': None,
                'in_baseline': True,
                'excluded_reason': '',
            })
            continue
        base = bases.get(run.section_id) if run.section_id else None
        audits.append(score_cross_check(run, cfg, base))
    audit_avg = mean(row['score'] for row in audits) if audits else None
    if audit_avg is None:
        score = verify_avg if verify_avg is not None else None
    elif verify_avg is None:
        score = audit_avg
    else:
        score = (verify_avg + audit_avg) / 2.0
    return {
        'score': None if score is None else round(score, 1),
        'verify': verifies,
        'verify_score': None if verify_avg is None else round(verify_avg, 1),
        'audits': audits,
        'audit_score': None if audit_avg is None else round(audit_avg, 1),
    }


def _owner_for_day(day: date, runs: list[RoutineRun], cfg: dict, bases: dict, *, project: bool = False) -> dict:
    spots = [run for run in runs if run.routine.system_key == SYSTEM_OWNER_SPOT]
    scored = []
    for run in spots:
        if run.status == RoutineRun.STATUS_DONE:
            base = bases.get(run.section_id) if run.section_id else None
            row = score_spot(run, cfg, base)
            if row:
                scored.append(row)
        elif project:
            scored.append({
                'run_id': run.pk,
                'spot_score': 100.0,
                'status': 'projected',
                'section_id': run.section_id,
                'section_name': run.subject,
            })
    if scored:
        score = round(mean(row.get('spot_score', 100) for row in scored), 1)
    else:
        score = None
    return {
        'score': score,
        'spots': scored,
        'pending': any(run.status == RoutineRun.STATUS_OPEN for run in spots),
    }


def _bases_for(sections, cfg: dict, as_of: datetime, snapshots: dict[int, SectionBaselineSnapshot] | None):
    out = {}
    store = store_baseline(cfg, as_of=as_of)
    for section in sections:
        snap = (snapshots or {}).get(section.pk)
        if snap:
            out[section.pk] = {
                'n': snap.n,
                'mean': snap.mean,
                'var': snap.var,
                'warm': snap.warm,
                'store_mean': snap.store_mean,
                'store_var': snap.store_var,
                'family': 'poisson' if snap.var <= snap.mean + 1e-12 else 'nb',
                'r': 0,
                'p': 0,
                'lam': snap.mean,
            }
        else:
            out[section.pk] = section_baseline(section.pk, cfg, as_of=as_of)
            out[section.pk]['store_mean'] = store['mean']
            out[section.pk]['store_var'] = store['var']
    return out


def _freeze_baselines(monday: date, cfg: dict, as_of: datetime) -> dict[int, dict]:
    sections = _active_sections()
    bases = _bases_for(sections, cfg, as_of, None)
    store = store_baseline(cfg, as_of=as_of)
    for section in sections:
        base = bases[section.pk]
        SectionBaselineSnapshot.objects.update_or_create(
            section=section,
            week_monday=monday,
            defaults={
                'n': base.get('n') or 0,
                'mean': base.get('mean') or 0,
                'var': base.get('var') or 0,
                'warm': bool(base.get('warm')),
                'store_mean': store.get('mean') or 0,
                'store_var': store.get('var') or 0,
            },
        )
    return bases


def _load_baselines(monday: date, cfg: dict, as_of: datetime, *, freeze: bool) -> dict[int, dict]:
    rows = {
        row.section_id: row
        for row in SectionBaselineSnapshot.objects.filter(week_monday=monday)
    }
    if rows:
        return _bases_for(_active_sections(), cfg, as_of, rows)
    if freeze:
        return _freeze_baselines(monday, cfg, as_of)
    return _bases_for(_active_sections(), cfg, as_of, None)


def _mean_or_none(values):
    present = [value for value in values if value is not None]
    return None if not present else round(mean(present), 1)


def _blend_weights(
    doing: float | None,
    cross: float | None,
    owner: float | None,
    cfg: dict | None = None,
    *,
    include_cross: bool = True,
) -> tuple[float | None, str | None]:
    spot_w, do_w, cross_w = _weights(cfg)
    parts: list[tuple[float, float]] = []
    if owner is not None:
        parts.append((spot_w, owner))
    if doing is not None:
        parts.append((do_w, doing))
    if include_cross and cross is not None:
        parts.append((cross_w, cross))
    score = _renormalize(parts)
    return score, (letter_for(score, cfg) if score is not None else None)


def grade_day(day: date, ctx: dict | None = None, *, project: bool = False) -> dict:
    ctx = ctx or _week_context(this_monday(day))
    cfg = ctx['cfg']
    runs = ctx['by_day'].get(day.isoformat(), [])
    open_day = is_open_day(day)
    doing = _doing_for_day(day, runs, project=project)
    cross = _cross_for_day(day, runs, cfg, ctx['bases'], project=project)
    owner = _owner_for_day(day, runs, cfg, ctx['bases'], project=project)
    spot_w, do_w, _cross_w = _weights(cfg)
    blended = combine_weighted([
        ('spot', spot_w, owner['score']),
        ('do', do_w, doing['score']),
    ])
    score = blended['score']
    letter = letter_for(score, cfg) if score is not None else None
    checklists = {row['key']: row for row in doing['routines'] if row['key'] in PERFORMED_KEYS}
    spot = owner['spots'][0] if owner['spots'] else None
    graded = bool(runs)
    return {
        'date': day.isoformat(),
        'open_day': open_day,
        'graded': graded,
        'score': score if graded else None,
        'letter': letter if graded else None,
        'weights': blended['weights'],
        'excluded': blended['excluded'],
        'thirds': {
            'doing': doing['score'],
            'cross': cross['score'],
            'owner': owner['score'],
        },
        'doing': doing,
        'cross': cross,
        'owner': owner,
        'performed': {
            key: {
                'score': 100.0 if checklists.get(key, {}).get('status') in ('done', 'late') else 0.0,
                'status': checklists.get(key, {}).get('status') or 'missing',
                'late': checklists.get(key, {}).get('late') or False,
                'completed_by_name': (checklists.get(key) or {}).get('completed_by', {}) and (checklists[key]['completed_by'] or {}).get('name'),
                'title': (checklists.get(key) or {}).get('title') or key,
                'verify': None,
            }
            for key in PERFORMED_KEYS
        },
        'performed_score': doing['score'],
        'owner_score': None if not owner['spots'] else owner['score'],
        'owner_run_id': spot.get('run_id') if spot else None,
        'owner_section': spot.get('section_name') if spot else None,
    }


def day_grade(day: date, cfg: dict | None = None) -> dict:
    monday = this_monday(day)
    ctx = _week_context(monday, cfg=cfg)
    return grade_day(day, ctx)


def day_grades(days, cfg: dict | None = None) -> list[dict]:
    days = list(days)
    if not days:
        return []
    monday = this_monday(days[0])
    ctx = _week_context(monday, cfg=cfg, extra_days=days)
    return [grade_day(day, ctx) for day in days]


def section_owner_ids() -> set[int]:
    return {
        section.owner_id
        for section in _active_sections()
        if section.owner_id
    }


def section_owner_people(people: list[dict]) -> list[dict]:
    """Section-check dialog rows: owners only, Done taken from the same dots."""
    owners = section_owner_ids()
    return [row for row in people if row.get('id') in owners]


def section_check_done_parts(days: list[str]) -> dict:
    """Green / expected-through-today / still-due, matching the dialog dots."""
    done = sum(1 for status in days if status == 'done')
    missed = sum(1 for status in days if status == 'missed')
    due_today = sum(1 for status in days if status == 'due')
    return {
        'done': done,
        'assigned': done + missed,
        'due_today': due_today,
        'missed': missed,
    }


def section_check_done_label(done: int, assigned: int, due_today: int = 0) -> str:
    text = f'{done} of {assigned}'
    if due_today:
        text += f' · {due_today} due today'
    return text


def _owned_section_ids() -> dict[int, set[int]]:
    owned: dict[int, set[int]] = {}
    for section in _active_sections():
        if not section.owner_id:
            continue
        owned.setdefault(section.owner_id, set()).add(section.pk)
    return owned


def _people_for_week(monday: date, days: list[dict], runs: list[RoutineRun]) -> list[dict]:
    by_user: dict[int, dict] = {}
    owned = _owned_section_ids()

    def bucket(user_id, name):
        return by_user.setdefault(user_id, {
            'id': user_id,
            'name': name,
            'assigned': 0,
            'done': 0,
            'late': 0,
            'missed': 0,
            'due_today': 0,
            'verify_scores': [],
            'cross_scores': [],
            'spot_scores': [],
            'open_flags': 0,
        })

    for section in _active_sections():
        if section.owner_id and section.owner:
            bucket(section.owner_id, section.owner.full_name)

    for run in runs:
        person = run.assigned_to or run.completed_by
        if person is None:
            continue
        row = bucket(person.pk, person.full_name)
        row['assigned'] += 1
        status = _run_status(run)
        if status == 'done':
            row['done'] += 1
        elif status == 'late':
            row['done'] += 1
            row['late'] += 1
        elif status == 'missed':
            row['missed'] += 1
        if run.routine.system_key in PERFORMED_KEYS:
            fails = _verify_fails(run)
            if fails is not None:
                row['verify_scores'].append(verify_score(fails, retail_qa_settings()))
        if run.routine.system_key == SYSTEM_CROSS_CHECK and run.status == RoutineRun.STATUS_DONE:
            day = next((item for item in days if item['date'] == run.period_key), None)
            if day:
                match = next((audit for audit in day['cross']['audits'] if audit.get('run_id') == run.pk), None)
                if match:
                    row['cross_scores'].append(match['score'])
    for day in days:
        for spot in day['owner']['spots']:
            attributed = spot.get('attributed_to')
            if attributed and attributed.get('id'):
                row = bucket(attributed['id'], attributed['name'])
                row['spot_scores'].append(spot.get('spot_score'))
    from django.db.models import Count
    flag_counts = dict(
        CheckerFlag.objects.filter(status__in=CheckerFlag.ACTIVE_STATUSES)
        .values('user_id')
        .annotate(c=Count('id'))
        .values_list('user_id', 'c')
    )
    out = []
    for row in by_user.values():
        row['open_flags'] = flag_counts.get(row['id'], 0)
        row['verify_average'] = _mean_or_none(row.pop('verify_scores'))
        row['cross_check_average'] = _mean_or_none(row.pop('cross_scores'))
        spots = row.pop('spot_scores')
        row['spot_count'] = len(spots)
        row['spot_average'] = _mean_or_none(spots)
        row['on_task'] = None
        section_days = _section_check_days(
            monday, row['id'], runs, days,
            owned_section_ids=owned.get(row['id'], set()),
        )
        row['section_days'] = section_days
        if row['id'] in owned:
            parts = section_check_done_parts(section_days)
            row['done'] = parts['done']
            row['assigned'] = parts['assigned']
            row['due_today'] = parts['due_today']
            row['missed'] = parts['missed']
        out.append(row)
    out.sort(key=lambda item: item['name'] or '')
    return out


def _section_day_expected(day: date, info: dict | None) -> bool:
    open_day = bool(info.get('open_day')) if info else is_open_day(day)
    return open_day and section_checks_required(day)


def _section_check_days(
    monday: date,
    person_id: int,
    runs: list[RoutineRun],
    days: list[dict],
    *,
    owned_section_ids: set[int] | None = None,
    today: date | None = None,
) -> list[str]:
    """Mon–Sun section-check dots: done / due / missed / none.

    A day gets a status only when a check was expected (section weekdays and
    the store open) and the day is not in the future. Today's unfinished check
    is due, not missed.
    """
    today = today or timezone.localdate()
    owned = set(owned_section_ids or ())
    by_date = {row['date']: row for row in days}
    tallies = [
        run for run in runs
        if run.routine.system_key == SYSTEM_TALLY
        and (
            run.assigned_to_id == person_id
            or (run.section_id and run.section_id in owned)
        )
    ]
    out: list[str] = []
    for offset in range(7):
        day = monday + timedelta(days=offset)
        iso = day.isoformat()
        info = by_date.get(iso)
        if day > today or not _section_day_expected(day, info):
            out.append('none')
            continue
        mine = [run for run in tallies if run.period_key == iso]
        words = [_run_status(run) for run in mine]
        if any(word in ('done', 'late') for word in words):
            out.append('done')
        elif any(word == 'missed' for word in words):
            out.append('missed')
        elif day == today:
            out.append('due')
        else:
            out.append('missed')
    return out


def _work_cycles(days) -> list[dict]:
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


def _cashier_activity(days) -> list[dict]:
    from .settings import IDLE_STRETCH_MINUTES
    start, end = days[0], days[-1]
    cfg = retail_qa_settings()
    stretch = float(cfg.get('idle_stretch_minutes', IDLE_STRETCH_MINUTES))
    cycles: dict[int, dict] = {}
    rows = RoutineSubmission.objects.filter(
        routine__system_key=SYSTEM_WORK_CYCLE,
        status=RoutineSubmission.STATUS_SUBMITTED,
        submitted_at__isnull=False,
        submitted_at__date__gte=start,
        submitted_at__date__lte=end,
    ).select_related('submitted_by')
    for row in rows:
        if not row.submitted_by_id:
            continue
        bucket = cycles.setdefault(row.submitted_by_id, {
            'id': row.submitted_by_id,
            'name': row.submitted_by.full_name,
            'cycles': 0,
            'idle_stretches': 0,
        })
        bucket['cycles'] += 1
    for prompt in WorkCyclePrompt.objects.filter(
        shown_at__date__gte=start, shown_at__date__lte=end,
    ).select_related('user'):
        minutes = (prompt.idle_seconds or 0) / 60
        if minutes < stretch or not prompt.user_id:
            continue
        bucket = cycles.setdefault(prompt.user_id, {
            'id': prompt.user_id,
            'name': prompt.user.full_name if prompt.user_id else '',
            'cycles': 0,
            'idle_stretches': 0,
        })
        bucket['idle_stretches'] += 1
    out = []
    for row in cycles.values():
        denom = row['cycles'] + row['idle_stretches']
        row['on_task'] = None if denom == 0 else round(100.0 * row['cycles'] / denom)
        out.append(row)
    out.sort(key=lambda item: item['name'] or '')
    return out


def _attach_on_task(people: list[dict], activity: list[dict]) -> list[dict]:
    by_id = {row['id']: row for row in activity}
    for row in people:
        found = by_id.get(row['id'])
        row['on_task'] = None if found is None else found.get('on_task')
    return people


def _cross_diagnostics(daily: list[dict]) -> list[dict]:
    from .settings import DIAG_CHECKER_SPOT, DIAG_OWNER_ITEMS
    spots = [
        spot
        for row in daily
        for spot in row['owner']['spots']
    ]
    out = []
    for row in daily:
        for audit in row['cross']['audits']:
            if audit.get('status') not in ('done',):
                continue
            items = int(audit.get('found') or 0)
            owner_done = any(
                other['doing']['routines']
                and any(
                    item.get('section_id') == audit.get('section_id') and item.get('status') == 'done'
                    for item in other['doing']['routines']
                )
                for other in daily
            )
            later_spot = next(
                (
                    spot for spot in spots
                    if spot.get('section_id') == audit.get('section_id')
                    and (spot.get('spot_score') or 100) < DIAG_CHECKER_SPOT
                ),
                None,
            )
            flag = ''
            if not owner_done:
                flag = 'No owner check'
            elif items >= DIAG_OWNER_ITEMS:
                flag = 'Owner not maintaining'
            elif items == 0 and later_spot:
                flag = 'Checker not looking'
            out.append({
                'section': audit.get('section_name'),
                'owner': (audit.get('section_owner') or {}).get('name') if isinstance(audit.get('section_owner'), dict) else None,
                'checker': (audit.get('checker') or {}).get('name') if isinstance(audit.get('checker'), dict) else audit.get('auditor_name'),
                'result': audit.get('status'),
                'items_fixed': items,
                'flag': flag,
            })
    return out


def _idle_prompts(days) -> list[dict]:
    start, end = days[0], days[-1]
    rows = (
        WorkCyclePrompt.objects.filter(shown_at__date__gte=start, shown_at__date__lte=end)
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


def _tally_rows(days) -> list[dict]:
    runs = RoutineRun.objects.filter(
        routine__system_key=SYSTEM_TALLY,
        status=RoutineRun.STATUS_DONE,
        period_key__in=[d.isoformat() for d in days],
    ).select_related('submission')
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
                bucket['counts'][key] = bucket['counts'].get(key, 0) + int(value or 0)
    return list(totals.values())


def _week_context(monday: date, cfg: dict | None = None, extra_days=None, *, project: bool = False) -> dict:
    today = timezone.localdate()
    current = this_monday(today)
    past = monday < current
    live_cfg = retail_qa_settings()
    snap = WeekScoreSnapshot.objects.filter(week_monday=monday).first()
    if past and snap and snap.settings:
        cfg = snap.settings
    else:
        cfg = cfg or live_cfg
    days = week_days(monday)
    if extra_days:
        days = sorted(set(days) | set(extra_days))
    as_of = timezone.make_aware(datetime.combine(monday + timedelta(days=7), datetime.min.time()))
    if not past:
        as_of = timezone.now()
    bases = _load_baselines(monday, cfg, as_of, freeze=past)
    runs = _runs_for(days)
    return {
        'monday': monday,
        'cfg': cfg,
        'days': days,
        'runs': runs,
        'by_day': _by_day(runs),
        'bases': bases,
        'past': past,
        'snapshot': snap,
        'as_of': as_of,
    }


def _walk_cap(score: float | None, walks: int, cfg: dict) -> tuple[float | None, str | None]:
    if score is None:
        return None, None
    floor = int(cfg.get('walk_floor', WALK_FLOOR))
    if walks <= 0:
        score = min(score, float(cfg['grade_b']) - 0.1)
    elif walks < floor:
        score = min(score, float(cfg['grade_a']) - 0.1)
    return round(score, 1), letter_for(score, cfg)


def _week_cross(daily: list[dict], *, due: date | None, today: date, project: bool) -> float | None:
    audits = [audit for row in daily for audit in row['cross']['audits']]
    if not project:
        audits = [row for row in audits if row.get('status') != 'projected']
    if not audits:
        return None
    if due and today < due:
        return None
    done = sum(1 for row in audits if row.get('status') in ('done', 'projected') or project)
    return round(100.0 * done / len(audits), 1)


def _day_of(row: dict) -> date:
    return date.fromisoformat(row['date'])


def _doing_for_week(daily: list[dict], *, today: date, project: bool) -> float | None:
    """Done over expected across open days. Not a mean of daily scores."""
    done = 0
    needed = 0
    for row in daily:
        if not row.get('open_day'):
            continue
        day = _day_of(row)
        doing = row.get('doing') or {}
        day_needed = doing.get('needed')
        day_done = doing.get('done')
        if day_needed is None:
            continue
        if day > today:
            if project:
                done += day_needed
                needed += day_needed
            continue
        if project and day == today:
            done += day_needed
        else:
            done += day_done or 0
        needed += day_needed
    if needed <= 0:
        return None
    return round(100.0 * min(done, needed) / needed, 1)


def _owner_for_week(daily: list[dict], *, today: date, project: bool = False) -> tuple[float | None, int]:
    """Average of walked days. Projection treats remaining open days as 100."""
    scores = []
    for row in daily:
        if not row.get('open_day'):
            continue
        day = _day_of(row)
        owner = (row.get('thirds') or {}).get('owner')
        if day < today:
            if owner is not None:
                scores.append(owner)
        elif day == today:
            if owner is not None:
                scores.append(owner)
            elif project:
                scores.append(100.0)
        elif project:
            scores.append(100.0)
        elif owner is not None:
            scores.append(owner)
    return _mean_or_none(scores), len(scores)


def _assemble_week(ctx: dict, *, project: bool = False) -> dict:
    monday = ctx['monday']
    cfg = ctx['cfg']
    from .schedule import cross_check_day_for
    today = timezone.localdate()
    days = week_days(monday)
    daily = [grade_day(day, ctx, project=project and day > today) for day in days]
    doing = _doing_for_week(daily, today=today, project=project)
    owner, walks = _owner_for_week(daily, today=today, project=project)
    due = cross_check_day_for(monday)
    cross = _week_cross(daily, due=due, today=today, project=project)
    spot_w, do_w, cross_w = _weights(cfg)
    blended = combine_weighted([
        ('spot', spot_w, owner),
        ('do', do_w, doing),
        ('cross', cross_w, cross),
    ])
    score, letter = _walk_cap(blended['score'], walks, cfg)
    open_days = week_days(monday)
    activity = _cashier_activity(open_days)
    return {
        'week': week_label(monday),
        'monday': monday.isoformat(),
        'score': score,
        'letter': letter,
        'weights': blended['weights'],
        'excluded': blended['excluded'],
        'thirds': {'doing': doing, 'cross': cross, 'owner': owner},
        'daily_average': doing,
        'cross_check_average': cross,
        'days': daily,
        'cross_checks': [
            audit
            for row in daily
            for audit in row['cross']['audits']
        ],
        'tallies': _tally_rows(open_days),
        'calibration': [],
        'people': _attach_on_task(_people_for_week(monday, daily, ctx['runs']), activity),
        'work_cycles': _work_cycles(open_days),
        'idle_prompts': _idle_prompts(open_days),
        'cashier_activity': _cashier_activity(open_days),
        'cross_diagnostics': _cross_diagnostics(daily),
        'settings': cfg,
    }


def week_grade(monday: date, cfg: dict | None = None) -> dict:
    today = timezone.localdate()
    current = this_monday(today)
    ctx = _week_context(monday, cfg=cfg)
    if monday < current and ctx['snapshot'] and ctx['snapshot'].payload:
        payload = dict(ctx['snapshot'].payload)
        payload.setdefault('settings', ctx['snapshot'].settings or ctx['cfg'])
        return payload
    live = _assemble_week(ctx)
    projected = _assemble_week(ctx, project=True)
    live['projected'] = {
        'doing': projected['thirds']['doing'],
        'cross': projected['thirds']['cross'],
        'owner': projected['thirds']['owner'],
        'score': projected['score'],
        'letter': projected['letter'],
    }
    _store_week_snapshot(monday, live, ctx, finalize=monday < current)
    return live


def _jsonable(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return value


def _store_week_snapshot(monday: date, payload: dict, ctx: dict, *, finalize: bool) -> None:
    WeekScoreSnapshot.objects.update_or_create(
        week_monday=monday,
        defaults={
            'score': payload.get('score'),
            'letter': payload.get('letter') or '',
            'doing': payload['thirds']['doing'],
            'cross': payload['thirds']['cross'],
            'owner': payload['thirds']['owner'],
            'settings': settings_snapshot(ctx['cfg']),
            'payload': _jsonable(payload),
            'finalized_at': timezone.now() if finalize else None,
        },
    )


def week_summary(monday: date, cfg: dict | None = None) -> dict:
    """Compact week for the Dashboard retail card."""
    week = week_grade(monday, cfg)
    return {
        'score': week.get('score'),
        'letter': week.get('letter'),
        'thirds': week.get('thirds'),
        'projected': week.get('projected'),
        'days': [
            {
                'date': row['date'],
                'score': row['score'],
                'letter': row['letter'],
                'graded': row['graded'],
                'doing': row['thirds']['doing'],
                'owner_pending': row['owner'].get('pending'),
            }
            for row in week.get('days') or []
        ],
    }


def preview_week(monday: date, edited: dict) -> dict:
    """Rescore the week in memory with posted settings. Nothing is saved."""
    cfg = {**retail_qa_settings(), **edited}
    ctx = _week_context(monday, cfg=cfg)
    ctx['cfg'] = cfg
    live = _assemble_week(ctx)
    projected = _assemble_week(ctx, project=True)
    return {
        'thirds': live['thirds'],
        'score': live['score'],
        'letter': live['letter'],
        'projected': {
            'thirds': projected['thirds'],
            'score': projected['score'],
            'letter': projected['letter'],
        },
    }


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


# Kept for imports that have not moved yet. The old mix is gone.
def combine_week(day_scores, cross_scores, cfg: dict | None = None) -> tuple:
    cfg = cfg or retail_qa_settings()
    daily = [score for score in day_scores if score is not None]
    if not daily:
        return None, None, None, None
    score = round(mean(daily), 1)
    return score, letter_for(score, cfg), score, None


def cross_check_scores(monday: date, cfg: dict | None = None) -> list[float]:
    week = week_grade(monday, cfg)
    return [row['score'] for row in week.get('cross_checks') or []]
