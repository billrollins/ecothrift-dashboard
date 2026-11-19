"""The store's rules for the public feeds, read once per build (never per row).

- **Categories:** the 23 names of ``apps/buying/taxonomy_v1.py`` in that order, each with a short stable id for the
  phone. A feed's category index is the index into that list (and into the feed's ``cats``).
- **Price, retail, ThriftBucks:** the same rules as the scanner's item card (``thriftplus/services/scanner.py``),
  as pure functions over values a bulk query already read: the store sale factor, ``tag_retail``'s rule, and
  ``reward_for`` (0 for consignment, closed or excluded states, a unit marked down since last night; never more than
  the tag less its floor).
"""
from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from types import SimpleNamespace

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES
from apps.inventory.services.tag_retail import tag_retail
from apps.thriftplus.models import ItemReward
from apps.thriftplus.services.rewards import floor_for, marked_down
from apps.thriftplus.services.scanner import category_for, short_title

CENT = Decimal('0.01')
ZERO = Decimal('0')

# taxonomy name -> the phone's id (stable: the front end keys icons and links on these).
CATEGORY_IDS: dict[str, str] = {
    'Apparel & accessories': 'apparel',
    'Toys & games': 'toys',
    'Health, beauty & personal care': 'health',
    'Party, seasonal & novelty': 'party',
    'Kitchen & dining': 'kitchen',
    'Home décor & lighting': 'decor',
    'Tools & hardware': 'tools',
    'Sports & outdoors': 'sports',
    'Electronics': 'electronics',
    'Household & cleaning': 'household',
    'Office & school supplies': 'office',
    'Bedding & bath': 'bedbath',
    'Baby & kids': 'baby',
    'Pet supplies': 'pet',
    'Automotive': 'auto',
    'Books & media': 'media',
    'Outdoor & patio furniture': 'patio',
    'Storage & organization': 'storage',
    'Furniture': 'furniture',
    'Lawn & garden': 'garden',
    'Appliances': 'appliances',
    'Arts & crafts': 'crafts',
    MIXED_LOTS_UNCATEGORIZED: 'other',
}
CATS: tuple[tuple[str, str], ...] = tuple((CATEGORY_IDS[name], name) for name in TAXONOMY_V1_CATEGORY_NAMES)
CAT_INDEX: dict[str, int] = {name: i for i, name in enumerate(TAXONOMY_V1_CATEGORY_NAMES)}
ID_INDEX: dict[str, int] = {cid: i for i, (cid, _) in enumerate(CATS)}
OTHER = CAT_INDEX[MIXED_LOTS_UNCATEGORIZED]

# Coming rows with no real category: strong words in the title (ported from the round-3 mockup's make_stock.py, with
# whole-word matching so "carpet" is not "pet" and "space" is not "spa").
_KEYWORDS: list[tuple[str, str]] = [
    ('toys', r'ride[- ]on|playhouse|toys? for kids|lego|doll|puzzle|play ?set|stuffed|plush toy'),
    ('pet', r'dog|cat|pet|aquarium|litter'),
    ('sports', r'trampoline|tent|scooter|bike|bicycle|kayak|fishing|hunting|basketball|golf|treadmill|dumbbell|camping'),
    ('patio', r'hot tub|spa|gazebo|canopy|patio|pergola|umbrella|fire pit|grill|hammock'),
    ('party', r'christmas|halloween|pumpkin|wreath|garland|ornament|pre-lit|thanksgiving|inflatable (?:santa|snowman)'),
    ('household', r'detergent|dish soap|laundry|vacuum|mop|trash bag|paper towel|cleaner|bleach|toilet paper'),
    ('tools', r'paint|stain|primer|varathane|caulk|drill|wrench|tool set|saw|faucet|ladder|generator'),
    ('furniture', r'sofa|couch|loveseat|hall tree|dresser|nightstand|bookcase|bookshelf|desk|recliner|bed frame'
                  r'|dining table|coffee table|tv stand'),
    ('storage', r'tote|storage bin|shelving|organizer|storage cabinet'),
    ('kitchen', r'coffee maker|espresso|blender|air fryer|cookware|frying pan|knife set|toaster|mug|dinnerware'
                r'|instant pot|microwave'),
    ('bedbath', r'mattress|comforter|sheet set|pillow|towel|blanket|duvet'),
    ('decor', r'rug|curtain|lamp|mirror|wall art|vase'),
    ('electronics', r'headphone|earbud|speaker|tv|monitor|tablet|laptop|printer|dvd player|camera'),
    ('health', r'wheelchair|vitamin|supplement|shampoo|toothbrush|compression'),
]
_KEYWORD_RES = [(ID_INDEX[cid], re.compile(r'\b(?:' + words + r')(?:e?s)?\b', re.IGNORECASE)) for cid, words in _KEYWORDS]

