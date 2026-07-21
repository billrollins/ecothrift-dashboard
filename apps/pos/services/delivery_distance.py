"""Geocode delivery destinations and distance to Eco-Thrift Canfield store.

Primary geocoder: US Census Bureau (free, strong for US street addresses).
Fallback: OpenStreetMap Nominatim when Census returns no match.
"""

from __future__ import annotations

import json
import logging
import math
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta
from decimal import Decimal
from typing import Any

logger = logging.getLogger(__name__)

# 8425 West Center Road, Omaha NE 68124
STORE_LAT = 41.2341862
STORE_LON = -96.0436631
STORE_LABEL = 'Eco-Thrift — 8425 West Center Road, Omaha NE 68124'
# Stable address string for Maps URLs / Directions (matches Deliveries board).
STORE_MAPS_ADDRESS = '8425 West Center Road, Omaha, NE 68124'
# google.com/maps/dir allows up to 9 waypoints when origin + destination are set.
MAX_MAPS_WAYPOINTS = 9
DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json'
# Assumed on-site service time between deliveries when estimating ETAs.
SERVICE_SECONDS_PER_STOP = 20 * 60

CENSUS_ONELINE = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search'
USER_AGENT = 'EcoThriftDashboard/1.0 (pos-delivery; local staff tool)'
REQUEST_TIMEOUT_S = 6

TIER_5MI_FEE = Decimal('50.00')
TIER_10MI_FEE = Decimal('75.00')
MAX_DELIVERY_MILES = Decimal('10')


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


def _normalize_query(query: str) -> str:
    q = (query or '').strip()
    lower = q.lower()
    if 'omaha' not in lower and 'ne' not in lower and 'nebraska' not in lower:
        return f'{q}, Omaha, NE'
    return q


def _google_driving_miles(dest_lat: float, dest_lon: float) -> tuple[float, str] | None:
    """Return (miles, 'driving') via Google Distance Matrix, or None if unavailable."""
    from django.conf import settings

    key = (getattr(settings, 'GOOGLE_MAPS_API_KEY', None) or '').strip()
    if not key:
        return None

    params = urllib.parse.urlencode(
        {
            'origins': f'{STORE_LAT},{STORE_LON}',
            'destinations': f'{dest_lat},{dest_lon}',
            'mode': 'driving',
            'units': 'imperial',
            'key': key,
        }
    )
    url = f'https://maps.googleapis.com/maps/api/distancematrix/json?{params}'
    try:
        data = _http_get_json(url)
    except RuntimeError:
        return None

    if not isinstance(data, dict) or data.get('status') != 'OK':
        logger.warning('Google Distance Matrix status: %s', data.get('status') if isinstance(data, dict) else data)
        return None
    try:
        element = data['rows'][0]['elements'][0]
        if element.get('status') != 'OK':
            return None
        meters = float(element['distance']['value'])
    except (KeyError, IndexError, TypeError, ValueError):
        return None
    return meters / 1609.344, 'driving'


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


def optimize_delivery_stop_order(stops: list[str]) -> tuple[list[str], bool]:
    """Reorder stops for fastest drive via Directions optimize:true.

    Returns (ordered_stops, optimized). Passthrough when key missing, <2 stops,
    or Google fails.
    """
    cleaned = [s.strip() for s in stops if (s or '').strip()]
    if len(cleaned) < 2:
        return cleaned, False

    from django.conf import settings

    key = (getattr(settings, 'GOOGLE_MAPS_API_KEY', None) or '').strip()
    if not key:
        return cleaned, False

    # Directions allows more waypoints than Maps URLs; still cap for our URL.
    capped = cleaned[:MAX_MAPS_WAYPOINTS]
    store = f'{STORE_LAT},{STORE_LON}'
    waypoints = 'optimize:true|' + '|'.join(capped)
    params = urllib.parse.urlencode(
        {
            'origin': store,
            'destination': store,
            'waypoints': waypoints,
            'mode': 'driving',
            'key': key,
        }
    )
    try:
        data = _http_get_json(f'{DIRECTIONS_URL}?{params}')
    except RuntimeError:
        return cleaned, False

    if not isinstance(data, dict) or data.get('status') != 'OK':
        logger.warning(
            'Google Directions status: %s',
            data.get('status') if isinstance(data, dict) else data,
        )
        return cleaned, False

    try:
        order = data['routes'][0]['waypoint_order']
    except (KeyError, IndexError, TypeError):
        return cleaned, False

    if not isinstance(order, list) or len(order) != len(capped):
        return cleaned, False

    try:
        reordered = [capped[int(i)] for i in order]
    except (ValueError, TypeError, IndexError):
        return cleaned, False

    # Preserve any overflow past the Maps waypoint cap in original order.
    if len(cleaned) > len(capped):
        return reordered + cleaned[len(capped) :], True
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


