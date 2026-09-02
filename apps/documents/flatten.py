"""Burn field values into a PDF and append an audit-trail page."""
from __future__ import annotations

from typing import Iterable

import fitz
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .models import Document, DocumentField, DocumentFieldValue


def pdf_page_count(raw: bytes) -> int:
    doc = fitz.open(stream=raw, filetype='pdf')
    try:
        return doc.page_count
    finally:
        doc.close()


def _pct_rect(page: fitz.Page, field: DocumentField) -> fitz.Rect:
    box = page.rect
    x0 = box.x0 + (field.x_pct / 100.0) * box.width
    y0 = box.y0 + (field.y_pct / 100.0) * box.height
    x1 = x0 + (field.w_pct / 100.0) * box.width
    y1 = y0 + (field.h_pct / 100.0) * box.height
    return fitz.Rect(x0, y0, x1, y1)


def _image_bytes(value: DocumentFieldValue) -> bytes | None:
    if not value.value_file_id:
        return None
    try:
        handle = default_storage.open(value.value_file.key, 'rb')
    except (OSError, FileNotFoundError):
        return None
    try:
        return handle.read()
    finally:
        handle.close()


def flatten_document(
    document: Document,
    values: Iterable[DocumentFieldValue],
    audit: dict,
) -> bytes:
    if not document.file_id:
        raise ValueError('Document has no PDF.')
    handle = default_storage.open(document.file.key, 'rb')
    try:
        raw = handle.read()
    finally:
        handle.close()
    doc = fitz.open(stream=raw, filetype='pdf')
    by_field = {row.field_id: row for row in values}
    try:
        for field in document.fields.all():
            value = by_field.get(field.pk)
            if value is None or field.page >= doc.page_count:
                continue
            page = doc[field.page]
            rect = _pct_rect(page, field)
            if field.kind in (DocumentField.KIND_SIGNATURE, DocumentField.KIND_INITIALS):
                image = _image_bytes(value)
                if image:
                    page.insert_image(rect, stream=image)
                continue
            if field.kind == DocumentField.KIND_CHECKBOX:
                marked = (value.value_text or '').strip().lower() in ('1', 'true', 'yes', 'x')
                if marked:
                    page.insert_textbox(rect, 'X', fontsize=max(8, min(rect.height * 0.8, 16)), align=1)
                continue
            text = (value.value_text or '').strip()
            if text:
                page.insert_textbox(rect, text, fontsize=max(8, min(rect.height * 0.7, 12)))
        width = float(doc[0].rect.width)
        height = float(doc[0].rect.height)
        trail = doc.new_page(width=width, height=height)
        lines = [
            'Signing audit trail',
            f"Document: {document.title}",
            f"Signer: {audit.get('signer', '')}",
            f"Completed: {audit.get('completed_at', '')}",
            f"IP: {audit.get('ip', '')}",
            f"User agent: {audit.get('user_agent', '')}",
        ]
        trail.insert_textbox(
            fitz.Rect(72, 72, width - 72, height - 72),
            '\n'.join(lines),
            fontsize=11,
        )
        return doc.tobytes()
    finally:
        doc.close()


def bytes_as_upload(raw: bytes, name: str, content_type: str):
    uploaded = ContentFile(raw, name=name)
    uploaded.content_type = content_type
    return uploaded
