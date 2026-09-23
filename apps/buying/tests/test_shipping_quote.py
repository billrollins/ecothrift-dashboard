"""B-Stock shipping quotes: parsing, the direct call, valuation precedence, and the API."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from apps.buying.models import Auction, BStockToken
from apps.buying.services import scraper
from apps.buying.services.bstock_token_store import save_token
from apps.buying.services.shipping_quote import refresh_shipping_quote
from apps.buying.services.valuation import cost_sources, recompute_auction_valuation
from apps.buying.tests.test_manifest_pull import _auction, _jwt, _owner, _target

User = get_user_model()


def _quote(**over) -> dict:
    q = {
        '_id': 'q1',
        'active': True,
        'selected': True,
        'totalPrice': 273233,
        'transportMode': 'TL',
        'truckCount': 1,
        'carrier': {'code': 'XPO', 'name': 'RXO Logistics'},
        'destination': {'zip': '68124-3132'},
        'createdAt': '2026-09-23T16:22:16.081Z',
    }
    q.update(over)
    return q


class PickShippingQuoteTests(SimpleTestCase):
    def test_reads_the_selected_quote_in_cents(self):
        quote = scraper.pick_shipping_quote(
            {'quotes': [_quote(_id='other', selected=False, totalPrice=99900), _quote()]}
        )
        self.assertEqual(quote.amount_cents, 273233)
        self.assertEqual(
            quote.info(),
            {
                'carrier': 'RXO Logistics',
                'mode': 'TL',
                'trucks': 1,
                'destination_zip': '68124-3132',
                'quote_id': 'q1',
                'quoted_at': '2026-09-23T16:22:16.081Z',
            },
        )

    def test_falls_back_to_the_first_active_quote(self):
        quote = scraper.pick_shipping_quote(
            {'quotes': [_quote(_id='old', active=False, selected=True), _quote(_id='live', selected=False)]}
        )
        self.assertEqual(quote.quote_id, 'live')

    def test_nothing_usable_is_none(self):
        for body in (
            None,
            [],
            {'quotes': []},
            {'quotes': 'x'},
            {'quotes': [_quote(totalPrice=0)]},
            {'quotes': [_quote(totalPrice=None)]},
            {'quotes': [_quote(totalPrice=True)]},
            {'quotes': [_quote(active=False)]},
        ):
            with self.subTest(body=body):
                self.assertIsNone(scraper.pick_shipping_quote(body))

    def test_fetch_is_direct_with_the_handed_over_login(self):
        with patch.object(scraper, '_request_json', return_value={'quotes': [_quote()]}) as req:
            quote = scraper.fetch_shipping_quote('listing-1', bearer='owner-token')
        self.assertEqual(quote.amount_cents, 273233)
        kwargs = req.call_args.kwargs
        self.assertEqual(req.call_args.args, ('GET', scraper.SHIPMENT_QUOTES_URL))
        self.assertEqual(kwargs['params'], {'listingId': 'listing-1', 'selected': 'true'})
        self.assertEqual(kwargs['bearer'], 'owner-token')
        self.assertEqual(kwargs['proxies'], {})
        self.assertTrue(kwargs['raise_errors'])


class ValuationPrecedenceTests(TestCase):
    def setUp(self):
        self.mp = _target()
        self.mp.default_fee_rate = Decimal('0.05')
        self.mp.default_shipping_rate = Decimal('0.40')
        self.mp.save()
        self.auction = _auction(self.mp, 'v1', current_price=Decimal('1000.00'))

    def _costs(self):
        a = Auction.objects.select_related('marketplace').get(pk=self.auction.pk)
        recompute_auction_valuation(a)
        a.refresh_from_db()
        return a.estimated_fees, a.estimated_shipping, cost_sources(a)

    def test_rate_estimate_without_a_quote(self):
        fees, shipping, src = self._costs()
        self.assertEqual((fees, shipping), (Decimal('50.00'), Decimal('400.00')))
        self.assertEqual(Decimal(src['fee_rate_applied']), Decimal('0.05'))
        self.assertEqual(Decimal(src['shipping_rate_applied']), Decimal('0.40'))
        self.assertEqual(src['shipping_source'], 'estimate')

    def test_quote_beats_the_rate(self):
        Auction.objects.filter(pk=self.auction.pk).update(shipping_quote=Decimal('2732.33'))
        fees, shipping, src = self._costs()
        self.assertEqual((fees, shipping), (Decimal('50.00'), Decimal('2732.33')))
        self.assertEqual(src['shipping_source'], 'quote')
        self.assertIsNone(src['shipping_rate_applied'])

    def test_override_beats_the_quote(self):
        Auction.objects.filter(pk=self.auction.pk).update(
            shipping_quote=Decimal('2732.33'), shipping_override=Decimal('900'), fees_override=Decimal('10')
        )
        fees, shipping, src = self._costs()
        self.assertEqual((fees, shipping), (Decimal('10.00'), Decimal('900.00')))
        self.assertEqual(
            src,
            {'fee_rate_applied': None, 'shipping_rate_applied': None, 'shipping_source': 'override', 'shipping_estimate': None},
        )

    def test_no_quote_keeps_a_stored_one(self):
        Auction.objects.filter(pk=self.auction.pk).update(shipping_quote=Decimal('2732.33'))
        self.auction.refresh_from_db()
        with patch.object(scraper, 'fetch_shipping_quote', return_value=None):
            self.assertIsNone(refresh_shipping_quote(self.auction, bearer='t'))
        self.auction.refresh_from_db()
        self.assertEqual(self.auction.shipping_quote, Decimal('2732.33'))


class ShippingQuoteApiTests(TestCase):
    def setUp(self):
        self.owner = _owner()
        self.mp = _target()
        self.auction = _auction(self.mp, 'listing-9', current_price=Decimal('8525.00'))
        self.url = f'/api/buying/auctions/{self.auction.pk}/shipping-quote/'
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def _login(self) -> str:
        token = _jwt(timedelta(minutes=50))
        save_token(token)
        return token

    def test_superuser_only(self):
        admin, _ = Group.objects.get_or_create(name='Admin')
        user = User.objects.create_user('admin@x.test', 'Ad', 'Min', password='x')
        user.groups.add(admin)
        self.client.force_authenticate(user)
        with patch.object(scraper, 'fetch_shipping_quote') as fetch:
            self.assertEqual(self.client.post(self.url).status_code, 403)
        fetch.assert_not_called()

    def test_needs_a_login(self):
        with patch.object(scraper, 'fetch_shipping_quote') as fetch:
            r = self.client.post(self.url)
        self.assertEqual((r.status_code, r.data['code']), (409, 'no_login'))
        fetch.assert_not_called()

    def test_quote_is_saved_and_valued(self):
        token = self._login()
        quote = scraper.pick_shipping_quote({'quotes': [_quote()]})
        with patch.object(scraper, 'fetch_shipping_quote', return_value=quote) as fetch:
            r = self.client.post(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(fetch.call_args.args[0], 'listing-9')
        self.assertEqual(fetch.call_args.kwargs['bearer'], token)
        self.assertEqual(r.data['shipping_quote'], '2732.33')
        self.assertEqual(r.data['estimated_shipping'], '2732.33')
        self.assertEqual(r.data['shipping_source'], 'quote')
        self.assertEqual(r.data['shipping_quote_info']['carrier'], 'RXO Logistics')

    def test_no_quote_yet(self):
        self._login()
        for outcome in (None, scraper.BStockHTTPError(404)):
            with self.subTest(outcome=outcome):
                kw = {'side_effect': outcome} if isinstance(outcome, Exception) else {'return_value': outcome}
                with patch.object(scraper, 'fetch_shipping_quote', **kw):
                    r = self.client.post(self.url)
                self.assertEqual((r.status_code, r.data['code']), (404, 'no_quote'))

    def test_refused_login_is_forgotten(self):
        self._login()
        with patch.object(scraper, 'fetch_shipping_quote', side_effect=scraper.BStockAuthError('401')):
            r = self.client.post(self.url)
        self.assertEqual((r.status_code, r.data['code']), (409, 'login_refused'))
        self.assertFalse(BStockToken.objects.exists())

    def test_bstock_down(self):
        self._login()
        for exc in (scraper.BStockUnavailable('timeout'), scraper.BStockHTTPError(500)):
            with self.subTest(exc=exc):
                with patch.object(scraper, 'fetch_shipping_quote', side_effect=exc):
                    r = self.client.post(self.url)
                self.assertEqual(r.status_code, 502)
        self.assertTrue(BStockToken.objects.exists())


class ListingPalletsAndOriginTests(SimpleTestCase):
    def test_pallet_count_prefers_bstock_then_the_title(self):
        from apps.buying.services.listing_mapping import pallet_count_from_listing

        cases = [
            ({'palletCount': 23}, 'Truckload (26 Pallets) of Diapers', 23),
            ({'palletCount': 0}, 'Truckload (23 Pallets) of Diapers', 23),
            ({}, '3 Pallet Spaces of Sports & Outdoors', 3),
            ({}, 'Est. 1 Pallet of FBA Sporting Goods', 1),
            ({}, '12 Boxes of Shoes', None),
            ({'palletCount': 'x'}, '', None),
        ]
        for raw, title, want in cases:
            with self.subTest(title=title):
                self.assertEqual(pallet_count_from_listing(raw, title), want)

    def test_origin_is_city_and_state(self):
        from apps.buying.services.listing_mapping import origin_from_listing

        self.assertEqual(
            origin_from_listing({'sellerCity': 'Franklin', 'provinceCode': 'IN', 'sellerZipCode': '46131'}),
            ('Franklin, IN', '46131'),
        )
        self.assertEqual(origin_from_listing({'sellerCity': 'Chelsea'}), ('Chelsea', ''))
        self.assertEqual(origin_from_listing({}), ('', ''))


class SweepKeepsPalletsTests(TestCase):
    def test_sweep_saves_and_keeps_pallets_and_origin(self):
        from django.utils import timezone

        from apps.buying.services.sweep_upsert import upsert_listings_raw

        mp = _target()
        now = timezone.now()
        full = {
            'listingId': 'L-1',
            'title': 'Truckload of Diapers',
            'lotId': 'lot-1',
            'palletCount': 23,
            'sellerCity': 'Franklin',
            'provinceCode': 'IN',
            'sellerZipCode': '46131',
            'shipmentType': 'Truckload',
        }
        _, _, _, errors, ids = upsert_listings_raw(mp.pk, 'sf', [full], now)
        self.assertEqual(errors, 0)
        a = Auction.objects.get(pk=ids[0])
        self.assertEqual(
            (a.pallet_count, a.origin_city, a.origin_zip, a.shipment_type),
            (23, 'Franklin, IN', '46131', 'Truckload'),
        )
        # A later listing that stops saying where or how much keeps what we knew.
        bare = {'listingId': 'L-1', 'title': 'Truckload of Diapers', 'lotId': 'lot-1'}
        _, _, _, errors, _ = upsert_listings_raw(mp.pk, 'sf', [bare], now)
        self.assertEqual(errors, 0)
        a.refresh_from_db()
        self.assertEqual(
            (a.pallet_count, a.origin_city, a.origin_zip, a.shipment_type),
            (23, 'Franklin, IN', '46131', 'Truckload'),
        )


FORMULA = {
    'truckload': {'fixed': 1000, 'per_mile': 2},
    'ltl': {'fixed': 300, 'per_pallet': 40, 'per_pallet_mile': 0.1},
    'truckload_min_pallets': 16,
    'typical_error': {'truckload': 0.2, 'ltl': 0.25},
}


class PalletEstimateTests(TestCase):
    def setUp(self):
        from apps.buying.models import ShippingOrigin
        from apps.core.models import AppSetting

        self.mp = _target()
        self.mp.default_fee_rate = Decimal('0.05')
        self.mp.default_shipping_rate = Decimal('0.40')
        self.mp.save()
        AppSetting.objects.update_or_create(key='buying_shipping_per_pallet', defaults={'value': 100})
        AppSetting.objects.update_or_create(key='buying_shipping_formula', defaults={'value': FORMULA})
        ShippingOrigin.objects.update_or_create(slug='franklin-in', defaults={'city': 'Franklin, IN', 'miles': 637})

    def _lot(self, ext, **fields):
        fields.setdefault('current_price', Decimal('1000.00'))
        return _auction(self.mp, ext, **fields)

    def _estimate(self, auction):
        from apps.buying.services.valuation import shipping_estimate

        a = Auction.objects.select_related('marketplace').get(pk=auction.pk)
        return shipping_estimate(a)

    def test_truckload_from_distance(self):
        est = self._estimate(self._lot('t', pallet_count=23, origin_city='Franklin, IN', shipment_type='Truckload'))
        self.assertEqual((est['basis'], est['mode'], est['miles']), ('formula', 'truckload', 637))
        # 1000 + 2 x 637
        self.assertEqual(est['amount'], Decimal('2274.00'))
        self.assertEqual((est['low'], est['high']), (Decimal('1819.20'), Decimal('2728.80')))

    def test_ltl_from_distance_and_pallets(self):
        est = self._estimate(self._lot('l', pallet_count=4, origin_city='Franklin, IN', shipment_type='LTL'))
        # 300 + 40 x 4 + 0.1 x 4 x 637
        self.assertEqual((est['mode'], est['amount']), ('ltl', Decimal('714.80')))

    def test_many_pallets_count_as_a_truckload(self):
        est = self._estimate(self._lot('big', pallet_count=20, origin_city='Franklin, IN'))
        self.assertEqual(est['mode'], 'truckload')

    def test_unknown_distance_uses_the_default_per_pallet(self):
        est = self._estimate(self._lot('far', pallet_count=23, origin_city='Pittston, PA'))
        self.assertEqual((est['basis'], est['amount']), ('pallets', Decimal('2300.00')))

    def test_no_pallets_falls_back_to_rate_x_price(self):
        est = self._estimate(self._lot('parcel', pallet_count=None, origin_city='Franklin, IN'))
        self.assertEqual((est['basis'], est['amount']), ('rate', Decimal('400.00')))

    def test_valuation_and_sources_use_the_formula(self):
        lot = self._lot('v', pallet_count=23, origin_city='Franklin, IN', shipment_type='Truckload')
        a = Auction.objects.select_related('marketplace').get(pk=lot.pk)
        recompute_auction_valuation(a)
        a.refresh_from_db()
        self.assertEqual(a.estimated_shipping, Decimal('2274.00'))
        src = cost_sources(a)
        self.assertEqual(src['shipping_source'], 'estimate')
        # A formula estimate does not grow with the bid.
        self.assertIsNone(src['shipping_rate_applied'])
        self.assertEqual((src['shipping_estimate']['basis'], src['shipping_estimate']['amount']), ('formula', '2274.00'))

    def test_bulk_recompute_uses_the_formula(self):
        from apps.buying.services.valuation import recompute_active_auctions_lightweight

        lot = self._lot('bulk', pallet_count=23, origin_city='Franklin, IN', shipment_type='Truckload')
        recompute_active_auctions_lightweight()
        lot.refresh_from_db()
        self.assertEqual(lot.estimated_shipping, Decimal('2274.00'))


class ShippingFormulaTests(TestCase):
    def test_city_and_pallets_from_text(self):
        from apps.buying.services.shipping_formula import city_from_text, pallets_from_text

        self.assertEqual(
            city_from_text('4 Pallets of Home Decor, 88 Units, Ext. Retail $5,027, Indianapolis, IN'), 'Indianapolis, IN'
        )
        self.assertEqual(city_from_text('Fast Shipping - 5 Pallets of Amazon-Owned Home Improvement'), '')
        self.assertEqual(pallets_from_text('Truckload (21 Pallet Spaces) of Furniture'), 21)
        self.assertIsNone(pallets_from_text('Truckload of Unmanifested Appliances'))

    def _rows(self):
        miles = {'a-aa': 300, 'b-bb': 600, 'c-cc': 900}
        rows = []
        for ym, scale in (('2025-01', 1.0), ('2026-08', 1.5)):
            for slug, m in miles.items():
                for p in (18, 24):
                    rows.append({'city_slug': slug, 'pallets': p, 'truckload': True, 'ym': ym,
                                 'shipping': Decimal(str(round((1000 + 2 * m) * scale, 2)))})
                for p in (1, 3, 5):
                    rows.append({'city_slug': slug, 'pallets': p, 'truckload': False, 'ym': ym,
                                 'shipping': Decimal(str(round(300 + 40 * p + 0.1 * p * m, 2)))})
        return rows, miles

    def test_fit_takes_the_shape_from_all_rows_and_the_level_from_recent_ones(self):
        from datetime import date

        from apps.buying.services.shipping_formula import fit_formula, formula_amount

        rows, miles = self._rows()
        f = fit_formula(rows, miles, today=date(2026, 9, 23))
        # Truckloads cost 1.5x lately: the formula predicts today's price.
        self.assertAlmostEqual(f['level']['truckload'], 1.2, places=2)
        self.assertAlmostEqual(float(formula_amount(20, 600, True, f)), 1.5 * (1000 + 2 * 600), delta=5)
        # LTL did not move: no level, and the exact formula comes back.
        self.assertEqual(f['level']['ltl'], 1.0)
        self.assertAlmostEqual(f['ltl']['fixed'], 300, delta=1)
        self.assertAlmostEqual(f['ltl']['per_pallet'], 40, delta=0.5)
        self.assertAlmostEqual(f['ltl']['per_pallet_mile'], 0.1, delta=0.001)
        self.assertEqual((f['rows'], f['cities']), (len(rows), 3))

    def test_fit_needs_enough_history(self):
        from apps.buying.services.shipping_formula import fit_formula

        rows, miles = self._rows()
        with self.assertRaises(ValueError):
            fit_formula([r for r in rows if not r['truckload']], miles)

    def test_ensure_origin_miles_looks_up_only_new_cities(self):
        from apps.buying.models import ShippingOrigin
        from apps.buying.services import shipping_formula

        # buying/0024 seeds Franklin; make sure it has a distance.
        ShippingOrigin.objects.update_or_create(slug='franklin-in', defaults={'city': 'Franklin, IN', 'miles': 637})
        with patch.object(shipping_formula, 'lookup_driving_miles', return_value={'Pittston, PA': 1150}) as lookup:
            found = shipping_formula.ensure_origin_miles(['Franklin, IN', 'Pittston, PA', 'Pittston, PA', ''])
        self.assertEqual(found, 1)
        lookup.assert_called_once_with(['Pittston, PA'])
        self.assertEqual(ShippingOrigin.objects.get(slug='pittston-pa').miles, 1150)

    def test_a_failed_lookup_waits_thirty_days(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.buying.models import ShippingOrigin
        from apps.buying.services import shipping_formula

        now = timezone.now()
        with patch.object(shipping_formula, 'lookup_driving_miles', return_value={}) as lookup:
            shipping_formula.ensure_origin_miles(['Nowhere, ZZ'], now=now)
            shipping_formula.ensure_origin_miles(['Nowhere, ZZ'], now=now + timedelta(days=1))
            self.assertEqual(lookup.call_count, 1)
            shipping_formula.ensure_origin_miles(['Nowhere, ZZ'], now=now + timedelta(days=31))
            self.assertEqual(lookup.call_count, 2)
        self.assertIsNone(ShippingOrigin.objects.get(slug='nowhere-zz').miles)

    def test_lookup_asks_for_us_addresses_and_reads_meters(self):
        from apps.buying.services import shipping_formula
        from apps.pos.services import delivery_distance as dd

        answer = [{'originIndex': 0, 'destinationIndex': 0, 'distanceMeters': 2430000}]
        with patch.object(dd, '_maps_api_key', return_value='k'), patch.object(
            dd, '_http_post_json', return_value=(answer, 200, None)
        ) as post:
            miles = shipping_formula.lookup_driving_miles(['Ontario, CA'])
        self.assertEqual(miles, {'Ontario, CA': 1510})
        body = post.call_args.args[1]
        self.assertEqual(body['destinations'], [{'waypoint': {'address': 'Ontario, CA, USA'}}])

    def test_history_reads_purchase_orders(self):
        from datetime import date

        from apps.buying.services.shipping_formula import shipping_history
        from apps.inventory.models import PurchaseOrder, Vendor

        vendor = Vendor.objects.create(name='Target', code='TGT')
        PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-1', ordered_date=date(2026, 8, 26), purchase_cost=Decimal('550'),
            shipping_cost=Decimal('445.74'), fees=Decimal('43.24'),
            description='4 Pallets of Lighting & More, 125 Units, Ext. Retail $7,245, Indianapolis, IN',
        )
        PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-2', ordered_date=date(2026, 8, 26), shipping_cost=Decimal('100'),
            description='Fast Shipping - 5 Pallets of Home Goods',
        )
        PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-3', ordered_date=date(2026, 8, 26), shipping_cost=None,
            description='4 Pallets of Toys, Indianapolis, IN',
        )
        rows = shipping_history()
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(
            (row['city_slug'], row['city'], row['vendor'], row['pallets'], row['truckload'], row['ym']),
            ('indianapolis-in', 'Indianapolis, IN', 'TGT', 4, False, '2026-08'),
        )
        self.assertEqual((row['shipping'], row['fee'], row['cost']), (Decimal('445.74'), Decimal('43.24'), Decimal('550')))
