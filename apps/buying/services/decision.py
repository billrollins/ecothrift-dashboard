"""
The auction page's decision panel: everything the buyer needs to say yes, no, or how much.

One call (``decision(auction)``) returns:

- ``verdict``: one sentence ("Bid up to $2,050. Fills the kitchen gap, 2 hazards to check,
  cash back in about 38 days. The likely close is near your max, so expect a fight.") and
  the score (Priority);
- ``bids``: the buyer's max (or the model's price target), and three tiers: comfortable
  (more margin), model (the price target), stretch (less margin);
- ``need``: the main category's weeks of supply now, after this lot, and the target;
- ``hazards``: the named ones (worst first) and the checks that came back clean;
- ``profit``: at the current bid, at the max, a likely range, and the break-even bid;
- ``time_to_sell`` and ``landed``: the cost lines at the current bid and what comes back;
- ``similar``: lots from the same seller and category that closed in the last 30 days, and
  a likely-close range; ``seller``: the scorecard from our own won trucks.

It reads what valuation, the manifest analysis and the report cards already stored; the
only queries are the similar lots and the seller scorecard. Nothing here is made up: a
number we do not have is None and the page says so.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from statistics import median
from typing import Any

from django.utils import timezone

from apps.buying.models import Auction, CategoryStats, Outcome
from apps.buying.services.condition import get_condition_shrink, shrink_for
from apps.buying.services.manifest_analysis import HAZARDS
from apps.buying.services.price_target import expected_close, get_profit_factor, handling_costs
from apps.buying.services.recovery import filled_in as recovery_filled_in
from apps.buying.services.recovery import store_rate
from apps.buying.services.seller_factor import seller_factor
from apps.buying.services.valuation import (
    _bid_rates,
    _mix_for_auction,
    auction_speed_from_mix,
    get_global_shrinkage,
    load_category_stats_dict,
    shipping_estimate,
)

CENT = Decimal('0.01')
HIGH_NEED = 65
LOW_NEED = 35
FIGHT_SHARE = Decimal('0.85')
SIMILAR_DAYS = 30
CHECKS = {
    'incomplete': 'No missing-parts lines',
    'part': 'No box-1-of-N lines',
    'zero_retail': 'No $0 lines',
    'bulk_line': 'No lines too big to process',
}


def need_level(score: int | None) -> str | None:
    if score is None:
        return None
    if score >= HIGH_NEED:
        return 'High'
    if score > LOW_NEED:
        return 'Med'
    return 'Low'


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(Decimal(value).quantize(CENT))


def effective_revenue(auction: Auction) -> Decimal:
    """Revenue after shrink, as valuation sees it (override first)."""
    base = auction.revenue_override if auction.revenue_override is not None else (auction.estimated_revenue or Decimal('0'))
    shrink, _ = shrink_for(
        auction.shrinkage_override, auction.condition_summary, get_global_shrinkage(), get_condition_shrink(),
    )
    return (base * (Decimal('1') - shrink)).quantize(CENT)


class _Costs:
    """All-in cost at any bid: fee and a rate-based freight grow with it, the rest is fixed."""

    def __init__(self, auction: Auction):
        self.fee_rate, self.ship_rate = _bid_rates(auction)
        self.fees_fixed = auction.fees_override if auction.fees_override is not None else None
        if auction.shipping_override is not None:
            self.ship_fixed = auction.shipping_override
        elif auction.shipping_quote is not None:
            self.ship_fixed = auction.shipping_quote
        else:
            est = shipping_estimate(auction)
            self.ship_fixed = None if est['basis'] == 'rate' else est['amount']
        handling = handling_costs(auction)
        self.labor = handling['labor']
        self.disposal = handling['disposal']
        self.labor_units = int(handling['units'])
        self.labor_units_basis = handling['units_basis']
        self.disposal_pallets = int(handling['pallets'])
        self.disposal_pallets_basis = handling['pallets_basis']

    def lines(self, bid: Decimal) -> dict[str, Decimal]:
        fee = self.fees_fixed if self.fees_fixed is not None else (bid * (self.fee_rate or 0))
        freight = self.ship_fixed if self.ship_fixed is not None else (bid * (self.ship_rate or 0))
        return {
            'bid': bid,
            'fee': Decimal(fee).quantize(CENT),
            'freight': Decimal(freight).quantize(CENT),
            'labor': self.labor,
            'disposal': self.disposal,
        }

    def total(self, bid: Decimal) -> Decimal:
        return sum(self.lines(bid).values(), Decimal('0')).quantize(CENT)

    def bid_for_cost(self, cost: Decimal) -> Decimal | None:
        """The bid whose all-in cost is ``cost``."""
        fixed = (
            (self.fees_fixed or Decimal('0'))
            + (self.ship_fixed or Decimal('0'))
            + self.labor
            + self.disposal
        )
        rate = Decimal('1') + (Decimal('0') if self.fees_fixed is not None else (self.fee_rate or 0)) + (
            Decimal('0') if self.ship_fixed is not None else (self.ship_rate or 0)
        )
        bid = (cost - fixed) / rate
        return bid.quantize(CENT) if bid > 0 else None


def _spread(summary: dict[str, Any] | None) -> Decimal:
    """How unsure the revenue is: +-10% when every line matched our sales, up to +-45% with none."""
    matched = Decimal(str((summary or {}).get('product_basis_retail_pct') or 0)) / 100
    return (Decimal('0.10') + Decimal('0.35') * (Decimal('1') - matched)).quantize(Decimal('0.01'))


def _need_block(auction: Auction, stats: dict[str, CategoryStats], units: int) -> dict[str, Any]:
    weights = _mix_for_auction(auction)
    block: dict[str, Any] = {'level': need_level(auction.need_score), 'score': auction.need_score}
    if not weights:
        return block
    top, share = max(weights.items(), key=lambda kv: kv[1])
    row = stats.get(str(top))
    block.update({'category': str(top), 'share_pct': round(float(share) * 100)})
    if row is None:
        return block
    cover = row.cover_weeks
    weekly = row.weekly_sales_units or Decimal('0')
    target = row.target_weeks
    after = None
    if cover is not None and weekly > 0 and units:
        after = (cover + Decimal(units) * share / weekly).quantize(Decimal('0.1'))
    block.update({
        'cover_weeks': str(cover) if cover is not None else None,
        'cover_after_weeks': str(after) if after is not None else None,
        'target_weeks': str(target) if target is not None else None,
    })
    if after is not None and target is not None and after > target:
        block['note'] = f'This lot takes {top} past its {target}-week target.'
    return block


def _hazard_block(summary: dict[str, Any] | None) -> dict[str, Any]:
    found = (summary or {}).get('hazards') or {}
    named = sorted(
        (
            {'code': code, 'label': HAZARDS.get(code, code), 'lines': info.get('lines', 0), 'retail_pct': info.get('retail_pct', 0)}
            for code, info in found.items()
        ),
        key=lambda h: -h['retail_pct'],
    )
    clean = [label for code, label in CHECKS.items() if code not in found] if summary else []
    return {'count': len(named), 'named': named, 'clean': clean, 'known': summary is not None}


def _similar(auction: Auction, stats_top: str | None) -> dict[str, Any]:
    since = timezone.now() - timedelta(days=SIMILAR_DAYS)
    qs = (
        Auction.objects.filter(
            marketplace_id=auction.marketplace_id,
            end_time__gte=since,
            end_time__lt=timezone.now(),
            current_price__gt=0,
        )
        .exclude(pk=auction.pk)
        .order_by('-end_time')
    )
    rows = []
    for other in qs[:200]:
        mix = _mix_for_auction(other)
        top = max(mix.items(), key=lambda kv: kv[1])[0] if mix else None
        if stats_top and top != stats_top:
            continue
        if auction.pallet_count and other.pallet_count and abs(other.pallet_count - auction.pallet_count) > 2:
            continue
        rows.append({
            'id': other.pk,
            'title': other.title,
            'category': top,
            'origin_city': other.origin_city,
            'pallets': other.pallet_count,
            'close': _money(other.current_price),
            'retail': _money(other.total_retail_value),
        })
        if len(rows) >= 5:
            break
    closes = [Decimal(r['close']) for r in rows if r['close']]
    likely = expected_close(auction)
    if len(closes) >= 2:
        low, high = min(closes), max(closes)
    elif likely is not None:
        low, high = (likely * Decimal('0.85')).quantize(CENT), (likely * Decimal('1.15')).quantize(CENT)
    else:
        low = high = None
    return {'lots': rows, 'likely_low': _money(low), 'likely_high': _money(high), 'days': SIMILAR_DAYS}


def _seller(auction: Auction) -> dict[str, Any]:
    since = timezone.now() - timedelta(days=90)
    outcomes = Outcome.objects.filter(auction__marketplace_id=auction.marketplace_id)
    won_90 = outcomes.filter(win=True, captured_at__gte=since).count()
    lost_90 = outcomes.filter(win=False, captured_at__gte=since).count()
    from apps.buying.services.won_to_po import report_card

    ratios = []
    for won in Auction.objects.filter(marketplace_id=auction.marketplace_id, purchase_order__isnull=False).select_related(
        'purchase_order', 'outcome',
    )[:50]:
        card = report_card(won)
        if card and card['revenue_vs_predicted_pct'] is not None and (card['actual']['sell_through_pct'] or 0) >= 50:
            ratios.append(card['revenue_vs_predicted_pct'])
    return {
        'name': auction.marketplace.name if auction.marketplace_id else '',
        'won_90_days': won_90,
        'lost_90_days': lost_90,
        'trucks_judged': len(ratios),
        'actual_vs_predicted_pct': round(median(ratios) - 100, 1) if ratios else None,
    }


def _verdict(auction: Auction, *, max_bid: Decimal | None, need: dict, hazards: dict, days: int | None, similar: dict) -> str:
    parts: list[str] = []
    if max_bid:
        parts.append(f'Bid up to ${max_bid:,.0f}.')
    else:
        parts.append('No price target yet: the value is unknown.')
    reasons: list[str] = []
    category = need.get('category')
    if need.get('level') == 'High' and category:
        reasons.append(f'fills the {category.lower()} gap')
    elif need.get('level') == 'Low' and category:
        reasons.append(f'{category.lower()} is well stocked')
    big = [h for h in hazards['named'] if h['retail_pct'] >= 5]
    if hazards['known']:
        reasons.append(f"{len(big)} hazard{'s' if len(big) != 1 else ''} to check" if big else 'no big hazards')
    if days is not None:
        reasons.append(f'cash back in about {days} days')
    if reasons:
        sentence = ', '.join(reasons)
        parts.append(sentence[0].upper() + sentence[1:] + '.')
    high = Decimal(similar['likely_high']) if similar.get('likely_high') else None
    low = Decimal(similar['likely_low']) if similar.get('likely_low') else None
    if max_bid and low is not None and high is not None:
        if low > max_bid:
            parts.append('Similar lots closed above your max, so it will likely get away.')
        elif high >= max_bid * FIGHT_SHARE:
            parts.append('Similar lots closed near your max, so expect a fight.')
        else:
            parts.append('Similar lots closed well under your max.')
    return ' '.join(parts)


def decision(auction: Auction) -> dict[str, Any]:
    stats = load_category_stats_dict()
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else None
    costs = _Costs(auction)
    eff_rev = effective_revenue(auction)
    units = int((summary or {}).get('units') or auction.lot_size or 0)
    price = auction.current_price or Decimal('0')
    factor = get_profit_factor(auction)

    def target_at(f: Decimal) -> Decimal | None:
        if eff_rev <= 0 or f <= 0:
            return None
        return costs.bid_for_cost(eff_rev / f)

    model = auction.price_target or target_at(factor)
    comfortable = target_at(factor * Decimal('1.25'))
    stretch = target_at(max(factor * Decimal('0.75'), Decimal('1.2')))
    max_bid = auction.max_bid or model
    break_even = costs.bid_for_cost(eff_rev) if eff_rev > 0 else None

    profit_now = (eff_rev - costs.total(price)).quantize(CENT) if eff_rev > 0 else None
    profit_at_max = (eff_rev - costs.total(max_bid)).quantize(CENT) if eff_rev > 0 and max_bid else None
    spread = _spread(summary)
    profit_low = (eff_rev * (1 - spread) - costs.total(price)).quantize(CENT) if eff_rev > 0 else None
    profit_high = (eff_rev * (1 + spread) - costs.total(price)).quantize(CENT) if eff_rev > 0 else None
    cost_now = costs.total(price)

    need = _need_block(auction, stats, units)
    hazards = _hazard_block(summary)
    days = (summary or {}).get('days_to_sell')
    speed = auction_speed_from_mix(_mix_for_auction(auction), stats)
    similar = _similar(auction, need.get('category'))
    # A manifest far over the listing's retail is broken (see manifest_analysis.RETAIL_MISMATCH).
    manifest_retail = Decimal((summary or {}).get('retail') or 0) if not (summary or {}).get('retail_mismatch') else Decimal('0')
    retail = manifest_retail or (auction.total_retail_value or Decimal('0'))

    seller_factor_value, seller_factor_entry = seller_factor(auction)
    landed = costs.lines(price)
    return {
        'score': auction.priority,
        'verdict': _verdict(auction, max_bid=max_bid, need=need, hazards=hazards, days=days, similar=similar),
        'bids': {
            'max_bid': _money(max_bid),
            'max_is_buyer': auction.max_bid is not None,
            'comfortable': _money(comfortable),
            'model': _money(model),
            'stretch': _money(stretch),
            'room': _money(max_bid - price) if max_bid else None,
        },
        'need': need,
        'hazards': hazards,
        'profit': {
            'at_current': _money(profit_now),
            'roi_pct': round(float(profit_now / cost_now * 100)) if profit_now is not None and cost_now > 0 else None,
            'at_max': _money(profit_at_max),
            'low': _money(profit_low),
            'high': _money(profit_high),
            'break_even_bid': _money(break_even),
            'per_pallet': _money(profit_now / auction.pallet_count) if profit_now is not None and auction.pallet_count else None,
        },
        'time_to_sell': {
            'days': days,
            'sell_through_30_pct': speed,
        },
        'landed': {
            **{k: _money(v) for k, v in landed.items()},
            'total': _money(cost_now),
            'recovery': _money(eff_rev),
            'profit': _money(profit_now),
            'fee_rate': str(costs.fee_rate) if costs.fee_rate is not None else None,
            # Freight that grows with the bid (a rate estimate); None when it is a fixed amount.
            'ship_rate': str(costs.ship_rate) if costs.ship_fixed is None and costs.ship_rate is not None else None,
            # Labor's unit count and where it came from: manifest, listing or estimate (pallets).
            'labor_units': costs.labor_units,
            'labor_units_basis': costs.labor_units_basis,
            'disposal_pallets': costs.disposal_pallets,
            'disposal_pallets_basis': costs.disposal_pallets_basis,
            'recovery_pct_of_retail': round(float(eff_rev / retail * 100)) if retail > 0 and eff_rev > 0 else None,
            'value_basis_pct': (summary or {}).get('product_basis_retail_pct'),
            # Categories valued at the store-wide rate because they have no sales of their own.
            'filled_categories': sorted(
                str(category) for category in _mix_for_auction(auction) if recovery_filled_in(stats, str(category))
            ),
            'store_rate': str(store_rate(stats)),
            # The seller's factor in the recovery (finished trucks' actual / predicted, R-062).
            'seller_factor': str(seller_factor_value) if seller_factor_entry else None,
            'seller_factor_trucks': (seller_factor_entry or {}).get('n'),
        },
        'similar': similar,
        'seller': _seller(auction),
        'units': units,
        'retail': _money(retail) if retail else None,
    }
