"""Shipping estimate from distance and pallets, fitted on our own purchase-order history.

Two formulas, because freight is priced two ways:
- Truckload (B-Stock shipmentType Truckload, or ``truckload_min_pallets``+ pallets):
  ``fixed + per_mile * miles``. A truck costs about the same however full it is.
- LTL (fewer pallets): ``fixed + per_pallet * pallets + per_pallet_mile * pallets * miles``.

Miles are driving miles from the store to the seller's city (``ShippingOrigin``, one Google
Routes lookup per new city). ``fit_formula`` takes each formula's shape from every order and
its level from the last months when prices clearly moved (truckloads rose about 60% in 2026).
``python manage.py fit_shipping_formula --save`` re-fits it into Admin > Assumptions.
"""

from __future__ import annotations

import logging
import re
import statistics
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify

from apps.buying.models import Auction, ShippingOrigin

logger = logging.getLogger(__name__)

FORMULA_SETTING_KEY = 'buying_shipping_formula'
CENT = Decimal('0.01')

# Fitted 2026-09-23 on 193 purchase orders and 2 B-Stock quotes from 25 cities (2024-03 to 2026-09).
DEFAULT_FORMULA: dict[str, Any] = {
    'truckload': {'fixed': 1667.98, 'per_mile': 1.6709},
    'ltl': {'fixed': 297.78, 'per_pallet': 43.2488, 'per_pallet_mile': 0.07458},
    'truckload_min_pallets': 16,
    'typical_error': {'truckload': 0.25, 'ltl': 0.2},
    'level': {'truckload': 1.62, 'ltl': 1.0},
    'fitted_on': '2026-09-23',
    'rows': 195,
    'cities': 25,
}

# "..., Indianapolis, IN" at the end of a B-Stock title / PO description.
CITY_AT_END_RE = re.compile(r",\s*([A-Za-z][A-Za-z .'-]+?),\s*([A-Z]{2})\s*$")
PALLETS_RE = re.compile(r'(\d{1,3})\s+pallet', re.IGNORECASE)
# A failed lookup is tried again after this long.
RETRY_LOOKUP_AFTER = timedelta(days=30)
# Routes matrix: one origin, at most this many cities per call.
LOOKUP_BATCH = 25


def city_slug(city: str) -> str:
    return slugify(city or '')[:120]


def city_from_text(text: str) -> str:
    """``"Indianapolis, IN"`` from the end of a title or PO description, else ''."""
    m = CITY_AT_END_RE.search((text or '').strip())
    return f'{m.group(1).strip()}, {m.group(2)}' if m else ''


def pallets_from_text(text: str) -> int | None:
    m = PALLETS_RE.search(text or '')
    n = int(m.group(1)) if m else 0
    return n if n > 0 else None


def get_shipping_formula(using: str = 'default') -> dict[str, Any]:
    """The formula saved in Admin > Assumptions, else the built-in fit."""
    from apps.core.models import AppSetting

    try:
        value = AppSetting.objects.using(using).get(key=FORMULA_SETTING_KEY).value
        if isinstance(value, dict) and 'truckload' in value and 'ltl' in value:
            return value
    except Exception:  # noqa: BLE001 - missing row or table: fall back to the fit above
        pass
    return DEFAULT_FORMULA


def is_truckload(pallets: int, shipment_type: str, formula: dict[str, Any]) -> bool:
    if (shipment_type or '').strip().lower() == 'truckload':
        return True
    return pallets >= int(formula.get('truckload_min_pallets') or 16)


def formula_amount(pallets: int, miles: float, truckload: bool, formula: dict[str, Any]) -> Decimal:
    if truckload:
        t = formula['truckload']
        value = float(t['fixed']) + float(t['per_mile']) * miles
    else:
        t = formula['ltl']
        value = float(t['fixed']) + float(t['per_pallet']) * pallets + float(t['per_pallet_mile']) * pallets * miles
    return Decimal(str(max(value, 0.0))).quantize(CENT)


def load_origin_miles(using: str = 'default') -> dict[str, int]:
    """``{city_slug: driving miles}`` for every city we have a distance for."""
    return dict(
        ShippingOrigin.objects.using(using).filter(miles__isnull=False).values_list('slug', 'miles')
    )


# --- distances -------------------------------------------------------------------------


