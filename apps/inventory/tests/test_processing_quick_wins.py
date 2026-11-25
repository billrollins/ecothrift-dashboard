"""Dash Update #223, Processing quick wins (Bill 2026-11-24).

1. A search looks at every line of the order: with a filter on, the answer says how many lines match outside it.
2. The row's retail and price start the FIRST check-in of a product on the row only; a later check-in of that product
   starts from the last check-in, and a check-in never writes its price back onto the row.
4. Likely products say whether the row IS the product or is only LIKE it, how sure, and remember "not this product".
"""
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.inventory.models import Item, ManifestRow, ProcessingRow, Product, PurchaseOrder, Vendor
from apps.inventory.services import product_find
from apps.inventory.services.processing_workspace import build_processing_workspace, refresh_processing_rows_denorm


class Base(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Walmart', code='WLMQW')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='qw@example.com', first_name='Q', last_name='W', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor, order_number='PO-QW-1', ordered_date='2026-11-01',
            purchase_cost=Decimal('100.00'), retail_value=Decimal('1000.00'), status='processing',
        )

    def row(self, n: int, title: str, *, qty: int = 5, retail: str = '20.00', price: str = '8.00', product=None):
        mr = ManifestRow.objects.create(
            purchase_order=self.po, row_number=n, quantity=qty, title=title, brand='Acme',
            unit_retail=Decimal(retail),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=self.po, manifest_row=mr, row_number=n, quantity=qty, title=title, brand='Acme',
            unit_retail=Decimal(retail), shelf_price=Decimal(price), matched_product=product,
        )
        return pr

    def check_in(self, pr, product, **extra):
        body = {
            'processing_row_id': pr.id, 'quantity': 1, 'condition': 'good', 'dispatch': 'on_shelf',
            'product_mode': 'existing', 'product_id': product.id, 'retail_check': 'ok', **extra,
        }
        r = self.client.post(f'/api/inventory/orders/{self.po.id}/processing-row-check-in/', body, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        return r.data


class SearchTheWholeOrderTests(Base):
    def test_a_filter_never_hides_matches_it_says_how_many_are_outside(self):
        product = Product.objects.create(title='Energizer cell', brand='Energizer')
        done = self.row(1, 'Energizer 2032 Batteries', qty=1, product=product)
        self.row(2, 'Energizer AA Batteries')
        self.row(3, 'Bar stool')
        self.check_in(done, product, price='8.00')
        refresh_processing_rows_denorm(self.po)

        payload = build_processing_workspace(self.po, limit=50, segments='done', search='energizer', hide_checked_in=False)
        self.assertEqual(payload['row_count_filtered'], 1)
        self.assertEqual(payload['row_count_search_all'], 2)

        open_only = build_processing_workspace(self.po, limit=50, segments='open', search='stool', hide_checked_in=False)
        self.assertEqual((open_only['row_count_filtered'], open_only['row_count_search_all']), (1, 1))

        nothing = build_processing_workspace(self.po, limit=50, segments='done', search='stool', hide_checked_in=False)
        self.assertEqual((nothing['row_count_filtered'], nothing['row_count_search_all']), (0, 1))

    def test_without_a_filter_the_two_counts_are_the_same(self):
        self.row(1, 'Energizer 2032 Batteries')
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/?search=energizer&hide_checked_in=false')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['row_count_filtered'], r.data['row_count_search_all'])


class CheckInDefaultsTests(Base):
    def test_first_check_in_from_the_row_later_ones_from_the_last_check_in(self):
        product = Product.objects.create(title='Widget', brand='Acme')
        pr = self.row(1, 'Widget', retail='20.00', price='8.00', product=product)

        self.check_in(pr, product)  # no price sent: the row's
        first = Item.objects.filter(check_in__processing_row=pr).order_by('id').last()
        self.assertEqual((first.price, first.retail), (Decimal('8.00'), Decimal('20.00')))

        self.check_in(pr, product, price='6.50', retail='18.00')
        self.check_in(pr, product)  # no price sent: the last check-in's, not the row's
        third = Item.objects.filter(check_in__processing_row=pr).order_by('id').last()
        self.assertEqual((third.price, third.retail), (Decimal('6.50'), Decimal('18.00')))

    def test_a_check_in_never_changes_the_rows_price(self):
        product = Product.objects.create(title='Part', brand='Acme')
        pr = self.row(1, 'Set of 10', retail='100.00', price='40.00', product=product)
        self.check_in(pr, product, price='4.00', retail='10.00')
        pr.refresh_from_db()
        self.assertEqual(pr.shelf_price, Decimal('40.00'))
        self.assertEqual(pr.unit_retail, Decimal('100.00'))
        # Editing that check-in does not move the row either.
        check_in = pr.item_checkins.order_by('-id').first()
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/item-check-ins/{check_in.id}/update/', {'price': '5.00'}, format='json',
        )
        self.assertEqual(r.status_code, 200, getattr(r, 'data', r))
        pr.refresh_from_db()
        self.assertEqual(pr.shelf_price, Decimal('40.00'))

    def test_another_product_on_the_same_row_still_starts_from_the_row(self):
        a = Product.objects.create(title='A', brand='Acme')
        b = Product.objects.create(title='B', brand='Acme')
        pr = self.row(1, 'Mixed', retail='20.00', price='8.00', product=a)
        self.check_in(pr, a, price='3.00', retail='9.00')
        self.check_in(pr, b)
        b_item = Item.objects.filter(check_in__processing_row=pr, product=b).first()
        self.assertEqual(b_item.price, Decimal('8.00'))


