"""
Push product vectors built on this PC into the production database (owner's order, 2026-10-02).

Building 100,000 vectors on production would slow the register (the web server does the math), and they are too
big to ship in a release. This PC already has them, so they go straight across, on one connection:

    $env:PROD_DATABASE_URL = (heroku config:get DATABASE_URL -a ecothrift-dashboard)
    python manage.py push_vectors --dry-run
    python manage.py push_vectors

A vector is written only when production's own text for that product (vector text, category, subcategory) is exactly
the text this PC embedded, and production does not already hold that vector. Nothing else in production is touched.
Run it after the "Load the product standard" and "Merge the duplicates" Requests have finished. The URL is read from
the environment and never printed.
"""
import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from django.utils import timezone

from apps.inventory.models import Product, ProductProfile, ProductVector
from apps.inventory.services.product_vectors import MODEL_NAME, product_text, text_hash

ALIAS = 'production_push'
CHUNK = 1000


class Command(BaseCommand):
    help = 'Push locally built product vectors into production (reads PROD_DATABASE_URL).'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Count what would be written; write nothing.')

    def handle(self, *args, dry_run, **options):
        import dj_database_url

        url = os.environ.get('PROD_DATABASE_URL', '').strip()
        if not url:
            raise CommandError('Set PROD_DATABASE_URL first (see this command\'s docstring).')
        parsed = dj_database_url.parse(url)
        connections.databases[ALIAS] = {
            **settings.DATABASES['default'],
            **{k: parsed[k] for k in ('NAME', 'USER', 'PASSWORD', 'HOST', 'PORT')},
            'OPTIONS': {'options': '-c search_path=ecothrift', 'sslmode': 'require'},
        }
        counts = {'local': 0, 'pushed': 0, 'already': 0, 'text_differs': 0, 'not_standardized': 0}
        last = 0
        try:
            while True:
                local = list(ProductVector.objects.filter(model_name=MODEL_NAME, product_id__gt=last,
                                                          product__profile__vector_text__gt='',
                                                          product__profile__merged_into__isnull=True).order_by('product_id')[:CHUNK])
                if not local:
                    break
                last = local[-1].product_id
                ids = [v.product_id for v in local]
                profiles = {p.product_id: p for p in ProductProfile.objects.using(ALIAS).filter(
                    product_id__in=ids, merged_into__isnull=True, vector_text__gt='')}
                have = dict(ProductVector.objects.using(ALIAS).filter(product_id__in=ids, model_name=MODEL_NAME)
                            .values_list('product_id', 'text_hash'))
                now = timezone.now()
                push = []
                for v in local:
                    counts['local'] += 1
                    profile = profiles.get(v.product_id)
                    if profile is None:
                        counts['not_standardized'] += 1
                    elif text_hash(product_text(Product(pk=v.product_id), profile)) != v.text_hash:
                        counts['text_differs'] += 1
                    elif have.get(v.product_id) == v.text_hash:
                        counts['already'] += 1
                    else:
                        push.append(ProductVector(product_id=v.product_id, model_name=MODEL_NAME, embedding=v.embedding,
                                                  text_hash=v.text_hash, created_at=now, updated_at=now))
                if push and not dry_run:
                    ProductVector.objects.using(ALIAS).bulk_create(
                        push, batch_size=500, update_conflicts=True, unique_fields=['product', 'model_name'],
                        update_fields=['embedding', 'text_hash', 'updated_at'])
                counts['pushed'] += len(push)
                if counts['local'] % 10000 == 0:
                    self.stdout.write(f"{counts['local']:,} checked; {'would push' if dry_run else 'pushed'} {counts['pushed']:,}")
        finally:
            connections[ALIAS].close()
        self.stdout.write(self.style.SUCCESS(('DRY RUN. ' if dry_run else '') + ', '.join(f'{k}: {v:,}' for k, v in counts.items())))
