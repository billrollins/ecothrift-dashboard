"""
Retroactively assign category_ref to all Item and Product records
that currently have category_ref=None.

Usage:
    python manage.py backfill_categories
    python manage.py backfill_categories --dry-run
    python manage.py backfill_categories --overwrite     # re-classify even existing refs
    python manage.py backfill_categories --batch-size 200
"""

from __future__ import annotations

from collections import Counter

from django.core.management.base import BaseCommand
from django.db import transaction

from apps.inventory.services.categorizer import classify_item


class Command(BaseCommand):
    help = 'Backfill category_ref on all Item and Product records using the classifier.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', default=False)
        parser.add_argument(
            '--overwrite',
            action='store_true',
            default=False,
            help='Re-classify items that already have category_ref set.',
        )
        parser.add_argument('--batch-size', type=int, default=100)
        parser.add_argument(
            '--model-only',
            action='store_true',
            default=False,
            help='Only classify Product records (skip Items).',
        )
        parser.add_argument(
            '--no-llm',
            action='store_true',
            default=False,
            help='Disable LLM fallback (faster, uses rules + ML only).',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        overwrite = options['overwrite']
        batch_size = options['batch_size']
        model_only = options['model_only']
        use_llm = not options['no_llm']

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be written.\n'))

        stats: Counter = Counter()
        method_counts: Counter = Counter()

        self._classify_products(dry_run, overwrite, batch_size, use_llm, stats, method_counts)
        if not model_only:
            self._classify_items(dry_run, overwrite, batch_size, use_llm, stats, method_counts)

        self._print_summary(stats, method_counts, dry_run)

    def _classify_products(self, dry_run, overwrite, batch_size, use_llm, stats, method_counts):
        from apps.inventory.models import Product

        qs = Product.objects.all()
        if not overwrite:
            qs = qs.filter(category_ref__isnull=True)
        total = qs.count()
        self.stdout.write(f'Classifying {total} products...')

        for offset in range(0, total, batch_size):
            batch = list(qs[offset:offset + batch_size])
            to_update = []
            for product in batch:
                result = classify_item(
                    title=product.title,
                    brand=product.brand or None,
                    model=product.model or None,
                    use_llm_fallback=use_llm,
                )
                method_counts[result.method] += 1
                if result.category_id:
                    product.category_ref_id = result.category_id
                    if not product.category and result.category_name:
                        product.category = result.category_name
                    to_update.append(product)
                    stats['products_classified'] += 1
                else:
                    stats['products_unresolved'] += 1

                if dry_run:
                    self.stdout.write(
                        f'  [DRY] {product.title[:60]} -> {result.category_name} '
                        f'({result.method}, {result.confidence:.0%})'
                    )

            if not dry_run and to_update:
                with transaction.atomic():
                    Product.objects.bulk_update(to_update, ['category_ref', 'category'], batch_size=batch_size)

            self.stdout.write(f'  Products: {min(offset + batch_size, total)}/{total}')

    def _classify_items(self, dry_run, overwrite, batch_size, use_llm, stats, method_counts):
        from apps.inventory.models import Item

        # Items don't have category_ref directly; we update the category text field
        # and rely on product.category_ref for the structured data.
        # If the item has a linked product with category_ref, copy it; otherwise classify.
        qs = Item.objects.select_related('product__category_ref').all()
        if not overwrite:
            qs = qs.filter(category='')

        total = qs.count()
        self.stdout.write(f'Classifying {total} items...')

        for offset in range(0, total, batch_size):
            batch = list(qs[offset:offset + batch_size])
            to_update = []
            for item in batch:
                # Prefer product's category_ref if available
                if item.product and item.product.category_ref:
                    item.category = item.product.category_ref.name
                    to_update.append(item)
                    stats['items_from_product'] += 1
                    method_counts['product_ref'] += 1
                    continue

                result = classify_item(
                    title=item.title,
                    brand=item.brand or None,
                    use_llm_fallback=use_llm,
                )
                method_counts[result.method] += 1
                item.category = result.category_name
                to_update.append(item)
                stats['items_classified'] += 1

                if dry_run:
                    self.stdout.write(
                        f'  [DRY] {item.sku} {item.title[:50]} -> {result.category_name} '
                        f'({result.method})'
                    )

            if not dry_run and to_update:
                with transaction.atomic():
                    Item.objects.bulk_update(to_update, ['category'], batch_size=batch_size)

            self.stdout.write(f'  Items: {min(offset + batch_size, total)}/{total}')

    def _print_summary(self, stats, method_counts, dry_run):
        prefix = '[DRY RUN] ' if dry_run else ''
        self.stdout.write('\n' + '=' * 50)
        self.stdout.write(f'{prefix}Backfill Summary')
        self.stdout.write('=' * 50)
        for key, val in stats.items():
            self.stdout.write(f'  {key.replace("_", " ").title()}: {val}')
        self.stdout.write('\nClassification methods used:')
        for method, count in sorted(method_counts.items(), key=lambda x: -x[1]):
            self.stdout.write(f'  {method}: {count}')
        self.stdout.write('=' * 50)
        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN — run without --dry-run to commit.'))
        else:
            self.stdout.write(self.style.SUCCESS('\nBackfill complete.'))
