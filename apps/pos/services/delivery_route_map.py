"""Server-rendered Google Static Maps route images.

Rendering server-side keeps `GOOGLE_MAPS_API_KEY` out of the browser and lets us
cache identical requests for the whole crew instead of once per phone.
"""

from __future__ import annotations

import hashlib
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.core.cache import cache

logger = logging.getLogger(__name__)

STATIC_MAP_URL = 'https://maps.googleapis.com/maps/api/staticmap'
REQUEST_TIMEOUT_S = 8
CACHE_TTL_S = 600
# Static Maps rejects URLs past 16384 chars; leave room for markers and params.
MAX_URL_CHARS = 15000
# Marker labels must be a single alphanumeric character.
MARKER_LABELS = '123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
MAX_SIZE_PX = 640


def _marker_label(index: int) -> str:
    return MARKER_LABELS[index] if index < len(MARKER_LABELS) else '•'


def build_static_map_url(
    *,
    key: str,
    stop_addresses: list[str],
    store_address: str,
    polyline: str | None,
    width: int,
    height: int,
    scale: int = 2,
) -> str | None:
    """Static Maps URL for a route, or None when there is nothing to draw."""
    stops = [a.strip() for a in stop_addresses if (a or '').strip()]
    if not stops:
        return None

    params: list[tuple[str, str]] = [
        ('size', f'{min(width, MAX_SIZE_PX)}x{min(height, MAX_SIZE_PX)}'),
        ('scale', str(scale)),
        ('maptype', 'roadmap'),
        ('format', 'png'),
        # Strip Google's default POI clutter so stops and the route read clearly.
        ('style', 'feature:poi|visibility:off'),
        ('style', 'feature:transit|visibility:off'),
    ]
    if store_address:
        params.append(('markers', f'size:mid|color:0x0E8A4E|label:S|{store_address}'))
    for index, address in enumerate(stops):
        params.append(
            ('markers', f'size:mid|color:0x11241B|label:{_marker_label(index)}|{address}')
        )
    if polyline:
        params.append(('path', f'color:0x0E8A4EAA|weight:4|enc:{polyline}'))
    params.append(('key', key))

    url = f'{STATIC_MAP_URL}?{urllib.parse.urlencode(params)}'
    if len(url) > MAX_URL_CHARS and polyline:
        # Markers still tell the truth about where the stops are; drop the geometry.
        return build_static_map_url(
            key=key,
            stop_addresses=stops,
            store_address=store_address,
            polyline=None,
            width=width,
            height=height,
            scale=scale,
        )
    return url if len(url) <= MAX_URL_CHARS else None


def fetch_route_map_png(
    *,
    stop_addresses: list[str],
    store_address: str,
    polyline: str | None = None,
    width: int = 640,
    height: int = 360,
) -> bytes | None:
    """Fetch (and cache) the static map PNG. None when unavailable."""
    from django.conf import settings

    key = (getattr(settings, 'GOOGLE_MAPS_API_KEY', None) or '').strip()
    if not key:
        return None

    url = build_static_map_url(
        key=key,
        stop_addresses=stop_addresses,
        store_address=store_address,
        polyline=polyline,
        width=width,
        height=height,
    )
    if not url:
        return None

    cache_key = f'delivery_route_map:{hashlib.sha256(url.encode("utf-8")).hexdigest()}'
    cached = cache.get(cache_key)
    if cached is not None:
        return cached or None

    try:
        with urllib.request.urlopen(url, timeout=REQUEST_TIMEOUT_S) as resp:
            content = resp.read()
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning('Static map fetch failed: %s', exc)
        # Cache the miss briefly so a dead key does not hammer Google per render.
        cache.set(cache_key, b'', 60)
        return None

    if not content:
        return None
    cache.set(cache_key, content, CACHE_TTL_S)
    return content
