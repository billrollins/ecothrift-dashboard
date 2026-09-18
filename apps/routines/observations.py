"""Write SectionObservation rows from a submitted run."""
from __future__ import annotations

from datetime import datetime

from django.utils import timezone

from .models import CheckerFlag, Routine, RoutineRun, RoutineSubmission, SectionObservation
from .schedule import SYSTEM_CROSS_CHECK, SYSTEM_OWNER_SPOT, SYSTEM_TALLY, SYSTEM_WORK_CYCLE
from .taxonomy import GRADED_GROUP_KEYS, SAFETY_FLAG, group_sum, rollup_counts


def _group_counts(raw: dict | None) -> dict[str, int]:
    rolled = rollup_counts(raw or {})
    out = {key: int(rolled.get(key) or 0) for key in GRADED_GROUP_KEYS}
    # group_sum still works if the payload was already rolled.
    for key in GRADED_GROUP_KEYS:
        if key not in rolled:
            out[key] = group_sum(raw or {}, key)
    return out


def _actor_flagged(user_id: int | None, when: datetime) -> bool:
    if not user_id:
        return False
    return CheckerFlag.objects.filter(
        user_id=user_id,
        status__in=CheckerFlag.ACTIVE_STATUSES,
        raised_at__lte=when,
    ).exclude(status=CheckerFlag.STATUS_CLEARED).exists()


def _write(
    *,
    section_id: int,
    observed_at: datetime,
    kind: str,
    actor_id: int | None,
    run: RoutineRun | None,
    submission: RoutineSubmission,
    counts: dict[str, int],
    flags: list[str],
    items_inspected: int = 0,
    hours_since_tally: float | None = None,
    tally_run_id: int | None = None,
) -> SectionObservation:
    total = sum(counts.get(key, 0) for key in GRADED_GROUP_KEYS)
    in_baseline = kind in (SectionObservation.KIND_TALLY, SectionObservation.KIND_AUDIT)
    reason = ''
    if kind == SectionObservation.KIND_AUDIT and _actor_flagged(actor_id, observed_at):
        in_baseline = False
        reason = 'flagged_checker'
    if kind in (SectionObservation.KIND_SPOT, SectionObservation.KIND_WALK):
        in_baseline = False
        reason = 'not_a_tally'
    defaults = {
        'observed_at': observed_at,
        'kind': kind,
        'actor_id': actor_id,
        'run': run,
        'items_inspected': max(int(items_inspected or 0), 0),
        'count_facing': counts.get('facing', 0),
        'count_reshelf': counts.get('reshelf', 0),
        'count_reprep': counts.get('reprep', 0),
        'count_security': counts.get('security', 0),
        'total': total,
        'safety': SAFETY_FLAG in (flags or []),
        'hours_since_tally': hours_since_tally,
        'tally_run_id': tally_run_id,
        'in_baseline': in_baseline,
        'excluded_reason': reason,
    }
    row, _created = SectionObservation.objects.update_or_create(
        submission=submission,
        section_id=section_id,
        kind=kind,
        defaults=defaults,
    )
    return row


def record_submission(submission: RoutineSubmission) -> list[SectionObservation]:
    """Create or refresh observations for one submitted row."""
    if submission.status != RoutineSubmission.STATUS_SUBMITTED:
        return []
    when = submission.submitted_at or timezone.now()
    actor_id = submission.submitted_by_id
    run = submission.run
    responses = submission.responses if isinstance(submission.responses, dict) else {}
    key = submission.routine.system_key if submission.routine_id else ''
    written: list[SectionObservation] = []

    if key == SYSTEM_TALLY or submission.routine.kind == Routine.KIND_SECTION_TALLY:
        for row in responses.get('sections') or []:
            if not isinstance(row, dict) or not row.get('section_id'):
                continue
            written.append(_write(
                section_id=int(row['section_id']),
                observed_at=when,
                kind=SectionObservation.KIND_TALLY,
                actor_id=actor_id,
                run=run,
                submission=submission,
                counts=_group_counts(row.get('counts')),
                flags=row.get('flags') or [],
            ))
        return written

    if key == SYSTEM_CROSS_CHECK or submission.routine.kind == Routine.KIND_SECTION_AUDIT:
        section_id = (run.section_id if run else None) or responses.get('section_id')
        if section_id:
            written.append(_write(
                section_id=int(section_id),
                observed_at=when,
                kind=SectionObservation.KIND_AUDIT,
                actor_id=actor_id,
                run=run,
                submission=submission,
                counts=_group_counts(responses.get('counts')),
                flags=responses.get('flags') or [],
                items_inspected=responses.get('items_inspected') or 0,
            ))
        return written

    if key == SYSTEM_OWNER_SPOT or submission.routine.kind == Routine.KIND_OWNER_SPOT:
        audit = responses.get('audit') if isinstance(responses.get('audit'), dict) else {}
        section_id = (run.section_id if run else None) or audit.get('section_id')
        if not section_id:
            return []
        generated = (run.generated or {}) if run else {}
        hours = generated.get('hours_since_tally')
        try:
            hours = float(hours) if hours is not None else None
        except (TypeError, ValueError):
            hours = None
        written.append(_write(
            section_id=int(section_id),
            observed_at=when,
            kind=SectionObservation.KIND_SPOT,
            actor_id=actor_id,
            run=run,
            submission=submission,
            counts=_group_counts(audit.get('counts')),
            flags=audit.get('flags') or [],
            items_inspected=audit.get('items_inspected') or 0,
            hours_since_tally=hours,
            tally_run_id=generated.get('tally_run_id'),
        ))
        return written

    if key == SYSTEM_WORK_CYCLE or submission.routine.kind == Routine.KIND_WORK_CYCLE:
        if responses.get('mode') != 'shelf':
            return []
        shelf = responses.get('shelf') if isinstance(responses.get('shelf'), dict) else {}
        if not shelf.get('section_id'):
            return []
        written.append(_write(
            section_id=int(shelf['section_id']),
            observed_at=when,
            kind=SectionObservation.KIND_WALK,
            actor_id=actor_id,
            run=run,
            submission=submission,
            counts=_group_counts(shelf.get('counts')),
            flags=shelf.get('flags') or [],
        ))
    return written


def backfill_observations() -> int:
    """Walk every submitted section-shaped row and write observations."""
    kinds = (
        Routine.KIND_SECTION_TALLY,
        Routine.KIND_SECTION_AUDIT,
        Routine.KIND_OWNER_SPOT,
        Routine.KIND_WORK_CYCLE,
    )
    count = 0
    rows = RoutineSubmission.objects.filter(
        status=RoutineSubmission.STATUS_SUBMITTED,
        routine__kind__in=kinds,
    ).select_related('routine', 'run')
    for submission in rows.iterator():
        count += len(record_submission(submission))
    return count