# The truck list's own seller categories (when preprocessing has not set a canon name yet), from the same mockup.
_SELLER: dict[str, str] = {
    'MIXED_APPAREL': 'apparel', 'MIXED_SHOES': 'apparel', 'HOLIDAY_APPAREL': 'apparel', 'WOMENS_APPAREL': 'apparel',
    'MENS_APPAREL': 'apparel', 'WATCHES': 'apparel', 'JEWELRY': 'apparel', 'BAGS_AND_LUGGAGE': 'apparel',
    'MIXED_HOME_AND_GARDEN': 'decor', 'MIXED_AUTOMOTIVE_SUPPLIES': 'auto', 'OUTDOOR_LIVING_AND_GARDEN': 'patio',
    'TOYS': 'toys', 'MIXED_HEALTH_AND_BEAUTY': 'health', 'PERSONAL_CARE': 'health', 'BEDDING': 'bedbath',
    'PARTY_SUPPLIES': 'party', 'MIXED_ELECTRONICS': 'electronics', 'STORAGE': 'storage',
    'BUILDING_AND_HARDWARE': 'tools', 'MIXED_SPORTS_AND_OUTDOORS': 'sports', 'MIXED_MAJOR_APPLIANCES': 'appliances',
    'MIXED_GROCERIES': 'household', 'HOUSEHOLD_ESSENTIALS': 'household', 'PET_SUPPLIES': 'pet',
    'MIXED_FURNITURE': 'furniture', 'MIXED_PETS': 'pet', 'PET_FOODS_AND_TREATS': 'pet',
    'HOME_ENTERTAINMENT': 'electronics', 'CAMERAS': 'electronics', 'HOME_AUDIO': 'electronics', 'PLUMBING': 'tools',
    'EQUIPMENT_AND_TOOLS': 'tools', 'MIXED_BUILDING_AND_INDUSTRIAL': 'tools', 'SAFETY_WEAR': 'tools',
    'OUTDOOR_SPORTS': 'sports', 'MIXED_OFFICE_SUPPLIES_AND_EQUIPMENT': 'office', 'ARTS_AND_CRAFTS': 'crafts',
    'MATTRESSES': 'bedbath', 'BABY_ESSENTIALS': 'baby', 'KIDS_FURNITURE': 'furniture', 'MEDICATION': 'health',
    'HOME_DECOR': 'decor', 'GRILLS': 'patio',
}

# ``scanner.category_for`` keys -> the phone's ids.
_SCANNER_KEYS: dict[str, str] = {
    'clothing': 'apparel', 'bedding': 'bedbath', 'baby': 'baby', 'toys': 'toys', 'tools': 'tools', 'outdoor': 'patio',
    'sporting': 'sports', 'lighting': 'decor', 'appliances': 'appliances', 'kitchen': 'kitchen',
    'electronics': 'electronics', 'furniture': 'furniture', 'books_media': 'media', 'home_decor': 'decor',
}


def bucket_index(name: str | None) -> int:
    return CAT_INDEX.get((name or '').strip(), OTHER)


def coming_index(category: str | None, title: str | None) -> int:
    """A coming row: its category when it is a real canon name; else strong title words; else the seller's
    category; else the scanner's title words; else other."""
    cat = (category or '').strip()
    idx = CAT_INDEX.get(cat)
    if idx is not None and idx != OTHER:
        return idx
    for i, pattern in _KEYWORD_RES:
        if pattern.search(title or ''):
            return i
    seller = _SELLER.get(cat.upper())
    if seller:
        return ID_INDEX[seller]
    loose = _SCANNER_KEYS.get(category_for(title or ''))  # the scanner's own looser title words, last
    return ID_INDEX[loose] if loose else OTHER


def clean_name(text: str | None, limit: int = 90) -> str:
    """Whitespace collapsed, at most ``limit`` characters cut at a whole word (the scanner's rule)."""
    return short_title((text or '').replace(' ', ' '), limit)


