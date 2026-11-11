"""Dash Updates #98: finding a manifest row's product in Processing (services/product_find.py)."""
from decimal import Decimal

from django.test import SimpleTestCase, TestCase

from apps.inventory.models import Category, Item, Product, ProcessingRow
from apps.inventory.services import product_find as pf
from apps.inventory.tests.test_truck_plan import TruckSummaryBase


class WordsAndRankingTests(SimpleTestCase):
    def test_words_lose_punctuation_and_little_words(self):
        # One character ("6") is in nearly every product line, so it is left out like the little words.
        self.assertEqual(pf.words_of('Superman TRGX 6" Action Figure, 4-Pack'), ['superman', 'trgx', 'action', 'figure', '4-pack'])
        self.assertEqual(pf.words_of('Hasbro Trash to Table'), ['hasbro', 'trash', 'table'])
        self.assertEqual(pf.words_of('to'), ['to'])   # all there is: kept

    def test_a_code_is_one_token_with_a_digit(self):
        self.assertTrue(pf.looks_like_code('191726910497'))
        self.assertTrue(pf.looks_like_code('itm0227173'))
        self.assertFalse(pf.looks_like_code('drum'))
        self.assertFalse(pf.looks_like_code('6in'))

    def test_all_the_words_beat_most_of_them(self):
        words = ['vtech', 'bluey', 'drum']
        full = pf.score(words, 'VTech Bluey Hooray Drum Set', 'VTech', 'vtech bluey hooray drum set')
        most = pf.score(words, 'VTech Bluey Keytar', 'VTech', 'vtech bluey keytar')
        self.assertGreater(full, most)

    def test_a_rare_word_says_more_than_a_common_one(self):
        words = ['kids', 'toy', 'drum']
        lines = ['kidstoycar', 'kidstoyball', 'kidstoyplush', 'kidstoyblock', 'drumset']
        weights = pf.word_weights(words, lines)
        self.assertGreater(weights['drum'], weights['toy'])
        drum = pf.score(words, 'Drum Set', '', 'drum set', weights)
        plush = pf.score(words, 'Kids Toy Plush', '', 'kids toy plush', weights)
        # Two common words do not outweigh the one rare word by much; the drum is close behind, not buried.
        self.assertGreater(drum, plush - 6)

    def test_the_words_together_in_the_title_rank_first(self):
        words = ['trash', 'table']
        together = pf.score(words, 'Hasbro Trash to Table Game', 'Hasbro', 'hasbro trash to table game')
        apart = pf.score(words, 'Table Top Trash Can', '', 'table top trash can')
        self.assertGreater(together, apart)


class FindTests(TestCase):
    def setUp(self):
        cat = Category.objects.get_or_create(name='Toys & games', defaults={'slug': 'toys-games-pf'})[0]
        with self.captureOnCommitCallbacks(execute=True):
            self.drum = Product.objects.create(title='VTech Bluey Hooray Drum Set', brand='VTech', category=cat,
                                               identifiers={'upc': '3417765734007'})
            self.keytar = Product.objects.create(title='VTech Bluey Keytar Toy', brand='VTech', category=cat)
            self.plush = Product.objects.create(title='Bluey Plush Toy Kids', brand='Bluey', category=cat)
            self.gone = Product.objects.create(title='VTech Bluey Drum Old', brand='VTech', category=cat, is_active=False)
        Item.objects.create(product=self.drum, sku='ITMPF001', price=Decimal('14.99'), status='sold', sold_for=Decimal('14.00'))
        Item.objects.create(product=self.drum, sku='ITMPF002', price=Decimal('14.99'), status='on_shelf')

    def ids(self, out):
        return [r['id'] for r in out['results']]

    def test_a_code_finds_its_product_first(self):
        out = pf.find('3417765734007')
        self.assertEqual(self.ids(out)[0], self.drum.pk)
        self.assertEqual(out['results'][0]['why'], pf.WHY_CODE)
        self.assertEqual(self.ids(pf.find('ITMPF001'))[0], self.drum.pk)          # an item's SKU
        self.assertEqual(self.ids(pf.find(self.drum.product_number))[0], self.drum.pk)

    def test_a_code_that_matches_nothing_finds_nothing(self):
        self.assertEqual(pf.find('3417765734999')['results'], [])

    def test_an_extra_word_does_not_empty_the_list(self):
        out = pf.find('vtech bluey drum kids toy')
        self.assertIn(self.drum.pk, self.ids(out))
        self.assertNotIn(self.gone.pk, self.ids(out))

    def test_all_the_words_come_first_and_say_so(self):
        out = pf.find('bluey drum')
        self.assertEqual(self.ids(out)[0], self.drum.pk)
        self.assertEqual(out['results'][0]['why'], pf.WHY_ALL)

    def test_each_result_says_enough_to_choose_it(self):
        r = pf.find('hooray drum')['results'][0]
        self.assertEqual((r['brand'], r['upc'], r['category'], r['sold'], r['on_shelf'], r['avg_sold']),
                         ('VTech', '3417765734007', 'Toys & games', 1, 1, '14.00'))

    def test_products_on_the_row_are_marked_not_hidden(self):
        out = pf.find('3417765734007', attached=[self.drum.pk])
        self.assertEqual(self.ids(out), [self.drum.pk])
        self.assertTrue(out['results'][0]['on_this_row'])


class LikelyTests(TruckSummaryBase):
    def setUp(self):
        super().setUp()
        with self.captureOnCommitCallbacks(execute=True):
            self.drum = Product.objects.create(title='VTech Bluey Hooray Drum Set', brand='VTech',
                                               identifiers={'upc': '3417765734007'})
            self.other = Product.objects.create(title='VTech Bluey Drum Set Deluxe', brand='VTech')
            self.keytar = Product.objects.create(title='VTech Bluey Keytar', brand='VTech')
        self.row = self.rows[0][1]
        ProcessingRow.objects.filter(pk=self.row.pk).update(
            title='VTech Bluey Drum Set', brand='VTech', identifiers={'upc': '3417765734007'})
        self.row.refresh_from_db()

    def test_the_code_first_then_the_title(self):
        out = pf.likely(self.row)
        ids = [r['id'] for r in out['results']]
        self.assertEqual(ids[0], self.drum.pk)
        self.assertEqual(out['results'][0]['why'], pf.WHY_CODE)
        self.assertIn(self.other.pk, ids)

    def test_products_already_on_the_row_are_left_out(self):
        ProcessingRow.objects.filter(pk=self.row.pk).update(product_links={str(self.drum.pk): {'role': None}})
        self.row.refresh_from_db()
        ids = [r['id'] for r in pf.likely(self.row)['results']]
        self.assertNotIn(self.drum.pk, ids)
        self.assertIn(self.other.pk, ids)

    def test_the_api_answers_for_a_row(self):
        r = self.client.get(f'/api/inventory/processing-rows/{self.row.pk}/likely-products/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['results'][0]['id'], self.drum.pk)
        r = self.client.get('/api/inventory/product-find/', {'q': 'bluey drum', 'row': self.row.pk})
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn(self.drum.pk, [x['id'] for x in r.data['results']])
