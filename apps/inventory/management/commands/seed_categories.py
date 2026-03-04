"""
Seed the Category taxonomy from the approved hierarchy in the categorizer's KEYWORD_RULES.

Usage:
    python manage.py seed_categories
    python manage.py seed_categories --clear  # delete existing and re-seed
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.inventory.services.categorizer import KEYWORD_RULES


SPEC_TEMPLATES = {
    'Laptops & Computers': [
        {'key': 'processor', 'label': 'Processor', 'type': 'text'},
        {'key': 'ram_gb', 'label': 'RAM (GB)', 'type': 'number'},
        {'key': 'storage_gb', 'label': 'Storage (GB)', 'type': 'number'},
        {'key': 'screen_size_inches', 'label': 'Screen Size (in)', 'type': 'number'},
        {'key': 'os', 'label': 'Operating System', 'type': 'text'},
        {'key': 'battery_ok', 'label': 'Battery works?', 'type': 'boolean'},
        {'key': 'charger_included', 'label': 'Charger included?', 'type': 'boolean'},
    ],
    'Tablets': [
        {'key': 'storage_gb', 'label': 'Storage (GB)', 'type': 'number'},
        {'key': 'screen_size_inches', 'label': 'Screen Size (in)', 'type': 'number'},
        {'key': 'wifi_only', 'label': 'WiFi only (no cellular)?', 'type': 'boolean'},
        {'key': 'charger_included', 'label': 'Charger included?', 'type': 'boolean'},
        {'key': 'powers_on', 'label': 'Powers on and tested?', 'type': 'boolean'},
    ],
    'Smartphones': [
        {'key': 'storage_gb', 'label': 'Storage (GB)', 'type': 'number'},
        {'key': 'carrier', 'label': 'Carrier / Unlocked', 'type': 'text'},
        {'key': 'powers_on', 'label': 'Powers on?', 'type': 'boolean'},
        {'key': 'charger_included', 'label': 'Charger included?', 'type': 'boolean'},
        {'key': 'screen_crack', 'label': 'Screen cracked?', 'type': 'boolean'},
    ],
    'TVs & Monitors': [
        {'key': 'screen_size_inches', 'label': 'Screen Size (in)', 'type': 'number'},
        {'key': 'resolution', 'label': 'Resolution (e.g. 4K, 1080p)', 'type': 'text'},
        {'key': 'remote_included', 'label': 'Remote included?', 'type': 'boolean'},
        {'key': 'powers_on', 'label': 'Powers on and tested?', 'type': 'boolean'},
    ],
    'Small Kitchen Appliances': [
        {'key': 'tested', 'label': 'Powers on and tested?', 'type': 'boolean'},
        {'key': 'all_parts', 'label': 'All parts/accessories present?', 'type': 'boolean'},
        {'key': 'wattage', 'label': 'Wattage', 'type': 'number'},
    ],
    'Power Tools': [
        {'key': 'battery_included', 'label': 'Battery included?', 'type': 'boolean'},
        {'key': 'charger_included', 'label': 'Charger included?', 'type': 'boolean'},
        {'key': 'voltage', 'label': 'Voltage (e.g. 18V, 20V)', 'type': 'text'},
        {'key': 'tested', 'label': 'Tested and working?', 'type': 'boolean'},
    ],
    'Exercise & Fitness Equipment': [
        {'key': 'tested', 'label': 'Tested and working?', 'type': 'boolean'},
        {'key': 'all_parts', 'label': 'All parts present?', 'type': 'boolean'},
    ],
}


class Command(BaseCommand):
    help = 'Seed the Category taxonomy into the database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            default=False,
            help='Delete existing categories before seeding (WARNING: unlinks all category_ref FKs).',
        )

    def handle(self, *args, **options):
        from apps.inventory.models import Category

        if options['clear']:
            count, _ = Category.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'Deleted {count} existing categories.'))

        # Build unique (parent, category) pairs from KEYWORD_RULES
        pairs: list[tuple[str, str]] = []
        seen: set[tuple[str, str]] = set()
        for _, category, parent in KEYWORD_RULES:
            key = (parent, category)
            if key not in seen:
                seen.add(key)
                pairs.append(key)

        parents_created = 0
        children_created = 0

        with transaction.atomic():
            for parent_name, category_name in pairs:
                parent, p_created = Category.objects.get_or_create(
                    name=parent_name,
                    defaults={'parent': None, 'spec_template': []},
                )
                if p_created:
                    parents_created += 1

                spec = SPEC_TEMPLATES.get(category_name, [])
                child, c_created = Category.objects.get_or_create(
                    name=category_name,
                    defaults={'parent': parent, 'spec_template': spec},
                )
                if c_created:
                    children_created += 1
                elif child.parent is None:
                    child.parent = parent
                    child.save(update_fields=['parent'])

            # Seed catch-all
            misc, _ = Category.objects.get_or_create(
                name='Miscellaneous', defaults={'parent': None},
            )
            Category.objects.get_or_create(
                name='General Merchandise', defaults={'parent': misc},
            )

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {parents_created} parent categories and {children_created} subcategories.'
        ))
