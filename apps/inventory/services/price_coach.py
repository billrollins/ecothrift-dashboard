"""
Price coach (Dash Updates #89): what items like this one sold for here, and how fast, shown at the price box in
check-in. Facts only: it never sets or blocks a price.

**Evidence, in this order; the first level with at least ``MIN_ITEMS`` items is used:**

1. ``product``: the same product's own items;
2. ``similar``: those plus the items of the products nearest it by meaning (``ProductVector``, the stored vector
   only, so no model loads on the web server);
3. ``category_brand``: every product with the same taxonomy category and the same brand.

Under ``MIN_ITEMS`` at every level the answer is ``enough: false`` ("Not enough like this yet").

**Which items count:** sold items (``sold_for`` above 0) and items on the shelf now (``price`` above 0) for at
least ``FRESH_DAYS`` (a tag put out this week has had no time to sell, so it is no evidence), put out in the last
``WINDOW_DAYS``. Scrapped, lost, returned and not yet put out are left out. The clock starts at
``checked_in_at`` (``listed_at`` when check-in is empty; an item with neither is left out). A sold item's days are
``sold_at`` minus that start; an unsold item's days are today minus that start.

**The line:** how many sold, the middle half of what they sold for (25th to 75th percentile), the median days to
sell, and how many are still on the shelf after ``SITTING_DAYS`` and the lowest tag among those.

**The note** for a typed price: of the items tagged at that price or more that are old enough to judge (sold, or on
the shelf ``SAT_DAYS`` or longer), when there are at least ``SAT_MIN_ITEMS`` and more than half are still unsold
after ``SAT_DAYS``, it says so.

The item list per product is cached for ``CACHE_SECONDS``; the note is worked out per request from that list.
Switch: AppSetting ``inventory_price_coach`` (on unless the row says off; the row is made on first use so it shows
in Settings without a migration).
"""
from __future__ import annotations

import math
from datetime import timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

SWITCH_KEY = 'inventory_price_coach'
SWITCH_DESCRIPTION = (
    'Price coach: at the price box in check-in, show what items like this sold for here and how fast. '
    'Facts only; it never changes or blocks a price.'
)
MIN_ITEMS = 5
WINDOW_DAYS = 365
SITTING_DAYS = 90
FRESH_DAYS = 14
SAT_DAYS = 60
SAT_MIN_ITEMS = 3
NEIGHBOURS = 30
NEIGHBOUR_FLOOR = 0.75
MAX_EVIDENCE = 400
LIST_LIMIT = 40
CACHE_SECONDS = 300
CACHE_PREFIX = 'price_coach:v1:'

BASIS_PRODUCT = 'product'
BASIS_SIMILAR = 'similar'
BASIS_CATEGORY_BRAND = 'category_brand'


def is_enabled() -> bool:
    from apps.core.models import AppSetting

    row, _ = AppSetting.objects.get_or_create(
        key=SWITCH_KEY, defaults={'value': True, 'description': SWITCH_DESCRIPTION},
    )
    return row.value is True or str(row.value).lower() in ('true', '1', 'yes', 'on')


# -- evidence ---------------------------------------------------------------
def _item_rows(product_ids, now) -> list[dict[str, Any]]:
    """Sold and on-shelf items of these products as plain rows, newest first."""
    from apps.inventory.models import Item

    since = now - timedelta(days=WINDOW_DAYS)
    fresh = now - timedelta(days=FRESH_DAYS)
    qs = (
        Item.objects.filter(product_id__in=list(product_ids))
        .filter(Q(checked_in_at__gte=since) | Q(checked_in_at__isnull=True, listed_at__gte=since))
        .filter(
            Q(status='sold', sold_for__gt=0, sold_at__isnull=False)
            # An item put out this week says nothing yet (and a truck being checked in is full of them).
            | (Q(status='on_shelf', price__gt=0)
               & (Q(checked_in_at__lte=fresh) | Q(checked_in_at__isnull=True, listed_at__lte=fresh)))
        )
        .order_by('-id')
        .values('id', 'sku', 'status', 'price', 'sold_for', 'sold_at', 'checked_in_at', 'listed_at',
                'product_id', 'product__title')[:MAX_EVIDENCE]
    )
    rows = []
    for item in qs:
        start = item['checked_in_at'] or item['listed_at']
        if start is None:
            continue
        sold = item['status'] == 'sold'
        end = item['sold_at'] if sold else now
        rows.append({
            'id': item['id'],
            'sku': item['sku'],
            'title': item['product__title'] or '',
            'product_id': item['product_id'],
            'sold': sold,
            'price': float(item['price'] or 0),
            'sold_for': float(item['sold_for']) if sold else None,
            'days': max(0, (end - start).days),
        })
    return rows


def _neighbour_ids(product) -> list[int]:
    """The products nearest this one by meaning, from its stored vector.

    A bare nearest-first query so Postgres walks the HNSW index (about 15 to 120 ms on 103,000 vectors);
    ``similar_products`` joins and filters first and takes about 800 ms. The model name is checked on the rows
    that come back, so vectors from different models are still never compared.
    """
    from pgvector.django import CosineDistance

    from apps.inventory.models import ProductVector
    from apps.inventory.services.product_vectors import MODEL_NAME

    try:
        own = ProductVector.objects.filter(product=product, model_name=MODEL_NAME).first()
        if own is None:
            return []
        rows = (
            ProductVector.objects.annotate(distance=CosineDistance('embedding', own.embedding))
            .order_by('distance').values('product_id', 'model_name', 'distance')[:NEIGHBOURS + 10]
        )
        near = [r['product_id'] for r in rows
                if r['model_name'] == MODEL_NAME and r['product_id'] != product.pk
                and 1 - float(r['distance']) >= NEIGHBOUR_FLOOR]
        return near[:NEIGHBOURS]
    except Exception:  # no vector, or pgvector unavailable: no neighbours
        return []


