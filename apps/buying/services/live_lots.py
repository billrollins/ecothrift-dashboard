"""The rebuilt auction list (Bill 2026-11-06, buying rebuild step 1; design A4).

One row per live lot: what it should bring in during its first 90 days of selling (Estimate Profit's rates,
the newest ``RecoveryFit``), what it lands at now (price + 5% fee + freight), the most to bid at 20% landed,
and the **room**: bid-up-to minus the current price. Lots with a stored manifest rank first (their estimate
is by category), then by room as a share of retail. Contract lots are listed apart, with no room.

**Live** = open or closing, ends in the future, and seen by a B-Stock search in the last 3 hours
(``last_listed_at``, written only by search results since #75). No AI and no B-Stock call here: table math
over what is stored, cached a minute.

Register: ``buying_auction`` (status, end_time, last_listed_at, retail, price, bids, pallets, city,
shipment type, Buy Now, shipping quote), ``buying_manifestrow`` (stored manifests), ``buying_manifestrequest``
(Get manifest), ``buying_shippingorigin`` (miles), ``buying_recoveryfit``. Fill-ins: no retail = no estimate
("no retail"); no freight = landed without freight, flagged, no room; inside a Buy Now window the Buy Now
price is the price.
"""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import timedelta
from typing import Any

from django.core.cache import cache
from django.db.models import Count, Exists, OuterRef
from django.utils import timezone

from apps.buying.models import Auction, ManifestRequest, ManifestRow, ShippingOrigin, WatchlistEntry
from apps.buying.services import estimate_profit as ep
from apps.buying.services.shipping_formula import city_from_text, city_slug, estimate_for_auction, get_shipping_formula

LIVE_WITHIN = timedelta(hours=3)
CACHE_KEY = 'buying:live-lots:v1'
CACHE_SECONDS = 60
LANDED_PCT = 0.20


_RETAIL_RE = re.compile(r',?\s*(?:Est\.\s*)?Ext\.?\s*Retail\s*\$[\d,]+(?:\.\d+)?', re.I)
_UNITS_RE = re.compile(r',?\s*([\d,]+)\s+(?:Units|Pairs|Items|Pieces|Pcs)\b', re.I)
_CITY_RE = re.compile(r",\s*[A-Z][A-Za-z .'-]+,\s*[A-Z]{2}\s*$")


def short_title(title: str) -> str:
    """The B-Stock title without what the row already shows (retail, units, city)."""
    t = _CITY_RE.sub('', title or '')
    t = _RETAIL_RE.sub('', t)
    t = _UNITS_RE.sub('', t)
    return re.sub(r'\s{2,}', ' ', t).strip(' ,')


def units_from_title(title: str) -> int | None:
    m = _UNITS_RE.search(title or '')
    return int(m.group(1).replace(',', '')) if m else None


def _r(x: float | None) -> float | None:
    return None if x is None else round(float(x), 2)


def _freight(a: Auction, miles: dict[str, int], formula: dict) -> tuple[float | None, str]:
    if a.shipping_override is not None:
        return float(a.shipping_override), 'yours'
    if a.shipping_quote is not None:
        return float(a.shipping_quote), 'B-Stock quote'
    city = (a.origin_city or '').strip() or city_from_text(a.title)
    if not a.pallet_count or not city:
        return None, ''
    a.origin_city = city  # in memory only
    est = estimate_for_auction(a, origin_miles=miles, formula=formula)
    return (float(est['amount']), 'formula') if est else (None, '')


def _lines(rows: list[dict]) -> list[ep.Line]:
    return [ln for ln in (ep.line_from_dict(r) for r in rows) if ln is not None]


