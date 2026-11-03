"""
The universal Item modal's data (services/item_card.py).

GET /api/inventory/items/<id>/card/          the full card
GET /api/inventory/items/<id>/card/?lite=1   the hover card
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.services.item_card import item_card
from apps.inventory.services.order_card import order_card
from apps.inventory.services.product_card import product_card
from apps.inventory.services.restoration_card import restoration_card


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def item_card_view(request, pk):
    lite = str(request.query_params.get('lite', '')).lower() in ('1', 'true', 'yes')
    card = item_card(pk, lite=lite)
    if card is None:
        return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(card)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def product_card_view(request, pk):
    """The Product window (Dash Updates #11): GET /api/inventory/products/<id>/card/."""
    card = product_card(pk)
    if card is None:
        return Response({'detail': 'That product is not in the system.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(card)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def order_card_view(request, pk):
    """The Order window (Dash Updates #12): GET /api/inventory/orders/<id>/card/."""
    card = order_card(pk)
    if card is None:
        return Response({'detail': 'That order is not in the system.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(card)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def restoration_card_view(request, pk):
    """The Restoration job window (Dash Updates #14): GET /api/inventory/restoration-jobs/<id>/card/."""
    card = restoration_card(pk)
    if card is None:
        return Response({'detail': 'That restoration job is not in the system.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(card)
