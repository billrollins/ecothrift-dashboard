"""Store hours for hold expiry (Canfield defaults via AppSetting)."""
from __future__ import annotations

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

DEFAULT_HOURS = {
    'timezone': 'America/Chicago',
    'open': '09:00',
    'close': '18:00',
    # 0=Mon … 6=Sun
    'closed_weekdays': [6],
}


def get_hours_config() -> dict:
    try:
        from apps.core.models import AppSetting
        row = AppSetting.objects.filter(key='online_sales.hours').first()
        if row and isinstance(row.value, dict):
            merged = {**DEFAULT_HOURS, **row.value}
            return merged
    except Exception:
        pass
    return dict(DEFAULT_HOURS)


def _parse_hhmm(value: str) -> time:
    hour, minute = value.split(':')
    return time(int(hour), int(minute))


def next_business_day_close_after(moment=None):
    """Hold expiry: store close on the next business day after `moment`."""
    cfg = get_hours_config()
    tz = ZoneInfo(cfg.get('timezone') or 'America/Chicago')
    now = moment or timezone.now()
    if timezone.is_naive(now):
        local = timezone.make_aware(now, tz)
    else:
        local = now.astimezone(tz)

    close_t = _parse_hhmm(cfg.get('close') or '18:00')
    closed = set(cfg.get('closed_weekdays') or [6])

    day = (local + timedelta(days=1)).date()
    for _ in range(14):
        if day.weekday() not in closed:
            naive = datetime.combine(day, close_t)
            return timezone.make_aware(naive, tz)
        day = day + timedelta(days=1)
    # Fallback: +1 day close
    naive = datetime.combine((local + timedelta(days=1)).date(), close_t)
    return timezone.make_aware(naive, tz)
