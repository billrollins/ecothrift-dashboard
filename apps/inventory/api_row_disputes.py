"""
Row disputes from the Processing queue (Dash Update #100, services/row_disputes.py). Same people as Processing.

GET  /api/inventory/orders/<po>/row-disputes/?processing_row=<id>   the row, what is left, its disputes
POST /api/inventory/orders/<po>/row-disputes/                       {processing_row_id, reason, units, pct_lost?, note?}
     as JSON, or as a form with ``photos`` files: every reason but did_not_come needs at least one (Dash Update #101)
POST /api/inventory/orders/<po>/row-disputes/<id>/undo/             the units go back to the row
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.models import PurchaseOrder
from apps.inventory.services import row_disputes


def _order(po_id: int) -> PurchaseOrder:
    return get_object_or_404(PurchaseOrder.objects.only('id', 'order_number'), pk=po_id)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsStaff])
def row_disputes_view(request, po_id: int):
    order = _order(po_id)
    try:
        if request.method == 'GET':
            return Response(row_disputes.row_disputes(order, request.query_params.get('processing_row')))
        raw = request.data if hasattr(request.data, 'get') else {}
        # JSON or a form with photos (``photos``, one or more files); one value per field either way.
        data = {k: raw.get(k) for k in ('processing_row_id', 'reason', 'units', 'pct_lost', 'note')}
        photos = request.FILES.getlist('photos') if request.FILES else []
        return Response(row_disputes.create(request.user, order, data, photos), status=status.HTTP_201_CREATED)
    except row_disputes.RowDisputeError as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def row_dispute_undo_view(request, po_id: int, dispute_id: int):
    order = _order(po_id)
    try:
        return Response(row_disputes.undo(request.user, order, dispute_id))
    except row_disputes.RowDisputeError as e:
        return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)
