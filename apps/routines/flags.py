"""Checker-integrity flags. None of these move the store letter."""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from typing import Any

from django.utils import timezone

from .baseline import expected_variance, section_baseline
from .models import CheckerFlag, RoutineRun, Section, SectionObservation
from .schedule import SYSTEM_CLOSE, SYSTEM_CROSS_CHECK, SYSTEM_DAY, SYSTEM_OPEN, SYSTEM_OWNER_SPOT, SYSTEM_TALLY
from .settings import retail_qa_settings

PERFORMED = (SYSTEM_OPEN, SYSTEM_DAY, SYSTEM_CLOSE)


def _local_date(value: datetime | None) -> date | None:
    if value is None:
        return None
    return timezone.localtime(value).date()


def _seconds_taken(run: RoutineRun) -> float | None:
    submission = run.submission
    if not submission or not submission.started_at or not submission.submitted_at:
        return None
    return max((submission.submitted_at - submission.started_at).total_seconds(), 0.0)


def _z(found: list[float], expected: list[float], variances: list[float]) -> tuple[float | None, float]:
    exp = sum(expected)
    var = sum(max(v, 0.0) for v in variances)
    if var <= 0:
        return None, exp
    return (sum(found) - exp) / math.sqrt(var), exp


def _trailing_audits(user_id: int, as_of: datetime, limit: int) -> list[SectionObservation]:
    return list(
        SectionObservation.objects.filter(
            actor_id=user_id,
            kind=SectionObservation.KIND_AUDIT,
            observed_at__lte=as_of,
        ).select_related('section', 'run').order_by('-observed_at')[:limit]
    )


def test_low_findings(user_id: int, cfg: dict, as_of: datetime) -> dict | None:
    window = int(cfg['flag_window'])
    rows = _trailing_audits(user_id, as_of, window)
    if len(rows) < 3:
        return None
    found, expected, variances = [], [], []
    for row in rows:
        base = section_baseline(row.section_id, cfg, as_of=row.observed_at)
        found.append(float(row.total))
        expected.append(float(base['mean']))
        variances.append(expected_variance(base))
    z, exp = _z(found, expected, variances)
    if z is None:
        return None
    if z < float(cfg['flag_z']) and exp >= float(cfg['flag_min_expected']):
        return {
            'kind': CheckerFlag.KIND_LOW_FINDINGS,
            'evidence': {
                'z': round(z, 3),
                'expected': round(exp, 2),
                'found': round(sum(found), 2),
                'n': len(rows),
            },
            'window_start': _local_date(rows[-1].observed_at),
            'window_end': _local_date(rows[0].observed_at),
        }
    return None


def test_owner_followup(user_id: int, cfg: dict, as_of: datetime) -> dict | None:
    """Spots with R above the threshold on a section this person just audited."""
    from .grading import residual_from_observation

    weeks = int(cfg['flag_window'])
    start = as_of.date() - timedelta(days=weeks * 7)
    spots = SectionObservation.objects.filter(
        kind=SectionObservation.KIND_SPOT,
        observed_at__date__gte=start,
        observed_at__lte=as_of,
        tally_run__routine__system_key=SYSTEM_CROSS_CHECK,
        tally_run__completed_by_id=user_id,
    ).select_related('section', 'run')
    hits = []
    threshold = float(cfg['flag_followup_r'])
    for spot in spots:
        parts = residual_from_observation(spot, cfg)
        if parts and parts['R'] > threshold:
            hits.append({
                'section_id': spot.section_id,
                'date': spot.observed_at.date().isoformat(),
                'R': parts['R'],
                'spot_run_id': spot.run_id,
            })
    if len(hits) >= 3:
        return {
            'kind': CheckerFlag.KIND_OWNER_FOLLOWUP,
            'evidence': {'hits': hits[-8:], 'count': len(hits), 'threshold': threshold},
            'window_start': start,
            'window_end': as_of.date(),
        }
    return None


