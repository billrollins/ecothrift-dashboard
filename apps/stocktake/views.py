import csv

from django.http import HttpResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee, IsManagerOrAdmin

from .models import InventoryCount
from .services import counting


def _get(pk):
    try:
        return InventoryCount.objects.get(pk=pk)
    except InventoryCount.DoesNotExist:
        return None


def _not_found():
    return Response({'detail': 'Count not found.', 'code': 'COUNT_NOT_FOUND'}, status=404)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsEmployee])
def counts(request):
    """GET: recent counts (newest first). POST: start a count; freezes what the system says is on the shelf."""
    if request.method == 'POST':
        count = counting.start_count(
            user=request.user,
            name=str(request.data.get('name') or ''),
            note=str(request.data.get('note') or ''),
        )
        return Response(counting.summary(count), status=201)
    return Response([counting.summary(c) for c in InventoryCount.objects.all()[:30]])


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsEmployee])
def count_detail(request, pk):
    count = _get(pk)
    return Response(counting.summary(count)) if count else _not_found()


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsEmployee])
def count_scans(request, pk):
    """Body: ``{"scans": [{"client_id", "code", "seq", "scanned_at"}]}``. Returns one result per scan, in order."""
    count = _get(pk)
    if count is None:
        return _not_found()
    scans = request.data.get('scans')
    if not isinstance(scans, list) or not scans:
        return Response({'detail': 'scans must be a non-empty list.', 'code': 'SCANS_REQUIRED'}, status=400)
    try:
        results = counting.record_scans(count, scans)
    except counting.CountClosed:
        return Response({'detail': 'This count is closed.', 'code': 'COUNT_CLOSED'}, status=409)
    return Response({'results': results, 'summary': counting.summary(count)})


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsEmployee])
def count_close(request, pk):
    count = _get(pk)
    if count is None:
        return _not_found()
    counting.close_count(count)
    return Response(counting.summary(count))


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def count_restart(request, pk):
    """Discard an open count and its scans, then start a new one. Managers and up."""
    count = _get(pk)
    if count is None:
        return _not_found()
    try:
        fresh = counting.restart_count(count, user=request.user)
    except counting.CountClosed:
        return Response({'detail': 'This count is closed. Start a new one instead.', 'code': 'COUNT_CLOSED'}, status=409)
    return Response(counting.summary(fresh), status=201)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def count_report(request, pk):
    count = _get(pk)
    return Response(counting.report(count)) if count else _not_found()


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def count_report_csv(request, pk):
    count = _get(pk)
    if count is None:
        return _not_found()
    data = counting.report(count)
    resp = HttpResponse(content_type='text/csv')
    resp['Content-Disposition'] = f'attachment; filename="count-{count.pk}-missing.csv"'
    w = csv.writer(resp)
    w.writerow(['sku', 'title', 'location', 'price', 'retail', 'cost', 'listed_at'])
    for r in data['missing']:
        w.writerow([r['sku'], r['title'], r['location'], r['price'], r['retail'] or '', r['cost'] or '', r['listed_at'] or ''])
    return resp
