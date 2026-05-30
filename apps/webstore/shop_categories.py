"""Web-shop category list — mirrors ``apps.buying.taxonomy_v1.TAXONOMY_V1_CATEGORY_NAMES``.

Keep slugs in sync with ``frontend-public/src/data/content.ts`` → ``SHOP_CATEGORIES``.
"""
from __future__ import annotations

from typing import TypedDict

from django.utils.text import slugify

from apps.buying.taxonomy_v1 import TAXONOMY_V1_CATEGORY_NAMES


class ShopCategory(TypedDict):
    name: str
    slug: str
    description: str


SHOP_CATEGORIES: list[ShopCategory] = [
    {'name': name, 'slug': slugify(name), 'description': ''}
    for name in TAXONOMY_V1_CATEGORY_NAMES
]

SHOP_CATEGORY_SLUGS: frozenset[str] = frozenset(c['slug'] for c in SHOP_CATEGORIES)

# Old Shopify collection handles → taxonomy v1 shop slugs (or ``None`` for /shop only).
LEGACY_COLLECTION_SLUGS: dict[str, str | None] = {
    'all': None,
    'miscellaneous-uncategorized': 'mixed-lots-uncategorized',
    'baby-kids': 'baby-kids',
    'beauty-personal-care': 'health-beauty-personal-care',
    'clothing-accessories': 'apparel-accessories',
    'electronics-amp-gadgets': 'electronics',
    'electronics-gadgets': 'electronics',
    'food-beverages': 'kitchen-dining',
    'health-wellness': 'health-beauty-personal-care',
    'hobbies-crafts': 'party-seasonal-novelty',
    'home-living': 'home-decor-lighting',
    'office-school': 'office-school-supplies',
    'outdoor-garden': 'outdoor-patio-furniture',
    'pet-supplies': 'pet-supplies',
    'sports-fitness': 'sports-outdoors',
    'tools-home-improvement': 'tools-hardware',
    'toys-games': 'toys-games',
    'automotive': 'mixed-lots-uncategorized',
}
