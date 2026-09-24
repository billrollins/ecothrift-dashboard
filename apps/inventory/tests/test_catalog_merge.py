"""Reversible product merges and duplicate candidates (product_intelligence Phase 2 step 5)."""
from io import StringIO

from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from apps.inventory.models import CatalogMerge, Item, Product, ProductProfile
from apps.inventory.services.catalog_merge import (
    duplicate_candidates,
    merge_products,
    undo_merge,
    valid_upc,
)


class UpcTests(SimpleTestCase):
    def test_check_digit_and_padding(self):
        self.assertEqual(valid_upc('036000291452'), '036000291452')
        self.assertEqual(valid_upc('36000291452'), '036000291452')
        self.assertEqual(valid_upc('036000291453'), '')
        self.assertEqual(valid_upc('36000291452', min_digits=12), '')
        self.assertEqual(valid_upc(''), '')


class MergeTests(TestCase):
    def setUp(self):
        self.keep = Product.objects.create(title='Calming Donut Dog Bed - 24in', brand='Best Friends')
        self.dup = Product.objects.create(title='Calming Donut Dog Bed - 24in', brand='Best Friends')
        self.item = Item.objects.create(product=self.dup, sku='ITMMERGE001')

    def test_merge_moves_rows_and_undo_puts_them_back(self):
        m = merge_products(self.keep, self.dup, method='title_brand')
        self.item.refresh_from_db()
        self.dup.refresh_from_db()
        self.assertEqual(self.item.product_id, self.keep.pk)
        self.assertFalse(self.dup.is_active)
        self.assertEqual(ProductProfile.objects.get(product=self.dup).merged_into_id, self.keep.pk)
        self.assertEqual(m.moved, {'inventory.Item.product': [self.item.pk]})
        with self.assertRaises(ValueError):
            merge_products(self.keep, self.dup, method='title_brand')
        undo_merge(m)
        self.item.refresh_from_db()
        self.dup.refresh_from_db()
        self.assertEqual(self.item.product_id, self.dup.pk)
        self.assertTrue(self.dup.is_active)
        self.assertIsNone(ProductProfile.objects.get(product=self.dup).merged_into_id)
        with self.assertRaises(ValueError):
            undo_merge(m)

    def test_undo_leaves_items_added_to_the_survivor_after_the_merge(self):
        m = merge_products(self.keep, self.dup, method='title_brand')
        later = Item.objects.create(product=self.keep, sku='ITMMERGE002')
        undo_merge(m)
        later.refresh_from_db()
        self.assertEqual(later.product_id, self.keep.pk)

    def test_candidates_by_title_brand_skip_vague_titles(self):
        Product.objects.create(title='Bowl', brand='Generic')
        Product.objects.create(title='Bowl', brand='Generic')
        cands = duplicate_candidates()
        self.assertEqual([(c.survivor_id, c.merged_id, c.method) for c in cands], [(self.dup.pk, self.keep.pk, 'title_brand')])

    def test_upc_needs_similar_titles(self):
        Product.objects.create(title='Round Slow-Close Toilet Seat', identifiers={'upc': '036000291452'})
        Product.objects.create(title='40in Electric Fireplace', identifiers={'upc': '036000291452'})
        a = Product.objects.create(title='Memory Foam Travel Pillow Brown', identifiers={'upc': '012345678905'})
        b = Product.objects.create(title='Memory Foam Travel Pillow - Brown', identifiers={'upc': '012345678905'})
        upc = [c for c in duplicate_candidates(methods=('upc',))]
        self.assertEqual([(c.survivor_id, c.merged_id) for c in upc], [(a.pk, b.pk)])

    def test_command_dry_run_then_apply_then_undo(self):
        out = StringIO()
        call_command('merge_duplicate_products', stdout=out)
        self.assertIn('Dry run', out.getvalue())
        self.assertFalse(CatalogMerge.objects.exists())
        call_command('merge_duplicate_products', '--apply', stdout=StringIO())
        merge = CatalogMerge.objects.get()
        call_command('merge_duplicate_products', '--undo', str(merge.pk), stdout=StringIO())
        merge.refresh_from_db()
        self.assertIsNotNone(merge.undone_at)
