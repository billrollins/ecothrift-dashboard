"""
Items back in Processing: the Returns and Floor issues pages (services/reentry.py; Dash Updates #83 and #84).
Same people as Processing check-in (staff).

GET  /api/inventory/reentries/?source=return|floor[&done=1]   the rows waiting (or the last ones decided)
POST /api/inventory/reentries/                                {sku, source, reason?}: put an item on the list
GET  /api/inventory/reentries/find/?code=&source=             a scanned tag: the item, and its row when it waits
POST /api/inventory/reentries/<id>/price-again/               {price}: new price, back on the shelf (the page prints)
POST /api/inventory/reentries/<id>/back-to-shelf/             back on the shelf as it is
POST /api/inventory/reentries/<id>/send-to-restoration/       {restoration: {needs, done_price, ...}}
POST /api/inventory/reentries/<id>/scrap/                     {reason}

Every action answers ``{row, item}``: the closed row and the item's tag facts (``restoration_tag`` too after a send).
A refusal is a 400 with ``detail`` (a sentence for the screen) and ``code``.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff
from apps.inventory.models import Item
from apps.inventory.services import reentry


def _refused(exc: Exception) -> Response:
    if isinstance(exc, reentry.ReentryError):
        http = status.HTTP_404_NOT_FOUND if exc.code in ('NOT_FOUND', 'NO_ITEM') else status.HTTP_400_BAD_REQUEST
        return Response(exc.payload(), status=http)
    return Response({'detail': str(exc), 'code': 'BAD_REQUEST'}, status=status.HTTP_400_BAD_REQUEST)


def _done(row, **extra) -> Response:
    return Response({'row': reentry.as_row(row), 'item': {**reentry.label(row.item), **extra}})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsStaff])
def reentry_list_view(request):
    if request.method == 'GET':
        q = request.query_params
        try:
            return Response(reentry.rows(str(q.get('source') or ''),
                                         done=str(q.get('done') or '').lower() in ('1', 'true', 'yes')))
        except reentry.ReentryError as exc:
            return _refused(exc)
    from apps.inventory.services.scan_code import sku_from_scan

    sku = sku_from_scan(request.data.get('sku')).strip()
    item = Item.objects.select_related('product').filter(sku__iexact=sku).first() if sku else None
    if item is None:
        return Response({'detail': f'No item with the number {sku}.' if sku else 'Scan a tag or type an item number.',
                         'code': 'NO_ITEM'}, status=status.HTTP_404_NOT_FOUND)
    try:
        row = reentry.report(item, str(request.data.get('source') or ''), reason=str(request.data.get('reason') or ''),
                             user=request.user)
    except reentry.ReentryError as exc:
        return _refused(exc)
    return Response(reentry.as_row(row), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsStaff])
def reentry_find_view(request):
    q = request.query_params
    try:
        return Response(reentry.find(str(q.get('code') or ''), str(q.get('source') or '')))
    except reentry.ReentryError as exc:
        return _refused(exc)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def reentry_price_again_view(request, pk):
    try:
        return _done(reentry.price_again(pk, request.data.get('price'), request.user))
    except ValueError as exc:
        return _refused(exc)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def reentry_back_to_shelf_view(request, pk):
    try:
        return _done(reentry.back_to_shelf(pk, request.user))
    except ValueError as exc:
        return _refused(exc)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def reentry_send_to_restoration_view(request, pk):
    try:
        row, tag = reentry.send_to_restoration(pk, request.data.get('restoration'), request.user)
    except ValueError as exc:
        return _refused(exc)
    return _done(row, **({'restoration_tag': tag} if tag else {}))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsStaff])
def reentry_scrap_view(request, pk):
    try:
        return _done(reentry.scrap(pk, str(request.data.get('reason') or ''), request.user))
    except ValueError as exc:
        return _refused(exc)