def lookup_driving_miles(cities: list[str]) -> dict[str, int | None]:
    """Driving miles from the store to each ``"City, ST"`` (one Google Routes matrix call)."""
    from apps.pos.services import delivery_distance as dd

    key = dd._maps_api_key()
    if not key or not cities:
        return {}
    body = {
        'origins': [
            {'waypoint': {'location': {'latLng': {'latitude': dd.STORE_LAT, 'longitude': dd.STORE_LON}}}}
        ],
        # ", USA": "Ontario, CA" is otherwise read as Canada.
        'destinations': [{'waypoint': {'address': f'{c}, USA'}} for c in cities],
        'travelMode': 'DRIVE',
        'routingPreference': 'TRAFFIC_UNAWARE',
    }
    data, status, detail = dd._http_post_json(
        dd.ROUTES_MATRIX_URL,
        body,
        headers={'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,status'},
    )
    if data is None:
        logger.warning('shipping origin lookup failed: %s %s', status, detail)
        return {}
    elements = data if isinstance(data, list) else (data.get('elements') if isinstance(data, dict) else None)
    out: dict[str, int | None] = {c: None for c in cities}
    for el in elements or []:
        if not isinstance(el, dict):
            continue
        try:
            index = int(el.get('destinationIndex', 0))
            meters = float(el['distanceMeters'])
        except (KeyError, TypeError, ValueError):
            continue
        if 0 <= index < len(cities):
            out[cities[index]] = round(meters / 1609.344)
    return out


def ensure_origin_miles(cities: list[str], *, now=None) -> int:
    """
    Make sure every city has a ``ShippingOrigin`` row, looking up the ones we have no
    distance for (a failed one again after 30 days). Returns how many got a distance.
    Never raises: the sweep calls this after saving listings.
    """
    now = now or timezone.now()
    wanted: dict[str, str] = {}
    for city in cities:
        city = (city or '').strip()
        slug = city_slug(city)
        if city and slug:
            wanted.setdefault(slug, city)
    if not wanted:
        return 0
    known = ShippingOrigin.objects.filter(slug__in=wanted).filter(
        Q(miles__isnull=False) | Q(looked_up_at__gte=now - RETRY_LOOKUP_AFTER)
    )
    todo = [(slug, city) for slug, city in wanted.items() if slug not in set(known.values_list('slug', flat=True))]
    found = 0
    for start in range(0, len(todo), LOOKUP_BATCH):
        batch = todo[start : start + LOOKUP_BATCH]
        try:
            miles = lookup_driving_miles([city for _, city in batch])
        except Exception:  # noqa: BLE001 - a lookup must never break the sweep
            logger.exception('shipping origin lookup crashed')
            miles = {}
        for slug, city in batch:
            m = miles.get(city)
            ShippingOrigin.objects.update_or_create(
                slug=slug, defaults={'city': city, 'miles': m, 'looked_up_at': now}
            )
            found += 1 if m else 0
    return found


# --- estimate for an auction ------------------------------------------------------------


@dataclass
class _Inputs:
    pallets: int
    city: str
    slug: str
    shipment_type: str


