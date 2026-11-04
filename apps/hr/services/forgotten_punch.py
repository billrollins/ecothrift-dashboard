"""A forgotten clock-out, fixed from Today.

A punch open 14 hours or more (`STALE_AFTER`) was almost surely never closed.
Today asks when the person left (suggested: roster time out, else store close, else +8h),
closes the shift at that time, and files a time change request so a manager confirms it.
Closing it at "now" instead is what turned a 7-hour day into a 24-hour shift.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.hr.models import ShiftAssignment, TimeEntry, TimeEntryModificationRequest
from apps.hr.services.time_clock_utils import validate_shift_duration
from apps.webstore.services.hours import close_on, get_hours_config, is_open_day

STALE_AFTER = timedelta(hours=14)
REASON_FORGOT_TO_CLOCK_OUT = 'forgot to clock out'
REASON_TODAY = f'{REASON_FORGOT_TO_CLOCK_OUT} (Today)'


def local_now(now: datetime | None = None):
    cfg = get_hours_config()
    tz = ZoneInfo(cfg.get('timezone') or 'America/Chicago')
    moment = now or timezone.now()
    return moment.astimezone(tz), cfg, tz


def assignments_today(user_id: int, day: date) -> list[ShiftAssignment]:
    rows = []
    for row in ShiftAssignment.objects.filter(
        employee_id=user_id, shift__is_active=True, shift__department__is_active=True,
    ).select_related('shift', 'shift__department'):
        if row.runs_on(day):
            rows.append(row)
    rows.sort(key=lambda row: (row.shift.time_in, row.shift.name))
    return rows


def suggested_clock_out(punch: TimeEntry, *, now: datetime | None = None) -> datetime:
    """Roster time_out on the punch's local day, else store close, else +8h. Never before clock_in."""
    now = now or timezone.now()
    _, cfg, tz = local_now(now)
    punch_day = punch.clock_in.astimezone(tz).date()
    candidates = []
    rows = assignments_today(punch.employee_id, punch_day)
    if rows:
        latest = max(row.shift.time_out for row in rows)
        candidates.append(timezone.make_aware(datetime.combine(punch_day, latest), tz))
    elif is_open_day(punch_day, cfg=cfg):
        candidates.append(close_on(punch_day, cfg=cfg, tz=tz))
    fallback = punch.clock_in + timedelta(hours=8)
    pick = next((c for c in candidates if c > punch.clock_in), fallback)
    if pick <= punch.clock_in:
        pick = punch.clock_in + timedelta(minutes=1)
    return min(pick, now) if now > punch.clock_in else pick


def is_stale(punch: TimeEntry | None, now: datetime) -> bool:
    return bool(punch) and (now - punch.clock_in) >= STALE_AFTER


def stale_info(punch: TimeEntry | None, *, now: datetime | None = None) -> dict | None:
    """{'since', 'suggested_clock_out'} for a forgotten open punch; None otherwise."""
    now = now or timezone.now()
    if punch is None or punch.clock_out or not is_stale(punch, now):
        return None
    return {'since': punch.clock_in, 'suggested_clock_out': suggested_clock_out(punch, now=now)}


def parse_clock_out(raw, *, now: datetime | None = None) -> datetime | None:
    """ISO datetime from the client (blank means use the suggestion)."""
    text = str(raw or '').strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace('Z', '+00:00'))
    except ValueError as exc:
        raise ValidationError({'clock_out': 'Use a date and time.'}) from exc
    if timezone.is_naive(parsed):
        _, _, tz = local_now(now)
        parsed = timezone.make_aware(parsed, tz)
    return parsed


def close_forgotten_punch(punch: TimeEntry, *, clock_out: datetime | None, now: datetime | None = None) -> TimeEntry:
    """Close a forgotten punch at the time given (or the suggestion) and file the request."""
    now = now or timezone.now()
    with transaction.atomic():
        punch = TimeEntry.objects.select_for_update().get(pk=punch.pk)
        if punch.clock_out:
            raise ValidationError({'detail': 'That shift is already closed.'})
        if not is_stale(punch, now):
            raise ValidationError({'detail': 'That shift is still going. Clock out as usual.'})
        at = clock_out or suggested_clock_out(punch, now=now)
        if at <= punch.clock_in:
            raise ValidationError({'clock_out': 'Clock out must be after you clocked in.'})
        if at > now:
            raise ValidationError({'clock_out': 'That time has not happened yet.'})
        if punch.on_break:
            punch.finalize_open_break(as_of=at)
        validate_shift_duration(punch.clock_in, at, punch.break_minutes)
        punch.clock_out = at
        punch.save()
        TimeEntryModificationRequest.objects.create(
            time_entry=punch,
            employee=punch.employee,
            requested_clock_out=at,
            reason=REASON_TODAY,
        )
    return punch
