"""
Find duplicate products and (optionally) merge them. Dry run by default: writes a plan CSV.

    python manage.py merge_duplicate_products [--methods upc,title_brand] [--limit N] [--out plan.csv]
    python manage.py merge_duplicate_products --apply [--limit N]          # merge (reversible)
    python manage.py merge_duplicate_products --undo <merge_id>

Every merge is a CatalogMerge row; ``--undo`` moves exactly the recorded rows back.
"""
import csv

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count

from apps.inventory.models import CatalogMerge, Product
from apps.inventory.services.catalog_merge import duplicate_candidates, merge_products, undo_merge


class Command(BaseCommand):
    help = 'Find (and with --apply, merge) duplicate products. Reversible.'

    def add_arguments(self, parser):
        parser.add_argument('--methods', default='upc,title_brand')
        parser.add_argument('--limit', type=int, default=0)
        parser.add_argument('--out', default='')
        parser.add_argument('--apply', action='store_true')
        parser.add_argument('--undo', type=int, default=0)

    def handle(self, *args, methods, limit, out, apply, undo, **options):
        if undo:
            merge = CatalogMerge.objects.filter(pk=undo).first()
            if merge is None:
                raise CommandError(f'No merge {undo}.')
            undo_merge(merge)
            self.stdout.write(self.style.SUCCESS(f'Undid merge {undo}: product {merge.merged_id} restored.'))
            return
        cands = duplicate_candidates(methods=tuple(m.strip() for m in methods.split(',') if m.strip()), limit=limit)
        by_method = {}
        for c in cands:
            by_method[c.method] = by_method.get(c.method, 0) + 1
        self.stdout.write(f'{len(cands)} merge candidates {by_method}')
        if out:
            ids = {c.survivor_id for c in cands} | {c.merged_id for c in cands}
            info = {
                p['pk']: p for p in Product.objects.filter(pk__in=ids).annotate(n=Count('items')).values('pk', 'title', 'brand', 'n')
            }
            with open(out, 'w', encoding='utf-8', newline='') as f:
                w = csv.writer(f)
                w.writerow(['method', 'key', 'survivor_id', 'survivor_title', 'survivor_items', 'merged_id', 'merged_title', 'merged_brand', 'merged_items'])
                for c in cands:
                    s, m = info.get(c.survivor_id, {}), info.get(c.merged_id, {})
                    w.writerow([c.method, c.key, c.survivor_id, s.get('title'), s.get('n'), c.merged_id, m.get('title'), m.get('brand'), m.get('n')])
            self.stdout.write(f'Plan written to {out}')
        if not apply:
            self.stdout.write('Dry run: nothing merged. Add --apply to merge.')
            return
        done = 0
        for c in cands:
            merge_products(
                Product.objects.get(pk=c.survivor_id), Product.objects.get(pk=c.merged_id),
                method=c.method, reason=c.key[:300],
            )
            done += 1
        self.stdout.write(self.style.SUCCESS(f'Merged {done} products (undo any with --undo <merge_id>).'))