def test_speed(user_id: int, cfg: dict, as_of: datetime) -> dict | None:
    min_seconds = float(cfg['flag_min_seconds'])
    start = as_of - timedelta(days=int(cfg['flag_window']) * 7)
    runs = RoutineRun.objects.filter(
        routine__system_key=SYSTEM_CROSS_CHECK,
        completed_by_id=user_id,
        status=RoutineRun.STATUS_DONE,
        completed_at__gte=start,
        completed_at__lte=as_of,
    ).select_related('submission')
    fast = []
    for run in runs:
        seconds = _seconds_taken(run)
        if seconds is None:
            continue
        if seconds < min_seconds:
            fast.append({
                'run_id': run.pk,
                'seconds': round(seconds, 1),
                'date': run.period_key,
            })
    if fast:
        return {
            'kind': CheckerFlag.KIND_SPEED,
            'evidence': {'min_seconds': min_seconds, 'runs': fast[-8:]},
            'window_start': start.date(),
            'window_end': as_of.date(),
        }
    return None


def test_batch(user_id: int, cfg: dict, as_of: datetime) -> dict | None:
    minutes = float(cfg['flag_batch_minutes'])
    start = as_of - timedelta(days=int(cfg['flag_window']) * 7)
    audits = list(
        RoutineRun.objects.filter(
            routine__system_key=SYSTEM_CROSS_CHECK,
            completed_by_id=user_id,
            status=RoutineRun.STATUS_DONE,
            completed_at__gte=start,
            completed_at__lte=as_of,
        ).values_list('completed_at', 'period_key', 'pk')
    )
    tallies = list(
        RoutineRun.objects.filter(
            routine__system_key=SYSTEM_TALLY,
            completed_by_id=user_id,
            status=RoutineRun.STATUS_DONE,
            completed_at__gte=start,
            completed_at__lte=as_of,
        ).values_list('completed_at', 'period_key', 'pk')
    )
    hits = []
    for audit_at, period, audit_id in audits:
        for tally_at, tally_period, tally_id in tallies:
            if period != tally_period or not audit_at or not tally_at:
                continue
            gap = abs((audit_at - tally_at).total_seconds()) / 60.0
            if gap <= minutes:
                hits.append({
                    'audit_run_id': audit_id,
                    'tally_run_id': tally_id,
                    'minutes': round(gap, 2),
                    'date': period,
                })
    if hits:
        return {
            'kind': CheckerFlag.KIND_BATCH,
            'evidence': {'minutes': minutes, 'hits': hits[-8:]},
            'window_start': start.date(),
            'window_end': as_of.date(),
        }
    return None


def test_pairing(user_id: int, cfg: dict, as_of: datetime) -> dict | None:
    rows = _trailing_audits(user_id, as_of, int(cfg['flag_window']) * 2)
    if len(rows) < 4:
        return None
    by_owner: dict[int, list[SectionObservation]] = {}
    for row in rows:
        owner_id = row.section.owner_id if row.section_id else None
        if owner_id:
            by_owner.setdefault(owner_id, []).append(row)
    rest_all = rows
    for owner_id, subset in by_owner.items():
        if len(subset) < 3 or len(subset) == len(rest_all):
            continue
        others = [row for row in rest_all if row.section_id and row.section.owner_id != owner_id]
        if len(others) < 2:
            continue

        def moments(group):
            found, expected, variances = [], [], []
            for row in group:
                base = section_baseline(row.section_id, cfg, as_of=row.observed_at)
                found.append(float(row.total))
                expected.append(float(base['mean']))
                variances.append(expected_variance(base))
            return _z(found, expected, variances)

        z_sub, exp_sub = moments(subset)
        z_rest, _exp_rest = moments(others)
        if z_sub is None or z_rest is None:
            continue
        if z_sub < float(cfg['flag_z']) and exp_sub >= float(cfg['flag_min_expected']) and (z_rest - z_sub) >= 1.5:
            return {
                'kind': CheckerFlag.KIND_PAIRING,
                'evidence': {
                    'owner_id': owner_id,
                    'z_owner': round(z_sub, 3),
                    'z_rest': round(z_rest, 3),
                    'n': len(subset),
                },
                'window_start': _local_date(rows[-1].observed_at),
                'window_end': _local_date(rows[0].observed_at),
            }
    return None


