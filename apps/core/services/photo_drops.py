"""The staff photo drawer (Dash Updates #82): save a drop, mark it used, delete it, clear old ones.

Every drop is saved as a JPEG no bigger than 2048 px on its long side, with a 480 px thumbnail, both as
``core.S3File`` rows under ``photo-drops/<user id>/``. A drop older than ``KEEP_DAYS`` is removed by
``purge_old`` (the ``purge_photo_drops`` command, and about once an hour when someone opens a drawer).
"""
from __future__ import annotations

import io
import logging
import uuid
from datetime import timedelta

from django.core.cache import cache
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageOps

from apps.core.models import PhotoDrop, S3File

logger = logging.getLogger(__name__)

KEEP_DAYS = 30
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_EDGE = 2048
THUMB_EDGE = 480
JPEG_QUALITY = 85
THUMB_QUALITY = 72
PURGE_CACHE_KEY = 'photo_drops:purged'
PURGE_EVERY_SECONDS = 60 * 60


class PhotoDropError(ValueError):
    """The upload is not a photo we can read."""


def _fit(img: Image.Image, max_edge: int) -> Image.Image:
    longest = max(img.size)
    if longest <= max_edge:
        return img
    scale = max_edge / float(longest)
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    return img.resize(size, Image.Resampling.LANCZOS)


def _jpeg(img: Image.Image, quality: int) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality, optimize=True)
    return buf.getvalue()


def _read_photo(raw: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        raise PhotoDropError('That file is not a photo.') from exc
    # A phone stores "which way is up" beside the pixels; turn the pixels so every screen shows it upright.
    img = ImageOps.exif_transpose(img)
    return img.convert('RGB') if img.mode != 'RGB' else img


def _store(key: str, data: bytes, *, user, filename: str) -> S3File:
    saved = default_storage.save(key, ContentFile(data, name=key.rsplit('/', 1)[-1]))
    return S3File.objects.create(
        key=saved, filename=filename, size=len(data), content_type='image/jpeg', uploaded_by=user,
    )


def save_drop(raw: bytes, *, user) -> PhotoDrop:
    """Save one photo into ``user``'s drawer."""
    full = _fit(_read_photo(raw), MAX_EDGE)
    stem = uuid.uuid4().hex
    prefix = f'photo-drops/{user.pk}'
    name = f'photo-{timezone.localtime().strftime("%Y%m%d-%H%M%S")}'
    saved: list[S3File] = []
    try:
        with transaction.atomic():
            file = _store(f'{prefix}/{stem}.jpg', _jpeg(full, JPEG_QUALITY), user=user, filename=f'{name}.jpg')
            saved.append(file)
            thumb = _store(
                f'{prefix}/{stem}_thumb.jpg', _jpeg(_fit(full, THUMB_EDGE), THUMB_QUALITY),
                user=user, filename=f'{name}_thumb.jpg',
            )
            saved.append(thumb)
            return PhotoDrop.objects.create(
                owner=user, file=file, thumbnail=thumb, width=full.width, height=full.height,
            )
    except Exception:
        for row in saved:
            _delete_stored(row.key)
        raise


def replace_drop(old: PhotoDrop, raw: bytes, *, user) -> PhotoDrop:
    """Save a turned or cropped copy in place of ``old``: it keeps the time it was taken and its Used mark."""
    drop = save_drop(raw, user=user)
    PhotoDrop.objects.filter(pk=drop.pk).update(
        created_at=old.created_at, used_at=old.used_at, used_where=old.used_where,
    )
    delete_drop(old)
    drop.refresh_from_db()
    return drop


def _delete_stored(key: str) -> None:
    try:
        default_storage.delete(key)
    except Exception:
        logger.warning('photo_drops: could not delete %s from storage', key, exc_info=True)


def delete_drop(drop: PhotoDrop) -> None:
    """Remove the drop, its two file rows and the stored files."""
    files = [row for row in (drop.file, drop.thumbnail) if row is not None]
    with transaction.atomic():
        drop.delete()
        for row in files:
            row.delete()
    for row in files:
        _delete_stored(row.key)


def mark_used(drop: PhotoDrop, where: str = '') -> PhotoDrop:
    drop.used_at = timezone.now()
    drop.used_where = (where or '').strip()[:80]
    drop.save(update_fields=['used_at', 'used_where'])
    return drop


def purge_old(now=None) -> int:
    """Remove every drop older than ``KEEP_DAYS``, used or not. Returns how many went."""
    cutoff = (now or timezone.now()) - timedelta(days=KEEP_DAYS)
    count = 0
    for drop in PhotoDrop.objects.filter(created_at__lt=cutoff).select_related('file', 'thumbnail'):
        try:
            delete_drop(drop)
            count += 1
        except Exception:
            logger.warning('photo_drops: could not remove drop %s', drop.pk, exc_info=True)
    return count


def purge_old_sometimes() -> int:
    """The clean-up without a scheduled job: at most once an hour, when someone opens a drawer."""
    try:
        if not cache.add(PURGE_CACHE_KEY, 1, PURGE_EVERY_SECONDS):
            return 0
        return purge_old()
    except Exception:
        logger.warning('photo_drops: the hourly clean-up failed', exc_info=True)
        return 0
