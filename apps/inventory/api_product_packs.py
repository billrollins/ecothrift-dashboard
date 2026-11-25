"""
Pack sizes (Dash Update #224, ``services/product_packs.py``).

GET  /api/inventory/products/<id>/pack/       the product's pack (its numbers, or a guess from its title)
POST /api/inventory/products/<id>/new-pack/   make a new pack size linked to it; answers the scaled price and retail
POST /api/inventory/products/from-page/       {"text": pasted page, "row": processing row id}: an AI draft of the
                                              product, nothing saved (``services/product_from_page.py``)
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.models import Product
from apps.inventory.services import product_packs


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def product_pack_view(request, product_id: int):
    product = Product.objects.filter(pk=product_id).first()
    if product is None:
        return Response({'detail': 'No such product.'}, status=status.HTTP_404_NOT_FOUND)
    return Response({'id': product.pk, 'title': product.title, **product_packs.pack_payload(product)})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def product_new_pack_view(request, product_id: int):
    base = Product.objects.filter(pk=product_id).select_related('base_product', 'category').first()
    if base is None:
        return Response({'detail': 'No such product.'}, status=status.HTTP_404_NOT_FOUND)
    try:
        out = product_packs.make_pack(base, dict(request.data), user=request.user)
    except product_packs.PackError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(out, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def product_from_page_view(request):
    from apps.inventory.models import ProcessingRow
    from apps.inventory.services import product_from_page

    row = None
    raw_row = request.data.get('row')
    if str(raw_row or '').isdigit():
        row = ProcessingRow.objects.select_related('manifest_row').filter(pk=int(raw_row)).first()
    try:
        return Response(product_from_page.draft(str(request.data.get('text') or ''), row))
    except product_from_page.PageError as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
