"""Canonical category names for manifest intelligence (Phase 4).

Sync with workspace/notebooks/category-research/taxonomy_v1.example.json (categories[].name).
"""

from __future__ import annotations

# Order matches taxonomy JSON index 1–19.
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
    'Mixed lots & uncategorized',
)

TAXONOMY_V1_CHOICES: tuple[tuple[str, str], ...] = tuple(
    (name, name) for name in TAXONOMY_V1_CATEGORY_NAMES
)

MIXED_LOTS_UNCATEGORIZED = 'Mixed lots & uncategorized'
