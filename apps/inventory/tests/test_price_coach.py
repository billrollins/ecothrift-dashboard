"""Price coach (#89): the order of evidence, the under-5 rule, the days math, the "has sat" note, the switch."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from itertools import count
from unittest import mock

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.models import Item, Product, ProductProfile
from apps.inventory.services import price_coach as pc

NOW = timezone.now()
_sku = count(1)


def sold(product, price, days, *, ago=100, sold_for=None, start='checked_in_at'):
    """An item put out ``ago`` days back that sold ``days`` later."""
    put_out = NOW - timedelta(days=ago)
    return Item.objects.create(
        sku=f'PC{next(_sku):06d}', product=product, price=Decimal(str(price)), status='sold',
        sold_for=Decimal(str(price if sold_for is None else sold_for)), sold_at=put_out + timedelta(days=days),
        **{start: put_out},
    )


def shelf(product, price, days, *, status='on_shelf'):
    """An item still on the shelf, put out ``days`` ago."""
    return Item.objects.create(
        sku=f'PC{next(_sku):06d}', product=product, price=Decimal(str(price)), status=status,
        checked_in_at=NOW - timedelta(days=days),
    )


def answer(product, price=None):
    return pc.summarize(pc.gather(product.pk, now=NOW), price)


class EvidenceOrderTests(TestCase):
    def setUp(self):
        self.mug = Product.objects.create(title='Stoneware mug', brand='Hearth')
        self.cup = Product.objects.create(title='Stoneware cup', brand='Hearth')
        self.bowl = Product.objects.create(title='Stoneware bowl', brand='Hearth')
        for product in (self.mug, self.cup, self.bowl):
            ProductProfile.objects.update_or_create(
                product=product, defaults={'category': 'Kitchen & dining', 'brand': 'Hearth'},
            )

    def test_the_same_product_is_used_first_when_it_has_five(self):
        for _ in range(5):
            sold(self.mug, 12, 10)
        for _ in range(9):
            sold(self.cup, 40, 3)
        with mock.patch.object(pc, '_neighbour_ids', return_value=[self.cup.pk]) as near:
            out = answer(self.mug)
        near.assert_not_called()
        self.assertEqual((out['basis'], out['n'], out['enough']), ('product', 5, True))
        self.assertEqual(out['sold']['low'], 12.0)

    def test_similar_products_are_next_and_keep_the_products_own_items(self):
        for _ in range(2):
            sold(self.mug, 12, 10)
        for _ in range(4):
            sold(self.cup, 14, 20)
        for _ in range(9):
            sold(self.bowl, 99, 1)   # same category and brand, but not a neighbour: must not be reached
        with mock.patch.object(pc, '_neighbour_ids', return_value=[self.cup.pk]):
            out = answer(self.mug)
        self.assertEqual((out['basis'], out['n']), ('similar', 6))
        self.assertLess(out['sold']['high'], 20)

    def test_category_and_brand_is_last_and_says_what_it_used(self):
        sold(self.mug, 12, 10)
        for _ in range(3):
            sold(self.cup, 14, 20)
        for _ in range(3):
            sold(self.bowl, 16, 30)
        other = Product.objects.create(title='Steel pan', brand='Forge')
        ProductProfile.objects.update_or_create(product=other, defaults={'category': 'Kitchen & dining', 'brand': 'Forge'})
        for _ in range(8):
            sold(other, 80, 1)       # same category, another brand: left out
        with mock.patch.object(pc, '_neighbour_ids', return_value=[]):
            out = answer(self.mug)
        self.assertEqual((out['basis'], out['n']), ('category_brand', 7))
        self.assertEqual(out['label'], 'Hearth in Kitchen & dining')
        self.assertLess(out['sold']['high'], 20)

    def test_under_five_everywhere_is_not_enough(self):
        for _ in range(2):
            sold(self.mug, 12, 10)
        sold(self.cup, 14, 20)
        with mock.patch.object(pc, '_neighbour_ids', return_value=[self.cup.pk]):
            out = answer(self.mug)
        self.assertFalse(out['enough'])
        self.assertEqual((out['basis'], out['sold'], out['note'], out['items']), ('', None, None, []))
        self.assertEqual(out['n'], 2)

    def test_an_unknown_product_or_none_gives_nothing(self):
        self.assertIsNone(pc.gather(999_999_999))
        self.assertIsNone(pc.coach(None))


class ItemRulesTests(TestCase):
    def setUp(self):
        self.lamp = Product.objects.create(title='Desk lamp', brand='Glow')

    def test_scrapped_lost_returned_and_not_put_out_are_left_out(self):
        for _ in range(5):
            sold(self.lamp, 20, 7)
        for status in ('scrapped', 'lost', 'returned', 'intake', 'processing'):
            shelf(self.lamp, 500, 200, status=status)
        Item.objects.create(sku='PC-NODATE', product=self.lamp, price=Decimal('500'), status='on_shelf')
        Item.objects.create(sku='PC-FREE', product=self.lamp, price=Decimal('0'), status='on_shelf',
                            checked_in_at=NOW - timedelta(days=200))
        out = answer(self.lamp)
        self.assertEqual(out['n'], 5)
        self.assertEqual(out['on_shelf']['n'], 0)
        self.assertIsNone(out['sitting'])

    def test_a_tag_put_out_this_week_is_no_evidence_yet(self):
        for _ in range(5):
            sold(self.lamp, 20, 7)
        shelf(self.lamp, 60, pc.FRESH_DAYS - 1)
        shelf(self.lamp, 60, pc.FRESH_DAYS + 1)
        self.assertEqual(answer(self.lamp)['on_shelf']['n'], 1)

    def test_items_older_than_a_year_are_left_out(self):
        for _ in range(5):
            sold(self.lamp, 20, 7)
        sold(self.lamp, 300, 2, ago=pc.WINDOW_DAYS + 30)
        out = answer(self.lamp)
        self.assertEqual(out['n'], 5)
        self.assertEqual(out['sold']['high'], 20.0)

    def test_days_are_sold_minus_check_in_or_listed_when_check_in_is_empty(self):
        for days in (4, 10, 30):
            sold(self.lamp, 20, days)
        sold(self.lamp, 20, 14, start='listed_at')
        shelf(self.lamp, 20, 120)
        out = answer(self.lamp)
        days = sorted(row['days'] for row in out['items'] if row['sold'])
        self.assertEqual(days, [4, 10, 14, 30])
        self.assertEqual(out['sold']['median_days'], 12)      # the middle of 10 and 14
        self.assertEqual([row['days'] for row in out['items'] if not row['sold']], [120])

    def test_sold_range_is_the_middle_half_of_what_they_sold_for_not_the_tag(self):
        for tag, got in ((30, 10), (30, 12), (30, 13), (30, 15), (30, 40)):
            sold(self.lamp, tag, 5, sold_for=got)
        out = answer(self.lamp)
        self.assertEqual((out['sold']['n'], out['sold']['low'], out['sold']['high']), (5, 12.0, 15.0))

    def test_still_on_the_shelf_after_90_days_with_the_lowest_tag(self):
        for _ in range(5):
            sold(self.lamp, 12, 9)
        shelf(self.lamp, 25, 91)
        shelf(self.lamp, 40, 200)
        shelf(self.lamp, 18, 89)      # not 90 yet
        out = answer(self.lamp)
        self.assertEqual(out['sitting'], {'n': 2, 'min_price': 25.0, 'max_price': 40.0, 'days': 90})
        self.assertEqual(out['on_shelf'], {'n': 3, 'oldest_days': 200})
        # The list leads with what is sitting, longest first.
        self.assertEqual([row['days'] for row in out['items'][:3]], [200, 91, 89])


class SatNoteTests(TestCase):
    def setUp(self):
        self.vase = Product.objects.create(title='Glass vase', brand='Clear')
        for _ in range(6):
            sold(self.vase, 12, 8)

    def test_note_when_most_at_that_price_and_up_have_sat(self):
        shelf(self.vase, 25, 70)
        shelf(self.vase, 30, 120)
        sold(self.vase, 28, 5)
        out = answer(self.vase, '25')
        self.assertEqual(out['note'], {'price': 25.0, 'n': 3, 'unsold': 2, 'days': 60})

    def test_no_note_below_the_range_that_sat(self):
        shelf(self.vase, 25, 70)
        shelf(self.vase, 30, 120)
        self.assertIsNone(answer(self.vase, '12')['note'])   # 6 sold at $12 outweigh the 2 sitting

    def test_no_note_when_half_or_more_sold(self):
        shelf(self.vase, 25, 70)
        sold(self.vase, 25, 5)
        sold(self.vase, 26, 5)
        self.assertIsNone(answer(self.vase, '25')['note'])

    def test_no_note_on_fewer_than_three_items_or_without_a_price(self):
        shelf(self.vase, 25, 70)
        shelf(self.vase, 30, 120)
        self.assertIsNone(answer(self.vase, '26')['note'])   # only the $30 one is at $26 and up
        self.assertIsNone(answer(self.vase, '')['note'])
        self.assertIsNone(answer(self.vase, 'abc')['note'])

    def test_an_unsold_item_under_60_days_is_not_judged(self):
        for _ in range(3):
            shelf(self.vase, 25, 59)
        self.assertIsNone(answer(self.vase, '25')['note'])


class ApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(email='proc@example.com', first_name='Pro', last_name='Cessor', password='pw')
        self.user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.pot = Product.objects.create(title='Clay pot', brand='Terra')
        for _ in range(5):
            sold(self.pot, 9, 6)

    def get(self, **params):
        return self.client.get('/api/inventory/price-coach/', params)

    def test_on_by_default_and_the_switch_row_is_made_for_settings(self):
        res = self.get(product=self.pot.pk, price='9')
        self.assertEqual(res.status_code, 200, res.data)
        self.assertTrue(res.data['enabled'])
        self.assertEqual((res.data['coach']['basis'], res.data['coach']['n']), ('product', 5))
        self.assertIs(AppSetting.objects.get(key=pc.SWITCH_KEY).value, True)

    def test_the_switch_turns_it_off(self):
        AppSetting.objects.update_or_create(key=pc.SWITCH_KEY, defaults={'value': False})
        res = self.get(product=self.pot.pk)
        self.assertEqual(res.data, {'enabled': False, 'coach': None})

    def test_no_product_is_no_coach_and_staff_only(self):
        self.assertIsNone(self.get().data['coach'])
        self.assertIsNone(self.get(product='abc').data['coach'])
        self.assertEqual(APIClient().get('/api/inventory/price-coach/').status_code, 401)

    def test_the_evidence_is_cached_per_product_and_the_note_follows_the_price(self):
        shelf(self.pot, 30, 100)
        shelf(self.pot, 30, 100)
        shelf(self.pot, 30, 100)
        with mock.patch.object(pc, 'gather', wraps=pc.gather) as gather:
            first = self.get(product=self.pot.pk, price='30').data['coach']
            second = self.get(product=self.pot.pk, price='9').data['coach']
        self.assertEqual(gather.call_count, 1)
        self.assertIsNotNone(first['note'])
        self.assertIsNone(second['note'])
