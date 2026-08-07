"""Reservation create / confirm / release / complete helpers."""
from __future__ import annotations

import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.webstore.models import Reservation, ReservationEvent, WebListing, generate_pickup_code
from apps.webstore.services.hours import (
    confirmed_expiry,
    next_business_day_close_after,
    provisional_expiry,
)

logger = logging.getLogger(__name__)

TERMINAL_RELEASE_STATUSES = ('declined', 'expired', 'cancelled')


def _cost_for_listing(listing: WebListing):
    item = listing.item
    if item is None:
        return None
    return getattr(item, 'cost', None)


def allocate_pickup_code() -> str:
    """Generate a unique short pickup code (retry on rare collisions)."""
    for _ in range(20):
        code = generate_pickup_code()
        if not Reservation.objects.filter(pickup_code=code).exists():
            return code
    # Extremely unlikely; last attempt still unique at DB level.
    return generate_pickup_code()


def _preserve_or_set_expiry(locked: Reservation, *, now=None, fallback='confirmed') -> None:
    """Never shorten a customer's promised expires_at.

    Only fill when null or already past. Staff confirm/stage must not overwrite
    the 3-day clock started at email verification.
    """
    now = now or timezone.now()
    if locked.expires_at is not None and locked.expires_at > now:
        return
    if fallback == 'provisional':
        locked.expires_at = provisional_expiry(now)
    elif fallback == 'next_business':
        locked.expires_at = next_business_day_close_after(now)
    else:
        locked.expires_at = confirmed_expiry(now)


def record_event(
    reservation: Reservation,
    kind: str,
    *,
    actor=None,
    from_status: str = '',
    to_status: str = '',
    note: str = '',
) -> None:
    """Append a ReservationEvent. Fail-soft - never roll back the transition."""
    try:
        ReservationEvent.objects.create(
            reservation_id=reservation.pk,
            kind=kind,
            from_status=from_status or '',
            to_status=to_status or '',
            actor=actor,
            note=(note or '')[:2000],
        )
    except Exception:
        logger.exception(
            'ReservationEvent write failed for reservation=%s kind=%s',
            getattr(reservation, 'pk', None),
            kind,
        )


def add_staff_note(reservation: Reservation, user, note: str) -> ReservationEvent:
    """Append an internal staff-only note event. Customer never sees these."""
    text = (note or '').strip()
    if not text:
        raise ValidationError({'detail': 'Note cannot be empty.'})
    if len(text) > 2000:
        raise ValidationError({'detail': 'Note is too long (max 2000 characters).'})
    return ReservationEvent.objects.create(
        reservation_id=reservation.pk,
        kind='note',
        from_status=reservation.status,
        to_status=reservation.status,
        actor=user,
        note=text,
    )


def release_lapsed_pending_for_listing(listing: WebListing, *, now=None) -> int:
    """Release expired pending_verification holds on this listing (opportunistic)."""
    now = now or timezone.now()
    due = list(
        Reservation.objects.filter(
            listing_id=listing.pk,
            status='pending_verification',
            expires_at__isnull=False,
            expires_at__lte=now,
        ).values_list('id', flat=True)
    )
    count = 0
    for pk in due:
        release_reservation(
            Reservation.objects.get(pk=pk),
            'expired',
            reason='Unconfirmed hold released',
        )
        count += 1
    return count


