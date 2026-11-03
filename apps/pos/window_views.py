"""The retail windows' one-call APIs (Retail 2, Bill 2026-11-02). Read-only, staff only."""
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee, IsManagerOrAdmin

from . import register_card
from .models import Register


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsEmployee])
def register_card_view(request, pk: int):
    """The Register window: GET /api/pos/registers/<id>/card/."""
    register = get_object_or_404(Register.objects.select_related('location'), pk=pk)
    manager = IsManagerOrAdmin().has_permission(request, None)
    return Response(register_card.card(register, manager=manager))
