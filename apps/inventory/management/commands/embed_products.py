"""
Embed products into pgvector (ProductVector). Resumable: unchanged product text is skipped.

    python manage.py embed_products [--limit N] [--chunk 2000] [--only-sold]
"""
import time

from django.core.management.base import BaseCommand

from apps.inventory.models import Product
from apps.inventory.services.product_vectors import MODEL_NAME, embed_products


class Command(BaseCommand):
    help = f'Create or refresh product embeddings ({MODEL_NAME}).'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=0)
        parser.add_argument('--chunk', type=int, default=2000)
        parser.add_argument('--only-sold', action='store_true', help='Only products with a sold item.')

    def handle(self, *args, limit, chunk, only_sold, **options):
        qs = Product.objects.order_by('pk')
        if only_sold:
            qs = qs.filter(items__sold_for__gt=0).distinct()
        ids = list(qs.values_list('pk', flat=True))
        if limit:
            ids = ids[:limit]
        totals = {'created': 0, 'updated': 0, 'skipped': 0}
        t0 = time.time()
        for i in range(0, len(ids), chunk):
            part = Product.objects.filter(pk__in=ids[i:i + chunk])
            for k, v in embed_products(part).items():
                totals[k] += v
            done = min(i + chunk, len(ids))
            self.stdout.write(f'  {done}/{len(ids)} {totals} {time.time() - t0:.0f}s', ending='\n')
            self.stdout.flush()
        self.stdout.write(self.style.SUCCESS(f'Done: {totals} in {time.time() - t0:.0f}s'))
