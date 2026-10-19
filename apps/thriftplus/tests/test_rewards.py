"""Thrift+ Phase 2: the reward engine (the pure step, the nightly recompute, pacing by supply, the API)."""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.core.models import AppSetting, ApprovalRequest
from apps.core.services import approval_requests as ar
from apps.inventory.models import Item, Product
from apps.thriftplus.models import ItemReward, RewardEvent, RewardRun
from apps.thriftplus.services import rewards
from apps.thriftplus.services.rewards import Pace, Prior, Rules, Unit

D = Decimal
DAY = date(2026, 10, 21)
RULES = Rules(floor_share=D('0.10'))  # the default: a member pays at least 10% of the tag


def _unit(price='90.00', source='purchased', on_floor=DAY, item_id=1):
    return Unit(item_id=item_id, product_id=7, price=D(price), source=source, floor_date=on_floor)


def _prior(o: rewards.Outcome, on: date, **over) -> Prior:
    values = dict(floor_date=o.floor_date, starting_price=o.price, grow_days=o.grow_days, reward=o.reward,
                  status=o.status, reason=o.reason, day=o.day, computed_on=on, exit_on=o.exit_on, floor_price=o.floor_price)
    values.update(over)
    return Prior(**values)


def _walk(unit, days, pace=None, rules_=RULES, start=DAY):
    """Step one unit night by night from ``start``; return the outcome of each night."""
    prior, out = None, []
    for i in range(days):
        on = start + timedelta(days=i)
        o = rewards.step(unit, prior, on, pace, rules_, 'p7')
        out.append(o)
        prior = _prior(o, on)
    return out


