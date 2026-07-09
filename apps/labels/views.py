"""Custom Label Studio API (Manager+).

  * ``CustomLabelViewSet`` — CRUD (delete = soft archive via ``is_active=False``).
  * ``background`` / ``pdf`` upload actions — multipart to S3 (webstore/blog pattern).
  * ``media`` — staff-only proxy: 302 → presigned S3 URL (or streams in local dev),
    used by the print dialog to fetch PDF/background bytes for the local print server.
  * ``ai/propose-structure`` / ``ai/generate-background`` — AI Create for me (approval gate).
"""
from __future__ import annotations

import os
import uuid

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from apps.accounts.permissions import IsManagerOrAdmin
from apps.core.models import S3File

from .ai_create import LabelAIError, generate_background_image, propose_structure
from .models import CustomLabel
from .serializers import CustomLabelSerializer
from .services import safe_purge_orphan_label_media

_STAFF_PERMS = [IsAuthenticated, IsManagerOrAdmin]

_IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}
_IMAGE_SIGNATURES = {
    'image/png': lambda header: header.startswith(b'\x89PNG\r\n\x1a\n'),
    'image/jpeg': lambda header: header.startswith(b'\xff\xd8\xff'),
    'image/gif': lambda header: header.startswith((b'GIF87a', b'GIF89a')),
    'image/webp': lambda header: (
        len(header) >= 12 and header.startswith(b'RIFF') and header[8:12] == b'WEBP'
    ),
}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024   # 5 MB background image cap
_MAX_PDF_BYTES = 20 * 1024 * 1024    # 20 MB PDF cap


def _upload_has_signature(file, predicate) -> bool:
    """Read an upload header without changing its stream position."""
    try:
        position = file.tell()
        file.seek(0)
        header = file.read(12)
    except (AttributeError, OSError, ValueError):
        return False
    finally:
        try:
            file.seek(position)
        except (AttributeError, OSError, UnboundLocalError, ValueError):
            pass
    return bool(predicate(header))


def _save_upload(request, *, prefix: str, label_id: int) -> S3File:
    file = request.FILES['file']
    ext = os.path.splitext(file.name or '')[1].lower() or ''
    key = f'label-studio/{label_id}/{prefix}-{uuid.uuid4().hex}{ext}'
    saved_path = default_storage.save(key, file)
    return S3File.objects.create(
        key=saved_path,
        filename=file.name or saved_path.split('/')[-1],
        size=getattr(file, 'size', 0) or 0,
        content_type=getattr(file, 'content_type', '') or '',
        uploaded_by=request.user,
    )


def _template_size(label: CustomLabel) -> tuple[float, float]:
    w = float(label.width_in or 0)
    h = float(label.height_in or 0)
    return w, h