@transaction.atomic
def create_hold(
    *,
    listing: WebListing,
    quantity: int,
    customer_name: str,
    email: str,
    phone: str = '',
    customer_note: str = '',
    idempotency_key: str = '',
    verified: bool = False,
) -> Reservation:
    if quantity < 1:
        raise ValidationError({'detail': 'Quantity must be at least 1.'})
    if not customer_name or not email:
        raise ValidationError({'detail': 'Name and email are required.'})

    email_norm = email.strip()
    if idempotency_key:
        existing = (
            Reservation.objects.filter(
                idempotency_key=idempotency_key,
                status__in=Reservation.ACTIVE_STATUSES,
                email__iexact=email_norm,
            ).first()
        )
        if existing:
            from apps.webstore.services.conversations import open_for_reservation
            open_for_reservation(existing, pending=existing.status == 'pending_verification')
            return existing

    locked = WebListing.objects.select_for_update().get(pk=listing.pk)
    release_lapsed_pending_for_listing(locked)
    locked = WebListing.objects.select_for_update().get(pk=listing.pk)

    if locked.status != 'published':
        raise ValidationError({'detail': 'This listing is not available for holds.'})
    if locked.available < quantity:
        raise ValidationError(
            {'detail': f'Only {locked.available} available for “{locked.title}”.'},
        )

    locked.reserved = locked.reserved + quantity
    locked.sync_stock_mirror()
    locked.save(update_fields=['reserved', 'stock', 'updated_at'])

    status = 'requested' if verified else 'pending_verification'
    now = timezone.now()
    expires_at = confirmed_expiry(now) if verified else provisional_expiry(now)

    reservation = Reservation.objects.create(
        listing=locked,
        item=locked.item,
        customer_name=customer_name.strip(),
        email=email_norm,
        phone=(phone or '').strip(),
        quantity=quantity,
        customer_note=(customer_note or '').strip(),
        idempotency_key=idempotency_key or '',
        status=status,
        expires_at=expires_at,
        pickup_code=allocate_pickup_code(),
        unit_price_snapshot=locked.price,
        cost_snapshot=_cost_for_listing(locked),
    )

    record_event(
        reservation,
        'requested',
        from_status='',
        to_status=status,
    )
    from apps.webstore.services.conversations import open_for_reservation
    open_for_reservation(reservation, pending=not verified)
    return reservation


@transaction.atomic
def verify_hold(reservation: Reservation) -> Reservation:
    """Promote pending_verification → requested; start the 3-day clock."""
    # Do not select_related('conversation'): Postgres rejects FOR UPDATE on the
    # nullable side of an outer join (OneToOne reverse).
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status == 'requested':
        return locked
    if locked.status != 'pending_verification':
        raise ValidationError({'detail': f'Cannot verify from status {locked.status}.'})
    prev = locked.status
    now = timezone.now()
    locked.status = 'requested'
    locked.expires_at = confirmed_expiry(now)
    locked.save(update_fields=['status', 'expires_at', 'updated_at'])
    record_event(
        locked,
        'verified',
        from_status=prev,
        to_status='requested',
    )
    from apps.webstore.models import Conversation
    from apps.webstore.services.conversations import promote_pending_conversation
    conv = Conversation.objects.filter(reservation_id=locked.pk).first()
    if conv is not None:
        promote_pending_conversation(conv)

    reservation_id = locked.pk

    def _send_email():
        try:
            from apps.webstore.emails import send_hold_confirmed
            row = Reservation.objects.select_related('listing').get(pk=reservation_id)
            send_hold_confirmed(row)
        except Exception:
            pass

    transaction.on_commit(_send_email)
    return locked


def verify_hold_by_token(status_token: str, *, email: str = '') -> Reservation | None:
    token = (status_token or '').strip()
    if not token:
        return None
    qs = Reservation.objects.filter(status_token=token)
    if email:
        qs = qs.filter(email__iexact=email.strip())
    reservation = qs.first()
    if reservation is None:
        return None
    if reservation.status == 'pending_verification':
        return verify_hold(reservation)
    return reservation


@transaction.atomic
def release_reservation(
    reservation: Reservation,
    new_status: str,
    *,
    user=None,
    reason: str = '',
) -> Reservation:
    if new_status not in TERMINAL_RELEASE_STATUSES:
        raise ValidationError({'detail': f'Invalid release status: {new_status}'})
    locked = Reservation.objects.select_for_update().select_related('listing').get(pk=reservation.pk)
    if locked.status in TERMINAL_RELEASE_STATUSES + ('completed',):
        return locked
    if locked.status not in Reservation.ACTIVE_STATUSES:
        raise ValidationError({'detail': f'Cannot release from status {locked.status}.'})

    listing = WebListing.objects.select_for_update().get(pk=locked.listing_id)
    listing.reserved = max(0, listing.reserved - locked.quantity)
    listing.sync_stock_mirror()
    listing.save(update_fields=['reserved', 'stock', 'updated_at'])

    prev = locked.status
    reason_text = (reason or '').strip()[:200]
    locked.status = new_status
    locked.release_reason = reason_text
    locked.save(update_fields=['status', 'release_reason', 'updated_at'])
    record_event(
        locked,
        new_status,
        actor=user,
        from_status=prev,
        to_status=new_status,
        note=reason_text,
    )
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, new_status, reason=reason_text)
    reservation_id = locked.pk

    def _send_email():
        try:
            from apps.webstore.emails import send_hold_released
            row = Reservation.objects.select_related('listing').get(pk=reservation_id)
            send_hold_released(row)
        except Exception:
            pass

    transaction.on_commit(_send_email)
    return locked


