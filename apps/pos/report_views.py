"""The owner's Reports page (owner 2026-10-13): the sales tax report first; more monthly reports later."""
from __future__ import annotations

from datetime import date

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsSuperAdmin
from apps.pos.services import sales_tax

MAX_DAYS = 400


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def sales_tax_report(request):
    """GET ?start=YYYY-MM-DD&end=YYYY-MM-DD (both days included): the sales tax report for the period."""
    try:
        start = date.fromisoformat(request.query_params.get('start', ''))
        end = date.fromisoformat(request.query_params.get('end', ''))
    except ValueError:
        return Response({'detail': 'start and end are dates (YYYY-MM-DD).'}, status=status.HTTP_400_BAD_REQUEST)
    if end < start or (end - start).days > MAX_DAYS:
        return Response({'detail': f'Pick a period of 1 to {MAX_DAYS} days.'}, status=status.HTTP_400_BAD_REQUEST)
    return Response(sales_tax.report(start, end))
