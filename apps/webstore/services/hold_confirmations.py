"""Hold email confirmation — 6-digit code + prefetch-safe link token."""
from __future__ import annotations

import hmac
import hashlib
import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.webstore.models import HoldConfirmation, Reservation

if TYPE_CHECKING:
    pass

CODE_LENGTH = 6
CONFIRMATION_TTL = timedelta(hours=24)
RESEND_COOLDOWN_SECONDS = 60
MAX_ATTEMPTS = 5

_RELEASED = frozenset({'expired', 'cancelled', 'declined'})


class ConfirmationError(Exception):
    """Base for confirmation service failures."""


class ConfirmationCooldown(ConfirmationError):
    def __init__(self, seconds: int):
        self.seconds = max(1, int(seconds))
        super().__init__(f'Resend available in {self.seconds}s')


class ConfirmationLocked(ConfirmationError):
    def __init__(self):
        super().__init__('Too many attempts. Request a fresh code.')


class ConfirmationMismatch(ConfirmationError):
    def __init__(self, attempts_remaining: int):
        self.attempts_remaining = max(0, int(attempts_remaining))
        super().__init__('That code does not match.')


class ConfirmationHoldEnded(ConfirmationError):
    def __init__(self):
        super().__init__('This hold has ended.')


class ConfirmationNotPending(ConfirmationError):
    def __init__(self):
        super().__init__('This hold does not need email confirmation.')


class ConfirmationNoActive(ConfirmationError):
    def __init__(self):
        super().__init__('No active confirmation. Request a fresh code.')


@dataclass(frozen=True)
class TokenResult:
    kind: str  # success | already_confirmed | expired | unknown
    reservation: Reservation | None = None


def _digest(raw: str) -> str:
    key = (getattr(settings, 'SECRET_KEY', '') or '').encode('utf-8')
    return hmac.new(key, (raw or '').encode('utf-8'), hashlib.sha256).hexdigest()


def _normalize_code(code: str) -> str:
    return ''.join(ch for ch in (code or '').strip() if ch.isdigit())


def _generate_code() -> str:
    return ''.join(secrets.choice('0123456789') for _ in range(CODE_LENGTH))


def active_confirmation(reservation: Reservation, *, now=None) -> HoldConfirmation | None:
    now = now or timezone.now()
    return (
        HoldConfirmation.objects
        .filter(
            reservation_id=reservation.pk,
            confirmed_at__isnull=True,
            expires_at__gt=now,
        )
        .order_by('-created_at')
        .first()
    )


def cooldown_remaining(reservation: Reservation, *, now=None) -> int:
    """Seconds left before another confirmation can be issued for this hold."""
    now = now or timezone.now()
    newest = (
        HoldConfirmation.objects
        .filter(reservation_id=reservation.pk)
        .order_by('-created_at')
        .first()
    )
    if newest is None or newest.created_at is None:
        return 0
    elapsed = (now - newest.created_at).total_seconds()
    left = RESEND_COOLDOWN_SECONDS - elapsed
    return max(0, int(left))


def attempts_remaining(row: HoldConfirmation | None) -> int:
    if row is None:
        return MAX_ATTEMPTS
    return max(0, MAX_ATTEMPTS - int(row.attempts or 0))


@transaction.atomic
def issue_confirmation(
    reservation: Reservation,
    *,
    now=None,
    force: bool = False,
) -> tuple[HoldConfirmation, str, str]:
    """Create a confirmation row and return (row, plain_code, plain_link_token).

    Raises ConfirmationCooldown when called too soon after the previous issue,
    unless ``force=True`` (used when the customer changes their email address).
    """
    now = now or timezone.now()
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status in _RELEASED:
        raise ConfirmationHoldEnded()
    if locked.status != 'pending_verification':
        raise ConfirmationNotPending()

    if not force:
        left = cooldown_remaining(locked, now=now)
        if left > 0:
            raise ConfirmationCooldown(left)

    # Expire prior unconfirmed rows so only one active code/link pair exists.
    HoldConfirmation.objects.filter(
        reservation_id=locked.pk,
        confirmed_at__isnull=True,
        expires_at__gt=now,
    ).update(expires_at=now)

    plain_code = _generate_code()
    plain_token = secrets.token_hex(32)
    row = HoldConfirmation.objects.create(
        reservation=locked,
        email=locked.email,
        code_hash=_digest(plain_code),
        token_hash=_digest(plain_token),
        expires_at=now + CONFIRMATION_TTL,
        attempts=0,
    )
    return row, plain_code, plain_token


