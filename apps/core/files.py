"""Private file save and stream helpers (JWT-gated reads, never a 302 to S3)."""
from __future__ import annotations

import os
import uuid

from django.core.files.storage import default_storage
from django.http import FileResponse, Http404

from apps.core.models import S3File

_MAX_PDF_BYTES = 20 * 1024 * 1024


def upload_has_signature(file, predicate) -> bool:
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


def validate_pdf(uploaded) -> str | None:
    if not uploaded:
        return 'No file provided.'
    content_type = (getattr(uploaded, 'content_type', '') or '').lower()
    name = (uploaded.name or '').lower()
    if content_type != 'application/pdf' and not name.endswith('.pdf'):
        return 'File must be a PDF. Export from Word as PDF and try again.'
    if not upload_has_signature(uploaded, lambda header: header.startswith(b'%PDF-')):
        return 'File signature is not a PDF.'
    if (getattr(uploaded, 'size', 0) or 0) > _MAX_PDF_BYTES:
        return 'PDF too large (max 20 MB).'
    return None


def save_upload(uploaded, *, user, key_prefix: str) -> S3File:
    ext = os.path.splitext(uploaded.name or '')[1].lower() or ''
    key = f'{key_prefix}/{uuid.uuid4().hex}{ext}'
    saved = default_storage.save(key, uploaded)
    return S3File.objects.create(
        key=saved,
        filename=uploaded.name or saved.split('/')[-1],
        size=getattr(uploaded, 'size', 0) or 0,
        content_type=getattr(uploaded, 'content_type', '') or '',
        uploaded_by=user,
    )


def stream_s3(s3: S3File, *, as_attachment: bool = False):
    try:
        handle = default_storage.open(s3.key, 'rb')
    except (OSError, FileNotFoundError):
        raise Http404('File missing from storage.')
    response = FileResponse(
        handle,
        content_type=s3.content_type or 'application/octet-stream',
        as_attachment=as_attachment,
        filename=s3.filename,
    )
    response['Cache-Control'] = 'private, no-store, no-cache, must-revalidate'
    response['Pragma'] = 'no-cache'
    disposition = 'attachment' if as_attachment else 'inline'
    response['Content-Disposition'] = f'{disposition}; filename="{s3.filename}"'
    return response
