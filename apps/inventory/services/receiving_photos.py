"""Receiving photo variants: 2048px high-res + 480px thumbnail JPEGs."""

from __future__ import annotations

import io
import logging
import uuid
from dataclasses import dataclass

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from PIL import Image, ImageOps

from apps.core.models import S3File
from apps.inventory.models import Receiving, ReceivingAttachment

logger = logging.getLogger(__name__)

HIGH_RES_MAX_EDGE = 2048
THUMB_MAX_EDGE = 480
HIGH_RES_QUALITY = 85
THUMB_QUALITY = 72
THUMB_MAX_BYTES = 100 * 1024


class ReceivingPhotoError(ValueError):
    """Invalid or unreadable receiving image upload."""

    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(detail)


@dataclass(frozen=True)
class SavedReceivingPhoto:
    attachment: ReceivingAttachment
    high_res: S3File
    thumbnail: S3File | None


def thumb_key_for_high_res(high_res_key: str) -> str:
    """Derive companion thumbnail key from a high-res storage key."""
    if high_res_key.lower().endswith('.jpg'):
        stem = high_res_key[:-4]
    elif high_res_key.lower().endswith('.jpeg'):
        stem = high_res_key[:-5]
    else:
        stem = high_res_key
    return f'{stem}_thumb.jpg'


def _open_image(raw: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        raise ReceivingPhotoError('invalid_image', 'Could not decode image file.') from exc
    img = ImageOps.exif_transpose(img)
    if img.mode not in ('RGB', 'L'):
        img = img.convert('RGB')
    elif img.mode == 'L':
        img = img.convert('RGB')
    return img


def _resize_max_edge(img: Image.Image, max_edge: int) -> Image.Image:
    w, h = img.size
    longest = max(w, h)
    if longest <= max_edge:
        return img
    scale = max_edge / float(longest)
    nw = max(1, int(round(w * scale)))
    nh = max(1, int(round(h * scale)))
    return img.resize((nw, nh), Image.Resampling.LANCZOS)


def encode_jpeg(img: Image.Image, *, quality: int, optimize: bool = True) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality, optimize=optimize)
    return buf.getvalue()


def encode_thumbnail(img: Image.Image) -> bytes:
    """Encode a 480px JPEG, stepping quality down until under THUMB_MAX_BYTES when possible."""
    thumb = _resize_max_edge(img, THUMB_MAX_EDGE)
    quality = THUMB_QUALITY
    data = encode_jpeg(thumb, quality=quality)
    while len(data) > THUMB_MAX_BYTES and quality > 40:
        quality -= 8
        data = encode_jpeg(thumb, quality=quality)
    return data


def prepare_high_res_and_thumb(raw: bytes) -> tuple[bytes, bytes]:
    img = _open_image(raw)
    high = _resize_max_edge(img, HIGH_RES_MAX_EDGE)
    high_bytes = encode_jpeg(high, quality=HIGH_RES_QUALITY)
    thumb_bytes = encode_thumbnail(high)
    return high_bytes, thumb_bytes


def _save_bytes(key: str, data: bytes, content_type: str = 'image/jpeg') -> str:
    return default_storage.save(key, ContentFile(data, name=key.split('/')[-1]))


def create_thumbnail_s3_file(
    *,
    high_res_key: str,
    thumb_bytes: bytes,
    user,
    filename: str | None = None,
    using: str = 'default',
) -> S3File:
    thumb_key = thumb_key_for_high_res(high_res_key)
    saved = _save_bytes(thumb_key, thumb_bytes)
    base = filename or high_res_key.split('/')[-1]
    if base.lower().endswith(('.jpg', '.jpeg')):
        thumb_name = f'{base.rsplit(".", 1)[0]}_thumb.jpg'
    else:
        thumb_name = f'{base}_thumb.jpg'
    return S3File.objects.using(using).create(
        key=saved,
        filename=thumb_name,
        size=len(thumb_bytes),
        content_type='image/jpeg',
        uploaded_by=user,
    )


