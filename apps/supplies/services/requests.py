""""We need ___" (owner, 2026-10-28): anyone on the team asks for a supply; a manager or the owner approves it onto a
list (it becomes an item, with min and max) or declines it with a reason. The requester sees the answer on Supplies.

A photo is kept at 2048 px (the receiving photo pattern), JPEG.
"""
from __future__ import annotations

import uuid

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from ..models import SupplyItem, SupplyList, SupplyRequest
from .csv_import import parse_row

MAX_PHOTO_BYTES = 25 * 1024 * 1024


class RequestError(ValueError):
    pass


def _save_photo(req: SupplyRequest, upload) -> None:
    from apps.inventory.services.receiving_photos import ReceivingPhotoError, prepare_high_res_and_thumb

    raw = upload.read()
    if not raw:
        return
    if len(raw) > MAX_PHOTO_BYTES:
        raise RequestError('That photo is over 25 MB.')
    try:
        high, _thumb = prepare_high_res_and_thumb(raw)
    except ReceivingPhotoError:
        raise RequestError('That file is not a photo we can read.') from None
    req.photo.save(f'{uuid.uuid4().hex}.jpg', ContentFile(high), save=False)


def create(*, user, name, url='', note='', list_id=None, photo=None) -> SupplyRequest:
    name = str(name or '').strip()
    if not name:
        raise RequestError('Say what we need.')
    url = str(url or '').strip()
    if url:
        try:
            url = parse_row({'name': name, 'url': url})['url']
        except ValueError as exc:
            raise RequestError(str(exc)) from None
    supply_list = None
    if list_id:
        supply_list = SupplyList.objects.filter(pk=list_id, is_active=True).first()
        if supply_list is None:
            raise RequestError('Pick a list from the choices.')
    req = SupplyRequest(name=name[:200], url=url, note=str(note or '').strip()[:500], supply_list=supply_list,
                        requested_by=user)
    if photo is not None:
        _save_photo(req, photo)
    req.save()
    return req


def approve(req: SupplyRequest, *, user, data: dict) -> SupplyRequest:
    """Add the item to a list. `data` has `list` and the item fields (`min_qty`, `max_qty` required)."""
    if req.status != SupplyRequest.STATUS_PENDING:
        raise RequestError('This request is already answered.')
    supply_list = SupplyList.objects.filter(pk=data.get('list') or 0, is_active=True).first()
    if supply_list is None:
        raise RequestError('Pick the list it goes on.')
    if data.get('min_qty') in (None, '') or data.get('max_qty') in (None, ''):
        raise RequestError('Give it a min and a max.')
    try:
        fields = parse_row({
            'name': data.get('name') or req.name, 'description': data.get('description'),
            'vendor': data.get('vendor'), 'vendor_url': data.get('vendor_url'),
            'url': data.get('url') if 'url' in data else req.url, 'vendor_item_id': data.get('vendor_item_id'),
            'pack_size': data.get('pack_size'), 'unit': data.get('unit'), 'min': data.get('min_qty'),
            'max': data.get('max_qty'), 'price': data.get('price'),
        })
    except ValueError as exc:
        raise RequestError(str(exc)) from None
    with transaction.atomic():
        last = supply_list.items.order_by('-sort_order').values_list('sort_order', flat=True).first() or 0
        item = SupplyItem.objects.create(supply_list=supply_list, sort_order=last + 1, **fields)
        req.status = SupplyRequest.STATUS_APPROVED
        req.supply_list = supply_list
        req.item = item
        req.decided_by = user
        req.decided_at = timezone.now()
        req.save()
    return req


def decline(req: SupplyRequest, *, user, reason) -> SupplyRequest:
    if req.status != SupplyRequest.STATUS_PENDING:
        raise RequestError('This request is already answered.')
    reason = str(reason or '').strip()
    if not reason:
        raise RequestError('Say why, so they know.')
    req.status = SupplyRequest.STATUS_DECLINED
    req.decline_reason = reason[:500]
    req.decided_by = user
    req.decided_at = timezone.now()
    req.save()
    return req


def _who(user) -> str:
    return (user.full_name or user.email) if user else ''


def payload(req: SupplyRequest) -> dict:
    try:
        photo_url = req.photo.url if req.photo else None
    except Exception:  # noqa: BLE001 - a storage hiccup never hides the request
        photo_url = None
    return {
        'id': req.pk,
        'name': req.name,
        'url': req.url,
        'note': req.note,
        'photo_url': photo_url,
        'list': req.supply_list_id,
        'list_name': req.supply_list.name if req.supply_list_id else '',
        'requested_by': _who(req.requested_by),
        'requested_by_id': req.requested_by_id,
        'created_at': req.created_at.isoformat(),
        'status': req.status,
        'decided_by': _who(req.decided_by),
        'decided_at': req.decided_at.isoformat() if req.decided_at else None,
        'decline_reason': req.decline_reason,
        'item': req.item_id,
    }
