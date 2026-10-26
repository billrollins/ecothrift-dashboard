"""Keys API (`/api/keys/`). Owner and Admin only: key photos show the cuts."""
from django.db.models import Count, Q
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User

from .models import Key, KeyRing, KeyRingMove
from .services import ai, search
from .services.keys import (
    METRIC_FIELDS,
    KeysError,
    apply_metrics,
    clean_metric_edit,
    last_moves,
    move_ring,
    read_key,
    read_upload,
    ring_or_none,
    ring_where,
    save_photo,
)

PARSERS = [MultiPartParser, FormParser, JSONParser]


class IsOwnerOrAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.role == 'Admin'))


OWNER = [IsAuthenticated, IsOwnerOrAdmin]


def _err(detail, code, status=400):
    return Response({'detail': detail, 'code': code}, status=status)


def _url(field) -> str | None:
    try:
        return field.url if field else None
    except ValueError:  # pragma: no cover - a name with no storage
        return None


def key_payload(key: Key, *, where: dict | None = None) -> dict:
    return {
        'id': key.pk,
        'name': key.name,
        'notes': key.notes,
        'ring_id': key.ring_id,
        'ring_name': key.ring.name if key.ring_id else '',
        'photo_url': _url(key.photo),
        'thumbnail_url': _url(key.thumbnail),
        **{field: getattr(key, field) for field in METRIC_FIELDS},
        'metrics_model': key.metrics_model,
        'metrics_at': key.metrics_at.isoformat() if key.metrics_at else None,
        'where': where,
        'created_at': key.created_at.isoformat(),
    }


def ring_payload(ring: KeyRing, *, last: KeyRingMove | None, key_count: int | None = None) -> dict:
    return {
        'id': ring.pk,
        'name': ring.name,
        'notes': ring.notes,
        'home_location': ring.home_location,
        'home_person_id': ring.home_person_id,
        'home_person_name': ring.home_person.full_name if ring.home_person_id else '',
        'key_count': key_count if key_count is not None else ring.keys.filter(is_archived=False).count(),
        'where': ring_where(ring, last),
    }


def _move_payload(move: KeyRingMove) -> dict:
    return {
        'id': move.pk,
        'kind': move.kind,
        'person': move.person.full_name if move.person_id else move.person_name,
        'location': move.location,
        'note': move.note,
        'moved_by': move.moved_by.full_name if move.moved_by_id else '',
        'moved_at': move.moved_at.isoformat(),
    }


def _person(raw):
    if raw in (None, '', 'null'):
        return None
    user = User.objects.filter(pk=raw).first() if str(raw).isdigit() else None
    if user is None:
        raise KeysError('That person was not found.', 'PERSON_NOT_FOUND')
    return user


def _text(data, field, limit):
    return ' '.join(str(data.get(field) or '').split())[:limit]


