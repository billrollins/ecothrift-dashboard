"""
Finding a manifest row's product in Processing (Dash Updates #98, ``services/product_find.py``).

GET /api/inventory/product-find/?q=<words or code>[&row=<processing row id>]   ranked products; the row's attached
                                                                               products are marked on_this_row
GET /api/inventory/processing-rows/<id>/likely-products/                      the row's likely products
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.models import ProcessingRow
from apps.inventory.services import product_find


def _attached(row: ProcessingRow | None) -> set[int]:
    if row is None:
        return set()
    return {int(k) for k in (row.product_links or {}).keys() if str(k).isdigit()}


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def product_find_view(request):
    q = str(request.query_params.get('q') or '').strip()
    if len(q) < 2:
        return Response({'q': q, 'results': [], 'took_ms': 0})
    row = None
    row_raw = request.query_params.get('row')
    if row_raw and str(row_raw).isdigit():
        row = ProcessingRow.objects.filter(pk=int(row_raw)).only('id', 'product_links').first()
    return Response(product_find.find(q, attached=_attached(row)))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def processing_row_likely_products_view(request, row_id: int):
    row = ProcessingRow.objects.filter(pk=row_id).first()
    if row is None:
        return Response({'detail': 'No such row.'}, status=status.HTTP_404_NOT_FOUND)
    return Response(product_find.likely(row))
