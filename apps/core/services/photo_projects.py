"""Photo projects (owner 2026-11-24): scan a tag, take a photo, add a note; Grok Imagine cleans up a copy.

Photos are saved like photo drops (JPEG up to 2048 px plus a 480 px thumbnail, ``core.S3File`` rows under
``photo-projects/<project id>/``). An edit keeps the original and stores Grok's copy beside it. A deleted
project waits ``KEEP_DELETED_DAYS`` and is then removed for good (``purge_deleted``, run about once an hour
when someone opens the projects list); a deleted photo goes at once.
"""
from __future__ import annotations

import base64
import logging
import threading
import uuid
from datetime import timedelta

import requests
from decouple import config
from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import close_old_connections, connections, transaction
from django.db.models import Q
from django.utils import timezone
from PIL import Image

from apps.core.models import PhotoProject, ProjectPhoto
from apps.core.services.photo_drops import (
    JPEG_QUALITY, MAX_EDGE, THUMB_EDGE, THUMB_QUALITY, PhotoDropError, _delete_stored, _fit, _jpeg, _read_photo, _store,
)

logger = logging.getLogger(__name__)

KEEP_DELETED_DAYS = 30
PURGE_CACHE_KEY = 'photo_projects:purged'
GROK_MODEL = 'grok-imagine-image-2.0'
GROK_URL = 'https://api.x.ai/v1/images/edits'
GROK_EDGE = 1024  # Grok refuses a large upload; a 1024 px JPEG works (tested 2026-11-24).

KEEP_AS_IS = ('Keep the item exactly as it is: same shape, parts, color, angle and proportions; do not redraw, fix '
              'or add anything.')
PROMPTS = {
    'remove_background': (
        'Isolate the main item in the center of this photo as a clean product photo on a pure white background. '
        'Remove everything else: other items, shelves, walls, floor, people, and any price tag, hang tag or sticker. '
        + KEEP_AS_IS + ' Show the whole item fully in frame, centered, with a soft natural shadow.'),
    'clean_up': (
        'Tidy this product photo but keep its real setting: remove price tags, hang tags, stickers and stray clutter '
        'around the main item, and even out the light. ' + KEEP_AS_IS + ' Keep the whole item in frame.'),
}
PROMPTS['square'] = PROMPTS['remove_background']

PhotoError = PhotoDropError


def is_owner_level(user) -> bool:
    return bool(user.is_superuser or getattr(user, 'role', '') == 'Admin')


def visible_to(user):
    """Projects this login may see: owner level sees all; others their own and the ones shared with them."""
    qs = PhotoProject.objects.filter(deleted_at__isnull=True)
    if is_owner_level(user):
        return qs
    return qs.filter(Q(created_by=user) | Q(shared_with=user)).distinct()


def can_manage(user, project: PhotoProject) -> bool:
    return is_owner_level(user) or project.created_by_id == user.pk


def find_item(code: str):
    from apps.inventory.services.scan_code import sku_from_scan
    from apps.thriftplus.services.scanner import find_item as _find

    sku = sku_from_scan(code or '').upper()
    return _find(sku) if sku else None


def save_photo(project: PhotoProject, raw: bytes, *, user, code: str = '', note: str = '') -> ProjectPhoto:
    full = _fit(_read_photo(raw), MAX_EDGE)
    stem = uuid.uuid4().hex
    prefix = f'photo-projects/{project.pk}'
    name = f'photo-{timezone.localtime().strftime("%Y%m%d-%H%M%S")}'
    item = None
    if code:
        try:
            item = find_item(code)
        except Exception:
            logger.warning('photo_projects: tag lookup failed for %r', code, exc_info=True)
    saved = []
    try:
        with transaction.atomic():
            file = _store(f'{prefix}/{stem}.jpg', _jpeg(full, JPEG_QUALITY), user=user, filename=f'{name}.jpg')
            saved.append(file)
            thumb = _store(f'{prefix}/{stem}_thumb.jpg', _jpeg(_fit(full, THUMB_EDGE), THUMB_QUALITY),
                           user=user, filename=f'{name}_thumb.jpg')
            saved.append(thumb)
            return ProjectPhoto.objects.create(
                project=project, item=item, scanned_code=(code or '').strip()[:80], note=(note or '').strip(),
                file=file, thumbnail=thumb, width=full.width, height=full.height, taken_by=user,
            )
    except Exception:
        for row in saved:
            _delete_stored(row.key)
        raise


def _files(photo: ProjectPhoto):
    return [row for row in (photo.file, photo.thumbnail, photo.edited, photo.edited_thumbnail) if row is not None]


def delete_photo(photo: ProjectPhoto) -> None:
    files = _files(photo)
    with transaction.atomic():
        photo.delete()
        for row in files:
            row.delete()
    for row in files:
        _delete_stored(row.key)