class StepTests(SimpleTestCase):
    def test_days_1_to_7_wait_then_the_reward_grows_by_price_over_90(self):
        nights = _walk(_unit(), 10)
        self.assertEqual([o.reward for o in nights[:7]], [D('0')] * 7)
        self.assertEqual(nights[6].status, ItemReward.STATUS_WAITING)
        self.assertEqual((nights[7].day, nights[7].reward, nights[7].status), (8, D('1.00'), ItemReward.STATUS_CLIMBING))
        self.assertEqual(nights[9].reward, D('3.00'))
        self.assertEqual(nights[0].event['reason'], 'start')
        self.assertEqual(nights[7].event['reason'], 'one_unit')
        self.assertIsNone(nights[8].event)  # growth inside one status is not re-logged

    def test_the_reward_stops_at_the_floor_share_of_the_tag_and_cost_plays_no_part(self):
        self.assertEqual(rewards.floor_for(D('90'), D('0.10')), D('9.00'))
        self.assertEqual(rewards.floor_for(D('9.99'), D('0.10')), D('1.00'))  # rounds up: never under 10%
        self.assertEqual(rewards.floor_for(D('90'), D('0')), D('0.00'))  # a later setting may allow the whole tag
        nights = _walk(_unit(), 100)
        self.assertEqual(nights[-1].reward, D('81.00'))
        self.assertEqual(nights[-1].member_price, D('9.00'))
        self.assertEqual(nights[-1].status, ItemReward.STATUS_CAPPED)
        whole = _walk(_unit(), 100, rules_=Rules(floor_share=D('0')))[-1]
        self.assertEqual(whole.reward, D('90.00'))  # never more than the tag, so banked never beats spent

    def test_no_tag_price_and_consignment_get_nothing(self):
        self.assertEqual(_walk(_unit(price='0.00'), 20)[-1].status, ItemReward.STATUS_NO_ROOM)
        self.assertEqual(_walk(_unit(price='0.00'), 20)[-1].reward, D('0'))
        consigned = _walk(_unit(source='consignment'), 30)[-1]
        self.assertEqual((consigned.status, consigned.reward), (ItemReward.STATUS_EXCLUDED, D('0')))

    def test_ten_or_more_units_selling_fine_hold_and_over_supply_climb(self):
        # Rulebook P6 (owner 2026-10-19): days of supply = units ÷ ((sold + 1) ÷ window); 90 or less holds tonight.
        selling = Pace(units=10, sold_recent=13, window=14)  # 1 a day: 10 days of supply
        slow = Pace(units=10, sold_recent=0, window=14)  # 1 in 14 days: 140 days of supply
        start = _walk(_unit(), 12)[-1]  # day 12, 5 growth days
        prior = _prior(start, DAY + timedelta(days=11))
        held = rewards.step(_unit(), prior, DAY + timedelta(days=12), selling, RULES, 'p7')
        self.assertEqual((held.grow_days, held.reward, held.status), (5, start.reward, ItemReward.STATUS_PAUSED))
        self.assertEqual(held.event['reason'], 'selling_fine')
        self.assertEqual(held.event['detail']['pace']['days_of_supply'], 10)
        climbs = rewards.step(_unit(), prior, DAY + timedelta(days=12), slow, RULES, 'p7')
        self.assertEqual((climbs.grow_days, climbs.reason), (6, 'over_supply'))
        nine = rewards.step(_unit(), prior, DAY + timedelta(days=12), Pace(units=9, sold_recent=13, window=14), RULES, 'p7')
        self.assertEqual((nine.grow_days, nine.reason), (6, 'one_unit'))  # under 10 units: like a single
        self.assertTrue(Pace(units=90, sold_recent=89, window=90).on_pace)  # exactly 90 days of supply holds

    def test_a_unit_leaving_the_families_rule_grows_on_from_what_it_has(self):
        # A family unit's ThriftBucks came from the family's %, not its own growth days (owner 2026-10-19).
        start = _walk(_unit(), 20)[-1]  # day 20, 13 growth days: $13.00
        prior = _prior(start, DAY + timedelta(days=19), reward=D('30.00'), reason='family_on_target', grow_days=5)
        o = rewards.step(_unit(), prior, DAY + timedelta(days=20), None, RULES, 'p7')
        self.assertEqual((o.grow_days, o.reward, o.reason), (31, D('31.00'), 'one_unit'))  # $1 a day on $90

    def test_missed_nights_still_grow_and_only_tonight_holds(self):
        start = _walk(_unit(), 10)[-1]  # day 10, 3 growth days
        prior = _prior(start, DAY + timedelta(days=9))
        later = DAY + timedelta(days=12)  # day 13: three nights since
        self.assertEqual(rewards.step(_unit(), prior, later, None, RULES, 'p7').grow_days, 6)
        held = rewards.step(_unit(), prior, later, Pace(10, 13, 14), RULES, 'p7')
        self.assertEqual(held.grow_days, 5)

    def test_a_unit_scanned_but_not_added_climbs_alone(self):
        start = _walk(_unit(), 12)[-1]
        prior = _prior(start, DAY + timedelta(days=11), scans=10, adds=1)
        lagging = rewards.step(_unit(), prior, DAY + timedelta(days=12), Pace(10, 13, 14, scans=100, adds=50), RULES, 'p7')
        self.assertEqual((lagging.status, lagging.reason), (ItemReward.STATUS_CLIMBING, 'scans_lag'))

    def test_never_decreases_except_a_retag_below_the_cap(self):
        start = _walk(_unit(), 30)[-1]  # 23 growth days on $90: $23.00
        self.assertEqual(start.reward, D('23.00'))
        prior = _prior(start, DAY + timedelta(days=29))
        cheaper = rewards.step(_unit(price='20.00'), prior, DAY + timedelta(days=30), None, RULES, 'p7')
        self.assertEqual(cheaper.reward, D('18.00'))  # the new cap: 90% of $20
        self.assertEqual(cheaper.event['reason'], 'retag')
        self.assertEqual(cheaper.event['detail']['retag'], {'from': '90.00', 'to': '20.00', 'reward_before': '23.00'})
        dearer = rewards.step(_unit(price='120.00'), prior, DAY + timedelta(days=30), None, RULES, 'p7')
        self.assertGreaterEqual(dearer.reward, D('23.00'))

    def test_day_90_goes_on_the_exit_list_once(self):
        nights = _walk(_unit(price='900.00'), 92)
        self.assertIsNone(nights[88].exit_on)
        self.assertEqual(nights[89].exit_on, DAY + timedelta(days=89))
        self.assertEqual(nights[89].event['reason'], 'exit_list')
        self.assertIsNone(nights[90].event)

    def test_the_program_start_setting_moves_day_1(self):
        old = _unit(on_floor=DAY - timedelta(days=60))
        o = rewards.step(old, None, DAY + timedelta(days=2), None, Rules(floor_share=D('0.5'), start=DAY), 'p7')
        self.assertEqual((o.day, o.reward, o.status), (3, D('0'), ItemReward.STATUS_WAITING))
        catch_up = rewards.step(old, None, DAY + timedelta(days=2), None, RULES, 'p7')
        self.assertEqual((catch_up.day, catch_up.grow_days), (63, 56))


