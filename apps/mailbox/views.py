from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsAdmin, IsManagerOrAdmin

from .auth import GraphConfigurationError, graph_enabled
from .graph import GraphMailClient, GraphMailError
from .models import EmailTemplate, MailMessage
from .rendering import append_signature
from .serializers import EmailTemplateSerializer, MailMessageSerializer, MailReplySerializer
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


class GeneralMailMessageViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [IsAuthenticated, IsAdmin]
    serializer_class = MailMessageSerializer
    filterset_fields = ['classification', 'is_read']
    search_fields = ['from_email', 'subject', 'text_body']
    ordering_fields = ['received_at', 'from_email', 'subject']

    def get_queryset(self):
        return MailMessage.objects.filter(classification='general').order_by('-received_at', '-id')

    def retrieve(self, request, *args, **kwargs):
        message = self.get_object()
        if not message.is_read:
            message.is_read = True
            message.save(update_fields=['is_read', 'updated_at'])
            if graph_enabled():
                try:
                    GraphMailClient().mark_read(message.graph_message_id)
                except (GraphConfigurationError, GraphMailError):
                    pass
        return Response(self.get_serializer(message).data)

    @action(detail=True, methods=['post'])
    def reply(self, request, pk=None):
        message = self.get_object()
        serializer = MailReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not graph_enabled():
            return Response(
                {'detail': 'Microsoft Graph mail is disabled.', 'code': 'MS_GRAPH_DISABLED'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        staff_name = getattr(request.user, 'full_name', '') or request.user.email
        html_body = append_signature(
            serializer.validated_data['html_body'],
            staff_name=staff_name,
        )
        try:
            client = GraphMailClient()
            client.reply(message.graph_message_id, html_body=html_body)
            client.mark_read(message.graph_message_id)
        except (GraphConfigurationError, GraphMailError) as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)
        message.is_read = True
        message.updated_at = timezone.now()
        message.save(update_fields=['is_read', 'updated_at'])
        return Response({'sent': True, 'html_body': html_body})
