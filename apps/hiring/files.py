"""Resume uploads: PDF, Word or a photo, checked by their first bytes, kept private under hiring/."""
from __future__ import annotations

from apps.core.files import save_upload, upload_has_signature

MAX_RESUME_BYTES = 10 * 1024 * 1024
KEY_PREFIX = 'hiring/resumes'


def _kind(header: bytes, name: str) -> str | None:
    if header.startswith(b'%PDF-'):
        return 'application/pdf'
    if header.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if header.startswith(b'\x89PNG'):
        return 'image/png'
    if header[:4] == b'RIFF' and header[8:12] == b'WEBP':
        return 'image/webp'
    if header[4:8] == b'ftyp' and header[8:12] in (b'heic', b'heix', b'mif1', b'msf1', b'hevc'):
        return 'image/heic'
    if header.startswith(b'PK\x03\x04') and name.endswith('.docx'):
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if header.startswith(b'\xd0\xcf\x11\xe0') and name.endswith('.doc'):
        return 'application/msword'
    return None


def resume_kind(uploaded) -> str | None:
    """The real content type of an upload, or None when it is not a resume we accept."""
    found: list[str | None] = [None]
    name = (getattr(uploaded, 'name', '') or '').lower()

    def check(header: bytes) -> bool:
        found[0] = _kind(header, name)
        return found[0] is not None

    upload_has_signature(uploaded, check)
    return found[0]


def validate_resume(uploaded) -> str | None:
    if not uploaded:
        return 'No file provided.'
    if (getattr(uploaded, 'size', 0) or 0) > MAX_RESUME_BYTES:
        return 'That file is too big (10 MB max). A photo or a PDF works.'
    if resume_kind(uploaded) is None:
        return 'Upload a PDF, a Word file (.doc or .docx) or a photo (JPG, PNG, HEIC).'
    return None


def save_resume(uploaded, *, user=None):
    kind = resume_kind(uploaded)
    s3 = save_upload(uploaded, user=user, key_prefix=KEY_PREFIX)
    if kind and s3.content_type != kind:
        s3.content_type = kind
        s3.save(update_fields=['content_type'])
    return s3
