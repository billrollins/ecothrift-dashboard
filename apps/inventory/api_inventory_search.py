"""
Inventory search (services/inventory_search.py).

GET /api/inventory/search/?q=<text>&sold=1&page=1&sort=-sold&misfit=1   one page of products with their numbers
    (&category=<taxonomy name>&sub=<subcategory, or (none)>&vendor=<code, or (none)>&price_point=<band>&stale=1:
    Inventory → Review's drill)
GET /api/inventory/review/?tab=category|vendor|price_point&span=1|4&category=<name>   one Review tab
GET /api/inventory/review/flags/?span=1|4                                             the Flags tab
GET /api/inventory/search/items/?product=<id>&sold=1  the items of one product
GET /api/inventory/search/similar/?product=<id>       products that mean the same kind of thing, with their numbers
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
        str(request.query_params.get('q') or ''), include_sold=_flag(request, 'sold'), page=page,
        sort=str(request.query_params.get('sort') or ''), misfit=_flag(request, 'misfit'),
        category=str(request.query_params.get('category') or '')[:100],
        sub=request.query_params.get('sub') or None, stale=_flag(request, 'stale'),
        vendor=request.query_params.get('vendor') or None,
        price_point=str(request.query_params.get('price_point') or '')[:10]))


def _span(request) -> int:
    try:
        return int(request.query_params.get('span') or 1)
    except ValueError:
        return 1


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def inventory_review_view(request):
    """Inventory → Review, one tab: ?tab=category|vendor|price_point&span=1|4&category=<name>
    (services/inventory_review.py)."""
    from apps.inventory.services import inventory_review

    return Response(inventory_review.review(_span(request), request.query_params.get('category') or None,
                                            dimension=str(request.query_params.get('tab') or 'category')))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def inventory_review_flags_view(request):
    """Inventory → Review, Flags tab: each flag, its limit and what carries it now (?span=1|4)."""
    from apps.inventory.services import inventory_review

    return Response(inventory_review.flags_summary(_span(request)))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def inventory_search_items_view(request):
    raw = str(request.query_params.get('product') or '')
    if not raw.isdigit():
        return Response({'detail': 'Give product=<id>.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(inventory_search.product_items(int(raw), include_sold=_flag(request, 'sold')))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def inventory_search_similar_view(request):
    raw = str(request.query_params.get('product') or '')
    if not raw.isdigit():
        return Response({'detail': 'Give product=<id>.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(inventory_search.similar(int(raw)))
