"""
Seed the canonical Product categories.

Usage:
    python manage.py seed_categories
"""

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.inventory.canonical_categories import CANONICAL_CATEGORY_NAMES


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
    help = 'Seed the Category taxonomy into the database (idempotent; never deletes).'

    def handle(self, *args, **options):
        from apps.inventory.models import Category

        categories_created = 0

        with transaction.atomic():
            for category_name in CANONICAL_CATEGORY_NAMES:
                spec = SPEC_TEMPLATES.get(category_name, [])
                _category, created = Category.objects.get_or_create(
                    name=category_name,
                    defaults={'spec_template': spec},
                )
                if created:
                    categories_created += 1

        self.stdout.write(self.style.SUCCESS(
            f'Seeded {categories_created} canonical categories.'
        ))
