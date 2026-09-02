"""Per-kind handling of a submission's `responses`.

A checklist is authored, so its answers are rebuilt from the definition every
time it is touched. The three section kinds are not: their shape is fixed by
their runner, so they are merged by trusting the client's payload and cleaning
it against the taxonomy. Everything that decides a grade — counts, flags, the
items-inspected floor — is re-derived here rather than taken on faith.
"""
from __future__ import annotations

from typing import Any

from .definition import build_responses, merge_responses, normalize_responses, score_responses
from .models import Routine, RoutineRun, Section
from .taxonomy import clean_counts, clean_flags

SECTION_KINDS = (
    Routine.KIND_SECTION_TALLY,
    Routine.KIND_SECTION_AUDIT,
    Routine.KIND_OWNER_SPOT,
)


def _section_names(ids) -> dict[int, str]:
    return dict(Section.objects.filter(pk__in=ids).values_list('pk', 'name'))


def _clean_audit(raw: Any, fallback_section: int | None) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    section_id = raw.get('section_id') or fallback_section
    try:
        items = int(raw.get('items_inspected') or 0)
    except (TypeError, ValueError):
        items = 0
    return {
        'section_id': section_id,
        'section_name': raw.get('section_name') or _section_names([section_id]).get(section_id, ''),
        'photo': raw.get('photo') or None,
        'photo_file_id': raw.get('photo_file_id'),
        'items_inspected': max(items, 0),
        'counts': clean_counts(raw.get('counts')),
        'flags': clean_flags(raw.get('flags')),
        'notes': str(raw.get('notes') or ''),
    }


def _clean_tally(raw: Any, run: RoutineRun | None) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    rows = raw.get('sections')
    rows = rows if isinstance(rows, list) else []
    owned = _owned_sections(run)
    by_id = {row.get('section_id'): row for row in rows if isinstance(row, dict)}
    out = []
    for section in owned:
        row = by_id.get(section.pk) or {}
        out.append({
            'section_id': section.pk,
            'section_name': section.name,
            'counts': clean_counts(row.get('counts')),
            'flags': clean_flags(row.get('flags')),
            'photo': row.get('photo') or None,
            'photo_file_id': row.get('photo_file_id'),
            'notes': str(row.get('notes') or ''),
        })
    return {'sections': out}


def owned_sections(run: RoutineRun | None) -> list[Section]:
    """The sections this tally covers: everything its owner keeps, today."""
    if run is None or run.assigned_to_id is None:
        return []
    if run.routine.kind != Routine.KIND_SECTION_TALLY:
        return []
    qs = Section.objects.filter(is_active=True, owner_id=run.assigned_to_id)
    if run.routine.assigned_department_id:
        qs = qs.filter(department_id=run.routine.assigned_department_id)
    return list(qs.order_by('sort_order', 'name'))


_owned_sections = owned_sections


def verify_context(run: RoutineRun) -> dict | None:
    """The shift before this one, for the sign-off block at the top of a runner.

    Only the last finished run counts. Handing someone a blank verify block
    when nothing was done is the point: an absent Close is a fact the opener
    should have to record, not one the form should hide.
    """
    target = run.routine.verifies
    if target is None:
        return None
    previous = (
        RoutineRun.objects.filter(
            routine=target,
            status=RoutineRun.STATUS_DONE,
            completed_at__isnull=False,
            completed_at__lt=run.due_at,
        )
        .select_related('completed_by', 'submission')
        .order_by('-completed_at')
        .first()
    )
    return {
        'routine_title': target.title,
        'run_id': previous.pk if previous else None,
        'completed_at': previous.completed_at if previous else None,
        'completed_by_name': previous.completed_by.full_name if previous and previous.completed_by_id else None,
        'failed_count': previous.submission.failed_count if previous and previous.submission_id else 0,
        'result': '',
        'note': '',
    }


def initial_responses(routine: Routine, run: RoutineRun | None) -> dict:
    if routine.kind == Routine.KIND_CHECKLIST:
        fresh = build_responses(routine.definition or {})
        if routine.verifies_id:
            fresh['verify'] = {'run_id': None, 'result': '', 'note': ''}
        return fresh
    if routine.kind == Routine.KIND_SECTION_TALLY:
        return _clean_tally({}, run)
    if routine.kind == Routine.KIND_SECTION_AUDIT:
        return _clean_audit({}, run.section_id if run else None)
    checks = list((run.generated or {}).get('checks') or []) if run else []
    return {
        'checks': checks,
        'audit': _clean_audit({}, (run.generated or {}).get('section_id') if run else None),
    }