def _floor_item(product, sku, *, days_on_floor, price='40.00', cost='5.00', on=DAY, **extra):
    listed = timezone.make_aware(datetime.combine(on - timedelta(days=days_on_floor - 1), time(12)))
    return Item.objects.create(product=product, sku=sku, price=D(price), cost=D(cost), status='on_shelf',
                               listed_at=listed, **extra)


class RecomputeTests(TestCase):
    def setUp(self):
        self.lamp = Product.objects.create(title='Brass floor lamp')
        self.mugs = Product.objects.create(title='Stoneware mug')
        self.lamp_item = _floor_item(self.lamp, 'ITMRW0001', days_on_floor=20, price='90.00', cost='10.00')
        self.mug_items = [_floor_item(self.mugs, f'ITMRW01{i:02d}', days_on_floor=20, price='9.00', cost='1.00') for i in range(4)]

    def test_the_nightly_run_writes_states_once_per_day_and_logs_the_start(self):
        run = rewards.recompute(DAY)
        self.assertEqual(run.error, '')
        lamp = ItemReward.objects.get(item=self.lamp_item)
        self.assertEqual((lamp.day, lamp.grow_days, lamp.reward, lamp.status), (20, 13, D('13.00'), ItemReward.STATUS_CLIMBING))
        self.assertEqual(lamp.events.get().reason, 'start')
        self.assertEqual(run.counts['units'], 5)
        again = rewards.recompute(DAY)
        self.assertEqual(again.counts['computed'], 0)  # overnight only: a re-run changes nothing
        self.assertEqual(RewardEvent.objects.count(), 5)

    def test_under_ten_units_grow_like_singles(self):
        rewards.recompute(DAY)
        mug = ItemReward.objects.get(item=self.mug_items[0])
        self.assertEqual((mug.status, mug.reason, mug.grow_days, mug.family_key), (ItemReward.STATUS_CLIMBING, 'one_unit', 13, f'p{self.mugs.pk}'))

    def test_ten_or_more_units_pace_by_their_supply_and_a_restock_starts_its_own_clock(self):
        cups = Product.objects.create(title='Paper cups')
        for i in range(10):
            _floor_item(cups, f'ITMRWC{i:02d}', days_on_floor=20, price='4.00')
        p = rewards.plan(DAY)
        pace = p.paces[f'p{cups.pk}']
        self.assertEqual((pace.units, pace.sold_recent, pace.window, int(pace.days_of_supply)), (10, 0, 19, 190))
        self.assertEqual({o.reason for o in p.outcomes if o.product_id == cups.pk}, {'over_supply'})
        for i in range(9):  # 9 sold in the window: (9 + 1) ÷ 19 days, so 19 days of supply
            Item.objects.create(product=cups, sku=f'ITMRWS{i:02d}', price=D('4.00'), status='sold',
                                sold_at=timezone.make_aware(datetime.combine(DAY - timedelta(days=3), time(12))))
        rewards.recompute(DAY)
        self.assertEqual(set(ItemReward.objects.filter(item__product=cups).values_list('reason', flat=True)), {'selling_fine'})
        new = _floor_item(cups, 'ITMRWC99', days_on_floor=1, price='4.00', on=DAY + timedelta(days=1))
        rewards.recompute(DAY + timedelta(days=1))
        state = ItemReward.objects.get(item=new)
        self.assertEqual((state.day, state.reward, state.status), (1, D('0'), ItemReward.STATUS_WAITING))

    def test_items_that_leave_the_floor_close_with_their_reward(self):
        rewards.recompute(DAY)
        self.lamp_item.status = 'sold'
        self.lamp_item.sold_at = timezone.now()
        self.lamp_item.save()
        run = rewards.recompute(DAY + timedelta(days=1))
        state = ItemReward.objects.get(item=self.lamp_item)
        self.assertEqual((state.status, state.closed_status, state.reward_at_close), (ItemReward.STATUS_CLOSED, 'sold', D('13.00')))
        self.assertEqual(run.counts['closed'], 1)
        self.assertEqual(state.events.first().reason, 'closed')

    def test_the_dry_run_writes_nothing_and_summarizes(self):
        report = rewards.summarize(rewards.plan(DAY))
        self.assertEqual(ItemReward.objects.count(), 0)
        self.assertEqual(report['totals']['units'], 5)
        self.assertEqual(report['top'][0]['sku'], 'ITMRW0001')
        self.assertEqual(report['top'][0]['member_price'], '77.00')
        self.assertEqual([b['units'] for b in report['bands']], [4, 0, 1, 0])

    def test_the_register_honours_a_retag_at_once(self):
        rewards.recompute(DAY)
        self.lamp_item.price = D('10.00')
        self.lamp_item.save()
        self.assertEqual(rewards.member_price(self.lamp_item), (D('9.00'), D('1.00')))  # 10% of the new tag

    def test_bad_settings_fall_back_to_the_defaults(self):
        AppSetting.objects.update_or_create(key=rewards.FLOOR_SHARE_KEY, defaults={'value': 'lots'})
        AppSetting.objects.update_or_create(key=rewards.START_KEY, defaults={'value': '2026-10-20'})
        r = rewards.rules()
        self.assertEqual((r.floor_share, r.start), (D('0.10'), date(2026, 10, 20)))


