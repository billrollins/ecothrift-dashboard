"""Conversation / Message helpers for Online Sales messaging."""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.webstore.models import Conversation, Message, Reservation, WebListing

_SYSTEM_STATUS_COPY = {
    'confirmed': (
        # Internal staff confirm is invisible - keep system copy quiet.
        'We have your hold. Come in any time before it expires and show your code.'
    ),
    'ready_for_pickup': (
        'Your item is bagged and waiting. Come in, show your code, '
        'and pay at the register - cash or card.'
    ),
    'reopened': (
        'Good news - your hold is active again. '
        'Come in any time before it expires and show your code.'
    ),
    'completed': 'Picked up - thank you for shopping with Eco-Thrift.',
    'expired': 'This one went back on the floor.',
    'cancelled': 'This hold was released.',
    'declined': 'This hold was released.',
}


@transaction.atomic
def open_for_reservation(reservation: Reservation, *, pending: bool = False) -> Conversation:
    """Open or return the thread for a hold; seed with customer note when new."""
    existing = Conversation.objects.filter(reservation=reservation).first()
    if existing:
        return existing

    state = 'pending_verification' if pending else 'needs_reply'
    conv = Conversation.objects.create(
        listing=reservation.listing,
        reservation=reservation,
        guest_name=reservation.customer_name or '',
        guest_email=reservation.email or '',
        guest_phone=reservation.phone or '',
        state=state,
        staff_unread=0,
        customer_unread=0,
    )
    note = (reservation.customer_note or '').strip()
    if note:
        post_message(
            conv,
            author_kind='customer',
            body=note,
            author_user=None,
            bump_staff_unread=not pending,
        )
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
    verified: bool = False,
) -> Conversation:
    name = (name or '').strip()
    email = (email or '').strip()
    body = (body or '').strip()
    if not name or not email or not body:
        raise ValidationError({'detail': 'Name, email, and message are required.'})
    if listing.status != 'published':
        raise ValidationError({'detail': 'This listing is not available for inquiries.'})

    open_states = (
        ('needs_reply', 'waiting_on_customer')
        if verified
        else ('pending_verification', 'needs_reply', 'waiting_on_customer')
    )
    existing = (
        Conversation.objects.select_for_update()
        .filter(
            listing=listing,
            reservation__isnull=True,
            guest_email__iexact=email,
            state__in=open_states,
        )
        .order_by('-created_at')
        .first()
    )
    if existing:
        post_message(
            existing,
            author_kind='customer',
            body=body,
            bump_staff_unread=existing.state != 'pending_verification' and verified,
        )
        if verified and existing.state == 'pending_verification':
            promote_pending_conversation(existing)
        return Conversation.objects.get(pk=existing.pk)

    conv = Conversation.objects.create(
        listing=listing,
        guest_name=name,
        guest_email=email,
        guest_phone=(phone or '').strip(),
        state='needs_reply' if verified else 'pending_verification',
        staff_unread=0,
        customer_unread=0,
    )
    post_message(
        conv,
        author_kind='customer',
        body=body,
        bump_staff_unread=verified,
    )
    return Conversation.objects.get(pk=conv.pk)


@transaction.atomic
def promote_pending_conversation(conversation: Conversation) -> Conversation:
    """Make a pending_verification thread visible to staff."""
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.state != 'pending_verification':
        return locked
    locked.state = 'needs_reply'
    # Count customer messages that were held back from staff unread.
    held = locked.messages.filter(author_kind='customer').count()
    locked.staff_unread = locked.staff_unread + max(1, held)
    locked.save(update_fields=['state', 'staff_unread', 'updated_at'])
    return locked


def verify_inquiry_by_token(public_token: str, *, email: str = '') -> Conversation | None:
    token = (public_token or '').strip()
    if not token:
        return None
    qs = Conversation.objects.filter(public_token=token)
    if email:
        qs = qs.filter(guest_email__iexact=email.strip())
    conversation = qs.select_related('reservation').first()
    if conversation is None:
        return None
    if conversation.state == 'pending_verification':
        return promote_pending_conversation(conversation)
    return conversation


def expire_unverified_inquiries(now=None) -> int:
    """Delete unverified inquiry threads older than ONLINE_SALES_INQUIRY_VERIFY_HOURS."""
    now = now or timezone.now()
    hours = max(1, int(getattr(settings, 'ONLINE_SALES_INQUIRY_VERIFY_HOURS', 24)))
    cutoff = now - timedelta(hours=hours)
    qs = Conversation.objects.filter(
        state='pending_verification',
        reservation__isnull=True,
        created_at__lte=cutoff,
    )
    count = qs.count()
    qs.delete()
    return count


@transaction.atomic
def post_message(
    conversation: Conversation,
    *,
    author_kind: str,
    body: str,
    author_user=None,
    bump_staff_unread: bool = True,
) -> Message:
    body = (body or '').strip()
    if not body:
        raise ValidationError({'detail': 'Message body is required.'})
    if author_kind not in ('customer', 'staff', 'system'):
        raise ValidationError({'detail': 'Invalid author kind.'})

    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.state == 'pending_verification' and author_kind == 'staff':
        raise ValidationError({'detail': 'Thread email is not verified yet.'})
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
        if locked.state != 'pending_verification':
            locked.state = 'needs_reply'
        if bump_staff_unread and locked.state != 'pending_verification':
            locked.staff_unread = locked.staff_unread + 1
    elif author_kind == 'staff':
        locked.state = 'waiting_on_customer'
        locked.customer_unread = locked.customer_unread + 1
        # Soft-deleted threads resurface so the customer can see the reply.
        if locked.customer_deleted_at is not None:
            locked.customer_deleted_at = None
    update_fields = ['state', 'last_message_at', 'staff_unread', 'customer_unread', 'updated_at']
    if author_kind == 'staff':
        update_fields.append('customer_deleted_at')
    locked.save(update_fields=update_fields)
    return msg


def system_message(conversation: Conversation, body: str) -> Message:
    return post_message(conversation, author_kind='system', body=body, bump_staff_unread=False)


def notify_reservation_status(
    reservation: Reservation,
    status: str,
    reason: str = '',
) -> None:
    """Emit a system message for reservation lifecycle changes (best-effort)."""
    copy = _SYSTEM_STATUS_COPY.get(status)
    if not copy:
        return
    reason_text = (reason or '').strip()
    if reason_text and status in ('declined', 'cancelled', 'expired'):
        copy = f'{copy} Reason: {reason_text}'
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


@transaction.atomic
def mark_customer_unread(conversation: Conversation) -> Conversation:
    """Flag a thread as unread for the customer inbox (at least one)."""
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.customer_unread < 1:
        locked.customer_unread = 1
        locked.save(update_fields=['customer_unread', 'updated_at'])
    return locked


@transaction.atomic
def soft_delete_for_customer(conversation: Conversation) -> Conversation:
    """Hide the thread from the customer Messages list. Staff/DB unchanged."""
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.customer_deleted_at is None:
        locked.customer_deleted_at = timezone.now()
        locked.customer_unread = 0
        locked.save(update_fields=['customer_deleted_at', 'customer_unread', 'updated_at'])
    return locked
