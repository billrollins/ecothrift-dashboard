"""Tunables for the Retail QA program, read from AppSetting.

Every number a manager might argue about lives here rather than in the scoring
code, so the standard can move without a deploy. Defaults are the ones the
three-thirds design launched with.
"""
from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta
from typing import Any

from apps.core.models import AppSetting
from apps.webstore.services.hours import DEFAULT_HOURS, _parse_hhmm, effective_day

PREFIX = 'retail_qa.'

SPOT_ISSUE_HOURS_AFTER_OPEN = 6
SPOT_ISSUE_HOURS_BEFORE_CLOSE = 2
LATE_AMBER_MINUTES = 15
LATE_RED_MINUTES = 30
CALL_IN_UNDO_SECONDS = 10
NUDGE_UNSEEN_MINUTES = 15
SECTION_DUE_AFTER_PUNCH_MINUTES = 60
# Mon–Sun. Open days Tue–Sat on, Sun/Mon off.
SECTION_CHECK_WEEKDAYS = [False, True, True, True, True, True, False]
WEIGHT_SPOT = 60
WEIGHT_DO = 25
WEIGHT_CROSS = 15
WALK_FLOOR = 3
IDLE_STRETCH_MINUTES = 20
DIAG_OWNER_ITEMS = 5
DIAG_CHECKER_SPOT = 70

VERIFY_LADDER = [
    {'cutoff': 0, 'score': 100},
    {'cutoff': 1, 'score': 85},
    {'cutoff': 2, 'score': 60},
    {'cutoff': 3, 'score': 30},
    {'cutoff': 4, 'score': 0},
]

OWNER_LADDER = [
    {'cutoff': 0.10, 'score': 100},
    {'cutoff': 0.25, 'score': 85},
    {'cutoff': 0.50, 'score': 60},
    {'cutoff': 1.00, 'score': 25},
]

SEVERITY_GROUPS = [
    {'key': 'standard', 'label': 'Standard', 'weight': 1, 'r_add': 0},
    {'key': 'security', 'label': 'Security', 'weight': 3, 'r_add': 0.25},
    {'key': 'safety', 'label': 'Safety', 'weight': 3, 'r_add': 0.25},
]

DEFAULTS: dict[str, Any] = {
    'baseline_window': 100,
    'baseline_shrink': 10,
    'warmup_section': 10,
    'warmup_store': 50,
    'cross_full_tail': 0.025,
    'cross_zero_tail': 0.002,
    'verify_ladder': VERIFY_LADDER,
    'cross_check_weekday': 1,
    'owner_ladder': OWNER_LADDER,
    'owner_grace': 1,
    'owner_divisor_floor': 2,
    'spot_check_count': 3,
    'severity_groups': SEVERITY_GROUPS,
    'safety_cap': 50,
    'flag_window': 8,
    'flag_z': -2,
    'flag_min_expected': 6,
    'flag_followup_r': 0.5,
    'flag_min_seconds': 90,
    'flag_batch_minutes': 5,
    'flag_rubber_stamp_window': 20,
    'idle_prompt_minutes': 5,
    'idle_stretch_minutes': IDLE_STRETCH_MINUTES,
    'walk_floor': WALK_FLOOR,
    'weight_spot': WEIGHT_SPOT,
    'weight_do': WEIGHT_DO,
    'weight_cross': WEIGHT_CROSS,
    'section_due_after_punch_minutes': SECTION_DUE_AFTER_PUNCH_MINUTES,
    'section_check_weekdays': SECTION_CHECK_WEEKDAYS,
    'grade_a': 90,
    'grade_b': 80,
    'grade_c': 70,
    'grade_d': 60,
}

RETIRED_KEYS = (
    'owner_weight',
    'weekly_daily_weight',
    'late_credit',
    'audit_minor_max',
    'audit_needs_work_max',
    'audit_min_items',
)