def _directions_route(
    addresses: list[str],
    *,
    origin: str,
    destination: str,
    optimize: bool,
) -> dict[str, Any] | None:
    """Call Google Directions; return raw route dict or None."""
    from django.conf import settings

    cleaned = [s.strip() for s in addresses if (s or '').strip()]
    if not cleaned:
        return None
    key = (getattr(settings, 'GOOGLE_MAPS_API_KEY', None) or '').strip()
    if not key:
        return None

    capped = cleaned[:MAX_MAPS_WAYPOINTS]
    if optimize and len(capped) >= 2:
        waypoints = 'optimize:true|' + '|'.join(capped)
    elif capped:
        waypoints = '|'.join(capped)
    else:
        return None

    params = urllib.parse.urlencode(
        {
            'origin': origin,
            'destination': destination,
            'waypoints': waypoints,
            'mode': 'driving',
            'key': key,
        }
    )
    try:
        data = _http_get_json(f'{DIRECTIONS_URL}?{params}')
    except RuntimeError:
        return None
    if not isinstance(data, dict) or data.get('status') != 'OK':
        logger.warning(
            'Google Directions status: %s',
            data.get('status') if isinstance(data, dict) else data,
        )
        return None
    try:
        return data['routes'][0]
    except (KeyError, IndexError, TypeError):
        return None


def plan_delivery_route_with_etas(
    addresses: list[str],
    *,
    origin_address: str | None = None,
    optimize: bool = True,
    start_at=None,
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

    if not cleaned:
        return {
            'ordered_addresses': [],
            'order_indices': [],
            'optimized': False,
            'maps_url': build_google_maps_route_url([]),
            'etas': [],
            'etas_available': False,
            'store_address': STORE_MAPS_ADDRESS,
            'service_seconds_per_stop': SERVICE_SECONDS_PER_STOP,
        }

    route = _directions_route(
        cleaned,
        origin=origin,
        destination=destination,
        optimize=optimize and len(cleaned) >= 2,
    )

    order_indices = list(range(len(cleaned)))
    optimized = False
    if route and optimize and len(cleaned) >= 2:
        raw_order = route.get('waypoint_order')
        if isinstance(raw_order, list) and len(raw_order) == min(len(cleaned), MAX_MAPS_WAYPOINTS):
            try:
                capped_n = min(len(cleaned), MAX_MAPS_WAYPOINTS)
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

    if route:
        legs = route.get('legs') or []
        for leg in legs:
            try:
                total_drive_seconds += int(leg['duration']['value'])
            except (KeyError, TypeError, ValueError):
                pass
            try:
                total_distance_meters += int(leg['distance']['value'])
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
        # For n stops there are n+1 legs when returning to store.
        cursor = start
        for idx in range(len(ordered)):
            drive = None
            if idx < len(legs):
                try:
                    drive = int(legs[idx]['duration']['value'])
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
            window_end = arrive + timedelta(seconds=SERVICE_SECONDS_PER_STOP)
            etas.append(
                {
                    'arrive_at': arrive,
                    'window_end_at': window_end,
                    'drive_seconds': drive,
                }
            )
            cursor = window_end

    maps_url = build_google_maps_route_url(ordered)
    return {
        'ordered_addresses': ordered,
        'order_indices': order_indices,
        'optimized': optimized,
        'maps_url': maps_url,
        'etas': etas,
        'etas_available': etas_available,
        'store_address': STORE_MAPS_ADDRESS,
        'service_seconds_per_stop': SERVICE_SECONDS_PER_STOP,
        'total_drive_seconds': total_drive_seconds if route else None,
        'total_distance_meters': total_distance_meters if route else None,
        'return_drive_seconds': return_drive_seconds,
        'return_distance_meters': return_distance_meters,
        'estimated_finish_at': (
            start
            + timedelta(
                seconds=total_drive_seconds
                + (SERVICE_SECONDS_PER_STOP * len(ordered))
            )
            if route
            else None
        ),
        'truncated': max(0, len(cleaned) - MAX_MAPS_WAYPOINTS),
        'waypoint_cap': MAX_MAPS_WAYPOINTS,
    }


def _format_street_line(addr: dict[str, Any]) -> str:
    house = str(addr.get('house_number') or '').strip()
    road = str(addr.get('road') or addr.get('pedestrian') or '').strip()
    if house and road:
        return f'{house} {road}'
    return road or house
