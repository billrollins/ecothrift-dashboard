"""Inventory search: the search line, the one-row-per-product results, the SKU jump, the items of a product."""
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import Category, Item, Product, ProductProfile
from apps.inventory.services import inventory_search as s


class InventorySearchTests(TestCase):
    def setUp(self):
        cat = Category.objects.get_or_create(name='Mixed lots & uncategorized', defaults={'slug': 'mixed-is'})[0]
        with self.captureOnCommitCallbacks(execute=True):
            self.blender = Product.objects.create(title='BN701 Pro Plus 1400W', brand='Ninja', model='BN701', category=cat,
                                                  identifiers={'upc': '622356565998'})
            ProductProfile.objects.create(product=self.blender, display_title='Ninja Professional Plus Blender 1400W',
                                          short_name='Ninja Blender 1400W', brand='Ninja', category='Appliances',
                                          subcategory='Blenders', aliases={'titles': ['Ninja Pro Blender Auto-iQ']})
            self.boot = Product.objects.create(title='Silicone Blender Base Boot for Ninja', brand='Kyrgeu', category=cat)
            self.gone = Product.objects.create(title='Ninja Blender Old Listing', brand='Ninja', category=cat, is_active=False)
            self.sold_only = Product.objects.create(title='Ninja Foodi Blender', brand='Ninja', category=cat)
        now = timezone.now()
        self.item = Item.objects.create(product=self.blender, sku='ITMIS001', price=Decimal('40.00'), status='on_shelf')
        Item.objects.create(product=self.blender, sku='ITMIS002', price=Decimal('50.00'), status='on_shelf')
        Item.objects.create(product=self.blender, sku='ITMIS003', price=Decimal('45.00'), status='sold', sold_for=Decimal('42.00'),
                            sold_at=now, listed_at=now - timezone.timedelta(days=4))
        Item.objects.create(product=self.boot, sku='ITMIS004', price=Decimal('5.00'), status='on_shelf')
        Item.objects.create(product=self.sold_only, sku='ITMIS005', price=Decimal('30.00'), status='sold', sold_for=Decimal('30.00'), sold_at=now)

    def test_the_search_line_holds_the_product_and_its_standard_and_follows_saves(self):
        self.blender.refresh_from_db()
        for word in ('bn701', 'professional', 'appliances', 'blenders', 'auto-iq', '622356565998'):
            self.assertIn(word, self.blender.search_text)
        with self.captureOnCommitCallbacks(execute=True):
            ProductProfile.objects.get(product=self.blender).save()
            Product.objects.filter(pk=self.boot.pk).first().save()
        self.assertEqual(s.rebuild_search_text([self.blender.pk, self.boot.pk]), 0)   # already current

    def test_every_word_must_match_and_the_numbers_come_with_each_product(self):
        r = s.search('ninja blender')
        self.assertEqual([x['product_id'] for x in r['results']], [self.blender.pk, self.boot.pk])   # title match first
        top = r['results'][0]
        self.assertEqual((top['title'], top['tag_name'], top['category'], top['on_shelf'], top['items'], top['sold']),
                         ('Ninja Professional Plus Blender 1400W', 'Ninja Blender 1400W', 'Appliances', 2, 3, 1))
        self.assertEqual((top['price_min'], top['price_max'], top['avg_sold'], top['avg_days_to_sell']),
                         (Decimal('40.00'), Decimal('50.00'), Decimal('42.00'), 4.0))
        # pricing help: retail, and the shelf price and the sold price as a percent of retail
        Item.objects.filter(product=self.blender).update(retail=Decimal('100.00'))
        top = s.search('ninja blender')['results'][0]
        self.assertEqual((top['retail'], top['price_pct_of_retail'], top['sold_pct_of_retail']), (Decimal('100.00'), 45, 42))
        self.assertEqual(s.search('ninja 1400w')['count'], 1)
        self.assertEqual(s.search('ninja toaster')['count'], 0)

    def test_a_column_sorts_every_match_both_ways_with_blanks_last(self):
        ids = lambda **kw: [x['product_id'] for x in s.search('ninja', include_sold=True, **kw)['results']]  # noqa: E731
        self.assertEqual(ids(sort='-on_shelf'), [self.blender.pk, self.boot.pk, self.sold_only.pk])
        self.assertEqual(ids(sort='price')[:2], [self.boot.pk, self.blender.pk])           # $5 before $40; none last
        self.assertEqual(ids(sort='-avg_sold')[:2], [self.blender.pk, self.sold_only.pk])   # $42 then $30; never sold last
        self.assertEqual(ids(sort='avg_sold')[:2], [self.sold_only.pk, self.blender.pk])
        # by the title shown: "Ninja Foodi Blender", "Ninja Professional Plus ..." (the standard's), "Silicone ..."
        self.assertEqual(ids(sort='title'), [self.sold_only.pk, self.blender.pk, self.boot.pk])
        self.assertEqual(s.search('ninja', sort='nonsense')['sort'], '')

    def test_sold_products_show_only_when_asked_and_merged_away_products_never(self):
        self.assertNotIn(self.sold_only.pk, [x['product_id'] for x in s.search('ninja')['results']])
        with_sold = [x['product_id'] for x in s.search('ninja', include_sold=True)['results']]
        self.assertIn(self.sold_only.pk, with_sold)
        self.assertNotIn(self.gone.pk, with_sold)
        self.assertEqual(with_sold[-1], self.sold_only.pk)   # on the shelf first

    def test_a_sku_goes_straight_to_its_product_and_a_misspelling_finds_the_closest(self):
        r = s.search('itmis001')
        self.assertEqual((r['results'][0]['product_id'], r['results'][0]['matched_sku']), (self.blender.pk, 'ITMIS001'))
        fuzzy = s.search('ninja professionl blendr')
        self.assertTrue(fuzzy['fuzzy'])
        self.assertEqual(fuzzy['results'][0]['product_id'], self.blender.pk)

    def test_items_of_a_product_come_shelf_first_and_the_api_is_staff_only(self):
        items = s.product_items(self.blender.pk)
        self.assertEqual((items['count'], [i['status'] for i in items['items']]), (3, ['on_shelf', 'on_shelf', 'sold']))
        self.assertEqual(s.product_items(self.blender.pk, include_sold=False)['count'], 2)
        client = APIClient()
        self.assertEqual(client.get('/api/inventory/search/?q=ninja').status_code, 401)
        user = User.objects.create_user(email='is@example.com', first_name='I', last_name='S', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        client.force_authenticate(user)
        body = client.get('/api/inventory/search/?q=ninja&sold=1').json()
        self.assertEqual((body.get('count'), body.get('fuzzy')), (3, False), body)
        self.assertEqual(client.get(f'/api/inventory/search/items/?product={self.blender.pk}&sold=1').json()['count'], 3)
        self.assertEqual(client.get('/api/inventory/search/items/').status_code, 400)