def _category_brand_ids(product) -> tuple[list[int], str]:
    from apps.inventory.models import ProductProfile

    profile = ProductProfile.objects.filter(product=product).values('category', 'brand').first()
    category = (profile or {}).get('category') or ''
    brand = ((profile or {}).get('brand') or product.brand or '').strip()
    if not category or not brand or category.startswith('Mixed'):
        return [], ''
    ids = list(
        ProductProfile.objects.filter(category=category, brand__iexact=brand)
        .values_list('product_id', flat=True)[:2000]
    )
    return ids, f'{brand} in {category}'


def gather(product_id: int, now=None) -> dict[str, Any] | None:
    """The evidence for one product: which level it rests on and its item rows. None for an unknown product."""
    from apps.inventory.models import Product

    now = now or timezone.now()
    product = Product.objects.filter(pk=product_id).first()
    if product is None:
        return None
    rows = _item_rows([product.pk], now)
    if len(rows) >= MIN_ITEMS:
        return {'basis': BASIS_PRODUCT, 'label': '', 'rows': rows}
    near = _neighbour_ids(product)
    if near:
        similar = _item_rows([product.pk, *near], now)
        if len(similar) >= MIN_ITEMS:
            return {'basis': BASIS_SIMILAR, 'label': '', 'rows': similar}
    ids, label = _category_brand_ids(product)
    if ids:
        wide = _item_rows({product.pk, *ids}, now)
        if len(wide) >= MIN_ITEMS:
            return {'basis': BASIS_CATEGORY_BRAND, 'label': label, 'rows': wide}
    return {'basis': '', 'label': '', 'rows': rows}


def _cached_evidence(product_id: int) -> dict[str, Any] | None:
    key = f'{CACHE_PREFIX}{product_id}'
    try:
        hit = cache.get(key)
    except Exception:
        hit = None
    if hit is not None:
        return hit or None
    evidence = gather(product_id)
    try:
        cache.set(key, evidence or {}, CACHE_SECONDS)
    except Exception:
        pass
    return evidence


# -- the summary --------------------------------------------------------------
def _percentile(values: list[float], share: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    at = (len(ordered) - 1) * share
    low, high = math.floor(at), math.ceil(at)
    return ordered[low] + (ordered[high] - ordered[low]) * (at - low)


def _median(values: list[float]) -> float:
    return _percentile(values, 0.5)


def _to_price(raw) -> float | None:
    try:
        value = float(Decimal(str(raw).replace('$', '').replace(',', '').strip()))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return value if value > 0 else None


def sat_note(rows: list[dict[str, Any]], price: float | None) -> dict[str, Any] | None:
    """Items tagged at ``price`` or more: have most of them sat ``SAT_DAYS`` without selling?"""
    if price is None:
        return None
    judged = [r for r in rows if r['price'] >= price and (r['sold'] or r['days'] >= SAT_DAYS)]
    if len(judged) < SAT_MIN_ITEMS:
        return None
    unsold = [r for r in judged if not r['sold']]
    if len(unsold) * 2 <= len(judged):
        return None
    return {'price': round(price, 2), 'n': len(judged), 'unsold': len(unsold), 'days': SAT_DAYS}


def summarize(evidence: dict[str, Any], price=None) -> dict[str, Any]:
    rows = evidence['rows']
    out: dict[str, Any] = {
        'basis': evidence['basis'], 'label': evidence['label'], 'n': len(rows),
        'enough': bool(evidence['basis']) and len(rows) >= MIN_ITEMS,
        'sold': None, 'on_shelf': None, 'sitting': None, 'note': None, 'items': [],
    }
    if not out['enough']:
        return out
    sold = [r for r in rows if r['sold']]
    unsold = [r for r in rows if not r['sold']]
    if sold:
        prices = [r['sold_for'] for r in sold]
        out['sold'] = {
            'n': len(sold),
            'low': round(_percentile(prices, 0.25), 2),
            'high': round(_percentile(prices, 0.75), 2),
            'median_days': int(round(_median([float(r['days']) for r in sold]))),
        }
    sitting = [r for r in unsold if r['days'] >= SITTING_DAYS]
    out['on_shelf'] = {'n': len(unsold), 'oldest_days': max((r['days'] for r in unsold), default=0)}
    if sitting:
        tags = [r['price'] for r in sitting]
        out['sitting'] = {'n': len(sitting), 'min_price': round(min(tags), 2), 'max_price': round(max(tags), 2),
                          'days': SITTING_DAYS}
    out['note'] = sat_note(rows, _to_price(price))
    # The list behind the line: unsold longest-sitting first, then sold, slowest first.
    listed = sorted(unsold, key=lambda r: -r['days']) + sorted(sold, key=lambda r: -r['days'])
    out['items'] = [
        {'id': r['id'], 'sku': r['sku'], 'title': r['title'], 'sold': r['sold'], 'price': r['price'],
         'sold_for': r['sold_for'], 'days': r['days']}
        for r in listed[:LIST_LIMIT]
    ]
    return out


def coach(product_id: int | None, price=None) -> dict[str, Any] | None:
    """The coach answer for the check-in price box, or None when there is no product to go on."""
    if not product_id:
        return None
    evidence = _cached_evidence(int(product_id))
    if evidence is None:
        return None
    return summarize(evidence, price)
