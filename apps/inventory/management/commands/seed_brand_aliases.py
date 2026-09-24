"""Load brand spellings → canonical brand from apps/inventory/data/brand_aliases.csv (R-023 clusters).

Idempotent: existing aliases are left alone (a person may have edited them).
"""
import csv
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.inventory.models import BrandAlias

DATA = Path(__file__).resolve().parents[2] / 'data' / 'brand_aliases.csv'


class Command(BaseCommand):
    help = 'Seed BrandAlias from apps/inventory/data/brand_aliases.csv (existing rows kept).'

    def handle(self, *args, **options):
        existing = set(BrandAlias.objects.values_list('alias', flat=True))
        new = []
        with open(DATA, encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if r['alias'] and r['alias'] not in existing:
                    new.append(BrandAlias(alias=r['alias'], brand=r['brand'], is_junk=r['is_junk'] == '1', source=r['source']))
                    existing.add(r['alias'])
        BrandAlias.objects.bulk_create(new, batch_size=1000)
        self.stdout.write(self.style.SUCCESS(f'Added {len(new)} brand aliases ({BrandAlias.objects.count()} total).'))
