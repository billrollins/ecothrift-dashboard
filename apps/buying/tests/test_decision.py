"""The auction page's decision panel, the buyer's max and notes, and Today's best ranking."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, CategoryStats, Marketplace
from apps.buying.services import price_target as pt
from apps.buying.services.decision import decision, need_level
from apps.buying.services.wishlist import build_wishlist
from apps.core.models import AppSetting

KITCHEN = 'Kitchen & dining'


class DecisionTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target', 'default_fee_rate': Decimal('0.05')})[0]
        CategoryStats.objects.update_or_create(category=KITCHEN, defaults={'recovery_rate': Decimal('0.3'), 'cover_weeks': Decimal('1.6'), 'target_weeks': Decimal('4.0'), 'weekly_sales_units': Decimal('20'), 'need_score_1to99': 80})[0]
        self.auction = Auction.objects.create(
            marketplace=self.mp, external_id='d1', status=Auction.STATUS_OPEN,
            end_time=timezone.now() + timedelta(hours=3), current_price=Decimal('1000'),
            estimated_revenue=Decimal('5000'), shipping_override=Decimal('400'), pallet_count=4, lot_size=80,
            need_score=80, priority=90, manifest_category_distribution={KITCHEN: 100.0},
            shrinkage_override=Decimal('0'),
        )

    def test_numbers_line_up(self):
        d = decision(self.auction)
        # Landed at 1,000: bid + 5% fee + 400 freight.
        self.assertEqual(d['landed']['total'], '1450.00')
        self.assertEqual(d['landed']['recovery'], '5000.00')
        # The fee grows with the bid; the freight here is a fixed amount (an override).
        self.assertEqual((d['landed']['fee_rate'], d['landed']['ship_rate']), ('0.05', None))
        self.assertEqual(d['profit']['at_current'], '3550.00')
        # Model max at 2x: (5000 / 2 - 400) / 1.05 = 2000.00; break-even: (5000 - 400) / 1.05.
        self.assertEqual(d['bids']['model'], '2000.00')
        self.assertEqual(d['profit']['break_even_bid'], '4380.95')
        self.assertEqual(d['bids']['max_bid'], '2000.00')
        self.assertFalse(d['bids']['max_is_buyer'])
        self.assertEqual(d['bids']['room'], '1000.00')
        self.assertLess(Decimal(d['bids']['comfortable']), Decimal(d['bids']['model']))
        self.assertGreater(Decimal(d['bids']['stretch']), Decimal(d['bids']['model']))

    def test_need_now_and_after_this_lot(self):
        need = decision(self.auction)['need']
        self.assertEqual(need['level'], 'High')
        self.assertEqual(need['category'], KITCHEN)
        # 1.6 weeks now + 80 units / 20 a week = 5.6 weeks after.
        self.assertEqual(need['cover_after_weeks'], '5.6')
        self.assertIn('past its 4.0-week target', need['note'])

    def test_the_verdict_says_how_much_and_why(self):
        verdict = decision(self.auction)['verdict']
        self.assertTrue(verdict.startswith('Bid up to $2,000.'))
        self.assertIn('Fills the kitchen & dining gap', verdict)

    def test_the_buyers_own_max_wins(self):
        self.auction.max_bid = Decimal('1500')
        self.auction.save()
        bids = decision(self.auction)['bids']
        self.assertEqual((bids['max_bid'], bids['max_is_buyer'], bids['room']), ('1500.00', True, '500.00'))

    def test_labor_and_disposal_count_once_set(self):
        AppSetting.objects.update_or_create(key='buying_labor_per_item', defaults={'value': '2'})
        AppSetting.objects.update_or_create(key='buying_disposal_per_pallet', defaults={'value': '10'})
        pt.clear_cache()
        landed = decision(self.auction)['landed']
        self.assertEqual((landed['labor'], landed['disposal']), ('160.00', '40.00'))
        self.assertEqual((landed['labor_units'], landed['labor_units_basis']), (80, 'listing'))
        self.assertEqual(landed['total'], '1650.00')

    def test_labor_on_a_lot_without_a_unit_count_uses_units_per_pallet(self):
        # Typical here: 100 units on 2 pallets = 50 a pallet.
        Auction.objects.create(marketplace=self.mp, external_id='ref', end_time=timezone.now() - timedelta(days=5),
                               lot_size=100, pallet_count=2)
        AppSetting.objects.update_or_create(key='buying_labor_per_item', defaults={'value': '2'})
        pt.clear_cache()
        self.auction.lot_size = None
        self.auction.save()
        landed = decision(self.auction)['landed']
        # 4 pallets x 50 units, labelled as an estimate.
        self.assertEqual((landed['labor_units'], landed['labor_units_basis']), (200, 'estimate'))
        self.assertEqual(landed['labor'], '400.00')

    def test_disposal_on_a_lot_without_a_pallet_count_uses_units_per_pallet(self):
        Auction.objects.create(marketplace=self.mp, external_id='ref', end_time=timezone.now() - timedelta(days=5),
                               lot_size=100, pallet_count=2)
        AppSetting.objects.update_or_create(key='buying_disposal_per_pallet', defaults={'value': '10'})
        pt.clear_cache()
        self.auction.pallet_count = None
        self.auction.save()
        landed = decision(self.auction)['landed']
        # 80 units / 50 a pallet = 2 pallets (rounded), labelled as an estimate.
        self.assertEqual((landed['disposal_pallets'], landed['disposal_pallets_basis'], landed['disposal']), (2, 'estimate', '20.00'))

    def test_similar_lots_from_the_same_seller_and_category(self):
        Auction.objects.create(
            marketplace=self.mp, external_id='old1', status=Auction.STATUS_CLOSED,
            end_time=timezone.now() - timedelta(days=3), current_price=Decimal('1800'), pallet_count=4,
            manifest_category_distribution={KITCHEN: 100.0},
        )
        Auction.objects.create(
            marketplace=self.mp, external_id='old2', status=Auction.STATUS_CLOSED,
            end_time=timezone.now() - timedelta(days=5), current_price=Decimal('2100'), pallet_count=3,
            manifest_category_distribution={KITCHEN: 100.0},
        )
        similar = decision(self.auction)['similar']
        self.assertEqual([lot['close'] for lot in similar['lots']], ['1800.00', '2100.00'])
        self.assertEqual((similar['likely_low'], similar['likely_high']), ('1800.00', '2100.00'))

    def test_a_category_with_no_sales_uses_the_store_wide_rate_and_says_so(self):
        from apps.buying.services.recovery import filled_in, recovery_rate
        from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED

        CategoryStats.objects.update_or_create(category=MIXED_LOTS_UNCATEGORIZED, defaults={'recovery_rate': Decimal('0.35')})[0]
        CategoryStats.objects.update_or_create(category='Appliances', defaults={'recovery_rate': Decimal('0')})[0]
        stats = {c.category: c for c in CategoryStats.objects.all()}
        self.assertEqual(recovery_rate(stats, 'Appliances'), Decimal('0.35'))
        self.assertEqual(recovery_rate(stats, KITCHEN), Decimal('0.3'))
        self.assertTrue(filled_in(stats, 'Appliances'))
        self.assertFalse(filled_in(stats, KITCHEN))
        self.auction.manifest_category_distribution = {'Appliances': 100.0}
        self.auction.save()
        landed = decision(self.auction)['landed']
        self.assertEqual((landed['filled_categories'], landed['store_rate']), (['Appliances'], '0.350000'))

    def test_need_levels(self):
        self.assertEqual([need_level(80), need_level(50), need_level(20), need_level(None)], ['High', 'Med', 'Low', None])


class BuyerApiTests(APITestCase):
    def setUp(self):
        mp = Marketplace.objects.update_or_create(slug='amazon', defaults={'name': 'Amazon'})[0]
        self.auction = Auction.objects.create(marketplace=mp, external_id='b1')
        user = User.objects.create_user('buyer@example.com', 'B', 'T', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user)

    def test_set_and_clear_the_max_and_save_notes(self):
        url = f'/api/buying/auctions/{self.auction.pk}/buyer/'
        self.assertEqual(self.client.patch(url, {'max_bid': '1250'}, format='json').status_code, 200)
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.max_bid, Decimal('1250.00'))
        self.client.patch(url, {'max_bid': '', 'buyer_notes': 'Pallet 3 was water damaged last time'}, format='json')
        self.auction.refresh_from_db()
        self.assertIsNone(self.auction.max_bid)
        self.assertEqual(self.auction.buyer_notes, 'Pallet 3 was water damaged last time')
        self.assertEqual(self.client.patch(url, {'max_bid': 'lots'}, format='json').status_code, 400)

    def test_decision_endpoint(self):
        data = self.client.get(f'/api/buying/auctions/{self.auction.pk}/decision/').data
        self.assertIn('verdict', data)
        self.assertIn('landed', data)


class TodaysBestTests(TestCase):
    def setUp(self):
        pt.clear_cache()
        self.mp = Marketplace.objects.update_or_create(slug='walmart', defaults={'name': 'Walmart'})[0]
        end = timezone.now() + timedelta(hours=6)
        common = dict(marketplace=self.mp, status=Auction.STATUS_OPEN, price_target=Decimal('1000'), current_price=Decimal('100'))
        Auction.objects.create(external_id='a', end_time=end, priority=90, est_profit=Decimal('500'), need_score=40,
                               manifest_category_distribution={KITCHEN: 100.0}, **common)
        Auction.objects.create(external_id='b', end_time=end - timedelta(hours=5), priority=70, est_profit=Decimal('900'),
                               need_score=90, manifest_category_distribution={'Toys & games': 100.0}, **common)

    def test_ranks(self):
        by = lambda rank: [r['priority'] for r in build_wishlist(rank=rank)['results']]  # noqa: E731
        self.assertEqual(by('focus'), [90, 70])
        self.assertEqual(by('profit'), [70, 90])
        self.assertEqual(by('need'), [70, 90])
        self.assertEqual(by('ending'), [70, 90])

    def test_category_filter_and_counts(self):
        data = build_wishlist(category=KITCHEN)
        self.assertEqual([r['top_category'] for r in data['results']], [KITCHEN])
        self.assertEqual((data['eligible'], data['live_total']), (1, 2))

    def test_room_and_over_max_use_the_buyers_max_first(self):
        Auction.objects.filter(external_id='a').update(max_bid=Decimal('80'))
        self.assertEqual([r['priority'] for r in build_wishlist()['results']], [70])
        over = build_wishlist(include_over=True)['results']
        first = next(r for r in over if r['priority'] == 90)
        self.assertEqual((first['max_is_buyer'], first['room']), (True, Decimal('-20')))
