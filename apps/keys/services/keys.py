"""Saving keys and rings, and where each one is. The views stay thin; the rules live here."""
from __future__ import annotations

import uuid

from django.core.files.base import ContentFile
from django.utils import timezone

from apps.inventory.services.receiving_photos import ReceivingPhotoError, prepare_high_res_and_thumb
from apps.keys.models import Key, KeyRing, KeyRingMove

from . import ai

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
METRIC_FIELDS = ('key_type', 'keyway', 'head_shape', 'brand', 'stamped_code', 'cut_count', 'cut_depths')


class KeysError(ValueError):
    def __init__(self, detail: str, code: str = 'INVALID'):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def read_upload(upload) -> bytes:
    raw = upload.read() if upload is not None else b''
    if not raw:
        raise KeysError('Add a photo of the key.', 'NO_PHOTO')
    if len(raw) > MAX_UPLOAD_BYTES:
        raise KeysError('That photo is over 25 MB.', 'TOO_BIG')
    return raw


def save_photo(key: Key, raw: bytes) -> None:
    """The photo at 2048 px and a 480 px thumbnail (the receiving photo pattern). Old files stay in storage."""
    try:
        high, thumb = prepare_high_res_and_thumb(raw)
    except ReceivingPhotoError as exc:
        raise KeysError('That file is not a photo we can read.', exc.code) from exc
    stem = uuid.uuid4().hex
    key.photo.save(f'{stem}.jpg', ContentFile(high), save=False)
    key.thumbnail.save(f'{stem}_thumb.jpg', ContentFile(thumb), save=False)


def apply_metrics(key: Key, metrics: dict, model: str) -> None:
    for field in METRIC_FIELDS:
        setattr(key, field, metrics.get(field) if field == 'cut_count' else (metrics.get(field) or ''))
    key.metrics_model = (model or '')[:80]
    key.metrics_at = timezone.now()


def read_key(key: Key, raw: bytes) -> str:
    """AI call 1 on the key's photo; the metrics are saved on the key. Returns '' or why it failed (the key is still
    saved: the metrics can be read again or typed)."""
    try:
        metrics, model = ai.read_metrics(raw)
    except ai.KeyAIError as exc:
        return str(exc)
    apply_metrics(key, metrics, model)
    return '' if metrics['is_key'] else 'The AI did not see a key in that photo.'


def ring_or_none(raw) -> KeyRing | None:
    if raw in (None, '', 'null'):
        return None
    ring = KeyRing.objects.filter(pk=raw, is_archived=False).first() if str(raw).isdigit() else None
    if ring is None:
        raise KeysError('That key ring was not found.', 'RING_NOT_FOUND')
    return ring


def clean_metric_edit(field: str, value):
    """A metric typed by hand."""
    if field == 'cut_count':
        if value in (None, ''):
            return None
        try:
            n = int(value)
        except (TypeError, ValueError):
            raise KeysError('Cuts must be a number.', 'BAD_CUTS')
        if not 0 <= n <= 12:
            raise KeysError('Cuts must be 0 to 12.', 'BAD_CUTS')
        return n
    text = ' '.join(str(value or '').split())
    if field == 'key_type':
        text = text.lower()
        if text and text not in ai.KEY_TYPES:
            raise KeysError('Pick a key type from the list.', 'BAD_TYPE')
    if field == 'keyway':
        text = text.upper()
    return text[:Key._meta.get_field(field).max_length]


def move_ring(ring: KeyRing, *, kind: str, user, person=None, person_name: str = '', location: str = '',
              note: str = '') -> KeyRingMove:
    if kind not in (KeyRingMove.OUT, KeyRingMove.IN):
        raise KeysError('Pick check out or check in.', 'BAD_KIND')
    person_name = ' '.join(str(person_name or '').split())[:120]
    location = ' '.join(str(location or '').split())[:160]
    if kind == KeyRingMove.OUT and person is None and not person_name and not location:
        raise KeysError('Say who has it or where it went.', 'NO_HOLDER')
    return KeyRingMove.objects.create(
        ring=ring, kind=kind, person=person, person_name=person_name, location=location,
        note=' '.join(str(note or '').split())[:255], moved_by=user, moved_at=timezone.now(),
    )


def _name(user) -> str:
    return user.full_name.strip() if user is not None else ''


def ring_where(ring: KeyRing, last: KeyRingMove | None) -> dict:
    """Where the ring is now: with whoever its last check-out named, else at home."""
    if last is not None and last.kind == KeyRingMove.OUT:
        return {
            'status': 'out', 'person': _name(last.person) or last.person_name, 'location': last.location,
            'since': last.moved_at.isoformat(), 'note': last.note,
        }
    return {
        'status': 'home', 'person': _name(ring.home_person), 'location': ring.home_location,
        'since': last.moved_at.isoformat() if last is not None else None, 'note': '',
    }


def last_moves(ring_ids) -> dict[int, KeyRingMove]:
    out: dict[int, KeyRingMove] = {}
    for move in KeyRingMove.objects.filter(ring_id__in=list(ring_ids)).select_related('person').order_by('-moved_at', '-id'):
        out.setdefault(move.ring_id, move)
    return out
