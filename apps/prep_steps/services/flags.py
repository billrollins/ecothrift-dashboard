"""Why a line is open in a step (computed every time, never stored). A person's Accept closes it for that step."""
from __future__ import annotations

from decimal import Decimal

from apps.prep_steps.models import PrepLine
from apps.prep_steps.services.load import upc_rounded
from apps.prep_steps.services.rules import MIXED, is_junk_title

# Categories that have subcategories in the taxonomy (all but Mixed lots).
SUBS_KNOWN = {
    'Apparel & accessories', 'Appliances', 'Arts & crafts', 'Automotive', 'Baby & kids', 'Bedding & bath', 'Books & media',
    'Electronics', 'Furniture', 'Health, beauty & personal care', 'Home décor & lighting', 'Household & cleaning',
    'Kitchen & dining', 'Lawn & garden', 'Office & school supplies', 'Outdoor & patio furniture',
    'Party, seasonal & novelty', 'Pet supplies', 'Sports & outdoors', 'Storage & organization', 'Tools & hardware',
    'Toys & games',
}

FLAG_TEXT = {
    'no_title': 'No title', 'no_qty': 'No quantity', 'no_retail': 'No retail', 'ext_off': 'Qty x retail is not ext. retail',
    'upc_rounded': 'UPC rounded by the spreadsheet',
    'junk_title': 'No real title', 'no_brand': 'No brand', 'long_title': 'Title still long',
    'no_match': 'Not matched yet', 'like': 'Only like a product', 'low_conf': 'Unsure match',
    'mixed': 'Mixed lots', 'no_category': 'No category', 'no_sub': 'No subcategory',
    'retail_far': 'Retail far from our past retail', 'retail_big': 'Big ticket', 'retail_tiny': 'Retail under $1',
    'retail_round': 'Placeholder retail',
    'no_price': 'No price', 'below_band': 'Under the target', 'above_band': 'Over the target', 'price_over_retail': 'Price over retail',
    'pack_undecided': 'Pack: sell whole or by unit?',
    'not_ready': 'Missing price or match',
}


def line_flags(x: PrepLine, target_share: Decimal, band: Decimal, stats: dict[int, dict]) -> dict[str, list[str]]:
    f: dict[str, list[str]] = {}

    def add(step: str, flag: str):
        f.setdefault(step, []).append(flag)

    # load
    if not x.src_title:
        add('load', 'no_title')
    if not x.src_retail:
        add('load', 'no_retail')
    if x.src_retail and x.src_ext_retail and x.src_qty:
        exp = Decimal(x.src_retail) * x.src_qty
        if exp and abs(exp - Decimal(x.src_ext_retail)) / exp > Decimal('0.02'):
            add('load', 'ext_off')
    if upc_rounded(x.upc):
        add('load', 'upc_rounded')
    # clean
    if is_junk_title(x.title):
        add('clean', 'junk_title')
    if not x.brand:
        add('clean', 'no_brand')
    if len(x.title or '') > 90:
        add('clean', 'long_title')
    # match
    if not x.match_kind:
        add('match', 'no_match')
    elif x.match_kind == 'like':
        add('match', 'like')
    elif x.match_kind == 'is' and (x.match_confidence or 0) < 85:
        add('match', 'low_conf')
    # category
    if not x.category:
        add('category', 'no_category')
    elif x.category == MIXED:
        add('category', 'mixed')
    elif not x.subcategory and x.category in SUBS_KNOWN:
        add('category', 'no_sub')
    # retail
    if not x.retail:
        add('retail', 'no_retail')
    else:
        r = Decimal(x.retail)
        s = stats.get(x.match_product_id) if x.match_kind == 'is' else None
        ours = s and s.get('retail_avg')
        if ours:
            o = Decimal(str(ours)) / max(1, x.pieces or 1)
            if max(r, o) / max(min(r, o), Decimal('0.01')) >= 2:
                add('retail', 'retail_far')
        if r < 1:
            add('retail', 'retail_tiny')
        if r >= 2500:
            add('retail', 'retail_big')
        if is_junk_title(x.src_title) and r == r.to_integral_value() and r % 10 == 0:
            add('retail', 'retail_round')
    # price
    if x.retail and not x.price:
        add('price', 'no_price')
    if x.price and x.retail:
        share = Decimal(x.price) / Decimal(x.retail)
        if x.price_class not in ('S1', 'PL'):
            if share < target_share - band:
                add('price', 'below_band')
            elif share > target_share + band:
                add('price', 'above_band')
        if Decimal(x.price) > Decimal(x.retail):
            add('price', 'price_over_retail')
    # packs
    if (x.pack_units or 1) > 1 and not x.sell_as:
        add('packs', 'pack_undecided')
    # send
    if not x.price or not x.match_kind:
        add('send', 'not_ready')
    return f


def open_steps(flags: dict[str, list[str]], accepted: list[str]) -> list[str]:
    return [s for s, fl in flags.items() if fl and s not in (accepted or [])]
