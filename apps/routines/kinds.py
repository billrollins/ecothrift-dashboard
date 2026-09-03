"""Per-kind handling of a submission's `responses`.

A checklist is authored, so its answers are rebuilt from the definition every
time it is touched. The three section kinds are not: their shape is fixed by
their runner, so they are merged by trusting the client's payload and cleaning
it against the taxonomy. Everything that decides a grade - counts and flags - is re-derived
here rather than taken on faith.
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
    Routine.KIND_WORK_CYCLE,
)

WORK_CYCLE_MODES = ('shelf', 'non_shelf')


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


def _prior_results(responses: dict | None) -> dict[str, str]:
    found: dict[str, str] = {}
    if not isinstance(responses, dict):
        return found
    for section in responses.get('sections') or []:
        if not isinstance(section, dict):
            continue
        for check in section.get('checks') or []:
            if isinstance(check, dict) and check.get('id'):
                found[str(check['id'])] = str(check.get('result') or '')
    return found


def verify_checks_for(routine: Routine, previous_responses: dict | None = None) -> list[dict]:
    """The checks the next shift confirms, in definition order."""
    target = routine.verifies
    if target is None:
        return []
    theirs = _prior_results(previous_responses)
    out = []
    for section in (target.definition or {}).get('sections') or []:
        for check in section.get('checks') or []:
            if not check.get('verify_prev') or not check.get('id'):
                continue
            check_id = str(check['id'])
            out.append({
                'check_id': check_id,
                'label': check.get('label') or '',
                'label_es': check.get('label_es') or '',
                'their_result': theirs.get(check_id, ''),
                'result': '',
                'note': '',
            })
    return out


def verify_context(run: RoutineRun) -> dict | None:
    """The shift before this one, check by check.

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
    previous_responses = previous.submission.responses if previous and previous.submission_id else None
    return {
        'routine_title': target.title,
        'run_id': previous.pk if previous else None,
        'completed_at': previous.completed_at if previous else None,
        'completed_by_name': previous.completed_by.full_name if previous and previous.completed_by_id else None,
        'failed_count': previous.submission.failed_count if previous and previous.submission_id else 0,
        'checks': verify_checks_for(run.routine, previous_responses),
    }


def non_shelf_checks() -> list[dict]:
    """Every Day check, labelled by the section it came from.

    Work cycle non-shelf is the leftover of the day list. Reading it live
    means an edit to Day is on the phone the next time someone starts a walk.
    """
    from .schedule import SYSTEM_DAY

    out = []
    for routine in Routine.objects.filter(
        is_active=True,
        system_key=SYSTEM_DAY,
    ).order_by('id'):
        for section in (routine.definition or {}).get('sections') or []:
            section_id = str(section.get('id') or '')
            section_title = section.get('title') or ''
            section_title_es = section.get('title_es') or ''
            for check in section.get('checks') or []:
                if not check.get('id'):
                    continue
                out.append({
                    'routine_key': routine.system_key,
                    'routine_title': routine.title,
                    'section_id': section_id,
                    'section_title': section_title,
                    'section_title_es': section_title_es,
                    'check_id': str(check['id']),
                    'label': check.get('label') or '',
                    'label_es': check.get('label_es') or '',
                })
    return out


def floor_sections(routine: Routine | None = None) -> list[Section]:
    """Active sections the work-cycle shelf walk can pick, in floor order."""
    qs = Section.objects.filter(is_active=True)
    if routine is not None and routine.assigned_department_id:
        qs = qs.filter(department_id=routine.assigned_department_id)
    return list(qs.order_by('sort_order', 'name'))


