"""The weekly count deadline (Settings → Store → Supplies; Monday 15:00 store time by default).

A count cycle is named by the Monday of the week its deadline falls in (`week_start`). The count staff do now
belongs to the next deadline at or after now; they may count again until that deadline (the last count wins).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from django.utils import timezone

from ..settings import parse_time, supplies_settings


def monday(day: date) -> date:
    return day - timedelta(days=day.weekday())


def deadline(week_start: date, cfg: dict | None = None) -> datetime:
    """The aware store-time deadline of the cycle named by `week_start`."""
    cfg = cfg or supplies_settings()
    due = parse_time(cfg['count_due_time'])
    day = week_start + timedelta(days=cfg['count_weekday'])
    return timezone.make_aware(datetime.combine(day, due), timezone.get_default_timezone())


def current_cycle(now: datetime | None = None, cfg: dict | None = None) -> date:
    """The cycle a count made now belongs to: the next deadline at or after now."""
    cfg = cfg or supplies_settings()
    now = now or timezone.now()
    ws = monday(timezone.localtime(now).date())
    return ws if now <= deadline(ws, cfg) else ws + timedelta(days=7)


def last_closed_cycle(now: datetime | None = None, cfg: dict | None = None) -> date:
    """The cycle whose deadline passed most recently."""
    cfg = cfg or supplies_settings()
    now = now or timezone.now()
    ws = monday(timezone.localtime(now).date())
    return ws if now > deadline(ws, cfg) else ws - timedelta(days=7)
