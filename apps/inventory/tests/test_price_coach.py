"""Price coach (#89): the order of evidence, the under-5 rule, the days math, the near-price count, the grouped list, the switch."""
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
        # The product's own 2 are said apart; the wider line counts the other 4, so 2 + 4 is the 6 under it.
        self.assertEqual((out['own']['sold']['n'], out['sold']['n']), (2, 4))

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
        self.assertEqual((out['basis'], out['sold'], out['near'], out['sold_groups'], out['shelf_groups']), ('', None, None, [], []))
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
        self.assertEqual(out['on_shelf']['sitting'], 0)

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
        # The four sales are one row in the list (same product, same price): 4 to 30 days, the middle 12.
        self.assertEqual([(g['n'], g['min_days'], g['max_days'], g['median_days']) for g in out['sold_groups']],
                         [(4, 4, 30, 12)])
        self.assertEqual(out['sold']['median_days'], 12)      # the middle of 10 and 14
        self.assertEqual([g['max_days'] for g in out['shelf_groups']], [120])

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
        # Everything on the shelf is counted, with how many of them have sat 90 days.
        self.assertEqual(out['on_shelf'], {'n': 3, 'oldest_days': 200, 'min_price': 18.0, 'max_price': 40.0,
                                           'sitting': 2, 'sitting_days': 90, 'this_truck': 0})
        self.assertEqual(out['sold']['n'] + out['on_shelf']['n'], out['n'])


class NearPriceTests(TestCase):
    """What happened to this product's tags close to the typed price: a count, whichever way it points."""

    def setUp(self):
        self.game = Product.objects.create(title='Board game', brand='Play')
        for _ in range(8):
            sold(self.game, 6.29, 21)
        for _ in range(11):
            shelf(self.game, 6.29, 175)
        for _ in range(30):
            shelf(self.game, 9.74, 33)

    def test_it_speaks_at_the_price_the_shelf_is_full_of(self):
        out = answer(self.game, '9.74')
        self.assertEqual({k: out['near'][k] for k in ('price', 'n', 'sold', 'on_shelf', 'scope')},
                         {'price': 9.74, 'n': 30, 'sold': 0, 'on_shelf': 30, 'scope': 'product'})

    def test_it_counts_sales_too_so_it_is_not_a_warning(self):
        out = answer(self.game, '6.29')
        self.assertEqual((out['near']['sold'], out['near']['on_shelf']), (8, 11))

    def test_at_a_price_nothing_was_tagged_near_it_says_none(self):
        """The first version said "$3 and up have mostly sat" for a game nobody ever tagged $3; now it says 0."""
        self.assertEqual(answer(self.game, '3')['near']['n'], 0)
        self.assertEqual(answer(self.game, '25')['near']['n'], 0)

    def test_it_needs_a_price(self):
        self.assertIsNone(answer(self.game, '')['near'])
        self.assertIsNone(answer(self.game, 'abc')['near'])

    def test_close_means_within_fifteen_percent(self):
        near = answer(self.game, '7')['near']
        self.assertEqual((near['n'], near['low'], near['high']), (19, 5.95, 8.05))    # $6.29 is within 15% of $7
        self.assertEqual(answer(self.game, '7.50')['near']['n'], 0)                  # $6.29 and $9.74 are too far

    def test_the_shelf_says_how_many_are_from_this_truck(self):
        from apps.inventory.models import PurchaseOrder, Vendor

        vendor = Vendor.objects.create(name='Coach vendor', code='CV94')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='PC-94', ordered_date=NOW.date())
        Item.objects.filter(product=self.game, price=Decimal('9.74')).update(purchase_order=po)
        cache.clear()
        out = pc.summarize(pc.gather(self.game.pk, now=NOW), '9.74', po.pk)
        self.assertEqual((out['on_shelf']['n'], out['on_shelf']['this_truck']), (41, 30))
        self.assertEqual(pc.summarize(pc.gather(self.game.pk, now=NOW), '9.74')['on_shelf']['this_truck'], 0)


