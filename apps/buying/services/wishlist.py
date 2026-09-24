"""
Buying Phase 5: the wish list, the few live auctions worth bidding on.

Each auction on it has a price target (buy at or under), a likely close, the truck score
(Priority: Need, profit and speed blended), how badly we need it, a duration estimate,
its hazards, and why we want it or might not. Prices move with the sweep and the watchlist
poll; an auction whose price passes its target drops off (``state='over'``; shown only
when asked for). The app never bids: the buyer bids by hand near the end.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.db.models import F, Q
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.buying.models import Auction, CategoryStats, WatchlistEntry
from apps.buying.services.auction_why import auction_why
from apps.buying.services.manifest_analysis import HAZARDS
from apps.buying.services.condition import get_condition_shrink, shrink_for
from apps.buying.services.decision import _spread, need_level
from apps.buying.services.valuation import _mix_for_auction, get_global_shrinkage, load_category_stats_dict

IN_RANGE = 'in_range'
LIKELY_OVER = 'likely_over'
OVER = 'over'

MAX_ROWS = 60
HAZARD_WHY_NOT_PCT = 5.0
LOW_NEED = 35
FEW_MATCHED_PCT = 20.0
HEAVY_SHIPPING = Decimal('0.35')
SLOW_DAYS = 90

HAZARD_PHRASE = {
    'incomplete': 'missing pieces or not working',
    'part': 'boxes of a set (box 1 of N)',
    'fragile': 'breakable',
    'high_value': 'high value (theft, damage or a wrong retail)',
    'zero_retail': 'no retail price',
    'bulk_line': 'lines too big for processing',
    'high_volume': 'the same item in bulk',
    'slow': 'slow sellers for us',
    'stocked': 'items we already have plenty of',
}


def price_state(auction: Auction) -> str | None:
    target = auction.price_target
    if target is None:
        return None
    price = auction.current_price or Decimal('0')
    if price > target:
        return OVER
    if auction.expected_close is not None and auction.expected_close > target:
        return LIKELY_OVER
    return IN_RANGE


def days_to_sell(auction: Auction, stats: dict[str, CategoryStats]) -> int | None:
    """Manifest analysis when there is one, else the category mix x each median."""
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else {}
    if summary.get('days_to_sell') is not None:
        return int(summary['days_to_sell'])
    weights = _mix_for_auction(auction)
    total = Decimal('0')
    weight = Decimal('0')
    for cat, w in weights.items():
        row = stats.get(str(cat))
        days = getattr(row, 'median_days_to_sell', None) if row is not None else None
        if days is not None:
            total += w * Decimal(days)
            weight += w
    return int((total / weight).quantize(Decimal('1'))) if weight > 0 else None


def why_not(auction: Auction, *, days: int | None) -> list[str]:
    reasons: list[str] = []
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else None
    if summary is None:
        reasons.append('No manifest lines yet: the value is a guess from the listing')
    else:
        if (summary.get('matched_retail_pct') or 0) < FEW_MATCHED_PCT:
            reasons.append(
                f"Only {summary.get('matched_retail_pct', 0)}% of retail matches products we know; "
                'the value leans on category rates'
            )
        for code, info in (summary.get('hazards') or {}).items():
            pct = info.get('retail_pct') or 0
            if pct >= HAZARD_WHY_NOT_PCT:
                reasons.append(f'{pct:g}% of retail is {HAZARD_PHRASE.get(code, HAZARDS.get(code, code))}')
    if auction.need_score is not None and auction.need_score <= LOW_NEED:
        reasons.append('We have plenty in these categories (low Need)')
    target = auction.price_target
    if target is not None and auction.expected_close is not None and auction.expected_close > target:
        reasons.append(f'Likely to close around ${auction.expected_close:,.0f}, over our ${target:,.0f}')
    cost = auction.estimated_total_cost or Decimal('0')
    if cost > 0 and (auction.estimated_shipping or Decimal('0')) / cost >= HEAVY_SHIPPING:
        reasons.append('Shipping is a big share of the cost')
    if days is not None and days > SLOW_DAYS:
        reasons.append(f'Slow to sell: about {days} days')
    return reasons


def _hazard_list(auction: Auction) -> list[dict[str, Any]]:
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else {}
    out = []
    for code, info in (summary.get('hazards') or {}).items():
        out.append({'code': code, 'lines': info.get('lines', 0), 'retail_pct': info.get('retail_pct', 0)})
    return sorted(out, key=lambda h: -h['retail_pct'])


RANKS = {
    'focus': lambda r: (-(r['priority'] or 0), _end_key(r)),
    'profit': lambda r: (-_num(r['est_profit']), -(r['priority'] or 0)),
    'need': lambda r: (-(r['need_score'] or 0), -(r['priority'] or 0)),
    'speed': lambda r: (r['days_to_sell'] if r['days_to_sell'] is not None else 10_000, -(r['priority'] or 0)),
    'ending': lambda r: (_end_key(r), -(r['priority'] or 0)),
}
CANDIDATES = 400


def _end_key(row) -> float:
    end = row.get('end_time')
    return end.timestamp() if end is not None else float('inf')


def _num(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float('-inf')


def build_wishlist(
    *,
    include_over: bool = False,
    rank: str = 'focus',
    category: str | None = None,
    now=None,
) -> dict[str, Any]:
    """
    The rows (``results``), how many live auctions there are (``live_total``) and how many
    pass (``eligible``). ``rank``: focus (Priority), profit, need, speed (days to sell) or
    ending. ``category``: only lots whose main category it is.
    """
    now = now or timezone.now()
    stats = load_category_stats_dict()
    live = Auction.objects.filter(
        status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
        archived_at__isnull=True,
        end_time__gt=now,
    ).exclude(listing_type=Auction.LISTING_TYPE_CONTRACT)
    live_total = live.count()
    qs = live.filter(price_target__isnull=False).select_related('marketplace')
    if not include_over:
        ceiling = Coalesce(F('max_bid'), F('price_target'))
        qs = qs.filter(Q(current_price__isnull=True) | Q(current_price__lte=ceiling))
    candidates = list(qs.order_by('-priority', 'end_time')[:CANDIDATES])
    watched = set(
        WatchlistEntry.objects.filter(auction_id__in=[a.pk for a in candidates]).values_list('auction_id', flat=True)
    )
    global_shrink = get_global_shrinkage()
    condition_shrink = get_condition_shrink()
    rows = []
    for auction in candidates:
        weights = _mix_for_auction(auction)
        top = max(weights.items(), key=lambda kv: kv[1])[0] if weights else None
        if category and top != category:
            continue
        rows.append(_row(auction, stats, top, watched, global_shrink, condition_shrink))
    rows.sort(key=RANKS.get(rank, RANKS['focus']))
    return {'results': rows[:MAX_ROWS], 'eligible': len(rows), 'live_total': live_total}


def _row(auction, stats, top, watched, global_shrink, condition_shrink) -> dict[str, Any]:
    days = days_to_sell(auction, stats)
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else None
    max_bid = auction.max_bid or auction.price_target
    price = auction.current_price or Decimal('0')
    shrink, _ = shrink_for(auction.shrinkage_override, auction.condition_summary, global_shrink, condition_shrink)
    base = auction.revenue_override if auction.revenue_override is not None else (auction.estimated_revenue or Decimal('0'))
    eff = base * (Decimal('1') - shrink)
    spread = _spread(summary)
    profit = auction.est_profit
    low = (profit - eff * spread).quantize(Decimal('1')) if profit is not None else None
    high = (profit + eff * spread).quantize(Decimal('1')) if profit is not None else None
    hazards = _hazard_list(auction)
    return {
        'id': auction.pk,
        'title': auction.title,
        'marketplace': auction.marketplace.name if auction.marketplace_id else '',
        'url': auction.url,
        'top_category': top,
        'origin_city': auction.origin_city,
        'total_retail_value': auction.total_retail_value,
        'lot_size': auction.lot_size,
        'end_time': auction.end_time,
        'current_price': auction.current_price,
        'bid_count': auction.bid_count,
        'price_target': auction.price_target,
        'max_bid': max_bid,
        'max_is_buyer': auction.max_bid is not None,
        'room': (max_bid - price) if max_bid is not None else None,
        'expected_close': auction.expected_close,
        'state': price_state(auction),
        'priority': auction.priority,
        'need_score': auction.need_score,
        'need_level': need_level(auction.need_score),
        'est_profit': profit,
        'profit_low': low,
        'profit_high': high,
        'profitability_ratio': auction.profitability_ratio,
        'estimated_revenue': auction.estimated_revenue,
        'estimated_total_cost': auction.estimated_total_cost,
        'pallet_count': auction.pallet_count,
        'condition_summary': auction.condition_summary,
        'days_to_sell': days,
        'has_analysis': summary is not None,
        'matched_retail_pct': summary.get('matched_retail_pct') if summary else None,
        'hazards': hazards,
        'hazard_count': sum(1 for h in hazards if h['retail_pct'] >= HAZARD_WHY_NOT_PCT),
        'why': auction_why(auction, stats),
        'why_not': why_not(auction, days=days),
        'watched': auction.pk in watched,
    }


def buying_strip() -> dict[str, Any]:
    """
    The numbers above the list that we really have: won and not yet paid, stock on order,
    and stock in the building not yet on the shelf. Cash and floor space are not tracked,
    so they are not shown. ``won_today`` is for the daily goal (1 or 2 lots a day).
    """
    from django.db.models import Count, Min, Sum

    from apps.buying.models import Outcome
    from apps.inventory.models import Item, PurchaseOrder

    unpaid = PurchaseOrder.objects.filter(buying_auctions__isnull=False, status='ordered').aggregate(
        n=Count('pk', distinct=True), total=Sum('total_cost'),
    )
    stats = CategoryStats.objects.aggregate(
        on_order_retail=Sum('on_order_retail'),
        on_order_units=Sum('on_order_units'),
        in_building_retail=Sum('in_building_retail'),
        in_building_units=Sum('in_building_units'),
    )
    oldest = Item.objects.filter(status__in=['intake', 'processing']).aggregate(first=Min('created_at'))['first']
    return {
        'won_today': Outcome.objects.filter(win=True, captured_at__date=timezone.localdate()).count(),
        'won_unpaid': {'lots': unpaid['n'] or 0, 'total': unpaid['total']},
        'on_order': {'units': stats['on_order_units'] or 0, 'retail': stats['on_order_retail']},
        'in_building': {
            'units': stats['in_building_units'] or 0,
            'retail': stats['in_building_retail'],
            'oldest_days': (timezone.now() - oldest).days if oldest else None,
        },
    }
