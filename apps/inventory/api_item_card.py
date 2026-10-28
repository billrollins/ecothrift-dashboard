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


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def item_card_view(request, pk):
    lite = str(request.query_params.get('lite', '')).lower() in ('1', 'true', 'yes')
    card = item_card(pk, lite=lite)
    if card is None:
        return Response({'detail': 'Item not found.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(card)
