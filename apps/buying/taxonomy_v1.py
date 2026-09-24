"""Canonical category names for manifest intelligence (Phase 4).

Sync with workspace/notebooks/category-research/taxonomy_v1.example.json (categories[].name).
"""

from __future__ import annotations

# Order matches taxonomy JSON index 1-19; 20-23 added 2026-09-23 (owner, product_intelligence
# Phase 1). Mixed lots stays last.
TAXONOMY_V1_CATEGORY_NAMES: tuple[str, ...] = (
    'Kitchen & dining',
    'Furniture',
    'Outdoor & patio furniture',
    'Home décor & lighting',
    'Household & cleaning',
    'Bedding & bath',
    'Storage & organization',
    'Toys & games',
    'Sports & outdoors',
    'Tools & hardware',
    'Office & school supplies',
    'Electronics',
    'Baby & kids',
    'Health, beauty & personal care',
    'Apparel & accessories',
    'Books & media',
    'Pet supplies',
    'Party, seasonal & novelty',
    'Lawn & garden',
    'Appliances',
    'Arts & crafts',
    'Automotive',
    'Mixed lots & uncategorized',
)

# Categories added after the item history was recorded: no sales yet means missing data, not
# stock that won't sell (Need v2 gives them a neutral 50; register ITM-12).
TAXONOMY_ADDED_2026_09: tuple[str, ...] = ('Lawn & garden', 'Appliances', 'Arts & crafts', 'Automotive')

# The web shop keeps the original 19 until the owner adds the new ones to the public site
# (frontend-public SHOP_CATEGORIES).
SHOP_CATEGORY_NAMES_V1: tuple[str, ...] = tuple(
    n for n in TAXONOMY_V1_CATEGORY_NAMES if n not in ('Lawn & garden', 'Appliances', 'Arts & crafts', 'Automotive')
)

TAXONOMY_V1_CHOICES: tuple[tuple[str, str], ...] = tuple(
    (name, name) for name in TAXONOMY_V1_CATEGORY_NAMES
)

MIXED_LOTS_UNCATEGORIZED = 'Mixed lots & uncategorized'
