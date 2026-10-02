"""The pipeline's results loaded through Requests: the standard, the merges, the vectors (no model calls)."""
from __future__ import annotations

import gzip
import json
import tempfile
from pathlib import Path
from unittest import mock

from django.test import TestCase

from apps.accounts.models import User
from apps.core.services import approval_requests as ar
from apps.inventory.models import (
    CatalogMerge, DedupeDecision, Item, PreprocessingRow, Product, ProductProfile, ProductVector, PurchaseOrder, Vendor,
)
from apps.inventory.services import standard_load
from apps.inventory.services.catalog_merge import normalize_title
from apps.inventory.services.product_profile import set_field

SRC = 'ai:muse-spark-1.3-contributor'


class StandardLoadTests(TestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss2@example.com', first_name='B', last_name='O', password='x-pass-123')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.a = Product.objects.create(title='LEGO City Police Station 60316', brand='LEGO')
        self.b = Product.objects.create(title='Lego Police Station', brand='Lego')
        self.c = Product.objects.create(title='Ninja Blender 1000W', brand='Ninja')

    def _file(self, name, rows):
        path = Path(self.tmp.name) / name
        with gzip.open(path, 'wt', encoding='utf-8') as f:
            f.write(json.dumps({'header': {'rules_version': 'spec-test', 'kind': name}}) + '\n')
            for r in rows:
                f.write(json.dumps(r) + '\n')
        return str(path)

    def _row(self, p, **fields):
        return {'id': p.pk, 't': normalize_title(p.title), 's': SRC, 'c': 'high', 'f': {
            'display_title': 'Lego City Police Station', 'short_name': 'Lego Police Station', 'brand': 'Lego',
            'vector_text': 'lego city police station', 'category': 'Toys & games', 'subcategory': 'Building sets',
            'key_specs': {'piece_count': '668pc'}, **fields}}

    def _run(self, kind, params):
        req = ar.stage(kind, title=kind, params=params)
        ar.approve(req, self.boss, start=False)
        return req, ar.run(req.pk)

    def test_load_sets_the_standard_keeps_human_values_skips_changed_products_and_undoes(self):
        set_field(self.a, 'category', 'Mixed lots & uncategorized', source='ai:old')
        set_field(self.b, 'short_name', 'My Own Name', source='human')
        rows = [self._row(self.a), self._row(self.b), {**self._row(self.c), 't': 'some other title'},
                {**self._row(self.c), 'id': 99999999}]
        path = self._file('standard.jsonl.gz', rows)
        staged, done = self._run('inventory.load_standard', {'file': path})
        self.assertEqual((staged.preview['counts']['Will be standardized'], staged.preview['counts']['Skipped: title changed since 09-24'],
                          staged.preview['counts']['Skipped: product no longer exists']), (2, 1, 1))
        self.assertEqual(done.status, 'applied', done.error)
        self.assertEqual((done.result['products'], done.result['kept_human'], done.result['changed'], done.result['missing']), (2, 1, 1, 1))
        pa, pb = ProductProfile.objects.get(product=self.a), ProductProfile.objects.get(product=self.b)
        self.assertEqual((pa.category, pa.vector_text, pa.field_meta['category']['source']), ('Toys & games', 'lego city police station', SRC))
        self.assertEqual(pa.field_meta['category']['rules_version'], 'spec-test')
        self.assertEqual(pb.short_name, 'My Own Name')
        self.assertFalse(ProductProfile.objects.filter(product=self.c).exclude(vector_text='').exists())
        # a second run changes nothing
        _, again = self._run('inventory.load_standard', {'file': path})
        self.assertEqual((again.result['products'], again.result['fields_set']), (0, 0))
        ar.undo(done, self.boss)
        pa.refresh_from_db()
        self.assertEqual((pa.category, pa.vector_text, pa.field_meta['category']['source']), ('Mixed lots & uncategorized', '', 'ai:old'))
        self.assertNotIn('vector_text', pa.field_meta)

    def test_load_resumes_from_its_cursor(self):
        path = self._file('standard.jsonl.gz', [self._row(self.a), self._row(self.b)])
        counts = standard_load.load_standard(path, request_id=1, start=1)
        self.assertEqual(counts['products'], 1)
        self.assertFalse(ProductProfile.objects.filter(product=self.a).exists())

    def test_merges_replay_in_order_move_open_order_rows_load_decisions_and_undo(self):
        order = PurchaseOrder.objects.create(vendor=Vendor.objects.create(name='V', code='VSL'), order_number='PO-SL-1',
                                             ordered_date='2026-06-01')
        Item.objects.create(product=self.b, sku='ITMSL1', price=10)
        open_row = PreprocessingRow.objects.create(purchase_order=order, row_number=1, final_matched_product=self.b)
        merges = self._file('merges.jsonl.gz', [
            {'s': self.a.pk, 'm': self.b.pk, 'st': normalize_title(self.a.title), 'mt': normalize_title(self.b.title), 'r': 'same set'},
            {'s': self.a.pk, 'm': self.c.pk, 'st': normalize_title(self.a.title), 'mt': 'not this title', 'r': 'x'},
        ])
        lo, hi = sorted((self.a.pk, self.b.pk))
        decisions = self._file('decisions.jsonl.gz', [
            {'a': lo, 'b': hi, 'd': 'same', 'sim': 0.98, 'r': 'same set', 'src': SRC, 'v': 'spec-test'},
            {'a': lo, 'b': 99999999, 'd': 'different', 'sim': 0.91, 'r': '', 'src': SRC, 'v': 'spec-test'},
        ])
        staged, done = self._run('inventory.merge_decided', {'file': merges, 'decisions_file': decisions})
        self.assertEqual((staged.preview['counts']['Will be merged'], staged.preview['counts']['Items moved to the survivor']), (1, 1))
        self.assertEqual(done.status, 'applied', done.error)
        self.assertEqual((done.result['merged'], done.result['changed'], done.result['decisions']), (1, 1, 1))
        self.assertEqual(Item.objects.get(sku='ITMSL1').product_id, self.a.pk)
        open_row.refresh_from_db()
        self.assertEqual(open_row.final_matched_product_id, self.a.pk)
        self.assertEqual(DedupeDecision.objects.count(), 1)
        _, again = self._run('inventory.merge_decided', {'file': merges, 'decisions_file': decisions})
        self.assertEqual((again.result['merged'], again.result['already']), (0, 1))
        ar.undo(done, self.boss)
        open_row.refresh_from_db()
        self.assertEqual((Item.objects.get(sku='ITMSL1').product_id, open_row.final_matched_product_id), (self.b.pk, self.b.pk))
        self.assertEqual(CatalogMerge.objects.filter(undone_at__isnull=True).count(), 0)

    def test_vectors_are_built_for_standardized_products_that_are_not_merged_away(self):
        for p in (self.a, self.b):
            ProductProfile.objects.create(product=p, vector_text='lego city police station', category='Toys & games')
        ProductProfile.objects.filter(product=self.b).update(merged_into=self.a)
        vec = [1.0] + [0.0] * (ProductVector.DIMENSIONS - 1)
        with mock.patch('apps.inventory.services.product_vectors.embed_texts', side_effect=lambda texts, batch_size=256: [vec for _ in texts]), \
                mock.patch.object(standard_load.time, 'sleep'):
            staged, done = self._run('inventory.embed_standard', {})
            self.assertEqual(staged.preview['counts'], {'Standardized products': 1, 'Vectors to build': 1})
            self.assertEqual((done.status, done.result['created']), ('applied', 1))
            _, again = self._run('inventory.embed_standard', {})
        self.assertEqual((again.preview['counts']['Vectors to build'], again.result['skipped']), (0, 1))
        self.assertEqual(list(ProductVector.objects.values_list('product_id', flat=True)), [self.a.pk])
