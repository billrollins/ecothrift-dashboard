"""Listing photo slots: full + main / grid / thumb JPEGs.

Since 2026-10-28 (Bill) a photo keeps its upload (`original`, turned upright, max 4096px edge) and the editor's
`edits` (turn, crop, brightness, contrast). The full JPEG and the slots are built from original + edits, so the
editor can reopen a photo from its original and every edit stays undoable.
"""

from __future__ import annotations

import json
import logging
import uuid
from typing import Any

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Max
from PIL import Image

from apps.core.models import S3File
from apps.inventory.services.receiving_photos import (
    ReceivingPhotoError,
    _open_image,
    _resize_max_edge,
    encode_jpeg,
)
from apps.webstore.models import WebListing, WebListingImage, WebListingImageVariant

logger = logging.getLogger(__name__)

FULL_MAX_EDGE = 2048
FULL_QUALITY = 85
ORIGINAL_MAX_EDGE = 4096
ORIGINAL_QUALITY = 92
ROTATIONS = (0, 90, 180, 270)
ADJUST_RANGE = (50, 150)
SLOTS = ('main', 'grid', 'thumb')
SLOT_SPECS = {
    'main': {'width': 1600, 'height': 1200, 'aspect': 4 / 3, 'quality': 82},
    'grid': {'width': 800, 'height': 600, 'aspect': 4 / 3, 'quality': 80},
    'thumb': {'width': 400, 'height': 400, 'aspect': 1.0, 'quality': 78},
}
SLOT_FALLBACK = {
    'full': ('full', 'main', 'grid', 'thumb'),
    'display': ('main', 'full'),
    'main': ('main', 'full'),
    'grid': ('grid', 'main', 'full'),
    'thumb': ('thumb', 'main', 'full'),
}
SLOT_FILL = (238, 242, 240)


class ListingPhotoError(ValueError):
    """Invalid listing image upload or crop."""

    def __init__(self, code: str, detail: str):
        self.code = code
        self.detail = detail
        super().__init__(detail)


def _as_rect(value: Any) -> dict[str, float]:
    if not isinstance(value, dict):
        raise ListingPhotoError('invalid_crop', 'Crop must be JSON {x,y,w,h}.')
    if not any(k in value for k in ('w', 'width')) or not any(k in value for k in ('h', 'height')):
        raise ListingPhotoError('invalid_crop', 'Crop must be JSON {x,y,w,h}.')
    try:
        return {
            'x': float(value.get('x', 0)),
            'y': float(value.get('y', 0)),
            'w': float(value.get('w', value.get('width'))),
            'h': float(value.get('h', value.get('height'))),
        }
    except (TypeError, ValueError) as exc:
        raise ListingPhotoError('invalid_crop', 'Crop values must be numbers.') from exc


def _looks_like_rect(value: Any) -> bool:
    return isinstance(value, dict) and (
        ('w' in value or 'width' in value) and ('h' in value or 'height' in value)
        and not any(k in value for k in SLOTS)
    )


def parse_crops_payload(value: Any) -> dict[str, dict[str, float]] | None:
    """Return `{slot: {x,y,w,h}}` or None. A bare rect is treated as main."""
    if value is None or value == '':
        return None
    if isinstance(value, (bytes, bytearray)):
        value = value.decode('utf-8')
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ListingPhotoError('invalid_crop', 'Crops must be JSON.') from exc
    if not isinstance(value, dict):
        raise ListingPhotoError('invalid_crop', 'Crops must be a JSON object.')
    if _looks_like_rect(value):
        return {'main': _as_rect(value)}
    out: dict[str, dict[str, float]] = {}
    for slot in SLOTS:
        raw = value.get(slot)
        if raw:
            out[slot] = _as_rect(raw)
    return out or None


def parse_crop_payload(value: Any) -> dict[str, float] | None:
    """Legacy single-rect parser. Prefer `parse_crops_payload`."""
    crops = parse_crops_payload(value)
    if not crops:
        return None
    return crops.get('main')


def _center_aspect(width: int, height: int, aspect: float) -> dict[str, int]:
    if width < 1 or height < 1:
        return {'x': 0, 'y': 0, 'w': max(1, width), 'h': max(1, height)}
    current = width / height
    if current > aspect:
        nw = max(1, int(round(height * aspect)))
        nh = height
        x = (width - nw) // 2
        y = 0
    else:
        nw = width
        nh = max(1, int(round(width / aspect)))
        x = 0
        y = (height - nh) // 2
    return {'x': max(0, x), 'y': max(0, y), 'w': nw, 'h': nh}


