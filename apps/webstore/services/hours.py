"""Store hours for hold expiry (Canfield defaults via AppSetting)."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone

DEFAULT_HOURS = {
    'timezone': 'America/Chicago',
    'open': '09:00',
    'close': '18:00',
    # 0=Mon … 6=Sun  (Canfield is closed Sunday and Monday)
    'closed_weekdays': [0, 6],
}

_DAY_NAMES = (
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
)


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


def public_hours_payload(cfg: dict | None = None) -> dict:
    """Safe subset of store hours for the public /config/ payload."""
    cfg = cfg or get_hours_config()
    closed = [
        int(n)
        for n in (cfg.get('closed_weekdays') or [])
        if str(n).isdigit() and 0 <= int(n) <= 6
    ]
    return {
        'timezone': cfg.get('timezone') or DEFAULT_HOURS['timezone'],
        'open': cfg.get('open') or DEFAULT_HOURS['open'],
        'close': cfg.get('close') or DEFAULT_HOURS['close'],
        'closed_weekdays': sorted(set(closed)),
        'label': format_hours_label(cfg),
    }


def _clock_label(hhmm: str) -> str:
    parsed = _parse_hhmm(hhmm)
    hour, minute = parsed.hour, parsed.minute
    suffix = 'AM' if hour < 12 else 'PM'
    hour12 = hour % 12 or 12
    if minute == 0:
        return f'{hour12} {suffix}'
    return f'{hour12}:{minute:02d} {suffix}'


def _phrase_range(first: int, last: int) -> str:
    if first == last:
        return _DAY_NAMES[first]
    if last == first + 1:
        return f'{_DAY_NAMES[first]} & {_DAY_NAMES[last]}'
    return f'{_DAY_NAMES[first]} - {_DAY_NAMES[last]}'


def _day_phrase(ids: list[int]) -> str:
    """Turn weekday ids into 'Tuesday - Saturday' / 'Sunday & Monday'."""
    if not ids:
        return ''
    ranges: list[tuple[int, int]] = []
    start = prev = ids[0]
    for day in ids[1:]:
        if day == prev + 1:
            prev = day
            continue
        ranges.append((start, prev))
        start = prev = day
    ranges.append((start, prev))
    parts = [_phrase_range(first, last) for first, last in ranges]
    if len(parts) == 2 and all(first == last for first, last in ranges):
        return f'{parts[0]} & {parts[1]}'
    return ', '.join(parts)


def _closed_display_order(closed: list[int]) -> list[int]:
    # Keep the public line as "Closed Sunday & Monday", not "Monday & Sunday".
    if set(closed) == {0, 6}:
        return [6, 0]
    return list(closed)


def format_hours_label(cfg: dict | None = None) -> str:
    """Public schedule line, e.g. 9 AM - 6 PM, Tuesday - Saturday · Closed Sunday & Monday."""
    cfg = {**DEFAULT_HOURS, **(cfg or {})}
    closed = sorted(
        {
            int(n)
            for n in (cfg.get('closed_weekdays') or [])
            if str(n).lstrip('-').isdigit() and 0 <= int(n) <= 6
        }
    )
    open_days = [i for i in range(7) if i not in set(closed)]
    clock = f"{_clock_label(str(cfg.get('open') or '09:00'))} - {_clock_label(str(cfg.get('close') or '18:00'))}"
    if not open_days:
        return f'Closed · {clock}'
    open_bit = _day_phrase(open_days)
    if not closed:
        return f'{clock}, {open_bit}'
    return f'{clock}, {open_bit} · Closed {_day_phrase(_closed_display_order(closed))}'


def _parse_hhmm(value: str) -> time:
    parts = str(value).split(':')
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0
    return time(hour, minute)


def _local_now(moment=None):
    cfg = get_hours_config()
    tz = ZoneInfo(cfg.get('timezone') or 'America/Chicago')
    now = moment or timezone.now()
    if timezone.is_naive(now):
        local = timezone.make_aware(now, tz)
    else:
        local = now.astimezone(tz)
    return local, cfg, tz


def is_open_day(day: date, *, cfg: dict | None = None) -> bool:
    cfg = cfg or get_hours_config()
    closed = set(cfg.get('closed_weekdays') or [6])
    return day.weekday() not in closed


def close_on(day: date, *, cfg: dict | None = None, tz: ZoneInfo | None = None):
    """Aware datetime for store close on `day`."""
    cfg = cfg or get_hours_config()
    if tz is None:
        tz = ZoneInfo(cfg.get('timezone') or 'America/Chicago')
    close_t = _parse_hhmm(cfg.get('close') or '18:00')
    naive = datetime.combine(day, close_t)
    return timezone.make_aware(naive, tz)


def _next_open_day(start: date, *, cfg: dict, inclusive: bool = True) -> date:
    day = start if inclusive else start + timedelta(days=1)
    for _ in range(21):
        if is_open_day(day, cfg=cfg):
            return day
        day = day + timedelta(days=1)
    return start


def next_business_day_close_after(moment=None):
    """Hold expiry: store close on the next business day after `moment`.

    Kept for staff `extend` and reopen fallbacks.
    """
    local, cfg, tz = _local_now(moment)
    day = _next_open_day(local.date() + timedelta(days=1), cfg=cfg, inclusive=True)
    return close_on(day, cfg=cfg, tz=tz)


def provisional_expiry(moment=None):
    """Provisional hold: today's store close, rolling forward when needed.

    Rolls to the next open day's close when:
    - today is closed,
    - the moment is past today's close, or
    - the moment is within ONLINE_SALES_PROVISIONAL_GRACE_MINUTES of close.
    """
    local, cfg, tz = _local_now(moment)
    grace = max(0, int(getattr(settings, 'ONLINE_SALES_PROVISIONAL_GRACE_MINUTES', 30)))
    today = local.date()

    if not is_open_day(today, cfg=cfg):
        day = _next_open_day(today + timedelta(days=1), cfg=cfg, inclusive=True)
        return close_on(day, cfg=cfg, tz=tz)

    today_close = close_on(today, cfg=cfg, tz=tz)
    grace_cutoff = today_close - timedelta(minutes=grace)
    if local >= grace_cutoff:
        day = _next_open_day(today + timedelta(days=1), cfg=cfg, inclusive=True)
        return close_on(day, cfg=cfg, tz=tz)
    return today_close


def confirmed_expiry(moment=None, open_days: int = 3):
    """Confirmed hold: close on the Nth open day counting today (default 3).

    If today's close has already passed, counting starts tomorrow.
    Example: Thu Aug 6 before close → Sat Aug 8 close.
    """
    local, cfg, tz = _local_now(moment)
    open_days = max(1, int(open_days))
    today = local.date()
    today_close = close_on(today, cfg=cfg, tz=tz) if is_open_day(today, cfg=cfg) else None

    if today_close is not None and local < today_close:
        start = today
    else:
        start = today + timedelta(days=1)

    counted = 0
    day = start
    for _ in range(28):
        if is_open_day(day, cfg=cfg):
            counted += 1
            if counted >= open_days:
                return close_on(day, cfg=cfg, tz=tz)
        day = day + timedelta(days=1)

    # Fallback: next business day close
    return next_business_day_close_after(local)
