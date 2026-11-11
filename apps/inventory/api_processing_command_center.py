"""GET /api/inventory/processing-command-center/?date=YYYY-MM-DD&mine=1 (Dash Update #87). Read only, one call."""
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.accounts.permissions import IsTeamMember
from apps.inventory.services import processing_command_center


@api_view(['GET'])
@permission_classes([IsTeamMember])
def processing_command_center_view(request):
    """Leads and the owner get every processor; anyone else on the team (or ``mine=1``) gets their own line and
    the room."""
    raw = (request.query_params.get('date') or '').strip()
    day = parse_date(raw) if raw else None
    if raw and day is None:
        return Response({'detail': 'Give the date as YYYY-MM-DD.'}, status=400)
    mine = request.query_params.get('mine') in ('1', 'true')
    return Response(processing_command_center.build(request.user, day, mine=mine))
