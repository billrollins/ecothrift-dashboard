"""thrift_plus_families Phase 1 (owner 2026-10-13): possible families hold; approved ones price together toward a
sell target; "not a family" grows on its own; the owner decides on the Families page."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.inventory.models import Product
from apps.thriftplus.models import FamilyLink, ItemReward, RewardFamily
from apps.thriftplus.services import families, family_queue, rewards
from apps.thriftplus.tests.test_rewards import DAY, _floor_item

D = Decimal


def _boss():
    return User.objects.create_superuser(email='boss@example.com', first_name='B', last_name='O', password='x-pass-123')


class FlagTests(TestCase):
    def test_a_product_with_two_or_more_floor_units_is_a_possible_family(self):
        lamp = Product.objects.create(title='Brass floor lamp')
        mug = Product.objects.create(title='Stoneware mug')
        consigned = Product.objects.create(title='Consigned chair')
        for i in range(3):
            _floor_item(lamp, f'ITMFL0{i}', days_on_floor=10)
        _floor_item(mug, 'ITMFM00', days_on_floor=10)
        for i in range(2):
            _floor_item(consigned, f'ITMFC0{i}', days_on_floor=10, source='consignment')
        self.assertEqual(families.flag_identical(), {'products': 1, 'new': 1})
        fam = RewardFamily.objects.get()
        self.assertEqual((fam.kind, fam.status, fam.name), (RewardFamily.KIND_IDENTICAL, RewardFamily.STATUS_POSSIBLE, 'Brass floor lamp'))
        self.assertEqual(FamilyLink.objects.get(product=lamp).family, fam)
        self.assertEqual(families.flag_identical()['new'], 0)  # once

    def test_a_product_the_ai_found_alone_gets_its_own_family(self):
        lamp = Product.objects.create(title='Brass floor lamp')
        FamilyLink.objects.create(product=lamp, family=None, source=FamilyLink.SOURCE_ALONE)
        for i in range(2):
            _floor_item(lamp, f'ITMFA0{i}', days_on_floor=10)
        families.flag_identical()
        link = FamilyLink.objects.get(product=lamp)
        self.assertEqual((link.source, link.family.status), (FamilyLink.SOURCE_IDENTICAL, RewardFamily.STATUS_POSSIBLE))


class HoldAndApproveTests(TestCase):
    """Four $100 lamps, 30 days on the floor on DAY (the old rule: 7-day wait, then the tag ÷ 90 a day)."""

    def setUp(self):
        self.boss = _boss()
        self.lamp = Product.objects.create(title='Brass floor lamp')
        self.items = [_floor_item(self.lamp, f'ITMFH0{i}', days_on_floor=30, price='100.00') for i in range(4)]
        rewards.recompute(DAY)  # flags the family, holds it at its start, then approves it by default
        self.family = RewardFamily.objects.get()

    def rewards_on(self):
        return sorted(set(ItemReward.objects.values_list('reward', flat=True)))

    def test_a_new_family_keeps_its_first_night_start_then_is_approved_by_default(self):
        self.assertEqual(self.rewards_on(), [D('25.55')])  # 23 growth days
        self.assertEqual(set(ItemReward.objects.values_list('reason', flat=True)), {'family_possible'})
        # owner 2026-10-16: approved at the end of its first night, to clear its 4 units in 90 days, unstamped (to review)
        self.assertEqual((self.family.status, self.family.target_per_90, self.family.pct, self.family.decided_by),
                         (RewardFamily.STATUS_APPROVED, 4, D('0.2555'), None))
        rewards.recompute(DAY + timedelta(days=1))  # no sales: (0 + 1) ÷ 30 days × 90 = 3 < 4, behind
        self.assertEqual(self.rewards_on(), [D('25.80')])

    def test_a_possible_family_holds(self):
        family_queue.decide(self.family, 'reopen', by=self.boss)
        out = {o.reason for o in rewards.plan(DAY + timedelta(days=1)).outcomes}  # held, until the night approves it again
        self.assertEqual(out, {'family_possible'})

    def test_approved_behind_its_target_rises_a_quarter_percent_a_night_and_once(self):
        family_queue.decide(self.family, 'approve', by=self.boss, target=10)
        self.family.refresh_from_db()
        self.assertEqual(self.family.pct, D('0.2555'))  # the units' median
        rewards.recompute(DAY + timedelta(days=1))  # no sales: (0 + 1) ÷ 30 days × 90 = 3 < 10, behind
        rewards.recompute(DAY + timedelta(days=1))  # a re-run moves nothing
        self.family.refresh_from_db()
        self.assertEqual((self.family.pct, self.family.pct_on), (D('0.2580'), DAY + timedelta(days=1)))
        self.assertEqual(self.rewards_on(), [D('25.80')])
        self.assertEqual(set(ItemReward.objects.values_list('reason', flat=True)), {'family_behind'})

    def test_approved_on_target_holds(self):
        family_queue.decide(self.family, 'approve', by=self.boss, target=2)  # an estimated 3 per 90 days is enough
        rewards.recompute(DAY + timedelta(days=1))
        self.assertEqual(self.rewards_on(), [D('25.55')])
        self.assertEqual(set(ItemReward.objects.values_list('reason', flat=True)), {'family_on_target'})

    def test_not_a_family_grows_on_its_own_again(self):
        family_queue.decide(self.family, 'not_family', by=self.boss)
        rewards.recompute(DAY + timedelta(days=1))
        self.assertEqual(self.rewards_on(), [D('26.66')])  # 24 growth days

    def test_approving_needs_a_target(self):
        with self.assertRaises(family_queue.FamilyError):
            family_queue.decide(self.family, 'approve', by=self.boss)


class FamiliesPageTests(APITestCase):
    def setUp(self):
        self.boss = _boss()
        self.manager = User.objects.create_user('mgr@example.com', 'M', 'G', password='x-pass-123')
        self.manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        small = Product.objects.create(title='Stoneware mug')
        huge = Product.objects.create(title='Plastic tumbler')
        for i in range(3):
            _floor_item(small, f'ITMFP0{i}', days_on_floor=20, price='6.00')
        for i in range(50):
            _floor_item(huge, f'ITMFT{i:02d}', days_on_floor=20, price='0.25', cost='0.20')
        families.flag_identical()
        self.small = FamilyLink.objects.get(product=small).family
        self.huge = FamilyLink.objects.get(product=huge).family

    def test_the_queue_is_in_order_of_money_at_stake_with_flags(self):
        self.client.force_authenticate(self.manager)
        data = self.client.get('/api/thriftplus/families/?status=possible').data
        self.assertEqual((data['total'], data['decided'], data['counts']['possible']), (2, 0, 2))
        self.assertEqual([r['name'] for r in data['rows']], ['Stoneware mug', 'Plastic tumbler'])  # $18 before $12.50
        tumbler = data['rows'][1]
        self.assertEqual((tumbler['units'], tumbler['suggested_target'], tumbler['huge']), (50, 50, True))
        self.assertEqual({f['key'] for f in tumbler['flags']}, {'huge', 'volume', 'cost', 'junk'})
        self.assertEqual(self.client.get('/api/thriftplus/families/?status=possible&band=50%2B').data['matching'], 1)

    def test_approved_by_default_then_reviewed(self):
        """Owner 2026-10-16: every possible family is approved at its floor count per 90 days and waits for review;
        the owner's save stamps it and takes it off the review list."""
        self.assertEqual(family_queue.auto_approve(), 2)
        self.huge.refresh_from_db()
        self.assertEqual((self.huge.status, self.huge.target_per_90, self.huge.decided_by), ('approved', 50, None))
        self.client.force_authenticate(self.boss)
        data = self.client.get('/api/thriftplus/families/').data  # opens on "to review"
        self.assertEqual((data['counts']['review'], data['reviewed'], data['matching']), (2, 0, 2))
        r = self.client.post(f'/api/thriftplus/families/{self.huge.pk}/decide/', {'action': 'approve', 'target': 20}, format='json')
        self.assertEqual(r.status_code, 200)
        self.huge.refresh_from_db()
        self.assertEqual((self.huge.target_per_90, self.huge.decided_by), (20, self.boss))
        data = self.client.get('/api/thriftplus/families/').data
        self.assertEqual((data['counts']['review'], data['reviewed'], [x['id'] for x in data['rows']]), (1, 1, [self.small.pk]))
        self.assertEqual(family_queue.auto_approve(), 0)  # nothing left to approve

    def test_only_the_owner_decides(self):
        self.client.force_authenticate(self.manager)
        r = self.client.post(f'/api/thriftplus/families/{self.small.pk}/decide/', {'action': 'not_family'}, format='json')
        self.assertEqual(r.status_code, 403)

    def test_bulk_skips_huge_lots_and_the_rest_become_not_a_family(self):
        self.client.force_authenticate(self.boss)
        r = self.client.post('/api/thriftplus/families/bulk/', {'ids': [self.small.pk, self.huge.pk]}, format='json')
        self.assertEqual(r.data, {'approved': 1, 'skipped': 1})
        self.small.refresh_from_db()
        self.assertEqual((self.small.status, self.small.target_per_90, self.small.decided_by), ('approved', 3, self.boss))
        self.assertEqual(self.client.post('/api/thriftplus/families/rest/').data, {'marked': 1})
        self.huge.refresh_from_db()
        self.assertEqual(self.huge.status, 'not_family')
        data = self.client.get('/api/thriftplus/families/').data
        self.assertEqual((data['decided'], data['total']), (2, 2))

    def test_decide_with_a_target_and_reopen(self):
        self.client.force_authenticate(self.boss)
        r = self.client.post(f'/api/thriftplus/families/{self.huge.pk}/decide/', {'action': 'approve', 'target': 20}, format='json')
        self.assertEqual((r.status_code, r.data['status'], r.data['target_per_90']), (200, 'approved', 20))
        r = self.client.post(f'/api/thriftplus/families/{self.huge.pk}/decide/', {'action': 'reopen'}, format='json')
        self.assertEqual(r.data['status'], 'possible')
        bad = self.client.post(f'/api/thriftplus/families/{self.huge.pk}/decide/', {'action': 'approve', 'target': 'lots'}, format='json')
        self.assertEqual(bad.status_code, 400)
