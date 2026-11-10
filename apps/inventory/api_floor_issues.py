"""
Floor issues (Dash Update #84): the one "Report a problem" report from the retail floor (services/floor_issues.py).

GET  /api/inventory/floor-issues/lookup/?code=   what the scanned tag is, the reasons, and whether it already waits
POST /api/inventory/floor-issues/                {"code", "reason", "where"?, "note"?, "photo"? (data URL),
                                                  "right_price"?, "right_retail"?}
GET  /api/inventory/floor-issues/                the reports still waiting (the Floor issues page adds their photo and
                                                 where to the shared rows of /api/inventory/reentries/?source=floor)
GET  /api/inventory/floor-issues/<id>/photo/     the report's photo
"""
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee
from apps.core.files import stream_s3
from apps.inventory.models import FloorIssue
from apps.inventory.services import floor_issues

STAFF = [IsAuthenticated, IsEmployee]


@api_view(['GET'])
@permission_classes(STAFF)
def floor_issue_lookup_view(request):
    return Response(floor_issues.lookup(request.query_params.get('code') or ''))


@api_view(['GET', 'POST'])
@permission_classes(STAFF)
def floor_issue_report_view(request):
    if request.method == 'GET':
        return Response({'results': floor_issues.waiting_reports()})
    d = request.data
    try:
        result = floor_issues.report(
            user=request.user, code=str(d.get('code') or ''), reason=str(d.get('reason') or ''),
            where=str(d.get('where') or 'floor'), note=str(d.get('note') or ''), photo=d.get('photo'),
            right_price=d.get('right_price'), right_retail=d.get('right_retail'),
        )
    except floor_issues.BadRequest as e:
        return Response({'detail': str(e), 'code': 'BAD_REQUEST'}, status=400)
    return Response(result, status=200 if result['already'] else 201)


@api_view(['GET'])
@permission_classes(STAFF)
def floor_issue_photo_view(request, pk):
    issue = get_object_or_404(FloorIssue.objects.select_related('photo', 'bad_tag__photo'), pk=pk)
    photo = floor_issues.photo_file(issue)
    if photo is None:
        return Response({'detail': 'Photo not found.', 'code': 'NOT_FOUND'}, status=404)
    return stream_s3(photo)
