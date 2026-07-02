"""Seed the element kind catalog from the original hardcoded frontend palette.

Slugs must stay byte-identical to frontend/src/features/floorplan/palette.ts
(pre-v2.40 static PALETTE) — saved plan documents reference them.
"""
from django.db import migrations

# (kind, label, category, w, h, color, resizable, shape)
SEED_KINDS = [
    # Structural
    ('wall', 'Wall segment', 'Structural', 96, 6, '#455a64', True, 'rect'),
    ('door', 'Door', 'Structural', 36, 6, '#8d6e63', True, 'rect'),
    ('window', 'Window', 'Structural', 48, 6, '#90caf9', True, 'rect'),
    ('column', 'Column', 'Structural', 12, 12, '#78909c', True, 'circle'),
    # Fixtures
    ('gondola', 'Gondola shelf', 'Fixtures', 48, 144, '#7986cb', True, 'rect'),
    ('wallShelf', 'Wall shelf', 'Fixtures', 24, 96, '#9575cd', True, 'rect'),
    ('displayTable', 'Display table', 'Fixtures', 48, 72, '#4db6ac', True, 'rect'),
    ('rackRound', 'Clothing rack (round)', 'Fixtures', 42, 42, '#f06292', True, 'circle'),
    ('rackStraight', 'Clothing rack (straight)', 'Fixtures', 24, 60, '#ba68c8', True, 'rect'),
    ('bookcase', 'Bookcase', 'Fixtures', 12, 36, '#a1887f', True, 'rect'),
    ('glassCase', 'Glass case', 'Fixtures', 24, 48, '#4fc3f7', True, 'rect'),
    ('binTable', 'Bin / dump table', 'Fixtures', 48, 48, '#ffb74d', True, 'rect'),
    # Service
    ('checkoutCounter', 'Checkout counter', 'Service', 96, 30, '#81c784', True, 'rect'),
    ('register', 'Register', 'Service', 18, 18, '#66bb6a', False, 'rect'),
    ('fittingRoom', 'Fitting room', 'Service', 48, 48, '#ce93d8', True, 'rect'),
    ('cartCorral', 'Cart corral', 'Service', 48, 120, '#b0bec5', True, 'rect'),
    # Misc
    ('pallet', 'Pallet', 'Misc', 48, 40, '#bcaaa4', False, 'rect'),
    ('trash', 'Trash / recycle', 'Misc', 24, 24, '#90a4ae', False, 'rect'),
    ('genericRect', 'Generic rectangle', 'Misc', 48, 48, '#9e9e9e', True, 'rect'),
]


def seed_kinds(apps, schema_editor):
    FloorPlanElementKind = apps.get_model('floorplan', 'FloorPlanElementKind')
    sort_by_category = {}
    for kind, label, category, w, h, color, resizable, shape in SEED_KINDS:
        sort_order = sort_by_category.get(category, 0)
        sort_by_category[category] = sort_order + 1
        FloorPlanElementKind.objects.update_or_create(
            kind=kind,
            defaults={
                'label': label,
                'category': category,
                'default_w': w,
                'default_h': h,
                'fill_color': color,
                'shape': shape,
                'corner_radius': 0,
                'resizable': resizable,
                'is_system': True,
                'sort_order': sort_order,
                'is_active': True,
            },
        )


def unseed_kinds(apps, schema_editor):
    FloorPlanElementKind = apps.get_model('floorplan', 'FloorPlanElementKind')
    FloorPlanElementKind.objects.filter(
        kind__in=[row[0] for row in SEED_KINDS], is_system=True,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('floorplan', '0003_floorplanelementkind'),
    ]

    operations = [
        migrations.RunPython(seed_kinds, unseed_kinds),
    ]