SETTING_HELP = {
    'baseline_window': 'How many recent tallies (and unflagged cross-checks) build a section baseline.',
    'baseline_shrink': 'Blend a thin section toward the store: n / (n + this).',
    'warmup_section': 'A section below this many tallies is still warming up.',
    'warmup_store': 'The store below this many tallies is still warming up.',
    'cross_full_tail': 'Tail at or above this scores 100 on a cross-check.',
    'cross_zero_tail': 'Tail at or below this scores 0 on a cross-check.',
    'verify_ladder': 'Score for how many verify items were found not done.',
    'cross_check_weekday': '0=Mon … 6=Sun. Moves to the next open day if the store is closed.',
    'owner_ladder': 'Residual R (leftover as a fraction of a normal day) to score.',
    'owner_grace': 'Items ignored before leftover starts counting.',
    'owner_divisor_floor': 'R never divides by less than this, so a quiet aisle is not punished for one extra item.',
    'spot_check_count': 'Random Open/Day/Close checks drawn into an owner spot.',
    'severity_groups': 'Name, check weight, and how much leftover each group adds to R.',
    'safety_cap': 'A safety flag cannot score above this.',
    'flag_window': 'Trailing audits (or weeks) a checker flag looks at.',
    'flag_z': 'Low-findings flag when trailing z is below this.',
    'flag_min_expected': 'Low-findings flag only when expected findings reach this.',
    'flag_followup_r': 'Owner leftover above this counts against the checker who just walked the aisle.',
    'flag_min_seconds': 'A cross-check faster than this many seconds per section is flagged.',
    'flag_batch_minutes': 'Own tally and cross-check submitted within this many minutes is flagged.',
    'flag_rubber_stamp_window': 'All-confirmed verifications before a rubber-stamp flag can fire.',
    'idle_prompt_minutes': 'Minutes with no cart on the register before it asks for a work cycle.',
    'idle_stretch_minutes': 'Idle stretches longer than this are listed next to cashier names. They do not change the grade.',
    'walk_floor': 'Fewer than this many spot walks in a week caps the week at B. Zero walks caps at C.',
    'weight_spot': 'Share of the week grade that comes from owner spot walks.',
    'weight_do': 'Share of the week grade that comes from routines done over expected.',
    'weight_cross': 'Share of the week grade that comes from cross-checks, after the due date.',
    'section_due_after_punch_minutes': 'Minutes after an owner punches in before their section check is due.',
    'section_check_weekdays': 'Days a section check is required. Default is every open day (Tue–Sat).',
    'grade_a': 'Lowest score that still earns an A.',
    'grade_b': 'Lowest score that still earns a B.',
    'grade_c': 'Lowest score that still earns a C.',
    'grade_d': 'Lowest score that still earns a D. Anything below this is an F.',
}


def _coerce(name: str, raw: Any, fallback: Any) -> Any:
    if isinstance(fallback, list):
        return deepcopy(raw) if isinstance(raw, list) else deepcopy(fallback)
    if isinstance(fallback, dict):
        return deepcopy(raw) if isinstance(raw, dict) else deepcopy(fallback)
    try:
        if isinstance(fallback, bool):
            return bool(raw)
        if isinstance(fallback, int) and not isinstance(fallback, bool):
            return int(float(raw))
        return float(raw)
    except (TypeError, ValueError):
        return deepcopy(fallback)


def retail_qa_settings() -> dict[str, Any]:
    """Current values, defaults filled in for anything unset or unparsable."""
    stored = {
        key[len(PREFIX):]: value
        for key, value in AppSetting.objects.filter(key__startswith=PREFIX).values_list('key', 'value')
    }
    out: dict[str, Any] = {}
    for name, fallback in DEFAULTS.items():
        out[name] = _coerce(name, stored.get(name, fallback), fallback)
    return out


def settings_snapshot(cfg: dict[str, Any] | None = None) -> dict[str, Any]:
    return deepcopy(cfg or retail_qa_settings())


def letter_for(score: float, cfg: dict[str, Any] | None = None) -> str:
    cfg = cfg or retail_qa_settings()
    for letter in ('a', 'b', 'c', 'd'):
        if score >= float(cfg[f'grade_{letter}']):
            return letter.upper()
    return 'F'


def score_ladder(value: float, rows: list[dict], *, above: float = 0.0) -> float:
    """First cutoff the value still fits under. Cutoffs must be ascending."""
    ordered = sorted(
        (
            {'cutoff': float(row.get('cutoff', 0)), 'score': float(row.get('score', 0))}
            for row in (rows or [])
        ),
        key=lambda row: row['cutoff'],
    )
    for row in ordered:
        if value <= row['cutoff'] + 1e-12:
            return row['score']
    return above if ordered else 100.0


def severity_map(cfg: dict[str, Any] | None = None) -> dict[str, dict]:
    cfg = cfg or retail_qa_settings()
    out = {}
    for row in cfg.get('severity_groups') or SEVERITY_GROUPS:
        key = str(row.get('key') or '').strip()
        if not key:
            continue
        out[key] = {
            'key': key,
            'label': row.get('label') or key,
            'weight': float(row.get('weight') or 1),
            'r_add': float(row.get('r_add') or 0),
        }
    if 'standard' not in out:
        out['standard'] = {'key': 'standard', 'label': 'Standard', 'weight': 1.0, 'r_add': 0.0}
    return out


