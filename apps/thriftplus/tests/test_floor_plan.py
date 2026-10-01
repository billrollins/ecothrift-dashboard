"""The floor-stock planner: it must agree with the reward engine, and change nothing."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import Category, Item, Product
from apps.thriftplus.models import ItemReward
from apps.thriftplus.services import floor_plan, rewards
from apps.thriftplus.services.rewards import Prior, Rules, Unit

D = Decimal
LAUNCH = date(2026, 10, 20)


def _engine_rewards(price: str, floor_date: date, share: str, start: date | None, nights: int, first_night: date) -> list[Decimal]:
    """The real engine, night by night from ``first_night`` (no pacing)."""
    rules_ = Rules(floor_share=D(share), start=start)
    unit = Unit(item_id=1, product_id=1, price=D(price), source='purchased', floor_date=floor_date)
    prior, out = None, []
    for i in range(nights):
        on = first_night + timedelta(days=i)
        o = rewards.step(unit, prior, on, None, rules_, 'p1')
        out.append(o.reward)
        prior = Prior(floor_date=o.floor_date, starting_price=o.price, grow_days=o.grow_days, reward=o.reward, status=o.status,
                      reason=o.reason, day=o.day, computed_on=on, exit_on=o.exit_on, floor_price=o.floor_price)
    return out


class AgreesWithTheEngineTests(SimpleTestCase):
    def test_the_closed_form_matches_the_engine_every_night(self):
        for price in ('1.00', '9.99', '90.00', '249.95'):
            for share in ('0.10', '0', '0.50'):
                floor_date = LAUNCH - timedelta(days=5)
                nights = _engine_rewards(price, floor_date, share, None, 100, LAUNCH)
                for i, expected in enumerate(nights):
                    sc = floor_plan.Scenario(launch=LAUNCH, offset=i, floor_share=D(share))
                    day = floor_plan._day_on(floor_date, sc)
                    self.assertEqual(floor_plan.reward_for(D(price), day, sc), expected, (price, share, i))

    def test_max_age_is_the_same_as_setting_the_program_start(self):
        old = LAUNCH - timedelta(days=200)
        for cap in (1, 30, 60):
            start = LAUNCH - timedelta(days=cap - 1)
            nights = _engine_rewards('120.00', old, '0.10', start, 100, LAUNCH)
            for i in (0, 10, 25, 70):
                sc = floor_plan.Scenario(launch=LAUNCH, offset=i, max_age=cap)
                self.assertEqual(floor_plan.reward_for(D('120.00'), floor_plan._day_on(old, sc), sc), nights[i], (cap, i))
            self.assertEqual(floor_plan.Scenario(launch=LAUNCH, max_age=cap).start_equivalent(), start)

    def test_a_younger_item_keeps_its_own_age_under_a_cap(self):
        young = LAUNCH - timedelta(days=3)
        sc = floor_plan.Scenario(launch=LAUNCH, max_age=30)
        self.assertEqual(floor_plan._day_on(young, sc), 4)


class SimulateTests(TestCase):
    def setUp(self):
        floor_plan.clear_cache()
        self.addCleanup(floor_plan.clear_cache)
        cat = Category.objects.create(name='Toys')
        self.cat = cat

    def _item(self, sku, price, retail, days_old, source='purchased', status='on_shelf', category=None):
        product = Product.objects.create(title=f'Thing {sku}', category=category or self.cat)
        listed = timezone.make_aware(datetime.combine(LAUNCH - timedelta(days=days_old - 1), time(12, 0)))
        return Item.objects.create(sku=sku, product=product, price=D(price), retail=D(retail) if retail is not None else None,
                                   status=status, source=source, listed_at=listed)

    def test_totals_and_what_is_left_out(self):
        self._item('ITMFP0001', '100.00', '300.00', days_old=50)     # day 50 on launch day
        self._item('ITMFP0002', '20.00', None, days_old=3)             # day 3: nothing yet
        self._item('ITMFP0003', '40.00', '80.00', days_old=10, source='consignment')
        self._item('ITMFP0004', '50.00', '90.00', days_old=10, status='sold')
        self._item('ITMFP0005', '0.00', '5.00', days_old=40)           # no tag price
        out = floor_plan.simulate(floor_plan.Scenario(launch=LAUNCH))
        t = out['totals']
        self.assertEqual((t['units'], t['consignment_excluded'], t['no_price'], t['retail_missing']), (3, 1, 1, 1))
        # day 50: 43 growth days -> 100 * 43 / 90 = 47.77
        self.assertEqual(t['reward_total'], '47.77')
        self.assertEqual(t['tag_total'], '120.00')
        self.assertEqual(t['member_total'], '72.23')
        self.assertEqual(t['retail_total'], '305.00')
        self.assertEqual(t['with_reward'], 1)

    def test_a_cap_changes_old_stock_and_the_later_days_grow_on_from_it(self):
        self._item('ITMFP0010', '90.00', '200.00', days_old=120)
        real = floor_plan.simulate(floor_plan.Scenario(launch=LAUNCH))['totals']
        self.assertEqual(real['reward_total'], '81.00')                # capped at the 10% floor
        self.assertEqual(real['at_floor'], 1)
        fresh = floor_plan.simulate(floor_plan.Scenario(launch=LAUNCH, max_age=1))['totals']
        self.assertEqual(fresh['reward_total'], '0.00')
        later = floor_plan.simulate(floor_plan.Scenario(launch=LAUNCH, max_age=1, offset=38))['totals']
        self.assertEqual(later['reward_total'], '32.00')               # day 39: 32 growth days -> 90 * 32 / 90
        self.assertEqual(later['at_floor'], 0)

    def test_compare_lists_each_option_at_each_look(self):
        self._item('ITMFP0020', '60.00', '120.00', days_old=100)
        table = floor_plan.compare(floor_plan.Scenario(launch=LAUNCH))
        self.assertEqual([r['label'] for r in table['rows']][:2], ['Real age', 'Everyone starts fresh on launch day'])
        self.assertEqual(table['offsets'], [0, 14, 30, 60])
        real_now = table['rows'][0]['cells'][0]
        fresh_now = table['rows'][1]['cells'][0]
        self.assertGreater(Decimal(real_now['reward_total']), Decimal(fresh_now['reward_total']))

    def test_it_writes_nothing(self):
        self._item('ITMFP0030', '80.00', '160.00', days_old=40)
        floor_plan.simulate(floor_plan.Scenario(launch=LAUNCH))
        self.assertEqual(ItemReward.objects.count(), 0)


class FloorPlanApiTests(TestCase):
    def setUp(self):
        floor_plan.clear_cache()
        self.addCleanup(floor_plan.clear_cache)
        self.mgr = self._user('mgr-fp@example.com', 'Manager')
        self.emp = self._user('emp-fp@example.com', 'Employee')
        product = Product.objects.create(title='Lamp')
        Item.objects.create(sku='ITMFP0100', product=product, price=D('30.00'), retail=D('60.00'), status='on_shelf',
                            listed_at=timezone.now() - timedelta(days=60))

    @staticmethod
    def _user(email, role):
        u = User.objects.create_user(email=email, first_name='T', last_name=role, password='test-pass-123')
        u.groups.add(Group.objects.get_or_create(name=role)[0])
        return u

    def _get(self, user, path):
        c = APIClient()
        c.force_authenticate(user)
        return c.get(path)

    def test_a_manager_gets_the_plan_and_an_employee_does_not(self):
        r = self._get(self.mgr, '/api/thriftplus/rewards/floor-plan/?launch=2026-10-20&max_age=30&floor_share=0.2')
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body['scenario']['start_equivalent'], '2026-09-21')
        self.assertEqual(body['totals']['units'], 1)
        self.assertEqual(body['current_settings']['switch_on'], False)
        self.assertEqual(self._get(self.emp, '/api/thriftplus/rewards/floor-plan/').status_code, 403)

    def test_bad_choices_are_refused_plainly(self):
        for q in ('max_age=0', 'floor_share=2', 'offset=-1', 'launch=nope', 'wait_days=x', 'horizon=5'):
            r = self._get(self.mgr, f'/api/thriftplus/rewards/floor-plan/?{q}')
            self.assertEqual(r.status_code, 400, q)
            self.assertIn('detail', r.json())

    def test_compare_returns_the_table(self):
        r = self._get(self.mgr, '/api/thriftplus/rewards/floor-plan/compare/?launch=2026-10-20')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.json()['rows']), 4)