class CustomLabelViewSet(viewsets.ModelViewSet):
    queryset = CustomLabel.objects.select_related('background', 'pdf_file').all()
    serializer_class = CustomLabelSerializer
    permission_classes = _STAFF_PERMS
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'slug']
    ordering_fields = ['name', 'kind', 'created_at', 'updated_at']
    ordering = ['name']
    throttle_scope_by_action = {
        'propose_structure_ai': 'labels_propose_structure',
        'generate_background_ai': 'labels_generate_background',
    }

    def get_queryset(self):
        qs = super().get_queryset()
        include_archived = (
            getattr(self, 'action', None) == 'list'
            and self.request.query_params.get('include_archived') in ('1', 'true')
        )
        if not include_archived:
            qs = qs.filter(is_active=True)
        return qs

    def get_throttles(self):
        scope = self.throttle_scope_by_action.get(getattr(self, 'action', None))
        if not scope:
            return super().get_throttles()
        self.throttle_scope = scope
        return [ScopedRateThrottle()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_destroy(self, instance):
        # Soft archive — printable history stays addressable.
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        safe_purge_orphan_label_media()

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore an archived label without exposing it through normal detail lookup."""
        label = get_object_or_404(
            super().get_queryset().filter(is_active=False),
            pk=pk,
        )
        self.check_object_permissions(request, label)
        label.is_active = True
        label.save(update_fields=['is_active', 'updated_at'])
        return Response(self.get_serializer(label).data)

    @action(detail=True, methods=['post'])
    def background(self, request, pk=None):
        label = self.get_object()
        if label.kind != CustomLabel.KIND_TEMPLATE:
            return Response({'detail': 'Backgrounds apply to template labels only.'}, status=400)
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'No file provided.'}, status=400)
        content_type = (getattr(file, 'content_type', '') or '').lower()
        if content_type not in _IMAGE_TYPES:
            return Response({'detail': 'Background must be a PNG, JPEG, GIF, or WebP image.'}, status=400)
        if not _upload_has_signature(file, _IMAGE_SIGNATURES[content_type]):
            return Response({'detail': 'Background file signature does not match its image type.'}, status=400)
        if (getattr(file, 'size', 0) or 0) > _MAX_IMAGE_BYTES:
            return Response({'detail': 'Background image too large (max 5 MB).'}, status=400)
        label.background = _save_upload(request, prefix='bg', label_id=label.pk)
        label.save(update_fields=['background', 'updated_at'])
        safe_purge_orphan_label_media()
        return Response(self.get_serializer(label).data)

    @action(detail=True, methods=['delete'], url_path='background/clear')
    def clear_background(self, request, pk=None):
        label = self.get_object()
        label.background = None
        label.save(update_fields=['background', 'updated_at'])
        safe_purge_orphan_label_media()
        return Response(self.get_serializer(label).data)

    @action(detail=True, methods=['post'])
    def pdf(self, request, pk=None):
        label = self.get_object()
        if label.kind != CustomLabel.KIND_PDF:
            return Response({'detail': 'PDF uploads apply to PDF labels only.'}, status=400)
        file = request.FILES.get('file')
        if not file:
            return Response({'detail': 'No file provided.'}, status=400)
        content_type = (getattr(file, 'content_type', '') or '').lower()
        name = (file.name or '').lower()
        if content_type != 'application/pdf' and not name.endswith('.pdf'):
            return Response({'detail': 'File must be a PDF.'}, status=400)
        if not _upload_has_signature(file, lambda header: header.startswith(b'%PDF-')):
            return Response({'detail': 'File signature is not a PDF.'}, status=400)
        if (getattr(file, 'size', 0) or 0) > _MAX_PDF_BYTES:
            return Response({'detail': 'PDF too large (max 20 MB).'}, status=400)
        label.pdf_file = _save_upload(request, prefix='pdf', label_id=label.pk)
        label.save(update_fields=['pdf_file', 'updated_at'])
        safe_purge_orphan_label_media()
        return Response(self.get_serializer(label).data)

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Clone a label (same media FKs; new name/slug)."""
        src = self.get_object()
        copy = CustomLabel(
            name=f'Copy of {src.name}'[:120],
            kind=src.kind,
            width_in=src.width_in,
            height_in=src.height_in,
            definition=src.definition if src.kind == CustomLabel.KIND_TEMPLATE else {},
            background=src.background,
            pdf_file=src.pdf_file,
            is_active=True,
            created_by=request.user,
        )
        copy.save()
        return Response(self.get_serializer(copy).data, status=201)

    @action(detail=True, methods=['post'], url_path='ai/propose-structure')
    def propose_structure_ai(self, request, pk=None):
        label = self.get_object()
        if label.kind != CustomLabel.KIND_TEMPLATE:
            return Response({'detail': 'AI structure applies to template labels only.'}, status=400)
        brief = request.data.get('brief', '')
        width_in, height_in = _template_size(label)
        if width_in <= 0 or height_in <= 0:
            return Response({'detail': 'Template must have positive width_in and height_in.'}, status=400)
        try:
            definition = propose_structure(brief=brief, width_in=width_in, height_in=height_in)
        except LabelAIError as exc:
            return Response({'detail': str(exc)}, status=exc.status)
        return Response({'definition': definition})

    @action(detail=True, methods=['post'], url_path='ai/generate-background')
    def generate_background_ai(self, request, pk=None):
        label = self.get_object()
        if label.kind != CustomLabel.KIND_TEMPLATE:
            return Response({'detail': 'AI background applies to template labels only.'}, status=400)
        brief = request.data.get('brief', '')
        width_in, height_in = _template_size(label)
        if width_in <= 0 or height_in <= 0:
            return Response({'detail': 'Template must have positive width_in and height_in.'}, status=400)
        try:
            result = generate_background_image(
                brief=brief, width_in=width_in, height_in=height_in,
            )
        except LabelAIError as exc:
            return Response({'detail': str(exc)}, status=exc.status)
        return Response({
            'image_b64': result['image_b64'],
            'content_type': result['content_type'],
            'prompt_used': result.get('prompt_used', ''),
            'aspect_ratio': result.get('aspect_ratio', ''),
        })

    @action(detail=True, methods=['get'], url_path=r'media/(?P<attr>background|pdf_file)')
    def media(self, request, pk=None, attr=None):
        """Staff proxy for label media — always stream bytes (never 302 to S3).

        The designer/print dialog fetch media with axios ``arraybuffer`` + JWT.
        A 302 to a presigned S3 URL fails in the browser (cross-origin XHR body
        blocked without bucket CORS). Streaming keeps the response same-origin.
        """
        label = self.get_object()
        s3_file = getattr(label, attr, None)
        if not s3_file:
            raise Http404('No file attached.')
        try:
            handle = default_storage.open(s3_file.key, 'rb')
        except (OSError, FileNotFoundError):
            raise Http404('File missing from storage.')
        response = FileResponse(
            handle,
            content_type=s3_file.content_type or 'application/octet-stream',
        )
        response['Cache-Control'] = 'private, max-age=300'
        return response
