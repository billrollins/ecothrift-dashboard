"""Estimate Profit (Dash Update #73): rates per seller + seller category from what sold, season and
missing-pieces rules, landed, bid up to."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, ManifestRow, Marketplace, ShippingOrigin
from apps.buying.services import estimate_profit as ep
from apps.inventory.models import Item, Product, PurchaseOrder, Vendor
from apps.inventory.models import ManifestRow as InvManifestRow

HEADER = 'Item #,Seller Category,Item Description,Qty,Unit Retail,Ext. Retail,TCIN\n'

# Target: Bikes 40%, Kitchenware 50%, Rugs 35%; FEW has 2 sold (under 5: uses the average); average 30%.
FAKE = ep.SellerRates(
    slug='target', name='Target',
    by_category={
        'BICYCLES-PHYSICAL FITNESS': (0.40, 100, 1000.0), 'KITCHENWARE': (0.50, 50, 500.0),
        'RUGS': (0.35, 10, 300.0), 'FEW': (0.90, 2, 10.0),
    },
    average=0.30, sold_items=1000, sold_retail=100000.0,
)
THIN = ep.SellerRates(slug='walmart', name='Walmart', by_category={}, average=0.4, sold_items=10, sold_retail=100.0)


def _fake(slug, **_):
    return FAKE if slug == 'target' else THIN


def _csv(*rows: str, header: str = HEADER) -> bytes:
    return (header + '\n'.join(rows) + '\n').encode('utf-8')


class RuleTests(SimpleTestCase):
    def est(self, lines, shelf=date(2026, 6, 1), rates=FAKE):
        return ep.manifest_estimate(lines, shelf, rates)

    def test_sum_product_uses_each_category_rate_with_a_30_percent_band(self):
        m = self.est([ep.Line('BICYCLES-PHYSICAL FITNESS', 2, 500, 'Bike'), ep.Line('KITCHENWARE', 10, 10, 'Pan')])
        self.assertAlmostEqual(m['retail'], 1100)
        self.assertAlmostEqual(m['likely'], 400 + 50)
        self.assertAlmostEqual(m['low'], 280 + 35)
        self.assertAlmostEqual(m['high'], 520 + 65)
        self.assertEqual(m['fill_in_share'], 0)
        self.assertEqual(m['categories'][0]['evidence'], '100 sold, $1,000 retail')

    def test_a_category_with_under_5_sold_uses_the_seller_average(self):
        m = self.est([ep.Line('MYSTERY', 1, 100, 'x'), ep.Line('FEW', 1, 100, 'y')])
        self.assertAlmostEqual(m['likely'], 60)
        self.assertEqual(m['fill_in_share'], 1)
        self.assertEqual({c['evidence'] for c in m['categories']}, {'no sales yet: Target average', '2 sold: Target average'})

    def test_missing_pieces_line_uses_its_low_rate_as_likely(self):
        m = self.est([ep.Line('KITCHENWARE', 1, 100, 'Set (Please be advised that sets may be missing pieces.)')])
        self.assertAlmostEqual(m['likely'], 35)
        self.assertAlmostEqual(m['high'], 65)
        self.assertAlmostEqual(m['missing_pieces_effect'], -15)
        self.assertEqual(m['missing_pieces_share'], 1)

    def test_christmas_in_time_and_late(self):
        line = [ep.Line('TRIM A TREE', 1, 100, 'Garland')]
        early = self.est(line, date(2026, 10, 20) + timedelta(days=ep.LEAD_DAYS))  # shelf Nov 10
        self.assertAlmostEqual(early['likely'], 22)
        self.assertEqual(early['seasons'][0]['rule'], 'Christmas in time')
        late = self.est(line, date(2026, 11, 10) + timedelta(days=ep.LEAD_DAYS))  # shelf Dec 1, after Nov 26
        self.assertAlmostEqual(late['likely'], 10)
        self.assertEqual(late['seasons'][0]['rule'], 'Christmas late')

    def test_the_season_rule_is_for_target_only(self):
        other = ep.SellerRates('walmart', 'Walmart', {'TRIM A TREE': (0.4, 20, 500.0)}, 0.4, 500, 1000.0)
        m = self.est([ep.Line('TRIM A TREE', 1, 100, 'Garland')], rates=other)
        self.assertAlmostEqual(m['likely'], 40)
        self.assertEqual(m['seasons'], [])

    def test_thanksgiving_dates(self):
        self.assertEqual(ep.thanksgiving(2026), date(2026, 11, 26))
        self.assertEqual(ep.thanksgiving(2027), date(2027, 11, 25))

    def test_halloween_is_late_after_nov_1_and_other_seasons_are_not_set(self):
        m = self.est([ep.Line('SEASONAL', 1, 100, 'Skeleton'), ep.Line('SEASONAL', 1, 100, 'Easter basket')], date(2026, 11, 26))
        self.assertEqual({s['rule'] for s in m['seasons']}, {'Halloween late', 'season not set'})
        self.assertAlmostEqual(m['likely'], 10 + 30)  # Easter: no SEASONAL sales in FAKE, so the average

    def test_missing_pieces_on_a_season_line_is_applied_once(self):
        m = self.est([ep.Line('TRIM A TREE', 1, 100, 'Tree, missing pieces')], date(2026, 11, 1))
        self.assertAlmostEqual(m['likely'], 12)

    def test_csv_parsing_skips_deleted_and_zero_lines_and_reads_the_seller(self):
        lines, seller = ep.lines_from_csv(_csv(
            'A,KITCHENWARE,Pan,2,10.00,20.00,1',
            'B,KITCHENWARE,DELETED_ITEM,1,10.00,10.00,2',
            'C,KITCHENWARE,Free,1,0,0,3',
            'D,RUGS,"Rug, big",1,"1,200.00","1,200.00",4',
        ))
        self.assertEqual([(ln.seller_category, ln.retail) for ln in lines], [('KITCHENWARE', 20), ('RUGS', 1200)])
        self.assertEqual(seller, 'target')

    def test_seller_from_columns(self):
        self.assertEqual(ep.seller_from_columns(['ASIN', 'Qty']), 'amazon')
        self.assertEqual(ep.seller_from_columns(['HMD - Order ID']), 'homedepot')
        self.assertEqual(ep.seller_from_columns(['Inventory Source', 'Warehouse']), 'walmart')
        self.assertEqual(ep.seller_from_columns(['Seller Category', 'Qty', 'Unit Retail']), '')

    def test_a_csv_that_is_not_a_manifest_says_so(self):
        with self.assertRaisesMessage(ep.EstimateError, 'not a B-Stock manifest'):
            ep.lines_from_csv(b'Title,Price\nA,1\n')

    def test_lot_id_from_link(self):
        self.assertEqual(ep.lot_id_from_link('https://bstock.com/buy/listings/details/6ae0d4bc896023da0b0bfe44?x=1'), '6ae0d4bc896023da0b0bfe44')
        self.assertEqual(ep.lot_id_from_link('see 6ae0d4bc896023da0b0bfe44 here'), '6ae0d4bc896023da0b0bfe44')
        self.assertEqual(ep.lot_id_from_link('nope'), '')


class SoldRatesTests(TestCase):
    def test_rate_is_sold_price_over_retail_of_sold_items_per_seller_category(self):
        cache.clear()
        vendor = Vendor.objects.update_or_create(code='TRGET', defaults={'name': 'Target', 'vendor_type': 'liquidation'})[0]
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='T-1', ordered_date='2026-05-01', status='complete')
        row = InvManifestRow.objects.create(purchase_order=po, row_number=1, taxonomy={'seller_category': 'Kitchenware'})
        now = timezone.now()
        product = Product.objects.create(title='Pan')
        for n, (retail, sold, sold_at) in enumerate([(20, 10, now), (20, 12, now), (20, None, None), (20, 0, now)]):
            Item.objects.create(product=product, sku=f'ITMEP{n:04d}', price=Decimal('9'), retail=Decimal(retail), sold_for=sold, sold_at=sold_at,
                                status='sold' if sold_at else 'on_shelf', purchase_order=po, manifest_row=row)
        r = ep.seller_rates('target', use_cache=False)
        # Only the two sold with a price count: (10 + 12) / (20 + 20). Unsold and $0 sales are left out.
        self.assertEqual(r.sold_items, 2)
        self.assertAlmostEqual(r.by_category['KITCHENWARE'][0], 0.55)
        self.assertAlmostEqual(r.average, 0.55)
        self.assertIsNone(ep.seller_rates('nobody'))


@patch.object(ep, 'seller_rates', side_effect=_fake)
class EstimateTests(TestCase):
    def setUp(self):
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        self.auction = Auction.objects.create(
            marketplace=self.mp, external_id='aa11', url='https://bstock.com/buy/listings/details/aa11',
            title='Target mixed', total_retail_value=Decimal('80000'), current_price=Decimal('10000'),
            end_time=timezone.make_aware(datetime(2099, 11, 10, 9, 0)), pallet_count=24,
        )

    def test_whole_truck_profit_is_retail_times_the_seller_average_minus_landed(self, _):
        r = ep.build_estimate(auction=self.auction, freight=3000.0, today=date(2026, 11, 5))
        self.assertEqual(r['method'], 'whole_truck')
        self.assertIn('wide range', r['tags'])
        self.assertIn('sold items only', r['tags'])
        self.assertAlmostEqual(r['landed'], 10000 + 500 + 3000)
        self.assertAlmostEqual(r['profit']['likely'], 80000 * 0.30 - 13500, delta=1)
        self.assertAlmostEqual(r['brings_in']['low'], 80000 * 0.21, delta=1)
        self.assertAlmostEqual(r['brings_in']['high'], 80000 * 0.39, delta=1)
        self.assertIn('15.7 points', r['miss_line'])

    def test_bid_up_to_at_20_and_23_percent_landed(self, _):
        r = ep.build_estimate(auction=self.auction, freight=3000.0)
        bids = {b['landed_pct']: b['bid'] for b in r['bid_up_to']}
        self.assertAlmostEqual(bids[0.20], (16000 - 3000) / 1.05, places=1)
        self.assertAlmostEqual(bids[0.23], (18400 - 3000) / 1.05, places=1)

    def test_no_freight_leaves_profit_out_and_says_so(self, _):
        r = ep.build_estimate(auction=self.auction)
        self.assertIsNone(r['freight']['used'])
        self.assertIsNone(r['profit'])
        self.assertIn('freight not included', r['tags'])
        self.assertAlmostEqual(r['landed'], 10500)

    def test_manifest_retail_is_used_and_a_big_difference_is_noted(self, _):
        lines = [ep.Line('KITCHENWARE', 1, 1000, 'Pan')]
        r = ep.build_estimate(auction=self.auction, lines=lines, manifest_source='your CSV', freight=0.0)
        self.assertEqual(r['retail']['source'], 'manifest')
        self.assertEqual(r['retail']['used'], 1000)
        self.assertEqual(r['retail']['bstock'], 80000)
        self.assertTrue(r['notes'])

    def test_a_stored_manifest_far_from_bstock_retail_falls_back_to_the_whole_truck(self, _):
        lines = [ep.Line('KITCHENWARE', 1, 200000, 'Pan')]
        r = ep.build_estimate(auction=self.auction, lines=lines, manifest_source='manifest stored on the lot', freight=0.0)
        self.assertEqual(r['method'], 'whole_truck')
        self.assertEqual(r['retail']['used'], 80000)
        self.assertIn('may be another lot', r['notes'][0])
        r = ep.build_estimate(auction=self.auction, lines=lines, manifest_source='your CSV', freight=0.0)
        self.assertEqual(r['method'], 'manifest')
        self.assertIn('far apart', r['notes'][0])

    def test_freight_formula_uses_the_city_at_the_end_of_the_title(self, _):
        ShippingOrigin.objects.update_or_create(slug='indianapolis-in', defaults={'city': 'Indianapolis, IN', 'miles': 616})
        self.auction.title = '24 Pallets of Home, Ext. Retail $80,000, Indianapolis, IN'
        self.auction.shipment_type = 'Truckload'
        r = ep.build_estimate(auction=self.auction)
        self.assertEqual(r['freight']['basis'], 'formula')
        self.assertEqual(r['freight']['formula']['miles'], 616)
        self.assertIsNotNone(r['profit'])

    def test_no_miles_gives_the_real_reason(self, _):
        self.auction.title = 'Lot, Nowhere, ZZ'
        r = ep.build_estimate(auction=self.auction)
        self.assertEqual(r['freight']['reason'], 'no driving miles for Nowhere, ZZ yet')

    def test_an_ended_lot_says_last_bid_seen(self, _):
        self.auction.end_time = timezone.now() - timedelta(days=3)
        r = ep.build_estimate(auction=self.auction, freight=0.0)
        self.assertIn('ended', r['tags'])
        self.assertIn('last bid seen', r['price_basis'])
        self.assertIsNone(r['price'])
        self.assertIsNone(r['profit'])
        self.assertAlmostEqual(ep.build_estimate(auction=self.auction, price=9000.0, freight=0.0)['landed'], 9450)

    def test_very_high_retail_a_pallet_is_flagged(self, _):
        self.auction.pallet_count = 6
        r = ep.build_estimate(auction=self.auction, freight=0.0)
        self.assertTrue(any('a pallet is high' in n for n in r['notes']))
        self.assertIn('check retail', r['tags'])

    def test_weak_estimate_when_over_30_percent_uses_the_seller_average(self, _):
        lines = [ep.Line('MYSTERY', 1, 400, 'x'), ep.Line('KITCHENWARE', 1, 600, 'y')]
        r = ep.build_estimate(auction=self.auction, lines=lines, manifest_source='your CSV', freight=0.0)
        self.assertIn('weak estimate', r['tags'])
        lines = [ep.Line('MYSTERY', 1, 200, 'x'), ep.Line('KITCHENWARE', 1, 800, 'y')]
        r = ep.build_estimate(auction=self.auction, lines=lines, manifest_source='your CSV', freight=0.0)
        self.assertNotIn('weak estimate', r['tags'])

    def test_shelf_date_is_close_plus_lead_time(self, _):
        r = ep.build_estimate(auction=self.auction, freight=0.0)
        self.assertEqual(r['close_date'], '2099-11-10')
        self.assertEqual(r['shelf_date'], '2099-12-01')

    def test_a_seller_with_too_few_sales_gets_not_yet(self, _):
        wm = Marketplace.objects.update_or_create(slug='walmart', defaults={'name': 'Walmart'})[0]
        a = Auction.objects.create(marketplace=wm, external_id='bb22', total_retail_value=Decimal('5000'))
        r = ep.build_estimate(auction=a)
        self.assertFalse(r['supported'])
        self.assertIn('Not yet for Walmart', r['message'])

    def test_a_manifest_with_no_seller_asks_which(self, _):
        with self.assertRaisesMessage(ep.EstimateError, 'Which seller'):
            ep.build_estimate(lines=[ep.Line('X', 1, 10, 'x')])

    def test_contract_lot_is_labelled(self, _):
        self.auction.listing_type = 'CONTRACT'
        self.auction.save()
        r = ep.build_estimate(auction=self.auction, freight=0.0)
        self.assertIn('contract, no bidding', r['tags'])
        self.assertEqual(r['price_basis'], 'contract price')


@patch.object(ep, 'seller_rates', side_effect=_fake)
class EstimateApiTests(APITestCase):
    URL = '/api/buying/estimate-profit/'

    def setUp(self):
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        self.auction = Auction.objects.create(
            marketplace=self.mp, external_id='cc33', url='https://bstock.com/buy/listings/details/cc33',
            total_retail_value=Decimal('1000'), current_price=Decimal('100'),
        )
        user = User.objects.create_user('buyer@example.com', 'Test', 'User', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user)

    def test_link_uses_the_stored_manifest(self, _):
        ManifestRow.objects.create(
            auction=self.auction, row_number=1,
            raw_data={'Seller Category': 'KITCHENWARE', 'Item Description': 'Pan', 'Qty': '10', 'Unit Retail': '100'},
        )
        r = self.client.post(self.URL, {'link': self.auction.url, 'freight': '50'}, format='multipart')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['method'], 'manifest')
        self.assertEqual(r.data['manifest_source'], 'manifest stored on the lot')
        self.assertAlmostEqual(r.data['brings_in']['likely'], 500)
        self.assertAlmostEqual(r.data['landed'], 100 + 5 + 50)

    def test_a_dropped_csv_wins_over_the_stored_rows(self, _):
        f = SimpleUploadedFile('m.csv', _csv('A,RUGS,Rug,1,200,200,1'), content_type='text/csv')
        r = self.client.post(self.URL, {'link': self.auction.url, 'file': f}, format='multipart')
        self.assertEqual(r.data['manifest_source'], 'your CSV')
        self.assertAlmostEqual(r.data['brings_in']['likely'], 70)

    def test_a_csv_alone_reads_its_seller_from_the_columns(self, _):
        f = SimpleUploadedFile('m.csv', _csv('A,RUGS,Rug,1,200,200,1'), content_type='text/csv')
        r = self.client.post(self.URL, {'file': f, 'price': '20'}, format='multipart')
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data['lot'])
        self.assertEqual(r.data['seller'], 'Target')
        self.assertAlmostEqual(r.data['landed'], 21)

    def test_a_csv_that_does_not_say_its_seller_needs_one_picked(self, _):
        header = 'Seller Category,Item Description,Qty,Unit Retail\n'
        f = SimpleUploadedFile('m.csv', _csv('COOKWARE,Pan,1,50', header=header), content_type='text/csv')
        r = self.client.post(self.URL, {'file': f}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertIn('Which seller', r.data['detail'])
        f = SimpleUploadedFile('m.csv', _csv('COOKWARE,Pan,1,50', header=header), content_type='text/csv')
        r = self.client.post(self.URL, {'file': f, 'seller': 'target'}, format='multipart')
        self.assertAlmostEqual(r.data['brings_in']['likely'], 15)  # no Cookware sales: Target average 30%

    def test_unknown_lot_and_bad_input(self, _):
        r = self.client.post(self.URL, {'link': 'https://bstock.com/buy/listings/details/zz99'}, format='multipart')
        self.assertTrue(r.data['not_found'])
        self.assertEqual(self.client.post(self.URL, {}, format='multipart').status_code, 400)
        r = self.client.post(self.URL, {'link': self.auction.url, 'price': 'abc'}, format='multipart')
        self.assertEqual(r.status_code, 400)
        r = self.client.post(self.URL, {'link': self.auction.url, 'seller': 'ebay'}, format='multipart')
        self.assertEqual(r.status_code, 400)

    def test_signed_out_is_refused(self, _):
        self.client.force_authenticate(None)
        r = self.client.post(self.URL, {'link': self.auction.url}, format='multipart')
        self.assertIn(r.status_code, (401, 403))
