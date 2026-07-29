"""QA control catalog — the palette of feedback widgets available in forms.

Single source of truth for the control kinds the backend validates and the
frontend mirrors. Each control knows which optional fields it uses and whether
it needs ``options`` (chips / zone).
"""

from __future__ import annotations

from typing import Any

# Control kind -> (label, needs_options)
QA_CONTROLS: dict[str, tuple[str, bool]] = {
    'yesno': ('Yes / No / N-A', False),
    'thumbs': ('Thumbs up / down', False),
    'rating': ('5-star rating', False),
    'emoji': ('Emoji satisfaction', False),
    'severity': ('Severity', False),
    'slider': ('Condition slider 0-100', False),
    'chips': ('Multi-select issue chips', True),
    'counter': ('Numeric counter', False),
    'zone': ('Single-select zone', True),
    'photo': ('Photo capture (mock)', False),
    'confidence': ('Confidence', False),
    'toggle': ('Compliant toggle', False),
    'priority': ('Priority', False),
    'comment': ('Comment / notes', False),
    'grade': ('Letter grade A-F', False),
}

VALID_CONTROLS = frozenset(QA_CONTROLS.keys())

# Optional per-check fields each control may store (besides result/notes).
CONTROL_FIELDS: dict[str, tuple[str, ...]] = {
    'yesno': (),
    'thumbs': (),
    'rating': ('rating',),
    'emoji': ('rating',),
    'severity': ('severity',),
    'slider': ('score',),
    'chips': ('tags',),
    'counter': ('count',),
    'zone': ('zone',),
    'photo': ('photo',),
    'confidence': ('confidence',),
    'toggle': (),
    'priority': ('priority',),
    'comment': ('comment',),
    'grade': ('letter',),
}

VALID_SEVERITY = frozenset({'none', 'minor', 'major', 'critical'})
VALID_CONFIDENCE = frozenset({'high', 'med', 'low'})
VALID_PRIORITY = frozenset({'low', 'med', 'high', 'urgent'})
VALID_LETTERS = frozenset({'A', 'B', 'C', 'D', 'F'})


def empty_check_values(control: str) -> dict[str, Any]:
    """Blank values for every optional field (so the client always has a shape)."""
    base: dict[str, Any] = {
        'result': '',
        'notes': '',
        'rating': None,
        'severity': None,
        'tags': [],
        'count': None,
        'zone': None,
        'photo': None,
        'confidence': None,
        'priority': None,
        'comment': '',
        'letter': '',
        'score': None,
        'touched': False,
    }
    return base


def derive_result(check: dict[str, Any]) -> str:
    """Server-side re-derivation of pass/fail/na from stored control fields."""
    control = (check.get('control') or 'yesno').strip().lower()
    result = (check.get('result') or '').strip().lower()
    if result in ('pass', 'fail', 'na'):
        return result

    rating = check.get('rating')
    severity = (check.get('severity') or '').strip().lower()
    score = check.get('score')
    tags = check.get('tags') or []
    count = check.get('count')
    zone = check.get('zone')
    photo = check.get('photo')
    confidence = (check.get('confidence') or '').strip().lower()
    priority = (check.get('priority') or '').strip().lower()
    comment = (check.get('comment') or '').strip()
    letter = (check.get('letter') or '').strip().upper()
    touched = bool(check.get('touched'))

    if control in ('rating', 'emoji'):
        if isinstance(rating, (int, float)):
            if rating >= 4:
                return 'pass'
            if rating <= 2:
                return 'fail'
            return 'na'
        return ''
    if control == 'severity':
        return 'pass' if severity == 'none' else ('fail' if severity in VALID_SEVERITY else '')
    if control == 'slider':
        if isinstance(score, (int, float)):
            if score >= 80:
                return 'pass'
            if score <= 50:
                return 'fail'
            return 'na'
        return ''
    if control == 'chips':
        # Untouched chips cannot distinguish "no issues" from "never opened".
        if not touched:
            return ''
        return 'pass' if not tags else 'fail'
    if control == 'counter':
        if isinstance(count, (int, float)):
            return 'pass' if count == 0 else 'fail'
        return ''
    if control == 'zone':
        return 'pass' if zone else ''
    if control == 'photo':
        # No photo = unanswered (auditor may mark N/A via explicit result).
        return 'pass' if photo else ''
    if control == 'confidence':
        return 'pass' if confidence in VALID_CONFIDENCE else ''
    if control == 'priority':
        return 'pass' if priority in VALID_PRIORITY else ''
    if control == 'comment':
        return 'pass' if comment else ''
    if control == 'grade':
        return 'pass' if letter in ('A', 'B', 'C') else ('fail' if letter in ('D', 'F') else '')
    return ''


