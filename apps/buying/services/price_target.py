"""
Buying Phase 5: a price target (buy at or under it) and a likely close for each auction.

**Price target** is the most we can pay and still make the profit factor (revenue / all-in
cost; 2.0 means double the money, ``profit_target_override`` or the Assumptions setting
``buying_profit_factor``). Costs that grow with the bid (B-Stock's fee %, a shipping-rate
estimate) are solved for; fixed ones (overrides, a B-Stock shipping quote, a distance or
per-pallet estimate) are taken off first:

    target = (effective revenue after shrink / factor - fixed costs) / (1 + fee rate + ship rate)

It is the server's copy of the auction page's "max bid" (``frontend/src/utils/auctionMaxBid.ts``),
so the wish list and the page agree.

**Likely close** is what the auction will probably sell for, for the "can we win it at our
price?" question: listed retail x the close ratio for that seller and condition (R-053: ended
auctions, close / retail median), and, near the end, the current price x the late bump (R-053
found none: 1.00 on 28 auctions, so it is 1.00 until snapshots say otherwise). The ratios can
be replaced from Assumptions (``buying_close_model``, JSON); ``fit_close_model`` fits them.
"""
from __future__ import annotations

import time
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.utils import timezone

from apps.buying.models import Auction
from apps.core.models import AppSetting

CENT = Decimal('0.01')
DEFAULT_PROFIT_FACTOR = Decimal('2.0')

# Close / listed retail, median over ended auctions (R-053, 2026-09-24; n = 16,863).
DEFAULT_CLOSE_MODEL: dict[str, Any] = {
    'default': '0.065',
    'sellers': {
        'target': '0.068',
        'walmart': '0.075',
        'amazon': '0.066',
        'costco': '0.081',
        'home depot': '0.021',
        'homedepot': '0.021',
        'wayfair': '0.033',
    },
    # Seller|condition group -> ratio, where a fit has enough auctions (fit_close_model).
    'cells': {},
    # Price x this when the auction is this close to its end. R-033 said x1.17 in the last hour
    # (n = 19); R-053 found 1.00 (n = 28). Kept at 1.00 until the snapshots settle it.
    'bump_last_hour': '1.00',
    'bump_last_3_hours': '1.00',
}


_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_SECONDS = 60


def _setting(key: str) -> Any:
    """AppSetting value, cached a minute: a sweep values thousands of auctions."""
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < _CACHE_SECONDS:
        return hit[1]
    row = AppSetting.objects.filter(key=key).values_list('value', flat=True).first()
    _CACHE[key] = (now, row)
    return row


def clear_cache() -> None:
    _CACHE.clear()


def get_profit_factor(auction: Auction | None = None) -> Decimal:
    if auction is not None and auction.profit_target_override is not None and auction.profit_target_override > 0:
        return auction.profit_target_override
    try:
        value = Decimal(str(_setting('buying_profit_factor')))
        return value if value > 0 else DEFAULT_PROFIT_FACTOR
    except Exception:
        return DEFAULT_PROFIT_FACTOR


def get_close_model() -> dict[str, Any]:
    value = _setting('buying_close_model')
    if isinstance(value, dict):
        merged = dict(DEFAULT_CLOSE_MODEL)
        merged.update(value)
        return merged
    return DEFAULT_CLOSE_MODEL


def price_target(
    auction: Auction,
    *,
    effective_revenue: Decimal,
    fees: Decimal,
    shipping: Decimal,
    fee_rate: Decimal | None,
    ship_rate: Decimal | None,
    extra_fixed: Decimal = Decimal('0'),
) -> Decimal | None:
    """
    Max hammer at the profit factor. ``fee_rate`` / ``ship_rate`` are the rates that grow with
    the bid (None when that cost is fixed: an override, a quote, or a pallet or distance
    estimate); a fixed cost is taken at its amount.
    """
    if effective_revenue is None or effective_revenue <= 0:
        return None
    factor = get_profit_factor(auction)
    fixed = (
        (fees if fee_rate is None else Decimal('0'))
        + (shipping if ship_rate is None else Decimal('0'))
        + (extra_fixed or Decimal('0'))
    )
    target = (effective_revenue / factor - fixed) / (Decimal('1') + (fee_rate or 0) + (ship_rate or 0))
    if target <= 0:
        return None
    return target.quantize(CENT)


def _seller_ratio(auction: Auction, model: dict[str, Any]) -> Decimal:
    """Close / retail: the seller and condition cell, else the seller, else the default."""
    from apps.buying.services.condition import condition_group

    name = ' '.join(
        part for part in (
            getattr(auction.marketplace, 'name', '') if auction.marketplace_id else '',
            getattr(auction.marketplace, 'slug', '') if auction.marketplace_id else '',
        ) if part
    ).lower()
    cells = model.get('cells') or {}
    if cells:
        group = condition_group(auction.condition_summary)
        for key, ratio in cells.items():
            seller, _, cell_group = key.partition('|')
            if seller and cell_group == group and seller.lower() in name:
                return Decimal(str(ratio))
    for key, ratio in (model.get('sellers') or {}).items():
        if key and key.lower() in name:
            return Decimal(str(ratio))
    return Decimal(str(model.get('default', DEFAULT_CLOSE_MODEL['default'])))


