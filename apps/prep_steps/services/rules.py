"""The standard fixes: code only, no AI. Each rule takes lines and returns changes (``changes.diff`` shape).

Every change carries its reason in a few words, so the step's table can say why. A rule never overwrites a value a
person set (source ``staff``) unless it is asked to (``force``).
"""
from __future__ import annotations

import re
from collections import Counter
from decimal import ROUND_HALF_UP, Decimal
from functools import lru_cache
from typing import Any, Iterable

from apps.prep_steps.models import PrepLine
from apps.prep_steps.services.load import fix_text

MIXED = 'Mixed lots & uncategorized'


def _staff(line: PrepLine, field: str) -> bool:
    return (line.sources or {}).get(field) == 'staff'


def _c(line: PrepLine, field: str, new: Any, reason: str) -> dict:
    return {'line': line.pk, 'field': field, 'new': new, 'reason': reason}


# -- Clean: titles, brands -----------------------------------------------------------------------------------------

_DISCLAIMER = re.compile(
    r'\(?\s*(please be advised|sets may be missing|may be missing pieces|may be incomplete|item may|'
    r'packaging may vary|not in original packaging|missing parts)[^)]*\)?', re.I)
_PAREN_CODE = re.compile(r'\(\s*[A-Z0-9][A-Z0-9\-./]{3,}\s*\)')  # (21606), (LMS30MASQB6)
_TRADEMARK = re.compile(r'[™®©]|\(r\)|\(tm\)', re.I)
_SPLIT = re.compile(r'\s*(?:,|\s-\s|\s\|\s|;)\s*')
_JUNK_TITLE = re.compile(r'^(rc\s+)?generic[_ ]|^unknown|^misc(ellaneous)?\b|^assorted\b|^n/?a$|^item\s*\d*$', re.I)
SMALL = {'a', 'an', 'and', 'or', 'of', 'the', 'for', 'with', 'in', 'on', 'to', 'by', 'x'}
MAX_TITLE = 80


def is_junk_title(title: str) -> bool:
    t = str(title or '').strip()
    return not t or bool(_JUNK_TITLE.search(t)) or len(t) < 4


def title_case(text: str) -> str:
    """ALL CAPS words become Title Case; short joining words stay small; codes with digits stay as written."""
    letters = [c for c in text if c.isalpha()]
    if not letters or not all(c.isupper() for c in letters):
        return text
    out = []
    for i, w in enumerate(text.split(' ')):
        lw = w.lower()
        if any(ch.isdigit() for ch in w):
            out.append(w)
        elif i and lw in SMALL:
            out.append(lw)
        else:
            out.append(lw[:1].upper() + lw[1:])
    return ' '.join(out)


def clean_title(src: str, brand: str = '', model: str = '') -> str:
    """The seller's long title cut to the product's name: no disclaimers, codes, trademarks or tail of specs."""
    t = fix_text(src)
    t = _DISCLAIMER.sub(' ', t)
    t = _TRADEMARK.sub('', t)
    t = _PAREN_CODE.sub(' ', t)
    if model and len(model) >= 5 and re.search(r'\d', model):
        t = re.sub(re.escape(model), ' ', t, flags=re.I)
    t = re.sub(r'\s+', ' ', t).strip(' -,/;|')
    # Target writes "... Lights - Wondershop": the brand at the end goes.
    if brand and re.search(rf'\s-\s*{re.escape(brand)}\s*$', t, re.I):
        t = re.sub(rf'\s-\s*{re.escape(brand)}\s*$', '', t, flags=re.I)
    parts = [p for p in _SPLIT.split(t) if p]
    if parts:
        head = parts[0]
        # Keep the next part when the head is too short to say what it is ("Bath Towel, 6-Pack").
        i = 1
        while i < len(parts) and len(head.split()) < 3 and len(head) + len(parts[i]) < MAX_TITLE:
            head = f'{head} {parts[i]}'
            i += 1
        t = head
    t = title_case(t)
    if len(t) > MAX_TITLE:
        t = t[:MAX_TITLE].rsplit(' ', 1)[0]
    return re.sub(r'\s+', ' ', t).strip(' -,/;|(')


def rule_clean_titles(lines: Iterable[PrepLine], force: bool = False) -> list[dict]:
    out = []
    for x in lines:
        if _staff(x, 'title') and not force:
            continue
        if is_junk_title(x.src_title):
            continue  # nothing to clean; the line stays open for a person or the AI
        new = clean_title(x.src_title, x.brand or x.src_brand, x.model or x.src_model)
        if new and new != x.title:
            cut = len(x.src_title) - len(new)
            why = 'Seller title shortened' if cut > 15 else 'Seller title tidied'
            out.append(_c(x, 'title', new, why))
    return out


@lru_cache(maxsize=1)
def _known_brands() -> dict[str, str]:
    """{normalized brand: how it is written}: brands on 3+ products, plus the BrandAlias spellings."""
    from django.db.models import Count

    from apps.inventory.models import BrandAlias, Product
    from apps.inventory.services.product_profile import PLACEHOLDER_BRANDS, normalize_brand

    out: dict[str, str] = {}
    for brand, n in (Product.objects.filter(is_active=True).values('brand').annotate(n=Count('id'))
                     .filter(n__gte=3).values_list('brand', 'n')):
        key = normalize_brand(brand)
        if key and key not in PLACEHOLDER_BRANDS and len(key) >= 2:
            out.setdefault(key, brand)
    for a in BrandAlias.objects.filter(is_junk=False).exclude(brand=''):
        out[a.alias] = a.brand
        out.setdefault(normalize_brand(a.brand), a.brand)
    # Words that are brands on some product but nouns in a title.
    for common in ('the', 'home', 'kitchen', 'outdoor', 'set', 'new', 'pro', 'black', 'white', 'large', 'small',
                   'modern', 'baby', 'kids', 'women', 'men', 'dog', 'cat', 'christmas', 'led', 'solar', 'mini',
                   'classic', 'premium', 'deluxe', 'heavy duty', 'portable', 'electric', 'wood', 'metal', 'glass'):
        out.pop(common, None)
    return out


def canonical_brand(brand: str) -> str:
    from apps.inventory.services.product_profile import PLACEHOLDER_BRANDS, normalize_brand

    b = _TRADEMARK.sub('', fix_text(brand or '')).strip()
    key = normalize_brand(b)
    if not key or key in PLACEHOLDER_BRANDS:
        return ''
    known = _known_brands().get(key)
    if known:
        letters = [c for c in b if c.isalpha()]
        mixed = letters and not (all(c.isupper() for c in letters) or all(c.islower() for c in letters))
        return b if mixed else known
    return title_case(b)


