"""
Export the local standardize and dedupe results for production (see `services/standard_load.py`).

    python manage.py export_standard_backfill --tag 2026-10-02

Run it on the PC that holds the pipeline's results. It writes three files into `apps/inventory/data/backfill/`:
`standard-<tag>.jsonl.gz`, `merges-<tag>.jsonl.gz`, `decisions-<tag>.jsonl.gz`. They ship with the next release; the
owner approves the loads in production (Superuser > Requests).
"""
import gzip
import json

from django.core.management.base import BaseCommand
from django.db.models import Max
from django.utils import timezone

from apps.inventory.models import CatalogMerge, DedupeDecision, Product, ProductProfile
from apps.inventory.services import standard_load, standardize
from apps.inventory.services.catalog_merge import normalize_title

PIPELINE_SOURCES = ('ai:muse-spark-1.3-contributor', 'ai:claude-sonnet-5-5')


class Command(BaseCommand):
    help = 'Export the standardized profiles, merges and dedupe decisions to data/backfill for production.'

    def add_arguments(self, parser):
        parser.add_argument('--tag', required=True, help='Date tag in the file names, e.g. 2026-10-02.')

    def _write(self, name, header, rows):
        path = standard_load.resolve(name)
        path.parent.mkdir(parents=True, exist_ok=True)
        n = 0
        with gzip.open(path, 'wt', encoding='utf-8', compresslevel=9) as f:
            f.write(json.dumps({'header': header}, ensure_ascii=False) + '\n')
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n')
                n += 1
        self.stdout.write(f'{name}: {n:,} rows, {path.stat().st_size / 1e6:.1f} MB')

    def handle(self, *args, tag, **options):
        header = {
            'rules_version': standardize.rules_version(), 'exported_at': timezone.now().isoformat(),
            'max_product_id': Product.objects.aggregate(m=Max('id'))['m'],
        }

        def standard():
            qs = ProductProfile.objects.exclude(vector_text='').select_related('product').order_by('product_id')
            for p in qs.iterator(chunk_size=5000):
                meta = p.field_meta or {}
                fields = {f: getattr(p, f) for f in standard_load.FIELDS
                          if (meta.get(f) or {}).get('source') in PIPELINE_SOURCES and getattr(p, f) not in (None, '', {})}
                if p.aliases:
                    fields['aliases'] = p.aliases
                if 'vector_text' not in fields:
                    continue  # the vector text was not written by the pipeline (a person's, or older)
                first = meta.get('display_title') or meta.get('vector_text') or {}
                yield {'id': p.product_id, 't': normalize_title(p.product.title), 'f': fields,
                       's': first.get('source') or PIPELINE_SOURCES[0], 'c': first.get('confidence') or ''}

        def merges():
            qs = CatalogMerge.objects.filter(method=standard_load.MERGE_METHOD, undone_at__isnull=True).select_related(
                'survivor', 'merged').order_by('pk')
            for m in qs.iterator(chunk_size=5000):
                yield {'s': m.survivor_id, 'm': m.merged_id, 'st': normalize_title(m.survivor.title),
                       'mt': normalize_title(m.merged.title), 'r': m.reason}

        def decisions():
            for d in DedupeDecision.objects.order_by('pk').iterator(chunk_size=5000):
                yield {'a': d.product_a_id, 'b': d.product_b_id, 'd': d.decision, 'sim': d.similarity, 'r': d.reason,
                       'src': d.source, 'v': d.rules_version}

        self._write(f'standard-{tag}.jsonl.gz', {**header, 'kind': 'standard'}, standard())
        self._write(f'merges-{tag}.jsonl.gz', {**header, 'kind': 'merges'}, merges())
        self._write(f'decisions-{tag}.jsonl.gz', {**header, 'kind': 'decisions'}, decisions())