@api_view(['GET', 'POST'])
@permission_classes(OWNER)
@parser_classes(PARSERS)
def keys(request):
    """GET: every key (`q` searches name, notes, ring, type, keyway, brand, code; `ring=<id>` or `ring=none`).
    POST (multipart): name, notes, ring, photo. The photo is read by the AI at once."""
    if request.method == 'POST':
        data = request.data
        name = _text(data, 'name', 120)
        if not name:
            return _err('Give the key a name.', 'NO_NAME')
        try:
            ring = ring_or_none(data.get('ring'))
            upload = request.FILES.get('photo')
            raw = read_upload(upload) if upload is not None else None
            key = Key(name=name, notes=str(data.get('notes') or '').strip(), ring=ring, created_by=request.user)
            ai_error = ''
            if raw is not None:
                save_photo(key, raw)
                ai_error = read_key(key, raw)
        except KeysError as exc:
            return _err(exc.detail, exc.code)
        key.save()
        return Response({**key_payload(key), 'ai_error': ai_error}, status=201)
    params = request.query_params
    qs = Key.objects.filter(is_archived=False).select_related('ring')
    ring = params.get('ring')
    if ring == 'none':
        qs = qs.filter(ring__isnull=True)
    elif ring and ring.isdigit():
        qs = qs.filter(ring_id=int(ring))
    q = str(params.get('q') or '').strip()
    for word in q.split():
        qs = qs.filter(
            Q(name__icontains=word) | Q(notes__icontains=word) | Q(ring__name__icontains=word)
            | Q(key_type__icontains=word) | Q(keyway__icontains=word) | Q(brand__icontains=word)
            | Q(stamped_code__icontains=word) | Q(head_shape__icontains=word)
        )
    rows = list(qs)
    lasts = last_moves({k.ring_id for k in rows if k.ring_id})
    return Response({'keys': [
        key_payload(k, where=ring_where(k.ring, lasts.get(k.ring_id)) if k.ring_id else None) for k in rows
    ]})


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes(OWNER)
@parser_classes(PARSERS)
def key_detail(request, pk):
    """PATCH: name, notes, ring, any metric, or a new photo (read again by the AI). DELETE archives the key."""
    key = Key.objects.filter(pk=pk, is_archived=False).select_related('ring').first()
    if key is None:
        return _err('Key not found.', 'NOT_FOUND', 404)
    if request.method == 'DELETE':
        key.is_archived = True
        key.save(update_fields=['is_archived', 'updated_at'])
        return Response(status=204)
    ai_error = ''
    if request.method == 'PATCH':
        data = request.data
        try:
            if 'name' in data:
                name = _text(data, 'name', 120)
                if not name:
                    return _err('Give the key a name.', 'NO_NAME')
                key.name = name
            if 'notes' in data:
                key.notes = str(data.get('notes') or '').strip()
            if 'ring' in data:
                key.ring = ring_or_none(data.get('ring'))
            for field in METRIC_FIELDS:
                if field in data:
                    setattr(key, field, clean_metric_edit(field, data.get(field)))
            upload = request.FILES.get('photo')
            if upload is not None:
                raw = read_upload(upload)
                save_photo(key, raw)
                ai_error = read_key(key, raw)
        except KeysError as exc:
            return _err(exc.detail, exc.code)
        key.save()
    lasts = last_moves([key.ring_id]) if key.ring_id else {}
    where = ring_where(key.ring, lasts.get(key.ring_id)) if key.ring_id else None
    return Response({**key_payload(key, where=where), 'ai_error': ai_error})


@api_view(['POST'])
@permission_classes(OWNER)
def key_read(request, pk):
    """Read the saved photo with the AI again (a new model, or a first read that failed)."""
    key = Key.objects.filter(pk=pk, is_archived=False).select_related('ring').first()
    if key is None:
        return _err('Key not found.', 'NOT_FOUND', 404)
    if not key.photo:
        return _err('This key has no photo.', 'NO_PHOTO')
    with key.photo.open('rb') as fh:
        raw = fh.read()
    try:
        metrics, model = ai.read_metrics(raw)
    except ai.KeyAIError as exc:
        return _err(str(exc), 'AI_FAILED', 502)
    apply_metrics(key, metrics, model)
    key.save()
    return Response(key_payload(key))


@api_view(['GET', 'POST'])
@permission_classes(OWNER)
def rings(request):
    """GET: every ring with its key count and where it is now. POST: name, notes, home_location, home_person."""
    if request.method == 'POST':
        data = request.data
        name = _text(data, 'name', 120)
        if not name:
            return _err('Give the ring a name.', 'NO_NAME')
        try:
            person = _person(data.get('home_person'))
        except KeysError as exc:
            return _err(exc.detail, exc.code)
        ring = KeyRing.objects.create(
            name=name, notes=str(data.get('notes') or '').strip(),
            home_location=_text(data, 'home_location', 160), home_person=person,
        )
        return Response(ring_payload(ring, last=None, key_count=0), status=201)
    qs = (KeyRing.objects.filter(is_archived=False).select_related('home_person')
          .annotate(n=Count('keys', filter=Q(keys__is_archived=False))))
    rows = list(qs)
    lasts = last_moves([r.pk for r in rows])
    return Response({'rings': [ring_payload(r, last=lasts.get(r.pk), key_count=r.n) for r in rows]})


