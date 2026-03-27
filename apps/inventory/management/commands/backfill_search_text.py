"""Populate Item.search_text for all rows (call after adding the field)."""

from django.core.management.base import BaseCommand

from apps.inventory.models import Item


class Command(BaseCommand):
    help = 'Rebuild cached search_text for every Item'

    def handle(self, *args, **options):
        qs = Item.objects.all().select_related('product')
        total = qs.count()
        updated = 0
        for item in qs.iterator(chunk_size=500):
            item.search_text = item.rebuild_search_text()
            item.save(update_fields=['search_text'])
            updated += 1
            if updated % 500 == 0:
                self.stdout.write(f'  … {updated}/{total}')
        self.stdout.write(self.style.SUCCESS(f'Done. Updated {updated} item(s).'))
