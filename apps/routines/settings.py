"""Tunables for the Retail QA program, read from AppSetting.

Every number a manager might argue about lives here rather than in the scoring
code, so the standard can move without a deploy. Defaults are the ones the
program launched with.
"""
from __future__ import annotations

from apps.core.models import AppSetting

DEFAULTS: dict[str, float] = {
    # Weight of the owner's spot check in a day that has one.
    'owner_weight': 0.50,
    # Weight of the daily average inside the weekly grade; the rest is cross-checks.
    'weekly_daily_weight': 0.75,
    # Credit a checklist still earns when it was done, but done late.
    'late_credit': 0.50,
    'grade_a': 90,
    'grade_b': 80,
    'grade_c': 70,
    'grade_d': 60,
    # Issue counts in a graded cross-check category: <= minor scores 75,
    # <= needs_work scores 50, beyond that 0.
    'audit_minor_max': 2,
    'audit_needs_work_max': 5,
    # Fewer items than this is a glance, not an audit; the submit is refused.
    'audit_min_items': 20,
    # Random checks drawn into the owner's daily spot check.
    'spot_check_count': 2,
    # Minutes with no cart on the register before the work-cycle prompt.
    'idle_prompt_minutes': 5,
}

PREFIX = 'retail_qa.'


def retail_qa_settings() -> dict[str, float]:
    """Current values, defaults filled in for anything unset or unparsable."""
    stored = dict(
        AppSetting.objects.filter(key__startswith=PREFIX).values_list('key', 'value')
    )
    out: dict[str, float] = {}
    for name, fallback in DEFAULTS.items():
        raw = stored.get(f'{PREFIX}{name}', fallback)
        try:
            out[name] = float(raw)
        except (TypeError, ValueError):
            out[name] = float(fallback)
    return out


def letter_for(score: float, cfg: dict[str, float] | None = None) -> str:
    cfg = cfg or retail_qa_settings()
    for letter in ('a', 'b', 'c', 'd'):
        if score >= cfg[f'grade_{letter}']:
            return letter.upper()
    return 'F'