@api_view(['GET', 'PATCH', 'DELETE'])
@permission_classes(OWNER)
def ring_detail(request, pk):
    """GET: the ring, its keys and its log. PATCH: name, notes, home. DELETE archives it and takes its keys off."""
    ring = KeyRing.objects.filter(pk=pk, is_archived=False).select_related('home_person').first()
    if ring is None:
        return _err('Key ring not found.', 'NOT_FOUND', 404)
    if request.method == 'DELETE':
        ring.keys.update(ring=None)
        ring.is_archived = True
        ring.save(update_fields=['is_archived', 'updated_at'])
        return Response(status=204)
    if request.method == 'PATCH':
        data = request.data
        if 'name' in data:
            name = _text(data, 'name', 120)
            if not name:
                return _err('Give the ring a name.', 'NO_NAME')
            ring.name = name
        if 'notes' in data:
            ring.notes = str(data.get('notes') or '').strip()
        if 'home_location' in data:
            ring.home_location = _text(data, 'home_location', 160)
        if 'home_person' in data:
            try:
                ring.home_person = _person(data.get('home_person'))
            except KeysError as exc:
                return _err(exc.detail, exc.code)
        ring.save()
    moves = list(ring.moves.select_related('person', 'moved_by')[:100])
    keys_on = ring.keys.filter(is_archived=False).select_related('ring')
    payload = ring_payload(ring, last=moves[0] if moves else None)
    payload['keys'] = [key_payload(k) for k in keys_on]
    payload['moves'] = [_move_payload(m) for m in moves]
    return Response(payload)


@api_view(['POST'])
@permission_classes(OWNER)
def ring_move(request, pk):
    """Check a ring out (`kind=out`, with person, person_name or location) or back in (`kind=in`)."""
    ring = KeyRing.objects.filter(pk=pk, is_archived=False).select_related('home_person').first()
    if ring is None:
        return _err('Key ring not found.', 'NOT_FOUND', 404)
    data = request.data
    try:
        move = move_ring(
            ring, kind=str(data.get('kind') or ''), user=request.user, person=_person(data.get('person')),
            person_name=data.get('person_name') or '', location=data.get('location') or '', note=data.get('note') or '',
        )
    except KeysError as exc:
        return _err(exc.detail, exc.code)
    return Response(ring_payload(ring, last=move), status=201)


@api_view(['GET'])
@permission_classes(OWNER)
def where(request):
    """Where is everything: each ring with where it is now and its keys, then the keys on no ring."""
    rows = list(KeyRing.objects.filter(is_archived=False).select_related('home_person'))
    lasts = last_moves([r.pk for r in rows])
    by_ring: dict[int, list[dict]] = {}
    loose = []
    for key in Key.objects.filter(is_archived=False).select_related('ring'):
        if key.ring_id and not key.ring.is_archived:
            by_ring.setdefault(key.ring_id, []).append(key_payload(key))
        else:
            loose.append(key_payload(key))
    out = []
    for ring in rows:
        on = by_ring.get(ring.pk, [])
        out.append({**ring_payload(ring, last=lasts.get(ring.pk), key_count=len(on)), 'keys': on})
    return Response({'rings': out, 'loose_keys': loose})


@api_view(['POST'])
@permission_classes(OWNER)
@parser_classes([MultiPartParser, FormParser])
def find(request):
    """Find a key from a photo: its metrics, the 9 closest logged keys on a numbered grid, and the AI's pick."""
    try:
        raw = read_upload(request.FILES.get('photo'))
    except KeysError as exc:
        return _err(exc.detail, exc.code)
    try:
        result = search.find(raw)
    except ai.KeyAIError as exc:
        return _err(str(exc), 'AI_FAILED', 502)
    lasts = last_moves({c['key'].ring_id for c in result['candidates'] if c['key'].ring_id})
    candidates = [
        {'number': c['number'], 'score': c['score'], 'key': key_payload(
            c['key'], where=ring_where(c['key'].ring, lasts.get(c['key'].ring_id)) if c['key'].ring_id else None,
        )} for c in result['candidates']
    ]
    return Response({**result, 'candidates': candidates})


@api_view(['GET'])
@permission_classes(OWNER)
def people(request):
    """Staff to pick as a ring's home or holder."""
    users = User.objects.filter(is_active=True, groups__name__in=['Employee', 'Manager', 'Admin']).distinct()
    return Response({'people': [
        {'id': u.pk, 'name': u.full_name} for u in users.order_by('first_name', 'last_name')
    ]})
