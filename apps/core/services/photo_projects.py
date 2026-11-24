"""Photo projects (owner 2026-11-24): scan a tag, take a photo, add a note; then edit it into versions (Dash #209).

Photos are saved like photo drops (JPEG up to 2048 px plus a 480 px thumbnail, ``core.S3File`` rows under
``photo-projects/<project id>/``). The Raw photo is never changed. Every change is a ``ProjectPhotoVersion``:

- **Edit** versions are drawn in the browser and uploaded (``save_edit``): a PNG when see-through, else a JPEG.
- **AI** versions run here (``start_ai``) in a thread, through the AI image router (``image_router.edit_image``), so
  each run is logged in AI usage at the price and on the model picked in Settings > AI. The answer keeps the shape of
  the version it was made from (``fit_shape``); a run still working after ``STALE_MINUTES`` is marked failed.

A deleted project waits ``KEEP_DELETED_DAYS`` and is then removed for good (``purge_deleted``, run about once an hour
when someone opens the projects list); a deleted photo or version goes at once, files too.
"""
from __future__ import annotations

import base64
import io
import logging
import re
import threading
import uuid
from datetime import timedelta

from django.core.cache import cache
from django.core.files.storage import default_storage
from django.db import close_old_connections, connections, transaction
from django.db.models import Q
from django.utils import timezone
from PIL import Image, ImageOps, ImageStat

from apps.core.models import PhotoProject, ProjectPhoto, ProjectPhotoVersion
from apps.core.services.photo_drops import (
    JPEG_QUALITY, MAX_EDGE, THUMB_EDGE, THUMB_QUALITY, PhotoDropError, _delete_stored, _fit, _jpeg, _read_photo, _store,
)

logger = logging.getLogger(__name__)

KEEP_DELETED_DAYS = 30
PURGE_CACHE_KEY = 'photo_projects:purged'
AI_EDGE = 1024  # Grok refuses a large upload; a JPEG of at most 1024 px works (tested 2026-11-24).
STALE_MINUTES = 5
STALE_ERROR = 'It stopped before it finished.'
MAX_WORDS = 1000

KEEP_AS_IS = ('Keep the item exactly as it is: same shape, parts, color, angle and proportions; do not redraw, fix '
              'or add anything.')
NO_TAGS = 'Remove any price tag, hang tag or sticker.'
IN_FRAME = 'Keep the whole item in frame.'

# action: the AI purpose in Settings > AI (Image tier).
AI_ACTIONS = {
    'remove_background': 'PHOTO_REMOVE_BACKGROUND',
    'optimize': 'PHOTO_OPTIMIZE',
    'studio': 'PHOTO_FILTER',
    'room': 'PHOTO_FILTER',
    'holiday': 'PHOTO_FILTER',
    'clean_up': 'PHOTO_FILTER',
    'free': 'PHOTO_FREE_EDIT',
}
# action: (caption, prompt) for the actions with no choices.
FIXED = {
    'optimize': ('Optimized', (
        'Improve this product photo: fix dim or yellow store light, correct the white balance and color, and make it '
        'crisp and sharp. Keep the same item, the same setting and the same framing. ' + KEEP_AS_IS)),
    'studio': ('Studio shot', (
        'Turn this into a professional studio product photo: the item on a seamless white studio backdrop with soft '
        'studio light and a soft shadow. ' + NO_TAGS + ' ' + KEEP_AS_IS + ' ' + IN_FRAME)),
    'room': ('Room scene', (
        'Place the item in a tidy, well-lit room or setting that suits it, as a catalog lifestyle photo. ' + NO_TAGS
        + ' ' + KEEP_AS_IS + ' ' + IN_FRAME)),
    'holiday': ('Holiday scene', (
        'Place the item in a warm Christmas holiday setting, with soft lights and a decorated tree or wrapped gifts '
        'nearby, as a festive catalog photo. ' + NO_TAGS + ' ' + KEEP_AS_IS + ' ' + IN_FRAME)),
    'clean_up': ('Clean up', (
        'Tidy this product photo but keep its real setting: remove price tags, hang tags, stickers and stray clutter '
        'around the main item, and even out the light. ' + KEEP_AS_IS + ' ' + IN_FRAME)),
}
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')

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


def _drop_files(rows) -> None:
    """Delete S3File rows (once each); their stored files go once the transaction commits."""
    unique = {row.pk: row for row in rows if row is not None}
    for row in unique.values():
        key = row.key
        row.delete()
        transaction.on_commit(lambda key=key: _delete_stored(key))


