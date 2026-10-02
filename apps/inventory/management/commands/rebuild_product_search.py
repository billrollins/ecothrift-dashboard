"""Rebuild `Product.search_text` for every product (inventory search). Safe to run any time."""
from django.core.management.base import BaseCommand

from apps.inventory.services import inventory_search


class Command(BaseCommand):
    help = 'Rebuild the inventory search text of every product.'

    def handle(self, *args, **options):
        changed = inventory_search.rebuild_all(log=self.stdout.write)
        self.stdout.write(self.style.SUCCESS(f'{changed:,} products updated'))
