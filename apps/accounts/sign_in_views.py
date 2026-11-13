"""Cannot sign in (Dash Update #121): who is locked out or has no password, and one-tap help.

- ``GET  sign-in-trouble/``                 the list, managers and the owner.
- ``POST sign-in-trouble/<id>/unlock/``      the owner (and the Admin level): clear the lockout now.
- ``POST sign-in-trouble/<id>/email-link/``  managers and the owner: email the person a reset link (1 hour).
- ``POST sign-in-trouble/<id>/link/``        a set-password link (48 hours) to text or show as a QR. Whoever holds it
  can set the password, so a manager gets one only for an Employee; the owner's and managers' links are the owner's.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import AccountEvent
from .permissions import IsAdmin, IsManagerOrAdmin
from .services import sign_in_trouble
from .services.staff_password import SET_PASSWORD_TTL, is_staff_account, issue_staff_reset, staff_reset_link

User = get_user_model()


def _is_owner_level(user) -> bool:
    return bool(user.is_superuser or user.role == 'Admin')


def _staff_target(pk: int):
    target = User.objects.filter(pk=pk, is_active=True).first()
    if target is None or not is_staff_account(target):
        return None
    return target


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def sign_in_trouble_view(request):
    rows = sign_in_trouble.trouble_rows()
    owner = _is_owner_level(request.user)
    for row in rows:
        row['can_unlock'] = owner
        row['can_link'] = owner or (row['role'] == 'Employee' and not row['is_owner'])
    return Response({
        'locked_today': sum(1 for r in rows if r['state'] in ('locked', 'was_locked')),
        'locked_now': sum(1 for r in rows if r['locked_now']),
        'no_password': sum(1 for r in rows if r['state'] == 'no_password'),
        'rows': rows,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsAdmin])
def unlock_view(request, pk: int):
    target = _staff_target(pk)
    if target is None:
        return Response({'detail': 'No active staff login with that id.'}, status=status.HTTP_404_NOT_FOUND)
    was = sign_in_trouble.unlock(target, actor=request.user)
    first = target.first_name or 'They'
    return Response({'detail': f'{first} can sign in again.' if was else f'{first} was not locked. Nothing to do.',
                     'was_locked': was})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def email_link_view(request, pk: int):
    from .views import _send_staff_reset

    target = _staff_target(pk)
    if target is None:
        return Response({'detail': 'No active staff login with that id.'}, status=status.HTTP_404_NOT_FOUND)
    return _send_staff_reset(target, request=request, requested_by_admin=True)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def set_link_view(request, pk: int):
    from .services.usernames import assign_username
    from .views import _client_ip

    target = _staff_target(pk)
    if target is None:
        return Response({'detail': 'No active staff login with that id.'}, status=status.HTTP_404_NOT_FOUND)
    if not _is_owner_level(request.user) and (target.is_superuser or target.role != 'Employee'):
        return Response({'detail': "Only the owner makes a link for a manager's or the owner's login. "
                                   'Email it to them instead.'}, status=status.HTTP_403_FORBIDDEN)
    try:
        row = issue_staff_reset(user=target, request_ip=_client_ip(request), ttl=SET_PASSWORD_TTL)
    except ValidationError as exc:
        return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)
    AccountEvent.log(target, AccountEvent.KIND_LINK, actor=request.user)
    return Response({
        'link': staff_reset_link(row.token) + '&set=1',
        'expires_at': row.expires_at,
        'username': assign_username(target),
        'phone': target.phone or '',
    })
