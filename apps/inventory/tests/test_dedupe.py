"""Dedupe: the hard rules and the reversible merge (no model calls)."""
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from apps.inventory.services import dedupe, standardize


class SpecConflictTests(SimpleTestCase):
    def test_a_different_product_spec_means_a_different_product(self):
        self.assertEqual(dedupe.specs_conflict({'bed_size': 'Queen'}, {'bed_size': 'King'}), ['bed_size'])
        self.assertEqual(dedupe.specs_conflict({'storage': '64 GB'}, {'storage': '64gb'}), [])
        self.assertEqual(dedupe.specs_conflict({'size': '21in'}, {'material': 'wood'}), [])


class MergeTests(TestCase):
    def setUp(self):
        from apps.inventory.models import Category, Item, Product, ProductProfile

        cat = Category.objects.create(name='Toys', slug='toys-dd')
        self.a = Product.objects.create(title='Lego City Police Station', brand='LEGO', model='60316', category=cat,
                                        identifiers={'upc': '673419359217'})
        self.b = Product.objects.create(title='LEGO City Police Station 60316', brand='Lego', model='60316-1', category=cat)
        self.c = Product.objects.create(title='Police Station Lego', brand='Lego', category=cat)
        for p, n in ((self.a, 1), (self.b, 3), (self.c, 1)):
            ProductProfile.objects.create(product=p, category='Toys & games', subcategory='Building sets',
                                          vector_text='lego city police station', model_number=p.model)
            for i in range(n):
                Item.objects.create(product=p, sku=f'ITMDD{p.pk}{i}', price=10)
        self.version = standardize.rules_version()

    def _same(self, x, y, similarity=0.99):
        from apps.inventory.models import DedupeDecision

        lo, hi = sorted((x.pk, y.pk))
        return DedupeDecision.objects.create(product_a_id=lo, product_b_id=hi, decision='same', source='ai:test',
                                             rules_version=self.version, reason='same set', similarity=similarity)

    def test_merge_keeps_the_bigger_product_and_collects_aliases_and_follows_chains(self):
        from apps.inventory.models import Item, ProductProfile

        self._same(self.a, self.b)
        self._same(self.a, self.c)   # a is merged into b first, so c must land on b too
        stats = dedupe.merge_same()
        self.assertEqual(stats['merged'], 2)
        self.assertEqual(Item.objects.filter(product=self.b).count(), 5)
        al = ProductProfile.objects.get(product=self.b).aliases
        self.assertIn('673419359217', al['upcs'])
        self.assertIn('Lego City Police Station', al['titles'])
        self.assertEqual(ProductProfile.objects.get(product=self.a).merged_into_id, self.b.pk)

    def test_a_spark_same_below_the_trusted_similarity_does_not_merge(self):
        self._same(self.a, self.b, similarity=0.93)   # needs Sonnet's call first (dedupe.escalate)
        self.assertEqual(dedupe.merge_same()['merged'], 0)

    def test_merge_is_refused_until_a_vet_passed(self):
        with patch.object(dedupe, 'OUT_DIR', dedupe.Path(self._tmp())):
            self.assertFalse(dedupe.vet_passed())
            (dedupe.OUT_DIR / f"vet-{self.version.replace(':', '_')}.json").write_text('{"passed": true}')
            self.assertTrue(dedupe.vet_passed())

    def _tmp(self):
        import shutil
        import tempfile

        d = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, d, True)
        return d
