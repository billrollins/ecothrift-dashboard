"""Geocode delivery destinations and plan routes via Google Routes API.

Primary geocoder: US Census Bureau (free, strong for US street addresses).
Fallback: OpenStreetMap Nominatim when Census returns no match.

Route planning uses Routes API (computeRoutes / computeRouteMatrix).
Legacy Directions and Distance Matrix are not called.
"""

from __future__ import annotations

import json
import logging
import math
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone as dt_timezone
from decimal import Decimal
from typing import Any

logger = logging.getLogger(__name__)

# 8425 West Center Road, Omaha NE 68124
STORE_LAT = 41.2341862
STORE_LON = -96.0436631
STORE_LABEL = 'Eco-Thrift - 8425 West Center Road, Omaha NE 68124'
# Stable address string for Maps URLs / Directions (matches Deliveries board).
STORE_MAPS_ADDRESS = '8425 West Center Road, Omaha, NE 68124'
# google.com/maps/dir allows up to 9 waypoints when origin + destination are set.
MAX_MAPS_WAYPOINTS = 9
# Routes API intermediate waypoint cap (optimizeWaypointOrder still capped lower by Google).
MAX_ROUTE_WAYPOINTS = 25

ROUTES_COMPUTE_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes'
ROUTES_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix'
# Assumed on-site service time between deliveries when estimating ETAs.
# Prefer get_delivery_service_seconds() at call sites; constant is the fallback default.
SERVICE_SECONDS_PER_STOP = 20 * 60

CENSUS_ONELINE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'EcoThriftDashboard/1.0 (pos-delivery; local staff tool)'
REQUEST_TIMEOUT_S = 12

TIER_5MI_FEE = Decimal('50.00')
TIER_10MI_FEE = Decimal('75.00')
MAX_DELIVERY_MILES = Decimal('10')

PROVIDER_GOOGLE_ROUTES = 'google_routes'


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in miles."""
    r = 3958.7613  # Earth radius miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def tier_for_miles(miles: float | Decimal) -> dict[str, Any]:
    m = Decimal(str(miles)).quantize(Decimal('0.01'))
    if m <= Decimal('5'):
        return {
            'tier': '5mi',
            'fee': str(TIER_5MI_FEE),
            'too_far': False,
            'distance_miles': str(m),
        }
    if m <= MAX_DELIVERY_MILES:
        return {
            'tier': '10mi',
            'fee': str(TIER_10MI_FEE),
            'too_far': False,
            'distance_miles': str(m),
        }
    return {
        'tier': None,
        'fee': None,
        'too_far': True,
        'distance_miles': str(m),
    }


def _http_get_json(url: str, *, headers: dict[str, str] | None = None) -> Any:
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError) as exc:
        logger.warning('Geocode HTTP failed (%s): %s', url.split('?', 1)[0], exc)
        raise RuntimeError('Address lookup is temporarily unavailable.') from exc


def _http_post_json(
    url: str,
    body: dict[str, Any],
    *,
    headers: dict[str, str] | None = None,
) -> tuple[Any, int | None, str | None]:
    """POST JSON; return (parsed_body_or_None, http_status_or_None, error_detail)."""
    data = json.dumps(body).encode('utf-8')
    req = urllib.request.Request(
        url,
        data=data,
        method='POST',
        headers={
            'User-Agent': USER_AGENT,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_S) as resp:
            raw = resp.read().decode('utf-8')
            status = getattr(resp, 'status', None) or 200
            if not raw.strip():
                return None, status, 'empty_body'
            try:
                return json.loads(raw), status, None
            except json.JSONDecodeError as exc:
                return None, status, f'parse_failed:{exc}'
    except urllib.error.HTTPError as exc:
        detail = ''
        try:
            payload = json.loads(exc.read().decode('utf-8'))
            if isinstance(payload, dict):
                err = payload.get('error') or {}
                if isinstance(err, dict):
                    status_text = str(err.get('status') or '').strip()
                    message = str(err.get('message') or '').strip()
                    if status_text and message:
                        detail = f'{status_text}: {message}'[:240]
                    else:
                        detail = (status_text or message or '')[:240]
                else:
                    detail = str(payload)[:240]
        except Exception:  # noqa: BLE001
            detail = str(exc.reason or '')[:240]
        logger.warning('Routes HTTP %s (%s): %s', exc.code, url.split('?', 1)[0], detail)
        return None, exc.code, detail or f'http_{exc.code}'
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.warning('Routes HTTP failed (%s): %s', url.split('?', 1)[0], exc)
        return None, None, 'network_error'


def _parse_duration_seconds(value: Any) -> int | None:
    """Parse Routes API duration strings like '1234s' or numeric seconds."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, dict):
        # Rare proto-json form: {"seconds": "1234"}
        if 'seconds' in value:
            try:
                return int(value['seconds'])
            except (TypeError, ValueError):
                return None
        return None
    text = str(value).strip()
    if text.endswith('s'):
        text = text[:-1]
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _maps_api_key() -> str:
    from django.conf import settings

    return (getattr(settings, 'GOOGLE_MAPS_API_KEY', None) or '').strip()


