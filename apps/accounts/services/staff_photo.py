"""A staff member's photo (Dash Update #139): one square JPEG, 480 px, cut from the middle of the picture.

The person sets it on Home > Profile (a phone offers the camera or the photo library); the owner, or someone with Full
on people, can set it in the staff window. It shows wherever the person's avatar does (``PersonAvatar photo``). The old
file stays in storage, as for key and supply photos.
"""
from __future__ import annotations

import io
import uuid

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.accounts.models import AccountEvent, User

EDGE = 480
QUALITY = 82
MAX_UPLOAD_BYTES = 25 * 1024 * 1024


class StaffPhotoError(ValueError):
    def __init__(self, detail: str, code: str = 'INVALID'):
        super().__init__(detail)
        self.detail = detail
        self.code = code

    def payload(self) -> dict:
        return {'detail': self.detail, 'code': self.code}


def square_jpeg(raw: bytes) -> bytes:
    """The middle square of the picture, turned the way the phone held it, at 480 x 480."""
    try:
        with Image.open(io.BytesIO(raw)) as img:
            img.load()
            img = ImageOps.exif_transpose(img)
            if img.mode != 'RGB':
                img = img.convert('RGB')
            square = ImageOps.fit(img, (EDGE, EDGE), method=Image.Resampling.LANCZOS)
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise StaffPhotoError('That file is not a photo we can read.', 'NOT_A_PHOTO') from exc
    out = io.BytesIO()
    square.save(out, format='JPEG', quality=QUALITY, optimize=True)
    return out.getvalue()


def save_photo(user: User, upload, *, actor) -> User:
    raw = upload.read() if upload is not None else b''
    if not raw:
        raise StaffPhotoError('Add a photo.', 'NO_PHOTO')
    if len(raw) > MAX_UPLOAD_BYTES:
        raise StaffPhotoError('That photo is over 25 MB.', 'TOO_BIG')
    data = square_jpeg(raw)
    user.photo.save(f'{uuid.uuid4().hex}.jpg', ContentFile(data), save=False)
    user.save(update_fields=['photo', 'updated_at'])
    AccountEvent.log(user, AccountEvent.KIND_PHOTO, actor=actor, detail='photo set')
    return user


def clear_photo(user: User, *, actor) -> User:
    if user.photo:
        user.photo = ''
        user.save(update_fields=['photo', 'updated_at'])
        AccountEvent.log(user, AccountEvent.KIND_PHOTO, actor=actor, detail='photo removed')
    return user


def photo_url(user) -> str | None:
    field = getattr(user, 'photo', None)
    if not field:
        return None
    try:
        return field.url
    except ValueError:  # pragma: no cover - a name with no storage
        return None