def delete_photo(photo: ProjectPhoto) -> None:
    versions = list(photo.versions.select_related('file', 'thumbnail'))
    files = [photo.file, photo.thumbnail, photo.edited, photo.edited_thumbnail]
    files += [row for v in versions for row in (v.file, v.thumbnail)]
    with transaction.atomic():
        photo.delete()  # its versions go with it
        _drop_files(files)


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


# -- Versions ---------------------------------------------------------------------------------------------------


def main_of(photo: ProjectPhoto, versions=None):
    """Main: the starred version, Raw when Raw was starred, else the newest finished version, else Raw (None)."""
    rows = list(photo.versions.all()) if versions is None else list(versions)
    done = [v for v in rows if v.status == ProjectPhotoVersion.STATUS_DONE and v.file_id]
    if photo.main_version_id:
        hit = next((v for v in done if v.pk == photo.main_version_id), None)
        if hit is not None:
            return hit
    if photo.raw_is_main:
        return None
    return done[-1] if done else None


def set_main(photo: ProjectPhoto, version: ProjectPhotoVersion | None) -> ProjectPhoto:
    photo.main_version = version
    photo.raw_is_main = version is None
    photo.save(update_fields=['main_version', 'raw_is_main'])
    return photo


def expire_stale(qs=None) -> int:
    """Mark AI runs still working after ``STALE_MINUTES`` as failed (their thread died with a restart)."""
    cutoff = timezone.now() - timedelta(minutes=STALE_MINUTES)
    qs = ProjectPhotoVersion.objects.all() if qs is None else qs
    return qs.filter(status=ProjectPhotoVersion.STATUS_WORKING, started_at__lt=cutoff).update(
        status=ProjectPhotoVersion.STATUS_FAILED, error=STALE_ERROR)


def delete_version(version: ProjectPhotoVersion) -> None:
    files = [version.file, version.thumbnail]
    with transaction.atomic():
        version.delete()  # Main falls back to the newest; versions made from it keep their pictures
        _drop_files(files)


def _read_image(raw: bytes) -> Image.Image:
    """A picture as RGB, or RGBA when it has see-through pixels."""
    try:
        img = Image.open(io.BytesIO(raw))
        img.load()
    except Exception as exc:
        raise PhotoError('That file is not a picture.') from exc
    img = ImageOps.exif_transpose(img)
    if img.mode in ('RGBA', 'LA', 'PA') or (img.mode == 'P' and 'transparency' in img.info):
        img = img.convert('RGBA')
        if img.getchannel('A').getextrema()[0] < 255:
            return img
    return img.convert('RGB') if img.mode != 'RGB' else img


def _encode(img: Image.Image, quality: int) -> tuple[bytes, str, str]:
    """(bytes, extension, content type): PNG when see-through, else JPEG."""
    if img.mode == 'RGBA':
        buf = io.BytesIO()
        img.save(buf, format='PNG', optimize=True)
        return buf.getvalue(), 'png', 'image/png'
    return _jpeg(img, quality), 'jpg', 'image/jpeg'


def _store_picture(photo: ProjectPhoto, img: Image.Image, *, user, name: str):
    """Store a version's picture and its thumbnail. Returns (file, thumbnail)."""
    stem = uuid.uuid4().hex
    prefix = f'photo-projects/{photo.project_id}'
    data, ext, ctype = _encode(img, JPEG_QUALITY)
    file = _store(f'{prefix}/{stem}_v.{ext}', data, user=user, filename=f'{name}.{ext}', content_type=ctype)
    try:
        data, ext, ctype = _encode(_fit(img, THUMB_EDGE), THUMB_QUALITY)
        thumb = _store(f'{prefix}/{stem}_v_thumb.{ext}', data, user=user, filename=f'{name}_thumb.{ext}',
                       content_type=ctype)
    except Exception:
        with transaction.atomic():
            _drop_files([file])
        raise
    return file, thumb


def _check_source(photo: ProjectPhoto, made_from: ProjectPhotoVersion | None) -> None:
    if made_from is None:
        return
    if made_from.photo_id != photo.pk:
        raise PhotoError('That version belongs to another photo.')
    if made_from.status != ProjectPhotoVersion.STATUS_DONE or not made_from.file_id:
        raise PhotoError('That version has no picture yet.')


