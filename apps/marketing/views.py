"""Social Studio API (`/api/marketing/`). Every staff login can stock photos and make posts; the rating is the
owner's (superuser)."""
from datetime import date, timedelta

from django.db.models import Count
from django.http import FileResponse
from django.utils import timezone
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.permissions import IsEmployee
from apps.webstore.services.hours import get_hours_config, is_open_day

from .models import SocialPhoto, SocialPost, SocialPostPhoto
from .services import cadence
from .services.ideas import IdeasError, apply_idea, request_ideas, rewrite
from .services.photos import PhotoError, replace_image, save_photo
from .services.tags import lookup
from .services.posts import (
    PostError,
    brand_payload,
    mark_posted,
    mark_ready,
    photo_payload,
    post_payload,
    set_photos,
    settle_status,
)
from .settings import marketing_settings

STAFF = [IsAuthenticated, IsEmployee]
PHOTO_LIST_LIMIT = 300


def _err(detail, code, status=400, **extra):
    return Response({'detail': detail, 'code': code, **extra}, status=status)


def _today() -> date:
    return timezone.localdate()


def _parse_day(raw) -> date | None:
    try:
        return date.fromisoformat(str(raw))
    except (TypeError, ValueError):
        return None


def _post(pk):
    return SocialPost.objects.filter(pk=pk).first()


def _post_response(post, status=200):
    return Response(post_payload(post), status=status)


def _post_error(exc: PostError):
    return _err(exc.detail, exc.code, missing=exc.missing)


@api_view(['GET'])
@permission_classes(STAFF)
def week(request):
    """The week calendar: seven days, each with its post (made on first look), plus the frame's brand lines."""
    today = _today()
    start = cadence.week_start(_parse_day(request.query_params.get('start')) or today)
    posts = {post.slot_date: post for post in cadence.ensure_week(start, today=today)}
    settings = marketing_settings()
    brand = brand_payload(settings)
    cfg = get_hours_config()
    days = []
    for day in cadence.week_days(start):
        post = posts.get(day)
        days.append({
            'date': day.isoformat(),
            'open': is_open_day(day, cfg=cfg),
            'post': post_payload(post, settings=settings, brand=brand, with_photos=False) if post else None,
        })
    return Response({
        'start': start.isoformat(),
        'prev': (start - timedelta(days=7)).isoformat(),
        'next': (start + timedelta(days=7)).isoformat(),
        'today': today.isoformat(),
        'days': days,
        'brand': brand,
        'rules': {'min_photos': settings['min_photos'], 'hook_max_chars': settings['hook_max_chars']},
        'can_rate': bool(request.user.is_superuser),
    })


@api_view(['GET'])
@permission_classes(STAFF)
def today(request):
    """Today's post for the routine runner (null on a day with no post)."""
    day = _today()
    cadence.ensure_week(day, today=day)
    post = SocialPost.objects.filter(slot_date=day).first()
    return Response({'date': day.isoformat(), 'post': post_payload(post, with_photos=False) if post else None})


@api_view(['GET', 'PATCH'])
@permission_classes(STAFF)
def post_detail(request, pk):
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    if request.method == 'GET':
        payload = post_payload(post)
        payload['brand'] = brand_payload()
        payload['rules'] = {k: marketing_settings()[k] for k in ('min_photos', 'hook_max_chars')}
        payload['can_rate'] = bool(request.user.is_superuser)
        return Response(payload)
    if post.status == SocialPost.STATUS_POSTED:
        return _err('This post is posted; it cannot change.', 'POSTED')
    data = request.data
    changed = []
    for field, limit in (('hook', 200), ('body', 4000), ('category', 100)):
        if field in data:
            setattr(post, field, str(data.get(field) or '').strip()[:limit])
            changed.append(field)
    choices = {
        'call_to_action': [c for c, _ in SocialPost.CTA_CHOICES] + [''],
        'layout': [c for c, _ in SocialPost.LAYOUT_CHOICES],
        'size': [c for c, _ in SocialPost.SIZE_CHOICES],
    }
    for field, allowed in choices.items():
        if field in data:
            value = str(data.get(field) or '')
            if value not in allowed:
                return _err(f'Pick a valid {field.replace("_", " ")}.', 'BAD_CHOICE')
            setattr(post, field, value)
            changed.append(field)
    if changed:
        post.save(update_fields=[*changed, 'updated_at'])
        settle_status(post)
    return _post_response(post)


