"""The one-line 'why' on each auction (bstock Phase 3)."""
from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from apps.buying.models import Auction
from apps.buying.services.auction_why import auction_why


def _stats(**pcts):
    return {k: SimpleNamespace(sell_through_30_pct=Decimal(str(v))) for k, v in pcts.items()}


class AuctionWhyTests(SimpleTestCase):
    def test_full_line(self):
        a = Auction(
            need_score=72,
            profitability_ratio=Decimal('0.38'),
            ai_category_estimates={'Toys & games': 60, 'Kitchen & dining': 40},
            condition_summary="['Used Fair']",
            estimated_shipping=Decimal('410'),
            estimated_total_cost=Decimal('1000'),
        )
        line = auction_why(a, _stats(**{'Toys & games': 60, 'Kitchen & dining': 40}))
        self.assertEqual(line, 'Need 72 (Toys & games 60%) · profit 38% · sells fast · Used fair · shipping 41% of cost · AI mix')

    def test_no_mix(self):
        a = Auction(need_score=50, profitability_ratio=None, condition_summary='Used Good')
        self.assertEqual(auction_why(a, {}), 'Need 50 · no profit estimate · no mix yet')

    def test_slow_and_manifest(self):
        a = Auction(
            need_score=30,
            profitability_ratio=Decimal('0.1'),
            manifest_category_distribution={'Apparel & accessories': 100},
            condition_summary='New',
            estimated_shipping=Decimal('100'),
            estimated_total_cost=Decimal('1000'),
        )
        line = auction_why(a, _stats(**{'Apparel & accessories': 12}))
        self.assertEqual(line, 'Need 30 (Apparel 100%) · profit 10% · sells slow')