def brand_from_title(title: str) -> str:
    """The longest known brand the title starts with (1 to 4 words), else ''."""
    from apps.inventory.services.product_profile import normalize_brand

    words = normalize_brand(title).split()
    known = _known_brands()
    for n in (4, 3, 2, 1):
        if len(words) >= n:
            key = ' '.join(words[:n])
            if key in known and (n > 1 or len(key) >= 3):
                return known[key]
    return ''


CAPS_WORDS = {'LED', 'USB', 'NEW', 'XL', 'XXL', 'THE', 'SET', 'PACK', 'MENS', 'WOMENS', 'KIDS', 'BABY', 'HOME', 'RC',
              'DIY', 'PVC', 'TV', 'HD', 'UV', 'AC', 'DC', 'LCD', 'RGB', 'GPS', 'BBQ', 'ABS', 'NFL', 'NBA', 'MLB', 'NHL',
              'SPF', 'XMAS', 'MINI', 'MAX', 'PRO', 'BIG', 'HOT', 'FOR', 'AND', 'WITH', 'LARGE', 'SMALL', 'BLACK', 'WHITE'}


def rule_brands(lines: Iterable[PrepLine], force: bool = False) -> list[dict]:
    out = []
    for x in lines:
        if _staff(x, 'brand') and not force:
            continue
        if x.src_brand:
            new = canonical_brand(x.src_brand)
            why = 'Manifest brand, spelled our way' if new != x.src_brand else 'Manifest brand'
            if not new:
                new, why = brand_from_title(x.src_title), 'Manifest says no brand; found in the title'
        else:
            new, why = brand_from_title(x.src_title), 'Found at the start of the title'
            if not new:
                m = re.search(r'\s-\s*([A-Z][\w&\' ]{2,30})\s*$', x.src_title or '')
                if m:
                    new, why = canonical_brand(m.group(1)), 'Brand at the end of the title'
            if not new:
                m = re.match(r'^([A-Z][A-Z0-9&]{2,11})\s', fix_text(x.src_title))
                if m and m.group(1) not in CAPS_WORDS and not m.group(1).isdigit():
                    new, why = m.group(1), 'Capital word at the start: likely the brand'
        if new and new != x.brand:
            out.append(_c(x, 'brand', new, why))
    return out


# -- Packs: count per unit x units in the pack -----------------------------------------------------------------------

UNIT_WORDS = {
    'box': 'box', 'boxes': 'box', 'bottle': 'bottle', 'bottles': 'bottle', 'roll': 'roll', 'rolls': 'roll',
    'can': 'can', 'cans': 'can', 'bag': 'bag', 'bags': 'bag', 'pouch': 'pouch',
    'pouches': 'pouch', 'tube': 'tube', 'tubes': 'tube', 'jar': 'jar', 'jars': 'jar',
    'tub': 'tub', 'tubs': 'tub', 'canister': 'canister', 'canisters': 'canister', 'container': 'container',
    'containers': 'container', 'case': 'case', 'cases': 'case', 'pair': 'pair', 'pairs': 'pair', 'carton': 'carton',
    'cartons': 'carton', 'refill': 'refill', 'refills': 'refill', 'cartridge': 'cartridge', 'cartridges': 'cartridge',
    'sleeve': 'sleeve', 'sleeves': 'sleeve', 'tin': 'tin', 'tins': 'tin', 'spray': 'spray', 'sprays': 'spray',
    'jug': 'jug', 'jugs': 'jug',
}
COUNT_WORDS = r'(?:ct|count|tissues|sheets|wipes|pods|tablets|tabs|capsules|caps|bags|pieces|pcs|pc|sq\.? ?ft|ft|' \
              r'rolls|cups|plates|napkins|diapers|pads|liners|filters|batteries|cards|labels|envelopes|sticks)'
_N = r'(\d{1,3}(?:,\d{3})+|\d+)'
_PER_UNIT = re.compile(rf'{_N}\s*-?\s*{COUNT_WORDS}\s*(?:/|per|a|each)\s*({"|".join(UNIT_WORDS)})\b', re.I)
_UNITS = re.compile(rf'\b{_N}\s*-?\s*({"|".join(UNIT_WORDS)})\b(?!\s*(?:/|per)\s)', re.I)
_PACK_OF = re.compile(rf'\b(?:pack|set|case|box|bundle|lot) of {_N}\b', re.I)
_N_PACK = re.compile(rf'\b{_N}\s*-?\s*(?:pk|pack|packs|count pack|piece set|pc set|pcs? set)\b', re.I)
_COUNT = re.compile(rf'\b{_N}\s*-?\s*(?:ct|count)\b', re.I)
_SET_PIECES = re.compile(rf'\b{_N}\s*-?\s*(?:piece|pc|pcs)\b', re.I)


def _int(s: str) -> int:
    return int(s.replace(',', ''))


def parse_pack(title: str) -> dict[str, Any] | None:
    """{unit_count, unit_name, pack_units, why} from a seller title, or None when it names no pack.

    "125 Tissues/Box, 48 Boxes" -> 48 boxes x 125; "Pack of 3" -> 3 units; "12 ct" -> 1 x 12 (a single unit of 12);
    "Set of 2" chairs -> 2 units of 1.
    """
    t = fix_text(title)
    per = _PER_UNIT.search(t)
    unit_count, unit_name, pack_units = None, '', None
    if per:
        unit_count, unit_name = _int(per.group(1)), UNIT_WORDS[per.group(2).lower()]
    for m in _UNITS.finditer(t):
        name = UNIT_WORDS[m.group(2).lower()]
        n = _int(m.group(1))
        if per and m.start() == per.start():
            continue
        if n > 1 and n <= 500 and name != 'case':
            pack_units = n
            unit_name = unit_name or name
            break
    if pack_units is None:
        m = _PACK_OF.search(t) or _N_PACK.search(t)
        if m:
            n = _int(m.group(1))
            if 1 < n <= 500:
                pack_units = n
    if unit_count is None:
        m = _COUNT.search(t)
        if m:
            n = _int(m.group(1))
            if pack_units and n % pack_units == 0 and n // pack_units > 1 and n > pack_units:
                unit_count = n // pack_units  # "3 pack, 300 count" = 3 x 100
            elif not pack_units:
                unit_count = n
    if unit_count is None and pack_units is None:
        m = _SET_PIECES.search(t)
        if m and 1 < _int(m.group(1)) <= 500:
            return {'unit_count': _int(m.group(1)), 'unit_name': 'set', 'pack_units': 1,
                    'why': f'{_int(m.group(1))}-piece set (one item)'}
        return None
    return {'unit_count': unit_count or 1, 'unit_name': unit_name, 'pack_units': pack_units or 1,
            'why': 'Read from the seller title'}