def _waypoint_payload(address_or_latlng: str) -> dict[str, Any]:
    """Build a Routes API waypoint from an address string or 'lat,lng' pair."""
    text = (address_or_latlng or '').strip()
    if ',' in text:
        parts = [p.strip() for p in text.split(',')]
        if len(parts) == 2:
            try:
                lat = float(parts[0])
                lon = float(parts[1])
                return {'location': {'latLng': {'latitude': lat, 'longitude': lon}}}
            except ValueError:
                pass
    return {'address': text}


def _departure_rfc3339_or_none(start_at) -> str | None:
    """RFC3339 UTC departure, or None when not safely in the future.

    Routes rejects any departureTime that has already occurred. When we do not
    have a future departure (already departed, missing, or "now"), omit the
    field entirely so Google defaults to request time.
    """
    if start_at is None:
        return None
    now = datetime.now(dt_timezone.utc)
    dt = start_at
    if timezone_is_naive(dt):
        dt = dt.replace(tzinfo=dt_timezone.utc)
    else:
        dt = dt.astimezone(dt_timezone.utc)
    if dt < now + timedelta(seconds=60):
        return None
    return dt.isoformat().replace('+00:00', 'Z')


def timezone_is_naive(dt) -> bool:
    return getattr(dt, 'tzinfo', None) is None or dt.tzinfo.utcoffset(dt) is None


def _normalize_query(query: str) -> str:
    q = (query or '').strip()
    lower = q.lower()
    if 'omaha' not in lower and 'ne' not in lower and 'nebraska' not in lower:
        return f'{q}, Omaha, NE'
    return q


def _google_driving_miles(dest_lat: float, dest_lon: float) -> tuple[float, str] | None:
    """Return (miles, 'driving') via Routes computeRouteMatrix, or None if unavailable."""
    key = _maps_api_key()
    if not key:
        return None

    body = {
        'origins': [
            {
                'waypoint': {
                    'location': {
                        'latLng': {'latitude': STORE_LAT, 'longitude': STORE_LON}
                    }
                }
            }
        ],
        'destinations': [
            {
                'waypoint': {
                    'location': {
                        'latLng': {'latitude': dest_lat, 'longitude': dest_lon}
                    }
                }
            }
        ],
        'travelMode': 'DRIVE',
        'routingPreference': 'TRAFFIC_AWARE',
    }
    data, status, detail = _http_post_json(
        ROUTES_MATRIX_URL,
        body,
        headers={
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,duration,status',
        },
    )
    if data is None:
        logger.warning('Route matrix distance quote failed: %s %s', status, detail)
        return None

    # Matrix may return a list of elements or {"elements": [...]} depending on shape.
    rows = data if isinstance(data, list) else (data.get('elements') if isinstance(data, dict) else None)
    if not isinstance(rows, list) or not rows:
        return None
    element = rows[0]
    if not isinstance(element, dict):
        return None
    el_status = element.get('status')
    if isinstance(el_status, dict) and el_status.get('code') not in (None, 0, 'OK'):
        return None
    meters = element.get('distanceMeters')
    try:
        return float(meters) / 1609.344, 'driving'
    except (TypeError, ValueError):
        return None


def _distance_quote(lat: float, lon: float) -> dict[str, Any]:
    """Prefer Google driving miles when configured; else straight-line (crow flies)."""
    driving = _google_driving_miles(lat, lon)
    if driving is not None:
        miles, mode = driving
        quote = tier_for_miles(miles)
        quote['distance_mode'] = mode
        return quote
    miles = haversine_miles(STORE_LAT, STORE_LON, lat, lon)
    quote = tier_for_miles(miles)
    quote['distance_mode'] = 'straight_line'
    return quote


