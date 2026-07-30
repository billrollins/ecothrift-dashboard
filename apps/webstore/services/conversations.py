"""Conversation / Message helpers for Online Sales messaging."""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.webstore.models import Conversation, Message, Reservation, WebListing

_SYSTEM_STATUS_COPY = {
    'confirmed': 'Your hold was confirmed. Pay and pick up in store before it expires.',
    'expired': 'Your hold expired and the item was released.',
    'cancelled': 'Your hold was cancelled.',
    'declined': 'Your hold request was declined.',
    'completed': 'Your hold was completed at pickup. Thank you!',
    'ready_for_pickup': 'Your hold is staged and ready for pickup.',
}


@transaction.atomic
def open_for_reservation(reservation: Reservation) -> Conversation:
    """Open or return the thread for a hold; seed with customer note when new."""
    existing = Conversation.objects.filter(reservation=reservation).first()
    if existing:
        return existing

    conv = Conversation.objects.create(
        listing=reservation.listing,
        reservation=reservation,
        guest_name=reservation.customer_name or '',
        guest_email=reservation.email or '',
        guest_phone=reservation.phone or '',
        state='needs_reply',
        staff_unread=0,
        customer_unread=0,
    )
    note = (reservation.customer_note or '').strip()
    if note:
        post_message(conv, author_kind='customer', body=note, author_user=None)
    else:
        system_message(conv, f'Hold requested for “{reservation.listing.title}” (qty {reservation.quantity}).')
    return Conversation.objects.get(pk=conv.pk)


@transaction.atomic
def open_inquiry(
    *,
    listing: WebListing,
    name: str,
    email: str,
    phone: str = '',
    body: str,
) -> Conversation:
    name = (name or '').strip()
    email = (email or '').strip()
    body = (body or '').strip()
    if not name or not email or not body:
        raise ValidationError({'detail': 'Name, email, and message are required.'})
    if listing.status != 'published':
        raise ValidationError({'detail': 'This listing is not available for inquiries.'})

    # Idempotent-ish: reopen the latest open inquiry for same listing+email.
    existing = (
        Conversation.objects.select_for_update()
        .filter(
            listing=listing,
            reservation__isnull=True,
            guest_email__iexact=email,
            state__in=('needs_reply', 'waiting_on_customer'),
        )
        .order_by('-created_at')
        .first()
    )
    if existing:
        post_message(existing, author_kind='customer', body=body)
        return Conversation.objects.get(pk=existing.pk)

    conv = Conversation.objects.create(
        listing=listing,
        guest_name=name,
        guest_email=email,
        guest_phone=(phone or '').strip(),
        state='needs_reply',
    )
    post_message(conv, author_kind='customer', body=body)
    return Conversation.objects.get(pk=conv.pk)


@transaction.atomic
def post_message(
    conversation: Conversation,
    *,
    author_kind: str,
    body: str,
    author_user=None,
) -> Message:
    body = (body or '').strip()
    if not body:
        raise ValidationError({'detail': 'Message body is required.'})
    if author_kind not in ('customer', 'staff', 'system'):
        raise ValidationError({'detail': 'Invalid author kind.'})

    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.state == 'resolved' and author_kind != 'system':
        locked.state = 'needs_reply' if author_kind == 'customer' else 'waiting_on_customer'

    msg = Message.objects.create(
        conversation=locked,
        author_kind=author_kind,
        author_user=author_user,
        body=body,
    )
    locked.last_message_at = msg.created_at or timezone.now()
    if author_kind == 'customer':
        locked.state = 'needs_reply'
        locked.staff_unread = locked.staff_unread + 1
    elif author_kind == 'staff':
        locked.state = 'waiting_on_customer'
        locked.customer_unread = locked.customer_unread + 1
    # system: do not flip unread aggressively; still bump last_message_at
    locked.save(update_fields=['state', 'last_message_at', 'staff_unread', 'customer_unread', 'updated_at'])
    return msg


def system_message(conversation: Conversation, body: str) -> Message:
    return post_message(conversation, author_kind='system', body=body)


def notify_reservation_status(reservation: Reservation, status: str) -> None:
    """Emit a system message for reservation lifecycle changes (best-effort)."""
    copy = _SYSTEM_STATUS_COPY.get(status)
    if not copy:
        return
    conv = Conversation.objects.filter(reservation=reservation).first()
    if conv is None:
        return
    system_message(conv, copy)


@transaction.atomic
def resolve_conversation(conversation: Conversation) -> Conversation:
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    locked.state = 'resolved'
    locked.save(update_fields=['state', 'updated_at'])
    return locked


@transaction.atomic
def reopen_conversation(conversation: Conversation) -> Conversation:
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    locked.state = 'needs_reply'
    locked.save(update_fields=['state', 'updated_at'])
    return locked


@transaction.atomic
def assign_conversation(conversation: Conversation, user) -> Conversation:
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    locked.staff_owner = user
    locked.save(update_fields=['staff_owner', 'updated_at'])
    return locked


@transaction.atomic
def mark_staff_read(conversation: Conversation) -> Conversation:
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.staff_unread:
        locked.staff_unread = 0
        locked.save(update_fields=['staff_unread', 'updated_at'])
    return locked


@transaction.atomic
def mark_customer_read(conversation: Conversation) -> Conversation:
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.customer_unread:
        locked.customer_unread = 0
        locked.save(update_fields=['customer_unread', 'updated_at'])
    return locked