def pack_words(unit_count: int | None, unit_name: str, pack_units: int | None) -> str:
    """The one standard: ``3 boxes x 100``; a single unit is ``100 ct``."""
    uc, pu = unit_count or 1, pack_units or 1
    if pu > 1:
        name = unit_name or 'unit'
        if name.endswith('s'):
            plural = name
        elif name.endswith(('x', 'ch', 'sh')):
            plural = name + 'es'
        elif name.endswith('y') and name[-2:-1] not in 'aeiou':
            plural = name[:-1] + 'ies'
        else:
            plural = name + 's'
        return f'{pu} {plural} × {uc}' if uc > 1 else f'{pu} {plural}'
    if uc > 1:
        return f'{uc}-piece set' if unit_name == 'set' else f'{uc} ct'
    return ''


def rule_packs(lines: Iterable[PrepLine], force: bool = False) -> list[dict]:
    out = []
    for x in lines:
        if any(_staff(x, f) for f in ('unit_count', 'pack_units', 'pieces')) and not force:
            continue
        p = parse_pack(x.src_title)
        if p is None:
            if x.unit_count or x.pack_units:
                out += [_c(x, 'unit_count', None, 'No pack in the title'), _c(x, 'pack_units', None, ''),
                        _c(x, 'unit_name', '', '')]
            continue
        why = f"{pack_words(p['unit_count'], p['unit_name'], p['pack_units']) or 'single'}: {p['why']}"
        out += [_c(x, 'unit_count', p['unit_count'], why), _c(x, 'unit_name', p['unit_name'], why),
                _c(x, 'pack_units', p['pack_units'], why)]
    return out


def sell_changes(x: PrepLine, sell_as: str, target_share: Decimal) -> list[dict]:
    """Sell the pack whole (one tag) or as its units (a tag a unit): pieces, and retail and price of one piece."""
    pieces = (x.pack_units or 1) if sell_as == 'units' else 1
    out = [_c(x, 'sell_as', sell_as, 'A tag a unit' if sell_as == 'units' else 'One tag for the pack'),
           _c(x, 'pieces', pieces, f'{pieces} tags a manifest unit' if pieces > 1 else 'One tag a manifest unit')]
    base = x.src_retail
    if base:
        retail = (Decimal(base) / pieces).quantize(Decimal('0.01'))
        out.append(_c(x, 'retail', retail, f'Manifest retail / {pieces}' if pieces > 1 else 'Manifest retail'))
        share = (Decimal(x.price) / Decimal(x.retail)) if x.price and x.retail else target_share
        out.append(_c(x, 'price', house_round(retail * share, retail), f'Same share of retail ({share:.0%})'))
    return out


# -- Category ---------------------------------------------------------------------------------------------------------

