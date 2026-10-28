"""
A recovery estimate for one item (inventory review phase 4, owner 2026-10-22), behind the owner's switch
``inventory_recovery_estimate`` (off by default). Recovery = what the store keeps (``sold_net``) ÷ retail, on sold items
that had a retail.

**Sources**, each a rate with its sample size n (sold items with a retail):

- the **store** (the weekly rollup's whole-store rows over the last ``WINDOW_WEEKS`` complete weeks);
- the **category** (taxonomy bucket), then its **subcategory**, then the item's **sold vector neighbours** (products
  near it by meaning, ``ProductVector``; only from a product's stored vector, so no model is loaded on the web server);
- the **vendor** (the order's vendor code), the **price point** (tag price band, when a price is known) and the
  **condition** (from sold items over the last year: the rollup has no condition).

**Pulled toward the parent by sample size**: a source's rate r with n sales becomes (n·r + k·parent) ÷ (n + k), with
k = ``inventory_recovery_prior_n`` (30). Category pulls toward the store, subcategory toward the category, neighbours
toward the subcategory (or category); vendor, price point and condition toward the store. The "what it is" chain gives
one rate (its most specific level); then that, vendor, price point and condition are averaged, each weighted by
n ÷ (n + k), so a thin source counts for little. "n" shown is the most specific "what" level with at least k sales.

**Suggested price band** = retail × recovery × (1 ± ``inventory_recovery_band_share``, 20%). A price above the band is
"priced high", below it "priced low".
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

SWITCH_KEY = 'inventory_recovery_estimate'
PRIOR_KEY = 'inventory_recovery_prior_n'
BAND_KEY = 'inventory_recovery_band_share'
DEFAULT_PRIOR = 30
DEFAULT_BAND = 0.20
WINDOW_WEEKS = 52
CONDITION_DAYS = 365
NEIGHBOURS = 30
NEIGHBOUR_FLOOR = 0.75
CACHE_KEY = 'inventory_recovery_model_v1'
CACHE_SECONDS = 3600
CENT = Decimal('0.01')


def _setting(key: str, default):
    from apps.core.models import AppSetting

    value = AppSetting.objects.filter(key=key).values_list('value', flat=True).first()
    return default if value is None else value


def is_enabled() -> bool:
    value = _setting(SWITCH_KEY, False)
    return value is True or str(value).lower() in ('true', '1', 'yes', 'on')


def _number(key: str, default: float, low: float, high: float) -> float:
    try:
        n = float(_setting(key, default))
        return n if low <= n <= high else default
    except (TypeError, ValueError):
        return default


def prior_n() -> float:
    return _number(PRIOR_KEY, DEFAULT_PRIOR, 0, 10000)


def band_share() -> float:
    return _number(BAND_KEY, DEFAULT_BAND, 0, 0.9)


@dataclass
class Rate:
    """Net and retail summed over n sold items that had a retail."""

    net: float = 0.0
    retail: float = 0.0
    n: int = 0

    @property
    def rate(self) -> float | None:
        return self.net / self.retail if self.retail > 0 else None


@dataclass
class RecoveryModel:
    """The rates the estimate reads, built from the rollup and sold items; cached for an hour."""

    store: Rate = field(default_factory=Rate)
    category: dict[str, Rate] = field(default_factory=dict)
    subcategory: dict[tuple[str, str], Rate] = field(default_factory=dict)
    vendor: dict[str, Rate] = field(default_factory=dict)
    price_point: dict[str, Rate] = field(default_factory=dict)
    condition: dict[str, Rate] = field(default_factory=dict)


def build_model(today=None) -> RecoveryModel:
    from apps.inventory.models import InventoryWeek, Item
    from apps.inventory.services import inventory_week

    last = inventory_week.week_of(today or timezone.localdate()) - timedelta(days=7)
    first = last - timedelta(weeks=WINDOW_WEEKS - 1)
    rows = (InventoryWeek.objects.filter(week_start__gte=first, week_start__lte=last)
            .values('dimension', 'parent', 'key')
            .annotate(net=Sum('sold_net_with_retail'), retail=Sum('sold_retail'), n=Sum('sold_with_retail')))
    model = RecoveryModel()
    store = Rate()
    for r in rows:
        rate = Rate(float(r['net'] or 0), float(r['retail'] or 0), int(r['n'] or 0))
        dim = r['dimension']
        if dim == 'all':
            store = Rate(store.net + rate.net, store.retail + rate.retail, store.n + rate.n)
        elif dim == 'category':
            model.category[r['key']] = rate
        elif dim == 'subcategory':
            model.subcategory[(r['parent'], r['key'])] = rate
        elif dim == 'vendor':
            model.vendor[r['key']] = rate
        elif dim == 'price_point':
            model.price_point[r['key']] = rate
    # Until the whole-store rows cover the window (a full rebuild), the categories add up to the store.
    added = Rate()
    for c in model.category.values():
        added = Rate(added.net + c.net, added.retail + c.retail, added.n + c.n)
    model.store = store if store.n >= added.n else added
    since = timezone.now() - timedelta(days=CONDITION_DAYS)
    for r in (Item.objects.filter(status='sold', sold_at__gte=since, retail__gt=0, sold_for__isnull=False)
              .values('condition')
              .annotate(net=Sum(Coalesce('sold_net', 'sold_for')), retail=Sum('retail'), n=Count('id'))):
        model.condition[r['condition'] or 'unknown'] = Rate(float(r['net'] or 0), float(r['retail'] or 0), int(r['n']))
    return model


def get_model() -> RecoveryModel:
    model = cache.get(CACHE_KEY)
    if model is None:
        model = build_model()
        cache.set(CACHE_KEY, model, CACHE_SECONDS)
    return model


def neighbours_rate(product_id: int) -> Rate:
    """Sold items (last year, with a retail) of the products nearest this one by meaning."""
    from apps.inventory.models import Item, Product
    from apps.inventory.services.product_vectors import similar_products

    product = Product.objects.filter(pk=product_id).first()
    if product is None:
        return Rate()
    try:
        near = [n['product_id'] for n in similar_products(product=product, limit=NEIGHBOURS, sold_only=True)
                if (n.get('similarity') or 0) >= NEIGHBOUR_FLOOR]
    except Exception:  # no vector, or pgvector unavailable: no neighbours
        return Rate()
    if not near:
        return Rate()
    since = timezone.now() - timedelta(days=CONDITION_DAYS)
    agg = (Item.objects.filter(product_id__in=near, status='sold', sold_at__gte=since, retail__gt=0,
                               sold_for__isnull=False)
           .aggregate(net=Sum(Coalesce('sold_net', 'sold_for')), retail=Sum('retail'), n=Count('id')))
    return Rate(float(agg['net'] or 0), float(agg['retail'] or 0), int(agg['n'] or 0))


def _pull(rate: Rate | None, parent: float, k: float) -> float:
    if rate is None or rate.rate is None or not rate.n:
        return parent
    return (rate.n * rate.rate + k * parent) / (rate.n + k)


def _price_point(price) -> str:
    from apps.inventory.services.inventory_week import PRICE_POINTS

    value = float(price)
    for key, _label, _lo, hi in PRICE_POINTS:
        if hi is not None and value < hi:
            return key
    return PRICE_POINTS[-1][0]


def _money(value: float) -> Decimal:
    return max(Decimal('0.50'), Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP))


def estimate(*, retail, category: str = '', subcategory: str = '', vendor: str = '', condition: str = '',
             price=None, product_id: int | None = None, model: RecoveryModel | None = None,
             with_neighbours: bool = True) -> dict[str, Any] | None:
    """The recovery estimate for one item, or None when it has no retail or nothing has sold yet."""
    try:
        retail = float(retail)
    except (TypeError, ValueError):
        return None
    if retail <= 0:
        return None
    model = model or get_model()
    store = model.store.rate
    if store is None:
        return None
    k = prior_n()
    sources: list[dict[str, Any]] = [{'source': 'store', 'label': 'The whole store', 'rate': store, 'n': model.store.n}]

    # What it is: category, then subcategory, then sold neighbours, each pulled toward the one before.
    # "n" shown: the most specific level with at least k sales (a thinner one still counts, pulled hard).
    what, what_n, what_label = store, model.store.n, 'the whole store'

    def shown(n: int, label: str) -> None:
        nonlocal what_n, what_label
        if n >= max(k, 1):
            what_n, what_label = n, label

    cat = model.category.get(category) if category else None
    if cat and cat.n:
        what = _pull(cat, what, k)
        shown(cat.n, category)
        sources.append({'source': 'category', 'label': category, 'rate': cat.rate, 'n': cat.n, 'pulled': what})
    sub = model.subcategory.get((category, subcategory)) if category and subcategory else None
    if sub and sub.n:
        what = _pull(sub, what, k)
        shown(sub.n, subcategory)
        sources.append({'source': 'subcategory', 'label': subcategory, 'rate': sub.rate, 'n': sub.n, 'pulled': what})
    if with_neighbours and product_id:
        near = neighbours_rate(product_id)
        if near.n:
            what = _pull(near, what, k)
            shown(near.n, 'similar products')
            sources.append({'source': 'neighbours', 'label': 'Similar products that sold', 'rate': near.rate,
                            'n': near.n, 'pulled': what})

    what_weight_n = max((s['n'] for s in sources if s['source'] in ('category', 'subcategory', 'neighbours')), default=0)
    axes = [(what, what_weight_n or model.store.n)]
    for name, table, key, label in (
        ('vendor', model.vendor, vendor, vendor),
        ('price_point', model.price_point, _price_point(price) if price not in (None, '') else '', ''),
        ('condition', model.condition, condition, condition),
    ):
        rate = table.get(key) if key else None
        if rate and rate.n and rate.rate is not None:
            pulled = _pull(rate, store, k)
            axes.append((pulled, rate.n))
            if name == 'price_point':
                from apps.inventory.services.inventory_week import PRICE_POINT_LABELS

                label = PRICE_POINT_LABELS.get(key, key)
            sources.append({'source': name, 'label': label, 'rate': rate.rate, 'n': rate.n, 'pulled': pulled})
    weights = [n / (n + k) if (n + k) else 0 for _r, n in axes]
    total = sum(weights)
    recovery = sum(r * w for (r, _n), w in zip(axes, weights)) / total if total else store
    spread = band_share()
    low, high = _money(retail * recovery * (1 - spread)), _money(retail * recovery * (1 + spread))
    out: dict[str, Any] = {
        'recovery': round(recovery, 4), 'n': what_n, 'basis': what_label,
        'low': str(low), 'high': str(high), 'mid': str(_money(retail * recovery)),
        'sources': [{**s, 'rate': round(s['rate'], 4) if s.get('rate') is not None else None,
                     **({'pulled': round(s['pulled'], 4)} if 'pulled' in s else {})} for s in sources],
        'verdict': '',
    }
    if price not in (None, ''):
        try:
            p = Decimal(str(price))
            out['verdict'] = 'high' if p > high else 'low' if p < low else 'ok'
        except (ArithmeticError, ValueError):
            pass
    return out


def product_facts(product_id: int) -> dict[str, str]:
    """A product's category (taxonomy bucket, honouring the profile switch) and profile subcategory."""
    from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
    from apps.inventory.models import Product, ProductProfile
    from apps.inventory.services import effective_category

    product = Product.objects.filter(pk=product_id).select_related('category').first()
    if product is None:
        return {'category': '', 'subcategory': ''}
    profile = ProductProfile.objects.filter(product_id=product_id).values('category', 'subcategory').first() or {}
    category = ''
    if effective_category.is_enabled() and profile.get('category') in effective_category.REAL_CATEGORIES:
        category = profile['category']
    elif product.category_id and product.category.name in TAXONOMY_V1_CATEGORY_NAMES:
        category = product.category.name
    return {'category': category or MIXED_LOTS_UNCATEGORIZED, 'subcategory': (profile.get('subcategory') or '').strip()}


def vendor_code(order_id) -> str:
    from apps.inventory.models import PurchaseOrder

    if not order_id:
        return ''
    return PurchaseOrder.objects.filter(pk=order_id).values_list('vendor__code', flat=True).first() or ''


def for_item_inputs(*, retail, product_id=None, order_id=None, condition: str = '', price=None,
                    category: str = '') -> dict[str, Any] | None:
    """The estimate from what a check-in screen knows: a product, an order, a condition, a retail, a price."""
    facts = product_facts(product_id) if product_id else {'category': category, 'subcategory': ''}
    return estimate(retail=retail, category=facts['category'] or category, subcategory=facts['subcategory'],
                    vendor=vendor_code(order_id), condition=condition, price=price, product_id=product_id)