def open_hours_for(day: date, *, hours_cfg: dict | None = None) -> float:
    """How many hours the store is open that day. Closed days are 0."""
    hours = effective_day(day, cfg=hours_cfg)
    if not hours.open:
        return 0.0
    start = datetime.combine(day, _parse_hhmm(hours.open_hhmm or DEFAULT_HOURS['open']))
    end = datetime.combine(day, _parse_hhmm(hours.close_hhmm or DEFAULT_HOURS['close']))
    if end <= start:
        end += timedelta(days=1)
    return max((end - start).total_seconds() / 3600.0, 0.0)


def _as_ladder(value: Any) -> list[dict]:
    if not isinstance(value, list) or not value:
        raise ValueError('Need at least one cutoff / score row.')
    rows = []
    for row in value:
        if not isinstance(row, dict):
            raise ValueError('Each ladder row is a cutoff and a score.')
        try:
            cutoff = float(row.get('cutoff'))
            score = float(row.get('score'))
        except (TypeError, ValueError):
            raise ValueError('Cutoff and score must be numbers.')
        if not 0 <= score <= 100:
            raise ValueError('Scores must be 0 to 100.')
        rows.append({'cutoff': cutoff, 'score': score})
    cutoffs = [row['cutoff'] for row in rows]
    scores = [row['score'] for row in rows]
    if cutoffs != sorted(cutoffs):
        raise ValueError('Cutoffs must be in ascending order.')
    if scores != sorted(scores, reverse=True):
        raise ValueError('Scores must be in descending order.')
    return rows


def _as_severity(value: Any) -> list[dict]:
    if not isinstance(value, list) or not value:
        raise ValueError('Need at least one severity group.')
    seen = set()
    out = []
    for row in value:
        if not isinstance(row, dict):
            raise ValueError('Each group needs a name, weight, and R add.')
        key = str(row.get('key') or '').strip()
        if not key or key in seen:
            raise ValueError('Each group needs its own key.')
        try:
            weight = float(row.get('weight') or 0)
            r_add = float(row.get('r_add') or 0)
        except (TypeError, ValueError):
            raise ValueError('Weight and R add must be numbers.')
        if weight <= 0:
            raise ValueError('Weight must be greater than 0.')
        seen.add(key)
        out.append({
            'key': key,
            'label': str(row.get('label') or key),
            'weight': weight,
            'r_add': r_add,
        })
    return out


def validate_retail_qa_value(name: str, value: Any) -> Any:
    """Raise ValueError if a retail_qa setting cannot be stored."""
    if name not in DEFAULTS:
        raise ValueError(f'Unknown Retail QA setting {name}.')
    if name in ('verify_ladder', 'owner_ladder'):
        return _as_ladder(value)
    if name == 'severity_groups':
        return _as_severity(value)
    if name == 'cross_check_weekday':
        day = int(value)
        if day < 0 or day > 6:
            raise ValueError('Weekday is 0 (Monday) through 6 (Sunday).')
        return day
    if name == 'section_check_weekdays':
        if not isinstance(value, list) or len(value) != 7:
            raise ValueError('Need seven weekdays, Monday through Sunday.')
        return [bool(item) for item in value]
    if name in ('cross_full_tail', 'cross_zero_tail'):
        number = float(value)
        if not 0 < number < 1:
            raise ValueError('A tail threshold must be between 0 and 1.')
        return number
    if name.startswith('grade_'):
        number = float(value)
        if not 0 <= number <= 100:
            raise ValueError('A letter cutoff is 0 to 100.')
        return number
    fallback = DEFAULTS[name]
    return _coerce(name, value, fallback)


def validate_retail_qa_bundle(cfg: dict[str, Any]) -> list[str]:
    """Cross-key checks. Empty means the bundle can be saved."""
    errors = []
    zero = float(cfg.get('cross_zero_tail', DEFAULTS['cross_zero_tail']))
    full = float(cfg.get('cross_full_tail', DEFAULTS['cross_full_tail']))
    if not zero < full:
        errors.append('Zero tail must be smaller than the full-marks tail.')
    grades = [float(cfg.get(f'grade_{letter}', DEFAULTS[f'grade_{letter}'])) for letter in ('a', 'b', 'c', 'd')]
    if grades != sorted(grades, reverse=True):
        errors.append('Letter cutoffs must descend A > B > C > D.')
    return errors
