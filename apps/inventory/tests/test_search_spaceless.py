"""Search ignores spaces (owner, 2026-10-26): "barstool" finds "Bar Stool", in Inventory search and Add item's find."""
from decimal import Decimal

from django.test import TestCase

from apps.inventory.models import Category, Item, Product
from apps.inventory.services import add_item
from apps.inventory.services import inventory_search as s


class SpacelessSearchTests(TestCase):
    def setUp(self):
        cat = Category.objects.get_or_create(name='Furniture', defaults={'slug': 'furniture-sp'})[0]
        with self.captureOnCommitCallbacks(execute=True):
            self.bar_stool = Product.objects.create(title='Swivel Bar Stool 30in', brand='Linon', category=cat)
            self.barstool = Product.objects.create(title='Barstool Cushion Cover', brand='Generic', category=cat)
            self.lamp = Product.objects.create(title='Floor Lamp', brand='Linon', category=cat)
        for n, p in enumerate((self.bar_stool, self.barstool, self.lamp)):
            Item.objects.create(product=p, sku=f'ITMSP00{n}', price=Decimal('20.00'), status='on_shelf')

    def ids(self, q):
        return {x['product_id'] for x in s.search(q)['results']}

    def test_a_word_matches_across_spaces(self):
        self.assertEqual(self.ids('barstool'), {self.bar_stool.pk, self.barstool.pk})
        self.assertEqual(self.ids('swivel barstool'), {self.bar_stool.pk})

    def test_everything_found_before_is_still_found(self):
        self.assertEqual(self.ids('bar stool'), {self.bar_stool.pk, self.barstool.pk})
        self.assertEqual(self.ids('linon'), {self.bar_stool.pk, self.lamp.pk})
        self.assertEqual(self.ids('stool lamp'), set())

    def test_where_the_word_sits_still_orders_the_rows(self):
        # "barstool" starts the second product's line; the first holds it after "swivel ".
        self.assertEqual([x['product_id'] for x in s.search('barstool')['results']], [self.barstool.pk, self.bar_stool.pk])

    def test_add_item_find_uses_the_same_matcher(self):
        found = {x['product_id'] for x in add_item.find('barstool')['results']}
        self.assertEqual(found, {self.bar_stool.pk, self.barstool.pk})
