"""Buying Phase 4: manifest lines matched to products, hazards, and truck value v2."""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, CategoryStats, ManifestRow, Marketplace
from apps.buying.services.manifest_analysis import (
    BULK_LINE,
    FRAGILE,
    HIGH_VALUE,
    INCOMPLETE,
    PART,
    ZERO_RETAIL,
    analyze_auction,
    analyze_if_stale,
    line_hazards,
    match_rows,
    sizes,
    sizes_conflict,
    upc_key,
)
from apps.inventory.models import Item, Product

KITCHEN = 'Kitchen & dining'


def _row(auction, n, **fields):
    fields.setdefault('title', f'Line {n}')
    fields.setdefault('quantity', 1)
    fields.setdefault('retail_value', Decimal('20.00'))
    return ManifestRow.objects.create(auction=auction, row_number=n, **fields)


def _sold(product, n, *, retail='50.00', sold_for='20.00', days=10):
    now = timezone.now()
    for i in range(n):
        Item.objects.create(
            sku=f'T{product.pk}-{i}-{days}',
            product=product,
            retail=Decimal(retail),
            price=Decimal(sold_for),
            status='sold',
            checked_in_at=now - timedelta(days=days + 1),
            sold_at=now - timedelta(days=1),
            sold_for=Decimal(sold_for),
        )


class HazardTests(TestCase):
    def setUp(self):
        mp = Marketplace.objects.update_or_create(slug='bstock-test', defaults={'name': 'B-Stock test'})[0]
        self.auction = Auction.objects.create(marketplace=mp, external_id='a1')

    def test_line_hazards_from_title_condition_retail_and_quantity(self):
        cases = [
            (dict(title='Patio chair set - Box 1 of 3'), PART),
            (dict(title='Stand mixer', condition='Missing parts'), INCOMPLETE),
            (dict(title='Glass vase set of 4'), FRAGILE),
            (dict(title='OLED TV 65in', retail_value=Decimal('1299.00')), HIGH_VALUE),
            (dict(title='Mystery item', retail_value=Decimal('0')), ZERO_RETAIL),
            (dict(title='Dish soap', quantity=48), BULK_LINE),
        ]
        for i, (fields, code) in enumerate(cases, start=1):
            with self.subTest(code=code):
                self.assertIn(code, line_hazards(_row(self.auction, i, **fields)))
        self.assertEqual(line_hazards(_row(self.auction, 99, title='Plain towel')), [])
        # A seller's hedge is not a finding (R-052: thousands of Target lines carry it).
        hedged = 'Ornament set (Please be advised that sets may be missing pieces or otherwise incomplete.)'
        self.assertNotIn(INCOMPLETE, line_hazards(_row(self.auction, 98, title=hedged)))

    def test_the_r060_false_hazards_are_gone(self):
        not_hazards = [
            (dict(title='RV POWER OUTLET BOX 20/30/50AMP 125/250V'), PART),
            (dict(title='KFFKFF 96-Piece 3/8 Inch Drive Impact Socket Set'), PART),
            (dict(title='Knee Scooter for Broken Ankle or Broken Foot'), INCOMPLETE),
            (dict(title='Soft Denim Dress with a Broken-In Feel'), INCOMPLETE),
            (dict(title='The Missing Friend 1000 Piece Puzzle'), INCOMPLETE),
            (dict(title='Funko POP! TV: Stranger Things Eleven'), FRAGILE),
            (dict(title='Stanley 40oz Stainless Steel Quencher Mug'), FRAGILE),
            (dict(title='Universal TV Wall Mount Adaptor Plate'), FRAGILE),
            (dict(title='Door Frame Kit (Glass Not Included)'), FRAGILE),
        ]
        for i, (fields, code) in enumerate(not_hazards, start=200):
            with self.subTest(title=fields['title']):
                self.assertNotIn(code, line_hazards(_row(self.auction, i, **fields)))
        still = [
            (dict(title='Patio sectional - Box 2 of 4'), PART),
            (dict(title='Stand mixer - parts only'), INCOMPLETE),
            (dict(title='Stand mixer', condition='Broken, not working'), INCOMPLETE),
            (dict(title='Samsung 65" Class QLED 4K Smart TV'), FRAGILE),
            (dict(title='LG OLED TV 55in'), FRAGILE),
            (dict(title='Ceramic Coffee Mug Set of 4'), FRAGILE),
        ]
        for i, (fields, code) in enumerate(still, start=300):
            with self.subTest(title=fields['title']):
                self.assertIn(code, line_hazards(_row(self.auction, i, **fields)))

    def test_sizes_must_agree_for_a_near_match(self):
        self.assertEqual(sizes('14-Cup Coffee Maker 1.5Qt'), {'14cup', '1.5qt'})
        self.assertEqual(sizes("13'' 2 Cube Organizer"), {'13in'})
        self.assertTrue(sizes_conflict('32qt Clear Storage Bin - Brightroom', '60qt Latching Clear Storage Box - Brightroom'))
        self.assertFalse(sizes_conflict('Conair Steamer 1875W, 20 Min Steam', 'Conair Steamer 1875W'))
        self.assertFalse(sizes_conflict('Kohler Layne seat', 'Kohler Layne seat 2 pack'))

    def test_upc_key_ignores_leading_zeros_and_short_codes(self):
        self.assertEqual(upc_key('0012345678905'), upc_key('12345678905'))
        self.assertEqual(upc_key('12-345'), '')