class LikelyProductsTests(Base):
    def test_is_or_like_with_a_confidence_and_not_this_product_is_remembered(self):
        same = Product.objects.create(title='Energizer 2032 Batteries 2-Pack', brand='Energizer')
        near = Product.objects.create(title='Energizer 2032 Batteries 10-Pack with Charger Case', brand='Energizer')
        from apps.inventory.services.inventory_search import rebuild_search_text
        rebuild_search_text([same.id, near.id])
        pr = self.row(1, 'Energizer 2032 Batteries 2-Pack')
        pr.brand = 'Energizer'
        pr.save()

        r = self.client.get(f'/api/inventory/processing-rows/{pr.id}/likely-products/')
        self.assertEqual(r.status_code, 200)
        by_id = {p['id']: p for p in r.data['results']}
        self.assertIn(same.id, by_id)
        self.assertEqual(by_id[same.id]['kind'], 'is')
        self.assertGreaterEqual(by_id[same.id]['confidence'], 85)
        if near.id in by_id:
            self.assertLess(by_id[near.id]['confidence'], by_id[same.id]['confidence'])
        self.assertEqual(r.data['results'][0]['id'], same.id)

        r = self.client.post(f'/api/inventory/processing-rows/{pr.id}/not-product/', {'product_id': same.id}, format='json')
        self.assertEqual(r.data['not_product_ids'], [same.id])
        r = self.client.get(f'/api/inventory/processing-rows/{pr.id}/likely-products/')
        self.assertNotIn(same.id, {p['id'] for p in r.data['results']})
        # Search is not changed by it.
        found = self.client.get('/api/inventory/product-find/', {'q': 'energizer 2032', 'row': pr.id})
        self.assertIn(same.id, {p['id'] for p in found.data['results']})

        self.client.post(f'/api/inventory/processing-rows/{pr.id}/not-product/', {'product_id': same.id, 'undo': True}, format='json')
        pr.refresh_from_db()
        self.assertEqual(pr.not_product_ids, [])

    def test_not_product_needs_a_product_id(self):
        pr = self.row(1, 'Thing')
        r = self.client.post(f'/api/inventory/processing-rows/{pr.id}/not-product/', {}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_green_needs_the_same_size_another_size_is_only_maybe(self):
        """Bill 2026-11-25: green = "YES this is it". The same words in another size or count are yellow."""
        from apps.inventory.services.inventory_search import rebuild_search_text

        size5 = Product.objects.create(title='Pampers Swaddlers Diapers Size 5', brand='Pampers')
        size4 = Product.objects.create(title='Pampers Swaddlers Diapers Size 4', brand='Pampers')
        other = Product.objects.create(title='Pampers Baby Wipes Sensitive 72 Count Tub', brand='Pampers')
        rebuild_search_text([size5.id, size4.id, other.id])
        pr = self.row(1, 'Pampers Swaddlers Diapers Size 5')
        pr.brand = 'Pampers'
        pr.save()

        r = self.client.get(f'/api/inventory/processing-rows/{pr.id}/likely-products/')
        by_id = {p['id']: p for p in r.data['results']}
        self.assertEqual((by_id[size5.id]['band'], by_id[size5.id]['kind']), ('yes', 'is'))
        self.assertEqual((by_id[size4.id]['band'], by_id[size4.id]['kind']), ('maybe', 'like'))
        self.assertEqual(by_id[size4.id]['confidence'], product_find.IS_FROM - 1)
        self.assertEqual(r.data['results'][0]['id'], size5.id)
        if other.id in by_id:
            self.assertEqual(by_id[other.id]['band'], 'no')

    def test_the_same_code_is_green_whatever_the_titles_say(self):
        from apps.inventory.services.inventory_search import rebuild_search_text

        coded = Product.objects.create(title='Great Value Ultra Dish Liquid', brand='Great Value',
                                       identifiers={'upc': '078742370345'})
        rebuild_search_text([coded.id])
        pr = self.row(1, 'Ultra Dish Soap 90oz')
        pr.identifiers = {'upc': '078742370345'}
        pr.save()

        r = self.client.get(f'/api/inventory/processing-rows/{pr.id}/likely-products/')
        by_id = {p['id']: p for p in r.data['results']}
        self.assertEqual((by_id[coded.id]['band'], by_id[coded.id]['confidence']), ('yes', product_find.CODE_CONFIDENCE))


class SearchPhotoTests(TestCase):
    def test_the_add_item_photo_shows_only_when_the_switch_is_on(self):
        from unittest import mock

        p = Product.objects.create(title='Lamp', brand='Acme', photo_thumb='inventory/products/lamp_thumb.jpg')
        with mock.patch('django.core.files.storage.default_storage.url', side_effect=lambda k: f'https://cdn.test/{k}'):
            self.assertTrue(product_find.SEARCH_SHOWS_PRODUCT_THUMB)        # Bill turned it on 2026-11-25
            self.assertEqual(product_find.photo_urls([p.id]),
                             {p.id: 'https://cdn.test/inventory/products/lamp_thumb.jpg'})
            with mock.patch.object(product_find, 'SEARCH_SHOWS_PRODUCT_THUMB', False):
                self.assertEqual(product_find.photo_urls([p.id]), {})


class WordConfidenceTests(SimpleTestCase):
    def test_the_same_product_scores_high_a_bigger_or_other_product_lower(self):
        words = product_find.words_of('Energizer 2032 Batteries 2-Pack')
        same = product_find.word_confidence(words, 'Energizer 2032 Batteries 2-Pack', 'energizer')
        bundle = product_find.word_confidence(words, 'Energizer 2032 Batteries 10-Pack with Charger Case', 'energizer')
        other = product_find.word_confidence(words, 'Duracell AA Batteries', 'duracell')
        self.assertGreaterEqual(same, 85)
        self.assertLess(bundle, same)
        self.assertLess(other, bundle)
        self.assertEqual(product_find.match_kind(same), 'is')
        self.assertEqual(product_find.match_kind(other), 'like')
        self.assertEqual(product_find.word_confidence([], 'x', ''), 0)

    def test_the_three_bands(self):
        self.assertEqual([product_find.match_band(c) for c in (97, 85, 84, 60, 59, 0)],
                         ['yes', 'yes', 'maybe', 'maybe', 'no', 'no'])

    def test_size_marks_are_the_numbers_and_the_size_words(self):
        marks = product_find.size_marks
        self.assertEqual(marks('Pampers Swaddlers Diapers Size 5 26-Count'), {'5', '26'})
        self.assertEqual(marks('Duracell AAA Batteries 8-Pack'), {'aaa', '8'})
        self.assertEqual(marks('Shampoo 12.50 oz'), marks('Shampoo 12.5oz'))
        self.assertEqual(marks('1,000 Sheets'), {'1000'})
        self.assertEqual(marks("Men's X-Large Tee"), {'large'})
        self.assertEqual(marks('Memory Foam Pillow'), set())

    def test_sizes_agree_only_when_both_sides_state_the_same(self):
        agree = product_find.sizes_agree
        self.assertFalse(agree('Pampers Swaddlers Diapers Size 5', '', 'Pampers Swaddlers Diapers Size 4', ''))
        self.assertFalse(agree('Duracell Alkaline AAA Batteries 8-Pack', '', 'AA Alkaline Batteries', ''))
        self.assertTrue(agree('Dove Men Body Wash 18oz', '', 'Dove Men+Care Body Wash 18 oz', ''))
        self.assertTrue(agree('Memory Foam Pillow', '', 'Memory Foam Travel Pillow', ''))
        # A size only the product states is not agreement: the row may be any size of it.
        self.assertFalse(agree('Cocoa Butter Shea Body Wash', '', 'Cocoa & Shea Butter Body Wash - 20oz', ''))
        # The model number kept out of the product's title still counts.
        self.assertTrue(agree('Extended Performance Oil Filter M1-108A', '', 'Extended Performance Oil Filter', 'M1-108A'))
        self.assertFalse(agree('Oil Filter', 'M1-108A', 'Oil Filter', 'M1-110A'))

    def test_the_row_must_name_the_products_brand(self):
        agree = product_find.brand_agrees
        self.assertFalse(agree('', 'Ultra Dish Soap 90oz', 'Ajax'))
        self.assertTrue(agree('', 'Dove Men Body Wash 18oz', 'Dove'))
        self.assertTrue(agree('Great Value', 'Ultra Dish Liquid', 'Great Value'))
        self.assertTrue(agree('', "Mrs Meyers Clean Day Hand Soap", "Mrs. Meyer's"))
        # A brand is written many ways: its first word is enough.
        self.assertTrue(agree('Dove', 'Dove Men Body Wash 18oz', 'Dove Men+Care'))
        self.assertTrue(agree('', 'Honest Baby Wipes 72 Count', 'The Honest Company'))
        self.assertFalse(agree('', 'Ultra Dish Liquid', 'Great Value'))
        # No real brand on the product: nothing to disagree with.
        self.assertTrue(agree('', 'Memory Foam Pillow', ''))
        self.assertTrue(agree('', 'Memory Foam Pillow', 'Generic'))
