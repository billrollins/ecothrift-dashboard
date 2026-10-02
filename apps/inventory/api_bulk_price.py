"""
Bulk price change and bulk tag reprint for Inventory search (services/bulk_price.py).

POST /api/inventory/bulk-price/preview/   {item_ids, product_ids, rule}   managers: what would change
POST /api/inventory/bulk-price/apply/     {item_ids, product_ids, rule}   managers: change the prices
GET  /api/inventory/bulk-price/                                           managers: the recent changes
GET  /api/inventory/bulk-price/<id>/                                      managers: one change with its items
POST /api/inventory/bulk-price/<id>/undo/                                 managers: put the old prices back
POST /api/inventory/bulk-price/labels/    {item_ids, product_ids}         staff: what the tags need (reprint)
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from apps.inventory.models import BulkPriceChange
from apps.inventory.services import bulk_price


def _ids(request, key: str) -> list[int]:
    raw = request.data.get(key) or []
    return [int(x) for x in raw if str(x).isdigit()][:20000] if isinstance(raw, list) else []


def _bad(message: str) -> Response:
    return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def bulk_price_preview_view(request):
    try:
        return Response(bulk_price.preview(_ids(request, 'item_ids'), _ids(request, 'product_ids'), request.data.get('rule')))
    except bulk_price.RuleError as exc:
        return _bad(str(exc))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def bulk_price_apply_view(request):
    try:
        change = bulk_price.apply(request.user, _ids(request, 'item_ids'), _ids(request, 'product_ids'), request.data.get('rule'))
    except bulk_price.RuleError as exc:
        return _bad(str(exc))
    return Response(bulk_price.summary(change, with_items=True), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def bulk_price_list_view(request):
    return Response({'results': bulk_price.recent()})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def bulk_price_detail_view(request, pk: int):
    change = BulkPriceChange.objects.filter(pk=pk).first()
    if change is None:
        return Response({'detail': 'No such change.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(bulk_price.summary(change, with_items=True))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def bulk_price_undo_view(request, pk: int):
    change = BulkPriceChange.objects.filter(pk=pk).first()
    if change is None:
        return Response({'detail': 'No such change.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        result = bulk_price.undo(change, request.user)
    except bulk_price.RuleError as exc:
        return _bad(str(exc))
    change.refresh_from_db()
    return Response({**bulk_price.summary(change, with_items=True), 'undo_result': result})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def bulk_labels_view(request):
    return Response(bulk_price.labels(_ids(request, 'item_ids'), _ids(request, 'product_ids')))