class RewardsApiTests(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        lamp = Product.objects.create(title='Brass floor lamp')
        today = timezone.localdate()
        self.item = _floor_item(lamp, 'ITMRWAPI1', days_on_floor=20, price='90.00', cost='10.00', on=today)

    def test_managers_only(self):
        staff = User.objects.create_user('staff@example.com', 'S', 'T', password='x-pass-123')
        staff.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.get('/api/thriftplus/rewards/preview/').status_code, 403)

    def test_preview_item_and_runs(self):
        self.client.force_authenticate(self.boss)
        data = self.client.get('/api/thriftplus/rewards/preview/').data
        self.assertEqual((data['totals']['units'], data['switch_on'], data['last_run']), (1, False, None))
        self.assertEqual(self.client.get('/api/thriftplus/rewards/preview/', {'day': 'soon'}).status_code, 400)
        rewards.recompute()
        detail = self.client.get('/api/thriftplus/rewards/item/', {'sku': 'itmrwapi1'}).data
        self.assertEqual(detail['state']['status'], ItemReward.STATUS_CLIMBING)
        self.assertEqual(detail['events'][0]['reason'], 'start')
        self.assertEqual(self.client.get('/api/thriftplus/rewards/item/', {'sku': 'nope'}).status_code, 404)
        self.assertEqual(len(self.client.get('/api/thriftplus/rewards/runs/').data), 1)


