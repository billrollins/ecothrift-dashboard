"""Slim checklist definition: five controls, server-derived results.

`RoutineSubmission.responses` carries one of five shapes, chosen by
`Routine.kind`. Only the first is authored in the editor; the others are fixed
by their runner, which is why their definitions are left empty.

`checklist`
    ``{template_version, sections: [{id, title, checks: [...]}]}``
    Plus ``verify: {run_id, checks: [{check_id, result, note}]}`` when the
    routine verifies another - one row per check the next shift confirms.

`section_tally`
    ``{sections: [{section_id, section_name, counts: {<category>: n}, flags: [...], notes}]}``
    Counts only. Never scored: a busy aisle is not a failing aisle.

`section_audit`
    ``{section_id, section_name, photo, photo_file_id, items_inspected,
    counts: {<category>: n}, flags: [...], notes}``

`owner_spot`
    ``{checks: [{routine_key, check_id, label, result}], audit: <section_audit>}``

`work_cycle`
    ``{mode: 'shelf'|'non_shelf'|'',
    shelf: {section_id, section_name, counts, flags, photo, notes},
    non_shelf: {done: [check_id...], notes}}``
    On-demand log. Never scored. Non-shelf ticks come from Day.

Category keys come from `AUDIT_CATEGORIES` below so the phone, the score, and
the Grades view all read the same taxonomy.
"""
from __future__ import annotations

from typing import Any

CONTROLS = frozenset({
    'pass_fail',
    'pass_fail_strict',
    'number',
    'text',
    'photo',
})

RESULTS = frozenset({'pass', 'fail', 'na'})


def empty_check_values(control: str) -> dict[str, Any]:
    return {
        'result': '',
        'value': None,
        'photo': None,
        'photo_file_id': None,
        'notes': '',
        'touched': False,
    }


def derive_result(check: dict[str, Any]) -> str:
    control = (check.get('control') or 'pass_fail').strip().lower()
    explicit = (check.get('result') or '').strip().lower()
    if control == 'pass_fail' and explicit in RESULTS:
        return explicit
    if control == 'pass_fail_strict' and explicit in ('pass', 'fail'):
        return explicit
    if control == 'number':
        value = check.get('value')
        return 'pass' if isinstance(value, (int, float)) else ''
    if control == 'text':
        return 'pass' if str(check.get('value') or '').strip() else ''
    if control == 'photo':
        return 'pass' if check.get('photo') else ''
    return ''


def validate_definition(definition: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(definition, dict):
        return ['Definition must be an object.']
    sections = definition.get('sections')
    if not isinstance(sections, list) or not sections:
        return ['At least one section is required.']
    seen_sections: set[str] = set()
    for section in sections:
        if not isinstance(section, dict):
            errors.append('Each section must be an object.')
            continue
        sec_id = (section.get('id') or '').strip()
        if not sec_id:
            errors.append('Section id is required.')
        elif sec_id in seen_sections:
            errors.append(f'Duplicate section id: {sec_id}.')
        else:
            seen_sections.add(sec_id)
        if not (section.get('title') or '').strip():
            errors.append(f'Section {sec_id or "?"}: title is required.')
        checks = section.get('checks')
        if not isinstance(checks, list) or not checks:
            errors.append(f'Section {sec_id or "?"}: needs at least one check.')
            continue
        seen_checks: set[str] = set()
        for check in checks:
            if not isinstance(check, dict):
                errors.append(f'Section {sec_id or "?"}: each check must be an object.')
                continue
            chk_id = (check.get('id') or '').strip()
            if not chk_id:
                errors.append(f'Section {sec_id or "?"}: check id is required.')
            elif chk_id in seen_checks:
                errors.append(f'Section {sec_id or "?"}: duplicate check id {chk_id}.')
            else:
                seen_checks.add(chk_id)
            if not (check.get('label') or '').strip():
                errors.append(f'Section {sec_id or "?"}: check {chk_id or "?"} label is required.')
            control = (check.get('control') or '').strip().lower()
            if control not in CONTROLS:
                errors.append(
                    f'Section {sec_id or "?"}: check {chk_id or "?"} has unknown control "{control}".'
                )
    return errors


def build_responses(definition: dict[str, Any]) -> dict[str, Any]:
    sections_out = []
    for section in definition.get('sections') or []:
        checks_out = []
        for check in section.get('checks') or []:
            control = (check.get('control') or 'pass_fail').strip().lower()
            checks_out.append({
                'id': check.get('id'),
                'label': check.get('label'),
                'label_es': check.get('label_es') or '',
                'control': control,
                'hint': check.get('hint') or '',
                'hint_es': check.get('hint_es') or '',
                'unit': check.get('unit') or '',
                'critical': bool(check.get('critical')),
                'verify_prev': bool(check.get('verify_prev')),
                **empty_check_values(control),
            })
        sections_out.append({
            'id': section.get('id'),
            'title': section.get('title'),
            'title_es': section.get('title_es') or '',
            'checks': checks_out,
        })
    return {
        'template_version': definition.get('template_version', 1),
        'sections': sections_out,
    }


def _prior_checks(responses: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    if not isinstance(responses, dict):
        return found
    for section in responses.get('sections') or []:
        if not isinstance(section, dict):
            continue
        for check in section.get('checks') or []:
            if isinstance(check, dict) and check.get('id'):
                found[str(check['id'])] = check
    return found


def merge_responses(
    definition: dict[str, Any],
    responses: dict[str, Any] | None,
) -> dict[str, Any]:
    """Rebuild answers onto the current definition. Keep values for surviving check ids."""
    fresh = build_responses(definition or {})
    prior = _prior_checks(responses)
    keep = ('result', 'value', 'photo', 'photo_file_id', 'notes', 'touched')
    for section in fresh['sections']:
        for check in section['checks']:
            old = prior.get(str(check.get('id') or ''))
            if not old:
                continue
            if (old.get('control') or '') == check['control']:
                for key in keep:
                    if key in old:
                        check[key] = old[key]
            elif old.get('notes'):
                check['notes'] = old['notes']
            check['result'] = derive_result(check)
    return fresh


def normalize_responses(responses: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(responses, dict):
        return {'template_version': 1, 'sections': []}
    sections = []
    for section in responses.get('sections') or []:
        if not isinstance(section, dict):
            continue
        checks = []
        for check in section.get('checks') or []:
            if not isinstance(check, dict):
                continue
            derived = derive_result(check)
            check = {**check, 'result': derived}
            checks.append(check)
        sections.append({**section, 'checks': checks})
    return {**responses, 'sections': sections}


def score_responses(responses: dict[str, Any]) -> tuple[int, bool, list[str]]:
    """Return (failed_count, has_critical_fail, unanswered ids)."""
    failed = 0
    critical = False
    unanswered: list[str] = []
    for section in responses.get('sections') or []:
        for check in section.get('checks') or []:
            result = derive_result(check)
            if not result:
                unanswered.append(str(check.get('id') or ''))
                continue
            if result == 'fail':
                failed += 1
                if check.get('critical'):
                    critical = True
    return failed, critical, [i for i in unanswered if i]