def _clean_shelf(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    section_id = raw.get('section_id')
    try:
        section_id = int(section_id) if section_id not in (None, '') else None
    except (TypeError, ValueError):
        section_id = None
    return {
        'section_id': section_id,
        'section_name': raw.get('section_name') or _section_names([section_id]).get(section_id, ''),
        'counts': clean_counts(raw.get('counts')),
        'flags': clean_flags(raw.get('flags')),
        'photo': raw.get('photo') or None,
        'photo_file_id': raw.get('photo_file_id'),
        'notes': str(raw.get('notes') or ''),
    }


def _clean_work_cycle(raw: Any) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    mode = raw.get('mode') or ''
    if mode not in WORK_CYCLE_MODES:
        mode = ''
    done = raw.get('non_shelf', {}).get('done') if isinstance(raw.get('non_shelf'), dict) else []
    if not isinstance(done, list):
        done = []
    notes = raw.get('non_shelf', {}).get('notes') if isinstance(raw.get('non_shelf'), dict) else ''
    return {
        'mode': mode,
        'shelf': _clean_shelf(raw.get('shelf')),
        'non_shelf': {
            'done': [str(item) for item in done if item],
            'notes': str(notes or ''),
        },
    }


def initial_responses(routine: Routine, run: RoutineRun | None, *, mode: str = '') -> dict:
    if routine.kind == Routine.KIND_CHECKLIST:
        fresh = build_responses(routine.definition or {})
        if routine.verifies_id:
            fresh['verify'] = {
                'run_id': None,
                'checks': verify_checks_for(routine),
            }
        return fresh
    if routine.kind == Routine.KIND_SECTION_TALLY:
        return _clean_tally({}, run)
    if routine.kind == Routine.KIND_SECTION_AUDIT:
        return _clean_audit({}, run.section_id if run else None)
    if routine.kind == Routine.KIND_WORK_CYCLE:
        return _clean_work_cycle({'mode': mode})
    checks = list((run.generated or {}).get('checks') or []) if run else []
    return {
        'checks': checks,
        'audit': _clean_audit({}, (run.generated or {}).get('section_id') if run else None),
    }


def _clean_verify(raw: Any, expected: list[dict]) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    by_id = {
        str(row.get('check_id')): row
        for row in (raw.get('checks') or [])
        if isinstance(row, dict) and row.get('check_id')
    }
    checks = []
    for row in expected:
        incoming = by_id.get(row['check_id']) or {}
        result = str(incoming.get('result') or '').lower()
        checks.append({
            **row,
            'result': result if result in ('pass', 'fail', 'na') else '',
            'note': str(incoming.get('note') or ''),
        })
    return {
        'run_id': raw.get('run_id'),
        'checks': checks,
    }


def merge_incoming(routine: Routine, run: RoutineRun | None, incoming: Any) -> dict:
    if routine.kind == Routine.KIND_CHECKLIST:
        merged = normalize_responses(merge_responses(routine.definition, incoming))
        # `merge_responses` rebuilds from the definition, which knows nothing
        # about the sign-off on the shift before; carry it across by hand.
        if routine.verifies_id:
            merged['verify'] = _clean_verify(
                incoming.get('verify') if isinstance(incoming, dict) else None,
                verify_checks_for(routine),
            )
        return merged
    if routine.kind == Routine.KIND_SECTION_TALLY:
        return _clean_tally(incoming, run)
    if routine.kind == Routine.KIND_SECTION_AUDIT:
        return _clean_audit(incoming, run.section_id if run else None)
    if routine.kind == Routine.KIND_WORK_CYCLE:
        return _clean_work_cycle(incoming)
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


def submit_blockers(routine: Routine, responses: dict, *, min_items: int = 0) -> list[str]:
    """Reasons the server will not accept this submission yet."""
    if routine.kind == Routine.KIND_CHECKLIST:
        _failed, _critical, unanswered = score_responses(responses)
        problems = [f'Answer everything to submit. {len(unanswered)} left.'] if unanswered else []
        verify = responses.get('verify')
        if isinstance(verify, dict):
            unanswered = [
                row for row in (verify.get('checks') or [])
                if isinstance(row, dict) and not row.get('result')
            ]
            if unanswered:
                problems.append('Confirm every check from the last shift.')
        return problems
    if routine.kind == Routine.KIND_SECTION_TALLY:
        if not responses.get('sections'):
            return ['You do not keep a section right now. Ask for one to be assigned.']
        return []
    if routine.kind == Routine.KIND_SECTION_AUDIT:
        return []
    if routine.kind == Routine.KIND_WORK_CYCLE:
        mode = responses.get('mode')
        if mode not in WORK_CYCLE_MODES:
            return ['Pick shelf check or non-shelf check.']
        if mode == 'shelf':
            if not (responses.get('shelf') or {}).get('section_id'):
                return ['Pick the section you walked.']
            return []
        non = responses.get('non_shelf') or {}
        if not (non.get('done') or str(non.get('notes') or '').strip()):
            return ['Tick at least one check or write what you did.']
        return []
    problems = [
        f'Answer the {len(responses.get("checks") or [])} drawn checks.'
    ] if any(not (row.get('result') or '') for row in responses.get('checks') or []) else []
    return problems


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
    if routine.kind == Routine.KIND_WORK_CYCLE:
        if responses.get('mode') != 'shelf':
            return 0, False
        shelf = responses.get('shelf') or {}
        found = sum((shelf.get('counts') or {}).values())
        return found, 'safety' in (shelf.get('flags') or [])
    audit = responses if routine.kind == Routine.KIND_SECTION_AUDIT else (responses.get('audit') or {})
    found = sum((audit.get('counts') or {}).values())
    failed_checks = sum(
        1 for row in (responses.get('checks') or []) if (row.get('result') or '') == 'fail'
    )
    return found + failed_checks, 'safety' in (audit.get('flags') or [])
