"""Thrift+ Phase 2: the reward engine (the pure step, the nightly recompute, families, the API)."""
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
from apps.thriftplus.models import FamilyLink, ItemReward, RewardEvent, RewardFamily, RewardRun
from apps.thriftplus.services import families, rewards
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

    def test_a_family_on_pace_holds_and_behind_pace_climbs(self):
        on_pace = Pace(units=10, days_left=80, sold_recent=14, window=14)
        behind = Pace(units=10, days_left=80, sold_recent=0, window=14)
        start = _walk(_unit(), 12)[-1]  # day 12, 5 growth days
        prior = _prior(start, DAY + timedelta(days=11))
        held = rewards.step(_unit(), prior, DAY + timedelta(days=12), on_pace, RULES, 'p7')
        self.assertEqual((held.grow_days, held.reward, held.status), (5, start.reward, ItemReward.STATUS_PAUSED))
        self.assertEqual(held.event['reason'], 'family_on_pace')
        self.assertEqual(held.event['detail']['pace']['required_per_day'], '0.125')
        climbs = rewards.step(_unit(), prior, DAY + timedelta(days=12), behind, RULES, 'p7')
        self.assertEqual((climbs.grow_days, climbs.reason), (6, 'behind_pace'))
        last_unit = rewards.step(_unit(), prior, DAY + timedelta(days=12), Pace(1, 80, 5, 14), RULES, 'p7')
        self.assertEqual(last_unit.reason, 'one_unit')  # a family's last unit climbs on its own

    def test_missed_nights_still_grow_and_only_tonight_holds(self):
        start = _walk(_unit(), 10)[-1]  # day 10, 3 growth days
        prior = _prior(start, DAY + timedelta(days=9))
        later = DAY + timedelta(days=12)  # day 13: three nights since
        self.assertEqual(rewards.step(_unit(), prior, later, None, RULES, 'p7').grow_days, 6)
        held = rewards.step(_unit(), prior, later, Pace(10, 80, 14, 14), RULES, 'p7')
        self.assertEqual(held.grow_days, 5)

    def test_a_unit_scanned_but_not_added_climbs_alone(self):
        start = _walk(_unit(), 12)[-1]
        prior = _prior(start, DAY + timedelta(days=11), scans=10, adds=1)
        lagging = rewards.step(_unit(), prior, DAY + timedelta(days=12), Pace(10, 80, 14, 14, scans=100, adds=50), RULES, 'p7')
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

    def test_bulk_units_pace_by_sell_through(self):
        for i in range(8):  # 8 mugs sold in the last 14 days: 0.57 a day against 4 / 71 needed
            Item.objects.create(product=self.mugs, sku=f'ITMRWS{i:03d}', price=D('9.00'), status='sold',
                                sold_at=timezone.make_aware(datetime.combine(DAY - timedelta(days=i + 1), time(15))))
        rewards.recompute(DAY)
        mug = ItemReward.objects.get(item=self.mug_items[0])
        self.assertEqual((mug.status, mug.reason), (ItemReward.STATUS_PAUSED, 'family_on_pace'))
        self.assertEqual(mug.grow_days, 12)  # the catch-up counts; only tonight holds
        self.assertEqual(ItemReward.objects.get(item=self.lamp_item).reason, 'one_unit')

    def test_a_family_link_paces_different_products_together(self):
        family = RewardFamily.objects.create(name='Lamps')
        other = Product.objects.create(title='Brass floor lamp, black')
        FamilyLink.objects.create(product=self.lamp, family=family, source=FamilyLink.SOURCE_ASKED)
        FamilyLink.objects.create(product=other, family=family, source=FamilyLink.SOURCE_NEIGHBOUR)
        _floor_item(other, 'ITMRW0002', days_on_floor=5, price='80.00')
        p = rewards.plan(DAY)
        key = f'f{family.pk}'
        self.assertEqual(p.paces[key].units, 2)
        self.assertEqual(p.paces[key].days_left, 71)  # counted from the oldest unit (day 20)

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


class FamilyTests(TestCase):
    def setUp(self):
        self.a = Product.objects.create(title='Ninja blender 72 oz red')
        self.b = Product.objects.create(title='Ninja blender 72 oz black')
        self.c = Product.objects.create(title='Ninja blender cup')

    def test_no_close_neighbour_stands_alone_without_a_model_call(self):
        with patch.object(families, 'neighbours', return_value=[]), patch.object(families, '_ask') as ask:
            link = families.check(self.a.pk)
        ask.assert_not_called()
        self.assertEqual((link.family_id, link.source), (None, FamilyLink.SOURCE_ALONE))

    def test_the_model_names_the_family_once_and_neighbours_join(self):
        near = [{'product_id': self.b.pk, 'similarity': 0.97}, {'product_id': self.c.pk, 'similarity': 0.88}]
        answer = ({'same_ids': [self.b.pk, 99999], 'family_name': 'Ninja 72 oz blenders', 'reason': 'Same blender.'}, 'm')
        with patch.object(families, 'neighbours', return_value=near), patch.object(families, '_ask', return_value=answer) as ask:
            link = families.check(self.a.pk)
            families.check(self.a.pk)  # asked once
        self.assertEqual(ask.call_count, 1)
        self.assertEqual(link.family.name, 'Ninja 72 oz blenders')
        self.assertEqual(FamilyLink.objects.get(product=self.b).family_id, link.family_id)
        self.assertFalse(FamilyLink.objects.filter(product=self.c).exists())
        self.assertEqual(link.answer['same_ids'], [self.b.pk])  # an id outside the candidates is dropped


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