def _clean_verify(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    result = str(raw.get('result') or '').lower()
    return {
        'run_id': raw.get('run_id'),
        'result': result if result in ('pass', 'fail', 'na') else '',
        'note': str(raw.get('note') or ''),
    }


def merge_incoming(routine: Routine, run: RoutineRun | None, incoming: Any) -> dict:
    if routine.kind == Routine.KIND_CHECKLIST:
        merged = normalize_responses(merge_responses(routine.definition, incoming))
        # `merge_responses` rebuilds from the definition, which knows nothing
        # about the sign-off on the shift before; carry it across by hand.
        if routine.verifies_id:
            verify = _clean_verify(incoming.get('verify') if isinstance(incoming, dict) else None)
            merged['verify'] = verify or {'run_id': None, 'result': '', 'note': ''}
        return merged
    if routine.kind == Routine.KIND_SECTION_TALLY:
        return _clean_tally(incoming, run)
    if routine.kind == Routine.KIND_SECTION_AUDIT:
        return _clean_audit(incoming, run.section_id if run else None)
    incoming = incoming if isinstance(incoming, dict) else {}
    # The drawn checks are the run's, not the submitter's: only results carry over.
    drawn = list((run.generated or {}).get('checks') or []) if run else []
    answered = {
        str(row.get('check_id')): str(row.get('result') or '')
        for row in (incoming.get('checks') or [])
        if isinstance(row, dict)
    }
    checks = [{**check, 'result': answered.get(str(check.get('check_id')), '')} for check in drawn]
    return {
        'checks': checks,
        'audit': _clean_audit(
            incoming.get('audit'),
            (run.generated or {}).get('section_id') if run else None,
        ),
    }


def _audit_blockers(audit: dict, min_items: int) -> list[str]:
    problems = []
    if not audit.get('photo'):
        problems.append('Take the wide shot of the section first.')
    if audit.get('items_inspected', 0) < min_items:
        problems.append(f'Inspect at least {min_items} items before submitting.')
    return problems


def submit_blockers(routine: Routine, responses: dict, *, min_items: int) -> list[str]:
    """Reasons the server will not accept this submission yet."""
    if routine.kind == Routine.KIND_CHECKLIST:
        _failed, _critical, unanswered = score_responses(responses)
        problems = [f'Answer everything to submit. {len(unanswered)} left.'] if unanswered else []
        verify = responses.get('verify')
        if isinstance(verify, dict) and not verify.get('result'):
            problems.append('Say whether the shift before yours was done to standard.')
        return problems
    if routine.kind == Routine.KIND_SECTION_TALLY:
        if not responses.get('sections'):
            return ['You do not keep a section right now. Ask for one to be assigned.']
        return []
    if routine.kind == Routine.KIND_SECTION_AUDIT:
        return _audit_blockers(responses, min_items)
    problems = [
        f'Answer the {len(responses.get("checks") or [])} drawn checks.'
    ] if any(not (row.get('result') or '') for row in responses.get('checks') or []) else []
    return problems + _audit_blockers(responses.get('audit') or {}, min_items)


def outcome(routine: Routine, responses: dict) -> tuple[int, bool]:
    """(failed_count, has_critical_fail) for the row that shows in the history.

    For section work "failed" means issues found, which is the honest reading:
    the list should show what the walk turned up, not a pass badge on a walk
    that found ten things wrong.
    """
    if routine.kind == Routine.KIND_CHECKLIST:
        failed, critical, _unanswered = score_responses(responses)
        return failed, critical
    if routine.kind == Routine.KIND_SECTION_TALLY:
        rows = responses.get('sections') or []
        found = sum(sum(row.get('counts', {}).values()) for row in rows)
        flagged = any('safety' in (row.get('flags') or []) for row in rows)
        return found, flagged
    audit = responses if routine.kind == Routine.KIND_SECTION_AUDIT else (responses.get('audit') or {})
    found = sum((audit.get('counts') or {}).values())
    failed_checks = sum(
        1 for row in (responses.get('checks') or []) if (row.get('result') or '') == 'fail'
    )
    return found + failed_checks, 'safety' in (audit.get('flags') or [])
