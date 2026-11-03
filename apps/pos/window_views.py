"""The retail windows' one-call APIs (Retail 2, Bill 2026-11-02). Read-only, staff only."""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee, IsManagerOrAdmin

from . import drawer_card, register_card
from .models import Drawer, Register


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsEmployee])
def register_card_view(request, pk: int):
    """The Register window: GET /api/pos/registers/<id>/card/."""
    register = get_object_or_404(Register.objects.select_related('location'), pk=pk)
    manager = IsManagerOrAdmin().has_permission(request, None)
    return Response(register_card.card(register, manager=manager))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsEmployee])
def drawer_card_view(request, pk: int):
    """The Drawer window: GET /api/pos/drawers/<id>/card/."""
    drawer = get_object_or_404(
        Drawer.objects.select_related('register', 'current_cashier', 'opened_by', 'closed_by'), pk=pk,
    )
    manager = IsManagerOrAdmin().has_permission(request, None)
    # A cashier sees today's drawers (as on the Drawers page); past drawers, their drops and notes are managers'.
    if not manager and drawer.date != timezone.localdate():
        return Response({'detail': 'Only a manager sees a past drawer.'}, status=403)
    return Response(drawer_card.card(drawer, manager=manager))
