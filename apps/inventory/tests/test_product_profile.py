"""Product profiles, brand aliases and proposals (product_intelligence Phase 2)."""
import json
import tempfile
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.inventory.models import BrandAlias, Product, ProductProfile, ProductProposal
from apps.inventory.services.product_profile import apply_proposals, canonical_brand, normalize_brand, set_field


class BrandNormalizeTests(SimpleTestCase):
    def test_spellings_share_a_key(self):
        self.assertEqual(normalize_brand('Hearth & Hand™ with Magnolia'), 'hearth and hand with magnolia')
        self.assertEqual(normalize_brand('Hearth&Hand with Magnolia'), 'hearth and hand with magnolia')
        self.assertEqual(normalize_brand('Up & Up'), normalize_brand('up&up'))


class BrandAliasTests(TestCase):
    def test_canonical_and_placeholders(self):
        BrandAlias.objects.create(alias='dewalt', brand='DEWALT')
        BrandAlias.objects.create(alias='htsqyl', is_junk=True)
        self.assertEqual(canonical_brand('DeWalt'), 'DEWALT')
        self.assertEqual(canonical_brand('HTSQYL'), '')
        self.assertEqual(canonical_brand('Generic'), '')
        self.assertEqual(canonical_brand('Some New Brand'), 'Some New Brand')

    def test_seed_command_is_idempotent(self):
        call_command('seed_brand_aliases', stdout=StringIO())
        n = BrandAlias.objects.count()
        self.assertGreater(n, 1000)
        call_command('seed_brand_aliases', stdout=StringIO())
        self.assertEqual(BrandAlias.objects.count(), n)


class SetFieldTests(TestCase):
    def setUp(self):
        self.product = Product.objects.create(title='Owala FreeSip 24oz')

    def test_records_provenance(self):
        self.assertTrue(set_field(self.product, 'category', 'Kitchen & dining', source='ai:spark', confidence='high'))
        prof = ProductProfile.objects.get(product=self.product)
        self.assertEqual(prof.category, 'Kitchen & dining')
        self.assertEqual(prof.field_meta['category']['source'], 'ai:spark')

    def test_machine_never_overwrites_a_person(self):
        set_field(self.product, 'category', 'Sports & outdoors', source='human', confidence='high')
        self.assertFalse(set_field(self.product, 'category', 'Kitchen & dining', source='ai:spark', confidence='high'))
        self.assertEqual(ProductProfile.objects.get(product=self.product).category, 'Sports & outdoors')

    def test_short_name_is_cut_and_unknown_field_refused(self):
        set_field(self.product, 'short_name', 'x' * 60, source='rule')
        self.assertEqual(len(ProductProfile.objects.get(product=self.product).short_name), 40)
        with self.assertRaises(ValueError):
            set_field(self.product, 'price', '9.99', source='rule')

    def test_product_row_is_not_touched(self):
        before = Product.objects.filter(pk=self.product.pk).values().get()
        set_field(self.product, 'brand', 'Owala', source='rule')
        after = Product.objects.filter(pk=self.product.pk).values().get()
        self.assertEqual(before, after)


class ProposalLoadApplyTests(TestCase):
    def setUp(self):
        self.a = Product.objects.create(title='Owala FreeSip 24oz')
        self.b = Product.objects.create(title='Owala FreeSip 24oz Blue')
        self.c = Product.objects.create(title='Gun Safe')
        rows = [
            {'group': 'owala', 'product_ids': [self.a.pk, self.b.pk], 'sold': 40, 'category': 'Kitchen & dining',
             'subcategory': 'Drinkware & bottles', 'short_name': 'Owala FreeSip 24oz', 'confidence': 'high',
             'flags': '', 'source': 'ai:spark', 'rules': 'v1'},
            {'group': 'safe', 'product_ids': [self.c.pk, 999999], 'sold': 900, 'category': 'Tools & hardware',
             'subcategory': 'Locks', 'short_name': 'Gun Safe', 'confidence': 'medium', 'flags': 'vague_title',
             'source': 'ai:spark', 'rules': 'v1'},
        ]
        second = [{'group': 'safe', 'category': 'Storage & organization', 'source': 'ai:flash'}]
        self.path = tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False, encoding='utf-8')
        self.path.write('\n'.join(json.dumps(r) for r in rows))
        self.path.close()
        self.second = tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False, encoding='utf-8')
        self.second.write('\n'.join(json.dumps(r) for r in second))
        self.second.close()

    def _load(self):
        call_command('load_profile_proposals', self.path.name, '--second', self.second.name, '--batch', 't1', stdout=StringIO())

    def test_load_splits_auto_and_pending_and_is_idempotent(self):
        self._load()
        self.assertEqual(ProductProposal.objects.filter(status='auto').count(), 6)  # 2 products x 3 fields
        self.assertEqual(ProductProposal.objects.filter(status='pending').count(), 4)  # 3 fields + flags
        self.assertEqual(ProductProposal.objects.get(product=self.a, field='category').dollars, Decimal('20.00'))
        self._load()
        self.assertEqual(ProductProposal.objects.count(), 10)

    def test_apply_auto_then_keep_a_person(self):
        self._load()
        set_field(self.b, 'category', 'Sports & outdoors', source='human')
        counts = apply_proposals(ProductProposal.objects.filter(status='auto'))
        self.assertEqual(counts, {'applied': 5, 'kept_human': 1})
        self.assertEqual(ProductProfile.objects.get(product=self.a).category, 'Kitchen & dining')
        self.assertEqual(ProductProfile.objects.get(product=self.b).category, 'Sports & outdoors')
        self.assertFalse(ProductProfile.objects.filter(product=self.c).exists())
