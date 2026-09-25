"""
How much of the predicted revenue each seller's trucks really bring in: the seller factor.

The valuation predicts a truck at retail x each category's recovery rate, less shrink. R-062
checked that against 201 finished B-Stock trucks, each 120+ days old and half or more sold.
Actual revenue was a median 0.70 of the prediction before shrink, because about a third of
the items never sell. It also differed by seller: Wayfair 0.27, Amazon 0.60, Target 0.71,
Walmart and Costco 0.77.

``fit_seller_factors`` measures it per seller from our own finished POs. The factor is
``actual / (predicted x (1 - global shrink))``, so it sits on top of the shrink the valuation
already takes, and it is clamped between ``CLAMP``. ``--save`` on the command stores it as the
Assumptions setting ``buying_seller_revenue_factors``. Unset, every seller is 1.0, so nothing
changes until the owner saves it. The report cards' calibration then corrects what is left.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import median, quantiles
from typing import Any

from django.db.models import Count, Q, Sum
from django.utils import timezone

from apps.buying.models import Auction, Marketplace
from apps.buying.services.price_target import _setting
from apps.buying.services.recovery import recovery_rate

SELLER_FACTORS_KEY = 'buying_seller_revenue_factors'
MIN_AGE_DAYS = 120
MIN_SOLD_PCT = 50
MIN_TRUCKS = 5
CLAMP = (Decimal('0.2'), Decimal('1.3'))


def get_seller_factors() -> dict[str, Any]:
    value = _setting(SELLER_FACTORS_KEY)
    return value if isinstance(value, dict) else {}


def seller_factor(auction: Auction) -> tuple[Decimal, dict[str, Any] | None]:
    """(factor, its entry) for the auction's seller; (1, None) when none is saved for it."""
    factors = (get_seller_factors().get('sellers') or {})
    if not factors or not auction.marketplace_id:
        return Decimal('1'), None
    name = f'{auction.marketplace.name} {auction.marketplace.slug}'.lower()
    for key, entry in factors.items():
        if key and key.lower() in name:
            try:
                return Decimal(str(entry['factor'])), entry
            except (KeyError, TypeError, ArithmeticError):
                return Decimal('1'), None
    return Decimal('1'), None


def _r(value: float) -> str:
    return f'{value:.3f}'


def fit_seller_factors(
    *, min_age_days: int = MIN_AGE_DAYS, min_sold_pct: float = MIN_SOLD_PCT, today=None,
) -> dict[str, Any]:
    """Per B-Stock seller: actual / predicted over its finished POs, and the factor to use."""
    from apps.buying.services.valuation import get_global_shrinkage, load_category_stats_dict
    from apps.inventory.models import Item, PurchaseOrder

    today = today or timezone.localdate()
    stats = load_category_stats_dict()
    keep = Decimal('1') - get_global_shrinkage()
    sellers = {m.name.strip().lower() for m in Marketplace.objects.all() if m.name.strip()}
    pos = {
        po.pk: po.vendor.name.strip().lower()
        for po in PurchaseOrder.objects.filter(ordered_date__lte=today - timedelta(days=min_age_days)).select_related('vendor')
        if po.vendor.name.strip().lower() in sellers
    }
    sold = Q(sold_at__isnull=False)
    per_po: dict[int, dict[str, Decimal]] = defaultdict(lambda: {'items': 0, 'sold': 0, 'actual': Decimal('0'), 'predicted': Decimal('0')})
    for row in (
        Item.objects.filter(purchase_order_id__in=list(pos))
        .values('purchase_order_id', 'product__category__name')
        .annotate(items=Count('pk'), sold_n=Count('pk', filter=sold), actual=Sum('sold_for', filter=sold), retail=Sum('retail'))
    ):
        entry = per_po[row['purchase_order_id']]
        entry['items'] += row['items']
        entry['sold'] += row['sold_n']
        entry['actual'] += row['actual'] or Decimal('0')
        rate = recovery_rate(stats, row['product__category__name'] or '')
        entry['predicted'] += (row['retail'] or Decimal('0')) * rate * keep

    ratios: dict[str, list[float]] = defaultdict(list)
    for po_id, entry in per_po.items():
        if not entry['items'] or entry['sold'] * 100 < entry['items'] * min_sold_pct or entry['predicted'] <= 0:
            continue
        ratios[pos[po_id]].append(float(entry['actual'] / entry['predicted']))

    def spread(values: list[float]) -> dict[str, Any]:
        q = quantiles(values, n=4) if len(values) >= 2 else [values[0]] * 3
        return {'n': len(values), 'p25': _r(q[0]), 'median': _r(median(values)), 'p75': _r(q[2])}

    everyone = [r for values in ratios.values() for r in values]
    result: dict[str, Any] = {
        'overall': spread(everyone) if everyone else {'n': 0},
        'by_seller': {name: spread(values) for name, values in sorted(ratios.items(), key=lambda kv: -len(kv[1]))},
        'sellers': {},
        'fitted_on': today.isoformat(),
        'shrink_kept': str(keep),
        'min_age_days': min_age_days,
        'min_sold_pct': min_sold_pct,
    }
    for name, values in ratios.items():
        if len(values) < MIN_TRUCKS:
            continue
        factor = min(max(Decimal(_r(median(values))), CLAMP[0]), CLAMP[1])
        result['sellers'][name] = {'factor': str(factor), 'n': len(values)}
    return result
