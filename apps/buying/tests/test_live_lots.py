"""Rebuilt auction list (buying rebuild step 1): live lots, estimate, bid up to at 20% landed, room."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, ManifestRow, Marketplace
from apps.buying.services import live_lots
from apps.buying.tests.test_recovery_fit import _fit_row


def _lot(mp, ext, *, retail=50000, price=5000, hours=5, listed_ago=timedelta(minutes=10), **kw):
    now = timezone.now()
    return Auction.objects.create(
        marketplace=mp, external_id=ext, lot_id=f'lot-{ext}', title=f'Lot {ext}', url=f'https://bstock.com/x/{ext}',
        total_retail_value=Decimal(retail), current_price=Decimal(price), end_time=now + timedelta(hours=hours),
        status=Auction.STATUS_OPEN, last_listed_at=now - listed_ago, shipping_quote=Decimal('2000'), **kw,
    )


class LiveLotsTests(TestCase):
    def setUp(self):
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target', 'is_active': True})[0]
        _fit_row()  # Target whole truck 24 / 28 / 35%, TOYS 40%

    def test_only_live_lots_listed_in_the_last_three_hours(self):
        _lot(self.mp, 'live')
        _lot(self.mp, 'stale', listed_ago=timedelta(hours=4))
        _lot(self.mp, 'ended', hours=-1)
        out = live_lots.build()
        self.assertEqual([r['title'] for r in out['lots']], ['Lot live'])

    def test_room_is_bid_up_to_at_20_percent_landed_minus_the_price(self):
        _lot(self.mp, 'a', retail=50000, price=5000)
        [r] = live_lots.build()['lots']
        self.assertAlmostEqual(r['bid_up_to'], (50000 * 0.20 - 2000) / 1.05, places=1)
        self.assertAlmostEqual(r['room'], (50000 * 0.20 - 2000) / 1.05 - 5000, places=1)
        self.assertAlmostEqual(r['brings_in']['likely'], 50000 * 0.28, places=0)
        self.assertEqual((r['method'], r['freight_basis']), ('whole truck', 'B-Stock quote'))
        self.assertAlmostEqual(r['landed'], 5000 * 1.05 + 2000, places=1)

    def test_a_stored_manifest_ranks_first_and_prices_by_category(self):
        _lot(self.mp, 'roomy', retail=50000, price=100)
        with_manifest = _lot(self.mp, 'man', retail=50000, price=50)
        ManifestRow.objects.create(auction=with_manifest, row_number=1, raw_data={
            'Seller Category': 'TOYS', 'Item Description': 'Doll', 'Qty': '500', 'Unit Retail': '100'})
        rows = live_lots.build()['lots']
        self.assertEqual(rows[0]['title'], 'Lot man')
        self.assertEqual(rows[0]['method'], 'manifest')
        self.assertAlmostEqual(rows[0]['brings_in']['likely'], 20000, places=0)
        self.assertEqual(rows[0]['manifest'], 'yes')

    def test_contract_lots_are_apart_with_no_room_and_buy_now_is_the_price_in_its_window(self):
        _lot(self.mp, 'c', listing_type='CONTRACT')
        _lot(self.mp, 'bn', price=0, buy_now_price=Decimal('7000'), buy_now_ends_at=timezone.now() + timedelta(hours=1))
        out = live_lots.build()
        self.assertEqual([r['title'] for r in out['contract']], ['Lot c'])
        self.assertIsNone(out['contract'][0]['room'])
        [bn] = out['lots']
        self.assertEqual((bn['price'], bn['price_basis']), (7000, 'Buy Now'))

    def test_no_freight_means_no_room_and_a_seller_without_a_fit_says_not_yet(self):
        Auction.objects.filter(pk=_lot(self.mp, 'nf').pk).update(shipping_quote=None)
        costco = Marketplace.objects.update_or_create(slug='costco', defaults={'name': 'Costco', 'is_active': True})[0]
        _lot(costco, 'cc')
        rows = {r['title']: r for r in live_lots.build()['lots']}
        self.assertIsNone(rows['Lot nf']['room'])
        self.assertIsNone(rows['Lot cc']['brings_in'])
        self.assertEqual(rows['Lot cc']['estimate_note'], 'not yet')


class LiveLotsApiTests(APITestCase):
    def test_staff_get_the_list(self):
        user = User.objects.create_user('lots@example.com', 'T', 'U', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user)
        r = self.client.get('/api/buying/live-lots/?fresh=1')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['lots'], [])
        self.assertEqual(r.data['landed_pct'], 0.2)


class ReachAndTitleTests(TestCase):
    def setUp(self):
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target', 'is_active': True})[0]
        _fit_row()

    def test_profit_at_max_and_reach_and_over_max_lots_last(self):
        _lot(self.mp, 'over', retail=50000, price=20000, bid_count=9)
        _lot(self.mp, 'under', retail=50000, price=3000, bid_count=4)
        _lot(self.mp, 'none', retail=60000, price=100)
        rows = live_lots.build()['lots']
        self.assertEqual([r['title'] for r in rows], ['Lot none', 'Lot under', 'Lot over'])
        by = {r['title']: r for r in rows}
        self.assertEqual((by['Lot over']['reach'], by['Lot under']['reach'], by['Lot none']['reach']), ('over', 'under', 'no_bids'))
        # Profit if won at the max: 28% likely minus 20% landed, whatever the price now.
        self.assertAlmostEqual(by['Lot under']['profit_at_max'], 50000 * 0.08, places=0)

    def test_short_title_drops_what_the_row_shows(self):
        t = '4 Pallets of Personal Care, Skin Care & More, 6,324 Units, Ext. Retail $124,429, Indianapolis, IN'
        self.assertEqual(live_lots.short_title(t), '4 Pallets of Personal Care, Skin Care & More')
        self.assertEqual(live_lots.units_from_title(t), 6324)
        self.assertEqual(live_lots.short_title('6 Pallet Spaces of Apparel'), '6 Pallet Spaces of Apparel')