def expected_close(auction: Auction, *, now=None) -> Decimal | None:
    """Likely hammer price: retail x seller ratio, or the current price with the late bump."""
    model = get_close_model()
    now = now or timezone.now()
    retail = auction.total_retail_value or Decimal('0')
    by_retail = (retail * _seller_ratio(auction, model)).quantize(CENT) if retail > 0 else None
    price = auction.current_price or Decimal('0')
    by_price = None
    if price > 0 and auction.end_time:
        left = auction.end_time - now
        if timedelta(0) <= left <= timedelta(hours=1):
            by_price = price * Decimal(str(model.get('bump_last_hour', '1.00')))
        elif timedelta(0) <= left <= timedelta(hours=3):
            by_price = price * Decimal(str(model.get('bump_last_3_hours', '1.00')))
        else:
            by_price = price
        by_price = by_price.quantize(CENT)
    candidates = [c for c in (by_retail, by_price) if c is not None]
    if not candidates:
        return None
    # Near the end the price itself is the best guess; earlier, it can only go up.
    if auction.end_time and timedelta(0) <= auction.end_time - now <= timedelta(hours=3) and by_price is not None:
        return by_price
    return max(candidates)


def get_revenue_calibration() -> Decimal:
    """Report cards' actual / predicted revenue (Phase 6), 1.0 until enough trucks back it."""
    try:
        value = Decimal(str(_setting('buying_revenue_calibration')))
        return value if value > 0 else Decimal('1')
    except Exception:
        return Decimal('1')


def _setting_money(key: str) -> Decimal:
    try:
        value = Decimal(str(_setting(key)))
        return value if value > 0 else Decimal('0')
    except Exception:
        return Decimal('0')


UNITS_PER_PALLET_FALLBACK = Decimal('60')
UNITS_PER_PALLET_DAYS = 180


def units_per_pallet() -> Decimal:
    """
    Typical units per pallet: the median over listings of the last 180 days that give both
    (cached a minute). The fill-in for a lot that lists pallets but no unit count.
    """
    from django.db import connection

    now = time.monotonic()
    hit = _CACHE.get('_units_per_pallet')
    if hit and now - hit[0] < _CACHE_SECONDS:
        return hit[1]
    table = Auction._meta.db_table
    with connection.cursor() as cursor:
        cursor.execute(
            f'SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lot_size::float / pallet_count) '
            f'FROM {table} WHERE lot_size > 0 AND pallet_count > 0 AND end_time >= %s',
            [timezone.now() - timedelta(days=UNITS_PER_PALLET_DAYS)],
        )
        row = cursor.fetchone()
    value = Decimal(str(round(row[0], 1))) if row and row[0] else UNITS_PER_PALLET_FALLBACK
    _CACHE['_units_per_pallet'] = (now, value)
    return value


def handling_costs(auction: Auction) -> dict[str, Any]:
    """
    Labor to process the lot and disposal for what is thrown away: Assumptions
    ``buying_labor_per_item`` ($ per unit) and ``buying_disposal_per_pallet``. Both start at
    $0, so they change nothing until set; then they count in the landed cost and the target.

    Units come from the manifest, else the listing. A lot with pallets but no unit count gets
    pallets x ``units_per_pallet()``, labelled ``estimate`` (29% of dev's live lots, 2026-09-24),
    so labor is not silently $0; a lot with units but no pallet count gets its pallets the
    same way for disposal.
    """
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else {}
    labor_rate = _setting_money('buying_labor_per_item')
    if summary.get('units'):
        units, basis = Decimal(summary['units']), 'manifest'
    elif auction.lot_size:
        units, basis = Decimal(auction.lot_size), 'listing'
    elif auction.pallet_count and labor_rate > 0:
        units, basis = (Decimal(auction.pallet_count) * units_per_pallet()).quantize(Decimal('1')), 'estimate'
    else:
        units, basis = Decimal('0'), 'none'
    labor = (labor_rate * units).quantize(CENT)
    disposal_rate = _setting_money('buying_disposal_per_pallet')
    pallets, pallets_basis = Decimal(auction.pallet_count or 0), 'listing' if auction.pallet_count else 'none'
    if not pallets and disposal_rate > 0 and basis in ('manifest', 'listing') and units > 0:
        # The other way round: units but no pallet count.
        pallets = max((units / units_per_pallet()).quantize(Decimal('1')), Decimal('1'))
        pallets_basis = 'estimate'
    disposal = (disposal_rate * pallets).quantize(CENT)
    return {
        'labor': labor,
        'disposal': disposal,
        'units': units,
        'units_basis': basis,
        'pallets': pallets,
        'pallets_basis': pallets_basis,
    }
