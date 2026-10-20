"""
The owner's PIN (owner 2026-10-20): "ANYONE may type it where it's asked (Bill gives it out)."

- Only the owner (a superuser) sets or resets it, in Dash Settings. 4 to 8 digits, stored hashed, never shown again.
- Where the owner is asked for (a late return past the 3 days, O1), "owner signed in OR the correct PIN" lets it through.
- Five wrong tries in a row lock the PIN for 15 minutes (for everyone: the PIN is shared); a signed-in owner is not
  affected. Every set, reset, use and wrong try is logged as an ``owner_pin_*`` Event: who, and what for.
"""
from __future__ import annotations

import re
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.db import transaction
from django.utils import timezone

from apps.thriftplus.models import OwnerPin
from apps.thriftplus.services import members

MAX_FAILURES = 5
LOCK_MINUTES = 15


class PinError(Exception):
    """A PIN that is missing, wrong or locked. ``http`` is the status the view answers with."""

    def __init__(self, code: str, message: str, http: int = 403, **extra):
        super().__init__(message)
        self.code = code
        self.http = http
        self.extra = extra

    def payload(self) -> dict:
        return {**self.extra, 'detail': str(self), 'code': self.code}


def _row() -> OwnerPin:
    row, _ = OwnerPin.objects.get_or_create(pk=1)
    return row


def _minutes_left(until) -> int:
    seconds = (until - timezone.now()).total_seconds()
    return max(1, int(-(-seconds // 60)))


def status() -> dict:
    """Is a PIN set, when, by whom, and is it locked now. Never the PIN."""
    row = OwnerPin.objects.filter(pk=1).select_related('set_by').first()
    has = bool(row and row.pin_hash)
    locked = bool(has and row.locked_until and row.locked_until > timezone.now())
    return {
        'set': has, 'set_at': row.set_at if has else None, 'set_by': (row.set_by.full_name if row.set_by else '') if has else '',
        'locked': locked, 'locked_until': row.locked_until if locked else None,
    }


def set_pin(user, pin: str) -> dict:
    """The owner sets (or resets) the PIN: 4 to 8 digits. A reset clears any lockout."""
    pin = (pin or '').strip()
    if not re.fullmatch(r'\d{4,8}', pin):
        raise PinError('PIN_FORMAT', 'The PIN is 4 to 8 digits.', http=400)
    with transaction.atomic():
        row = OwnerPin.objects.select_for_update().get_or_create(pk=1)[0]
        again = bool(row.pin_hash)
        row.pin_hash = make_password(pin)
        row.set_by, row.set_at, row.failures, row.locked_until = user, timezone.now(), 0, None
        row.save()
        members.log('owner_pin_reset' if again else 'owner_pin_set', actor=user)
    return status()


def verify(user, pin: str, purpose: str, **detail) -> None:
    """Check a typed PIN. Raises ``PinError`` (``PIN_NOT_SET``, ``PIN_NEEDED``, ``PIN_WRONG``, ``PIN_LOCKED``). A right one
    is logged (who typed it, what for) and clears the count; a wrong one is logged and counted, and the fifth in a row
    locks the PIN for 15 minutes."""
    pin = (pin or '').strip()
    failure: PinError | None = None
    with transaction.atomic():
        row = OwnerPin.objects.select_for_update().get_or_create(pk=1)[0]
        now = timezone.now()
        if not row.pin_hash:
            failure = PinError('PIN_NOT_SET', 'There is no owner PIN yet. The owner can sign in, or set the PIN in Settings.')
        elif row.locked_until and row.locked_until > now:
            failure = PinError('PIN_LOCKED', f'Too many wrong tries. Try again in {_minutes_left(row.locked_until)} minutes.',
                               http=429, locked_until=row.locked_until)
        elif not pin:
            failure = PinError('PIN_NEEDED', 'Type the owner PIN, or have the owner sign in.')
        elif check_password(pin, row.pin_hash):
            row.failures, row.locked_until = 0, None
            row.save(update_fields=['failures', 'locked_until'])
            members.log('owner_pin_used', actor=user, purpose=purpose, **detail)
        else:
            row.failures += 1
            if row.failures >= MAX_FAILURES:
                row.failures, row.locked_until = 0, now + timedelta(minutes=LOCK_MINUTES)
                failure = PinError('PIN_LOCKED', f'Too many wrong tries. The PIN is locked for {LOCK_MINUTES} minutes.',
                                   http=429, locked_until=row.locked_until)
            else:
                failure = PinError('PIN_WRONG', 'That PIN is wrong.', tries_left=MAX_FAILURES - row.failures)
            row.save(update_fields=['failures', 'locked_until'])
            members.log('owner_pin_wrong', actor=user, purpose=purpose, **detail)
    if failure is not None:
        raise failure


def authorize(user, pin: str, purpose: str, **detail) -> bool:
    """The owner's OK: the owner signed in, or the correct PIN. Answers whether the PIN was used (False: the owner
    was signed in). Raises ``PinError`` otherwise."""
    if getattr(user, 'is_superuser', False):
        members.log('owner_ok', actor=user, purpose=purpose, **detail)
        return False
    verify(user, pin, purpose, **detail)
    return True