SUB_RULES: dict[str, list[tuple[str, str]]] = {
    'Toys & games': [
        (r'plush|stuffed', 'Plush'), (r'lego|building (set|block)|blocks\b|magnetic tiles', 'Building sets'),
        (r'puzzle|board game|card game', 'Board games & puzzles'), (r'doll|playset|dollhouse', 'Dolls & playsets'),
        (r'action figure|figure\b|figurine', 'Figures'), (r'\brc\b|remote control', 'RC & vehicles'),
        (r'ride[- ]on|trampoline|swing set|slide|sandbox|bounce house', 'Outdoor & ride-ons'),
        (r'pretend|play kitchen|tool set for kids|dress up', 'Pretend play'), (r'learning|educational|stem', 'Learning'),
        (r'light[- ]up|electronic|robot', 'Electronic & light-up'), (r'craft kit|slime|paint kit', 'Arts & crafts kits'),
        (r'collectible|trading card|funko', 'Collectibles'),
    ],
    'Apparel & accessories': [
        (r'shoe|sneaker|boot|sandal|\bheels?\b|slipper|loafer|clog|insole', 'Shoes'),
        (r'\bbag\b|backpack|luggage|suitcase|purse|handbag|wallet|tote', 'Bags & luggage'),
        (r'jewelry|necklace|earring|bracelet|\bring\b|watch\b', 'Jewelry & watches'),
        (r'\bhat\b|belt|beanie|\bcap\b|scarf|gloves|ear warmer|hair clip|headband', 'Hats, belts & hair accessories'),
        (r'underwear|\bbra\b|panties|boxer|swim|bikini|lingerie', 'Underwear & swim'),
        (r'kids|boys|girls|toddler|baby|youth', "Kids'"), (r'women|woman|ladies|maternity', "Women's"), (r'\bmen\b|mens|men\'s', "Men's"),
    ],
    'Health, beauty & personal care': [
        (r'shampoo|conditioner|hair dryer|blow dryer|straightener|curling|flat iron|hair', 'Hair care'),
        (r'razor|shaver|trimmer|shaving|clipper', 'Shaving'), (r'toothbrush|toothpaste|oral|floss|water flosser|mouthwash', 'Oral care'),
        (r'lotion|serum|moisturizer|skin|sunscreen|face', 'Skin care'), (r'makeup|lipstick|mascara|nail|cosmetic|brush set', 'Makeup'),
        (r'deodorant|antiperspirant', 'Deodorant'), (r'vitamin|supplement|protein|gummies', 'Vitamins & supplements'),
        (r'bandage|first aid|thermometer|blood pressure|pain relief|medicine|cold|allergy', 'OTC & first aid'),
        (r'wheelchair|walker|rollator|incontinence|brief|cane|knee scooter|massager', 'Incontinence & wellness'),
        (r'body wash|soap|bath bomb', 'Body wash & soap'),
    ],
    'Electronics': [
        (r'case\b|screen protector', 'Phone & tablet cases'),
        (r'cable|charger|power bank|portable charger|inverter|adapter|batter|surge|power strip|extension', 'Cables, chargers & power'),
        (r'headphone|earbud|headset|speaker|soundbar|radio|microphone', 'Audio'),
        (r'tv mount|television|\btv\b|projector', 'TV & mounts'),
        (r'camera|smart plug|doorbell|security|smart bulb|alexa|echo|router|wifi', 'Smart home & cameras'),
        (r'keyboard|mouse|monitor|webcam|laptop stand|usb hub|printer|ink', 'Computer accessories'),
        (r'gaming|controller|playstation|xbox|nintendo|switch', 'Gaming'), (r'smart ?watch|fitness tracker', 'Wearables'),
        (r'phone|tablet|ipad', 'Phones & tablets'),
    ],
    'Sports & outdoors': [
        (r'camping|tent|sleeping bag|lantern|hammock', 'Camping'),
        (r'dumbbell|yoga|treadmill|exercise|fitness|kettlebell|weight|resistance band|workout|trampoline', 'Fitness'),
        (r'bike|bicycle|scooter|skateboard|helmet', 'Bikes & scooters'),
        (r'ball\b|hoop|\bbat\b|baseball glove|soccer|football|basketball|volleyball|hockey|golf', 'Team sports'),
        (r'kayak|paddle|float|swim|life jacket|snorkel', 'Water & float'), (r'cooler', 'Coolers'),
        (r'fishing|hunting|archery|decoy|tree stand', 'Hunting & fishing'),
    ],
    'Storage & organization': [
        (r'hamper|laundry basket', 'Laundry baskets & hampers'), (r'hanger', 'Hangers'),
        (r'shoe rack|closet|wardrobe|garment rack|drawer organizer', 'Closet'),
        (r'garage|wall mount|tool storage|pegboard|utility shelf', 'Garage & wall'), (r'vacuum (storage )?bag|space saver', 'Vacuum bags'),
        (r'\bbins?\b|tote|basket|storage box|container|organizer', 'Bins & totes'),
    ],
    'Pet supplies': [
        (r'litter|pee pad|potty pad|training pad', 'Litter & pads'), (r'\bfood\b|treat|chew', 'Food & treats'),
        (r'\bbed\b|crate|kennel|gate|carrier|playpen', 'Beds, crates & gates'), (r'leash|collar|harness', 'Collars & leashes'),
        (r'groom|shampoo|brush|nail clipper|flea|tick|supplement', 'Health & grooming'), (r'\btoys?\b|ball|squeaky', 'Toys'),
        (r'\bcats?\b|kitten|scratch', 'Cat'), (r'\bdogs?\b|puppy', 'Dog'),
    ],
    'Baby & kids': [
        (r'diaper|wipes', 'Diapers & wipes'), (r'bottle|feeding|high chair|bib|formula|sippy', 'Feeding'),
        (r'swaddle|crib|nursery|bassinet|sleep sack|baby monitor', 'Nursery & swaddles'),
        (r'stroller|car seat|carrier|playard|walker|bouncer|swing', 'Gear'), (r'backpack|lunch', "Kids' backpacks & lunch"),
        (r'teether|rattle|baby toy|activity gym', 'Baby toys'),
    ],
    'Office & school supplies': [
        (r'pen\b|pens\b|pencil|marker|highlighter', 'Pens & pencils'), (r'planner|calendar|agenda', 'Planners'),
        (r'notebook|paper|journal|sticky note|index card', 'Notebooks & paper'), (r'greeting card|stationery|invitation', 'Cards & stationery'),
        (r'label|envelope|mailer|shipping|tape dispenser', 'Mailing & labels'), (r'organizer|file|tray|desk caddy', 'Desk organizers'),
        (r'stapler|scissors|calculator|clip|glue|tape', 'Desk supplies'),
    ],
    'Arts & crafts': [
        (r'paint|marker|crayon|colored pencil|canvas', 'Paint & markers'), (r'yarn|sewing|thread|knit|crochet|embroider', 'Yarn & sewing'),
        (r'fabric|felt|vinyl', 'Fabric'), (r'scrapbook|cardstock|sticker', 'Scrapbook & paper'), (r'storage|organizer|case', 'Craft storage'),
        (r'kit', 'Kits'), (r'cricut|glue gun|bead|ribbon|craft', 'Craft supplies'),
    ],
    'Appliances': [
        (r'vacuum|carpet cleaner|steam mop|floor', 'Floor care'), (r'\bfan\b|air conditioner|cooler', 'Fans & cooling'),
        (r'heater', 'Heaters'), (r'purifier|humidifier|dehumidifier|air quality', 'Air quality'),
        (r'washer|dryer|laundry', 'Laundry'), (r'fridge|refrigerator|freezer|range|oven|dishwasher|ice maker', 'Major & fridges'),
    ],
    'Furniture': [
        (r'desk', 'Desks'), (r'\bbed\b|headboard|bed frame|bedroom set|bunk|daybed|platform bed|mattress foundation',
                             'Beds & frames'),
        (r'sofa|sectional|chair|stool|bench|recliner|loveseat|ottoman|futon|seat', 'Seating'),
        (r'table|nightstand', 'Tables'),
        (r'dresser|cabinet|bookcase|book shelf|shelf|shelves|chest|wardrobe|armoire|tv stand|console|hall tree|'
         r'sideboard|buffet|credenza|vanity|storage', 'Storage furniture'),
        (r'kids|toddler|children', "Kids' furniture"), (r'cover|cushion|slipcover|leg|hardware|parts?\b', 'Covers, pads & parts'),
    ],
    'Household & cleaning': [
        (r'trash bag|garbage bag|kitchen bag', 'Trash bags'), (r'trash can|wastebasket|garbage can', 'Trash cans'),
        (r'wipes', 'Wipes'), (r'tissue|toilet paper|paper towel|bath tissue|napkin', 'Paper goods'),
        (r'detergent|laundry|softener|dryer sheet|bleach|stain', 'Laundry care'),
        (r'air freshener|febreze|glade|air wick|odor', 'Air fresheners'), (r'pest|insect|mouse|roach|trap', 'Pest control'),
        (r'mop|broom|brush|sponge|scrub|duster|bucket|vacuum', 'Cleaning tools'), (r'clean|disinfect|spray', 'Cleaners'),
    ],
    'Home décor & lighting': [
        (r'string light|led strip|fairy light|light strip', 'String & LED lights'), (r'lamp|light|chandelier|sconce|fixture', 'Lamps & lighting'),
        (r'mirror', 'Mirrors'), (r'wall art|canvas|frame|print|poster', 'Wall art & frames'), (r'pillow', 'Throw pillows'),
        (r'artificial|faux plant|flower|greenery', 'Artificial plants'), (r'candle|diffuser|wax', 'Candles & fragrance'),
        (r'curtain|blind|drape|shade', 'Curtains & blinds'), (r'\brug\b|runner', 'Indoor rugs'),
    ],
    'Kitchen & dining': [
        (r'blender|mixer|toaster|air fryer|coffee|kettle|microwave|cooker|maker|processor|juicer|griddle', 'Small appliances'),
        (r'pan|pot|skillet|bakeware|baking|dutch oven|cookware|sheet', 'Cookware & bakeware'),
        (r'tumbler|mug|bottle|cup|glass', 'Drinkware & bottles'), (r'plate|bowl|dinnerware|flatware|silverware', 'Dinnerware'),
        (r'container|storage|lunch|food saver', 'Food storage & lunch'), (r'foil|plastic wrap|disposable|paper plate', 'Disposables'),
        (r'knife|utensil|spatula|gadget|peeler|tongs|measuring', 'Tools & gadgets'),
    ],
    'Bedding & bath': [
        (r'comforter|duvet|quilt|bedding set', 'Comforters & sets'), (r'sheet|pillowcase', 'Sheets & pillowcases'),
        (r'mattress|topper', 'Mattresses & toppers'), (r'pillow', 'Pillows'), (r'blanket|throw', 'Blankets & throws'),
        (r'towel', 'Towels'), (r'shower|bath|toilet|soap dish', 'Shower & bath accessories'),
    ],
    'Party, seasonal & novelty': [
        (r'christmas|holiday|halloween|easter|thanksgiving|ornament|wreath|garland|tree', 'Holiday'),
        (r'birthday', 'Birthday'), (r'balloon|banner', 'Balloons & banners'), (r'costume', 'Costumes'),
        (r'flag', 'Flags'), (r'plate|cup|napkin|tableware', 'Tableware'),
    ],
    'Lawn & garden': [
        (r'grill|fire pit|smoker', 'Grills & fire pits'), (r'pool|spa|hot tub', 'Pool & spa'),
        (r'hose|sprinkler|watering', 'Hoses & watering'), (r'planter|pot\b', 'Planters'),
        (r'mower|trimmer|blower|chainsaw|edger|tiller', 'Power equipment'), (r'seed|soil|mulch|fertilizer', 'Seed & soil'),
    ],
    'Outdoor & patio furniture': [
        (r'umbrella', 'Umbrellas & bases'), (r'cushion|pillow', 'Cushions & pillows'), (r'table', 'Tables'),
        (r'rug', 'Outdoor rugs'), (r'deck box|storage', 'Deck boxes'), (r'chair|bench|sofa|seat|lounger|swing|sectional', 'Chairs & benches'),
    ],
    'Tools & hardware': [
        (r'drill|saw|sander|grinder|impact|cordless|power tool', 'Power tools'), (r'pressure washer', 'Pressure washers'),
        (r'paint|brush|roller|primer|stain', 'Paint & supplies'), (r'faucet|sink|toilet|plumb|shower head|valve', 'Plumbing'),
        (r'outlet|switch|wire|electrical|extension cord|breaker', 'Electrical'), (r'lock|deadbolt|padlock', 'Locks'),
        (r'screw|nail|bolt|anchor|hinge|bracket|hardware', 'Fasteners & hardware'), (r'wrench|hammer|screwdriver|plier|socket|tool', 'Hand tools'),
    ],
    'Automotive': [
        (r'oil|fluid|coolant|antifreeze|additive|treatment', 'Fluids & oil'), (r'tire|inflator|air compressor', 'Tire & air'),
        (r'wash|wax|polish|detail|clean', 'Car care & cleaning'), (r'seat cover|floor mat|organizer|phone mount', 'Interior accessories'),
    ],
}


