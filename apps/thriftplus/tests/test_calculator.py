"""The rewards calculator (owner, 2026-10-07): the defaults are the live engine; each input does what it says."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import Item, Product
from apps.thriftplus.services import calculator as calc
from apps.thriftplus.services import floor_plan

LAUNCH = date(2026, 10, 20)


def row(price, age, *, product_id=1, brand='', category='Toys', retail=None):
    return calc.Row(price=price, retail=retail, source='purchased', floor_date=LAUNCH - timedelta(days=age - 1),
                    product_id=product_id, category=category, brand=brand)


class MathTests(TestCase):
    def test_defaults_match_the_live_engine_to_the_cent(self):
        p = calc.Params(launch=LAUNCH)
        sc = floor_plan.Scenario(launch=LAUNCH)
        for price in (3.99, 10.0, 49.5, 250.0):
            for age in (1, 7, 8, 9, 30, 60, 90, 200):
                for offset in (0, 10, 45):
                    mine = calc._reward(row(price, age), 1.0, calc.Params(launch=LAUNCH, offset=offset), offset)
                    sc = floor_plan.Scenario(launch=LAUNCH, offset=offset)
                    live = floor_plan.reward_for(Decimal(str(price)), age + offset, sc)
                    self.assertAlmostEqual(mine, float(live), delta=0.011, msg=(price, age, offset))
        self.assertEqual(p.start_equivalent(), None)

    def test_shotgun_max_age_and_starting_cap(self):
        old = row(100.0, 200)
        self.assertEqual(calc._reward(old, 1, calc.Params(launch=LAUNCH), 0), 90.0)          # at the floor
        capped = calc._reward(old, 1, calc.Params(launch=LAUNCH, max_age=30), 0)
        self.assertAlmostEqual(capped, 100 * 23 / 90, delta=0.011)                         # day 30: 23 growth days
        self.assertEqual(calc.Params(launch=LAUNCH, max_age=30).start_equivalent(), '2026-09-21')
        start = calc._reward(old, 1, calc.Params(launch=LAUNCH, max_start_pct=25), 0)
        self.assertAlmostEqual(start, 25.0, delta=0.011)
        later = calc._reward(old, 1, calc.Params(launch=LAUNCH, max_start_pct=25), 9)
        self.assertAlmostEqual(later, 25 + 10.0, delta=0.02)                               # +9 days at 1.11%
        half_age = calc._reward(old, 1, calc.Params(launch=LAUNCH, age_factor=0.1), 0)    # counts as 20 days old
        self.assertAlmostEqual(half_age, 100 * 13 / 90, delta=0.011)

    def test_weekly_steps_and_curves_share_the_end(self):
        r = row(90.0, 1)
        weekly = calc.Params(launch=LAUNCH, step_days=7)
        # A new item is day 1 at launch, so launch + k is day k + 1: growth days = k + 1 - 7.
        self.assertEqual(calc._reward(r, 1, weekly, 12), 0.0)                              # 6 growth days: no step yet
        self.assertAlmostEqual(calc._reward(r, 1, weekly, 13), 7.0, delta=0.011)
        for curve in calc.CURVES:
            end = calc._reward(r, 1, calc.Params(launch=LAUNCH, curve=curve), 6 + 81)
            self.assertAlmostEqual(end, 81.0, delta=0.011, msg=curve)                      # the floor: 10% of $90
        mid = {c: calc._reward(r, 1, calc.Params(launch=LAUNCH, curve=c), 6 + 40) for c in calc.CURVES}
        self.assertLess(mid['slow_start'], mid['linear'])
        self.assertGreater(mid['fast_start'], mid['linear'])

    def test_more_of_the_same_and_similar_grow_slower(self):
        rows = [row(10.0, 30, product_id=1, brand='lego'), row(10.0, 30, product_id=1, brand='lego'),
                row(10.0, 30, product_id=2, brand='lego'), row(10.0, 30, product_id=3)]
        m = calc._multipliers(rows, calc.Params(launch=LAUNCH, same_slowdown=10, similar_slowdown=5, count_back_stock=False))
        self.assertEqual([round(x, 2) for x in m], [0.85, 0.85, 0.9, 1.0])
        capped = calc._multipliers(rows, calc.Params(launch=LAUNCH, same_slowdown=90, max_slowdown=50, count_back_stock=False))
        self.assertEqual(round(capped[0], 2), 0.5)


class EndpointTests(TestCase):
    def setUp(self):
        calc._cache.clear()
        for i, (price, retail, days) in enumerate([('10.00', '30.00', 3), ('40.00', '100.00', 120), ('5.00', None, 50)]):
            it = Item.objects.create(sku=f'ITM00009{i}0', product=Product.objects.create(title=f'P{i}'), price=price,
                                     retail=retail, status='on_shelf')
            Item.objects.filter(pk=it.pk).update(listed_at=f'{(date(2026, 10, 7) - timedelta(days=days)).isoformat()}T12:00:00Z')
        self.mgr = User.objects.create_user(email='m@example.com', first_name='Mo', last_name='M', password='Shelf-life-42')
        self.mgr.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.emp = User.objects.create_user(email='e@example.com', first_name='Em', last_name='E', password='Shelf-life-42')
        self.emp.groups.add(Group.objects.get_or_create(name='Employee')[0])

    def get(self, user, **q):
        c = APIClient()
        c.force_authenticate(user)
        return c.get('/api/thriftplus/rewards/calculator/', {'population': 'shelf', 'launch': '2026-10-07', **q})

    def test_guests_and_members_and_who_may_see(self):
        self.assertEqual(self.get(self.emp).status_code, 403)
        res = self.get(self.mgr)
        self.assertEqual(res.status_code, 200, res.data)
        t = res.data['totals']
        self.assertEqual((t['items'], t['with_retail'], t['retail_total']), (3, 2, 130.0))
        self.assertEqual((t['guest']['total'], t['guest']['pct_of_retail']), (55.0, 38.5))
        self.assertLess(t['member']['total'], t['guest']['total'])                         # the old ones have rewards
        self.assertEqual(len(res.data['timeline']), len(calc.TIMELINE))
        capped = self.get(self.mgr, max_age=1).data['totals']
        self.assertEqual(capped['member']['total'], 55.0)                                  # everyone starts on day 1

    def test_bad_inputs_are_refused(self):
        self.assertEqual(self.get(self.mgr, curve='zigzag').status_code, 400)
        self.assertEqual(self.get(self.mgr, floor_share='2').status_code, 400)
        self.assertEqual(self.get(self.mgr, pct_per_day='abc').status_code, 400)