@api_view(['PUT'])
@permission_classes(STAFF)
def post_photos(request, pk):
    """Set the post's photos, in order: the first ones fill the frame's zones."""
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    ids = request.data.get('photo_ids')
    if not isinstance(ids, list):
        return _err('Send photo_ids as a list.', 'BAD_PHOTOS')
    try:
        set_photos(post, ids)
    except PostError as exc:
        return _post_error(exc)
    return _post_response(post)


@api_view(['POST'])
@permission_classes(STAFF)
def post_swap(request, pk):
    post = _post(pk)
    other = _post(request.data.get('with'))
    if post is None or other is None or post.pk == other.pk:
        return _err('Pick two different days to swap.', 'NOT_FOUND', 404)
    if SocialPost.STATUS_POSTED in (post.status, other.status):
        return _err('A posted day cannot be swapped.', 'POSTED')
    cadence.swap_slots(post, other)
    return _post_response(post)


@api_view(['POST'])
@permission_classes(STAFF)
def post_ready(request, pk):
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    try:
        mark_ready(post)
    except PostError as exc:
        return _post_error(exc)
    return _post_response(post)


@api_view(['POST'])
@permission_classes(STAFF)
def post_posted(request, pk):
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    try:
        mark_posted(post, url=request.data.get('url'), user=request.user)
    except PostError as exc:
        return _post_error(exc)
    return _post_response(post)


@api_view(['POST'])
@permission_classes(STAFF)
def post_ideas(request, pk):
    """Get ideas: the AI writes 3 to 5 post ideas in the background (the page polls the post)."""
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    try:
        post = request_ideas(post, user=request.user)
    except IdeasError as exc:
        return _err(exc.detail, exc.code)
    return _post_response(post, status=202)


@api_view(['POST'])
@permission_classes(STAFF)
def post_use_idea(request, pk, index):
    """Use this idea: its words replace the post's, its photos are added."""
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    try:
        post = apply_idea(post, index)
    except IdeasError as exc:
        return _err(exc.detail, exc.code)
    return _post_response(post)


@api_view(['POST'])
@permission_classes(STAFF)
def post_rewrite(request, pk):
    """A fast rewrite: `part` hook or body, `mode` new or shorter, `current` the words on screen. 3 options back."""
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    if post.status == SocialPost.STATUS_POSTED:
        return _err('This post is posted; it cannot change.', 'POSTED')
    data = request.data
    try:
        options = rewrite(post, part=str(data.get('part') or ''), mode=str(data.get('mode') or ''),
                          current=str(data.get('current') or '')[:4000])
    except IdeasError as exc:
        return _err(exc.detail, exc.code)
    return Response({'options': options})


@api_view(['POST'])
@permission_classes(STAFF)
def post_rating(request, pk):
    """The owner's 1-5 mark (null clears it)."""
    if not request.user.is_superuser:
        return _err('Only the owner rates posts.', 'SUPERUSER_ONLY', 403)
    post = _post(pk)
    if post is None:
        return _err('Post not found.', 'NOT_FOUND', 404)
    raw = request.data.get('rating')
    if raw in (None, ''):
        rating = None
    else:
        try:
            rating = int(raw)
        except (TypeError, ValueError):
            rating = 0
        if rating < 1 or rating > 5:
            return _err('Rate from 1 to 5.', 'BAD_RATING')
    post.rating = rating
    post.save(update_fields=['rating', 'updated_at'])
    return _post_response(post)