def subcategory_for(category: str, text: str) -> str:
    t = str(text or '').lower()
    for pattern, sub in SUB_RULES.get(category, []):
        if re.search(pattern, t):
            return sub
    return ''


def _keyword_category(text: str) -> str:
    from apps.inventory.canonical_categories import canonical_category_name
    from apps.inventory.services.categorizer import _rule_match

    hit = _rule_match(str(text or '').lower())
    if not hit:
        return ''
    name = canonical_category_name(hit[1])
    if name == MIXED:
        name = canonical_category_name(hit[0])
    return '' if name == MIXED else name


# The seller's own item-level category words (Walmart's "Seller Category", Wayfair's): these beat the pallet code.
SELLER_WORDS: dict[str, tuple[str, str]] = {
    'clothing': ('Apparel & accessories', ''), 'footwear': ('Apparel & accessories', 'Shoes'),
    'jewelry': ('Apparel & accessories', 'Jewelry & watches'), 'cases & bags': ('Apparel & accessories', 'Bags & luggage'),
    'beauty, personal care, & hygiene': ('Health, beauty & personal care', ''),
    'health & beauty electronics': ('Health, beauty & personal care', ''),
    'medical aids & equipment': ('Health, beauty & personal care', 'Incontinence & wellness'),
    'medicine & supplements': ('Health, beauty & personal care', 'Vitamins & supplements'),
    'bedding': ('Bedding & bath', ''), 'garden & patio': ('Lawn & garden', ''),
    'decorations & favors': ('Party, seasonal & novelty', ''), 'costumes': ('Party, seasonal & novelty', 'Costumes'),
    'household cleaning products & supplies': ('Household & cleaning', ''), 'toys': ('Toys & games', ''),
    'vehicle parts & accessories': ('Automotive', ''), 'storage': ('Storage & organization', ''),
    'large appliances': ('Appliances', ''), 'electronics accessories': ('Electronics', ''),
    'electronics cables': ('Electronics', 'Cables, chargers & power'), 'electronics other': ('Electronics', ''),
    'animal accessories': ('Pet supplies', ''), 'animal other': ('Pet supplies', ''), 'furniture': ('Furniture', ''),
    'plumbing & hvac': ('Tools & hardware', 'Plumbing'), 'food & beverage': ('Kitchen & dining', 'Pantry & grocery'),
    'sport & recreation other': ('Sports & outdoors', ''), 'hardware': ('Tools & hardware', 'Fasteners & hardware'),
    'building supply': ('Tools & hardware', ''), 'tools': ('Tools & hardware', ''),
    'office': ('Office & school supplies', ''), 'baby': ('Baby & kids', ''), 'books': ('Books & media', ''),
    'video games': ('Books & media', 'Video games'), 'kitchen & dining': ('Kitchen & dining', ''),
}
# Words in a title that settle the category whatever the seller says (checked when the seller is vague).
KEYWORD_CATS: list[tuple[str, str, str]] = [
    (r'espresso|coffee maker|blender|air fryer|toaster|stand mixer|kettle|microwave|slow cooker|instant pot|'
     r'pressure cooker|food processor|juicer|rice cooker|waffle maker', 'Kitchen & dining', 'Small appliances'),
    (r'christmas tree|artificial tree|ornament|wreath|garland|nutcracker|advent', 'Party, seasonal & novelty', 'Holiday'),
    (r'costume', 'Party, seasonal & novelty', 'Costumes'),
    (r'halloween|thanksgiving|easter', 'Party, seasonal & novelty', 'Holiday'),
    (r'trampoline|treadmill|dumbbell|kettlebell|exercise bike|yoga mat|basketball hoop', 'Sports & outdoors', 'Fitness'),
    (r'bike|bicycle|scooter', 'Sports & outdoors', 'Bikes & scooters'), (r'tent|sleeping bag|camping', 'Sports & outdoors', 'Camping'),
    (r'wheelchair|walker|rollator|knee scooter|commode|incontinence', 'Health, beauty & personal care', 'Incontinence & wellness'),
    (r'vacuum|carpet cleaner|steam mop|robot vac', 'Appliances', 'Floor care'), (r'space heater', 'Appliances', 'Heaters'),
    (r'air purifier|humidifier|dehumidifier', 'Appliances', 'Air quality'), (r'\bfan\b|air conditioner', 'Appliances', 'Fans & cooling'),
    (r'refrigerator|mini fridge|chest freezer|upright freezer|washing machine|clothes dryer|dishwasher', 'Appliances',
     'Major & fridges'),
    (r'pressure washer', 'Tools & hardware', 'Pressure washers'),
    (r'cutlery|disposable plates|paper plates|plastic cups|plastic forks', 'Kitchen & dining', 'Disposables'),
    (r'\btv\b|television|soundbar|headphones|earbuds|speaker', 'Electronics', ''),
    (r'dog |cat |pet |litter', 'Pet supplies', ''), (r'diaper|baby wipes|stroller|car seat|crib|high chair', 'Baby & kids', ''),
    (r'sofa|sectional|loveseat|recliner|dresser|nightstand|bookcase|bed frame|headboard|dining table|tv stand|'
     r'hall tree|bar stool|accent chair|futon', 'Furniture', ''),
    (r'patio|outdoor dining set|adirondack|porch swing', 'Outdoor & patio furniture', ''),
    (r'drill|impact driver|circular saw|socket set|wrench|tool set|tool box', 'Tools & hardware', ''),
    (r'lamp|chandelier|pendant light|ceiling light|string light', 'Home décor & lighting', ''),
    (r'\brug\b|curtain|mirror|wall art|throw pillow|artificial plant|candle', 'Home décor & lighting', ''),
    (r'comforter|sheet set|duvet|mattress|pillow|blanket|towel', 'Bedding & bath', ''),
    (r'cookware|pan set|skillet|dinnerware|knife set|food storage|tumbler|water bottle', 'Kitchen & dining', ''),
    (r'lego|doll|action figure|playset|puzzle|board game|plush|toy', 'Toys & games', ''),
]
VAGUE = re.compile(r'other|misc|mixed|general|assorted|home decor, kitchen', re.I)


