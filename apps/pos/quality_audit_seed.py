"""Seeded Retail QA form definition (the one system form that feeds the dashboard)."""

from __future__ import annotations

from typing import Any

RETAIL_FORM_SLUG = 'retail'
RETAIL_FORM_TITLE = 'Retail floor operations'
RETAIL_FORM_INTRO = 'Floor walk-through of the retail sales floor.'
RETAIL_FORM_ICON = 'storefront'

# Cycle through all 15 controls so every widget is demonstrated.
_CONTROL_CYCLE = [
    'yesno', 'thumbs', 'rating', 'emoji', 'severity',
    'slider', 'chips', 'counter', 'zone', 'photo',
    'confidence', 'toggle', 'priority', 'comment', 'grade',
]

_CHIP_OPTIONS = ['Dusty', 'Mis-tagged', 'Empty', 'Damaged', 'Expired', 'Out of place']
_ZONE_OPTIONS = ['Front entrance', 'Aisle 1', 'Aisle 2', 'Aisle 3', 'Back wall', 'Checkout']


def _check(idx: int, label: str, hint: str, options: list[str] | None = None) -> dict[str, Any]:
    control = _CONTROL_CYCLE[(idx - 1) % len(_CONTROL_CYCLE)]
    if options is None and control in ('chips', 'zone'):
        options = list(_CHIP_OPTIONS if control == 'chips' else _ZONE_OPTIONS)
    return {
        'id': f'chk_{idx:02d}',
        'label': label,
        'control': control,
        'hint': hint,
        **({'options': options} if options else {}),
    }


def build_retail_form_definition() -> dict[str, Any]:
    """Return the full definition JSON for the seeded retail form."""
    sections = [
        {
            'id': 'front_of_house',
            'title': 'Front of House',
            'intro': 'First impression at the entrance.',
            'icon': 'storefront',
            'checks': [
                _check(1, 'Entry area clean and welcoming', 'Floors clear, no clutter at the doors.'),
                _check(2, 'Doors and windows clear', 'No smudges or obstructions blocking view.'),
                _check(3, 'Welcome signage current', 'Hours and promos up to date.'),
                _check(4, 'Floor mats in place and clean', 'No curled edges or heavy soil.'),
                _check(5, 'Lighting even, no dark spots', 'No burned-out bulbs in entry.'),
            ],
        },
        {
            'id': 'aisles_traffic',
            'title': 'Aisles & Traffic',
            'intro': 'Walkability and safety of the sales floor.',
            'icon': 'article',
            'checks': [
                _check(6, 'Aisles at least 36 inches clear', 'ADA-compliant path of travel.'),
                _check(7, 'No blocked exits', 'Emergency paths fully clear.'),
                _check(8, 'Endcaps neat and stocked', 'Front-facing, no gaps.'),
                _check(9, 'Shopping carts corralled', _ZONE_OPTIONS[0], options=_ZONE_OPTIONS),
                _check(10, 'Photo of any trip hazard', 'Snap a photo if something is on the floor.'),
            ],
        },
        {
            'id': 'shelving_merchandise',
            'title': 'Shelving & Merchandise',
            'intro': 'Merchandise presentation and organization.',
            'icon': 'inventory',
            'checks': [
                _check(11, 'Shelves faced and full', 'Items pulled to the front edge.'),
                _check(12, 'Items grouped by category', 'Logical adjacency, no mixing.'),
                _check(13, 'Empty pegs in prime zones', 'Count any empty pegs on endcaps.'),
                _check(14, 'Heavy items on lower shelves', 'No top-heavy or precarious stacks.'),
                _check(15, 'Seasonal items rotated', 'Current season in prime placement.'),
            ],
        },
        {
            'id': 'cleanliness_safety',
            'title': 'Cleanliness & Safety',
            'intro': 'Hygiene and safety across the floor.',
            'icon': 'factCheck',
            'checks': [
                _check(16, 'Floors swept or vacuumed', 'No visible debris or dirt build-up.'),
                _check(17, 'Spills addressed', 'Tag any spill issues found.', options=_CHIP_OPTIONS),
                _check(18, 'Restrooms stocked and clean', 'Only if applicable to location.'),
                _check(19, 'Fire extinguisher accessible', 'Unobstructed and charged.'),
                _check(20, 'Damaged fixtures or sharp edges', 'Tag any damaged fixtures.', options=_CHIP_OPTIONS),
            ],
        },
        {
            'id': 'tags_pricing',
            'title': 'Tags & Pricing',
            'intro': 'Pricing accuracy and signage integrity.',
            'icon': 'localOffer',
            'checks': [
                _check(21, 'Price tags legible', 'Readable from a normal distance.'),
                _check(22, 'Color dots and banners correct', 'Match current pricing policy.'),
                _check(23, 'Sale signage matches POS', 'No expired sale signs up.'),
                _check(24, 'Mis-tags or missing prices', 'Rate overall pricing accuracy.'),
                _check(25, 'Clearance area organized', 'Grade the clearance zone presentation.'),
            ],
        },
    ]
    return {'template_version': 2, 'sections': sections}


def retail_form_fields(created_by_id: int | None = None) -> dict[str, Any]:
    """Fields for get_or_create / update of the seeded retail form."""
    return {
        'slug': RETAIL_FORM_SLUG,
        'title': RETAIL_FORM_TITLE,
        'intro': RETAIL_FORM_INTRO,
        'icon': RETAIL_FORM_ICON,
        'definition': build_retail_form_definition(),
        'is_system': True,
        'feeds_dashboard': True,
        'is_active': True,
        'created_by_id': created_by_id,
        'updated_by_id': created_by_id,
    }
