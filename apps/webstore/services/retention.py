"""Online Sales retention: what staff still need to see, and what can go.

Three tiers, one mechanism:

* **Now** — open holds and threads needing a reply. Nothing here is aged out.
* **Archived** — `archived_at` is set, so the row drops out of the staff queues
  but stays searchable forever. Presentation only: archiving never changes a
  status, never releases reserved stock, never emails anyone, and never hides
  anything from the customer's own view of their hold.
* **Purged** — the row is deleted. Only ever holds that were abandoned before
  the customer proved their email, because there is no business record behind
  them. Completed sales are never purged at any age.

Windows live here and nowhere else. Override per-deploy with settings if a
season demands it.
"""
from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Exists, OuterRef, Q, QuerySet
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.webstore.models import (
    Conversation,
    HoldConfirmation,
    Message,
    Reservation,
    ReservationEvent,
)


def _days(name: str, default: int) -> int:
    return int(getattr(settings, name, default))


def released_hold_archive_days() -> int:
    """Days after release before a hold leaves the Released tab."""
    return _days('ONLINE_SALES_ARCHIVE_RELEASED_DAYS', 30)


def resolved_thread_archive_days() -> int:
    """Days after the last message before a resolved thread leaves the inbox."""
    return _days('ONLINE_SALES_ARCHIVE_RESOLVED_DAYS', 30)


def abandoned_hold_purge_days() -> int:
    """Days before a never-verified, never-messaged hold is deleted."""
    return _days('ONLINE_SALES_PURGE_ABANDONED_DAYS', 30)


def customer_history_days() -> int:
    """Released holds older than this drop off the customer's history view.

    Picked-up holds are exempt — that is the customer's receipt.
    """
    return _days('ONLINE_SALES_CUSTOMER_HISTORY_DAYS', 90)


# ── Manual archive (staff button) ────────────────────────────────────────────

@transaction.atomic
def archive_reservation(reservation: Reservation, *, user=None) -> Reservation:
    """Hide a finished hold from the staff queues. Refuses while it is live."""
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.status not in Reservation.TERMINAL_STATUSES:
        raise ValidationError(
            {'detail': 'Only completed or released holds can be archived.'},
        )
    if locked.archived_at is not None:
        return locked
    locked.archived_at = timezone.now()
    locked.archived_by = user
    locked.save(update_fields=['archived_at', 'archived_by', 'updated_at'])
    return locked


@transaction.atomic
def unarchive_reservation(reservation: Reservation) -> Reservation:
    locked = Reservation.objects.select_for_update().get(pk=reservation.pk)
    if locked.archived_at is None:
        return locked
    locked.archived_at = None
    locked.archived_by = None
    locked.save(update_fields=['archived_at', 'archived_by', 'updated_at'])
    return locked


@transaction.atomic
def archive_conversation(conversation: Conversation, *, user=None) -> Conversation:
    """Hide a resolved thread from the staff inbox. Refuses if it needs a reply."""
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.state != 'resolved':
        raise ValidationError(
            {'detail': 'Resolve the thread before archiving it.'},
        )
    if locked.archived_at is not None:
        return locked
    locked.archived_at = timezone.now()
    locked.archived_by = user
    locked.save(update_fields=['archived_at', 'archived_by', 'updated_at'])
    return locked


@transaction.atomic
def unarchive_conversation(conversation: Conversation) -> Conversation:
    locked = Conversation.objects.select_for_update().get(pk=conversation.pk)
    if locked.archived_at is None:
        return locked
    locked.archived_at = None
    locked.archived_by = None
    locked.save(update_fields=['archived_at', 'archived_by', 'updated_at'])
    return locked


# ── Age-based selection (nightly job) ────────────────────────────────────────

def stale_released_holds(*, now=None) -> QuerySet[Reservation]:
    """Released holds past the archive window and not archived yet.

    `updated_at` is the release moment for these statuses — there is no
    dedicated released_at column, and the Released tab already sorts by it.
    """
    now = now or timezone.now()
    cutoff = now - timedelta(days=released_hold_archive_days())
    return Reservation.objects.filter(
        status__in=Reservation.RELEASED_STATUSES,
        archived_at__isnull=True,
        updated_at__lte=cutoff,
    )


def stale_resolved_threads(*, now=None) -> QuerySet[Conversation]:
    """Resolved threads whose last message is past the archive window."""
    now = now or timezone.now()
    cutoff = now - timedelta(days=resolved_thread_archive_days())
    return Conversation.objects.filter(
        state='resolved',
        archived_at__isnull=True,
    ).filter(
        Q(last_message_at__lte=cutoff)
        | Q(last_message_at__isnull=True, created_at__lte=cutoff),
    )


def abandoned_holds(*, now=None) -> QuerySet[Reservation]:
    """Holds safe to delete outright.

    Every condition has to hold: released (never completed), old enough, the
    email was never proven, the customer never wrote to us, and no POS cart was
    ever attached. Anything that fails one of these keeps its row.
    """
    now = now or timezone.now()
    cutoff = now - timedelta(days=abandoned_hold_purge_days())
    verified_event = ReservationEvent.objects.filter(
        reservation_id=OuterRef('pk'), kind='verified',
    )
    confirmed_email = HoldConfirmation.objects.filter(
        reservation_id=OuterRef('pk'), confirmed_at__isnull=False,
    )
    customer_message = Message.objects.filter(
        conversation__reservation_id=OuterRef('pk'), author_kind='customer',
    )
    return (
        Reservation.objects.filter(
            status__in=Reservation.RELEASED_STATUSES,
            updated_at__lte=cutoff,
            pos_cart__isnull=True,
            completed_at__isnull=True,
        )
        .annotate(
            has_verified_event=Exists(verified_event),
            has_confirmed_email=Exists(confirmed_email),
            has_customer_message=Exists(customer_message),
        )
        .filter(
            has_verified_event=False,
            has_confirmed_email=False,
            has_customer_message=False,
        )
    )


# ── Job entry points ─────────────────────────────────────────────────────────

def archive_stale(*, now=None) -> dict[str, int]:
    """Archive aged-out released holds and resolved threads. Idempotent."""
    now = now or timezone.now()
    holds = stale_released_holds(now=now).update(archived_at=now)
    threads = stale_resolved_threads(now=now).update(archived_at=now)
    return {'holds_archived': holds, 'threads_archived': threads}


def purge_abandoned(*, now=None) -> dict[str, int]:
    """Delete abandoned holds, plus their thread when it holds no real mail.

    A thread with only system messages carries nothing a person wrote, so it
    goes with the hold. Anything a customer or staff member typed survives as
    an orphaned thread rather than being destroyed.
    """
    now = now or timezone.now()
    holds = list(abandoned_holds(now=now).select_related('conversation'))
    if not holds:
        return {'holds_purged': 0, 'threads_purged': 0}

    threads_purged = 0
    holds_purged = 0
    for hold in holds:
        conversation = getattr(hold, 'conversation', None)
        with transaction.atomic():
            if conversation is not None:
                human = conversation.messages.exclude(author_kind='system').exists()
                if not human:
                    conversation.delete()
                    threads_purged += 1
            hold.delete()
            holds_purged += 1
    return {'holds_purged': holds_purged, 'threads_purged': threads_purged}