class MatchAndValueTests(TestCase):
    def setUp(self):
        mp = Marketplace.objects.update_or_create(slug='bstock-test', defaults={'name': 'B-Stock test'})[0]
        self.auction = Auction.objects.create(marketplace=mp, external_id='a1', has_manifest=True)
        CategoryStats.objects.update_or_create(category=KITCHEN, defaults={'recovery_rate': Decimal('0.2000')})[0]
        self.by_upc = Product.objects.create(title='Stainless Stand Mixer', brand='Mixo', identifiers={'upc': '012345678905'})
        self.by_title = Product.objects.create(title='CleverMade Laundry Hauler', brand='CleverMade')
        self.near = Product.objects.create(title='Kohler Layne QR Elongated Toilet Seat', brand='Kohler')

    def test_matches_by_upc_then_title_then_near_title(self):
        rows = [
            _row(self.auction, 1, title='MIXER, STAND', upc='12345678905'),
            _row(self.auction, 2, title='CLEVERMADE LAUNDRY HAULER'),
            _row(self.auction, 3, title='KOHLER LAYNE QR ELONGATED TOILET SEAT WHITE', brand='Kohler'),
            _row(self.auction, 4, title='Completely unrelated gadget thing'),
        ]
        found = match_rows(rows)
        self.assertEqual((found[rows[0].pk].product_id, found[rows[0].pk].method), (self.by_upc.pk, 'upc'))
        self.assertEqual((found[rows[1].pk].product_id, found[rows[1].pk].method), (self.by_title.pk, 'title'))
        self.assertEqual((found[rows[2].pk].product_id, found[rows[2].pk].method), (self.near.pk, 'near'))
        self.assertNotIn(rows[3].pk, found)

    def test_near_lookups_go_to_the_most_retail_first(self):
        cheap = _row(self.auction, 1, title='KOHLER LAYNE QR ELONGATED TOILET SEAT WHITE', brand='Kohler', retail_value=Decimal('5'))
        pricey = _row(self.auction, 2, title='CLEVERMADE LAUNDRY HAULER GREY', retail_value=Decimal('40'), quantity=3)
        with patch('apps.buying.services.manifest_analysis.MAX_NEAR_LOOKUPS', 1):
            found = match_rows([cheap, pricey])
        self.assertIn(pricey.pk, found)
        self.assertNotIn(cheap.pk, found)

    def test_value_uses_the_products_own_sales_when_it_has_enough(self):
        _sold(self.by_upc, 3, retail='50.00', sold_for='20.00')  # 40% of retail
        _row(self.auction, 1, title='MIXER', upc='12345678905', retail_value=Decimal('100.00'), quantity=2,
             fast_cat_value=KITCHEN)
        _row(self.auction, 2, title='Unknown pan', retail_value=Decimal('10.00'), quantity=1, fast_cat_value=KITCHEN)
        summary = analyze_auction(self.auction)
        first = ManifestRow.objects.get(auction=self.auction, row_number=1)
        second = ManifestRow.objects.get(auction=self.auction, row_number=2)
        self.assertEqual((first.value_basis, first.unit_value), ('product', Decimal('40.00')))
        self.assertEqual((second.value_basis, second.unit_value), ('category', Decimal('2.00')))
        # 2 x 40 + 1 x 2; by category only: 210 x 0.2.
        self.assertEqual(summary['revenue'], '82.00')
        self.assertEqual(summary['revenue_by_category'], '42.00')
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.analysis_revenue, Decimal('82.00'))

    def test_a_manifest_far_over_the_listing_is_scaled_back_and_flagged(self):
        self.auction.total_retail_value = Decimal('100.00')
        self.auction.save()
        # $999 a unit where the listing says the whole truck is $100 retail (R-055, auction 523).
        _row(self.auction, 1, title='Plush dog toy', retail_value=Decimal('999.00'), quantity=1, fast_cat_value=KITCHEN)
        summary = analyze_auction(self.auction)
        self.assertEqual(summary['retail_mismatch'], {'manifest_retail': '999.00', 'listing_retail': '100.00', 'scale': 0.1001})
        # 999 x 0.2 (Kitchen) x 0.1001, not 199.80.
        self.assertEqual(summary['revenue'], '20.00')

    def test_hazards_discount_the_value(self):
        _row(self.auction, 1, title='Patio set box 1 of 3', retail_value=Decimal('100.00'), fast_cat_value=KITCHEN)
        summary = analyze_auction(self.auction)
        row = ManifestRow.objects.get(auction=self.auction, row_number=1)
        self.assertEqual(row.hazards, [PART])
        self.assertEqual(row.unit_value, Decimal('10.00'))  # 100 x 0.2 x 0.5
        # One line, flagged, and it is all of the value.
        self.assertEqual((summary['flagged_lines'], summary['top_lines_value_pct']), (1, 100.0))

    def test_only_reanalyzes_when_the_manifest_changes(self):
        _row(self.auction, 1)
        self.assertTrue(analyze_if_stale(self.auction))
        self.auction.refresh_from_db()
        self.assertFalse(analyze_if_stale(self.auction))
        _row(self.auction, 2)
        self.assertTrue(analyze_if_stale(self.auction))

    def test_an_auction_without_lines_is_never_written(self):
        empty = Auction.objects.create(marketplace=self.auction.marketplace, external_id='a2', has_manifest=True)
        self.assertFalse(analyze_if_stale(empty))
        empty.refresh_from_db()
        self.assertIsNone(empty.manifest_analysis)


