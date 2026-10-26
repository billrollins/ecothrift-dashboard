"""Supplies numbers the owner can change in Settings → Store → Supplies (`supplies.*` AppSettings).

Owner, 2026-10-26: the count is due Monday 3 pm store time. The shipped default is used while a key is unset or
unreadable.
"""
from __future__ import annotations

import re
from datetime import time
from typing import Any

from apps.core.models import AppSetting

PREFIX = 'supplies.'

DEFAULTS: dict[str, Any] = {
    # 0 = Monday … 6 = Sunday.
    'count_weekday': 0,
    # Store time, 24-hour HH:MM.
    'count_due_time': '15:00',
    # The order build checks each non-Amazon link once and flags the ones that are gone (404 / 410).
    'check_links': True,
}

_TIME = re.compile(r'^\s*(\d{1,2}):(\d{2})\s*$')


def parse_time(raw) -> time | None:
    m = _TIME.match(str(raw or ''))
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))
    if hour > 23 or minute > 59:
        return None
    return time(hour, minute)


def supplies_settings() -> dict[str, Any]:
    rows = dict(AppSetting.objects.filter(key__startswith=PREFIX).values_list('key', 'value'))
    out = dict(DEFAULTS)
    try:
        day = int(rows.get(PREFIX + 'count_weekday', DEFAULTS['count_weekday']))
    except (TypeError, ValueError):
        day = DEFAULTS['count_weekday']
    out['count_weekday'] = day if 0 <= day <= 6 else DEFAULTS['count_weekday']
    due = rows.get(PREFIX + 'count_due_time')
    if parse_time(due) is not None:
        out['count_due_time'] = str(due).strip()
    links = rows.get(PREFIX + 'check_links')
    if isinstance(links, bool):
        out['check_links'] = links
    return out