def keyword_category(text: str) -> tuple[str, str]:
    t = str(text or '').lower()
    for pattern, cat, sub in KEYWORD_CATS:
        if re.search(pattern, t):
            return cat, sub
    return '', ''


def _sub_text(x: PrepLine) -> str:
    """Words for the subcategory: the title, plus the seller's subcategory when it names the item (Wayfair's
    "Sectionals") rather than a broad department (Walmart's "Household Cleaning Products & Supplies")."""
    sub = (x.src_subcategory or '').strip()
    if sub and sub.lower() not in SELLER_WORDS and not VAGUE.search(sub):
        return f'{x.title or x.src_title} {sub}'
    return x.title or x.src_title


def category_by_rule(x: PrepLine, product_cat: dict[int, tuple[str, str]]) -> tuple[str, str, str]:
    """(category, subcategory, why): the matched product's, else title words that settle it, else the seller's
    item-level category, else the seller's code, else looser title words."""
    from apps.inventory.canonical_categories import canonical_category_name

    if x.match_product_id and x.match_kind == 'is':
        cat, sub = product_cat.get(x.match_product_id, ('', ''))
        if cat and cat != MIXED:
            return cat, sub or subcategory_for(cat, x.title), 'Same as the matched product'
    text = _sub_text(x)
    kcat, ksub = keyword_category(x.title or x.src_title)
    seller = SELLER_WORDS.get((x.src_subcategory or '').strip().lower())
    vague = bool(VAGUE.search(x.src_subcategory or ''))
    if seller and not vague:
        return seller[0], seller[1] or (ksub if kcat == seller[0] else '') or subcategory_for(seller[0], text), \
            f'From the seller category ({x.src_subcategory[:40]})'
    if kcat:
        return kcat, ksub or subcategory_for(kcat, text), 'Words in the title settle it'
    if seller:
        return seller[0], seller[1] or subcategory_for(seller[0], text), \
            f'From the seller category ({x.src_subcategory[:40]})'
    for value, label in ((x.src_subcategory, 'seller subcategory'), (x.src_category, 'seller category')):
        if value and label == 'seller subcategory' and vague:
            continue
        if value:
            cat = canonical_category_name(value)
            if cat != MIXED:
                return cat, subcategory_for(cat, text), f'From the {label} ({value[:40]})'
    cat = _keyword_category(x.title)
    if cat:
        return cat, subcategory_for(cat, text), 'Words in the title'
    if x.match_product_id:
        cat, sub = product_cat.get(x.match_product_id, ('', ''))
        if cat and cat != MIXED:
            return cat, sub, 'Same as a similar product'
    return MIXED, '', 'No rule fits'


def product_categories(product_ids: set[int]) -> dict[int, tuple[str, str]]:
    from apps.inventory.models import ProductProfile

    if not product_ids:
        return {}
    return {pid: (c or '', s or '') for pid, c, s in ProductProfile.objects.filter(product_id__in=product_ids)
            .values_list('product_id', 'category', 'subcategory')}


def rule_category(lines: list[PrepLine], force: bool = False) -> list[dict]:
    cats = product_categories({x.match_product_id for x in lines if x.match_product_id})
    out = []
    for x in lines:
        if _staff(x, 'category') and not force:
            continue
        cat, sub, why = category_by_rule(x, cats)
        out += [_c(x, 'category', cat, why), _c(x, 'subcategory', sub, why if sub else '')]
    return out


def rule_category_from_product(lines: list[PrepLine], force: bool = False) -> list[dict]:
    cats = product_categories({x.match_product_id for x in lines if x.match_product_id})
    out = []
    for x in lines:
        cat, sub = cats.get(x.match_product_id, ('', '')) if x.match_product_id else ('', '')
        if cat and cat != MIXED and (force or not _staff(x, 'category')):
            out += [_c(x, 'category', cat, 'Same as the matched product'), _c(x, 'subcategory', sub, '')]
    return out


