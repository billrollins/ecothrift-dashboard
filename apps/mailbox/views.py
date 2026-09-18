from rest_framework import mixins, status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsManagerOrAdmin

from .auth import GraphConfigurationError, graph_enabled
from .graph import GraphMailError
from .models import EmailTemplate
from .serializers import EmailTemplateSerializer
from .services import sync_mailbox


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsManagerOrAdmin])
def sync_now(request):
    if not graph_enabled():
        return Response(
            {'detail': 'Microsoft Graph mail is disabled.', 'code': 'MS_GRAPH_DISABLED'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    try:
        return Response(sync_mailbox())
    except (GraphConfigurationError, GraphMailError) as exc:
        return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)


class EmailTemplateViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    permission_classes = [IsAuthenticated, IsManagerOrAdmin]
    serializer_class = EmailTemplateSerializer
    pagination_class = None

    def get_queryset(self):
        return EmailTemplate.objects.filter(active=True)
