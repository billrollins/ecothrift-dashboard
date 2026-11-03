"""People → Permissions (Dash Update #53): levels, departments, each person, and History.

Managers (and anyone granted "See the Permissions page") read it; only the owner changes it.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import AccessSet, User
from apps.accounts.permissions import IsManagerOrAdmin, IsOwner
from apps.accounts.services import access


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def access_page_view(request):
    return Response(access.page_payload(request.user))


@api_view(['PUT'])
@permission_classes([IsAuthenticated, IsOwner])
def access_layer_view(request):
    """Save one layer whole. Body: ``{kind: level|department|person, level?, department_id?, user_id?, areas}``."""
    from apps.hr.models import Department

    data = request.data if isinstance(request.data, dict) else {}
    kind = data.get('kind')
    department = user = None
    if kind == AccessSet.KIND_DEPARTMENT:
        department = Department.objects.filter(pk=data.get('department_id')).first()
    elif kind == AccessSet.KIND_PERSON:
        user = User.objects.filter(pk=data.get('user_id')).first()
    try:
        saved = access.save_layer(kind=kind, actor=request.user, areas=data.get('areas'), level=data.get('level'),
                                  department=department, user=user)
    except access.AccessError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'saved': saved, **access.page_payload(request.user)})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsOwner])
def access_level_view(request):
    """Make a staff member an Employee or a Manager. Body: ``{user_id, level}``."""
    data = request.data if isinstance(request.data, dict) else {}
    user = User.objects.filter(pk=data.get('user_id')).first()
    try:
        access.set_level(user=user, level=data.get('level'), actor=request.user)
    except access.AccessError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(access.page_payload(request.user))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def access_history_view(request):
    return Response({'results': access.history()})