def _candidate(
    *,
    display_name: str,
    address_line: str,
    city: str,
    state: str,
    postcode: str,
    lat: float,
    lon: float,
) -> dict[str, Any]:
    quote = _distance_quote(lat, lon)
    return {
        'display_name': display_name,
        'address_line': address_line,
        'city': city,
        'state': state,
        'postcode': postcode,
        'lat': lat,
        'lon': lon,
        'store_label': STORE_LABEL,
        **quote,
    }


def _census_suggest(query: str) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode(
        {
            'address': query,
            'benchmark': 'Public_AR_Current',
            'format': 'json',
        }
    )
    data = _http_get_json(f'{CENSUS_ONELINE}?{params}')
    matches = (
        data.get('result', {}).get('addressMatches', [])
        if isinstance(data, dict)
        else []
    )
    if not isinstance(matches, list):
        return []

    out: list[dict[str, Any]] = []
    for match in matches[:5]:
        if not isinstance(match, dict):
            continue
        coords = match.get('coordinates') or {}
        try:
            # Census uses x=lon, y=lat
            lon = float(coords['x'])
            lat = float(coords['y'])
        except (KeyError, TypeError, ValueError):
            continue

        matched = str(match.get('matchedAddress') or '').strip()
        components = match.get('addressComponents') or {}
        # Prefer the matched house+street from matchedAddress (fromAddress/toAddress are segment ranges).
        address_line = matched.split(',')[0].strip() if matched else ''
        if not address_line:
            house = str(components.get('fromAddress') or '').strip()
            road_bits = [
                str(components.get('preDirection') or '').strip(),
                str(components.get('streetName') or '').strip(),
                str(components.get('suffixType') or '').strip(),
                str(components.get('suffixDirection') or '').strip(),
            ]
            road = ' '.join(b for b in road_bits if b)
            address_line = f'{house} {road}'.strip()

        out.append(
            _candidate(
                display_name=matched or address_line,
                address_line=address_line or matched,
                city=str(components.get('city') or 'OMAHA'),
                state=str(components.get('state') or 'NE'),
                postcode=str(components.get('zip') or ''),
                lat=lat,
                lon=lon,
            )
        )
    return out