def estimate_for_auction(
    auction: Auction,
    *,
    origin_miles: dict[str, int] | None = None,
    formula: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """
    The formula estimate for an auction with a pallet count and a known distance, else None.
    ``low`` / ``high`` span the formula's typical error.
    """
    i = _Inputs(
        pallets=auction.pallet_count or 0,
        city=(auction.origin_city or '').strip(),
        slug=city_slug(auction.origin_city or ''),
        shipment_type=auction.shipment_type or '',
    )
    if i.pallets <= 0 or not i.slug:
        return None
    if origin_miles is None:
        origin_miles = dict(
            ShippingOrigin.objects.filter(slug=i.slug, miles__isnull=False).values_list('slug', 'miles')
        )
    miles = origin_miles.get(i.slug)
    if not miles:
        return None
    formula = formula or get_shipping_formula()
    truckload = is_truckload(i.pallets, i.shipment_type, formula)
    amount = formula_amount(i.pallets, float(miles), truckload, formula)
    error = Decimal(str((formula.get('typical_error') or {}).get('truckload' if truckload else 'ltl') or 0))
    return {
        'basis': 'formula',
        'amount': amount,
        'mode': 'truckload' if truckload else 'ltl',
        'pallets': i.pallets,
        'miles': int(miles),
        'city': i.city,
        'typical_error': error,
        'low': (amount * (1 - error)).quantize(CENT),
        'high': (amount * (1 + error)).quantize(CENT),
    }


# --- history and fitting -----------------------------------------------------------------


def shipping_history() -> list[dict[str, Any]]:
    """
    Every shipment we can place: purchase orders with a shipping cost (city and pallets read
    from the description) and auctions with a saved B-Stock quote. Rows with no city or no
    pallet count are left out.
    """
    from apps.inventory.models import PurchaseOrder

    rows: list[dict[str, Any]] = []
    for po in PurchaseOrder.objects.select_related('vendor').filter(shipping_cost__gt=0).order_by('ordered_date'):
        desc = (po.description or '').strip()
        city = city_from_text(desc)
        pallets = pallets_from_text(desc)
        if not city or not pallets:
            continue
        rows.append(
            {
                'source': 'po',
                'ref': po.order_number,
                'city_slug': city_slug(city),
                'city': city,
                'vendor': po.vendor.code if po.vendor_id else '',
                'pallets': pallets,
                'truckload': 'truckload' in desc.lower(),
                'cost': po.purchase_cost or Decimal('0'),
                'fee': po.fees or Decimal('0'),
                'shipping': po.shipping_cost,
                'ym': po.ordered_date.strftime('%Y-%m'),
            }
        )
    quoted = (
        Auction.objects.select_related('marketplace')
        .filter(shipping_quote__gt=0, pallet_count__gt=0)
        .exclude(origin_city='')
    )
    for a in quoted:
        at = a.shipping_quote_at or a.last_updated_at or timezone.now()
        rows.append(
            {
                'source': 'quote',
                'ref': a.external_id,
                'city_slug': city_slug(a.origin_city),
                'city': a.origin_city,
                'vendor': a.marketplace.slug if a.marketplace_id else '',
                'pallets': a.pallet_count,
                'truckload': (a.shipment_type or '').lower() == 'truckload',
                'cost': a.current_price or Decimal('0'),
                'fee': a.estimated_fees or Decimal('0'),
                'shipping': a.shipping_quote,
                'ym': at.strftime('%Y-%m'),
            }
        )
    return rows


def _solve(X: list[list[float]], y: list[float]) -> list[float]:
    """Least squares (normal equations, Gaussian elimination). Small k only."""
    k = len(X[0])
    A = [[sum(x[i] * x[j] for x in X) + (1e-9 if i == j else 0.0) for j in range(k)] for i in range(k)]
    b = [sum(x[i] * v for x, v in zip(X, y)) for i in range(k)]
    for c in range(k):
        p = max(range(c, k), key=lambda r: abs(A[r][c]))
        A[c], A[p], b[c], b[p] = A[p], A[c], b[p], b[c]
        for r in range(k):
            if r != c and A[c][c]:
                f = A[r][c] / A[c][c]
                A[r] = [a - f * cc for a, cc in zip(A[r], A[c])]
                b[r] -= f * b[c]
    return [b[i] / A[i][i] if A[i][i] else 0.0 for i in range(k)]


def _months_back(ym: str, today: date) -> int:
    return (today.year - int(ym[:4])) * 12 + today.month - int(ym[5:7])


def fit_formula(
    rows: list[dict[str, Any]],
    miles: dict[str, int],
    *,
    today: date | None = None,
    truckload_min_pallets: int = 16,
    level_months: int = 6,
    min_rows: int = 5,
) -> dict[str, Any]:
    """
    Fit both formulas. Shape from every row with a distance; level from the last
    ``level_months`` when at least ``min_rows`` rows there differ from the shape by more
    than 10% (a real price move, not noise). ``typical_error`` is the median miss on the
    last 12 months.
    """
    today = today or timezone.localdate()
    usable = []
    for r in rows:
        m = miles.get(r['city_slug'])
        if m:
            tl = bool(r['truckload']) or int(r['pallets']) >= truckload_min_pallets
            usable.append({**r, 'miles': float(m), 'tl': tl, 'ship': float(r['shipping']), 'P': int(r['pallets'])})

    def fit(subset, feats):
        coef = _solve([feats(r) for r in subset], [r['ship'] for r in subset])
        recent = [r for r in subset if _months_back(r['ym'], today) < level_months]
        level = 1.0
        if len(recent) >= min_rows:
            ratios = [r['ship'] / max(sum(c * x for c, x in zip(coef, feats(r))), 1.0) for r in recent]
            level = statistics.median(ratios)
            if abs(level - 1.0) <= 0.10:
                level = 1.0
        coef = [c * level for c in coef]
        last_year = [r for r in subset if _months_back(r['ym'], today) < 12] or subset
        misses = [abs(sum(c * x for c, x in zip(coef, feats(r))) - r['ship']) / r['ship'] for r in last_year]
        return coef, level, round(statistics.median(misses), 2) if misses else 0.0

    tl_rows = [r for r in usable if r['tl']]
    ltl_rows = [r for r in usable if not r['tl']]
    if len(tl_rows) < min_rows or len(ltl_rows) < min_rows:
        raise ValueError(f'Not enough history to fit ({len(tl_rows)} truckload, {len(ltl_rows)} LTL rows).')
    tl, tl_level, tl_err = fit(tl_rows, lambda r: [1.0, r['miles']])
    ltl, ltl_level, ltl_err = fit(ltl_rows, lambda r: [1.0, r['P'], r['P'] * r['miles']])
    return {
        'truckload': {'fixed': round(tl[0], 2), 'per_mile': round(tl[1], 4)},
        'ltl': {'fixed': round(ltl[0], 2), 'per_pallet': round(ltl[1], 4), 'per_pallet_mile': round(ltl[2], 5)},
        'truckload_min_pallets': truckload_min_pallets,
        'typical_error': {'truckload': tl_err, 'ltl': ltl_err},
        'level': {'truckload': round(tl_level, 2), 'ltl': round(ltl_level, 2)},
        'fitted_on': today.isoformat(),
        'rows': len(usable),
        'cities': len({r['city_slug'] for r in usable}),
    }
