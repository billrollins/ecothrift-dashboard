"""Estimate Profit, ship 1 (Dash Update #73): what a B-Stock lot should bring in, and the most to bid.

Design: ``.ai/reference/buying-auctions-mvp/design.md`` (A2 rules). Rates changed on Bill's word 11-05
(owner-qa-log): **per seller + seller category, from every item we sold there: sum(sale price) /
sum(retail)**. Sold items only, so it over counts (no shrink, dispute wins, misfits, bad reconciles)
and under counts; Bill accepts optimistic. Measured on the 8 Target trucks (``workspace/b73/loo_sold.py``):
it lands a median 15.7 points of retail above what they have sold so far (worst 29.7).

- With a manifest (dropped CSV, else the lot's stored rows): sum over seller categories of
  ``retail x rate`` (likely), band x0.7 / x1.3. A category with under 5 sold items uses the seller's
  average over all its sold items (counted toward "weak estimate").
- Without one: whole truck, ``retail x the seller's average``, labelled wide.
- Season rule (Target): Halloween (SEASONAL lines, season date Nov 1) and Christmas (TRIM A TREE lines,
  Thanksgiving) use a hand-set late or in-time rate from the shelf date (close date + lead time).
- Missing-pieces rule: a line that says "missing pieces" uses its low rate as likely.
- Landed = price + 5% fee + freight (typed, else the shipping formula). Bid up to
  ``(retail x pct - freight) / 1.05`` at 20% and 23% landed.

Register: reads ``inventory_item`` (sold_at, sold_for, retail, manifest_row, purchase_order),
``inventory_manifestrow.taxonomy.seller_category``, ``inventory_purchaseorder`` / ``inventory_vendor``
(seller), ``buying_auction``, ``buying_manifestrow.raw_data`` (the B-Stock CSV columns) and
``buying_shippingorigin`` (miles). Fill-ins and flags: items with sold_for <= 0 or retail outside
$0.01-$9,999 are left out ($0 often means unknown); only items linked to a manifest row count (2026 POs
on); no close date uses today; freight None leaves the profit out. Nothing is written except Bill's own
number (``Auction.revenue_override``, the existing "your revenue" field), through valuation-inputs.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Iterable

from django.utils import timezone

from apps.buying.models import Auction
from apps.buying.services.manifest_template import parse_csv_dict_rows
from apps.buying.services.shipping_formula import city_from_text, estimate_for_auction

# --- settings ------------------------------------------------------------------------------------

FEE_RATE = 0.05
LEAD_DAYS = 21  # close date to shelf date, until measured from our POs
BID_LANDED_PCTS = (0.20, 0.23)
WEAK_FILL_IN_SHARE = 0.30
RETAIL_DIFF_NOTE = 0.05
WRONG_MANIFEST_DIFF = 0.25  # stored manifests are sometimes another lot's (seen on lot 492292)
HIGH_RETAIL_PER_PALLET = 8000  # our Target trucks run about $2.5k of retail a pallet

# B-Stock marketplace slug -> (our vendor code, name).
SELLERS: dict[str, tuple[str, str]] = {
    'target': ('TRGET', 'Target'),
    'walmart': ('WAL', 'Walmart'),
    'amazon': ('AMZ', 'Amazon'),
    'costco': ('CST', 'Costco'),
    'homedepot': ('HMD', 'Home Depot'),
    'wayfair': ('WFR', 'Wayfair'),
}
MIN_CATEGORY_SOLD = 5  # sold items before a category gets its own rate
MIN_SELLER_SOLD = 50  # sold items before a seller gets a number at all
BAND = (0.7, 1.3)
RATES_CACHE_SECONDS = 3600

MISS_LINES = {
    'target': (
        'sold items only, so it runs high: on 8 past Target trucks it came out 15.7 points of retail '
        'above what they have sold so far (29.7 at worst).'
    ),
}
MISS_LINE_UNMEASURED = (
    'sold items only, so it runs high (on Target trucks, about 16 points of retail above what sold); '
    'not yet measured on {seller} trucks.'
)
HORIZON = 'about 6 months'

# Seasons (design A2, Target): hand-set (low, likely, high). Halloween in-time equals late until Bill sets it.
HALLOWEEN_LATE = (0.05, 0.10, 0.18)
CHRISTMAS_IN_TIME = (0.12, 0.22, 0.30)
LATE_PLACEHOLDER = (0.05, 0.10, 0.18)  # Christmas late: unmeasured
OTHER_SEASON_RE = re.compile(r'easter|spring|summer|valentine|patriotic|4th of july|fourth of july|st\.? patrick', re.I)
MISSING_PIECES_RE = re.compile(r'missing pieces', re.I)


def thanksgiving(year: int) -> date:
    nov1 = date(year, 11, 1)
    first_thu = nov1 + timedelta(days=(3 - nov1.weekday()) % 7)
    return first_thu + timedelta(days=21)


SEASONS: dict[str, dict[str, Any]] = {
    'halloween': {
        'label': 'Halloween',
        'category': 'SEASONAL',
        'date': lambda y: date(y, 11, 1),
        'date_label': 'Nov 1',
        'in_time': HALLOWEEN_LATE,
        'late': HALLOWEEN_LATE,
    },
    'christmas': {
        'label': 'Christmas',
        'category': 'TRIM A TREE',
        'date': thanksgiving,
        'date_label': 'Thanksgiving',
        'in_time': CHRISTMAS_IN_TIME,
        'late': LATE_PLACEHOLDER,
    },
}


def is_late(shelf: date, season_date) -> bool:
    """After this year's season date, or in Jan-Feb (just after last year's)."""
    return shelf >= season_date(shelf.year) or shelf.month <= 2


# --- rates from what sold -------------------------------------------------------------------------

_SOLD_SQL = '''
select coalesce(nullif(upper(trim(m.taxonomy->>'seller_category')), ''), '') sc,
       count(*) n, sum(i.retail) r, sum(i.sold_for) s
from inventory_item i
join inventory_manifestrow m on m.id = i.manifest_row_id
join inventory_purchaseorder po on po.id = i.purchase_order_id
join inventory_vendor v on v.id = po.vendor_id
where v.code = %s and i.sold_at is not null and i.sold_for > 0 and i.retail > 0 and i.retail < 10000
group by 1
'''


def band(rate: float) -> tuple[float, float, float]:
    return (rate * BAND[0], rate, min(rate * BAND[1], 0.95))


@dataclass
class SellerRates:
    slug: str
    name: str
    by_category: dict[str, tuple[float, int, float]]  # sc -> (rate, sold items, retail)
    average: float
    sold_items: int
    sold_retail: float

    def for_category(self, sc: str) -> tuple[tuple[float, float, float], str, bool]:
        """(low, likely, high), where it comes from, and whether it is the seller-average fill-in."""
        row = self.by_category.get(sc)
        if row and row[1] >= MIN_CATEGORY_SOLD:
            return band(row[0]), f'{row[1]:,} sold, ${row[2]:,.0f} retail', False
        n = row[1] if row else 0
        return band(self.average), f'{n} sold: {self.name} average' if n else f'no sales yet: {self.name} average', True

    def whole_band(self) -> tuple[float, float, float]:
        return band(self.average)


@dataclass
class RecoveryRates(SellerRates):
    """90-day recovery rates from the newest ``RecoveryFit`` (Dash #77): stored bands, no live query."""

    bands: dict[str, tuple[float, float, float]] = None  # sc -> (low, likely, high)
    whole: tuple[float, float, float] = (0.0, 0.0, 0.0)
    whole_basis: str = ''
    fit_id: int | None = None
    block: dict[str, Any] = None

    def for_category(self, sc: str) -> tuple[tuple[float, float, float], str, bool]:
        got = (self.bands or {}).get(sc)
        if got:
            row = self.block['rates']['categories'][sc]
            return got, f"90-day recovery, {row['trucks']} trucks, ${row['retail']:,.0f} retail", False
        return self.whole, f'{self.name} whole truck (category on under 3 scored trucks)', True

    def whole_band(self) -> tuple[float, float, float]:
        return self.whole


def recovery_rates(slug: str) -> tuple[RecoveryRates | None, str]:
    """The seller's rates from the newest fit, or (None, why not)."""
    from apps.buying.services.recovery_fit import MIN_SELLER_TRUCKS, latest_fit

    name = SELLERS.get(slug, ('', slug))[1]
    # Never fit inside a request (about 30 s): the nightly job does it.
    fit = latest_fit(build_if_missing=False)
    block = (fit.sellers or {}).get(slug) if fit else None
    if not block:
        return None, 'no_fit'
    if block.get('status') != 'ok':
        n = block.get('scored_trucks', 0)
        return None, (
            f'Not yet for {name}: {n} of our {name} trucks have 90 days of selling '
            f'({MIN_SELLER_TRUCKS} needed to test an estimate).'
        )
    r = block['rates']
    w = r['whole']
    return RecoveryRates(
        slug=slug,
        name=name,
        by_category={sc: (c['likely'], c['trucks'], c['retail']) for sc, c in r['categories'].items()},
        average=w['likely'],
        sold_items=0,
        sold_retail=w['retail'],
        bands={sc: (c['low'], c['likely'], min(c['high'], 0.95)) for sc, c in r['categories'].items()},
        whole=(w['low'], w['likely'], min(w['high'], 0.95)),
        whole_basis=w['band'],
        fit_id=fit.pk,
        block=block,
    ), ''


def recovery_miss_line(rates: RecoveryRates, retail: float) -> str:
    """One line: the blind test, in points and in dollars on this lot, and which way it leans."""
    sm = rates.block['summary']
    med = sm['median_miss']
    lean = sm['mean_signed']
    runs = 'runs high' if lean > 1.5 else 'runs low' if lean < -1.5 else 'neither high nor low on average'
    thin = ' Thin: under 5 trucks.' if sm.get('thin') else ''
    return (
        f"Blind test on {sm['trucks']} {rates.name} trucks: usually off {med:.1f} points of retail "
        f"(about ${retail * med / 100:,.0f} on this lot: {med:.1f}% of ${retail:,.0f}), {runs}.{thin}"
    )


def seller_rates(slug: str, *, use_cache: bool = True) -> SellerRates | None:
    """Sale price / retail of every sold item from this seller, per seller category (cached an hour)."""
    from django.core.cache import cache
    from django.db import connection

    if slug not in SELLERS:
        return None
    key = f'buying:estimate:sold-rates:{slug}'
    if use_cache:
        hit = cache.get(key)
        if hit is not None:
            return hit
    code, name = SELLERS[slug]
    with connection.cursor() as cur:
        cur.execute(_SOLD_SQL, [code])
        rows = cur.fetchall()
    n_all = sum(int(r[1]) for r in rows)
    r_all = sum(float(r[2] or 0) for r in rows)
    s_all = sum(float(r[3] or 0) for r in rows)
    out = SellerRates(
        slug=slug,
        name=name,
        by_category={r[0]: (float(r[3]) / float(r[2]), int(r[1]), float(r[2])) for r in rows if r[0] and float(r[2] or 0) > 0},
        average=(s_all / r_all) if r_all else 0.0,
        sold_items=n_all,
        sold_retail=r_all,
    )
    cache.set(key, out, RATES_CACHE_SECONDS)
    return out


def seller_from_columns(columns: Iterable[str]) -> str:
    """Which B-Stock seller a manifest CSV is from, by its own columns; '' when it can't tell."""
    cols = set(columns)
    if 'TCIN' in cols:
        return 'target'
    if 'ASIN' in cols or 'LPN' in cols:
        return 'amazon'
    if 'HMD - Order ID' in cols or 'HMD - SB ID' in cols:
        return 'homedepot'
    if 'Inventory Source' in cols or 'Warehouse' in cols:
        return 'walmart'
    return ''


# --- lines ----------------------------------------------------------------------------------------


@dataclass
class Line:
    seller_category: str
    qty: float
    unit_retail: float
    description: str

    @property
    def retail(self) -> float:
        return self.qty * self.unit_retail


def _num(v: Any) -> float:
    try:
        return float(str(v).replace(',', '').replace('$', '').strip())
    except (TypeError, ValueError):
        return 0.0


def line_from_dict(row: dict[str, Any]) -> Line | None:
    """One B-Stock Target CSV row (or stored ``raw_data``); None for deleted or zero lines."""
    desc = str(row.get('Item Description') or '').strip()
    qty = _num(row.get('Qty'))
    unit = _num(row.get('Unit Retail'))
    if not unit and qty:
        unit = _num(row.get('Ext. Retail')) / qty
    if desc.upper() == 'DELETED_ITEM' or qty <= 0 or unit <= 0:
        return None
    sc = str(row.get('Seller Category') or '').strip().upper() or 'UNKNOWN'
    return Line(seller_category=sc, qty=qty, unit_retail=unit, description=desc)


def lines_from_rows(rows: Iterable[dict[str, Any]]) -> list[Line]:
    return [ln for ln in (line_from_dict(r) for r in rows) if ln is not None]


class EstimateError(ValueError):
    """A plain-words reason the estimate cannot run."""


def lines_from_csv(content: bytes) -> tuple[list[Line], str]:
    """The CSV's lines and the seller its columns point to ('' when they don't say)."""
    columns, rows = parse_csv_dict_rows(content)
    need = {'Seller Category', 'Qty', 'Unit Retail'}
    if not need.issubset(set(columns)):
        raise EstimateError(
            'This CSV is not a B-Stock manifest (no Seller Category, Qty and Unit Retail columns).'
        )
    lines = lines_from_rows(rows)
    if not lines:
        raise EstimateError('This CSV has no lines with a quantity and a retail price.')
    return lines, seller_from_columns(columns)


def lines_from_auction(auction: Auction) -> list[Line]:
    return lines_from_rows(auction.manifest_rows.order_by('row_number').values_list('raw_data', flat=True))


# --- finding the lot ------------------------------------------------------------------------------

_ID_RE = re.compile(r'/details/([A-Za-z0-9]+)|\b([0-9a-f]{24})\b', re.I)


def lot_id_from_link(text: str) -> str:
    m = _ID_RE.search(text or '')
    return (m.group(1) or m.group(2)) if m else ''


def find_auction(link: str) -> Auction | None:
    ext = lot_id_from_link(link)
    if not ext:
        raise EstimateError('That is not a B-Stock lot link. Copy the address of the lot page on B-Stock and paste it here.')
    return Auction.objects.select_related('marketplace').filter(external_id=ext).first()


# --- the estimate ---------------------------------------------------------------------------------


def _r(x: float | None) -> float | None:
    return None if x is None else round(x, 2)


def _rate_for(line: Line, shelf: date, rates: SellerRates) -> tuple[tuple[float, float, float], str, str, bool]:
    """(low, likely, high), the rule, where the rate comes from, and whether it is the seller-average fill-in."""
    if rates.slug == 'target':
        for key, s in SEASONS.items():
            if line.seller_category != s['category']:
                continue
            if key == 'halloween' and OTHER_SEASON_RE.search(line.description):
                break  # Easter, summer...: season not set, the category's own rate
            late = is_late(shelf, s['date'])
            rule = f"{s['label']} {'late' if late else 'in time'}"
            return (s['late'] if late else s['in_time']), rule, f'{rule} (hand-set)', False
        if line.seller_category == 'SEASONAL':
            got, source, fill = rates.for_category(line.seller_category)
            return got, 'season not set', source, fill
    got, source, fill = rates.for_category(line.seller_category)
    return got, ('fill-in' if fill else 'category'), source, fill


def manifest_estimate(lines: list[Line], shelf: date, rates: SellerRates) -> dict[str, Any]:
    """Seller-category sum-product with the season and missing-pieces rules."""
    cats: dict[str, dict[str, Any]] = {}
    lo = li = hi = 0.0
    fill_in = missing = 0.0
    seasons: dict[str, dict[str, Any]] = {}
    for ln in lines:
        band_, source, evidence, is_fill = _rate_for(ln, shelf, rates)
        mp = bool(MISSING_PIECES_RE.search(ln.description))
        likely_rate = band_[0] if mp else band_[1]
        r = ln.retail
        lo += r * band_[0]
        li += r * likely_rate
        hi += r * band_[2]
        if is_fill:
            fill_in += r
        if mp:
            missing += r
        if source not in ('category', 'fill-in'):
            s = seasons.setdefault(source, {'rule': source, 'retail': 0.0, 'lines': 0, 'rates': band_})
            s['retail'] += r
            s['lines'] += 1
        c = cats.setdefault(
            ln.seller_category,
            {
                'seller_category': ln.seller_category,
                'retail': 0.0,
                'units': 0.0,
                'likely': 0.0,
                'missing_pieces_retail': 0.0,
                'basis': 'seller average' if is_fill else ('hand-set' if 'hand-set' in evidence else 'sold'),
                'evidence': evidence,
                'rates': band_,
                'rule': source,
            },
        )
        c['retail'] += r
        c['units'] += ln.qty
        c['likely'] += r * likely_rate
        if mp:
            c['missing_pieces_retail'] += r
        if c['rule'] != source:
            c['rule'] = 'mixed'
    # What the missing-pieces rule takes off "likely" (compare design's $1-1.5k on target_tl.csv).
    li_without_mp = sum(ln.retail * _rate_for(ln, shelf, rates)[0][1] for ln in lines)
    total = sum(ln.retail for ln in lines)
    rows = sorted(cats.values(), key=lambda c: -c['retail'])
    for c in rows:
        c['share'] = round(c['retail'] / total, 4) if total else 0
        c['retail'] = _r(c['retail'])
        c['likely'] = _r(c['likely'])
        c['missing_pieces_retail'] = _r(c['missing_pieces_retail'])
        c['units'] = int(c['units'])
        c['rates'] = list(c['rates'])
    return {
        'retail': total,
        'low': lo,
        'likely': li,
        'high': hi,
        'fill_in_share': fill_in / total if total else 0,
        'missing_pieces_share': missing / total if total else 0,
        'missing_pieces_effect': li - li_without_mp,
        'categories': rows,
        'seasons': [
            {**s, 'retail': _r(s['retail']), 'rates': list(s['rates'])} for s in seasons.values()
        ],
        'lines': len(lines),
    }


def freight_formula(auction: Auction) -> tuple[dict[str, Any] | None, str]:
    """The shipping-formula estimate and, when there is none, the plain reason."""
    city = (auction.origin_city or '').strip() or city_from_text(auction.title)
    if not auction.pallet_count:
        return None, 'no pallet count for this lot'
    if not city:
        return None, 'no seller city for this lot'
    if city != auction.origin_city:
        auction.origin_city = city  # in memory only: the city at the end of the title
    est = estimate_for_auction(auction)
    return est, '' if est else f'no driving miles for {city} yet'


def _to_date(v: Any) -> date | None:
    if v is None or v == '':
        return None
    if isinstance(v, datetime):
        return timezone.localtime(v).date() if timezone.is_aware(v) else v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def build_estimate(
    *,
    auction: Auction | None = None,
    lines: list[Line] | None = None,
    manifest_source: str = '',
    seller: str = '',
    price: float | None = None,
    freight: float | None = None,
    close_date: date | None = None,
    today: date | None = None,
) -> dict[str, Any]:
    """The whole screen's numbers. ``lines`` None = whole truck from B-Stock's retail."""
    today = today or timezone.localdate()
    notes: list[str] = []
    slug = auction.marketplace.slug if auction else seller
    if not slug:
        raise EstimateError('Which seller is this manifest from? Pick it under Seller.')
    from apps.buying.services.recovery_fit import rates_source

    source = rates_source()
    no_fit_yet = False
    seller_name = SELLERS.get(slug, ('', auction.marketplace.name if auction else slug))[1]
    if source == 'recovery':
        rates, why = recovery_rates(slug) if slug in SELLERS else (None, f'Not yet for {seller_name}.')
        if why == 'no_fit':
            # Before the first nightly fit: the #73 rates, said so.
            source = 'sold'
            no_fit_yet = True
        elif rates is None:
            return {
                'supported': False,
                'seller': seller_name,
                'message': why,
                'lot': lot_info(auction) if auction else None,
            }
    if source == 'sold':
        rates = seller_rates(slug)
    if source == 'sold' and (rates is None or rates.sold_items < MIN_SELLER_SOLD):
        n = rates.sold_items if rates else 0
        return {
            'supported': False,
            'seller': seller_name,
            'message': f'Not yet for {seller_name}: only {n} sold items with a manifest to learn from.',
            'lot': lot_info(auction) if auction else None,
        }

    bstock_retail = float(auction.total_retail_value) if auction and auction.total_retail_value else None
    close = close_date or _to_date(auction.end_time if auction else None)
    close_basis = 'typed' if close_date else ('lot end time' if close else 'today (no close date)')
    close = close or today
    shelf = close + timedelta(days=LEAD_DAYS)

    # A stored manifest far from B-Stock's retail is probably another lot's: price the whole truck.
    if lines and manifest_source != 'your CSV' and bstock_retail:
        stored = sum(ln.retail for ln in lines)
        if abs(stored - bstock_retail) / bstock_retail > WRONG_MANIFEST_DIFF:
            notes.append(
                f"The manifest stored on this lot sums to ${stored:,.0f}, far from B-Stock's ${bstock_retail:,.0f}. "
                "It may be another lot's, so this uses B-Stock's retail. Drop the right CSV for categories."
            )
            lines = None

    if lines:
        m = manifest_estimate(lines, shelf, rates)
        retail = m['retail']
        method = 'manifest'
        brings = {'low': m['low'], 'likely': m['likely'], 'high': m['high']}
        if bstock_retail and abs(retail - bstock_retail) / bstock_retail > RETAIL_DIFF_NOTE:
            far = abs(retail - bstock_retail) / bstock_retail > WRONG_MANIFEST_DIFF
            notes.append(
                f'Your CSV sums to ${retail:,.0f}; B-Stock lists ${bstock_retail:,.0f}. '
                + ("That is far apart: check it is this lot's manifest. " if far else '')
                + 'The estimate uses the CSV.'
            )
    else:
        if not bstock_retail:
            raise EstimateError('B-Stock gives no retail for this lot and there is no manifest. Drop its manifest CSV.')
        m = None
        retail = bstock_retail
        method = 'whole_truck'
        lo, li, hi = rates.whole_band()
        brings = {'low': retail * lo, 'likely': retail * li, 'high': retail * hi}

    # Landed and freight.
    is_contract = bool(auction and (auction.listing_type or '').upper() == 'CONTRACT')
    ended = bool(auction and auction.end_time and auction.end_time < timezone.now())
    if price is None and auction and auction.current_price is not None:
        seen = float(auction.current_price)
        if ended and not is_contract:
            # The last bid we saw is not what it sold for: no profit until a price is typed.
            start = bstock_retail and seen < 0.02 * bstock_retail  # B-Stock opens near 1% of retail
            price_basis = f"type a price; last bid seen ${seen:,.0f}" + (' (a starting bid)' if start else '')
        else:
            price = seen
            price_basis = 'contract price' if is_contract else 'price seen on B-Stock'
    else:
        price_basis = 'typed' if price is not None else ''
    retail_doubt = bool(auction and auction.pallet_count and retail / auction.pallet_count > HIGH_RETAIL_PER_PALLET)
    if retail_doubt:
        notes.append(
            f'${retail / auction.pallet_count:,.0f} of retail a pallet is high (our trucks run about $2,500). '
            + (
                f'The last bid seen was ${float(auction.current_price):,.0f}, {float(auction.current_price) / retail:.0%} of retail. '
                if auction.current_price
                else ''
            )
            + 'Check the retail before you bid on these numbers.'
        )
    formula, freight_reason = freight_formula(auction) if auction else (None, 'no lot link, so no pallets or city')
    if freight is not None:
        freight_used, freight_basis = freight, 'typed'
    elif formula:
        freight_used, freight_basis = float(formula['amount']), 'formula'
    else:
        freight_used, freight_basis = None, 'none'
    landed = None
    fee = None
    if price is not None:
        fee = price * FEE_RATE
        landed = price + fee + (freight_used or 0.0)

    profit = multiple = None
    if landed is not None and freight_used is not None:
        profit = {k: v - landed for k, v in brings.items()}
        multiple = {k: (v / landed if landed > 0 else None) for k, v in brings.items()}

    bid_up_to = [
        {
            'landed_pct': pct,
            'landed': _r(retail * pct),
            'bid': _r(max((retail * pct - (freight_used or 0.0)) / (1 + FEE_RATE), 0.0)),
            'freight_included': freight_used is not None,
        }
        for pct in BID_LANDED_PCTS
    ]

    if no_fit_yet:
        notes.append('The 90-day recovery rates arrive with the first nightly fit; these are the sold-items rates.')
    tags = ['first 90 days of selling'] if source == 'recovery' else ['sold items only']
    if method == 'whole_truck':
        tags.append('whole truck, no manifest')
        tags.append('wide range')
    elif m and m['fill_in_share'] > WEAK_FILL_IN_SHARE:
        tags.append('weak estimate')
    if is_contract:
        tags.append('contract, no bidding')
    if ended:
        tags.append('ended')
    if retail_doubt:
        tags.append('check retail')
    if freight_used is None:
        tags.append('freight not included')

    return {
        'supported': True,
        'seller': seller_name,
        'seller_slug': slug,
        'lot': lot_info(auction) if auction else None,
        'method': method,
        'manifest_source': manifest_source if lines else '',
        'retail': {
            'used': _r(retail),
            'source': 'manifest' if lines else 'B-Stock',
            'manifest': _r(m['retail']) if m else None,
            'bstock': _r(bstock_retail),
        },
        'brings_in': {k: _r(v) for k, v in brings.items()},
        'brings_in_pct': {k: round(v / retail, 4) for k, v in brings.items()},
        'price': _r(price),
        'price_basis': price_basis,
        'fee_rate': FEE_RATE,
        'fee': _r(fee),
        'freight': {
            'used': _r(freight_used),
            'basis': freight_basis,
            'reason': freight_reason,
            'formula': (
                {
                    'amount': float(formula['amount']),
                    'low': float(formula['low']),
                    'high': float(formula['high']),
                    'mode': formula['mode'],
                    'pallets': formula['pallets'],
                    'miles': formula['miles'],
                    'city': formula['city'],
                }
                if formula
                else None
            ),
        },
        'landed': _r(landed),
        'landed_pct': round(landed / retail, 4) if landed is not None and retail else None,
        'profit': {k: _r(v) for k, v in profit.items()} if profit else None,
        'multiple': {k: (round(v, 2) if v is not None else None) for k, v in multiple.items()} if multiple else None,
        'bid_up_to': bid_up_to,
        'tags': tags,
        'notes': notes,
        'retail_doubt': retail_doubt,
        'close_date': close.isoformat(),
        'close_basis': close_basis,
        'lead_days': LEAD_DAYS,
        'shelf_date': shelf.isoformat(),
        'whole_truck_rates': list(rates.whole_band()),
        'seller_average': round(rates.average, 4),
        'seller_sold_items': rates.sold_items,
        'fill_in_share': round(m['fill_in_share'], 4) if m else None,
        'missing_pieces_share': round(m['missing_pieces_share'], 4) if m else None,
        'missing_pieces_effect': _r(m['missing_pieces_effect']) if m else None,
        'seasons': m['seasons'] if m else [],
        'categories': m['categories'] if m else [],
        'lines': m['lines'] if m else 0,
        'miss_line': (
            recovery_miss_line(rates, retail)
            if source == 'recovery'
            else MISS_LINES.get(slug) or MISS_LINE_UNMEASURED.format(seller=seller_name)
        ),
        'horizon': 'first 90 days of selling' if source == 'recovery' else HORIZON,
        'rates_source': source,
        'fit_id': getattr(rates, 'fit_id', None),
        'your_number': _r(float(auction.revenue_override)) if auction and auction.revenue_override is not None else None,
    }


def lot_info(auction: Auction) -> dict[str, Any]:
    return {
        'id': auction.id,
        'title': auction.title,
        'url': auction.url,
        'marketplace': auction.marketplace.name,
        'status': auction.status,
        'listing_type': auction.listing_type,
        'end_time': auction.end_time.isoformat() if auction.end_time else None,
        'current_price': _r(float(auction.current_price)) if auction.current_price is not None else None,
        'bid_count': auction.bid_count,
        'pallet_count': auction.pallet_count,
        'has_manifest': auction.has_manifest,
        'last_updated_at': auction.last_updated_at.isoformat() if auction.last_updated_at else None,
    }