def delete_project(project: PhotoProject) -> None:
    project.deleted_at = timezone.now()
    project.save(update_fields=['deleted_at'])


def purge_deleted(now=None) -> int:
    cutoff = (now or timezone.now()) - timedelta(days=KEEP_DELETED_DAYS)
    count = 0
    for project in PhotoProject.objects.filter(deleted_at__lt=cutoff):
        try:
            for photo in project.photos.select_related('file', 'thumbnail', 'edited', 'edited_thumbnail'):
                delete_photo(photo)
            project.delete()
            count += 1
        except Exception:
            logger.warning('photo_projects: could not purge project %s', project.pk, exc_info=True)
    return count


def purge_deleted_sometimes() -> int:
    try:
        if not cache.add(PURGE_CACHE_KEY, 1, 60 * 60):
            return 0
        return purge_deleted()
    except Exception:
        logger.warning('photo_projects: the hourly clean-up failed', exc_info=True)
        return 0


# -- Grok edits -------------------------------------------------------------------------------------------------


def start_edit(photo: ProjectPhoto, kind: str) -> ProjectPhoto:
    if kind not in PROMPTS:
        raise PhotoError('Unknown edit.')
    photo.edit_kind, photo.edit_status, photo.edit_error = kind, 'working', ''
    photo.save(update_fields=['edit_kind', 'edit_status', 'edit_error'])
    _spawn(photo.pk)
    return photo


def _spawn(photo_id) -> None:
    """Run in a thread so the request returns at once. (Tests replace this to run inline.)"""
    threading.Thread(target=_run, args=(photo_id,), name=f'photo-edit-{photo_id}', daemon=True).start()


def _run(photo_id) -> None:
    close_old_connections()
    try:
        _work(photo_id)
    finally:
        connections.close_all()


def _grok(image_jpeg: bytes, prompt: str) -> bytes:
    key = config('XAI_API_KEY', default='')
    if not key:
        raise PhotoError('Grok is not set up (no xAI key).')
    last = ''
    for _ in range(3):
        try:
            r = requests.post(GROK_URL, headers={'Authorization': f'Bearer {key}'}, timeout=240, json={
                'model': GROK_MODEL, 'prompt': prompt, 'response_format': 'b64_json',
                'image': {'url': 'data:image/jpeg;base64,' + base64.b64encode(image_jpeg).decode(), 'type': 'image_url'},
            })
            data = r.json() if 'json' in r.headers.get('content-type', '') else {}
            if r.ok and data.get('data'):
                return base64.b64decode(data['data'][0]['b64_json'])
            last = f'Grok answered {r.status_code}.'
        except Exception as exc:
            last = f'Grok could not be reached ({type(exc).__name__}).'
    raise PhotoError(last or 'Grok failed.')


def _square(img: Image.Image) -> Image.Image:
    side = max(img.size)
    out = Image.new('RGB', (side, side), 'white')
    out.paste(img, ((side - img.width) // 2, (side - img.height) // 2))
    return out


def _work(photo_id) -> None:
    photo = ProjectPhoto.objects.select_related('file', 'edited', 'edited_thumbnail').filter(pk=photo_id).first()
    if photo is None:
        return
    try:
        with default_storage.open(photo.file.key, 'rb') as fh:
            src = _fit(_read_photo(fh.read()), GROK_EDGE)
        out = _read_photo(_grok(_jpeg(src, 90), PROMPTS[photo.edit_kind]))
        if photo.edit_kind == 'square':
            out = _square(out)
        out = _fit(out, MAX_EDGE)
        old = [row for row in (photo.edited, photo.edited_thumbnail) if row is not None]
        stem = uuid.uuid4().hex
        prefix = f'photo-projects/{photo.project_id}'
        name = f'edit-{photo.edit_kind}-{photo.pk}'
        edited = _store(f'{prefix}/{stem}_edit.jpg', _jpeg(out, JPEG_QUALITY), user=photo.taken_by,
                        filename=f'{name}.jpg')
        thumb = _store(f'{prefix}/{stem}_edit_thumb.jpg', _jpeg(_fit(out, THUMB_EDGE), THUMB_QUALITY),
                       user=photo.taken_by, filename=f'{name}_thumb.jpg')
        ProjectPhoto.objects.filter(pk=photo.pk).update(
            edited=edited, edited_thumbnail=thumb, edit_status='done', edit_error='')
        for row in old:
            row.delete()
            _delete_stored(row.key)
    except Exception as exc:
        logger.warning('photo_projects: edit failed for photo %s', photo_id, exc_info=True)
        msg = str(exc) if isinstance(exc, PhotoError) else 'The edit failed. Try again.'
        ProjectPhoto.objects.filter(pk=photo_id).update(edit_status='failed', edit_error=msg[:255])