class ManifestRowsApiTests(APITestCase):
    def setUp(self):
        mp = Marketplace.objects.update_or_create(slug='bstock-test', defaults={'name': 'B-Stock test'})[0]
        self.auction = Auction.objects.create(marketplace=mp, external_id='a1', has_manifest=True)
        self.product = Product.objects.create(title='Stainless Stand Mixer', brand='Mixo', identifiers={'upc': '012345678905'})
        _sold(self.product, 3)
        _row(self.auction, 1, title='MIXER', upc='12345678905')
        _row(self.auction, 2, title='Vase glass tall')
        analyze_auction(self.auction)
        self.user = User.objects.create_superuser(
            email='boss@example.com', first_name='Boss', last_name='Test', password='test-pass-123',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Admin')[0])
        self.client.force_authenticate(self.user)

    def test_rows_carry_match_sales_and_filter_by_hazard(self):
        url = f'/api/buying/auctions/{self.auction.pk}/manifest_rows/'
        rows = self.client.get(url).data['results']
        first = next(r for r in rows if r['row_number'] == 1)
        self.assertEqual(first['match_method'], 'upc')
        self.assertEqual(first['product_sales']['sold'], 3)
        self.assertIn('need_level', first)
        fragile = self.client.get(url, {'hazard': FRAGILE}).data['results']
        self.assertEqual([r['row_number'] for r in fragile], [2])
        matched = self.client.get(url, {'matched': '1'}).data['results']
        self.assertEqual([r['row_number'] for r in matched], [1])
        unmatched = self.client.get(url, {'matched': '0'}).data['results']
        self.assertEqual([r['row_number'] for r in unmatched], [2])
        flagged = self.client.get(url, {'hazard': 'any'}).data['results']
        self.assertIn(2, [r['row_number'] for r in flagged])
        by_value = self.client.get(url, {'ordering': '-line_value'})
        self.assertEqual(by_value.status_code, 200)

    def test_detail_carries_the_analysis(self):
        data = self.client.get(f'/api/buying/auctions/{self.auction.pk}/').data
        self.assertEqual(data['manifest_analysis']['lines'], 2)
        self.assertIsNotNone(data['analysis_revenue'])