class ResetRequestTests(TestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        lamp = Product.objects.create(title='Brass floor lamp')
        _floor_item(lamp, 'ITMRWRST1', days_on_floor=20, on=timezone.localdate())
        rewards.recompute()

    def _run(self):
        req = ar.stage('thriftplus.reset_rewards', title='Reset rewards')
        ar.approve(req, self.boss, start=False)
        return req, ar.run(req.pk)

    def test_reset_clears_states_and_logs_while_dark(self):
        req, done = self._run()
        self.assertEqual(req.preview['counts']['Reward states'], 1)
        self.assertEqual(done.status, ApprovalRequest.STATUS_APPLIED)
        self.assertEqual((ItemReward.objects.count(), RewardEvent.objects.count(), RewardRun.objects.count()), (0, 0, 1))

    def test_reset_refuses_once_the_switch_is_on(self):
        AppSetting.objects.update_or_create(key='thrift_plus_enabled', defaults={'value': True})
        req, done = self._run()
        self.assertIn('switch is ON', req.preview['changes'][0])
        self.assertEqual(done.status, ApprovalRequest.STATUS_FAILED)
        self.assertEqual(ItemReward.objects.count(), 1)


LAUNCH = date(2026, 10, 20)
OWNER_SETTING = {'pct_per_day': '0.75', 'wait_days': 7, 'launch': LAUNCH.isoformat(), 'age_factor': '0.30', 'max_age': 45,
                 'floor_share': '0.05'}


class SavedSettingTests(TestCase):
    """Owner 2026-10-13: 0.75% of the tag a day; stock already on the floor at 30% of its age, at most 45 days."""

    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')

    def test_unsaved_the_engine_runs_as_before(self):
        r = rewards.rules()
        self.assertFalse(r.saved)
        self.assertEqual(r.grown(D('90.00'), 9), D('9.00'))  # the tag ÷ 90 a day

    def test_the_saved_setting_drives_the_rate_and_the_launch_start(self):
        rewards.save_engine(OWNER_SETTING, user=self.boss)
        r = rewards.rules()
        self.assertTrue(r.saved)
        self.assertEqual((r.pct, r.wait_days, r.launch, r.age_factor, r.max_age, r.floor_share),
                         (D('0.75'), 7, LAUNCH, D('0.30'), 45, D('0.05')))
        self.assertEqual(r.first_day(LAUNCH - timedelta(days=99)), LAUNCH - timedelta(days=29))   # 100 days old: 30
        self.assertEqual(r.first_day(LAUNCH - timedelta(days=199)), LAUNCH - timedelta(days=44))  # 60, capped at 45
        self.assertEqual(r.first_day(LAUNCH - timedelta(days=2)), LAUNCH)                           # 3 days: 1
        self.assertEqual(r.first_day(LAUNCH + timedelta(days=3)), LAUNCH + timedelta(days=3))       # after launch: its own
        old = Unit(item_id=1, product_id=7, price=D('100.00'), source='purchased', floor_date=LAUNCH - timedelta(days=199))
        o = rewards.step(old, None, LAUNCH, None, r, 'p7')
        self.assertEqual((o.day, o.grow_days, o.reward), (45, 38, D('28.50')))  # 38 days × 0.75% of $100
        later = rewards.step(old, _prior(o, LAUNCH), LAUNCH + timedelta(days=4), None, r, 'p7')
        self.assertEqual(later.reward, D('31.50'))

    def test_before_launch_the_runs_compute_launch_day(self):
        rewards.save_engine(OWNER_SETTING, user=self.boss)
        with patch('django.utils.timezone.localdate', return_value=date(2026, 10, 13)):
            self.assertEqual(rewards.default_day(rewards.rules()), LAUNCH)
        with patch('django.utils.timezone.localdate', return_value=date(2026, 10, 25)):
            self.assertEqual(rewards.default_day(rewards.rules()), date(2026, 10, 25))

    def test_bad_values_are_refused(self):
        with self.assertRaises(ValueError):
            rewards.save_engine({**OWNER_SETTING, 'pct_per_day': '50'}, user=self.boss)
        with self.assertRaises(ValueError):
            rewards.save_engine({**OWNER_SETTING, 'launch': 'soon'}, user=self.boss)


class SaveFromCalculatorTests(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')
        lamp = Product.objects.create(title='Brass floor lamp')
        self.item = _floor_item(lamp, 'ITMRWSAV1', days_on_floor=200, price='100.00', on=LAUNCH)

    def test_the_owner_saves_and_launch_day_is_rebuilt(self):
        self.client.force_authenticate(self.boss)
        with patch('apps.core.services.approval_requests.start_thread') as started, self.captureOnCommitCallbacks(execute=True):
            r = self.client.post('/api/thriftplus/rewards/engine/', OWNER_SETTING, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['saved']['pct_per_day'], '0.75')
        req = ApprovalRequest.objects.get(pk=r.data['rebuild']['id'])
        self.assertEqual((req.kind, req.status), ('thriftplus.rebuild_rewards', ApprovalRequest.STATUS_APPROVED))
        started.assert_called_once_with(req.pk)
        done = ar.run(req.pk)
        self.assertEqual(done.status, ApprovalRequest.STATUS_APPLIED, done.log)
        state = ItemReward.objects.get(item=self.item)
        self.assertEqual((state.computed_on, state.day, state.reward), (LAUNCH, 45, D('28.50')))
        got = self.client.get('/api/thriftplus/rewards/engine/').data
        self.assertEqual((got['saved']['max_age'], got['live']['launch']), (45, LAUNCH.isoformat()))

    def test_only_the_owner_saves(self):
        manager = User.objects.create_user('mgr@example.com', 'M', 'G', password='x-pass-123')
        manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(manager)
        r = self.client.post('/api/thriftplus/rewards/engine/', OWNER_SETTING, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertIsNone(rewards.saved_engine())

    def test_with_the_switch_on_it_saves_without_a_rebuild(self):
        AppSetting.objects.update_or_create(key='thrift_plus_enabled', defaults={'value': True})
        self.client.force_authenticate(self.boss)
        r = self.client.post('/api/thriftplus/rewards/engine/', OWNER_SETTING, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNone(r.data['rebuild'])
        self.assertFalse(ApprovalRequest.objects.exists())
