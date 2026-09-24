"""Canonical inventory Product categories.

Runtime category choices live in ``inventory.Category``. These constants are the
seed/backfill source for that table and must stay aligned with taxonomy v1.
"""

from __future__ import annotations

from django.utils.text import slugify

from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED, TAXONOMY_V1_CATEGORY_NAMES

CANONICAL_CATEGORY_NAMES: tuple[str, ...] = TAXONOMY_V1_CATEGORY_NAMES

SLUG_TO_CANONICAL: dict[str, str] = {
    # Electronics
    'electronics': 'Electronics',
    'laptops-computers': 'Electronics',
    'tablets': 'Electronics',
    'smartphones': 'Electronics',
    'tvs-monitors': 'Electronics',
    'audio-headphones': 'Electronics',
    'gaming-consoles': 'Electronics',
    'smart-home-networking': 'Electronics',
    'cameras-photography': 'Electronics',
    'car-electronics-accessories': 'Electronics',

    # Kitchen & dining
    'small-kitchen-appliances': 'Kitchen & dining',
    'large-kitchen-appliances': 'Appliances',
    'home-kitchen': 'Kitchen & dining',
    'cookware-bakeware': 'Kitchen & dining',
    'kitchen-dining': 'Kitchen & dining',
    'appliances': 'Appliances',

    # Tools & hardware
    'power-tools': 'Tools & hardware',
    'hand-tools': 'Tools & hardware',
    'outdoor-garden-tools': 'Lawn & garden',
    'tools-hardware': 'Tools & hardware',

    # Sports & outdoors
    'exercise-fitness-equipment': 'Sports & outdoors',
    'cycling': 'Sports & outdoors',
    'camping-hiking': 'Sports & outdoors',
    'sports-outdoors': 'Sports & outdoors',

    # Toys & games
    'board-games-puzzles': 'Toys & games',
    'building-stem-toys': 'Toys & games',
    'toys-games': 'Toys & games',

    # Health, beauty & personal care
    'personal-care-appliances': 'Health, beauty & personal care',
    'health-beauty': 'Health, beauty & personal care',
    'health-beauty-personal-care': 'Health, beauty & personal care',

    # Furniture
    'furniture': 'Furniture',

    # Office & school supplies
    'office-school': 'Office & school supplies',
    'office-school-supplies': 'Office & school supplies',

    # Mixed lots & uncategorized
    'miscellaneous': MIXED_LOTS_UNCATEGORIZED,
    'general-merchandise': MIXED_LOTS_UNCATEGORIZED,
    'mixed-lots-uncategorized': MIXED_LOTS_UNCATEGORIZED,
    'automotive': 'Automotive',

    # Clean one-to-one matches
    'outdoor-patio-furniture': 'Outdoor & patio furniture',
    'home-decor-lighting': 'Home décor & lighting',
    'household-cleaning': 'Household & cleaning',
    'bedding-bath': 'Bedding & bath',
    'storage-organization': 'Storage & organization',
    'baby-kids': 'Baby & kids',
    'apparel-accessories': 'Apparel & accessories',
    'books-media': 'Books & media',
    'pet-supplies': 'Pet supplies',
    'party-seasonal-novelty': 'Party, seasonal & novelty',
}

for _name in CANONICAL_CATEGORY_NAMES:
    SLUG_TO_CANONICAL.setdefault(slugify(_name), _name)


# B-Stock category codes on manifest lines (runner R-016, 2026-09-23). Before this, every
# code became Mixed lots at check-in (register PO-03). Codes not listed fall back to the
# learned CategoryMapping majority, then Mixed lots.
BSTOCK_CODE_TO_CANONICAL: dict[str, str] = {
    'OUTDOOR_LIVING_AND_GARDEN': 'Lawn & garden',
    'GRILLS': 'Lawn & garden',
    'OUTDOOR_POWER_EQUIPMENT': 'Lawn & garden',
    'VACUUMS': 'Appliances',
    'HEATING_COOLING_AND_AIR_QUALITY': 'Appliances',
    'MIXED_MAJOR_APPLIANCES': 'Appliances',
    'LAUNDRY_APPLIANCES': 'Appliances',
    'KITCHEN_APPLIANCES': 'Appliances',
    'MIXED_SMALL_APPLIANCES': 'Kitchen & dining',
    'ARTS_AND_CRAFTS': 'Arts & crafts',
    'AUTOMOTIVE_ACCESSORIES': 'Automotive',
    'MIXED_AUTOMOTIVE_SUPPLIES': 'Automotive',
    'AUTOMOTIVE_FILTERS': 'Automotive',
    'ENGINE': 'Automotive',
    'TOWING': 'Automotive',
    'BRAKING': 'Automotive',
    'STEERING_AND_CHASSIS': 'Automotive',
    'GAMING': 'Electronics',
    'SMART_HOME': 'Electronics',
    'PANTRY': 'Kitchen & dining',
    'MIXED_GROCERIES': 'Kitchen & dining',
    'KITCHEN_AND_DINING': 'Kitchen & dining',
    'JEWELRY': 'Apparel & accessories',
    'MENS_APPAREL': 'Apparel & accessories',
    'MIXED_APPAREL': 'Apparel & accessories',
    'TOYS': 'Toys & games',
    'PET_SUPPLIES': 'Pet supplies',
    'OFFICE_SUPPLIES': 'Office & school supplies',
    'BEDDING': 'Bedding & bath',
    'HOME_DECOR': 'Home décor & lighting',
    'PERSONAL_CARE': 'Health, beauty & personal care',
    'HAIR_CARE': 'Health, beauty & personal care',
    'MIXED_HEALTH_AND_BEAUTY': 'Health, beauty & personal care',
    'HOUSEHOLD_ESSENTIALS': 'Household & cleaning',
    'BUILDING_AND_HARDWARE': 'Tools & hardware',
    'OUTDOOR_FURNITURE': 'Outdoor & patio furniture',
    'KIDS_FURNITURE': 'Furniture',
    'MIXED_FURNITURE': 'Furniture',
    'SEASONAL': 'Party, seasonal & novelty',
    'MIXED_LOTS': MIXED_LOTS_UNCATEGORIZED,
    'MIXED_HOME_AND_GARDEN': MIXED_LOTS_UNCATEGORIZED,
}


def _is_bstock_code(text: str) -> bool:
    return text.isupper() and ' ' not in text and any(c.isalpha() for c in text)


def canonical_category_name(value: str | None) -> str:
    """Map a category name, legacy slug, or B-Stock code to one of the canonical names."""

    text = str(value or '').strip()
    if not text:
        return MIXED_LOTS_UNCATEGORIZED
    if text in CANONICAL_CATEGORY_NAMES:
        return text
    if text in BSTOCK_CODE_TO_CANONICAL:
        return BSTOCK_CODE_TO_CANONICAL[text]
    mapped = SLUG_TO_CANONICAL.get(slugify(text))
    if mapped:
        return mapped
    if _is_bstock_code(text):
        from apps.buying.services.category_stats_sql import category_code_to_taxonomy

        try:
            return category_code_to_taxonomy({text}).get(text, MIXED_LOTS_UNCATEGORIZED)
        except Exception:  # noqa: BLE001 - no DB (e.g. SimpleTestCase): stay conservative
            return MIXED_LOTS_UNCATEGORIZED
    return MIXED_LOTS_UNCATEGORIZED
