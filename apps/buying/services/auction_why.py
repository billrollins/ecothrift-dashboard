"""
One short line per auction: why it ranks where it does (bstock_daily_buying Phase 3).

Built only from stored fields and CategoryStats (no queries per auction), for example:
``Need 72 (Kitchen 40%) · profit 38% · sells fast · Used fair · shipping 41% of cost · AI mix``
"""
from __future__ import annotations

from decimal import Decimal

from apps.buying.models import Auction, CategoryStats
from apps.buying.services.condition import CONDITION_LABEL, DAMAGED, USED_FAIR, condition_group
from apps.buying.services.valuation import _mix_for_auction, auction_speed_from_mix, get_valuation_source

FAST_SPEED = 45  # 30-day sell-through % (store range about 12 to 69, runner R-025 / 2026-09-23)
SLOW_SPEED = 20
HEAVY_SHIPPING_SHARE = Decimal('0.35')

SHORT_CATEGORY = {
    'Apparel & accessories': 'Apparel',
    'Health, beauty & personal care': 'Health & beauty',
    'Home décor & lighting': 'Home décor',
    'Household & cleaning': 'Household',
    'Kitchen & dining': 'Kitchen',
    'Office & school supplies': 'Office',
    'Outdoor & patio furniture': 'Outdoor furniture',
    'Party, seasonal & novelty': 'Party & seasonal',
    'Storage & organization': 'Storage',
    'Mixed lots & uncategorized': 'Mixed',
}


def auction_why(auction: Auction, stats: dict[str, CategoryStats]) -> str:
    parts: list[str] = []
    weights = _mix_for_auction(auction)
    source = get_valuation_source(auction)

    if auction.need_score is not None:
        need = f'Need {int(auction.need_score)}'
        if weights:
            top, share = max(weights.items(), key=lambda kv: kv[1])
            need += f' ({SHORT_CATEGORY.get(top, top)} {int(round(float(share) * 100))}%)'
        parts.append(need)

    if auction.profitability_ratio is not None and source != 'none':
        parts.append(f'profit {int(round(float(auction.profitability_ratio) * 100))}%')
    else:
        parts.append('no profit estimate')

    speed = auction_speed_from_mix(weights, stats)
    if speed is not None:
        if speed >= FAST_SPEED:
            parts.append('sells fast')
        elif speed <= SLOW_SPEED:
            parts.append('sells slow')

    group = condition_group(auction.condition_summary)
    if group in (USED_FAIR, DAMAGED):
        parts.append(CONDITION_LABEL[group])

    ship, total = auction.estimated_shipping, auction.estimated_total_cost
    if ship is not None and total and total > 0 and ship / total >= HEAVY_SHIPPING_SHARE:
        parts.append(f'shipping {int(round(float(ship / total) * 100))}% of cost')

    if source == 'ai':
        parts.append('AI mix')
    elif source == 'none':
        parts.append('no mix yet')
    return ' · '.join(parts)