def _center_square_in_rect(rect: dict[str, int]) -> dict[str, int]:
    x, y, w, h = rect['x'], rect['y'], rect['w'], rect['h']
    side = max(1, min(w, h))
    return {
        'x': x + (w - side) // 2,
        'y': y + (h - side) // 2,
        'w': side,
        'h': side,
    }


def _normalize_crop(
    crop: dict[str, float] | None,
    width: int,
    height: int,
    *,
    fallback_aspect: float,
) -> dict[str, int]:
    if not crop:
        return _center_aspect(width, height, fallback_aspect)
    try:
        x = float(crop['x'])
        y = float(crop['y'])
        w = float(crop['w'])
        h = float(crop['h'])
    except (KeyError, TypeError, ValueError):
        return _center_aspect(width, height, fallback_aspect)
    if w < 8 or h < 8:
        return _center_aspect(width, height, fallback_aspect)
    x = max(0.0, min(x, max(0, width - 1)))
    y = max(0.0, min(y, max(0, height - 1)))
    w = min(w, width - x)
    h = min(h, height - y)
    if w < 8 or h < 8:
        return _center_aspect(width, height, fallback_aspect)
    return {
        'x': int(round(x)),
        'y': int(round(y)),
        'w': max(1, int(round(w))),
        'h': max(1, int(round(h))),
    }


def _scale_crop(crop: dict[str, float], src_w: int, src_h: int, dst_w: int, dst_h: int) -> dict[str, float]:
    if src_w < 1 or src_h < 1:
        return crop
    return {
        'x': crop['x'] * (dst_w / src_w),
        'y': crop['y'] * (dst_h / src_h),
        'w': crop['w'] * (dst_w / src_w),
        'h': crop['h'] * (dst_h / src_h),
    }


def _crop_tuple(rect: dict[str, int]) -> tuple[int, int, int, int]:
    return (
        int(rect['x']),
        int(rect['y']),
        int(rect['x'] + rect['w']),
        int(rect['y'] + rect['h']),
    )


def _crops_equal(a: dict | None, b: dict | None) -> bool:
    if not a or not b:
        return False
    return all(int(a.get(k, -1)) == int(b.get(k, -2)) for k in ('x', 'y', 'w', 'h'))


def _is_full_rect(rect: dict | None, width: int, height: int) -> bool:
    if not rect or width < 1 or height < 1:
        return False
    return (
        int(rect.get('x', -1)) == 0
        and int(rect.get('y', -1)) == 0
        and int(rect.get('w', -1)) == width
        and int(rect.get('h', -1)) == height
    )


def _is_default_cover(rect: dict | None, width: int, height: int) -> bool:
    return _crops_equal(rect, _center_aspect(width, height, 4 / 3))


