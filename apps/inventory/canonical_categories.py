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
    'large-kitchen-appliances': 'Kitchen & dining',
    'home-kitchen': 'Kitchen & dining',
    'cookware-bakeware': 'Kitchen & dining',
    'kitchen-dining': 'Kitchen & dining',
    'appliances': 'Kitchen & dining',

    # Tools & hardware
    'power-tools': 'Tools & hardware',
    'hand-tools': 'Tools & hardware',
    'outdoor-garden-tools': 'Tools & hardware',
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
    'automotive': MIXED_LOTS_UNCATEGORIZED,

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


def canonical_category_name(value: str | None) -> str:
    """Map a legacy category name/slug to one of the 19 canonical names."""

    text = str(value or '').strip()
    if not text:
        return MIXED_LOTS_UNCATEGORIZED
    if text in CANONICAL_CATEGORY_NAMES:
        return text
    return SLUG_TO_CANONICAL.get(slugify(text), MIXED_LOTS_UNCATEGORIZED)
