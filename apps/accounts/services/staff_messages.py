"""Staff messages in Dash (owner 2026-10-21): never email or text, ever.

- **Who sends.** The owner and managers start a thread, to one person or to a whole department (everyone in it at the
  time). Everyone on a thread can reply. Each message keeps read receipts: who read it, and when.
- **One-time secrets.** A message to one person can carry a secret (a PIN). Only that person sees it, once, with a
  Show tap. Dash records when and from which device, then deletes the secret; the message stays and says "Shown once
  on <date>; deleted". The secret is never in a list, a notification, admin or a log.
- **The envelope.** ``unread_count`` is what the top bar shows.
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.accounts.models import (
    StaffMessage, StaffMessageRead, StaffMessageSecret, StaffThread, StaffThreadMember, User,
)
from apps.accounts.services import one_time_secret

MAX_BODY = 4000
MAX_SECRET = 200


def can_start(user) -> bool:
    return bool(user.is_superuser or user.role in ('Manager', 'Admin'))


def _active_staff():
    from apps.accounts.services.staff_customer import staff_users

    today = timezone.localdate()
    return staff_users().exclude(employee__termination_date__lte=today)


def audiences() -> dict:
    """Who a new thread can go to: a person, or a department."""
    from apps.hr.models import Department

    people = _active_staff().order_by('first_name', 'last_name')
    return {
        'people': [{'id': u.pk, 'name': u.full_name} for u in people],
        'departments': [{'id': d.pk, 'name': d.name} for d in Department.objects.filter(is_active=True)],
    }


def _clean_body(body) -> str:
    body = str(body or '').strip()
    if not body:
        raise ValidationError({'body': 'Write a message.'})
    if len(body) > MAX_BODY:
        raise ValidationError({'body': f'Keep it under {MAX_BODY} characters.'})
    return body


def _add(thread: StaffThread, sender, body: str, *, secret: str = '', secret_for=None) -> StaffMessage:
    now = timezone.now()
    message = StaffMessage.objects.create(thread=thread, sender=sender, body=body, has_secret=bool(secret),
                                          secret_for=secret_for if secret else None)
    if secret:
        StaffMessageSecret.objects.create(message=message, sealed=one_time_secret.seal(secret))
    if sender is not None:
        StaffMessageRead.objects.get_or_create(message=message, user=sender)
        StaffThreadMember.objects.filter(thread=thread, user=sender).update(last_read_at=now)
    StaffThread.objects.filter(pk=thread.pk).update(last_message_at=now)
    return message


@transaction.atomic
def start_thread(sender, *, subject: str, body: str, to_user=None, to_department=None, secret: str = '',
                 system: bool = False) -> StaffThread:
    """A new thread. ``system`` lets Dash itself (a Requests kind) send, with the approver as the sender."""
    from apps.hr.models import Department

    if not system and not can_start(sender):
        raise PermissionDenied('Only the owner and managers start a message.')
    subject = ' '.join(str(subject or '').split())[:140]
    if not subject:
        raise ValidationError({'subject': 'Add a subject.'})
    body = _clean_body(body)
    secret = str(secret or '').strip()
    if len(secret) > MAX_SECRET:
        raise ValidationError({'secret': f'Keep the secret under {MAX_SECRET} characters.'})
    if to_user is not None and to_department is not None:
        raise ValidationError({'detail': 'Send to one person or one department.'})
    recipient = department = None
    if to_user is not None:
        recipient = to_user if isinstance(to_user, User) else _active_staff().filter(pk=to_user).first()
        if recipient is None:
            raise ValidationError({'to_user': 'Pick someone on the staff.'})
        members, audience = [recipient], recipient.full_name
    elif to_department is not None:
        department = Department.objects.filter(pk=to_department, is_active=True).first()
        if department is None:
            raise ValidationError({'to_department': 'Pick a department.'})
        if secret:
            raise ValidationError({'secret': 'A secret goes to one person only.'})
        members = list(_active_staff().filter(employee__department=department))
        if not members:
            raise ValidationError({'to_department': f'Nobody is in {department.name} yet.'})
        audience = department.name
    else:
        raise ValidationError({'detail': 'Send to one person or one department.'})
    if secret and recipient is not None and sender is not None and recipient.pk == sender.pk:
        raise ValidationError({'secret': 'A secret goes to someone else.'})
    thread = StaffThread.objects.create(subject=subject, audience=audience, department=department, created_by=sender)
    for user in {u.pk: u for u in [*members, *([sender] if sender is not None else [])]}.values():
        StaffThreadMember.objects.get_or_create(thread=thread, user=user)
    _add(thread, sender, body, secret=secret, secret_for=recipient)
    return thread


def _member_thread(user, thread_id) -> StaffThread:
    thread = StaffThread.objects.filter(pk=thread_id, members__user=user).first()
    if thread is None:
        raise NotFound('No such message.')
    return thread


def reply(user, thread_id, body) -> StaffMessage:
    thread = _member_thread(user, thread_id)
    return _add(thread, user, _clean_body(body))


def _unread_q(user):
    return Q(thread__members__user=user) & ~Q(sender=user) & ~Exists(
        StaffMessageRead.objects.filter(message=OuterRef('pk'), user=user))


def unread_count(user) -> int:
    return StaffMessage.objects.filter(_unread_q(user)).distinct().count()


def threads_for(user) -> list[dict]:
    rows = StaffThread.objects.filter(members__user=user).select_related('created_by').distinct()
    unread: dict[int, int] = {}
    for thread_id in StaffMessage.objects.filter(_unread_q(user)).distinct().values_list('thread_id', flat=True):
        unread[thread_id] = unread.get(thread_id, 0) + 1
    out = []
    for thread in rows:
        last = thread.messages.select_related('sender').order_by('-created_at', '-id').first()
        out.append({
            'id': thread.pk, 'subject': thread.subject, 'audience': thread.audience,
            'started_by': thread.created_by.full_name if thread.created_by_id else 'Dash',
            'last_message_at': thread.last_message_at, 'unread': unread.get(thread.pk, 0),
            # A preview never shows a secret: only that one is waiting.
            'preview': (last.body[:140] if last else ''),
            'preview_from': (last.sender.full_name if last and last.sender_id else 'Dash'),
        })
    return out


def _secret_payload(message: StaffMessage, viewer) -> dict | None:
    if not message.has_secret:
        return None
    shown = message.secret_shown_at is not None
    return {
        'state': 'shown' if shown else 'waiting',
        'for': message.secret_for.full_name if message.secret_for_id else '',
        'shown_at': message.secret_shown_at,
        'can_show': (not shown) and message.secret_for_id == viewer.pk,
    }


def _message_payload(message: StaffMessage, viewer) -> dict:
    reads = [r for r in message.reads.all() if r.user_id != message.sender_id]
    return {
        'id': message.pk, 'body': message.body, 'created_at': message.created_at,
        'sender': message.sender.full_name if message.sender_id else 'Dash',
        'sender_id': message.sender_id, 'mine': message.sender_id == viewer.pk,
        'secret': _secret_payload(message, viewer),
        'read_by': [{'name': r.user.full_name, 'at': r.read_at} for r in sorted(reads, key=lambda r: r.read_at)],
    }


def open_thread(user, thread_id) -> dict:
    """The whole thread; opening it marks every message read for this person."""
    thread = _member_thread(user, thread_id)
    now = timezone.now()
    for message in thread.messages.exclude(sender=user).exclude(reads__user=user):
        StaffMessageRead.objects.get_or_create(message=message, user=user)
    StaffThreadMember.objects.filter(thread=thread, user=user).update(last_read_at=now)
    messages = thread.messages.select_related('sender', 'secret_for').prefetch_related('reads__user')
    members = thread.members.select_related('user').order_by('user__first_name')
    return {
        'id': thread.pk, 'subject': thread.subject, 'audience': thread.audience,
        'started_by': thread.created_by.full_name if thread.created_by_id else 'Dash',
        'members': [{'id': m.user_id, 'name': m.user.full_name} for m in members],
        'messages': [_message_payload(m, user) for m in messages],
    }


def show_secret(user, message_id, *, device: str) -> str:
    """The secret, once, to its one reader. Records when and where, then deletes it."""
    with transaction.atomic():
        message = (StaffMessage.objects.select_for_update().filter(pk=message_id, thread__members__user=user)
                   .first())
        if message is None or not message.has_secret:
            raise NotFound('No such secret.')
        if message.secret_for_id != user.pk:
            raise PermissionDenied('This secret is for someone else.')
        if message.secret_shown_at is not None:
            raise ValidationError({'detail': 'Already shown once, then deleted.', 'code': 'SECRET_GONE'})
        row = StaffMessageSecret.objects.filter(message=message).first()
        if row is None:
            raise ValidationError({'detail': 'Already shown once, then deleted.', 'code': 'SECRET_GONE'})
        value = one_time_secret.open_sealed(row.sealed)
        row.delete()
        message.secret_shown_at = timezone.now()
        message.secret_shown_device = (device or '')[:200]
        message.save(update_fields=['secret_shown_at', 'secret_shown_device'])
        StaffMessageRead.objects.get_or_create(message=message, user=user)
    return value


def device_text(request) -> str:
    """Where the secret was shown: the device kind, the address and the browser."""
    kind = request.META.get('HTTP_X_DEVICE_KIND') or 'browser'
    address = request.META.get('REMOTE_ADDR') or ''
    agent = (request.META.get('HTTP_USER_AGENT') or '')[:120]
    return ' · '.join(part for part in (kind, address, agent) if part)
