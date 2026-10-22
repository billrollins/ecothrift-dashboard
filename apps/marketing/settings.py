"""Social Studio numbers the owner can change in Settings > Store > Social Studio (`marketing.*` AppSettings).

Every number here is a starting guess (Bill has not given them); the shipped default is used while a key is unset
or unreadable.
"""
from __future__ import annotations

from typing import Any

from apps.core.models import AppSetting

PREFIX = 'marketing.'

DEFAULT_THRIFT_PLUS_LINE = (
    'Thrift+ is free to join, nothing owed. Members collect ThriftBucks on most items. '
    'Join at any register in a minute, or start on your phone from our website. '
    'ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value. Members 18+. '
    'Full terms on our website and at every register.'
)

DEFAULTS: dict[str, Any] = {
    # Mon..Sun. Owner call F2: one post per open day Tuesday to Saturday.
    'post_weekdays': [False, True, True, True, True, True, False],
    'min_photos': 3,
    # More words than the frame holds is a "never" (plan, Always include).
    'hook_max_chars': 80,
    # No category twice in this many days unless it is in season.
    'repeat_days': 14,
    # Categories in season now. Empty: the built-in calendar (Halloween in October, toys and gifts Nov-Dec).
    'in_season': [],
    # How much an in-season category's floor stock counts for in the rotation.
    'season_weight': 2,
    'thrift_plus_line': DEFAULT_THRIFT_PLUS_LINE,
}


def _number(value, default, *, low, high):
    try:
        n = float(value)
    except (TypeError, ValueError):
        return default
    if n != n or n < low or n > high:
        return default
    return int(n) if isinstance(default, int) else n


def marketing_settings() -> dict[str, Any]:
    rows = dict(AppSetting.objects.filter(key__startswith=PREFIX).values_list('key', 'value'))
    out = dict(DEFAULTS)
    days = rows.get(PREFIX + 'post_weekdays')
    if isinstance(days, list) and len(days) == 7:
        out['post_weekdays'] = [bool(day) for day in days]
    out['min_photos'] = _number(rows.get(PREFIX + 'min_photos', DEFAULTS['min_photos']), DEFAULTS['min_photos'], low=0, high=20)
    out['hook_max_chars'] = _number(
        rows.get(PREFIX + 'hook_max_chars', DEFAULTS['hook_max_chars']), DEFAULTS['hook_max_chars'], low=10, high=200,
    )
    out['repeat_days'] = _number(rows.get(PREFIX + 'repeat_days', DEFAULTS['repeat_days']), DEFAULTS['repeat_days'], low=0, high=120)
    season = rows.get(PREFIX + 'in_season')
    if isinstance(season, list):
        out['in_season'] = [str(name).strip() for name in season if str(name).strip()]
    out['season_weight'] = float(_number(
        rows.get(PREFIX + 'season_weight', DEFAULTS['season_weight']), float(DEFAULTS['season_weight']), low=0, high=10,
    ))
    line = rows.get(PREFIX + 'thrift_plus_line')
    if isinstance(line, str):
        out['thrift_plus_line'] = line.strip()
    return out