def save_receiving_photo(
    *,
    receiving: Receiving,
    order_id: int,
    kind: str,
    raw: bytes,
    filename: str,
    user,
    client_photo_id=None,
    pallet_number: int | None = None,
    side: str = '',
) -> SavedReceivingPhoto:
    """Validate, encode high-res + thumb, persist S3File rows + ReceivingAttachment."""
    high_bytes, thumb_bytes = prepare_high_res_and_thumb(raw)
    hex_id = uuid.uuid4().hex
    high_key = f'receiving/orders/{order_id}/{hex_id}.jpg'
    saved_keys: list[str] = []
    try:
        high_saved = _save_bytes(high_key, high_bytes)
        saved_keys.append(high_saved)
        thumb_key = thumb_key_for_high_res(high_saved)
        thumb_saved = _save_bytes(thumb_key, thumb_bytes)
        saved_keys.append(thumb_saved)

        with transaction.atomic():
            high_sf = S3File.objects.create(
                key=high_saved,
                filename=filename or f'{hex_id}.jpg',
                size=len(high_bytes),
                content_type='image/jpeg',
                uploaded_by=user,
            )
            thumb_sf = S3File.objects.create(
                key=thumb_saved,
                filename=(
                    f'{(filename or hex_id).rsplit(".", 1)[0]}_thumb.jpg'
                    if filename
                    else f'{hex_id}_thumb.jpg'
                ),
                size=len(thumb_bytes),
                content_type='image/jpeg',
                uploaded_by=user,
            )
            att_kwargs = {
                'receiving': receiving,
                's3_file': high_sf,
                'thumbnail_file': thumb_sf,
                'kind': kind,
            }
            if client_photo_id is not None:
                att_kwargs['client_photo_id'] = client_photo_id
            if kind == 'pallet_side':
                att = ReceivingAttachment.objects.create(
                    **att_kwargs,
                    pallet_number=pallet_number,
                    side=side,
                )
            else:
                att = ReceivingAttachment.objects.create(**att_kwargs)
            Receiving.objects.filter(pk=receiving.pk).update(
                draft_version=F('draft_version') + 1,
                updated_at=timezone.now(),
            )
        att = (
            ReceivingAttachment.objects.filter(pk=att.pk)
            .select_related('s3_file', 'thumbnail_file')
            .first()
        )
        return SavedReceivingPhoto(attachment=att, high_res=high_sf, thumbnail=thumb_sf)
    except Exception:
        for key in saved_keys:
            try:
                default_storage.delete(key)
            except Exception:
                logger.warning('receiving_photos cleanup failed key=%s', key, exc_info=True)
        raise


def ensure_thumbnail_for_attachment(
    att: ReceivingAttachment,
    user=None,
    *,
    using: str = 'default',
) -> S3File | None:
    """Create thumbnail for an existing high-res attachment if missing. Idempotent."""
    if att.thumbnail_file_id:
        return att.thumbnail_file
    if not att.s3_file_id:
        return None
    high = att.s3_file
    thumb_key = thumb_key_for_high_res(high.key)
    if default_storage.exists(thumb_key):
        # Orphan storage object from a prior partial run — link a new S3File row.
        try:
            size = default_storage.size(thumb_key)
        except Exception:
            size = 0
        sf = S3File.objects.using(using).create(
            key=thumb_key,
            filename=f'{high.filename.rsplit(".", 1)[0]}_thumb.jpg',
            size=size,
            content_type='image/jpeg',
            uploaded_by=user or high.uploaded_by,
        )
        ReceivingAttachment.objects.using(using).filter(pk=att.pk).update(thumbnail_file=sf)
        att.thumbnail_file = sf
        return sf

    try:
        with default_storage.open(high.key, 'rb') as fh:
            raw = fh.read()
    except Exception as exc:
        logger.warning('ensure_thumbnail open failed att=%s: %s', att.pk, exc)
        return None
    try:
        _high_bytes, thumb_bytes = prepare_high_res_and_thumb(raw)
    except ReceivingPhotoError:
        logger.warning('ensure_thumbnail decode failed att=%s', att.pk, exc_info=True)
        return None

    sf = create_thumbnail_s3_file(
        high_res_key=high.key,
        thumb_bytes=thumb_bytes,
        user=user or high.uploaded_by,
        filename=high.filename,
        using=using,
    )
    ReceivingAttachment.objects.using(using).filter(pk=att.pk).update(thumbnail_file=sf)
    att.thumbnail_file = sf
    return sf


def delete_attachment_storage(att: ReceivingAttachment) -> None:
    """Delete high-res + thumbnail storage objects and S3File rows for one attachment."""
    high = att.s3_file
    thumb = att.thumbnail_file
    high_key = high.key if high else None
    thumb_key = thumb.key if thumb else None
    with transaction.atomic():
        att.delete()
        if thumb is not None:
            thumb.delete()
        if high is not None:
            high.delete()
    for key in (thumb_key, high_key):
        if not key:
            continue
        try:
            default_storage.delete(key)
        except Exception:
            logger.warning('receiving_delete_photo storage delete failed key=%s', key, exc_info=True)
