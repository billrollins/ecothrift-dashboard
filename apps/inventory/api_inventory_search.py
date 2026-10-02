"""
Inventory search (services/inventory_search.py).

GET /api/inventory/search/?q=<text>&sold=1&page=1     one page of products with their numbers
GET /api/inventory/search/items/?product=<id>&sold=1  the items of one product
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.services import inventory_search


def _flag(request, name: str) -> bool:
    return str(request.query_params.get(name, '')).lower() in ('1', 'true', 'yes')


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def inventory_search_view(request):
    try:
        page = int(request.query_params.get('page') or 1)
    except ValueError:
        page = 1
    return Response(inventory_search.search(
        str(request.query_params.get('q') or ''), include_sold=_flag(request, 'sold'), page=page))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def inventory_search_items_view(request):
    raw = str(request.query_params.get('product') or '')
    if not raw.isdigit():
        return Response({'detail': 'Give product=<id>.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(inventory_search.product_items(int(raw), include_sold=_flag(request, 'sold')))
