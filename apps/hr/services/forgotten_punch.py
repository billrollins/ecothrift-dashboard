"""A forgotten clock-out, fixed from Today. Same rules as the kiosk's stale punch.

A punch open 14 hours or more (`kiosk_service.STALE_AFTER`) was almost surely never closed.
Today asks when the person left (suggested: roster time out, else store close, else +8h),
closes the shift at that time, and files a time change request so a manager confirms it.
Closing it at "now" instead is what turned a 7-hour day into a 24-hour shift.
"""
from __future__ import annotations

from datetime import datetime

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.hr.kiosk_service import REASON_FORGOT_TO_CLOCK_OUT, is_stale, local_now, suggested_clock_out
from apps.hr.models import TimeEntry, TimeEntryModificationRequest
from apps.hr.services.time_clock_utils import validate_shift_duration

REASON_TODAY = f'{REASON_FORGOT_TO_CLOCK_OUT} (Today)'


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