# -- Retail -----------------------------------------------------------------------------------------------------------

def rule_retail_manifest(lines: Iterable[PrepLine], force: bool = False) -> list[dict]:
    out = []
    for x in lines:
        if _staff(x, 'retail') and not force:
            continue
        if x.src_retail:
            pieces = max(1, x.pieces or 1)
            r = (Decimal(x.src_retail) / pieces).quantize(Decimal('0.01'))
            out.append(_c(x, 'retail', r, 'Manifest unit retail' if pieces == 1 else f'Manifest retail / {pieces}'))
        elif x.src_ext_retail and x.src_qty:
            r = (Decimal(x.src_ext_retail) / x.src_qty).quantize(Decimal('0.01'))
            out.append(_c(x, 'retail', r, 'Manifest ext. retail / qty'))
    return out


def product_stats(product_ids: set[int]) -> dict[int, dict]:
    """{product id: {retail_avg, sold, avg_sold, items, on_shelf, number, title, brand}} (inventory search stats)."""
    from apps.inventory.models import Product
    from apps.inventory.services.inventory_search import _stats

    if not product_ids:
        return {}
    stats = _stats(list(product_ids))
    out = {}
    for p in Product.objects.filter(pk__in=product_ids).only('id', 'product_number', 'title', 'brand'):
        s = stats.get(p.pk) or {}
        out[p.pk] = {
            'number': p.product_number or '', 'title': p.title, 'brand': p.brand,
            'retail_avg': round(float(s['retail_avg']), 2) if s.get('retail_avg') else None,
            'sold': s.get('sold') or 0, 'avg_sold': round(float(s['avg_sold']), 2) if s.get('avg_sold') else None,
            'items': s.get('items') or 0, 'on_shelf': s.get('on_shelf') or 0,
        }
    return out


def rule_retail_history(lines: list[PrepLine], force: bool = False) -> list[dict]:
    """Where the manifest retail is far (2x) from what this product's items retailed for, use ours."""
    stats = product_stats({x.match_product_id for x in lines if x.match_product_id and x.match_kind == 'is'})
    out = []
    for x in lines:
        s = stats.get(x.match_product_id) if x.match_kind == 'is' else None
        ours = s and s.get('retail_avg')
        if not ours or (_staff(x, 'retail') and not force):
            continue
        ours_d = (Decimal(str(ours)) / max(1, x.pieces or 1)).quantize(Decimal('0.01'))
        mine = Decimal(x.retail or 0)
        if not mine or max(mine, ours_d) / max(min(mine, ours_d), Decimal('0.01')) >= 2:
            out.append(_c(x, 'retail', ours_d, f'Our past retail for {s["number"]} (manifest said ${mine})'))
    return out


# -- Price ------------------------------------------------------------------------------------------------------------

CLASSES: dict[str, tuple[Decimal, str]] = {
    # code: (share of retail at the usual 55% start, label). Shares from the owner's PO 428 classes (11-16).
    'S1': (Decimal('0.65'), 'Commodity, name brand'),
    'PL': (Decimal('0.55'), 'Commodity, store brand'),
    'XMAS': (Decimal('0.65'), 'Christmas: sell before Dec 20'),
    'TOY': (Decimal('0.62'), 'Toys and gifts before Christmas'),
    'HBA': (Decimal('0.57'), 'Health and beauty'),
    'TOOL': (Decimal('0.58'), 'Tools, hardware, car care'),
    'GEN': (Decimal('0.55'), 'General'),
    'FURN': (Decimal('0.55'), 'Furniture: final at check-in by condition'),
    'APP': (Decimal('0.42'), 'Clothing and shoes'),
    'HOLD': (Decimal('0.40'), 'Off season'),
    'DEEP': (Decimal('0.35'), 'Too many of one thing'),
    'UNK': (Decimal('0.45'), 'Not sure what it is'),
}
USUAL = Decimal('0.55')
COMMODITY = ('S1', 'PL')
# Where Pricing Standards' commodities live; its word list alone also hits durable goods ("power cleaner").
COMMODITY_CATS = {'Household & cleaning', 'Health, beauty & personal care', 'Baby & kids', 'Pet supplies',
                  'Automotive', 'Office & school supplies', 'Kitchen & dining', 'Electronics'}
DEEP_QTY = 24
_XMAS = re.compile(r'christmas|xmas|santa|ornament|nutcracker|wreath|garland|grinch|gingerbread|advent|stocking', re.I)
_OFF = re.compile(r'\bpool\b|swim|sunscreen|beach|kiddie pool|water gun|sprinkler|patio umbrella|halloween|easter', re.I)


def class_for(x: PrepLine) -> tuple[str, str]:
    from apps.inventory.services import pricing_standards as ps

    mark = ps.suggest(x.title or x.src_title, x.brand)
    if x.category and x.category not in COMMODITY_CATS:
        mark = ''  # a "cleaner" that is a pressure washer is not a commodity
    if mark == ps.NAME_BRAND:
        return 'S1', 'Commodity, name brand (Pricing Standards)'
    if mark == ps.STORE_BRAND:
        return 'PL', 'Commodity, store brand (Pricing Standards)'
    if is_junk_title(x.title):
        return 'UNK', 'No real title'
    text = f'{x.title} {x.src_subcategory}'
    cat = x.category or ''
    if _XMAS.search(text):
        return 'XMAS', 'Christmas item'
    if _OFF.search(text):
        return 'HOLD', 'Off season'
    if (x.qty or 1) >= DEEP_QTY:
        return 'DEEP', f'{x.qty} of one thing'
    if cat == 'Toys & games':
        return 'TOY', 'Toy before Christmas'
    if cat in ('Furniture', 'Outdoor & patio furniture'):
        return 'FURN', 'Furniture: final price at check-in by condition'
    if cat == 'Health, beauty & personal care':
        return 'HBA', 'Health and beauty'
    if cat in ('Tools & hardware', 'Automotive'):
        return 'TOOL', 'Tools, hardware, car care'
    if cat == 'Apparel & accessories':
        return 'APP', 'Clothing'
    return 'GEN', 'General'


def class_share(code: str, target: Decimal) -> Decimal:
    """A class's share on this truck: commodities follow Pricing Standards; the rest move with the truck target."""
    from apps.inventory.services import pricing_standards as ps

    if code == 'S1':
        return Decimal(str(ps.standards().name_share))
    if code == 'PL':
        return Decimal(str(ps.standards().store_share))
    base = CLASSES.get(code, CLASSES['GEN'])[0]
    return min(Decimal('1'), (base * target / USUAL)).quantize(Decimal('0.001'))


