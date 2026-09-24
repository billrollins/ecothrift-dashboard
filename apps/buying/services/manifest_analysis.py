"""
Buying Phase 4: what a truck really holds, line by line.

For an auction with a manifest:

1. **Match** each line to a product we already know (strongest first):
   - ``upc``: the line's UPC equals a product's (digits only, leading zeros ignored);
   - ``title``: the same title (lower-cased, punctuation and spacing ignored);
   - ``near``: a similar title (pg_trgm similarity at or above ``NEAR_MIN``, via the
     ``inv_product_title_trgm`` index). Vectors can join later behind the same function.
2. **Sales behind the match:** how many of that product we sold, for what share of retail,
   how fast, and how many are on the shelf now.
3. **Hazards** per line (``HAZARDS``): box 1 of N, missing pieces, likely breakage, high
   value, $0 retail, a line too big for processing, and whole-truck ones: the same item in
   bulk across lines, a slow seller, a product we already have plenty of.
4. **Truck value v2:** each line's units x retail x a rate, the product's own sold/retail
   ratio when it has ``MIN_PRODUCT_SALES`` sales with a retail, else its category's
   recovery rate; then hazard discounts. Summed, it is ``Auction.analysis_revenue``, which
   valuation uses in place of the category mix.

Data quality (register PRD-01, PRD-02, AUC-06, ITM-01): duplicate products and missing
UPCs lower the match rate, and that is shown (``coverage``), never hidden. A line with no
retail is kept, valued at 0 and flagged.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Max, Q, Sum
from django.db.models.functions import Lower
from django.utils import timezone

from apps.buying.models import Auction, CategoryStats, ManifestRow
from apps.buying.services.recovery import recovery_rate
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED
from apps.inventory.models import Item, Product
from apps.inventory.services.catalog_merge import normalize_title

# ── Hazards ───────────────────────────────────────────────────────────────────

PART = 'part'
INCOMPLETE = 'incomplete'
FRAGILE = 'fragile'
HIGH_VALUE = 'high_value'
ZERO_RETAIL = 'zero_retail'
BULK_LINE = 'bulk_line'
HIGH_VOLUME = 'high_volume'
SLOW = 'slow'
STOCKED = 'stocked'

HAZARDS = {
    PART: 'Box or part of a set (box 1 of N)',
    INCOMPLETE: 'Missing pieces, parts only or not working',
    FRAGILE: 'Likely breakage (glass, ceramic, screens)',
    HIGH_VALUE: 'High value: theft, damage or a wrong retail price',
    ZERO_RETAIL: 'No retail price ($0 line)',
    BULK_LINE: 'Too many on one line for processing',
    HIGH_VOLUME: 'Same item in bulk across the truck',
    SLOW: 'Slow seller for us',
    STOCKED: 'We already have plenty on the shelf',
}

PART_RE = re.compile(
    # "Box 1 of 3", "(2 of 4)": the word "of" is required. A slash is a measurement, not a box count
    # (R-060: "20/30/50AMP", "Piece 3/8 Inch Drive").
    r'\b(?:box|carton|ctn|pc|piece|part|pkg|package)\s*#?\s*\d+\s*of\s*\d+\b|\(\s*\d+\s*of\s*\d+\s*\)',
    re.IGNORECASE,
)
# In the seller's condition or notes, any of these words is a finding.
INCOMPLETE_RE = re.compile(
    r'\b(?:missing|incomplete|parts only|for parts|not working|non[- ]?working|defective|broken)\b',
    re.IGNORECASE,
)
# In a title only a plain statement counts. R-060: all 9 bare "broken" / "missing" title hits were
# product names ("for Broken Ankle", "broken-in feel", the puzzle "Missing Friend").
INCOMPLETE_TITLE_RE = re.compile(
    r'\b(?:parts only|for parts|not working|non[- ]?working|incomplete set|'
    r'missing (?:parts|pieces|hardware|accessories|components|screws))\b',
    re.IGNORECASE,
)
# A seller's hedge is not a finding: Target's "(Please be advised that sets may be missing pieces
# or otherwise incomplete.)" rides on thousands of lines (R-052). Drop the clause before looking.
HEDGE_RE = re.compile(r'\b(?:may|might|could)\s+(?:be|have|contain|arrive|come)\b[^.()]*', re.IGNORECASE)
FRAGILE_RE = re.compile(
    r'\b(?:glass|glassware|ceramic|porcelain|mirror|crystal|vase|lamp|television|monitor|'
    r'stoneware|dinnerware|dishes)\b'
    # A TV set, not a "TV" character or Funko "POP! TV" line (R-060).
    r'|\b(?:smart|led|oled|qled|lcd|4k|uhd)\s+(?:tv|television)\b'
    r'|\b\d{2,3}\s*(?:"|\'\'|-?\s*in(?:ch)?)\s*(?:class\s+)?(?:[\w-]+\s+){0,2}(?:tv|television)\b',
    re.IGNORECASE,
)
# "Glass not included" is not glass (R-060: a door-frame kit).
NO_GLASS_RE = re.compile(r'\b(?:glass\s+(?:is\s+)?not\s+included|no\s+glass|without\s+glass)\b', re.IGNORECASE)

HIGH_VALUE_UNIT = Decimal('300')
BULK_LINE_QTY = 24
HIGH_VOLUME_QTY = 24
SLOW_DAYS = 90
STOCKED_ON_HAND = 5
# R-052: at 0.55-0.65 the best hit was often another size or product in the same brand line.
NEAR_MIN = 0.7
STRONG_NEAR = 0.75
MIN_PRODUCT_SALES = 3
MAX_NEAR_LOOKUPS = 300
# Manifest retail this many times the listing's is a broken manifest (R-055: auction 523's
# $9.99 toys stored as $999, 690x the listing): its values are scaled back to the listing.
RETAIL_MISMATCH = Decimal('3')

# Value discounts per hazard (worst one applies; they don't stack).
FACTORS = {
    INCOMPLETE: Decimal('0.5'),
    PART: Decimal('0.5'),
    FRAGILE: Decimal('0.9'),
}

CENT = Decimal('0.01')


def upc_key(raw: str | None) -> str:
    """Digits only, leading zeros dropped, when there are 11 or more digits; else ''."""
    digits = re.sub(r'\D', '', str(raw or ''))
    if len(digits) < 11:
        return ''
    return digits.lstrip('0')


def _upc_variants(key: str) -> set[str]:
    return {key, key.zfill(12), key.zfill(13), key.zfill(14)}


def line_hazards(row: ManifestRow) -> list[str]:
    """The per-line hazards (the truck-wide ones are added in ``analyze_auction``)."""
    text = ' '.join(part for part in (row.title, row.condition, row.notes) if part)
    seller = HEDGE_RE.sub(' ', ' '.join(part for part in (row.condition, row.notes) if part))
    title = row.title or ''
    found = []
    if PART_RE.search(text):
        found.append(PART)
    if INCOMPLETE_RE.search(seller) or INCOMPLETE_TITLE_RE.search(HEDGE_RE.sub(' ', title)):
        found.append(INCOMPLETE)
    if FRAGILE_RE.search(NO_GLASS_RE.sub(' ', title)):
        found.append(FRAGILE)
    unit = row.retail_value
    if unit is None or unit <= 0:
        found.append(ZERO_RETAIL)
    elif unit >= HIGH_VALUE_UNIT:
        found.append(HIGH_VALUE)
    if (row.quantity or 0) >= BULK_LINE_QTY:
        found.append(BULK_LINE)
    return found


def hazard_factor(hazards: list[str]) -> Decimal:
    factors = [FACTORS[h] for h in hazards if h in FACTORS]
    return min(factors) if factors else Decimal('1')


# ── Matching ──────────────────────────────────────────────────────────────────

SIZE_RE = re.compile(
    r'(\d+(?:\.\d+)?)\s*-?\s*(fl\.?\s?oz|oz|qt|quarts?|gal(?:lons?)?|ml|liters?|l|lbs?|cups?|in(?:ch(?:es)?)?|ft|feet|'
    r'mm|cm|pcs?|pieces?|pk|packs?|ct|count|w|watts?|tiers?)\b|(\d+(?:\.\d+)?)\s*("|\'\')',
    re.IGNORECASE,
)
SIZE_UNIT = {
    'floz': 'oz', 'fl.oz': 'oz', 'quart': 'qt', 'quarts': 'qt', 'gallon': 'gal', 'gallons': 'gal',
    'liter': 'l', 'liters': 'l', 'lbs': 'lb', 'cups': 'cup', 'inch': 'in', 'inches': 'in', '"': 'in', "''": 'in',
    'feet': 'ft', 'pcs': 'pc', 'piece': 'pc', 'pieces': 'pc', 'packs': 'pk', 'pack': 'pk', 'count': 'ct',
    'watt': 'w', 'watts': 'w', 'tiers': 'tier',
}


def sizes(text: str | None) -> set[str]:
    """Sizes named in a title ("32qt", "14-Cup", '13"'), normalized: {'32qt', '14cup', '13in'}."""
    out = set()
    for number, unit, inch_number, inch_mark in SIZE_RE.findall(text or ''):
        number, unit = (number, unit) if number else (inch_number, inch_mark)
        unit = re.sub(r'\s', '', unit.lower())
        out.add(f'{float(number):g}{SIZE_UNIT.get(unit, unit)}')
    return out


def sizes_conflict(a: str | None, b: str | None) -> bool:
    """Both titles name sizes and none is shared: a 32qt bin is not the 60qt one (R-052)."""
    left, right = sizes(a), sizes(b)
    return bool(left and right and not left & right)


@dataclass
class Match:
    product_id: int
    method: str
    score: Decimal


def match_rows(rows: list[ManifestRow]) -> dict[int, Match]:
    """Row id -> best product match: UPC, then same title, then a near title."""
    found: dict[int, Match] = {}

    by_upc: dict[str, list[int]] = defaultdict(list)
    for row in rows:
        key = upc_key(row.upc)
        if key:
            by_upc[key].append(row.pk)
    if by_upc:
        wanted = set()
        for key in by_upc:
            wanted |= _upc_variants(key)
        product_by_key: dict[str, int] = {}
        for pid, ids in (
            Product.objects.filter(identifiers__upc__in=list(wanted))
            .order_by('-is_active', 'pk')
            .values_list('pk', 'identifiers')
        ):
            key = upc_key((ids or {}).get('upc') if isinstance(ids, dict) else '')
            if key:
                product_by_key.setdefault(key, pid)
        for key, row_ids in by_upc.items():
            pid = product_by_key.get(key)
            if pid:
                for row_id in row_ids:
                    found[row_id] = Match(pid, 'upc', Decimal('1'))

    by_title: dict[str, list[int]] = defaultdict(list)
    raw_title: dict[str, str] = {}
    title_retail: dict[str, Decimal] = defaultdict(lambda: Decimal('0'))
    for row in rows:
        if row.pk in found:
            continue
        norm = normalize_title(row.title)
        if len(norm) < 4:
            continue
        by_title[norm].append(row.pk)
        raw_title.setdefault(norm, (row.title or '').strip())
        if (row.retail_value or 0) > 0:
            title_retail[norm] += row.retail_value * max(row.quantity or 1, 1)
    if by_title:
        lowered = {raw.lower() for raw in raw_title.values()}
        for pid, title in (
            Product.objects.annotate(lt=Lower('title'))
            .filter(lt__in=list(lowered))
            .order_by('-is_active', 'pk')
            .values_list('pk', 'title')
        ):
            norm = normalize_title(title)
            if norm in by_title:
                for row_id in by_title.pop(norm):
                    found[row_id] = Match(pid, 'title', Decimal('1'))

    # Near titles: one indexed lookup per distinct title (30-80 ms each), the most retail first,
    # so a truck with more titles than lookups still gets its valuable lines matched.
    remaining = sorted(
        by_title.items(),
        key=lambda item: (-title_retail[item[0]], -len(item[1])),
    )[:MAX_NEAR_LOOKUPS]
    brand_of = {normalize_title(row.title): normalize_title(row.brand) for row in rows if row.brand}
    for norm, row_ids in remaining:
        title = raw_title[norm]
        hits = (
            Product.objects.filter(title__trigram_similar=title)
            .annotate(sim=TrigramSimilarity('title', title))
            .filter(sim__gte=NEAR_MIN)
            .order_by('-sim', '-is_active', 'pk')
            .values_list('pk', 'sim', 'title', 'brand')[:5]
        )
        brand = brand_of.get(norm, '')
        for pid, sim, product_title, product_brand in hits:
            # A weaker near match must carry the line's brand ("MESA 2 tier organizer" is not
            # any "3 tier organizer"); a strong one stands on its own.
            if sim < STRONG_NEAR and brand and brand not in normalize_title(f'{product_title} {product_brand}'):
                continue
            if sizes_conflict(title, product_title):
                continue
            score = Decimal(str(round(float(sim), 3)))
            for row_id in row_ids:
                found[row_id] = Match(pid, 'near', score)
            break
    return found


# ── Sales behind a product ────────────────────────────────────────────────────

@dataclass
class ProductSales:
    sold: int = 0
    sold_with_retail: int = 0
    sold_revenue: Decimal = Decimal('0')
    sold_retail: Decimal = Decimal('0')
    on_hand: int = 0
    avg_days: int | None = None

    @property
    def ratio(self) -> Decimal | None:
        """Sold price / retail over sold items with a retail; None without enough of them."""
        if self.sold_with_retail < MIN_PRODUCT_SALES or self.sold_retail <= 0:
            return None
        return (self.sold_revenue / self.sold_retail).quantize(Decimal('0.0001'))


def product_sales(product_ids: set[int]) -> dict[int, ProductSales]:
    if not product_ids:
        return {}
    sold = Q(sold_at__isnull=False)
    with_retail = sold & Q(retail__gt=0)
    rows = (
        Item.objects.filter(product_id__in=product_ids)
        .values('product_id')
        .annotate(
            n_sold=Count('pk', filter=sold),
            n_sold_retail=Count('pk', filter=with_retail),
            revenue=Sum('sold_for', filter=with_retail),
            retail=Sum('retail', filter=with_retail),
            n_on_hand=Count('pk', filter=Q(status='on_shelf')),
            days=Avg(
                ExpressionWrapper(F('sold_at') - F('checked_in_at'), output_field=DurationField()),
                filter=sold & Q(checked_in_at__isnull=False),
            ),
        )
    )
    out = {}
    for row in rows:
        days = row['days']
        out[row['product_id']] = ProductSales(
            sold=row['n_sold'],
            sold_with_retail=row['n_sold_retail'],
            sold_revenue=row['revenue'] or Decimal('0'),
            sold_retail=row['retail'] or Decimal('0'),
            on_hand=row['n_on_hand'],
            avg_days=max(int(days / timedelta(days=1)), 0) if days is not None else None,
        )
    return out


# ── Analysis ──────────────────────────────────────────────────────────────────

def _row_category(row: ManifestRow) -> str:
    return (row.fast_cat_value or row.canonical_category or '').strip() or MIXED_LOTS_UNCATEGORIZED


def _category_rate(stats: dict[str, CategoryStats], category: str) -> Decimal:
    # A category with no sales of its own (new in 2026-09) uses the store-wide rate, not $0.
    return recovery_rate(stats, category)


def freshness_key(auction: Auction) -> str:
    """Changes when the manifest or its category mapping changes; analysis re-runs then."""
    agg = ManifestRow.objects.filter(auction=auction).aggregate(
        n=Count('pk'),
        last=Max('pk'),
        mapped=Count('pk', filter=Q(fast_cat_value__isnull=False) & ~Q(fast_cat_value='')),
    )
    return f"{agg['n']}:{agg['last']}:{agg['mapped']}"


def is_stale(auction: Auction) -> bool:
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else {}
    return summary.get('key') != freshness_key(auction)


@dataclass
class _Line:
    row: ManifestRow
    qty: int
    hazards: list[str] = field(default_factory=list)
    basis: str = 'category'
    unit_value: Decimal = Decimal('0')
    category_value: Decimal = Decimal('0')
    days: int | None = None


def analyze_auction(auction: Auction, *, stats: dict[str, CategoryStats] | None = None) -> dict[str, Any]:
    """Match, flag and value every manifest line; save lines and the auction summary."""
    from apps.buying.services.valuation import load_category_stats_dict

    rows = list(ManifestRow.objects.filter(auction=auction).order_by('row_number'))
    key = freshness_key(auction)
    if not rows:
        auction.manifest_analysis = None
        auction.analysis_revenue = None
        auction.save(update_fields=['manifest_analysis', 'analysis_revenue'])
        return {}
    if stats is None:
        stats = load_category_stats_dict()

    matches = match_rows(rows)
    sales = product_sales({m.product_id for m in matches.values()})

    lines: list[_Line] = []
    volume: dict[str, int] = defaultdict(int)
    for row in rows:
        qty = row.quantity if row.quantity and row.quantity > 0 else 1
        line = _Line(row=row, qty=qty, hazards=line_hazards(row))
        match = matches.get(row.pk)
        volume[f'p{match.product_id}' if match else f't{normalize_title(row.title)}'] += qty
        lines.append(line)

    for line in lines:
        row = line.row
        match = matches.get(row.pk)
        volume_key = f'p{match.product_id}' if match else f't{normalize_title(row.title)}'
        if volume[volume_key] >= HIGH_VOLUME_QTY and BULK_LINE not in line.hazards:
            line.hazards.append(HIGH_VOLUME)
        ps = sales.get(match.product_id) if match else None
        if ps is not None:
            if ps.avg_days is not None and ps.sold >= MIN_PRODUCT_SALES and ps.avg_days > SLOW_DAYS:
                line.hazards.append(SLOW)
            if ps.on_hand >= STOCKED_ON_HAND:
                line.hazards.append(STOCKED)
        unit_retail = row.retail_value if row.retail_value and row.retail_value > 0 else Decimal('0')
        category_rate = _category_rate(stats, _row_category(row))
        line.category_value = unit_retail * category_rate * line.qty
        if ps is not None and ps.sold >= MIN_PRODUCT_SALES and ps.avg_days is not None:
            line.days = ps.avg_days
        else:
            cat_stats = stats.get(_row_category(row))
            line.days = getattr(cat_stats, 'median_days_to_sell', None) if cat_stats is not None else None
        rate = ps.ratio if ps is not None else None
        if rate is not None:
            line.basis = 'product'
        else:
            rate = category_rate
            line.basis = 'category'
        # Exact here (the truck's sum must not drift by a half cent a unit); rounded when stored.
        line.unit_value = unit_retail * rate * hazard_factor(line.hazards)

    mismatch = _retail_mismatch(auction, lines)
    if mismatch is not None:
        scale = Decimal(str(mismatch['scale']))
        for line in lines:
            line.unit_value = line.unit_value * scale
            line.category_value = line.category_value * scale

    updates = []
    for line in lines:
        row = line.row
        match = matches.get(row.pk)
        row.matched_product_id = match.product_id if match else None
        row.match_method = match.method if match else ''
        row.match_score = match.score if match else None
        row.hazards = line.hazards or None
        row.unit_value = line.unit_value.quantize(CENT, rounding=ROUND_HALF_UP)
        row.value_basis = line.basis
        updates.append(row)
    ManifestRow.objects.bulk_update(
        updates,
        ['matched_product', 'match_method', 'match_score', 'hazards', 'unit_value', 'value_basis'],
        batch_size=500,
    )

    summary = _summarize(auction, lines, matches, sales, key)
    summary['retail_mismatch'] = mismatch
    auction.manifest_analysis = summary
    auction.analysis_revenue = Decimal(summary['revenue'])
    auction.save(update_fields=['manifest_analysis', 'analysis_revenue'])
    return summary


def _retail_mismatch(auction: Auction, lines: list[_Line]) -> dict[str, Any] | None:
    """Manifest retail over ``RETAIL_MISMATCH`` x the listing's: the scale that brings it back."""
    listing = auction.total_retail_value or Decimal('0')
    manifest = sum(
        ((line.row.retail_value or Decimal('0')) * line.qty for line in lines if (line.row.retail_value or 0) > 0),
        Decimal('0'),
    )
    if listing <= 0 or manifest <= listing * RETAIL_MISMATCH:
        return None
    return {
        'manifest_retail': str(manifest.quantize(CENT)),
        'listing_retail': str(listing.quantize(CENT)),
        'scale': round(float(listing / manifest), 6),
    }


