"""The phone site's store feeds: plain Django views, anonymous, no throttle (a throttle check is a database round trip
here, and these answer from memory).

- ``stock.json`` / ``home.json``: the snapshot in memory (``services/holder.py``). A warm request runs no query.
- ``item/<pid>/``: one product, live (at most 5 queries), kept 60 seconds per worker.
- ``photo/<pid>/``: a stable link that 302s to the product's photo-sheet or stock photo (a presigned S3 link lasts
  an hour). Never an Add item photo.
"""
from __future__ import annotations

import json
import logging
import threading
import time

from django.http import Http404, HttpResponse, HttpResponseNotModified, HttpResponseRedirect, JsonResponse
from django.views.decorators.http import require_safe

from apps.storefront.services import item as item_service
from apps.storefront.services.holder import holder

logger = logging.getLogger(__name__)

FEED_CACHE = 'public, max-age=120, stale-while-revalidate=300'
ITEM_CACHE = 'public, max-age=60'
PHOTO_CACHE = 'public, max-age=300'


def _accepts_gzip(request) -> bool:
    for part in request.META.get('HTTP_ACCEPT_ENCODING', '').split(','):
        bits = [b.strip().lower() for b in part.split(';')]
        if bits[0] not in ('gzip', '*'):
            continue
        q = 1.0
        for b in bits[1:]:
            if b.startswith('q='):
                try:
                    q = float(b[2:])
                except ValueError:
                    q = 0.0
        if q > 0:
            return True
    return False


def _matches(request, etag: str) -> bool:
    header = request.META.get('HTTP_IF_NONE_MATCH', '')
    if not header:
        return False
    if header.strip() == '*':
        return True
    tags = [t.strip() for t in header.split(',')]
    return any((t[2:] if t.startswith('W/') else t) == etag for t in tags)


def _feed(request, which: str):
    try:
        built = holder.get()
    except Exception:
        logger.exception('storefront: first snapshot build failed')
        response = JsonResponse({'detail': 'The store list is loading. Try again in a moment.'}, status=503)
        response['Retry-After'] = '5'
        response['Cache-Control'] = 'no-store'
        return response
    enc = built.stock if which == 'stock' else built.home
    if _matches(request, enc.etag):
        response = HttpResponseNotModified()
    else:
        gz = _accepts_gzip(request)
        response = HttpResponse(enc.gz if gz else enc.raw, content_type='application/json')
        if gz:
            response['Content-Encoding'] = 'gzip'
    response['ETag'] = enc.etag
    response['Vary'] = 'Accept-Encoding'
    response['Cache-Control'] = FEED_CACHE
    return response


@require_safe
def stock(request):
    return _feed(request, 'stock')


@require_safe
def home(request):
    return _feed(request, 'home')


# ── One product, live ─────────────────────────────────────────────────────────

ITEM_SECONDS = 60
ITEM_MAX = 5000
_items: dict[int, tuple[float, bytes | None]] = {}
_items_lock = threading.Lock()


def _item_bytes(pid: int) -> bytes | None:
    now = time.monotonic()
    hit = _items.get(pid)
    if hit is not None and hit[0] > now:
        return hit[1]
    payload = item_service.product_payload(pid)
    body = None if payload is None else json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    with _items_lock:
        if len(_items) >= ITEM_MAX:
            _items.clear()
        _items[pid] = (now + ITEM_SECONDS, body)
    return body


def clear_item_cache() -> None:
    with _items_lock:
        _items.clear()


@require_safe
def item(request, pid: int):
    body = _item_bytes(pid)
    if body is None:
        response = JsonResponse({'detail': 'Not on the shelf.'}, status=404)
    else:
        response = HttpResponse(body, content_type='application/json')
    response['Cache-Control'] = ITEM_CACHE
    return response


# ── A product's photo ─────────────────────────────────────────────────────────

@require_safe
def photo(request, pid: int):
    """A stable address that 302s to the product's public photo: its photo-sheet photo, else a found or approved stock
    photo (``services/photos.py``). Never an Add item photo or any other photo taken for another purpose
    (owner 2026-11-19): anything else answers 404."""
    from django.core.files.storage import default_storage

    from apps.storefront.services.photos import public_file

    name = public_file(pid)
    if not name:
        raise Http404('No photo.')
    try:
        url = default_storage.url(name)
    except Exception:
        logger.exception('storefront: no address for photo of product %s', pid)
        raise Http404('No photo.')
    response = HttpResponseRedirect(url)
    response['Cache-Control'] = PHOTO_CACHE
    return response