@transaction.atomic
def reopen_reservation(
    reservation: Reservation,
    *,
    user=None,
    note: str = '',
) -> Reservation:
    """Bring a released hold back to Approved, re-reserving stock.

    A completed hold is never reopenable - the sale already moved inventory and
    landed in the sales log. Reopening lands on 'confirmed' rather than
    'ready_for_pickup' so staff must pull the item and mark Ready again, which
    keeps "Ready means it is physically on the shelf" true.
    """
    text = (note or '').strip()
    if not text:
        raise ValidationError({'detail': 'A note is required to reopen a hold.'})
    text = text[:2000]

    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status == 'completed':
        raise ValidationError({'detail': 'A completed sale cannot be reopened.'})
    if locked.status not in TERMINAL_RELEASE_STATUSES:
        raise ValidationError({'detail': f'Cannot reopen from status {locked.status}.'})

    listing = WebListing.objects.select_for_update().get(pk=locked.listing_id)
    if listing.status != 'published':
        raise ValidationError({
            'detail': (
                f'“{listing.title}” is {listing.get_status_display().lower()} - '
                f'republish the listing before reopening this hold.'
            ),
        })
    if listing.available < locked.quantity:
        raise ValidationError({
            'detail': (
                f'Only {listing.available} available for “{listing.title}” - '
                f'this hold needs {locked.quantity}.'
            ),
        })

    listing.reserved = listing.reserved + locked.quantity
    listing.sync_stock_mirror()
    listing.save(update_fields=['reserved', 'stock', 'updated_at'])

    prev = locked.status
    now = timezone.now()
    locked.status = 'confirmed'
    locked.release_reason = ''
    locked.confirmed_at = now
    locked.confirmed_by = user
    locked.staged_at = None
    locked.staged_by = None
    locked.expires_at = confirmed_expiry(now)
    locked.save(update_fields=[
        'status', 'release_reason', 'confirmed_at', 'confirmed_by',
        'staged_at', 'staged_by', 'expires_at', 'updated_at',
    ])
    record_event(
        locked,
        'reopened',
        actor=user,
        from_status=prev,
        to_status='confirmed',
        note=text,
    )
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, 'reopened')
    reservation_id = locked.pk

    def _send_email():
        try:
            from apps.webstore.emails import send_hold_reopened
            row = Reservation.objects.select_related('listing').get(pk=reservation_id)
            send_hold_reopened(row)
        except Exception:
            pass

    transaction.on_commit(_send_email)
    return locked


@transaction.atomic
def confirm_reservation(reservation: Reservation, user=None) -> Reservation:
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status == 'pending_verification':
        raise ValidationError({'detail': 'Hold email is not verified yet.'})
    if locked.status not in ('requested', 'confirmed'):
        raise ValidationError({'detail': f'Cannot confirm from status {locked.status}.'})
    prev = locked.status
    now = timezone.now()
    locked.status = 'confirmed'
    locked.confirmed_at = now
    locked.confirmed_by = user
    # Internal triage only - never shorten the customer's promised window.
    _preserve_or_set_expiry(locked, now=now)
    locked.save(update_fields=[
        'status', 'confirmed_at', 'confirmed_by', 'expires_at', 'updated_at',
    ])
    if prev != 'confirmed':
        record_event(
            locked,
            'confirmed',
            actor=user,
            from_status=prev,
            to_status='confirmed',
        )
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, 'confirmed')
    # Customer already received the confirmed email at verification.
    # Staff confirm is invisible - no second customer email.
    return locked


