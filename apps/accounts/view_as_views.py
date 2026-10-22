"""View as (owner 2026-10-21, C5): start and stop. The rules live in ``services/view_as.py``.

``POST view-as/start/`` ``{ user_id }``: the owner (a superuser, not already viewing) starts viewing Dash as that
employee. Answers a view-as access token and the banner payload; the browser then reloads Dash with it.
``POST view-as/stop/``: Back. Ends the view; the next refresh hands the owner's own token back.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .services import view_as
from .views import REFRESH_COOKIE_NAME


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def view_as_start_view(request):
    if not request.user.is_superuser or getattr(request._request, 'view_as_session', None) is not None:
        return Response({'detail': 'Only the owner can view as someone.', 'code': 'NOT_OWNER'},
                        status=status.HTTP_403_FORBIDDEN)
    target = User.objects.select_related('employee').filter(pk=request.data.get('user_id') or 0).first()
    if target is None:
        return Response({'detail': 'No such person.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        refresh = RefreshToken(request.COOKIES.get(REFRESH_COOKIE_NAME) or '')
    except Exception:
        refresh = None
    if refresh is None or str(refresh.get('user_id')) != str(request.user.pk):
        return Response({'detail': 'Sign in again, then try View as.', 'code': 'SIGN_IN'},
                        status=status.HTTP_400_BAD_REQUEST)
    try:
        session = view_as.start(request.user, target, refresh_jti=refresh['jti'])
    except view_as.ViewAsError as exc:
        return Response({'detail': exc.detail, 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'access': view_as.access_token(refresh, session), 'view_as': view_as.payload(session)})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def view_as_stop_view(request):
    session = getattr(request._request, 'view_as_session', None)
    if session is None:
        return Response({'ended': False, 'detail': 'Not viewing as anyone.'})
    view_as.end(session, view_as.ENDED_BACK)
    return Response({'ended': True, 'detail': f'Back to {view_as.short_name(session.real_user)}.'})