def test_rubber_stamp(user_id: int, cfg: dict, as_of: datetime) -> dict | None:
    window = int(cfg['flag_rubber_stamp_window'])
    runs = list(
        RoutineRun.objects.filter(
            routine__system_key__in=PERFORMED,
            completed_by_id=user_id,
            status=RoutineRun.STATUS_DONE,
            completed_at__lte=as_of,
            submission__isnull=False,
        ).select_related('submission', 'routine').order_by('-completed_at')[: max(window, 20)]
    )
    confirmed = []
    for run in runs:
        verify = (run.submission.responses or {}).get('verify') if run.submission_id else None
        checks = (verify or {}).get('checks') if isinstance(verify, dict) else []
        if not checks:
            continue
        if all(str(row.get('result') or '') == 'pass' for row in checks):
            confirmed.append(run)
        else:
            confirmed.append(None)
    streak = []
    for row in confirmed:
        if row is None:
            break
        streak.append(row)
    if len(streak) < window:
        return None
    days = {run.period_key for run in streak}
    trouble = SectionObservation.objects.filter(
        kind__in=(SectionObservation.KIND_SPOT, SectionObservation.KIND_AUDIT),
        observed_at__date__in=days,
        total__gt=0,
    ).exists()
    if not trouble:
        return None
    return {
        'kind': CheckerFlag.KIND_RUBBER_STAMP,
        'evidence': {
            'verifications': len(streak),
            'window': window,
            'days': sorted(days),
        },
        'window_start': _local_date(streak[-1].completed_at),
        'window_end': _local_date(streak[0].completed_at),
    }


TESTS = (
    test_low_findings,
    test_owner_followup,
    test_speed,
    test_batch,
    test_pairing,
    test_rubber_stamp,
)


def _persist(user_id: int, hit: dict, as_of: datetime) -> CheckerFlag:
    existing = CheckerFlag.objects.filter(
        user_id=user_id,
        kind=hit['kind'],
        status__in=CheckerFlag.ACTIVE_STATUSES,
    ).first()
    if existing:
        existing.evidence = hit['evidence']
        existing.window_start = hit['window_start']
        existing.window_end = hit['window_end']
        existing.save(update_fields=['evidence', 'window_start', 'window_end'])
        return existing
    return CheckerFlag.objects.create(
        user_id=user_id,
        kind=hit['kind'],
        raised_at=as_of,
        window_start=hit['window_start'],
        window_end=hit['window_end'],
        evidence=hit['evidence'],
        status=CheckerFlag.STATUS_OPEN,
    )


def evaluate_checker_flags(user, as_of: datetime | None = None, cfg: dict | None = None) -> list[CheckerFlag]:
    """Raise or refresh flags for one person. Auto-clears lapsed ones the RM has not touched."""
    if user is None:
        return []
    user_id = user.pk if hasattr(user, 'pk') else int(user)
    as_of = as_of or timezone.now()
    cfg = cfg or retail_qa_settings()
    hits = {hit['kind']: hit for test in TESTS if (hit := test(user_id, cfg, as_of))}
    kept = []
    for kind, hit in hits.items():
        kept.append(_persist(user_id, hit, as_of))
    auto = CheckerFlag.objects.filter(
        user_id=user_id,
        status=CheckerFlag.STATUS_OPEN,
    ).exclude(kind__in=hits.keys())
    auto.update(
        status=CheckerFlag.STATUS_CLEARED,
        note='Condition lapsed.',
        reviewed_at=as_of,
    )
    return kept


def refresh_checker_flags(as_of: datetime | None = None) -> int:
    as_of = as_of or timezone.now()
    user_ids = set(
        SectionObservation.objects.filter(kind=SectionObservation.KIND_AUDIT)
        .exclude(actor_id=None)
        .values_list('actor_id', flat=True)
    )
    user_ids.update(
        RoutineRun.objects.filter(
            routine__system_key__in=PERFORMED + (SYSTEM_CROSS_CHECK,),
            status=RoutineRun.STATUS_DONE,
        ).exclude(completed_by_id=None).values_list('completed_by_id', flat=True)
    )
    count = 0
    for user_id in user_ids:
        count += len(evaluate_checker_flags(user_id, as_of=as_of))
    return count


def review_flag(flag: CheckerFlag, *, status: str, note: str, reviewer) -> CheckerFlag:
    if status == CheckerFlag.STATUS_CLEARED and not (note or '').strip():
        raise ValueError('Clearing a flag needs a note.')
    if status not in dict(CheckerFlag.STATUS_CHOICES):
        raise ValueError('Unknown flag status.')
    flag.status = status
    flag.note = (note or '').strip()
    flag.reviewed_by = reviewer
    flag.reviewed_at = timezone.now()
    flag.save(update_fields=['status', 'note', 'reviewed_by', 'reviewed_at'])
    return flag