class GroupedListTests(TestCase):
    def setUp(self):
        self.game = Product.objects.create(title='Board game', brand='Play')
        for _ in range(8):
            sold(self.game, 6.29, 21)
        for _ in range(11):
            shelf(self.game, 6.29, 175)
        for _ in range(98):
            shelf(self.game, 9.74, 33)

    def test_equal_items_are_one_row_and_the_sales_are_always_there(self):
        out = answer(self.game)
        self.assertEqual([(g['price'], g['n'], g['median_days']) for g in out['sold_groups']], [(6.29, 8, 21)])
        self.assertEqual((out['sold']['min'], out['sold']['max']), (6.29, 6.29))
        self.assertEqual([(g['price'], g['n'], g['max_days']) for g in out['shelf_groups']], [(9.74, 98, 33), (6.29, 11, 175)])
        self.assertEqual(out['more'], {'sold': 0, 'on_shelf': 0})
        self.assertEqual(out['sold']['n'] + out['on_shelf']['n'], out['n'])

    def test_groups_past_the_limit_are_counted_not_dropped_silently(self):
        for cents in range(20):
            sold(self.game, f'20.{cents:02d}', 5)
        out = answer(self.game)
        self.assertEqual(len(out['sold_groups']), pc.GROUP_LIMIT)
        self.assertEqual(out['more']['sold'], 28 - sum(g['n'] for g in out['sold_groups']))


class OwnRecordTests(TestCase):
    """When the line rests on a wider group, this exact product's own few items are said apart."""

    def setUp(self):
        self.blaster = Product.objects.create(title='Gel blaster', brand='Hyper')
        self.pellets = Product.objects.create(title='Gel pellets', brand='Hyper')
        for product in (self.blaster, self.pellets):
            ProductProfile.objects.update_or_create(product=product, defaults={'category': 'Toys & games', 'brand': 'Hyper'})
        shelf(self.blaster, 32.49, 33)
        shelf(self.blaster, 32.49, 33)
        for _ in range(6):
            sold(self.pellets, 3.75, 10)

    def test_the_own_record_is_apart_and_its_rows_lead_the_list(self):
        out = answer(self.blaster, '32.49')
        self.assertEqual((out['basis'], out['n']), ('category_brand', 8))
        self.assertEqual(out['own']['n'], 2)
        self.assertIsNone(out['own']['sold'])
        self.assertEqual((out['sold']['n'], out['on_shelf']['n']), (6, 0))     # the others only
        self.assertEqual((out['own']['on_shelf']['n'], out['own']['on_shelf']['min_price']), (2, 32.49))
        self.assertTrue(out['shelf_groups'][0]['own'])
        self.assertFalse(out['sold_groups'][0]['own'])
        # The near count is this same product's only: its own 2 at $32.49, never the pellets that sold elsewhere.
        self.assertEqual((out['near']['scope'], out['near']['n'], out['near']['sold']), ('product', 2, 0))
        self.assertEqual(pc.summarize(pc.gather(self.blaster.pk, now=NOW), '3.75')['near']['n'], 0)

    def test_the_products_own_line_has_no_separate_record(self):
        for _ in range(5):
            sold(self.blaster, 30, 9)
        self.assertIsNone(answer(self.blaster)['own'])


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

    def test_the_evidence_is_cached_per_product_and_the_near_count_follows_the_price(self):
        shelf(self.pot, 30, 100)
        shelf(self.pot, 30, 100)
        shelf(self.pot, 30, 100)
        with mock.patch.object(pc, 'gather', wraps=pc.gather) as gather:
            first = self.get(product=self.pot.pk, price='30').data['coach']
            second = self.get(product=self.pot.pk, price='9').data['coach']
        self.assertEqual(gather.call_count, 1)
        self.assertEqual((first['near']['sold'], first['near']['on_shelf']), (0, 3))
        self.assertEqual((second['near']['sold'], second['near']['on_shelf']), (5, 0))
