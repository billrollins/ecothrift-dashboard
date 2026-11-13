"""The Texts inbox (Dash Update #132, Bill 2026-11-13: "where do we see texts we get from that number?"), and staff texts
from our number. Owner and managers only.

- ``GET  /api/texting/status/``                      can staff texts go out from our number, and the unread count
- ``GET  /api/texting/inbox/``                       one row per number that has texted us, newest first
- ``GET  /api/texting/inbox/<number>/``              that conversation (their texts and ours); marks theirs read
- ``POST /api/texting/inbox/<number>/reply/``        reply from our number ({body})
- ``POST /api/texting/set-password-link/``           text a set-password link from our number ({link, phone?})

A reply needs no consent row (they texted us), only no STOP, the same as every staff text (``service.send_staff_text``).
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsOwner
from apps.texting import service
from apps.texting.models import InboundText, TextMessage

MAX_REPLY = 320  # two text segments, the same cap as every other text


def _who(number: str, user=None) -> dict:
    """The person behind a number: the staff member it matched, else a Thrift+ member with that phone, else nobody."""
    if user is not None:
        return {'name': user.full_name.strip() or user.email, 'user_id': user.pk, 'kind': 'staff'}
    from apps.thriftplus.models import Person

    person = Person.objects.filter(phone=number).order_by('id').first() if number else None
    if person is not None:
        return {'name': f'{person.first_name} {person.last_name}'.strip(), 'user_id': None, 'kind': 'thriftplus'}
    return {'name': '', 'user_id': None, 'kind': ''}


def unread_count() -> int:
    return InboundText.objects.filter(read_at__isnull=True).count()


@api_view(['GET'])
@permission_classes([IsManagerOrAdmin])
def texting_status(request):
    return Response({
        'staff_texts_live': service.staff_live(),
        'waiting_on': service.staff_waiting_on(),
        # Only the owner reads the inbox (2026-11-13), so only the owner sees its unread count.
        'unread': unread_count() if request.user.is_superuser else 0,
    })


@api_view(['GET'])
@permission_classes([IsOwner])  # Bill 2026-11-13: texts cost money and must stay private; owner only
def inbox(request):
    rows = list(
        InboundText.objects.values('phone')
        .annotate(last_at=Max('received_at'), unread=Count('id', filter=Q(read_at__isnull=True)), count=Count('id'))
        .order_by('-last_at')[:200]
    )
    latest = {}
    for text in InboundText.objects.filter(phone__in=[r['phone'] for r in rows]).select_related('user'):
        if text.phone not in latest or (text.received_at, text.id) > (latest[text.phone].received_at, latest[text.phone].id):
            latest[text.phone] = text
    out = []
    for row in rows:
        last = latest[row['phone']]
        user = last.user if last.user_id else None
        out.append({
            'phone': row['phone'], **_who(row['phone'], user), 'last_body': last.body, 'last_at': row['last_at'],
            'unread': row['unread'], 'count': row['count'], 'stopped': service.stopped(row['phone']),
        })
    return Response({'conversations': out, 'unread': unread_count()})


def _message_row(text: TextMessage) -> dict:
    return {
        'id': f'out-{text.pk}', 'from': 'us', 'body': text.body, 'at': text.created_at, 'status': text.status,
        'status_label': text.get_status_display(), 'reason': text.reason, 'key': text.key,
        'by': text.by.full_name.strip() if text.by_id else '',
    }


def _thread(number: str) -> dict:
    texts = list(InboundText.objects.filter(phone=number).select_related('user'))
    user = next((t.user for t in texts if t.user_id), None) or service.staff_for(number)
    rows = [{
        'id': f'in-{t.pk}', 'from': 'them', 'body': t.body, 'at': t.received_at, 'keyword': t.keyword, 'media': t.media,
        'read': t.read_at is not None,
    } for t in texts]
    rows += [_message_row(m) for m in TextMessage.objects.filter(phone=number).select_related('by')[:300]]
    rows.sort(key=lambda r: r['at'])
    return {
        'phone': number, **_who(number, user), 'stopped': service.stopped(number), 'messages': rows,
        'replies_live': not service.staff_waiting_on('reply'), 'waiting_on': service.staff_waiting_on('reply'),
    }


@api_view(['GET'])
@permission_classes([IsOwner])  # Bill 2026-11-13: texts cost money and must stay private; owner only
def conversation(request, number: str):
    number = service.digits(number) or number
    if not InboundText.objects.filter(phone=number).exists():
        return Response({'detail': 'No texts from that number.'}, status=status.HTTP_404_NOT_FOUND)
    InboundText.objects.filter(phone=number, read_at__isnull=True).update(read_at=timezone.now(), read_by=request.user)
    return Response(_thread(number))


@api_view(['POST'])
@permission_classes([IsOwner])  # Bill 2026-11-13: texts cost money and must stay private; owner only
def reply(request, number: str):
    number = service.digits(number)
    if not number or not InboundText.objects.filter(phone=number).exists():
        return Response({'detail': 'Replies go only to a US number that texted us.'}, status=status.HTTP_400_BAD_REQUEST)
    body = str(request.data.get('body') or '').strip()
    if not body:
        return Response({'detail': 'Write a reply first.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(service.shape(body)) > MAX_REPLY:
        return Response({'detail': f'Too long: keep it under {MAX_REPLY - 50} characters.'},
                        status=status.HTTP_400_BAD_REQUEST)
    message = service.send_staff_text(phone=number, key='reply', body=body, ref=f'texting.inbox:{number}',
                                      by=request.user)
    InboundText.objects.filter(phone=number, read_at__isnull=True).update(read_at=timezone.now(), read_by=request.user)
    return Response({'message': _message_row(message), **_thread(number)})


@api_view(['POST'])
@permission_classes([IsManagerOrAdmin])
def text_set_password_link(request):
    """Text a set-password link (made a moment ago on Users or Onboarding) from our number. The words are built here
    from the link's own token, never taken from the screen; the token is hidden in the record."""
    from apps.accounts.models import MagicLinkToken, User
    from apps.accounts.services.staff_password import staff_reset_link

    link = str(request.data.get('link') or '')
    token = (parse_qs(urlparse(link).query).get('token') or [''])[0]
    row = MagicLinkToken.objects.filter(token=token, purpose=MagicLinkToken.PURPOSE_STAFF_RESET_PASSWORD).first() \
        if token else None
    if row is None or row.used_at is not None or row.expires_at <= timezone.now():
        return Response({'detail': 'That link has expired or was replaced. Make a new one.'},
                        status=status.HTTP_400_BAD_REQUEST)
    user = User.objects.filter(email__iexact=row.email).first()
    if user is None:
        return Response({'detail': 'No one has that link.'}, status=status.HTTP_400_BAD_REQUEST)
    phone = str(request.data.get('phone') or '') or user.phone
    if not service.digits(phone):
        return Response({'detail': 'No mobile number for them.'}, status=status.HTTP_400_BAD_REQUEST)
    body = f'Eco-Thrift: set your Dash password here (works once, for 48 hours): {staff_reset_link(row.token)}&set=1'
    if user.username:
        body += f' Your username: {user.username}'
    message = service.send_staff_text(phone=phone, key='set_password_link', body=body, ref=f'accounts.user:{user.pk}',
                                      by=request.user)
    return Response({
        'status': message.status, 'status_label': message.get_status_display(), 'reason': message.reason,
        'sent': message.status == TextMessage.STATUS_SENT, 'to': service.masked(message.phone),
    })
