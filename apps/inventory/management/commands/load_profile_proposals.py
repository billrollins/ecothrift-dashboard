"""
Load a profile backfill file (JSONL, one line per normalized-title group) as ProductProposal rows.

    python manage.py load_profile_proposals workspace/backfill/pilot_out.jsonl \
        --second workspace/backfill/pilot_out.second.jsonl --batch spark-mixed-2026-09-23 [--dry-run]

Each line: {group, product_ids, sold, category, subcategory, short_name, confidence, flags, source, rules}.
Accept policy (workspace/gold/AUDITION.md): Spark ``high`` → auto; not high but the second
opinion names the same category → auto; otherwise pending (review queue, sorted by dollars).
Idempotent per (product, field, batch). Writes proposals only, never profiles or products.
"""
import json
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError

from apps.inventory.models import Product, ProductProposal

FIELDS = ('category', 'subcategory', 'short_name', 'flags')


def _read_jsonl(path):
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                yield json.loads(line)


class Command(BaseCommand):
    help = 'Load a profile backfill JSONL as ProductProposal rows (auto or pending).'

    def add_arguments(self, parser):
        parser.add_argument('path')
        parser.add_argument('--second', default='', help='Second-opinion JSONL keyed by group.')
        parser.add_argument('--batch', required=True, help='Name for this load, e.g. spark-mixed-2026-09-23.')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, path, second, batch, dry_run, **options):
        seconds = {r['group']: r for r in _read_jsonl(second)} if second else {}
        rows = list(_read_jsonl(path))
        if not rows:
            raise CommandError(f'No rows in {path}')
        live_ids = set(
            Product.objects.filter(pk__in={pid for r in rows for pid in r['product_ids']}).values_list('pk', flat=True)
        )
        done = set(
            ProductProposal.objects.filter(batch=batch).values_list('product_id', 'field')
        )
        new, counts = [], {'auto': 0, 'pending': 0, 'missing_products': 0}
        for r in rows:
            sec = seconds.get(r['group'])
            if r.get('confidence') == 'high':
                status = ProductProposal.STATUS_AUTO
            elif sec and sec.get('category') == r.get('category'):
                status = ProductProposal.STATUS_AUTO
            else:
                status = ProductProposal.STATUS_PENDING
            counts['auto' if status == ProductProposal.STATUS_AUTO else 'pending'] += 1
            ids = [pid for pid in r['product_ids'] if pid in live_ids]
            counts['missing_products'] += len(r['product_ids']) - len(ids)
            if not ids:
                continue
            share = (Decimal(str(r.get('sold') or 0)) / len(ids)).quantize(Decimal('0.01'))
            for pid in ids:
                for field in FIELDS:
                    value = r.get(field)
                    if field == 'flags':
                        value = [f.strip() for f in str(value or '').split(',') if f.strip()]
                        if not value:
                            continue
                    if value in (None, '') or (pid, field) in done:
                        continue
                    new.append(ProductProposal(
                        product_id=pid, field=field, value=value, source=r.get('source') or 'ai',
                        confidence=r.get('confidence') or '',
                        second_opinion={'category': sec.get('category'), 'source': sec.get('source')} if sec else {},
                        dollars=share, status=status, batch=batch, rules_version=r.get('rules') or '',
                    ))
        self.stdout.write(
            f"groups: {counts['auto']} auto, {counts['pending']} pending; proposals to add: {len(new)}; "
            f"product ids no longer in the catalog: {counts['missing_products']}"
        )
        if dry_run:
            self.stdout.write('Dry run: nothing written.')
            return
        ProductProposal.objects.bulk_create(new, batch_size=2000)
        self.stdout.write(self.style.SUCCESS(f'Added {len(new)} proposals in batch {batch}.'))
