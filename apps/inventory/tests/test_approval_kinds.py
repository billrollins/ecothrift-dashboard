"""Inventory request kinds: backfill proposals, applying them, brand aliases, duplicate merges."""
from __future__ import annotations

import gzip
import json
import tempfile
from pathlib import Path

from django.test import TestCase

from apps.accounts.models import User
from apps.core.models import ApprovalRequest
from apps.core.services import approval_requests as ar
from apps.inventory.models import BrandAlias, CatalogMerge, Product, ProductProfile, ProductProposal


class InventoryKindTests(TestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)

    def _run(self, kind, params):
        req = ar.stage(kind, title=kind, params=params)
        ar.approve(req, self.boss, start=False)
        return ar.run(req.pk)

    def _backfill(self, rows):
        path = Path(self.tmp.name) / 'backfill.jsonl.gz'
        with gzip.open(path, 'wt', encoding='utf-8') as f:
            for r in rows:
                f.write(json.dumps(r) + '\n')
        return str(path)

    def test_load_then_apply_proposals_and_undo_both(self):
        a = Product.objects.create(title='Glass vase tall')
        b = Product.objects.create(title='Lamp shade linen')
        path = self._backfill([
            {'group': 'glass vase tall', 'product_ids': [a.pk], 'sold': 20, 'category': 'Home decor & lighting',
             'subcategory': 'Vases', 'short_name': 'Tall glass vase', 'confidence': 'high', 'flags': '', 'source': 'ai:spark'},
            {'group': 'lamp shade linen', 'product_ids': [b.pk, 999999], 'sold': 10, 'category': 'Home decor & lighting',
             'subcategory': '', 'short_name': 'Linen lamp shade', 'confidence': 'medium', 'flags': '', 'source': 'ai:spark'},
        ])
        staged = ar.stage('inventory.load_profile_proposals', title='Load', params={'batch': 'test-batch', 'path': path})
        self.assertEqual(staged.preview['counts']['Title groups'], 2)
        self.assertEqual(staged.preview['counts']['Auto-accepted groups'], 1)
        self.assertEqual(ProductProposal.objects.count(), 0)  # staging adds nothing
        ar.approve(staged, self.boss, start=False)
        loaded = ar.run(staged.pk)
        self.assertEqual(loaded.status, ApprovalRequest.STATUS_APPLIED)
        self.assertEqual(loaded.result['missing_products'], 1)
        self.assertEqual(ProductProposal.objects.filter(status='auto').count(), 3)  # a: category, subcategory, short_name
        self.assertEqual(ProductProposal.objects.filter(status='pending').count(), 2)  # b: category, short_name

        applied = self._run('inventory.apply_profile_proposals', {'status': 'auto', 'batch': 'test-batch'})
        self.assertEqual(applied.result['applied'], 3)
        profile = ProductProfile.objects.get(product=a)
        self.assertEqual((profile.short_name, profile.subcategory), ('Tall glass vase', 'Vases'))
        with self.assertRaises(ValueError):
            ar.undo(loaded, self.boss)  # applied proposals block undoing the load
        ar.undo(applied, self.boss)
        profile.refresh_from_db()
        self.assertEqual(profile.short_name, '')
        self.assertEqual(ProductProposal.objects.filter(status='auto').count(), 3)
        ar.undo(loaded, self.boss)
        self.assertEqual(ProductProposal.objects.count(), 0)

    def test_brand_aliases_add_only_the_missing_ones_and_undo(self):
        BrandAlias.objects.filter(alias__in=['3 d pro blends', '3d pro blends']).delete()
        before = BrandAlias.objects.count()
        req = self._run('inventory.seed_brand_aliases', {})
        self.assertGreaterEqual(req.result['added'], 2)
        self.assertTrue(BrandAlias.objects.filter(alias='3d pro blends').exists())
        ar.undo(req, self.boss)
        self.assertEqual(BrandAlias.objects.count(), before)

    def test_duplicate_merges_follow_the_frozen_plan_and_undo(self):
        keep = Product.objects.create(title='Stainless Stand Mixer 5qt', identifiers={'upc': '012345678905'})
        dup = Product.objects.create(title='Stainless Stand Mixer 5 qt', identifiers={'upc': '12345678905'})
        staged = ar.stage('inventory.merge_duplicates', title='Merge', params={'methods': 'upc'})
        self.assertEqual(staged.params['plan'][0][:2], [keep.pk, dup.pk])
        self.assertEqual(staged.preview['counts']['Merges'], 1)
        # A product added after staging is not merged: approval applies what was previewed.
        Product.objects.create(title='Stainless Stand Mixer 5 qt.', identifiers={'upc': '12345678905'})
        ar.approve(staged, self.boss, start=False)
        req = ar.run(staged.pk)
        self.assertEqual(req.result['merged'], 1)
        self.assertEqual(CatalogMerge.objects.filter(undone_at__isnull=True).count(), 1)
        ar.undo(req, self.boss)
        self.assertEqual(CatalogMerge.objects.filter(undone_at__isnull=True).count(), 0)
