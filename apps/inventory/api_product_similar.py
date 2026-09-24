"""
Similar products by meaning (pgvector), with how they sold (product_intelligence Phase 2, step 6).

GET /api/inventory/similar-products/?product=<id>   neighbours of a catalog product
GET /api/inventory/similar-products/?q=<text>        neighbours of free text (e.g. a manifest line)
    optional: limit (1-50, default 10), category (taxonomy name), sold=1 (only products that sold)
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.models import Product
from apps.inventory.services.product_vectors import MODEL_NAME, similar_products


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def similar_products_view(request):
    try:
        limit = min(50, max(1, int(request.query_params.get('limit') or 10)))
    except ValueError:
        limit = 10
    category = request.query_params.get('category') or None
    sold_only = str(request.query_params.get('sold', '')).lower() in ('1', 'true', 'yes')
    product_id = request.query_params.get('product')
    text = str(request.query_params.get('q') or '').strip()
    if product_id:
        product = Product.objects.filter(pk=product_id).first()
        if product is None:
            return Response({'detail': 'No such product.'}, status=status.HTTP_404_NOT_FOUND)
        results = similar_products(product=product, limit=limit, category=category, sold_only=sold_only)
    elif text:
        results = similar_products(text=text[:300], limit=limit, category=category, sold_only=sold_only)
    else:
        return Response({'detail': 'Give product=<id> or q=<text>.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response({'model': MODEL_NAME, 'results': results})
