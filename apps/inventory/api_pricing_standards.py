"""
Pricing standards (Dash Update #180; services/pricing_standards.py).

GET  /api/inventory/pricing-standards/product/<id>/?retail=   staff: the check-in line (mark, suggestion, price)
POST /api/inventory/pricing-standards/product/<id>/mark/      staff: {standard: name_brand|store_brand|no|''}
GET  /api/inventory/pricing-standards/deep-stock/             managers: deep stock with its pace; what is due a step
POST /api/inventory/pricing-standards/deep-stock/step/        managers: {product_ids} apply one step to those due
GET  /api/inventory/pricing-standards/stepped/                managers: the report of every step
GET  /api/inventory/pricing-standards/sat/                    managers: commodities that sat past the sit days
GET  /api/inventory/pricing-standards/trucks/                 managers: orders with lines not yet checked in
GET  /api/inventory/pricing-standards/truck/<po_id>/          managers: lines the commodity standard prices
POST /api/inventory/pricing-standards/truck/<po_id>/apply/    managers: {row_ids} write those prices
"""
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin, IsStaff
from apps.inventory.models import Product, PurchaseOrder
from apps.inventory.services import pricing_standards as ps


def _ids(request, key: str) -> list[int]:
    raw = request.data.get(key) or []
    return [int(x) for x in raw if str(x).isdigit()][:20000] if isinstance(raw, list) else []


def _bad(message: str) -> Response:
    return Response({'detail': message}, status=status.HTTP_400_BAD_REQUEST)


def _missing(what: str) -> Response:
    return Response({'detail': f'No such {what}.'}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def product_standard_view(request, pk: int):
    product = Product.objects.filter(pk=pk).first()
    if product is None:
        return _missing('product')
    return Response(ps.for_product(product, request.query_params.get('retail')))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def product_standard_mark_view(request, pk: int):
    product = Product.objects.filter(pk=pk).first()
    if product is None:
        return _missing('product')
    try:
        ps.mark(product, str(request.data.get('standard') or ''))
    except ps.StandardError as exc:
        return _bad(str(exc))
    return Response(ps.for_product(product, request.data.get('retail')))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def deep_stock_view(request):
    return Response(ps.deep_stock())


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def deep_stock_step_view(request):
    try:
        done = ps.step(request.user, _ids(request, 'product_ids'))
    except ps.StandardError as exc:
        return _bad(str(exc))
    return Response({'changes': done}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def stepped_view(request):
    return Response({'results': ps.stepped()})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def sat_view(request):
    return Response({'results': ps.sat_too_long(), 'standards': ps.standards().as_dict()})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def trucks_view(request):
    open_rows = Count('processing_bookmarks', filter=Q(processing_bookmarks__qty_dispositioned=0))
    rows = (PurchaseOrder.objects.annotate(open_rows=open_rows).filter(open_rows__gt=0)
            .order_by('-created_at').values('id', 'order_number', 'vendor__name', 'description', 'open_rows')[:40])
    return Response({'results': [
        {'id': r['id'], 'order_number': r['order_number'], 'vendor': r['vendor__name'] or '',
         'description': r['description'] or '', 'open_rows': r['open_rows']} for r in rows
    ]})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def truck_view(request, po_id: int):
    if not PurchaseOrder.objects.filter(pk=po_id).exists():
        return _missing('order')
    return Response(ps.truck(po_id))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def truck_apply_view(request, po_id: int):
    if not PurchaseOrder.objects.filter(pk=po_id).exists():
        return _missing('order')
    try:
        return Response(ps.apply_truck(po_id, _ids(request, 'row_ids')))
    except ps.StandardError as exc:
        return _bad(str(exc))