def _render_slot(full: Image.Image, rect: dict, spec: dict, *, contain: bool) -> bytes:
    cropped = full.crop(_crop_tuple(rect))
    if cropped.mode != 'RGB':
        cropped = cropped.convert('RGB')
    tw, th = spec['width'], spec['height']
    if not contain:
        sized = cropped.resize((tw, th), Image.Resampling.LANCZOS)
        return encode_jpeg(sized, quality=spec['quality'])
    canvas = Image.new('RGB', (tw, th), SLOT_FILL)
    scale = min(tw / cropped.width, th / cropped.height)
    nw = max(1, int(round(cropped.width * scale)))
    nh = max(1, int(round(cropped.height * scale)))
    fitted = cropped.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((tw - nw) // 2, (th - nh) // 2))
    return encode_jpeg(canvas, quality=spec['quality'])


def derive_default_crops(
    full_w: int,
    full_h: int,
    requested: dict[str, dict[str, float]] | None = None,
) -> dict[str, dict[str, Any]]:
    requested = requested or {}
    if 'main' in requested:
        main = _normalize_crop(requested['main'], full_w, full_h, fallback_aspect=4 / 3)
        main_derived = False
    else:
        main = {'x': 0, 'y': 0, 'w': max(1, full_w), 'h': max(1, full_h)}
        main_derived = True
    if 'grid' in requested:
        grid = _normalize_crop(requested['grid'], full_w, full_h, fallback_aspect=4 / 3)
        grid_derived = False
    else:
        grid = dict(main)
        grid_derived = True
    if 'thumb' in requested:
        thumb = _normalize_crop(requested['thumb'], full_w, full_h, fallback_aspect=1.0)
        thumb_derived = False
    elif main_derived:
        thumb = dict(main)
        thumb_derived = True
    else:
        thumb = _center_square_in_rect(main)
        thumb_derived = True
    return {
        'main': {**main, 'derived': main_derived},
        'grid': {**grid, 'derived': grid_derived},
        'thumb': {**thumb, 'derived': thumb_derived},
    }


def parse_edits_payload(value: Any) -> dict[str, Any] | None:
    """`{rotate, crop, brightness, contrast}` from the editor, cleaned; None when not sent.

    `rotate` is clockwise degrees (0/90/180/270); `crop` is `{x,y,w,h}` in percent of the turned photo (None = the
    whole photo); brightness and contrast are percents (100 = unchanged), as the editor's sliders show them.
    """
    if value is None or value == '':
        return None
    if isinstance(value, (bytes, bytearray)):
        value = value.decode('utf-8')
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError as exc:
            raise ListingPhotoError('invalid_edits', 'Edits must be JSON.') from exc
    if not isinstance(value, dict):
        raise ListingPhotoError('invalid_edits', 'Edits must be a JSON object.')
    try:
        rotate = int(value.get('rotate') or 0) % 360
        brightness = int(round(float(value.get('brightness', 100))))
        contrast = int(round(float(value.get('contrast', 100))))
    except (TypeError, ValueError) as exc:
        raise ListingPhotoError('invalid_edits', 'Edit values must be numbers.') from exc
    if rotate not in ROTATIONS:
        raise ListingPhotoError('invalid_edits', 'Turn by 90 degrees at a time.')
    lo, hi = ADJUST_RANGE
    out: dict[str, Any] = {
        'rotate': rotate,
        'brightness': max(lo, min(hi, brightness)),
        'contrast': max(lo, min(hi, contrast)),
        'crop': None,
    }
    crop = value.get('crop')
    if crop:
        rect = _as_rect(crop)
        x, y = max(0.0, min(rect['x'], 100.0)), max(0.0, min(rect['y'], 100.0))
        w, h = min(rect['w'], 100.0 - x), min(rect['h'], 100.0 - y)
        if w >= 1 and h >= 1 and not (x <= 0.05 and y <= 0.05 and w >= 99.9 and h >= 99.9):
            out['crop'] = {'x': round(x, 4), 'y': round(y, 4), 'w': round(w, 4), 'h': round(h, 4)}
    return out


def pct_crops_to_px(crops: dict[str, dict[str, float]] | None, width: int, height: int) -> dict[str, dict[str, float]]:
    """Frames from the editor, in percent of the edited photo, to its pixels."""
    return {
        slot: {'x': r['x'] / 100 * width, 'y': r['y'] / 100 * height, 'w': r['w'] / 100 * width,
               'h': r['h'] / 100 * height}
        for slot, r in (crops or {}).items()
    }


def edits_geometry(edits: dict | None) -> tuple:
    """What changes the photo's shape: a frame saved for another shape no longer fits."""
    edits = edits or {}
    return (int(edits.get('rotate') or 0), json.dumps(edits.get('crop') or None, sort_keys=True))


def apply_edits(img: Image.Image, edits: dict | None) -> Image.Image:
    """Turn, crop, then brightness / contrast, the way the editor previews them (CSS brightness then contrast)."""
    edits = edits or {}
    rotate = int(edits.get('rotate') or 0) % 360
    if rotate == 90:
        img = img.transpose(Image.Transpose.ROTATE_270)
    elif rotate == 180:
        img = img.transpose(Image.Transpose.ROTATE_180)
    elif rotate == 270:
        img = img.transpose(Image.Transpose.ROTATE_90)
    crop = edits.get('crop')
    if crop:
        w, h = img.size
        left = int(round(crop['x'] / 100 * w))
        top = int(round(crop['y'] / 100 * h))
        right = min(w, max(left + 1, int(round((crop['x'] + crop['w']) / 100 * w))))
        bottom = min(h, max(top + 1, int(round((crop['y'] + crop['h']) / 100 * h))))
        img = img.crop((left, top, right, bottom))
    b = float(edits.get('brightness', 100)) / 100
    c = float(edits.get('contrast', 100)) / 100
    if b != 1 or c != 1:
        table = [max(0, min(255, int(round(v * b * c + 128 * (1 - c))))) for v in range(256)]
        img = img.point(table * len(img.getbands()))
    return img


def _open(raw: bytes) -> Image.Image:
    try:
        return _open_image(raw)
    except ReceivingPhotoError as exc:
        raise ListingPhotoError(exc.code, exc.detail) from exc


def prepare_variants(
    raw: bytes | Image.Image,
    crops: dict[str, dict[str, float]] | None = None,
) -> tuple[bytes, int, int, dict[str, tuple[bytes, dict[str, Any]]]]:
    img = raw if isinstance(raw, Image.Image) else _open(raw)
    src_w, src_h = img.size
    full = _resize_max_edge(img, FULL_MAX_EDGE)
    fw, fh = full.size
    scaled: dict[str, dict[str, float]] = {}
    for slot, rect in (crops or {}).items():
        if src_w != fw or src_h != fh:
            scaled[slot] = _scale_crop(rect, src_w, src_h, fw, fh)
        else:
            scaled[slot] = rect
    rects = derive_default_crops(fw, fh, scaled or None)
    out: dict[str, tuple[bytes, dict[str, Any]]] = {}
    for slot, spec in SLOT_SPECS.items():
        rect = rects[slot]
        contain = bool(rect.get('derived', True))
        out[slot] = (_render_slot(full, rect, spec, contain=contain), rect)
    full_bytes = encode_jpeg(full, quality=FULL_QUALITY)
    return full_bytes, fw, fh, out


def _save_bytes(key: str, data: bytes) -> str:
    return default_storage.save(key, ContentFile(data, name=key.split('/')[-1]))


def _create_s3_file(*, key: str, data: bytes, filename: str, user) -> S3File:
    return S3File.objects.create(
        key=key,
        filename=filename,
        size=len(data),
        content_type='image/jpeg',
        uploaded_by=user,
    )


def _delete_s3_file(sf: S3File | None) -> None:
    if sf is None:
        return
    key = sf.key
    sf.delete()
    if not key:
        return
    try:
        default_storage.delete(key)
    except Exception:
        logger.warning('listing_photos storage delete failed key=%s', key, exc_info=True)


def _read_full_bytes(image: WebListingImage) -> bytes:
    if not image.s3_file_id:
        raise ListingPhotoError('missing_full', 'This photo has no full-resolution file.')
    try:
        with default_storage.open(image.s3_file.key, 'rb') as fh:
            return fh.read()
    except Exception as exc:
        raise ListingPhotoError('missing_full', 'Could not read the full-resolution file.') from exc


def _variant_map(image: WebListingImage) -> dict[str, WebListingImageVariant]:
    return {v.slot: v for v in image.variants.select_related('s3_file').all()}


def _usable_file(sf: S3File | None) -> S3File | None:
    if sf is None or not sf.key:
        return None
    try:
        if not default_storage.exists(sf.key):
            return None
    except Exception:
        logger.warning('listing_photos exists check failed key=%s', sf.key, exc_info=True)
        return sf
    return sf


def resolve_slot_file(image: WebListingImage, slot: str) -> S3File | None:
    slot = slot or 'full'
    variants = _variant_map(image)
    for key in SLOT_FALLBACK.get(slot, (slot, 'full')):
        if key == 'full':
            found = _usable_file(image.s3_file)
        else:
            variant = variants.get(key)
            found = _usable_file(variant.s3_file if variant and variant.s3_file_id else None)
        if found is not None:
            return found
    return _usable_file(image.s3_file)


def _write_variants(
    *,
    image: WebListingImage,
    listing_id: int,
    slot_data: dict[str, tuple[bytes, dict[str, Any]]],
    slots: tuple[str, ...] | list[str],
    user,
    stem: str,
    existing: dict[str, WebListingImageVariant] | None = None,
) -> None:
    existing = existing or {}
    hex_id = uuid.uuid4().hex
    for slot in slots:
        data, rect = slot_data[slot]
        spec = SLOT_SPECS[slot]
        saved = _save_bytes(f'webstore/listings/{listing_id}/{hex_id}_{slot}.jpg', data)
        sf = _create_s3_file(
            key=saved,
            data=data,
            filename=f'{stem}_{slot}.jpg',
            user=user,
        )
        old = existing.get(slot)
        WebListingImageVariant.objects.update_or_create(
            image=image,
            slot=slot,
            defaults={
                's3_file': sf,
                'crop': rect,
                'width': spec['width'],
                'height': spec['height'],
            },
        )
        if old is not None and old.s3_file_id and old.s3_file_id != sf.id:
            _delete_s3_file(old.s3_file)


def save_listing_photo(
    *,
    listing: WebListing,
    raw: bytes,
    filename: str,
    user,
    alt: str = '',
    crops: dict[str, dict[str, float]] | None = None,
    crop: dict[str, float] | None = None,
    edits: dict[str, Any] | None = None,
) -> WebListingImage:
    """Save an upload. With `edits` the upload is the original: it is kept, and the photo is built from it.

    Without `edits` (older callers) the upload is the finished photo and is its own original, and `crops` are in
    its pixels. With `edits`, `crops` are in percent of the edited photo."""
    requested = crops or ({'main': crop} if crop else None)
    original = _resize_max_edge(_open(raw), ORIGINAL_MAX_EDGE)
    original_bytes = encode_jpeg(original, quality=ORIGINAL_QUALITY)
    edited = apply_edits(original, edits)
    if edits is not None:
        requested = pct_crops_to_px(requested, *edited.size) or None
    full_bytes, width, height, slot_data = prepare_variants(edited, requested)
    hex_id = uuid.uuid4().hex
    saved_keys: list[str] = []
    try:
        full_saved = _save_bytes(f'webstore/listings/{listing.id}/{hex_id}.jpg', full_bytes)
        saved_keys.append(full_saved)
        original_saved = _save_bytes(f'webstore/listings/{listing.id}/originals/{hex_id}.jpg', original_bytes)
        saved_keys.append(original_saved)
        stem = (filename or hex_id).rsplit('.', 1)[0]
        next_pos = (listing.images.aggregate(m=Max('position'))['m'] or 0) + 1
        with transaction.atomic():
            full_sf = _create_s3_file(
                key=full_saved, data=full_bytes, filename=f'{stem}.jpg', user=user,
            )
            original_sf = _create_s3_file(
                key=original_saved, data=original_bytes, filename=f'{stem}-original.jpg', user=user,
            )
            image = WebListingImage.objects.create(
                listing=listing,
                s3_file=full_sf,
                original=original_sf,
                edits=edits or {},
                width=width,
                height=height,
                alt=(alt or '')[:200],
                position=next_pos,
            )
            _write_variants(
                image=image,
                listing_id=listing.id,
                slot_data=slot_data,
                slots=SLOTS,
                user=user,
                stem=stem,
            )
        return (
            WebListingImage.objects.select_related('s3_file')
            .prefetch_related('variants__s3_file')
            .get(pk=image.pk)
        )
    except Exception:
        for key in saved_keys:
            try:
                default_storage.delete(key)
            except Exception:
                logger.warning('listing_photos cleanup failed key=%s', key, exc_info=True)
        raise


def _requested_for_reframe(
    existing: dict[str, WebListingImageVariant],
    crops: dict[str, dict[str, float]],
) -> dict[str, dict[str, float]]:
    requested: dict[str, dict[str, float]] = {}
    if 'main' in crops:
        requested['main'] = crops['main']
    else:
        old_main = existing.get('main')
        if old_main and isinstance(old_main.crop, dict):
            requested['main'] = old_main.crop
    for slot in ('grid', 'thumb'):
        if slot in crops:
            requested[slot] = crops[slot]
            continue
        old = existing.get(slot)
        if old and isinstance(old.crop, dict) and not old.crop.get('derived', True):
            requested[slot] = old.crop
    return requested


def reframe_listing_photo(
    image: WebListingImage,
    crops: dict[str, dict[str, float]] | None = None,
    crop: dict[str, float] | None = None,
    user=None,
) -> WebListingImage:
    requested = crops or ({'main': crop} if crop else None)
    if not requested:
        raise ListingPhotoError('invalid_crop', 'Crops are required.')
    raw = _read_full_bytes(image)
    existing = _variant_map(image)
    merged = _requested_for_reframe(existing, requested)
    _full_bytes, width, height, slot_data = prepare_variants(raw, merged)
    slots_to_write = []
    for slot in SLOTS:
        old = existing.get(slot)
        new_rect = slot_data[slot][1]
        if (
            old is None
            or old.width != SLOT_SPECS[slot]['width']
            or old.height != SLOT_SPECS[slot]['height']
            or not _crops_equal(old.crop, new_rect)
            or bool((old.crop or {}).get('derived', True)) != bool(new_rect.get('derived'))
        ):
            slots_to_write.append(slot)
    stem = (image.s3_file.filename or uuid.uuid4().hex).rsplit('.', 1)[0]
    with transaction.atomic():
        WebListingImage.objects.filter(pk=image.pk).update(width=width, height=height)
        if slots_to_write:
            _write_variants(
                image=image,
                listing_id=image.listing_id,
                slot_data=slot_data,
                slots=slots_to_write,
                user=user or image.s3_file.uploaded_by,
                stem=stem,
                existing=existing,
            )
    return (
        WebListingImage.objects.select_related('s3_file')
        .prefetch_related('variants__s3_file')
        .get(pk=image.pk)
    )


def read_original_bytes(image: WebListingImage) -> bytes:
    """The photo's original; a photo from before originals were kept uses its full JPEG."""
    sf = _usable_file(image.original) if image.original_id else None
    if sf is None:
        return _read_full_bytes(image)
    try:
        with default_storage.open(sf.key, 'rb') as fh:
            return fh.read()
    except Exception as exc:
        raise ListingPhotoError('missing_original', 'Could not read the original photo.') from exc


def edit_listing_photo(
    image: WebListingImage,
    edits: dict[str, Any],
    crops: dict[str, dict[str, float]] | None = None,
    user=None,
) -> WebListingImage:
    """Rebuild the photo from its original with new `edits` (and optional slot frames).

    `crops` (percents of the edited photo) are then the photo's hand-set frames, all of them: a slot left out is
    back to the whole photo. Without `crops`, a frame set by hand is kept while the photo keeps its shape; a new
    turn or crop resets the frames to the whole photo, since the old ones were drawn on another shape."""
    user = user or image.s3_file.uploaded_by
    had_original = bool(image.original_id and _usable_file(image.original))
    raw = read_original_bytes(image)
    original = _open(raw)
    existing = _variant_map(image)
    edited = apply_edits(original, edits)
    sw, sh = edited.size
    requested: dict[str, dict[str, float]] = {}
    if crops is None and edits_geometry(image.edits) == edits_geometry(edits):
        for slot in SLOTS:    # frames set by hand stay (they are stored in the full JPEG's pixels)
            old = existing.get(slot)
            if old and isinstance(old.crop, dict) and not old.crop.get('derived', True) and image.width and image.height:
                requested[slot] = _scale_crop(old.crop, image.width, image.height, sw, sh)
    requested.update(pct_crops_to_px(crops, sw, sh))
    full_bytes, width, height, slot_data = prepare_variants(edited, requested or None)
    stem = (image.s3_file.filename or uuid.uuid4().hex).rsplit('.', 1)[0].removesuffix('-original')
    hex_id = uuid.uuid4().hex
    full_saved = _save_bytes(f'webstore/listings/{image.listing_id}/{hex_id}.jpg', full_bytes)
    original_saved = None
    if not had_original:
        original_bytes = encode_jpeg(_resize_max_edge(original, ORIGINAL_MAX_EDGE), quality=ORIGINAL_QUALITY)
        original_saved = _save_bytes(f'webstore/listings/{image.listing_id}/originals/{hex_id}.jpg', original_bytes)
    old_full = image.s3_file
    with transaction.atomic():
        full_sf = _create_s3_file(key=full_saved, data=full_bytes, filename=f'{stem}.jpg', user=user)
        fields = {'s3_file': full_sf, 'edits': edits, 'width': width, 'height': height}
        if original_saved:
            fields['original'] = _create_s3_file(
                key=original_saved, data=original_bytes, filename=f'{stem}-original.jpg', user=user,
            )
        WebListingImage.objects.filter(pk=image.pk).update(**fields)
        image.refresh_from_db()
        _write_variants(
            image=image,
            listing_id=image.listing_id,
            slot_data=slot_data,
            slots=SLOTS,
            user=user,
            stem=stem,
            existing=existing,
        )
    if old_full is not None and old_full.pk != full_sf.pk:
        _delete_s3_file(old_full)
    return (
        WebListingImage.objects.select_related('s3_file', 'original')
        .prefetch_related('variants__s3_file')
        .get(pk=image.pk)
    )


def delete_listing_photo(image: WebListingImage) -> None:
    variants = list(image.variants.select_related('s3_file'))
    files = [image.s3_file] + [v.s3_file for v in variants if v.s3_file_id]
    if image.original_id:
        files.append(image.original)
    image.delete()
    for sf in files:
        _delete_s3_file(sf)


def _needs_backfill(image: WebListingImage, regenerate: bool) -> bool:
    variants = _variant_map(image)
    if any(slot not in variants for slot in SLOTS):
        return True
    return bool(regenerate)


def backfill_listing_image(
    image: WebListingImage,
    user=None,
    regenerate: bool = False,
) -> WebListingImage | None:
    if not image.s3_file_id:
        return None
    if not _needs_backfill(image, regenerate):
        return image
    try:
        raw = _read_full_bytes(image)
    except ListingPhotoError:
        logger.warning('listing_photos backfill open failed image=%s', image.pk)
        return None
    try:
        img = _open_image(raw)
    except ReceivingPhotoError:
        logger.warning('listing_photos backfill decode failed image=%s', image.pk, exc_info=True)
        return None
    full = _resize_max_edge(img, FULL_MAX_EDGE)
    rewrote_full = full.size != img.size
    full_bytes = encode_jpeg(full, quality=FULL_QUALITY)
    fw, fh = full.size
    existing = _variant_map(image)
    requested: dict[str, dict[str, float]] = {}
    for slot, variant in existing.items():
        crop = variant.crop if isinstance(variant.crop, dict) else None
        if not crop:
            continue
        if crop.get('derived', True):
            continue
        if _is_default_cover(crop, fw, fh) or _is_full_rect(crop, fw, fh):
            continue
        requested[slot] = crop
    rects = derive_default_crops(fw, fh, requested or None)
    slot_data: dict[str, tuple[bytes, dict[str, Any]]] = {}
    for slot, spec in SLOT_SPECS.items():
        rect = rects[slot]
        contain = bool(rect.get('derived', True))
        slot_data[slot] = (_render_slot(full, rect, spec, contain=contain), rect)

    slots_to_write = list(SLOTS) if regenerate else [
        slot for slot in SLOTS
        if slot not in existing
        or existing[slot].width != SLOT_SPECS[slot]['width']
        or existing[slot].height != SLOT_SPECS[slot]['height']
    ]
    hex_id = uuid.uuid4().hex
    listing_id = image.listing_id
    saved_keys: list[str] = []
    old_full = image.s3_file
    try:
        new_full_key = None
        if rewrote_full:
            new_full_key = _save_bytes(
                f'webstore/listings/{listing_id}/{hex_id}.jpg',
                full_bytes,
            )
            saved_keys.append(new_full_key)
        stem = (old_full.filename or hex_id).rsplit('.', 1)[0]
        with transaction.atomic():
            if new_full_key is not None:
                full_sf = _create_s3_file(
                    key=new_full_key,
                    data=full_bytes,
                    filename=f'{stem}.jpg',
                    user=user or old_full.uploaded_by,
                )
                WebListingImage.objects.filter(pk=image.pk).update(
                    s3_file=full_sf, width=fw, height=fh,
                )
                _delete_s3_file(old_full)
            else:
                WebListingImage.objects.filter(pk=image.pk).update(width=fw, height=fh)
            image = WebListingImage.objects.select_related('s3_file').get(pk=image.pk)
            _write_variants(
                image=image,
                listing_id=listing_id,
                slot_data=slot_data,
                slots=slots_to_write,
                user=user or image.s3_file.uploaded_by,
                stem=stem,
                existing=_variant_map(image),
            )
        return (
            WebListingImage.objects.select_related('s3_file')
            .prefetch_related('variants__s3_file')
            .get(pk=image.pk)
        )
    except Exception:
        for key in saved_keys:
            try:
                default_storage.delete(key)
            except Exception:
                logger.warning('listing_photos backfill cleanup failed key=%s', key, exc_info=True)
        raise