def tag_digits(sku: str | None) -> str:
    sku = (sku or '').strip()
    return sku[3:] if sku.upper().startswith('ITM') else sku


# ── The settings, read once ────────────────────────────────────────────────────

DAY_KEY = 'storefront.day'
SECONDS_KEY = 'storefront.snapshot_seconds'
DAYS = ('normal', 'bf')
DEFAULT_SECONDS = 300


@dataclass(frozen=True)
class Settings:
    factor: Decimal          # the store sale on now (1 = none)
    floor_share: Decimal     # ThriftBucks never take the tag below this share of it
    retail_mode: str         # tags.retail_on_tag
    use_profile: bool        # the effective-category switch
    guide: object            # returns.Guide (3-day returns)
    day: str                 # storefront.day: normal | bf
    refresh_seconds: int     # storefront.snapshot_seconds
    thrift_plus_open: bool


def _setting(key: str):
    from apps.core.models import AppSetting

    return AppSetting.objects.filter(key=key).values_list('value', flat=True).first()


def load_settings() -> Settings:
    """Every rule the feeds need, read now (a dozen small queries, once per build)."""
    from apps.inventory.services import effective_category
    from apps.inventory.services.tag_retail import tag_settings
    from apps.thriftplus.services import members
    from apps.thriftplus.services.returns import guide
    from apps.thriftplus.services.rewards import rules
    from apps.thriftplus.services.scanner import _sale_factor

    day = str(_setting(DAY_KEY) or 'normal').strip().lower()
    try:
        seconds = int(_setting(SECONDS_KEY) or DEFAULT_SECONDS)
    except (TypeError, ValueError):
        seconds = DEFAULT_SECONDS
    return Settings(
        factor=_sale_factor(), floor_share=rules().floor_share, retail_mode=tag_settings()['tags.retail_on_tag'],
        use_profile=effective_category.is_enabled(), guide=guide(), day=day if day in DAYS else 'normal',
        refresh_seconds=min(3600, max(30, seconds)), thrift_plus_open=members.is_enabled(),
    )


_settings_lock = threading.Lock()
_settings: dict = {'at': 0.0, 'value': None}
SETTINGS_SECONDS = 60


def remember(value: Settings) -> Settings:
    with _settings_lock:
        _settings.update(at=time.monotonic(), value=value)
    return value


def cached_settings() -> Settings:
    """The rules for a live read (the item page): the last build's, or read again once a minute."""
    value = _settings['value']
    if value is not None and time.monotonic() - _settings['at'] < SETTINGS_SECONDS:
        return value
    return remember(load_settings())


def forget() -> None:
    with _settings_lock:
        _settings.update(at=0.0, value=None)


# ── Price, retail, ThriftBucks for one unit ────────────────────────────────────

def shown_price(tag: Decimal, s: Settings) -> Decimal:
    return (tag * s.factor).quantize(CENT, rounding=ROUND_HALF_UP)


def shown_retail(tag: Decimal, retail: Decimal | None, retail_check: str, s: Settings) -> Decimal:
    """``tag_retail``'s rule (above 0, above the price, checked); 0 when the tag would not print it."""
    value = tag_retail(SimpleNamespace(retail=retail, price=tag, retail_check=retail_check), mode=s.retail_mode)
    return value if value is not None else ZERO


_NO_REWARD = (ItemReward.STATUS_CLOSED, ItemReward.STATUS_EXCLUDED)


def thriftbucks(tag: Decimal, *, source: str, reward: Decimal | None, starting_price: Decimal | None,
                status: str | None, s: Settings) -> Decimal:
    """``scanner.reward_for`` over values already read."""
    if status is None or status in _NO_REWARD:
        return ZERO
    if not reward or source == 'consignment' or tag <= 0:
        return ZERO
    if marked_down(tag, starting_price):
        return ZERO
    value = min(reward, max(ZERO, tag - floor_for(tag, s.floor_share)))
    return (value * s.factor).quantize(CENT, rounding=ROUND_DOWN)


def num(value: Decimal | None):
    """A JSON number with at most 2 decimals (whole amounts as integers: shorter on the wire)."""
    if not value:
        return 0
    q = Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)
    return int(q) if q == q.to_integral_value() else float(q)
