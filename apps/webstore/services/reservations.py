"""Reservation create / confirm / release / complete helpers."""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.webstore.models import Reservation, WebListing
from apps.webstore.services.hours import next_business_day_close_after

TERMINAL_RELEASE_STATUSES = ('declined', 'expired', 'cancelled')


def _cost_for_listing(listing: WebListing):
    item = listing.item
    if item is None:
        return None
    return getattr(item, 'cost', None)


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
            open_for_reservation(existing)
            return existing

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

    reservation = Reservation.objects.create(
        listing=locked,
        item=locked.item,
        customer_name=customer_name.strip(),
        email=email_norm,
        phone=(phone or '').strip(),
        quantity=quantity,
        customer_note=(customer_note or '').strip(),
        idempotency_key=idempotency_key or '',
        status='requested',
        unit_price_snapshot=locked.price,
        cost_snapshot=_cost_for_listing(locked),
    )
    from apps.webstore.services.conversations import open_for_reservation
    open_for_reservation(reservation)
    return reservation


@transaction.atomic
def release_reservation(reservation: Reservation, new_status: str) -> Reservation:
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

    locked.status = new_status
    locked.save(update_fields=['status', 'updated_at'])
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, new_status)
    return locked


@transaction.atomic
def confirm_reservation(reservation: Reservation, user=None) -> Reservation:
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status not in ('requested', 'confirmed'):
        raise ValidationError({'detail': f'Cannot confirm from status {locked.status}.'})
    locked.status = 'confirmed'
    locked.confirmed_at = timezone.now()
    locked.confirmed_by = user
    locked.expires_at = next_business_day_close_after(locked.confirmed_at)
    locked.save(update_fields=[
        'status', 'confirmed_at', 'confirmed_by', 'expires_at', 'updated_at',
    ])
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, 'confirmed')
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


@transaction.atomic
def stage_reservation(reservation: Reservation, user=None) -> Reservation:
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status not in ('requested', 'confirmed', 'ready_for_pickup'):
        raise ValidationError({'detail': f'Cannot stage from status {locked.status}.'})
    if locked.status == 'requested':
        locked.status = 'confirmed'
        locked.confirmed_at = timezone.now()
        locked.confirmed_by = user
        locked.expires_at = next_business_day_close_after(locked.confirmed_at)
    locked.status = 'ready_for_pickup'
    locked.staged_at = timezone.now()
    locked.staged_by = user
    locked.save(update_fields=[
        'status', 'confirmed_at', 'confirmed_by', 'expires_at',
        'staged_at', 'staged_by', 'updated_at',
    ])
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, 'ready_for_pickup')
    return locked


@transaction.atomic
def complete_reservation(reservation: Reservation, user=None, pos_cart=None) -> Reservation:
    locked = Reservation.objects.select_for_update().select_related('listing').get(pk=reservation.pk)
    if locked.status == 'completed':
        return locked
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

    locked.status = 'completed'
    locked.completed_at = timezone.now()
    locked.completed_by = user
    if pos_cart is not None:
        locked.pos_cart = pos_cart
    locked.save(update_fields=[
        'status', 'completed_at', 'completed_by', 'pos_cart', 'updated_at',
    ])
    from apps.webstore.services.conversations import notify_reservation_status
    notify_reservation_status(locked, 'completed')
    return locked


def active_holds_for_item(item_id: int):
    return Reservation.objects.filter(
        item_id=item_id,
        status__in=Reservation.ACTIVE_STATUSES,
    )


def expire_due_reservations(now=None) -> int:
    """Expire confirmed/ready past expires_at, plus untriaged requests past triage window."""
    now = now or timezone.now()
    due_ids = list(
        Reservation.objects.filter(
            status__in=('confirmed', 'ready_for_pickup'),
            expires_at__isnull=False,
            expires_at__lte=now,
        ).values_list('id', flat=True)
    )
    triage_hours = int(getattr(settings, 'ONLINE_SALES_REQUEST_TRIAGE_HOURS', 48))
    cutoff = now - timedelta(hours=triage_hours)
    stale_request_ids = list(
        Reservation.objects.filter(
            status='requested',
            created_at__lte=cutoff,
        ).values_list('id', flat=True)
    )
    count = 0
    for pk in due_ids + stale_request_ids:
        release_reservation(Reservation.objects.get(pk=pk), 'expired')
        count += 1
    return count


def contribution_rows():
    """Completed reservations for the thin Sales log."""
    return (
        Reservation.objects.filter(status='completed')
        .select_related('listing', 'item', 'pos_cart')
        .order_by('-completed_at')
    )