def _link_customer_account(reservation: Reservation) -> None:
    """Stamp email verified + claim guest records — no session / JWT."""
    from apps.accounts.services.magic_link import (
        _get_or_create_customer,
        claim_guest_records,
        stamp_email_verified,
    )

    first_name = ''
    if reservation.customer_name:
        first_name = (reservation.customer_name or '').strip().split()[0]
    user = _get_or_create_customer(reservation.email, first_name=first_name)
    stamp_email_verified(user)
    claim_guest_records(user)


@transaction.atomic
def _apply(row: HoldConfirmation, via: str) -> Reservation:
    locked_row = HoldConfirmation.objects.select_for_update().get(pk=row.pk)
    if locked_row.confirmed_at is not None:
        return Reservation.objects.get(pk=locked_row.reservation_id)

    reservation = Reservation.objects.select_for_update().get(pk=locked_row.reservation_id)
    if reservation.status in _RELEASED:
        raise ConfirmationHoldEnded()

    from apps.webstore.services.reservations import verify_hold

    now = timezone.now()
    locked_row.confirmed_at = now
    locked_row.confirmed_via = via
    locked_row.save(update_fields=['confirmed_at', 'confirmed_via'])

    if reservation.status == 'pending_verification':
        reservation = verify_hold(reservation)
    else:
        reservation = Reservation.objects.get(pk=reservation.pk)

    try:
        _link_customer_account(reservation)
    except Exception:
        # Account linking must not undo a successful hold confirmation.
        pass
    return reservation


def confirm_with_code(reservation: Reservation, code: str) -> Reservation:
    """Confirm with the emailed code.

    Attempts are committed in their own transaction *before* the comparison so a
    mismatch (which raises) cannot roll back the consumed try.
    """
    now = timezone.now()
    with transaction.atomic():
        locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
        if locked.status in _RELEASED:
            raise ConfirmationHoldEnded()
        if locked.status != 'pending_verification':
            if locked.status in ('requested', 'confirmed', 'ready_for_pickup', 'completed'):
                return locked
            raise ConfirmationNotPending()

        row = (
            HoldConfirmation.objects
            .select_for_update()
            .filter(
                reservation_id=locked.pk,
                confirmed_at__isnull=True,
                expires_at__gt=now,
            )
            .order_by('-created_at')
            .first()
        )
        if row is None:
            raise ConfirmationNoActive()
        if row.attempts >= MAX_ATTEMPTS:
            raise ConfirmationLocked()

        # Increment before comparing so racey parallel posts still consume a try.
        row.attempts = int(row.attempts or 0) + 1
        row.save(update_fields=['attempts'])
        row_id = row.pk
        attempts_now = row.attempts
        expected = row.code_hash or ''

    normalized = _normalize_code(code)
    candidate = _digest(normalized) if len(normalized) == CODE_LENGTH else ''
    if not candidate or not hmac.compare_digest(expected, candidate):
        remaining = max(0, MAX_ATTEMPTS - attempts_now)
        if remaining == 0:
            raise ConfirmationLocked()
        raise ConfirmationMismatch(remaining)

    return _apply(
        HoldConfirmation.objects.get(pk=row_id),
        HoldConfirmation.VIA_CODE,
    )


def confirm_with_token(raw: str) -> TokenResult:
    token = (raw or '').strip()
    if not token:
        return TokenResult(kind='unknown')

    digest = _digest(token)
    row = HoldConfirmation.objects.filter(token_hash=digest).select_related('reservation').first()
    if row is None:
        return TokenResult(kind='unknown')

    reservation = row.reservation
    if row.confirmed_at is not None:
        return TokenResult(kind='already_confirmed', reservation=reservation)

    now = timezone.now()
    if row.expires_at <= now:
        return TokenResult(kind='expired', reservation=reservation)

    if reservation.status in _RELEASED:
        return TokenResult(kind='expired', reservation=reservation)

    if reservation.status != 'pending_verification':
        # Hold already advanced without this row — treat as success.
        return TokenResult(kind='already_confirmed', reservation=reservation)

    try:
        updated = _apply(row, HoldConfirmation.VIA_LINK)
    except ConfirmationHoldEnded:
        return TokenResult(kind='expired', reservation=reservation)
    return TokenResult(kind='success', reservation=updated)


def confirmation_status_payload(reservation: Reservation) -> dict:
    confirmed = reservation.status != 'pending_verification'
    held_until = reservation.expires_at.isoformat() if reservation.expires_at else None
    return {
        'confirmed': confirmed,
        'held_until': held_until,
    }


def pending_confirmation_meta(reservation: Reservation, *, now=None) -> dict:
    """Fields for the public hold status payload while pending verification."""
    now = now or timezone.now()
    row = active_confirmation(reservation, now=now)
    return {
        'code_expires_at': row.expires_at.isoformat() if row and row.expires_at else None,
        'attempts_remaining': attempts_remaining(row),
        'resend_available_in': cooldown_remaining(reservation, now=now),
        'has_active_confirmation': row is not None,
    }