def _nominatim_suggest(query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode(
        {
            'q': query,
            'format': 'json',
            'addressdetails': '1',
            'limit': str(max(1, min(limit, 8))),
            'countrycodes': 'us',
        }
    )
    rows = _http_get_json(f'{NOMINATIM_SEARCH}?{params}')
    if not isinstance(rows, list):
        return []

    out: list[dict[str, Any]] = []
    for row in rows:
        try:
            lat = float(row['lat'])
            lon = float(row['lon'])
        except (KeyError, TypeError, ValueError):
            continue
        display = str(row.get('display_name') or '').strip()
        addr = row.get('address') if isinstance(row.get('address'), dict) else {}
        street_line = _format_street_line(addr) or display.split(',')[0].strip()
        out.append(
            _candidate(
                display_name=display,
                address_line=street_line,
                city=str(addr.get('city') or addr.get('town') or addr.get('village') or 'Omaha'),
                state=str(addr.get('state') or 'Nebraska'),
                postcode=str(addr.get('postcode') or ''),
                lat=lat,
                lon=lon,
            )
        )
    return out


def suggest_addresses(query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    """Return address candidates with distance/tier to the store."""
    q = (query or '').strip()
    if len(q) < 3:
        return []

    search_q = _normalize_query(q)
    last_error: Exception | None = None

    try:
        census = _census_suggest(search_q)
        if census:
            return census[:limit]
    except RuntimeError as exc:
        last_error = exc

    try:
        nomi = _nominatim_suggest(search_q, limit=limit)
        if nomi:
            return nomi[:limit]
    except RuntimeError as exc:
        last_error = exc

    if last_error is not None:
        raise last_error
    return []


def quote_coordinates(lat: float, lon: float) -> dict[str, Any]:
    return {
        'store_label': STORE_LABEL,
        'store_lat': STORE_LAT,
        'store_lon': STORE_LON,
        **_distance_quote(lat, lon),
    }


def build_google_maps_route_url(stops: list[str]) -> str | None:
    """Store → customer stops → store. Caps at MAX_MAPS_WAYPOINTS customers."""
    cleaned = [s.strip() for s in stops if (s or '').strip()]
    if not cleaned:
        return None
    capped = cleaned[:MAX_MAPS_WAYPOINTS]
    origin = urllib.parse.quote(STORE_MAPS_ADDRESS)
    destination = urllib.parse.quote(STORE_MAPS_ADDRESS)
    url = (
        'https://www.google.com/maps/dir/?api=1'
        f'&origin={origin}'
        f'&destination={destination}'
        '&travelmode=driving'
    )
    if capped:
        waypoints = '%7C'.join(urllib.parse.quote(s) for s in capped)
        url += f'&waypoints={waypoints}'
    return url


def _routes_api_route(
    addresses: list[str],
    *,
    origin: str,
    destination: str,
    optimize: bool,
    departure_at=None,
) -> tuple[dict[str, Any] | None, str | None]:
    """Call computeRoutes. Returns (normalized_route, fallback_reason)."""
    cleaned = [s.strip() for s in addresses if (s or '').strip()]
    if not cleaned:
        return None, 'too_few_stops'

    key = _maps_api_key()
    if not key:
        return None, 'no_key'

    capped = cleaned[:MAX_ROUTE_WAYPOINTS]
    optimize_order = bool(optimize and len(capped) >= 2)
    body: dict[str, Any] = {
        'origin': _waypoint_payload(origin),
        'destination': _waypoint_payload(destination),
        'intermediates': [_waypoint_payload(a) for a in capped],
        'travelMode': 'DRIVE',
        'routingPreference': 'TRAFFIC_AWARE',
    }
    departure = _departure_rfc3339_or_none(departure_at)
    if departure:
        body['departureTime'] = departure
    if optimize_order:
        body['optimizeWaypointOrder'] = True

    field_mask = (
        'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,'
        'routes.legs.duration,routes.legs.distanceMeters'
    )
    if optimize_order:
        field_mask += ',routes.optimizedIntermediateWaypointIndex'

    data, status, detail = _http_post_json(
        ROUTES_COMPUTE_URL,
        body,
        headers={
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': field_mask,
        },
    )
    if data is None:
        if status in (401, 403):
            return None, f'http_{status}'
        if detail:
            return None, detail if detail.startswith('http_') else f'http_{status or "err"}:{detail}'[:80]
        return None, f'http_{status or "err"}'

    try:
        route = data['routes'][0]
    except (KeyError, IndexError, TypeError):
        return None, 'parse_failed'

    if not isinstance(route, dict):
        return None, 'parse_failed'

    # Normalize to the shape plan_delivery_route_with_etas already expects.
    legs_out = []
    for leg in route.get('legs') or []:
        if not isinstance(leg, dict):
            continue
        legs_out.append(
            {
                'duration': {'value': _parse_duration_seconds(leg.get('duration'))},
                'distance': {'value': leg.get('distanceMeters')},
            }
        )

    waypoint_order = route.get('optimizedIntermediateWaypointIndex')
    if not isinstance(waypoint_order, list):
        waypoint_order = None

    polyline = route.get('polyline')
    encoded = polyline.get('encodedPolyline') if isinstance(polyline, dict) else None

    return {
        'legs': legs_out,
        'waypoint_order': waypoint_order,
        'duration': _parse_duration_seconds(route.get('duration')),
        'distanceMeters': route.get('distanceMeters'),
        'polyline': str(encoded) if encoded else None,
        'capped_count': len(capped),
    }, None


def compute_route_matrix(
    origins: list[str],
    destinations: list[str],
    *,
    departure_at=None,
) -> tuple[list[list[int | None]] | None, str | None]:
    """Return duration matrix [origin_i][dest_j] in seconds, or (None, reason)."""
    o_clean = [s.strip() for s in origins if (s or '').strip()]
    d_clean = [s.strip() for s in destinations if (s or '').strip()]
    if not o_clean or not d_clean:
        return None, 'too_few_stops'

    key = _maps_api_key()
    if not key:
        return None, 'no_key'

    body: dict[str, Any] = {
        'origins': [{'waypoint': _waypoint_payload(a)} for a in o_clean],
        'destinations': [{'waypoint': _waypoint_payload(a)} for a in d_clean],
        'travelMode': 'DRIVE',
        'routingPreference': 'TRAFFIC_AWARE',
    }
    departure = _departure_rfc3339_or_none(departure_at)
    if departure:
        body['departureTime'] = departure
    data, status, detail = _http_post_json(
        ROUTES_MATRIX_URL,
        body,
        headers={
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'originIndex,destinationIndex,duration,distanceMeters,status',
        },
    )
    if data is None:
        return None, detail or f'http_{status or "err"}'

    elements = data if isinstance(data, list) else (data.get('elements') if isinstance(data, dict) else None)
    if not isinstance(elements, list):
        return None, 'parse_failed'

    matrix: list[list[int | None]] = [[None] * len(d_clean) for _ in o_clean]
    for el in elements:
        if not isinstance(el, dict):
            continue
        try:
            oi = int(el.get('originIndex', 0))
            di = int(el.get('destinationIndex', 0))
        except (TypeError, ValueError):
            continue
        if not (0 <= oi < len(o_clean) and 0 <= di < len(d_clean)):
            continue
        el_status = el.get('status')
        if isinstance(el_status, dict) and el_status.get('code') not in (None, 0, 'OK'):
            continue
        matrix[oi][di] = _parse_duration_seconds(el.get('duration'))
    return matrix, None


def optimize_delivery_stop_order(stops: list[str]) -> tuple[list[str], bool]:
    """Reorder stops for fastest drive via Routes optimizeWaypointOrder.

    Returns (ordered_stops, optimized). Passthrough when key missing, <2 stops,
    or Google fails.
    """
    cleaned = [s.strip() for s in stops if (s or '').strip()]
    if len(cleaned) < 2:
        return cleaned, False

    store = f'{STORE_LAT},{STORE_LON}'
    route, _reason = _routes_api_route(
        cleaned,
        origin=store,
        destination=store,
        optimize=True,
    )
    if not route:
        return cleaned, False

    order = route.get('waypoint_order')
    capped_n = int(route.get('capped_count') or min(len(cleaned), MAX_ROUTE_WAYPOINTS))
    if not isinstance(order, list) or len(order) != capped_n:
        return cleaned, False

    try:
        reordered = [cleaned[int(i)] for i in order]
    except (ValueError, TypeError, IndexError):
        return cleaned, False

    if len(cleaned) > capped_n:
        return reordered + cleaned[capped_n:], True
    return reordered, True


def build_optimized_delivery_route(addresses: list[str]) -> dict[str, Any]:
    """Optimize stop order (when possible) and build a store→stops→store Maps URL."""
    cleaned = [s.strip() for s in (addresses or []) if (s or '').strip()]
    ordered, optimized = optimize_delivery_stop_order(cleaned)
    for_url = ordered[:MAX_MAPS_WAYPOINTS]
    maps_url = build_google_maps_route_url(for_url)
    return {
        'ordered_addresses': ordered,
        'optimized': optimized,
        'maps_url': maps_url,
        'waypoint_cap': MAX_MAPS_WAYPOINTS,
        'truncated': max(0, len(ordered) - MAX_MAPS_WAYPOINTS),
        'store_address': STORE_MAPS_ADDRESS,
    }


def _service_seconds() -> int:
    try:
        from apps.pos.services.delivery_settings import get_delivery_service_seconds

        return get_delivery_service_seconds()
    except Exception:  # noqa: BLE001 - settings layer must never break routing
        return SERVICE_SECONDS_PER_STOP


def plan_delivery_route_with_etas(
    addresses: list[str],
    *,
    origin_address: str | None = None,
    optimize: bool = True,
    start_at=None,
    service_seconds: int | None = None,
) -> dict[str, Any]:
    """Plan stop order + ETA windows (drive time + service allowance).

    Returns ordered addresses, order_indices into the *input* list, etas with
    timezone-aware datetimes, maps_url, and optimized flag. When Google is
    unavailable, keeps input order and returns empty etas (not fabricated).
    """
    from django.utils import timezone as dj_tz

    cleaned = [s.strip() for s in (addresses or []) if (s or '').strip()]
    start = start_at or dj_tz.now()
    origin = (origin_address or '').strip() or f'{STORE_LAT},{STORE_LON}'
    destination = f'{STORE_LAT},{STORE_LON}'
    svc = int(service_seconds) if service_seconds is not None else _service_seconds()

    empty = {
        'ordered_addresses': [],
        'order_indices': [],
        'optimized': False,
        'maps_url': build_google_maps_route_url([]),
        'etas': [],
        'etas_available': False,
        'store_address': STORE_MAPS_ADDRESS,
        'service_seconds_per_stop': svc,
        'provider': None,
        'fallback_reason': 'too_few_stops',
        'total_drive_seconds': None,
        'total_distance_meters': None,
        'return_drive_seconds': None,
        'return_distance_meters': None,
        'total_service_seconds': 0,
        'total_eta_seconds': None,
        'estimated_finish_at': None,
        'truncated': 0,
        'waypoint_cap': MAX_MAPS_WAYPOINTS,
        'route_waypoint_cap': MAX_ROUTE_WAYPOINTS,
        'polyline': None,
    }
    if not cleaned:
        return empty

    route, fallback_reason = _routes_api_route(
        cleaned,
        origin=origin,
        destination=destination,
        optimize=optimize and len(cleaned) >= 2,
        departure_at=start,
    )

    order_indices = list(range(len(cleaned)))
    optimized = False
    if route and optimize and len(cleaned) >= 2:
        raw_order = route.get('waypoint_order')
        capped_n = int(route.get('capped_count') or min(len(cleaned), MAX_ROUTE_WAYPOINTS))
        if isinstance(raw_order, list) and len(raw_order) == capped_n:
            try:
                order_indices = [int(i) for i in raw_order]
                if len(cleaned) > capped_n:
                    order_indices.extend(range(capped_n, len(cleaned)))
                optimized = True
            except (TypeError, ValueError):
                order_indices = list(range(len(cleaned)))
                optimized = False

    ordered = [cleaned[i] for i in order_indices if 0 <= i < len(cleaned)]
    etas: list[dict[str, Any]] = []
    etas_available = False
    total_drive_seconds = 0
    total_distance_meters = 0
    return_drive_seconds = None
    return_distance_meters = None
    provider = PROVIDER_GOOGLE_ROUTES if route else None

    if route:
        legs = route.get('legs') or []
        for leg in legs:
            try:
                drive_v = leg['duration']['value']
                if drive_v is not None:
                    total_drive_seconds += int(drive_v)
            except (KeyError, TypeError, ValueError):
                pass
            try:
                dist_v = leg['distance']['value']
                if dist_v is not None:
                    total_distance_meters += int(dist_v)
            except (KeyError, TypeError, ValueError):
                pass
        if len(legs) > len(ordered):
            try:
                return_drive_seconds = int(legs[len(ordered)]['duration']['value'])
            except (KeyError, TypeError, ValueError):
                pass
            try:
                return_distance_meters = int(legs[len(ordered)]['distance']['value'])
            except (KeyError, TypeError, ValueError):
                pass

        # legs: origin→stop1, stop1→stop2, ..., last→destination(store)
        cursor = start
        for idx in range(len(ordered)):
            drive = None
            if idx < len(legs):
                try:
                    drive = legs[idx]['duration']['value']
                    drive = int(drive) if drive is not None else None
                except (KeyError, TypeError, ValueError):
                    drive = None
            if drive is None:
                etas.append(
                    {
                        'arrive_at': None,
                        'window_end_at': None,
                        'drive_seconds': None,
                    }
                )
                continue
            etas_available = True
            arrive = cursor + timedelta(seconds=drive)
            window_end = arrive + timedelta(seconds=svc)
            etas.append(
                {
                    'arrive_at': arrive,
                    'window_end_at': window_end,
                    'drive_seconds': drive,
                }
            )
            cursor = window_end
    elif fallback_reason is None:
        fallback_reason = 'parse_failed'

    maps_url = build_google_maps_route_url(ordered)
    total_service_seconds = svc * len(ordered)
    total_eta_seconds = (
        total_drive_seconds + total_service_seconds if route else None
    )
    return {
        'ordered_addresses': ordered,
        'order_indices': order_indices,
        'optimized': optimized,
        'maps_url': maps_url,
        'etas': etas,
        'etas_available': etas_available,
        'store_address': STORE_MAPS_ADDRESS,
        'service_seconds_per_stop': svc,
        'provider': provider,
        'fallback_reason': None if route else fallback_reason,
        'total_drive_seconds': total_drive_seconds if route else None,
        'total_distance_meters': total_distance_meters if route else None,
        'return_drive_seconds': return_drive_seconds,
        'return_distance_meters': return_distance_meters,
        'total_service_seconds': total_service_seconds,
        'total_eta_seconds': total_eta_seconds,
        'estimated_finish_at': (
            start + timedelta(seconds=total_eta_seconds)
            if total_eta_seconds is not None
            else None
        ),
        'truncated': max(0, len(cleaned) - MAX_MAPS_WAYPOINTS),
        'waypoint_cap': MAX_MAPS_WAYPOINTS,
        'route_waypoint_cap': MAX_ROUTE_WAYPOINTS,
        # Encoded geometry for the static route map; None when Google was unavailable.
        'polyline': (route or {}).get('polyline'),
    }


def _format_street_line(addr: dict[str, Any]) -> str:
    house = str(addr.get('house_number') or '').strip()
    road = str(addr.get('road') or addr.get('pedestrian') or '').strip()
    if house and road:
        return f'{house} {road}'
    return road or house
