"""Library uploads: each photo is kept at 2048 px with a 480 px thumbnail (the receiving photo pattern)."""
from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone as dt_timezone

from django.core.files.base import ContentFile
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


def save_photo(upload, *, user, category: str = '', item=None, note: str = '', taken_ms=None) -> SocialPhoto:
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
    stem = uuid.uuid4().hex
    photo = SocialPhoto(
        width=width, height=height, category=(category or '')[:100], item=item, note=(note or '')[:255],
        uploaded_by=user, taken_at=_taken_at(taken_ms),
    )
    photo.image.save(f'{stem}.jpg', ContentFile(high), save=False)
    photo.thumbnail.save(f'{stem}_thumb.jpg', ContentFile(thumb), save=False)
    photo.save()
    return photo
