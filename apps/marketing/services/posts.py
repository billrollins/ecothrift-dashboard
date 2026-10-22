"""A post's Always-include check, its caption, its status steps, and the API payloads.

**Always include** (plan): a post can be marked Ready only when every line passes, and each miss is named.

1. Real photos: `marketing.min_photos` (3) or more from the library.
2. One hook line: written, and no longer than `marketing.hook_max_chars` (80): the caption's first line.
3. Where and when: the store address (`store_address`) and hours (`online_sales.hours`); both go in the caption
   by themselves, so this fails only when one is missing.
4. The Thrift+ line (`marketing.thrift_plus_line`): added to the caption by itself.
5. A call to action: come in, message us, or ask for a hold.
6. Product photos show their tag (owner 2026-10-22, F6): every photo with an item has its tag overlay on. Scene
   photos (no item) carry none. Replaced the brand frame (fixed templates, retired the same day).

A Ready post that is edited until it fails goes back to Draft. A Posted post is locked (only the owner's rating
changes). Marking Posted closes the day's Today's post routine run.
"""
from __future__ import annotations

from urllib.parse import urlparse

from django.db import transaction
from django.utils import timezone

from apps.core.models import AppSetting
from apps.marketing.models import SocialPhoto, SocialPost, SocialPostPhoto
from apps.marketing.settings import marketing_settings
from apps.webstore.services.hours import format_hours_label, get_hours_config

DEFAULT_ADDRESS = '8425 West Center Road, Omaha NE 68124'
# Facebook drops empty lines; this blank Braille character keeps the spacing (creative-method.md).
SPACER = '⠀'
CTA_LINES = {
    SocialPost.CTA_COME_IN: 'Come in and see it on the floor.',
    SocialPost.CTA_MESSAGE: 'Questions? Send us a message.',
    SocialPost.CTA_HOLD: 'Want it? Message us and ask for a hold.',
}
FACEBOOK_HOSTS = ('facebook.com', 'fb.com', 'fb.me', 'fb.watch')


class PostError(ValueError):
    def __init__(self, detail: str, code: str, missing: list[str] | None = None):
        super().__init__(detail)
        self.detail = detail
        self.code = code
        self.missing = missing or []


def store_address() -> str:
    value = AppSetting.objects.filter(key='store_address').values_list('value', flat=True).first()
    return value.strip() if isinstance(value, str) and value.strip() else DEFAULT_ADDRESS


def brand_payload(settings: dict | None = None) -> dict:
    """What the caption prints: address, hours, the Thrift+ line."""
    settings = settings or marketing_settings()
    return {
        'address': store_address(),
        'hours': format_hours_label(get_hours_config()),
        'thrift_plus_line': settings['thrift_plus_line'],
    }


def _photo_ids(post: SocialPost) -> list[int]:
    return list(post.post_photos.order_by('position').values_list('photo_id', flat=True))


def check_post(post: SocialPost, *, settings: dict | None = None, brand: dict | None = None) -> list[dict]:
    settings = settings or marketing_settings()
    brand = brand or brand_payload(settings)
    rows = list(post.post_photos.values_list('photo__item_id', 'photo__tag_overlay'))
    photos = len(rows)
    untagged = sum(1 for item_id, overlay in rows if item_id and not overlay)
    need = settings['min_photos']
    hook = (post.hook or '').strip()
    limit = settings['hook_max_chars']

    def line(key, label, ok, missing=''):
        return {'key': key, 'label': label, 'ok': bool(ok), 'missing': '' if ok else missing}

    if not hook:
        hook_miss = 'Write one hook line: what it is and why now.'
    else:
        hook_miss = f'Shorten the hook to {limit} characters (now {len(hook)}).'
    return [
        line('photos', f'{need}+ real photos', photos >= need,
             f'Add {need - photos} more real photo{"" if need - photos == 1 else "s"} ({need} or more).'),
        line('hook', 'One hook line', hook and len(hook) <= limit, hook_miss),
        line('where_when', 'Address and hours', brand['address'] and brand['hours'],
             'The store address or hours are missing in Settings.'),
        line('thrift_plus', 'The Thrift+ line', brand['thrift_plus_line'],
             'The Thrift+ line is empty in Settings > Store > Social Studio.'),
        line('cta', 'A call to action', post.call_to_action in CTA_LINES, 'Pick a call to action.'),
        line('tags', 'Product photos show their tag', untagged == 0,
             f'Turn the tag on for {untagged} product photo{"" if untagged == 1 else "s"}.'),
    ]


def missing_lines(post: SocialPost, **kwargs) -> list[str]:
    return [row['missing'] for row in check_post(post, **kwargs) if not row['ok']]


def post_text(post: SocialPost, *, brand: dict | None = None) -> str:
    """The caption Post it copies: hook, words, call to action, where and when, the Thrift+ line."""
    brand = brand or brand_payload()
    blocks = [(post.hook or '').strip(), (post.body or '').strip(), CTA_LINES.get(post.call_to_action, '')]
    where = '\n'.join(part for part in (f'\U0001F4CD {brand["address"]}' if brand['address'] else '', brand['hours']) if part)
    blocks += [where, brand['thrift_plus_line']]
    return f'\n{SPACER}\n'.join(block for block in blocks if block)


def settle_status(post: SocialPost) -> None:
    """A Ready post that no longer passes goes back to Draft."""
    if post.status == SocialPost.STATUS_READY and missing_lines(post):
        post.status = SocialPost.STATUS_DRAFT
        post.save(update_fields=['status', 'updated_at'])