@api_view(['GET', 'POST'])
@permission_classes(STAFF)
@parser_classes([MultiPartParser, FormParser, JSONParser])
def photos(request):
    """The library. GET filters: `unused=1`, `category=`, `week=1` (since Monday), `archived=1`. POST: files[]."""
    if request.method == 'POST':
        files = request.FILES.getlist('files') or request.FILES.getlist('file')
        if not files:
            return _err('Add at least one photo.', 'NO_FILES')
        category = str(request.data.get('category') or '').strip()
        note = str(request.data.get('note') or '').strip()
        item = None
        sku = str(request.data.get('sku') or '').strip()
        if sku:
            from apps.inventory.models import Item

            item = Item.objects.filter(sku__iexact=sku).first()
            if item is None:
                return _err(f'No item with tag {sku}.', 'SKU_NOT_FOUND')
        taken = request.data.getlist('taken_ms') if hasattr(request.data, 'getlist') else []
        saved, failed = [], []
        for index, upload in enumerate(files):
            try:
                saved.append(save_photo(
                    upload, user=request.user, category=category, item=item, note=note,
                    taken_ms=taken[index] if index < len(taken) else None,
                ))
            except PhotoError as exc:
                failed.append({'name': getattr(upload, 'name', ''), 'detail': exc.detail})
        return Response(
            {'photos': [photo_payload(p, used_in=[], with_tag=True) for p in saved], 'failed': failed},
            status=201 if saved else 400,
        )
    params = request.query_params
    qs = SocialPhoto.objects.select_related('item', 'uploaded_by').annotate(uses=Count('post_photos'))
    qs = qs.filter(is_archived=params.get('archived') == '1')
    if params.get('unused') == '1':
        qs = qs.filter(uses=0)
    if params.get('category'):
        qs = qs.filter(category=params.get('category'))
    if params.get('week') == '1':
        qs = qs.filter(uploaded_at__date__gte=cadence.week_start(_today()))
    rows = list(qs[:PHOTO_LIST_LIMIT])
    uses: dict[int, list[dict]] = {}
    for link in SocialPostPhoto.objects.filter(photo_id__in=[p.pk for p in rows]).select_related('post'):
        uses.setdefault(link.photo_id, []).append({'post_id': link.post_id, 'slot_date': link.post.slot_date.isoformat()})
    return Response({'photos': [photo_payload(p, used_in=uses.get(p.pk, [])) for p in rows]})


@api_view(['PATCH'])
@permission_classes(STAFF)
def photo_detail(request, pk):
    photo = SocialPhoto.objects.filter(pk=pk).first()
    if photo is None:
        return _err('Photo not found.', 'NOT_FOUND', 404)
    data = request.data
    changed = []
    if 'category' in data:
        photo.category = str(data.get('category') or '').strip()[:100]
        changed.append('category')
    if 'note' in data:
        photo.note = str(data.get('note') or '').strip()[:255]
        changed.append('note')
    if 'sku' in data:
        sku = str(data.get('sku') or '').strip()
        if sku:
            from apps.inventory.models import Item

            item = Item.objects.filter(sku__iexact=sku).first()
            if item is None:
                return _err(f'No item with tag {sku}.', 'SKU_NOT_FOUND')
            photo.item = item
        else:
            photo.item = None
        changed.append('item')
    if 'is_archived' in data:
        photo.is_archived = bool(data.get('is_archived'))
        changed.append('is_archived')
    if 'tag_overlay' in data:
        photo.tag_overlay = bool(data.get('tag_overlay'))
        changed.append('tag_overlay')
    if 'tag_corner' in data:
        corner = str(data.get('tag_corner') or '')
        if corner not in dict(SocialPhoto.CORNER_CHOICES):
            return _err('Pick a corner for the tag.', 'BAD_CHOICE')
        photo.tag_corner = corner
        changed.append('tag_corner')
    if changed:
        photo.save(update_fields=changed)
        # A Ready post whose product photo lost its tag goes back to Draft.
        for post in SocialPost.objects.filter(post_photos__photo=photo, status=SocialPost.STATUS_READY):
            settle_status(post)
    return Response(photo_payload(photo, with_tag=True))


@api_view(['GET', 'POST'])
@permission_classes(STAFF)
@parser_classes([MultiPartParser, FormParser])
def photo_image(request, pk):
    """GET: the full photo from our own address, so the canvas can draw it and export the PNG (ask with `?v=` the
    photo's `edited_at`, as an edit keeps the address). POST `file`: the photo editor's result replaces it."""
    photo = SocialPhoto.objects.filter(pk=pk).first()
    if photo is None or not photo.image:
        return _err('Photo not found.', 'NOT_FOUND', 404)
    if request.method == 'POST':
        upload = request.FILES.get('file')
        if upload is None:
            return _err('Send the edited photo.', 'NO_FILES')
        try:
            replace_image(photo, upload)
        except PhotoError as exc:
            return _err(exc.detail, exc.code)
        return Response(photo_payload(photo, with_tag=True))
    response = FileResponse(photo.image.open('rb'), content_type='image/jpeg')
    response['Cache-Control'] = 'private, max-age=86400'
    return response


@api_view(['GET'])
@permission_classes(STAFF)
def tag_lookup(request, sku):
    """Scan a tag: the item's overlay facts (price, checked retail, today's ThriftBucks, 3-day returns or AS IS)."""
    return Response(lookup(sku))
