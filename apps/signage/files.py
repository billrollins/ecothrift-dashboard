"""Sign version files (#122): the PDF to print and a PNG preview, both in the shared file store (core.S3File)."""
from __future__ import annotations

import os
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from apps.core.files import save_upload, upload_has_signature
from apps.core.models import S3File

_MAX_PNG_BYTES = 20 * 1024 * 1024
PREVIEW_DPI = 100


def validate_png(uploaded) -> str | None:
    if not uploaded:
        return 'No preview image provided.'
    if not upload_has_signature(uploaded, lambda header: header.startswith(b'\x89PNG')):
        return 'The preview must be a PNG.'
    if (getattr(uploaded, 'size', 0) or 0) > _MAX_PNG_BYTES:
        return 'Preview too large (max 20 MB).'
    return None


def render_preview(pdf_bytes: bytes, dpi: int = PREVIEW_DPI) -> bytes | None:
    """First page of a PDF as a PNG, or None when the PDF cannot be drawn."""
    try:
        import pymupdf
        doc = pymupdf.open(stream=pdf_bytes, filetype='pdf')
        return doc[0].get_pixmap(dpi=dpi, alpha=False).tobytes('png')
    except Exception:  # noqa: BLE001 - a bad PDF just has no preview
        return None


def save_bytes(data: bytes, *, filename: str, content_type: str, user, key_prefix: str = 'signage') -> S3File:
    ext = os.path.splitext(filename)[1].lower()
    saved = default_storage.save(f'{key_prefix}/{uuid.uuid4().hex}{ext}', ContentFile(data))
    return S3File.objects.create(
        key=saved, filename=filename, size=len(data), content_type=content_type, uploaded_by=user,
    )


def save_version_files(pdf, png, *, user) -> tuple[S3File, S3File | None]:
    """Save an uploaded PDF and PNG; with no PNG, draw one from the PDF's first page."""
    pdf_file = save_upload(pdf, user=user, key_prefix='signage')
    if png:
        return pdf_file, save_upload(png, user=user, key_prefix='signage')
    pdf.seek(0)
    drawn = render_preview(pdf.read())
    if not drawn:
        return pdf_file, None
    stem = os.path.splitext(pdf.name or 'sign')[0]
    return pdf_file, save_bytes(drawn, filename=f'{stem}.png', content_type='image/png', user=user)