def validate_definition(definition: dict[str, Any]) -> list[str]:
    """Return human-readable errors for a malformed form definition."""
    errors: list[str] = []
    if not isinstance(definition, dict):
        return ['Definition must be an object.']
    sections = definition.get('sections')
    if not isinstance(sections, list) or not sections:
        errors.append('At least one section is required.')
        return errors

    seen_section_ids: set[str] = set()
    for section in sections:
        if not isinstance(section, dict):
            errors.append('Each section must be an object.')
            continue
        sec_id = (section.get('id') or '').strip()
        if not sec_id:
            errors.append('Section id is required.')
        elif sec_id in seen_section_ids:
            errors.append(f'Duplicate section id: {sec_id}.')
        else:
            seen_section_ids.add(sec_id)
        if not (section.get('title') or '').strip():
            errors.append(f'Section {sec_id or "?"}: title is required.')
        checks = section.get('checks')
        if not isinstance(checks, list) or not checks:
            errors.append(f'Section {sec_id or "?"}: needs at least one check.')
            continue
        seen_check_ids: set[str] = set()
        for check in checks:
            if not isinstance(check, dict):
                errors.append(f'Section {sec_id or "?"}: each check must be an object.')
                continue
            chk_id = (check.get('id') or '').strip()
            if not chk_id:
                errors.append(f'Section {sec_id or "?"}: check id is required.')
            elif chk_id in seen_check_ids:
                errors.append(f'Section {sec_id or "?"}: duplicate check id {chk_id}.')
            else:
                seen_check_ids.add(chk_id)
            if not (check.get('label') or '').strip():
                errors.append(f'Section {sec_id or "?"}: check {chk_id or "?"} label is required.')
            control = (check.get('control') or '').strip().lower()
            if control not in VALID_CONTROLS:
                errors.append(f'Section {sec_id or "?"}: check {chk_id or "?"} has unknown control "{control}".')
                continue
            needs_options = QA_CONTROLS[control][1]
            options = check.get('options')
            if needs_options:
                if not isinstance(options, list) or not options or not all(isinstance(o, str) and o.strip() for o in options):
                    errors.append(f'Section {sec_id or "?"}: check {chk_id or "?"} needs a non-empty options list.')
    return errors


def build_responses_from_definition(definition: dict[str, Any]) -> dict[str, Any]:
    """Seed a blank responses payload from a form definition."""
    sections_out = []
    for section in definition.get('sections', []):
        checks_out = []
        for check in section.get('checks', []):
            values = empty_check_values((check.get('control') or 'yesno').strip().lower())
            checks_out.append({
                'id': check.get('id'),
                'label': check.get('label'),
                'control': (check.get('control') or 'yesno').strip().lower(),
                'hint': check.get('hint') or '',
                'options': list(check.get('options') or []),
                **values,
            })
        sections_out.append({
            'id': section.get('id'),
            'title': section.get('title'),
            'intro': section.get('intro') or '',
            'icon': section.get('icon') or '',
            'checks': checks_out,
        })
    return {
        'template_version': definition.get('template_version', 1),
        'sections': sections_out,
    }