def save_edit(photo: ProjectPhoto, raw: bytes, *, user, made_from: ProjectPhotoVersion | None = None,
              caption: str = '') -> ProjectPhotoVersion:
    """Keep a picture drawn by the Edit tab as a new version."""
    _check_source(photo, made_from)
    img = _fit(_read_image(raw), MAX_EDGE)
    file, thumb = _store_picture(photo, img, user=user, name=f'edit-{photo.pk}')
    try:
        return ProjectPhotoVersion.objects.create(
            photo=photo, made_from=made_from, kind=ProjectPhotoVersion.KIND_EDIT, caption=(caption or 'Edit')[:80],
            file=file, thumbnail=thumb, width=img.width, height=img.height, see_through=img.mode == 'RGBA',
            status=ProjectPhotoVersion.STATUS_DONE, made_by=user,
        )
    except Exception:
        with transaction.atomic():
            _drop_files([file, thumb])
        raise


def _color_words(color: str) -> str:
    return {'#ffffff': 'a pure white background (#FFFFFF)', '#000000': 'a pure black background (#000000)'}.get(
        color, f'a solid, flat background in the color {color.upper()}, the same color edge to edge')


def ai_request(action: str, *, color: str = '', words: str = '') -> tuple[str, str]:
    """(caption, prompt) for one AI action. Raises PhotoError on a bad request."""
    if action == 'remove_background':
        color = (color or '#ffffff').lower()
        if not HEX.match(color):
            raise PhotoError('Pick a color.')
        shadow = 'with a soft natural shadow' if color == '#ffffff' else 'with no shadow'
        caption = {'#ffffff': 'No background', '#000000': 'Black background'}.get(color, 'Color background')
        return caption, (
            f'Isolate the main item in this photo as a clean product photo on {_color_words(color)}. Remove everything '
            'else: other items, shelves, walls, floor, people, and any price tag, hang tag or sticker. '
            f'{KEEP_AS_IS} Keep the whole item in frame, where it is, {shadow}.')
    if action == 'free':
        words = ' '.join((words or '').split())
        if not words:
            raise PhotoError('Say what to change.')
        if len(words) > MAX_WORDS:
            raise PhotoError(f'Keep it under {MAX_WORDS} characters.')
        caption = words if len(words) <= 40 else words[:38].rstrip() + '...'
        return caption, f'{words} {KEEP_AS_IS}'
    if action in FIXED:
        return FIXED[action]
    raise PhotoError('Unknown AI action.')


def start_ai(photo: ProjectPhoto, action: str, *, user, made_from: ProjectPhotoVersion | None = None,
             color: str = '', words: str = '') -> ProjectPhotoVersion:
    """Start one AI run from Raw or a version. The new version shows as working at once; a thread fills it in."""
    _check_source(photo, made_from)
    caption, prompt = ai_request(action, color=color, words=words)
    version = ProjectPhotoVersion.objects.create(
        photo=photo, made_from=made_from, kind=ProjectPhotoVersion.KIND_AI, action=action, caption=caption,
        prompt=prompt, status=ProjectPhotoVersion.STATUS_WORKING, made_by=user, started_at=timezone.now(),
    )
    _spawn(version.pk)
    return version


def run_again(version: ProjectPhotoVersion) -> ProjectPhotoVersion:
    """Run a failed AI version again in its own slot."""
    if version.kind != ProjectPhotoVersion.KIND_AI or version.status != ProjectPhotoVersion.STATUS_FAILED:
        raise PhotoError('Only a failed AI version can run again.')
    version.status, version.error, version.started_at = ProjectPhotoVersion.STATUS_WORKING, '', timezone.now()
    version.save(update_fields=['status', 'error', 'started_at'])
    _spawn(version.pk)
    return version


def _spawn(version_id) -> None:
    """Run in a thread so the request returns at once. (Tests replace this to run inline.)"""
    threading.Thread(target=_run, args=(version_id,), name=f'photo-ai-{version_id}', daemon=True).start()


def _run(version_id) -> None:
    close_old_connections()
    try:
        _work(version_id)
    finally:
        connections.close_all()


def _source(version: ProjectPhotoVersion) -> Image.Image:
    row = version.made_from.file if version.made_from_id else version.photo.file
    if row is None:
        raise PhotoError('The picture it was made from is gone.')
    with default_storage.open(row.key, 'rb') as fh:
        return _read_image(fh.read())