def _summarize(
    auction: Auction,
    lines: list[_Line],
    matches: dict[int, Match],
    sales: dict[int, ProductSales],
    key: str,
) -> dict[str, Any]:
    total_retail = Decimal('0')
    matched_retail = Decimal('0')
    product_basis_retail = Decimal('0')
    revenue = Decimal('0')
    by_category = Decimal('0')
    days_weight = Decimal('0')
    days_sum = Decimal('0')
    methods: dict[str, int] = defaultdict(int)
    hazard_lines: dict[str, int] = defaultdict(int)
    hazard_retail: dict[str, Decimal] = defaultdict(lambda: Decimal('0'))
    flagged = 0
    units = 0
    for line in lines:
        row = line.row
        ext_retail = (row.retail_value or Decimal('0')) * line.qty if (row.retail_value or 0) > 0 else Decimal('0')
        total_retail += ext_retail
        units += line.qty
        revenue += line.unit_value * line.qty
        by_category += line.category_value
        if line.days is not None and ext_retail > 0:
            days_sum += ext_retail * line.days
            days_weight += ext_retail
        match = matches.get(row.pk)
        if match:
            methods[match.method] += 1
            matched_retail += ext_retail
        if line.basis == 'product':
            product_basis_retail += ext_retail
        if line.hazards:
            flagged += 1
        for hazard in line.hazards:
            hazard_lines[hazard] += 1
            hazard_retail[hazard] += ext_retail

    def pct(part: Decimal) -> float:
        return round(float(part / total_retail * 100), 1) if total_retail > 0 else 0.0

    top = sorted(lines, key=lambda l: l.unit_value * l.qty, reverse=True)[:10]
    top_value = sum((l.unit_value * l.qty for l in top), Decimal('0'))
    volume: dict[int, dict[str, Any]] = {}
    for line in lines:
        match = matches.get(line.row.pk)
        if not match:
            continue
        entry = volume.setdefault(match.product_id, {'product_id': match.product_id, 'title': line.row.title, 'units': 0})
        entry['units'] += line.qty
    high_volume = sorted((v for v in volume.values() if v['units'] >= HIGH_VOLUME_QTY), key=lambda v: -v['units'])[:10]
    for entry in high_volume:
        ps = sales.get(entry['product_id'])
        entry['sold'] = ps.sold if ps else 0
        entry['avg_days'] = ps.avg_days if ps else None
        entry['on_hand'] = ps.on_hand if ps else 0

    return {
        'key': key,
        'analyzed_at': timezone.now().isoformat(),
        'lines': len(lines),
        'units': units,
        'retail': str(total_retail.quantize(CENT)),
        'revenue': str(revenue.quantize(CENT)),
        # The old way (category rates only, no hazards), to show what matching changed.
        'revenue_by_category': str(by_category.quantize(CENT)),
        # Retail-weighted days to sell (product average where known, else the category median).
        'days_to_sell': int((days_sum / days_weight).quantize(Decimal('1'))) if days_weight > 0 else None,
        'matched_lines': sum(methods.values()),
        'flagged_lines': flagged,
        # How much of the value rides on the 10 best lines: high means check those before bidding.
        'top_lines_value_pct': round(float(top_value / revenue * 100), 1) if revenue > 0 else None,
        'match_methods': dict(methods),
        'matched_retail_pct': pct(matched_retail),
        'product_basis_retail_pct': pct(product_basis_retail),
        'hazards': {
            code: {'lines': hazard_lines[code], 'retail_pct': pct(hazard_retail[code])}
            for code in HAZARDS
            if hazard_lines.get(code)
        },
        'top_lines': [
            {
                'row_id': line.row.pk,
                'title': line.row.title,
                'qty': line.qty,
                'value': str((line.unit_value * line.qty).quantize(CENT)),
                'basis': line.basis,
                'hazards': line.hazards,
            }
            for line in top
        ],
        'high_volume': high_volume,
    }


def analyze_if_stale(auction: Auction, *, stats: dict[str, CategoryStats] | None = None) -> bool:
    """
    Analyze when the manifest (or its mapping) changed since the last run. ``has_manifest``
    only says B-Stock lists one; what counts is whether we hold its lines. An auction with
    no lines costs one count query and never a write (unless an old analysis must go).
    """
    key = freshness_key(auction)
    if key.startswith('0:'):
        if auction.manifest_analysis is not None or auction.analysis_revenue is not None:
            auction.manifest_analysis = None
            auction.analysis_revenue = None
            auction.save(update_fields=['manifest_analysis', 'analysis_revenue'])
            return True
        return False
    summary = auction.manifest_analysis if isinstance(auction.manifest_analysis, dict) else {}
    if summary.get('key') == key:
        return False
    analyze_auction(auction, stats=stats)
    return True
