from __future__ import annotations

import base64
import re

from django.core.files.base import ContentFile
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsStaff, IsSuperAdmin
from apps.core.files import save_upload, stream_s3, validate_pdf
from .flatten import bytes_as_upload, flatten_document, pdf_page_count
from .models import (
    Document,
    DocumentAssignment,
    DocumentField,
    DocumentFieldValue,
    DocumentRecipient,
)
from .serializers import (
    DocumentAssignmentSerializer,
    DocumentFieldSerializer,
    DocumentRecipientSerializer,
    DocumentSerializer,
)
from .services import fan_out_recipients

_DATA_URL = re.compile(r'^data:(image/[\w+.-]+);base64,(.+)$', re.DOTALL)


def _client_ip(request) -> str:
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    return forwarded or request.META.get('REMOTE_ADDR') or ''


class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer

    def get_permissions(self):
        if self.action in ('list', 'retrieve', 'file'):
            return [IsAuthenticated(), IsStaff()]
        return [IsAuthenticated(), IsSuperAdmin()]

    def get_queryset(self):
        qs = Document.objects.annotate(
            assigned_count=Count('assignments__recipients', distinct=True),
            completed_count=Count(
                'assignments__recipients',
                filter=Q(assignments__recipients__status=DocumentRecipient.STATUS_COMPLETED),
                distinct=True,
            ),
        )
        if self.request.user.is_superuser:
            return qs
        assigned = DocumentRecipient.objects.filter(
            user=self.request.user,
        ).values_list('assignment__document_id', flat=True)
        return qs.filter(pk__in=assigned, is_active=True)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])

    @action(detail=True, methods=['post'])
    def upload(self, request, pk=None):
        document = self.get_object()
        uploaded = request.FILES.get('file')
        error = validate_pdf(uploaded)
        if error:
            return Response({'detail': error}, status=400)
        uploaded.seek(0)
        raw = uploaded.read()
        uploaded.seek(0)
        try:
            pages = pdf_page_count(raw)
        except Exception:
            return Response({'detail': 'Could not read that PDF.'}, status=400)
        s3 = save_upload(uploaded, user=request.user, key_prefix=f'documents/{document.pk}')
        document.file = s3
        document.page_count = pages
        document.save(update_fields=['file', 'page_count', 'updated_at'])
        return Response(DocumentSerializer(document).data)

    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        document = self.get_object()
        if not document.file_id:
            return Response({'detail': 'No PDF uploaded.'}, status=404)
        return stream_s3(document.file)

    @action(detail=True, methods=['put'])
    def fields(self, request, pk=None):
        document = self.get_object()
        incoming = request.data if isinstance(request.data, list) else request.data.get('fields')
        if not isinstance(incoming, list):
            return Response({'detail': 'Send a list of fields.'}, status=400)
        document.fields.all().delete()
        created = []
        for index, row in enumerate(incoming):
            serializer = DocumentFieldSerializer(data=row)
            serializer.is_valid(raise_exception=True)
            data = dict(serializer.validated_data)
            data['order'] = data.get('order', index)
            created.append(DocumentField(document=document, **data))
        DocumentField.objects.bulk_create(created)
        document.refresh_from_db()
        return Response(DocumentSerializer(self.get_queryset().get(pk=document.pk)).data)

    @action(detail=True, methods=['post'])
    def assign(self, request, pk=None):
        document = self.get_object()
        serializer = DocumentAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assignment = serializer.save(document=document, assigned_by=request.user)
        created = fan_out_recipients(assignment)
        if created == 0:
            assignment.delete()
            return Response({'detail': 'No matching staff to assign.'}, status=400)
        return Response({
            **DocumentAssignmentSerializer(assignment).data,
            'recipients_created': created,
        }, status=201)


class DocumentRecipientViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DocumentRecipientSerializer
    permission_classes = [IsAuthenticated, IsStaff]
    pagination_class = None

    def get_queryset(self):
        qs = DocumentRecipient.objects.select_related(
            'assignment', 'assignment__document', 'user',
        ).prefetch_related('assignment__document__fields')
        if self.request.user.is_superuser and self.action != 'mine':
            return qs
        return qs.filter(user=self.request.user)

    @action(detail=False, methods=['get'])
    def mine(self, request):
        rows = list(self.get_queryset().filter(user=request.user).order_by('status', 'id'))
        return Response(DocumentRecipientSerializer(rows, many=True).data)

    @action(detail=True, methods=['post'])
    def view(self, request, pk=None):
        recipient = self.get_object()
        if recipient.user_id != request.user.pk:
            return Response({'detail': 'Not assigned to you.'}, status=403)
        now = timezone.now()
        updates = []
        if not recipient.opened_at:
            recipient.opened_at = now
            updates.append('opened_at')
        document = recipient.assignment.document
        if document.mode == Document.MODE_READ and recipient.status != DocumentRecipient.STATUS_COMPLETED:
            recipient.status = DocumentRecipient.STATUS_COMPLETED
            recipient.completed_at = now
            recipient.audit = {
                'ip': _client_ip(request),
                'user_agent': request.META.get('HTTP_USER_AGENT', ''),
                'signer': request.user.full_name,
                'completed_at': now.isoformat(),
            }
            updates.extend(['status', 'completed_at', 'audit'])
        elif recipient.status == DocumentRecipient.STATUS_PENDING:
            recipient.status = DocumentRecipient.STATUS_VIEWED
            updates.append('status')
        if updates:
            recipient.save(update_fields=[*updates])
        return Response(DocumentRecipientSerializer(recipient).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        recipient = self.get_object()
        if recipient.user_id != request.user.pk:
            return Response({'detail': 'Not assigned to you.'}, status=403)
        if recipient.status == DocumentRecipient.STATUS_COMPLETED:
            return Response(DocumentRecipientSerializer(recipient).data)
        document = recipient.assignment.document
        now = timezone.now()
        incoming = request.data.get('values') or []
        if document.mode == Document.MODE_SIGN:
            stored = _store_values(recipient, incoming, user=request.user)
            missing = [
                field.pk
                for field in document.fields.filter(required=True)
                if field.pk not in stored
            ]
            if missing:
                return Response(
                    {'detail': f'Fill every required field. {len(missing)} left.'},
                    status=400,
                )
            audit = {
                'ip': _client_ip(request),
                'user_agent': request.META.get('HTTP_USER_AGENT', ''),
                'signer': request.user.full_name,
                'completed_at': now.isoformat(),
                'fields': list(stored),
            }
            raw = flatten_document(
                document,
                recipient.field_values.select_related('field', 'value_file'),
                audit,
            )
            uploaded = bytes_as_upload(raw, f'{document.title}-signed.pdf', 'application/pdf')
            recipient.signed_file = save_upload(
                uploaded,
                user=request.user,
                key_prefix=f'documents/{document.pk}/signed/{recipient.pk}',
            )
            recipient.audit = audit
        else:
            recipient.audit = {
                'ip': _client_ip(request),
                'user_agent': request.META.get('HTTP_USER_AGENT', ''),
                'signer': request.user.full_name,
                'completed_at': now.isoformat(),
            }
        recipient.status = DocumentRecipient.STATUS_COMPLETED
        recipient.completed_at = now
        if not recipient.opened_at:
            recipient.opened_at = now
        recipient.save()
        return Response(DocumentRecipientSerializer(recipient).data)

    @action(detail=True, methods=['get'])
    def signed(self, request, pk=None):
        recipient = self.get_object()
        if not request.user.is_superuser and recipient.user_id != request.user.pk:
            return Response({'detail': 'Not assigned to you.'}, status=403)
        if not recipient.signed_file_id:
            return Response({'detail': 'No signed PDF yet.'}, status=404)
        return stream_s3(recipient.signed_file, as_attachment=True)


def _store_values(recipient: DocumentRecipient, incoming, *, user) -> set[int]:
    stored: set[int] = set()
    if not isinstance(incoming, list):
        return stored
    fields = {field.pk: field for field in recipient.assignment.document.fields.all()}
    for row in incoming:
        if not isinstance(row, dict):
            continue
        try:
            field_id = int(row.get('field'))
        except (TypeError, ValueError):
            continue
        field = fields.get(field_id)
        if not field:
            continue
        text = str(row.get('value_text') or '').strip()
        file_obj = None
        data_url = row.get('value_file')
        if isinstance(data_url, str) and data_url.startswith('data:'):
            match = _DATA_URL.match(data_url)
            if match:
                content_type, raw_b64 = match.group(1), match.group(2)
                try:
                    raw = base64.b64decode(raw_b64)
                except (ValueError, TypeError):
                    raw = b''
                if raw:
                    uploaded = ContentFile(raw, name='signature.png')
                    uploaded.content_type = content_type
                    file_obj = save_upload(
                        uploaded,
                        user=user,
                        key_prefix=f'documents/fields/{recipient.pk}',
                    )
        if field.kind in (DocumentField.KIND_SIGNATURE, DocumentField.KIND_INITIALS):
            if not file_obj:
                continue
            text = ''
        elif field.kind == DocumentField.KIND_CHECKBOX:
            if text.lower() not in ('1', 'true', 'yes', 'x'):
                if field.required:
                    continue
        elif not text:
            continue
        DocumentFieldValue.objects.update_or_create(
            recipient=recipient,
            field=field,
            defaults={'value_text': text, 'value_file': file_obj},
        )
        stored.add(field.pk)
    return stored