def _flat(img: Image.Image) -> Image.Image:
    if img.mode != 'RGBA':
        return img
    out = Image.new('RGB', img.size, 'white')
    out.paste(img, mask=img.getchannel('A'))
    return out


def _edge_color(img: Image.Image, rows: bool) -> tuple[int, ...]:
    """The median color of the two edges that padding will touch (top and bottom rows, or left and right columns)."""
    w, h = img.size
    if rows:
        strips = [img.crop((0, 0, w, min(2, h))), img.crop((0, max(0, h - 2), w, h))]
    else:
        strips = [img.crop((0, 0, min(2, w), h)), img.crop((max(0, w - 2), 0, w, h))]
    band = Image.new('RGB', (sum(s.width for s in strips), max(s.height for s in strips)))
    x = 0
    for s in strips:
        band.paste(s, (x, 0))
        x += s.width
    return tuple(int(v) for v in ImageStat.Stat(band).median[:3])


def fit_shape(img: Image.Image, ratio: float) -> Image.Image:
    """Fit the whole answer inside the source's shape (width / height), padding with the backdrop color.

    Grok answers in about the shape it was sent (tested 2026-11-24: 1:1 and 16:9 exact, 4:5 as 912 x 1136), so this
    is a few pixels at most; it never trims the item."""
    img = img.convert('RGB') if img.mode != 'RGB' else img
    w, h = img.size
    if ratio <= 0 or abs(w / h - ratio) / ratio < 0.002:
        return img
    if w / h > ratio:
        size = (w, max(h, round(w / ratio)))
    else:
        size = (max(w, round(h * ratio)), h)
    if size == (w, h):
        return img
    out = Image.new('RGB', size, _edge_color(img, rows=size[1] > h))
    out.paste(img, ((size[0] - w) // 2, (size[1] - h) // 2))
    return out


def _ask(version: ProjectPhotoVersion, src: Image.Image) -> Image.Image:
    from apps.core.ai_config import ai_model
    from apps.core.services.image_router import ImageError, edit_image

    purpose = AI_ACTIONS.get(version.action, 'PHOTO_FREE_EDIT')
    data = _jpeg(_fit(_flat(src), AI_EDGE), 90)
    last: Exception | None = None
    for _ in range(2):  # one more try when the service hiccups; a refused request fails at once
        try:
            out = edit_image(ai_model(purpose), version.prompt, data, log_source='photo_projects', log_purpose=purpose,
                             log_detail=f'photo {version.photo_id} {version.action}', log_user=version.made_by)
            return _read_image(base64.b64decode(out['b64']))
        except ImageError as exc:
            last = exc
            if exc.status < 500:
                break
    raise PhotoError(str(last) if last else 'The AI run failed.')


def _work(version_id) -> None:
    version = ProjectPhotoVersion.objects.select_related('photo__file', 'made_from__file', 'made_by') \
        .filter(pk=version_id).first()
    if version is None or version.status != ProjectPhotoVersion.STATUS_WORKING:
        return
    try:
        src = _source(version)
        out = _fit(fit_shape(_ask(version, src), src.width / src.height), MAX_EDGE)
        file, thumb = _store_picture(version.photo, out, user=version.made_by,
                                     name=f'ai-{version.action}-{version.photo_id}')
        with transaction.atomic():
            row = ProjectPhotoVersion.objects.select_for_update().filter(pk=version_id).first()
            if row is None:  # deleted while it ran
                _drop_files([file, thumb])
                return
            old = [row.file, row.thumbnail]
            row.file, row.thumbnail, row.width, row.height = file, thumb, out.width, out.height
            row.see_through, row.status, row.error = False, ProjectPhotoVersion.STATUS_DONE, ''
            row.save(update_fields=['file', 'thumbnail', 'width', 'height', 'see_through', 'status', 'error'])
            _drop_files([f for f in old if f is not None])  # a second run of the same slot replaced the first
    except Exception as exc:
        logger.warning('photo_projects: AI run failed for version %s', version_id, exc_info=True)
        msg = str(exc) if isinstance(exc, PhotoError) else 'The AI run failed. Run it again.'
        ProjectPhotoVersion.objects.filter(pk=version_id, status=ProjectPhotoVersion.STATUS_WORKING).update(
            status=ProjectPhotoVersion.STATUS_FAILED, error=msg[:255])
