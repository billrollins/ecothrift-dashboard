"""Library uploads: each photo is kept at 2048 px with a 480 px thumbnail (the receiving photo pattern)."""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone as dt_timezone

from django.core.files.base import ContentFile
from django.utils import timezone
from PIL import Image

from apps.inventory.services.receiving_photos import ReceivingPhotoError, prepare_high_res_and_thumb
from apps.marketing.models import SocialPhoto

MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class PhotoError(ValueError):
    def __init__(self, detail: str, code: str):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def _taken_at(raw) -> datetime | None:
    """The phone sends the file's lastModified (ms since 1970)."""
    try:
        ms = int(raw)
    except (TypeError, ValueError):
        return None
    if ms <= 0:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=dt_timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def _prepare(upload) -> tuple[bytes, bytes, int, int]:
    raw = upload.read()
    if not raw:
        raise PhotoError('That file is empty.', 'EMPTY')
    if len(raw) > MAX_UPLOAD_BYTES:
        raise PhotoError('That photo is over 25 MB.', 'TOO_BIG')
    try:
        high, thumb = prepare_high_res_and_thumb(raw)
    except ReceivingPhotoError as exc:
        raise PhotoError('That file is not a photo we can read.', exc.code) from exc
    width, height = Image.open(io.BytesIO(high)).size
    return high, thumb, width, height


def _store(photo: SocialPhoto, high: bytes, thumb: bytes) -> None:
    stem = uuid.uuid4().hex
    photo.image.save(f'{stem}.jpg', ContentFile(high), save=False)
    photo.thumbnail.save(f'{stem}_thumb.jpg', ContentFile(thumb), save=False)


def save_photo(upload, *, user, category: str = '', item=None, note: str = '', taken_ms=None) -> SocialPhoto:
    high, thumb, width, height = _prepare(upload)
    photo = SocialPhoto(
        width=width, height=height, category=(category or '')[:100], item=item, note=(note or '')[:255],
        uploaded_by=user, taken_at=_taken_at(taken_ms),
    )
    _store(photo, high, thumb)
    photo.save()
    return photo


def replace_image(photo: SocialPhoto, upload) -> SocialPhoto:
    """The photo editor's result (crop, rotate, brightness) takes the photo's place; posts using it get it too.
    The old files are left in storage (an edit is never the only copy of a real photo)."""
    high, thumb, width, height = _prepare(upload)
    _store(photo, high, thumb)
    photo.width, photo.height = width, height
    photo.edited_at = timezone.now()
    photo.save(update_fields=['image', 'thumbnail', 'width', 'height', 'edited_at'])
    return photo
