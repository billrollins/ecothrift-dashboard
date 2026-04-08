"""Seed ManifestTemplate rows for Target / Walmart / Amazon (Phase 4.1A)."""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from apps.buying.models import ManifestTemplate, Marketplace

# header_signature values must match apps.buying.services.manifest_template.compute_header_signature
# applied to the exact CSV column headers from vendor manifests (see manifest sample output).
TEMPLATES: list[dict] = [
    {
        'slug': 'target',
        'display_name': 'Target 17-col standard',
        'header_signature': (
            'brand,category,category-code,department,division-name,ext-retail,item-#,item-description,'
            'model,origin,pallet-id,product-class,qty,subcategory,tcin,unit-retail,upc'
        ),
        'column_map': {
            'title': ['Item Description'],
            'brand': ['Brand'],
            'model': ['Model'],
            'sku': ['TCIN', 'Item #'],
            'upc': ['UPC'],
            'quantity': ['Qty'],
            'retail_value': ['Unit Retail'],
            'extended_retail': ['Ext. Retail'],
            'condition': [],
            'notes': ['Pallet ID', 'Origin'],
        },
        'category_fields': ['Category', 'Subcategory', 'Department'],
        'category_field_transforms': {},
    },
    {
        'slug': 'walmart',
        'display_name': 'Walmart 13-col standard',
        'header_signature': (
            'department,ext-retail,inventory-source,item-description,model,pallet-id,pallet-name,'
            'pallet-type,qty,subcategory,unit-retail,unit-weight,upc'
        ),
        'column_map': {
            'title': ['Item Description'],
            'brand': [],
            'model': ['Model'],
            'sku': [],
            'upc': ['UPC'],
            'quantity': ['Qty'],
            'retail_value': ['Unit Retail'],
            'extended_retail': ['Ext. Retail'],
            'condition': [],
            'notes': ['Pallet ID', 'Pallet Name', 'Pallet Type', 'Inventory Source'],
        },
        'category_fields': ['Department'],
        'category_field_transforms': {},
    },
    {
        'slug': 'amazon',
        'display_name': 'Amazon 16-col standard',
        'header_signature': (
            'asin,brand,category,color,ean,ext-retail,gl-description,inventory-reference-id,'
            'item-description,lpn,model,product-class,qty,subcategory,unit-retail,upc'
        ),
        'column_map': {
            'title': ['Item Description'],
            'brand': ['Brand'],
            'model': ['Model'],
            'sku': ['ASIN'],
            'upc': ['UPC', 'EAN'],
            'quantity': ['Qty'],
            'retail_value': ['Unit Retail'],
            'extended_retail': ['Ext. Retail'],
            'condition': [],
            'notes': ['LPN', 'Inventory Reference ID', 'Color'],
        },
        'category_fields': ['Category', 'Subcategory'],
        'category_field_transforms': {},
    },
    {
        'slug': 'amazon',
        'display_name': 'Amazon 17-col (Pallet ID)',
        'header_signature': (
            'asin,brand,category,color,ean,ext-retail,gl-description,inventory-reference-id,'
            'item-description,lpn,model,pallet-id,product-class,qty,subcategory,unit-retail,upc'
        ),
        'column_map': {
            'title': ['Item Description'],
            'brand': ['Brand'],
            'model': ['Model'],
            'sku': ['ASIN'],
            'upc': ['UPC', 'EAN'],
            'quantity': ['Qty'],
            'retail_value': ['Unit Retail'],
            'extended_retail': ['Ext. Retail'],
            'condition': [],
            'notes': ['LPN', 'Inventory Reference ID', 'Color', 'Pallet ID'],
        },
        'category_fields': ['Category', 'Subcategory'],
        'category_field_transforms': {},
    },
]


class Command(BaseCommand):
    help = 'Create or update the four Phase 4.1A manifest templates (requires marketplaces in DB).'

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            '--force',
            action='store_true',
            help='Allow when DEBUG is False.',
        )

    def handle(self, *args, **options) -> None:
        force = options['force']
        if not getattr(settings, 'DEBUG', False) and not force:
            raise CommandError('Refusing to seed: DEBUG is False. Pass --force.')

        created = 0
        updated = 0
        for spec in TEMPLATES:
            mp = Marketplace.objects.filter(slug=spec['slug']).first()
            if mp is None:
                raise CommandError(
                    f'Marketplace slug={spec["slug"]!r} not found. Run discovery/sweep first or create it.'
                )
            _obj, was_created = ManifestTemplate.objects.update_or_create(
                marketplace=mp,
                header_signature=spec['header_signature'],
                defaults={
                    'display_name': spec['display_name'][:200],
                    'column_map': spec['column_map'],
                    'category_fields': spec['category_fields'],
                    'category_field_transforms': spec['category_field_transforms'],
                    'is_reviewed': True,
                    'notes': 'Seeded by seed_manifest_templates (Phase 4.1A).',
                },
            )
            if was_created:
                created += 1
            else:
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Done. ManifestTemplate: {created} created, {updated} updated '
                f'({created + updated} total).'
            )
        )
