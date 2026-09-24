"""Buying Phase 5: price target, likely close, and the wish list."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, Marketplace, Outcome
from apps.buying.services import price_target as pt
from apps.buying.services.wishlist import IN_RANGE, LIKELY_OVER, OVER, build_wishlist, price_state, why_not
from apps.core.models import AppSetting


class PriceTargetTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target', 'default_fee_rate': Decimal('0.05')})[0]
        self.auction = Auction.objects.create(marketplace=self.mp, external_id='a1')

    def test_target_solves_for_costs_that_grow_with_the_bid(self):
        # (1000 / 2 - 100 fixed shipping) / (1 + 5% fee) = 380.95
        target = pt.price_target(
            self.auction,
            effective_revenue=Decimal('1000'),
            fees=Decimal('0'),
            shipping=Decimal('100'),
            fee_rate=Decimal('0.05'),
            ship_rate=None,
        )
        self.assertEqual(target, Decimal('380.95'))

    def test_the_auctions_own_profit_factor_wins(self):
        self.auction.profit_target_override = Decimal('1.5')
        target = pt.price_target(
            self.auction, effective_revenue=Decimal('1500'), fees=Decimal('0'), shipping=Decimal('0'),
            fee_rate=None, ship_rate=None,
        )
        self.assertEqual(target, Decimal('1000.00'))

    def test_no_target_without_revenue_or_when_costs_eat_it(self):
        kwargs = dict(fees=Decimal('0'), shipping=Decimal('600'), fee_rate=None, ship_rate=None)
        self.assertIsNone(pt.price_target(self.auction, effective_revenue=Decimal('0'), **kwargs))
        self.assertIsNone(pt.price_target(self.auction, effective_revenue=Decimal('1000'), **kwargs))

    def test_likely_close_from_seller_ratio_then_late_price(self):
        now = timezone.now()
        self.auction.total_retail_value = Decimal('10000')
        self.auction.current_price = Decimal('200')
        self.auction.end_time = now + timedelta(days=2)
        self.assertEqual(pt.expected_close(self.auction, now=now), Decimal('680.00'))  # Target: 6.8%
        self.auction.end_time = now + timedelta(minutes=30)
        # Near the end the price itself is the guess (R-053: no late bump seen yet).
        self.assertEqual(pt.expected_close(self.auction, now=now), Decimal('200.00'))
        AppSetting.objects.update_or_create(key='buying_close_model', defaults={'value': {'bump_last_hour': '1.2'}})
        pt.clear_cache()
        self.assertEqual(pt.expected_close(self.auction, now=now), Decimal('240.00'))

    def test_a_seller_and_condition_cell_beats_the_seller(self):
        AppSetting.objects.update_or_create(
            key='buying_close_model', defaults={'value': {'cells': {'target|new': '0.097'}}},
        )
        pt.clear_cache()
        self.auction.total_retail_value = Decimal('10000')
        self.auction.end_time = timezone.now() + timedelta(days=2)
        self.auction.condition_summary = 'New'
        self.assertEqual(pt.expected_close(self.auction), Decimal('970.00'))
        self.auction.condition_summary = 'Salvage'
        self.assertEqual(pt.expected_close(self.auction), Decimal('680.00'))

    def test_close_model_can_be_replaced_from_settings(self):
        AppSetting.objects.update_or_create(key='buying_close_model', defaults={'value': {'sellers': {'target': '0.1'}}})
        pt.clear_cache()
        self.auction.total_retail_value = Decimal('1000')
        self.auction.end_time = timezone.now() + timedelta(days=2)
        self.assertEqual(pt.expected_close(self.auction), Decimal('100.00'))


class WishlistTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        self.mp = Marketplace.objects.update_or_create(slug='walmart', defaults={'name': 'Walmart'})[0]
        self.end = timezone.now() + timedelta(days=1)

    def _auction(self, ext, **fields):
        fields.setdefault('status', Auction.STATUS_OPEN)
        fields.setdefault('end_time', self.end)
        return Auction.objects.create(marketplace=self.mp, external_id=ext, **fields)

    def test_states(self):
        a = self._auction('a', price_target=Decimal('500'), current_price=Decimal('100'), expected_close=Decimal('300'))
        self.assertEqual(price_state(a), IN_RANGE)
        a.expected_close = Decimal('700')
        self.assertEqual(price_state(a), LIKELY_OVER)
        a.current_price = Decimal('600')
        self.assertEqual(price_state(a), OVER)

    def test_over_target_drops_off_unless_asked_for(self):
        self._auction('in', price_target=Decimal('500'), current_price=Decimal('100'), priority=80)
        self._auction('over', price_target=Decimal('500'), current_price=Decimal('900'), priority=90)
        self._auction('none', price_target=None, current_price=Decimal('10'), priority=99)
        self._auction('ended', price_target=Decimal('500'), current_price=Decimal('10'), end_time=timezone.now() - timedelta(hours=1))
        self.assertEqual([r['state'] for r in build_wishlist()['results']], [IN_RANGE])
        self.assertEqual([r['state'] for r in build_wishlist(include_over=True)['results']], [OVER, IN_RANGE])

    def test_why_not_names_the_risks(self):
        a = self._auction(
            'risky',
            price_target=Decimal('500'),
            expected_close=Decimal('800'),
            need_score=20,
            manifest_analysis={
                'matched_retail_pct': 8.0,
                'hazards': {'incomplete': {'lines': 12, 'retail_pct': 14.0}, 'fragile': {'lines': 1, 'retail_pct': 1.0}},
            },
        )
        reasons = why_not(a, days=120)
        text = ' | '.join(reasons)
        self.assertIn('Only 8.0% of retail matches products we know', text)
        self.assertIn('14% of retail is missing pieces or not working', text)
        self.assertNotIn('breakable', text)  # under 5% of retail
        self.assertIn('low Need', text)
        self.assertIn('Likely to close around $800, over our $500', text)
        self.assertIn('about 120 days', text)


class WishlistApiTests(APITestCase):
    def test_endpoint_lists_in_range_auctions(self):
        mp = Marketplace.objects.update_or_create(slug='amazon', defaults={'name': 'Amazon'})[0]
        Auction.objects.create(
            marketplace=mp, external_id='a', status=Auction.STATUS_OPEN,
            end_time=timezone.now() + timedelta(hours=5),
            price_target=Decimal('400'), current_price=Decimal('150'),
        )
        user = User.objects.create_superuser(email='buyer@example.com', first_name='B', last_name='T', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Admin')[0])
        self.client.force_authenticate(user)
        data = self.client.get('/api/buying/wishlist/').data
        self.assertEqual(len(data['results']), 1)
        self.assertEqual(data['results'][0]['state'], IN_RANGE)
        self.assertEqual(data['results'][0]['why_not'][0], 'No manifest lines yet: the value is a guess from the listing')
        self.assertEqual(data['strip']['won_today'], 0)
        won = Auction.objects.create(marketplace=mp, external_id='won', status=Auction.STATUS_CLOSED)
        Outcome.objects.create(auction=won, win=True, captured_at=timezone.now())
        self.assertEqual(self.client.get('/api/buying/wishlist/').data['strip']['won_today'], 1)