def house_round(price: Decimal, retail: Decimal | None) -> Decimal:
    from apps.inventory.services import pricing_standards as ps

    return ps.money(Decimal(price), Decimal(retail or price or 1))


def rule_price(lines: Iterable[PrepLine], target: Decimal, force: bool = False, keep_class: bool = False) -> list[dict]:
    out = []
    for x in lines:
        if _staff(x, 'price') and not force:
            continue
        code, why = (x.price_class, 'Class kept') if keep_class and x.price_class in CLASSES else class_for(x)
        out.append(_c(x, 'price_class', code, why))
        if not x.retail:
            out.append(_c(x, 'price', None, 'No retail: price it at check-in'))
            continue
        share = class_share(code, target)
        price = house_round(Decimal(x.retail) * share, x.retail)
        out.append(_c(x, 'price', price, f'{code} {share:.0%} of ${x.retail}: {why}'))
    return out


def rule_price_share(lines: Iterable[PrepLine], share: Decimal) -> list[dict]:
    out = []
    for x in lines:
        if x.retail:
            out.append(_c(x, 'price', house_round(Decimal(x.retail) * share, x.retail), f'Set to {share:.0%} of retail'))
    return out


def rule_price_from_sold(lines: list[PrepLine], force: bool = False) -> list[dict]:
    """Matched products that have sold: the price they sold for (3+ sales)."""
    stats = product_stats({x.match_product_id for x in lines if x.match_product_id and x.match_kind == 'is'})
    out = []
    for x in lines:
        s = stats.get(x.match_product_id) if x.match_kind == 'is' else None
        if not s or s['sold'] < 3 or not s['avg_sold'] or (_staff(x, 'price') and not force):
            continue
        per = Decimal(str(s['avg_sold'])) / max(1, x.pieces or 1)
        out.append(_c(x, 'price', house_round(per, x.retail),
                      f"{s['number']} sold {s['sold']} times at ${s['avg_sold']:.2f} on average"))
    return out


def truck_totals(lines: Iterable[PrepLine]) -> dict[str, Decimal]:
    retail = tag = Decimal('0')
    for x in lines:
        n = (x.qty or 1) * max(1, x.pieces or 1)
        if x.retail:
            retail += Decimal(x.retail) * n
        if x.price:
            tag += Decimal(x.price) * n
    return {'retail': retail, 'tag': tag}


def manifest_retail(lines: Iterable[PrepLine]) -> Decimal:
    return sum((Decimal(x.src_retail or 0) * (x.src_qty or 1) for x in lines), Decimal('0'))


def rule_scale_to_target(lines: list[PrepLine], target_total: Decimal) -> list[dict]:
    """Scale every non-commodity, non-staff price so the truck's tag total lands on the target total."""
    fixed = Decimal('0')
    movable: list[PrepLine] = []
    for x in lines:
        n = (x.qty or 1) * max(1, x.pieces or 1)
        if not x.price:
            continue
        if x.price_class in COMMODITY or _staff(x, 'price'):
            fixed += Decimal(x.price) * n
        else:
            movable.append(x)
    now = sum((Decimal(x.price) * (x.qty or 1) * max(1, x.pieces or 1) for x in movable), Decimal('0'))
    if not now:
        return []
    factor = max(Decimal('0'), target_total - fixed) / now
    out = []
    for x in movable:
        new = house_round(Decimal(x.price) * factor, x.retail)
        out.append(_c(x, 'price', new, f'Scaled {factor:.2f}x to reach the truck target'))
    return out


# -- Send: search tags ------------------------------------------------------------------------------------------------

_SIZE = re.compile(r'\b\d+(?:\.\d+)?\s*(?:"|in|inch|ft|oz|fl oz|lb|qt|gal|l|ml|gb|tb|w|v|mah|ct|count|pk|pack|piece|pc|'
                   r'quart|cup|x\s*\d+)\b', re.I)
_STOP = {'with', 'and', 'for', 'the', 'of', 'in', 'a', 'an', 'to', 'by', 'set', 'new', 'pack', 'piece', 'pcs', 'pc',
         'ct', 'count', 'x', 'inch', 'ft', 'oz'}


def search_tags(x: PrepLine) -> list[str]:
    """Brand, model, the key noun words, a size: what to type into a vendor site or Google."""
    from apps.inventory.services.product_profile import normalize_brand

    tags: list[str] = []
    if x.brand:
        tags.append(x.brand)
    if x.model and len(x.model) >= 3:
        tags.append(x.model)
    bkey = set(normalize_brand(x.brand).split())
    words = [w for w in re.sub(r'[^\w&\'". -]+', ' ', x.title or '').split()
             if w.lower() not in _STOP and w.lower() not in bkey and not _SIZE.fullmatch(w)]
    if words:
        tags.append(' '.join(words[:6]))
    size = _SIZE.search(x.src_title or '')
    if size:
        tags.append(size.group(0).strip())
    wording = pack_words(x.unit_count, x.unit_name, x.pack_units)
    if wording and wording not in tags:
        tags.append(wording)
    seen, out = set(), []
    for t in tags:
        k = t.lower()
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out


def rule_search_tags(lines: Iterable[PrepLine], force: bool = False) -> list[dict]:
    return [_c(x, 'search_tags', search_tags(x), 'Brand, model, key words, size')
            for x in lines if force or not _staff(x, 'search_tags')]


# -- Revert: back to what the manifest said -----------------------------------------------------------------------------

REVERT: dict[str, dict[str, Any]] = {
    'clean': {'title': 'src_title', 'brand': 'src_brand', 'model': 'src_model', 'qty': 'src_qty'},
    'match': {'match_product_id': None, 'match_kind': '', 'match_confidence': None},
    'category': {'category': '', 'subcategory': ''},
    'retail': {'retail': 'src_retail'},
    'price': {'price': None, 'price_class': ''},
    'packs': {'unit_count': None, 'unit_name': '', 'pack_units': None, 'pieces': 1, 'sell_as': ''},
    'send': {'search_tags': []},
}


def rule_revert(lines: Iterable[PrepLine], step: str) -> list[dict]:
    out = []
    for x in lines:
        for field, value in REVERT.get(step, {}).items():
            new = getattr(x, value) if isinstance(value, str) and value.startswith('src_') else value
            if field == 'title':
                new = str(new or '')[:300]
            out.append(_c(x, field, new, 'Back to the manifest'))
    return out


def most_common(values: Iterable[str]) -> str:
    c = Counter(v for v in values if v)
    return c.most_common(1)[0][0] if c else ''


def round_half(d: Decimal) -> Decimal:
    return d.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