@transaction.atomic
def stage_reservation(reservation: Reservation, user=None) -> Reservation:
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status == 'pending_verification':
        raise ValidationError({'detail': 'Hold email is not verified yet.'})
    if locked.status not in ('requested', 'confirmed', 'ready_for_pickup'):
        raise ValidationError({'detail': f'Cannot stage from status {locked.status}.'})
    prev = locked.status
    now = timezone.now()
    if locked.status == 'requested':
        locked.status = 'confirmed'
        locked.confirmed_at = now
        locked.confirmed_by = user
        _preserve_or_set_expiry(locked, now=now)
        record_event(
            locked,
            'confirmed',
            actor=user,
            from_status='requested',
            to_status='confirmed',
        )
    locked.status = 'ready_for_pickup'
    locked.staged_at = now
    locked.staged_by = user
    _preserve_or_set_expiry(locked, now=now)
    locked.save(update_fields=[
        'status', 'confirmed_at', 'confirmed_by', 'expires_at',
        'staged_at', 'staged_by', 'updated_at',
    ])
    if prev != 'ready_for_pickup':
        record_event(
            locked,
            'staged',
            actor=user,
            from_status=prev if prev != 'requested' else 'confirmed',
            to_status='ready_for_pickup',
        )
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, 'ready_for_pickup')
    reservation_id = locked.pk

    def _send_email():
        try:
            from apps.webstore.emails import send_hold_ready
            row = Reservation.objects.select_related('listing').get(pk=reservation_id)
            send_hold_ready(row)
        except Exception:
            pass

    if prev != 'ready_for_pickup':
        transaction.on_commit(_send_email)
    return locked


@transaction.atomic
def complete_reservation(reservation: Reservation, user=None, pos_cart=None) -> Reservation:
    locked = Reservation.objects.select_for_update().select_related('listing').get(pk=reservation.pk)
    if locked.status == 'completed':
        return locked
    if locked.status == 'pending_verification':
        raise ValidationError({'detail': 'Hold email is not verified yet.'})
    if locked.status not in Reservation.ACTIVE_STATUSES:
        raise ValidationError({'detail': f'Cannot complete from status {locked.status}.'})

    listing = WebListing.objects.select_for_update().get(pk=locked.listing_id)
    listing.reserved = max(0, listing.reserved - locked.quantity)
    listing.on_hand = max(0, listing.on_hand - locked.quantity)
    listing.sync_stock_mirror()
    update_fields = ['reserved', 'on_hand', 'stock', 'updated_at']
    if listing.on_hand == 0 and listing.status == 'published':
        listing.status = 'sold'
        update_fields.append('status')
    listing.save(update_fields=update_fields)

    prev = locked.status
    locked.status = 'completed'
    locked.completed_at = timezone.now()
    locked.completed_by = user
    if pos_cart is not None:
        locked.pos_cart = pos_cart
    locked.save(update_fields=[
        'status', 'completed_at', 'completed_by', 'pos_cart', 'updated_at',
    ])
    note = ''
    cart_id = locked.pos_cart_id
    if cart_id:
        note = f'POS cart #{cart_id}'
    record_event(
        locked,
        'completed',
        actor=user,
        from_status=prev,
        to_status='completed',
        note=note,
    )
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, 'completed')
    return locked


def active_holds_for_item(item_id: int):
    return Reservation.objects.filter(
        item_id=item_id,
        status__in=Reservation.ACTIVE_STATUSES,
    )


def expire_due_reservations(now=None) -> int:
    """Expire active holds past expires_at (provisional, confirmed, ready).

    Staff inaction never kills a verified hold - only the promised expires_at does.
    """
    now = now or timezone.now()
    due_ids = list(
        Reservation.objects.filter(
            status__in=('requested', 'confirmed', 'ready_for_pickup'),
            expires_at__isnull=False,
            expires_at__lte=now,
        ).values_list('id', flat=True)
    )
    pending_ids = list(
        Reservation.objects.filter(
            status='pending_verification',
            expires_at__isnull=False,
            expires_at__lte=now,
        ).values_list('id', flat=True)
    )
    count = 0
    for pk in due_ids + pending_ids:
        reason = (
            'Unconfirmed hold released'
            if pk in pending_ids
            else 'Hold window ended'
        )
        release_reservation(
            Reservation.objects.get(pk=pk),
            'expired',
            reason=reason,
        )
        count += 1
    return count


def contribution_rows():
    """Completed reservations for the thin Sales log."""
    return (
        Reservation.objects.filter(status='completed')
        .select_related('listing', 'item', 'pos_cart')
        .order_by('-completed_at')
    )
