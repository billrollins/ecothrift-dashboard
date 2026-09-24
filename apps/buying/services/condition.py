"""
Listing condition → one of six groups, and the revenue shrink each group uses (register AUC-05).

``Auction.condition_summary`` is B-Stock's listing condition, 99.9% filled (runner R-024).
The same phrase can arrive as ``Used Good`` or ``['Used Good']``; a combined value
(``Salvage, Used Fair``) takes the worst group.

Shrink per group lives in Admin > Assumptions as ``buying_shrink_<group>``. 0 means "use the
buying revenue shrink" (``pricing_shrinkage_factor``), so nothing changes until the owner sets
a group. There is no won-auction outcome data to fit these yet (R-024: no auction → PO link).
"""
from __future__ import annotations

import re
from decimal import Decimal

from apps.core.models import AppSetting

NEW = 'new'
LIKE_NEW = 'like_new'
USED_GOOD = 'used_good'
USED_FAIR = 'used_fair'
DAMAGED = 'damaged'
UNSPECIFIED = 'unspecified'

# Worst first: a combined condition takes the lowest rank.
CONDITION_GROUPS = (DAMAGED, USED_FAIR, USED_GOOD, LIKE_NEW, NEW)
CONDITION_LABEL = {
    NEW: 'New',
    LIKE_NEW: 'Like new',
    USED_GOOD: 'Used good',
    USED_FAIR: 'Used fair',
    DAMAGED: 'Damaged',
    UNSPECIFIED: 'Unspecified',
}
SHRINK_SETTING_KEYS = {g: f'buying_shrink_{g}' for g in CONDITION_GROUPS}


def _group_of_part(part: str) -> str | None:
    p = part.strip().lower()
    if not p:
        return None
    if 'salvage' in p or 'scratch' in p or 'dent' in p or 'damage' in p:
        return DAMAGED
    if 'fair' in p:
        return USED_FAIR
    if 'good' in p:
        return USED_GOOD
    if 'like new' in p or 'open box' in p:
        return LIKE_NEW
    if re.search(r'\bnew\b', p):
        return NEW
    return None


def condition_group(text: str | None) -> str:
    """Group for a listing condition string; ``unspecified`` when nothing is recognized."""
    raw = re.sub(r"[\[\]'\"]", '', str(text or ''))
    found = [g for g in (_group_of_part(x) for x in raw.split(',')) if g]
    if not found:
        return UNSPECIFIED
    return min(found, key=CONDITION_GROUPS.index)


def get_condition_shrink(using: str = 'default') -> dict[str, Decimal]:
    """Groups the owner has set (value above 0). Unset groups fall back to the global shrink."""
    out: dict[str, Decimal] = {}
    try:
        rows = AppSetting.objects.using(using).filter(key__in=list(SHRINK_SETTING_KEYS.values()))
        by_key = {r.key: r.value for r in rows}
    except Exception:  # noqa: BLE001 - valuation must not fail on settings
        return out
    for group, key in SHRINK_SETTING_KEYS.items():
        try:
            v = Decimal(str(by_key.get(key, 0)))
        except Exception:  # noqa: BLE001
            continue
        if Decimal('0') < v < Decimal('1'):
            out[group] = v
    return out


def shrink_for(
    shrinkage_override: Decimal | None,
    condition_summary: str | None,
    global_shrink: Decimal,
    condition_shrink: dict[str, Decimal],
) -> tuple[Decimal, str]:
    """``(shrink, source)``: source is ``override`` | ``condition`` | ``global``."""
    if shrinkage_override is not None:
        return shrinkage_override, 'override'
    group = condition_group(condition_summary)
    if group in condition_shrink:
        return condition_shrink[group], 'condition'
    return global_shrink, 'global'