def set_photos(post: SocialPost, photo_ids: list[int]) -> None:
    if post.status == SocialPost.STATUS_POSTED:
        raise PostError('This post is posted; it cannot change.', 'POSTED')
    ids = []
    for pk in photo_ids:
        try:
            pk = int(pk)
        except (TypeError, ValueError):
            continue
        if pk not in ids:
            ids.append(pk)
    found = set(SocialPhoto.objects.filter(pk__in=ids).values_list('pk', flat=True))
    if len(found) != len(ids):
        raise PostError('A photo is no longer in the library.', 'PHOTO_NOT_FOUND')
    with transaction.atomic():
        post.post_photos.all().delete()
        SocialPostPhoto.objects.bulk_create(
            [SocialPostPhoto(post=post, photo_id=pk, position=index) for index, pk in enumerate(ids)]
        )
        post.save(update_fields=['updated_at'])
    settle_status(post)


def mark_ready(post: SocialPost) -> None:
    if post.status == SocialPost.STATUS_POSTED:
        raise PostError('This post is already posted.', 'POSTED')
    missing = missing_lines(post)
    if missing:
        raise PostError('Not ready yet: ' + ' '.join(missing), 'NOT_READY', missing)
    post.status = SocialPost.STATUS_READY
    post.save(update_fields=['status', 'updated_at'])


def clean_facebook_url(raw) -> str:
    url = str(raw or '').strip()
    parsed = urlparse(url)
    host = (parsed.hostname or '').lower()
    if parsed.scheme not in ('http', 'https') or not any(host == h or host.endswith('.' + h) for h in FACEBOOK_HOSTS):
        raise PostError('Paste the link to the post on Facebook.', 'BAD_URL')
    return url[:500]


def mark_posted(post: SocialPost, *, url, user) -> None:
    if post.status == SocialPost.STATUS_POSTED:
        raise PostError('This post is already posted.', 'POSTED')
    missing = missing_lines(post)
    if missing:
        raise PostError('Not ready yet: ' + ' '.join(missing), 'NOT_READY', missing)
    post.posted_url = clean_facebook_url(url)
    post.posted_at = timezone.now()
    post.posted_by = user
    post.status = SocialPost.STATUS_POSTED
    post.save(update_fields=['posted_url', 'posted_at', 'posted_by', 'status', 'updated_at'])
    close_routine_run(post, user=user)


def close_routine_run(post: SocialPost, *, user) -> None:
    """The day's Today's post run is done once its post is posted (no submission row, like Mark done)."""
    from apps.routines.command_center import resolve_nudges_for_run
    from apps.routines.models import Routine, RoutineRun

    runs = RoutineRun.objects.filter(
        routine__kind=Routine.KIND_SOCIAL_POST, period_key=post.slot_date.isoformat(), status=RoutineRun.STATUS_OPEN,
    )
    for run in runs:
        run.status = RoutineRun.STATUS_DONE
        run.completed_at = post.posted_at or timezone.now()
        run.completed_by = user
        run.generated = {**(run.generated or {}), 'social_post_id': post.pk}
        run.save(update_fields=['status', 'completed_at', 'completed_by', 'generated'])
        resolve_nudges_for_run(run)


def photo_payload(photo: SocialPhoto, *, used_in: list[dict] | None = None, with_tag: bool = False) -> dict:
    """`with_tag` adds the item's live tag facts for the overlay (a few reads per photo: posts and one photo only)."""
    def url(field):
        try:
            return field.url if field else None
        except Exception:
            return None

    out = {
        'id': photo.pk,
        'image_url': url(photo.image),
        'thumb_url': url(photo.thumbnail) or url(photo.image),
        'width': photo.width,
        'height': photo.height,
        'category': photo.category,
        'sku': photo.item.sku if photo.item_id and photo.item else '',
        'note': photo.note,
        'uploaded_by_name': photo.uploaded_by.full_name if photo.uploaded_by_id and photo.uploaded_by else '',
        'uploaded_at': photo.uploaded_at.isoformat() if photo.uploaded_at else None,
        'taken_at': photo.taken_at.isoformat() if photo.taken_at else None,
        'is_archived': photo.is_archived,
        'tag_overlay': photo.tag_overlay,
        'tag_corner': photo.tag_corner,
        'edited_at': photo.edited_at.isoformat() if photo.edited_at else None,
        'used_in': used_in if used_in is not None else [
            {'post_id': row.post_id, 'slot_date': row.post.slot_date.isoformat()}
            for row in photo.post_photos.select_related('post')
        ],
    }
    if with_tag:
        from apps.marketing.services.tags import tag_card

        out['tag'] = tag_card(photo.item) if photo.item_id and photo.item else None
    return out


def post_payload(post: SocialPost, *, settings: dict | None = None, brand: dict | None = None,
                 with_photos: bool = True) -> dict:
    settings = settings or marketing_settings()
    brand = brand or brand_payload(settings)
    checks = check_post(post, settings=settings, brand=brand)
    out = {
        'id': post.pk,
        'slot_date': post.slot_date.isoformat(),
        'post_type': post.post_type,
        'post_type_label': post.get_post_type_display(),
        'category': post.category,
        'hook': post.hook,
        'body': post.body,
        'call_to_action': post.call_to_action,
        'size': post.size,
        'status': post.status,
        'source': post.source,
        'posted_url': post.posted_url,
        'posted_at': post.posted_at.isoformat() if post.posted_at else None,
        'posted_by_name': post.posted_by.full_name if post.posted_by_id and post.posted_by else '',
        'rating': post.rating,
        'checks': checks,
        'passes': all(row['ok'] for row in checks),
        'photo_ids': _photo_ids(post),
        'text': post_text(post, brand=brand),
    }
    if with_photos:
        rows = post.post_photos.select_related(
            'photo', 'photo__item', 'photo__item__product', 'photo__uploaded_by',
        ).order_by('position')
        out['photos'] = [photo_payload(row.photo, used_in=[], with_tag=True) for row in rows]
    return out
