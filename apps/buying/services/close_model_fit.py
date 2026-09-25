"""
Fit the likely-close model (``price_target.expected_close``) from our own ended auctions.

- **Close ÷ retail** per seller: the median over the last ``days`` of ended auctions with a
  listed retail and a final price. A seller gets its own ratio at ``MIN_SELLER_N`` auctions
  or more; the rest share the overall median. The same for each seller and condition group
  (R-053: new closes near 0.084 of retail, damaged near 0.037), as ``cells``.
- **The late bump**: final price ÷ the price 45–75 minutes before the end (the last hour),
  and 150–210 minutes before (the last 3 hours), from the sweep's price snapshots. It needs
  a snapshot within ``FINAL_WITHIN`` of the end (else the stored price may itself be early),
  and ``MIN_BUMP_N`` auctions; otherwise the current bump is kept.

``fit_close_model`` (the command) reports it, and ``--save`` stores it as the Assumptions
setting ``buying_close_model``. After a save, ``recompute_buying_valuations`` refreshes every
open auction's likely close.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from statistics import median
from typing import Any

from django.utils import timezone

from apps.buying.models import Auction, AuctionSnapshot
from apps.buying.services.condition import condition_group
from apps.buying.services.price_target import DEFAULT_CLOSE_MODEL, get_close_model

MIN_SELLER_N = 30
# R-063: 19 auctions fitted a 1.30 bump that R-061 (163 auctions) did not see; a bump needs many.
MIN_BUMP_N = 50
FINAL_WITHIN = timedelta(minutes=15)
HOUR_WINDOW = (timedelta(minutes=45), timedelta(minutes=75))
THREE_HOUR_WINDOW = (timedelta(minutes=150), timedelta(minutes=210))


def _r(value: float) -> str:
    return f'{value:.3f}'


def _ended(days: int, now):
    return (
        Auction.objects.filter(
            end_time__lt=now,
            end_time__gte=now - timedelta(days=days),
            total_retail_value__gt=0,
            current_price__gt=0,
        )
        .exclude(listing_type=Auction.LISTING_TYPE_CONTRACT)
        .select_related('marketplace')
    )


def _bumps(auctions: list[Auction]) -> dict[str, list[float]]:
    """Final ÷ earlier price, for auctions whose last snapshot is close to the end."""
    by_auction: dict[int, list[tuple]] = defaultdict(list)
    ids = [a.pk for a in auctions]
    for chunk in range(0, len(ids), 2000):
        for auction_id, captured_at, price in AuctionSnapshot.objects.filter(
            auction_id__in=ids[chunk:chunk + 2000], price__gt=0,
        ).values_list('auction_id', 'captured_at', 'price'):
            by_auction[auction_id].append((captured_at, price))
    out: dict[str, list[float]] = {'hour': [], 'three_hours': []}
    for auction in auctions:
        snaps = sorted(by_auction.get(auction.pk, []))
        if not snaps or auction.end_time - snaps[-1][0] > FINAL_WITHIN:
            continue
        final = float(auction.current_price)
        for key, (near, far) in (('hour', HOUR_WINDOW), ('three_hours', THREE_HOUR_WINDOW)):
            earlier = [p for at, p in snaps if near <= auction.end_time - at <= far]
            if earlier and earlier[-1] > 0:
                out[key].append(final / float(earlier[-1]))
    return out


def fit_close_model(*, days: int = 180, now=None) -> dict[str, Any]:
    """The fitted model (same shape as ``DEFAULT_CLOSE_MODEL``) and the numbers behind it."""
    now = now or timezone.now()
    auctions = list(_ended(days, now))
    ratios: dict[str, list[float]] = defaultdict(list)
    cells: dict[str, list[float]] = defaultdict(list)
    overall: list[float] = []
    for auction in auctions:
        ratio = float(auction.current_price / auction.total_retail_value)
        if ratio <= 0 or ratio > 1:
            continue  # a bad listed retail, not a close
        overall.append(ratio)
        name = (auction.marketplace.name if auction.marketplace_id else '').strip().lower()
        if name:
            ratios[name].append(ratio)
            cells[f'{name}|{condition_group(auction.condition_summary)}'].append(ratio)
    current = get_close_model()
    fitted = {name: _r(median(values)) for name, values in sorted(ratios.items()) if len(values) >= MIN_SELLER_N}
    model: dict[str, Any] = {
        'default': _r(median(overall)) if overall else current.get('default', DEFAULT_CLOSE_MODEL['default']),
        # A seller too thin to fit keeps the ratio it had.
        'sellers': {**(current.get('sellers') or {}), **fitted},
        'cells': {key: _r(median(values)) for key, values in sorted(cells.items()) if len(values) >= MIN_SELLER_N},
    }
    bumps = _bumps(auctions)
    for key, setting in (('hour', 'bump_last_hour'), ('three_hours', 'bump_last_3_hours')):
        values = bumps[key]
        model[setting] = _r(median(values)) if len(values) >= MIN_BUMP_N else current.get(setting)
    model['fitted_on'] = timezone.localdate().isoformat()
    model['fitted_days'] = days
    return {
        'model': model,
        'n': len(overall),
        'sellers': {
            name: {'n': len(values), 'median': _r(median(values)), 'own_ratio': len(values) >= MIN_SELLER_N}
            for name, values in sorted(ratios.items(), key=lambda kv: -len(kv[1]))
        },
        'bumps': {key: {'n': len(values), 'median': _r(median(values)) if values else None} for key, values in bumps.items()},
        'current': current,
    }


def to_decimal_model(model: dict[str, Any]) -> dict[str, Any]:
    """Only the keys ``expected_close`` reads, for storing in Assumptions."""
    keep = {k: model[k] for k in ('default', 'sellers', 'cells', 'bump_last_hour', 'bump_last_3_hours') if model.get(k) is not None}
    for key in ('default', 'bump_last_hour', 'bump_last_3_hours'):
        if key in keep:
            keep[key] = str(Decimal(str(keep[key])))
    keep['fitted_on'] = model.get('fitted_on')
    return keep
