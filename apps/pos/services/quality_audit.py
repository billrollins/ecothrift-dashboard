"""Quality audit validation and grade calculation."""

from __future__ import annotations

from typing import Any

from apps.pos.quality_audit_controls import (
    VALID_CONFIDENCE,
    VALID_CONTROLS,
    VALID_LETTERS,
    VALID_PRIORITY,
    VALID_SEVERITY,
    derive_result,
)

VALID_RESULTS = frozenset({'pass', 'fail', 'na'})

# Pass-rate bands → letter (+/-). Thresholds are inclusive lower bounds.
_GRADE_BANDS = [
    (0.98, 'A+'),
    (0.93, 'A'),
    (0.90, 'A-'),
    (0.87, 'B+'),
    (0.83, 'B'),
    (0.80, 'B-'),
    (0.77, 'C+'),
    (0.73, 'C'),
    (0.70, 'C-'),
    (0.67, 'D+'),
    (0.63, 'D'),
    (0.60, 'D-'),
]


def compute_overall_grade(responses: dict[str, Any]) -> str:
    """Map pass rate among scored checks (pass + fail) to a letter grade."""
    scored = 0
    passed = 0
    for section in responses.get('sections', []):
        for check in section.get('checks', []):
            result = (check.get('result') or '').strip().lower()
            if result in ('pass', 'fail'):
                scored += 1
                if result == 'pass':
                    passed += 1
    if scored == 0:
        return 'F'
    rate = passed / scored
    for threshold, grade in _GRADE_BANDS:
        if rate >= threshold:
            return grade
    return 'F'


def validate_responses_complete(responses: dict[str, Any]) -> list[str]:
    """Return human-readable errors when checks are missing results."""
    errors: list[str] = []
    for section in responses.get('sections', []):
        title = section.get('title') or section.get('id') or 'Section'
        for check in section.get('checks', []):
            result = derive_result(check)
            if result not in VALID_RESULTS:
                label = check.get('label') or check.get('id') or 'Check'
                errors.append(f'{title}: {label} needs an answer.')
    return errors


def normalize_responses(responses: dict[str, Any]) -> dict[str, Any]:
    """Normalize + sanitize every control field on save; re-derive result."""
    normalized = dict(responses)
    sections = []
    for section in responses.get('sections', []):
        checks = []
        for check in section.get('checks', []):
            control = (check.get('control') or 'yesno').strip().lower()
            if control not in VALID_CONTROLS:
                control = 'yesno'
            rating = check.get('rating')
            if rating is not None:
                try:
                    rating = max(1, min(5, int(rating)))
                except (TypeError, ValueError):
                    rating = None
            score = check.get('score')
            if score is not None:
                try:
                    score = max(0, min(100, int(score)))
                except (TypeError, ValueError):
                    score = None
            count = check.get('count')
            if count is not None:
                try:
                    count = max(0, int(count))
                except (TypeError, ValueError):
                    count = None
            severity = (check.get('severity') or '').strip().lower() if check.get('severity') else None
            if severity not in VALID_SEVERITY:
                severity = None
            confidence = (check.get('confidence') or '').strip().lower() if check.get('confidence') else None
            if confidence not in VALID_CONFIDENCE:
                confidence = None
            priority = (check.get('priority') or '').strip().lower() if check.get('priority') else None
            if priority not in VALID_PRIORITY:
                priority = None
            letter = (check.get('letter') or '').strip().upper()
            if letter not in VALID_LETTERS:
                letter = ''
            tags_raw = check.get('tags') or []
            tags = []
            if isinstance(tags_raw, list):
                seen: set[str] = set()
                for tag in tags_raw:
                    if isinstance(tag, str):
                        clean = tag.strip()
                        if clean and clean not in seen:
                            seen.add(clean)
                            tags.append(clean)
            zone = check.get('zone')
            if not isinstance(zone, str) or not zone.strip():
                zone = None
            else:
                zone = zone.strip()
            photo = check.get('photo')
            if not isinstance(photo, str) or not photo:
                photo = None
            comment = (check.get('comment') or '').strip() if isinstance(check.get('comment'), str) else ''
            notes = (check.get('notes') or '').strip() if isinstance(check.get('notes'), str) else ''
            touched = bool(check.get('touched'))

            base = {
                'id': check.get('id'),
                'label': check.get('label'),
                'control': control,
                'hint': check.get('hint') or '',
                'options': list(check.get('options') or []),
                'result': (check.get('result') or '').strip().lower(),
                'notes': notes,
                'rating': rating,
                'severity': severity,
                'tags': tags,
                'count': count,
                'zone': zone,
                'photo': photo,
                'confidence': confidence,
                'priority': priority,
                'comment': comment,
                'letter': letter,
                'score': score,
                'touched': touched,
            }
            base['result'] = derive_result(base) or base['result']
            if base['result'] not in VALID_RESULTS:
                base['result'] = ''
            checks.append(base)
        sections.append({**section, 'checks': checks})
    normalized['sections'] = sections
    return normalized
