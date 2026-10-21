"""Staff messages API (owner 2026-10-21). Rules: ``services/staff_messages.py``. Every staff login reads and replies;
the owner and managers start threads. The one-time secret is answered only by ``show-secret`` and never cached."""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .permissions import IsTeamMember
from .services import staff_messages


@api_view(['GET', 'POST'])
@permission_classes([IsTeamMember])
def threads_view(request):
    """GET: my threads, newest first, with unread counts. POST: start one ``{subject, body, to_user | to_department,
    secret?}`` (owner and managers)."""
    if request.method == 'GET':
        return Response(staff_messages.threads_for(request.user))
    data = request.data
    thread = staff_messages.start_thread(
        request.user, subject=data.get('subject'), body=data.get('body'),
        to_user=data.get('to_user') or None, to_department=data.get('to_department') or None,
        secret=data.get('secret') or '',
    )
    return Response(staff_messages.open_thread(request.user, thread.pk), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsTeamMember])
def unread_view(request):
    return Response({'unread': staff_messages.unread_count(request.user)})


@api_view(['GET'])
@permission_classes([IsTeamMember])
def audiences_view(request):
    if not staff_messages.can_start(request.user):
        return Response({'detail': 'Only the owner and managers start a message.'}, status=status.HTTP_403_FORBIDDEN)
    return Response(staff_messages.audiences())


@api_view(['GET'])
@permission_classes([IsTeamMember])
def thread_view(request, thread_id: int):
    return Response(staff_messages.open_thread(request.user, thread_id))


@api_view(['POST'])
@permission_classes([IsTeamMember])
def reply_view(request, thread_id: int):
    staff_messages.reply(request.user, thread_id, request.data.get('body'))
    return Response(staff_messages.open_thread(request.user, thread_id), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsTeamMember])
def show_secret_view(request, message_id: int):
    value = staff_messages.show_secret(request.user, message_id, device=staff_messages.device_text(request))
    response = Response({'secret': value})
    response['Cache-Control'] = 'no-store'
    return response
