"""Ensure inventory Category rows exist for the public web-shop taxonomy.

Usage:
    python manage.py seed_shop_categories
"""

from django.core.management.base import BaseCommand

from apps.inventory.models import Category
from apps.webstore.shop_categories import SHOP_CATEGORIES


class Command(BaseCommand):
    help = 'Create or update Category rows for the web storefront taxonomy.'

    def handle(self, *args, **options):
        created = 0
        updated = 0
        for row in SHOP_CATEGORIES:
            category, was_created = Category.objects.get_or_create(
                slug=row['slug'],
                defaults={'name': row['name']},
            )
            if was_created:
                created += 1
            elif category.name != row['name']:
                category.name = row['name']
                category.save(update_fields=['name'])
                updated += 1

        self.stdout.write(
            self.style.SUCCESS(
                f'Shop categories ready: {created} created, {updated} renamed, '
                f'{len(SHOP_CATEGORIES)} total.'
            )
        )
