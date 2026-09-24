"""Sell speed in auction Priority: 30-day sell-through by category mix (bstock Phase 3)."""
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from apps.buying.services.valuation import auction_speed_from_mix, compute_priority


def _stats(**pcts):
    return {name: SimpleNamespace(sell_through_30_pct=None if v is None else Decimal(str(v))) for name, v in pcts.items()}


class AuctionSpeedTests(SimpleTestCase):
    def test_mix_weighted(self):
        stats = _stats(**{'Toys & games': 60, 'Apparel & accessories': 10})
        weights = {'Toys & games': Decimal('0.5'), 'Apparel & accessories': Decimal('0.5')}
        self.assertEqual(auction_speed_from_mix(weights, stats), 35)

    def test_unknown_category_takes_the_average(self):
        stats = _stats(**{'Toys & games': 60, 'Apparel & accessories': 20, 'Automotive': None})
        self.assertEqual(auction_speed_from_mix({'Automotive': Decimal('1')}, stats), 40)

    def test_no_mix_or_no_rates(self):
        self.assertIsNone(auction_speed_from_mix({}, _stats(**{'Toys & games': 60})))
        self.assertIsNone(auction_speed_from_mix({'Toys & games': Decimal('1')}, _stats(**{'Toys & games': None})))


class PriorityWithSpeedTests(SimpleTestCase):
    def test_speed_weight_zero_changes_nothing(self):
        self.assertEqual(
            compute_priority(80, Decimal('0.2'), has_mix=True, weight=Decimal('0.5'), speed=10, speed_weight=Decimal('0')),
            (50, 'need_profit'),
        )

    def test_speed_takes_its_share_from_need(self):
        # 0.3 x 80 + 0.5 x 20 + 0.2 x 10 = 36
        self.assertEqual(
            compute_priority(80, Decimal('0.2'), has_mix=True, weight=Decimal('0.5'), speed=10, speed_weight=Decimal('0.2')),
            (36, 'need_profit'),
        )

    def test_weights_over_one_are_scaled(self):
        # profit 0.8 and speed 0.4 scale to 2/3 and 1/3: 2/3 x 20 + 1/3 x 50 = 30
        self.assertEqual(
            compute_priority(80, Decimal('0.2'), has_mix=True, weight=Decimal('0.8'), speed=50, speed_weight=Decimal('0.4')),
            (30, 'need_profit'),
        )

    def test_no_speed_means_no_speed_share(self):
        self.assertEqual(
            compute_priority(80, Decimal('0.2'), has_mix=True, weight=Decimal('0.5'), speed=None, speed_weight=Decimal('0.3')),
            (50, 'need_profit'),
        )