def build() -> dict[str, Any]:
    now = timezone.now()
    qs = (
        Auction.objects.filter(
            status__in=[Auction.STATUS_OPEN, Auction.STATUS_CLOSING],
            end_time__gt=now,
            last_listed_at__gte=now - LIVE_WITHIN,
            archived_at__isnull=True,
            marketplace__is_active=True,
        )
        .select_related('marketplace')
        .annotate(
            n_manifest_rows=Count('manifest_rows'),
            watched=Exists(WatchlistEntry.objects.filter(auction_id=OuterRef('pk'))),
        )
        .order_by('end_time')
    )
    lots = list(qs)
    ids = [a.pk for a in lots]
    requests = {
        r.auction_id: r.status
        for r in ManifestRequest.objects.filter(auction_id__in=ids).order_by('requested_at')
    }
    with_rows = [a.pk for a in lots if a.n_manifest_rows]
    raw_by_auction: dict[int, list[dict]] = defaultdict(list)
    for aid, raw in ManifestRow.objects.filter(auction_id__in=with_rows).values_list('auction_id', 'raw_data'):
        if isinstance(raw, dict):
            raw_by_auction[aid].append(raw)
    slugs = {city_slug((a.origin_city or '').strip() or city_from_text(a.title) or '') for a in lots}
    miles = dict(ShippingOrigin.objects.filter(slug__in=slugs, miles__isnull=False).values_list('slug', 'miles'))
    formula = get_shipping_formula()
    rates: dict[str, Any] = {}
    seller_note: dict[str, str] = {}
    for slug in {a.marketplace.slug for a in lots}:
        got, why = ep.recovery_rates(slug) if slug in ep.SELLERS else (None, '')
        rates[slug] = got
        if got is None:
            seller_note[slug] = 'not yet' if why != 'no_fit' else 'no fit yet'

    rows, contract = [], []
    for a in lots:
        is_contract = (a.listing_type or '').strip().upper() == Auction.LISTING_TYPE_CONTRACT
        retail = float(a.total_retail_value) if a.total_retail_value else None
        buy_now_live = bool(a.buy_now_price and a.buy_now_ends_at and a.buy_now_ends_at > now)
        price = float(a.buy_now_price) if buy_now_live else (float(a.current_price) if a.current_price is not None else None)
        r = rates.get(a.marketplace.slug)
        brings = None
        method = ''
        lines = _lines(raw_by_auction.get(a.pk, []))
        if r is not None and lines:
            shelf = (a.end_time.date() if a.end_time else now.date()) + timedelta(days=ep.LEAD_DAYS)
            m = ep.manifest_estimate(lines, shelf, r)
            if retail and abs(m['retail'] - retail) / retail > ep.WRONG_MANIFEST_DIFF:
                lines = []  # probably another lot's manifest: price the whole truck
            else:
                brings = {'low': m['low'], 'likely': m['likely'], 'high': m['high']}
                method = 'manifest'
                retail = m['retail']
        if r is not None and brings is None and retail:
            lo, li, hi = r.whole_band()
            brings = {'low': retail * lo, 'likely': retail * li, 'high': retail * hi}
            method = 'whole truck'
        freight, freight_basis = _freight(a, miles, formula)
        landed = price * (1 + ep.FEE_RATE) + (freight or 0.0) if price is not None else None
        bid_up_to = (
            max((retail * LANDED_PCT - freight) / (1 + ep.FEE_RATE), 0.0)
            if retail and freight is not None and not is_contract
            else None
        )
        room = bid_up_to - (price or 0.0) if bid_up_to is not None else None
        # Profit if he wins at his max: landed is then exactly 20% of retail, whatever the price is now.
        profit_at_max = brings['likely'] - retail * LANDED_PCT if brings and retail and bid_up_to is not None else None
        if bid_up_to is None or price is None:
            reach = ''
        elif price > bid_up_to:
            reach = 'over'
        elif buy_now_live:
            reach = 'buy_now'
        elif not a.bid_count:
            reach = 'no_bids'
        else:
            reach = 'under'
        row = {
            'id': a.pk,
            'seller': a.marketplace.name,
            'seller_slug': a.marketplace.slug,
            'title': a.title,
            'short_title': short_title(a.title),
            'units': units_from_title(a.title),
            'url': a.url,
            'retail': _r(retail),
            'retail_source': 'manifest' if method == 'manifest' else 'B-Stock',
            'price': _r(price),
            'price_basis': 'Buy Now' if buy_now_live else ('contract price' if is_contract else 'current bid'),
            'bids': a.bid_count or 0,
            'ends': a.end_time.isoformat() if a.end_time else None,
            'pallets': a.pallet_count,
            'city': (a.origin_city or '').strip() or city_from_text(a.title) or '',
            'manifest': 'yes' if a.n_manifest_rows else (requests.get(a.pk) or 'none'),
            'manifest_eligible': bool((a.lot_id or '').strip()) and not a.manifest_pull_blocked and not is_contract,
            'watched': bool(a.watched),
            'method': method,
            'estimate_note': '' if brings else (seller_note.get(a.marketplace.slug) or ('no retail' if not retail else 'not yet')),
            'brings_in': {k: _r(v) for k, v in brings.items()} if brings else None,
            'freight': _r(freight),
            'freight_basis': freight_basis,
            'landed': _r(landed),
            'landed_pct': round(landed / retail, 4) if landed is not None and retail else None,
            'bid_up_to': _r(bid_up_to),
            'room': _r(room),
            'room_pct': round(room / retail, 4) if room is not None and retail else None,
            'profit_at_max': _r(profit_at_max),
            'reach': reach,
        }
        (contract if is_contract else rows).append(row)

    # Already over his max last; then a stored manifest first (a category estimate); then the profit if he wins
    # at his max. The price now does not rank: an opening bid says little about where a lot closes.
    rows.sort(key=lambda x: (x['reach'] == 'over', x['method'] != 'manifest', x['profit_at_max'] is None,
                             -(x['profit_at_max'] or 0)))
    last_listed = Auction.objects.filter(last_listed_at__isnull=False).order_by('-last_listed_at').values_list(
        'last_listed_at', flat=True
    ).first()
    return {
        'generated_at': now.isoformat(),
        'last_listed_at': last_listed.isoformat() if last_listed else None,
        'landed_pct': LANDED_PCT,
        'fit_id': next((r.fit_id for r in rates.values() if r is not None), None),
        'lots': rows,
        'contract': contract,
    }


def live_lots(*, use_cache: bool = True) -> dict[str, Any]:
    if use_cache:
        hit = cache.get(CACHE_KEY)
        if hit is not None:
            return hit
    out = build()
    cache.set(CACHE_KEY, out, CACHE_SECONDS)
    return out
