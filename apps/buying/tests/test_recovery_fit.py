"""Dash #77: 90-day recovery rates, scored blind, read by Estimate Profit, every estimate saved."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.buying.models import Auction, EstimateLog, Marketplace, RecoveryFit
from apps.buying.services import estimate_profit as ep
from apps.buying.services import recovery_fit as rf
from apps.core.models import AppSetting
from apps.inventory.models import Item, Product, PurchaseOrder, Vendor
from apps.inventory.models import ManifestRow as InvManifestRow

TODAY = date(2026, 11, 5)


def _truck(po, rate, *, retail=10000.0, cats=None, days=120, seller='target'):
    first = TODAY - timedelta(days=days)
    t = rf.Truck(po=po, seller=seller, ordered=first - timedelta(days=20), first_sale=first)
    for sc, share in (cats or {'MIXED': 1.0}).items():
        t.cats[sc] = [retail * share, retail * share * rate, retail * share * rate * 1.2]
    return t


class FitTests(SimpleTestCase):
    def test_under_three_scored_trucks_is_not_yet_and_young_trucks_do_not_count(self):
        out = rf.fit_seller([_truck(1, 0.3), _truck(2, 0.3), _truck(3, 0.3, days=60)], TODAY)
        self.assertEqual((out['status'], out['scored_trucks'], out['young_trucks']), ('not_yet', 2, 1))

    def test_blind_score_predicts_each_truck_from_the_others(self):
        trucks = [_truck(1, 0.20), _truck(2, 0.30), _truck(3, 0.40)]
        out = rf.fit_seller(trucks, TODAY)
        by_po = {s['po']: s for s in out['scores']}
        # Truck 1 is predicted at the others' pooled 35%: 15 points high.
        self.assertAlmostEqual(by_po[1]['miss'], 15.0)
        self.assertAlmostEqual(by_po[3]['miss'], -15.0)
        self.assertAlmostEqual(out['summary']['median_miss'], 15.0)
        self.assertAlmostEqual(out['rates']['whole']['likely'], 0.30)
        self.assertEqual(out['rates']['whole']['band'], 'judgement band')  # under 5 trucks

    def test_a_category_needs_three_scored_trucks_with_1000_of_it(self):
        both = {'TOYS': 0.5, 'MIXED': 0.5}
        trucks = [_truck(1, 0.3, cats=both), _truck(2, 0.3, cats=both), _truck(3, 0.3, cats={'MIXED': 1.0})]
        out = rf.fit_seller(trucks, TODAY)
        self.assertNotIn('TOYS', out['rates']['categories'])  # on 2 trucks only
        trucks.append(_truck(4, 0.3, cats=both))
        out = rf.fit_seller(trucks, TODAY)
        self.assertIn('TOYS', out['rates']['categories'])

    def test_quartile_band_from_five_trucks(self):
        trucks = [_truck(n, r) for n, r in enumerate((0.1, 0.2, 0.3, 0.4, 0.5), start=1)]
        out = rf.fit_seller(trucks, TODAY)
        w = out['rates']['whole']
        self.assertEqual(w['band'], 'quartiles')
        self.assertAlmostEqual(w['low'], 0.2)
        self.assertAlmostEqual(w['high'], 0.4)


class LoadTrucksTests(TestCase):
    def test_r90_counts_sales_within_90_days_of_the_first_sale_and_flags_bad_rows(self):
        vendor = Vendor.objects.update_or_create(code='TRGET', defaults={'name': 'Target', 'vendor_type': 'liquidation'})[0]
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='T-9', ordered_date='2026-05-01', status='complete')
        row = InvManifestRow.objects.create(purchase_order=po, row_number=1, quantity=10, unit_retail=Decimal('100'),
                                            taxonomy={'seller_category': 'Kitchenware'})
        InvManifestRow.objects.create(purchase_order=po, row_number=2, quantity=3, unit_retail=Decimal('0'),
                                      taxonomy={'seller_category': 'Kitchenware'})
        first = timezone.make_aware(datetime(2026, 6, 1, 12))
        product = Product.objects.create(title='Pan')

        def item(n, sold, when, *, linked=True):
            Item.objects.create(product=product, sku=f'ITMRF{n:04d}', price=Decimal('9'), retail=Decimal('100'),
                                sold_for=sold, sold_at=when, status='sold' if when else 'on_shelf',
                                purchase_order=po, manifest_row=row if linked else None)

        item(1, 40, first)
        item(2, 30, first + timedelta(days=89))
        item(3, 50, first + timedelta(days=120))  # after the 90 days
        item(4, 0, first + timedelta(days=5))  # $0 is not a sale
        item(5, 25, first + timedelta(days=3), linked=False)  # no manifest row: flagged, not counted
        item(6, None, None)
        [t] = rf.load_trucks(TODAY)
        self.assertEqual(t.first_sale, date(2026, 6, 1))
        self.assertAlmostEqual(t.retail, 1000.0)  # the $0 row is left out of retail
        self.assertAlmostEqual(t.sold90, 70.0)
        self.assertEqual(t.zero_rows, 1)
        self.assertAlmostEqual(t.unlinked_sold, 25.0)
        self.assertEqual(t.cats['KITCHENWARE'][0], 1000.0)


def _fit_row(**seller_block):
    block = {
        'status': 'ok',
        'rates': {
            'whole': {'low': 0.24, 'likely': 0.28, 'high': 0.35, 'retail': 100000.0, 'trucks': 8, 'band': 'quartiles'},
            'categories': {'TOYS': {'low': 0.3, 'likely': 0.4, 'high': 0.5, 'retail': 5000.0, 'trucks': 3, 'band': 'judgement band'}},
        },
        'scores': [{'po': 999, 'actual': 3000.0, 'retail': 10000.0, 'predicted': 2800.0, 'miss': -2.0}],
        'summary': {'trucks': 8, 'median_miss': 7.3, 'worst_miss': 16.6, 'within_4': 2, 'mean_signed': -0.4,
                    'thin': False, 'whole_median_miss': 7.3},
        'scored_trucks': 8,
        'young_trucks': 7,
        **seller_block,
    }
    return RecoveryFit.objects.create(sellers={'target': block, 'costco': {'status': 'not_yet', 'scored_trucks': 2}})


class EstimateWithFitTests(TestCase):
    def setUp(self):
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        self.auction = Auction.objects.create(
            marketplace=self.mp, external_id='rf11', url='https://bstock.com/buy/listings/details/rf11',
            title='Target mixed', total_retail_value=Decimal('80000'), current_price=Decimal('10000'),
            end_time=timezone.make_aware(datetime(2099, 11, 10, 9, 0)), pallet_count=24,
        )

    def test_whole_truck_uses_the_fit_band_and_says_the_blind_miss_in_dollars(self):
        _fit_row()
        r = ep.build_estimate(auction=self.auction, freight=3000.0)
        self.assertEqual(r['rates_source'], 'recovery')
        self.assertAlmostEqual(r['brings_in']['likely'], 80000 * 0.28, delta=1)
        self.assertAlmostEqual(r['brings_in']['low'], 80000 * 0.24, delta=1)
        self.assertIn('first 90 days of selling', r['tags'])
        self.assertIn('Blind test on 8 Target trucks: usually off 7.3 points', r['miss_line'])
        self.assertIn('$5,840 on this lot', r['miss_line'])  # 7.3% of $80,000
        self.assertIn('neither high nor low', r['miss_line'])

    def test_a_category_with_its_own_rate_and_the_rest_at_whole_truck(self):
        _fit_row()
        lines = [ep.Line('TOYS', 1, 1000, 'Doll'), ep.Line('RUGS', 1, 1000, 'Rug')]
        r = ep.build_estimate(auction=self.auction, lines=lines, manifest_source='your CSV', freight=0.0)
        self.assertAlmostEqual(r['brings_in']['likely'], 400 + 280, delta=1)
        self.assertAlmostEqual(r['fill_in_share'], 0.5)

    def test_a_seller_without_enough_scored_trucks_is_not_yet(self):
        _fit_row()
        r = ep.build_estimate(seller='costco', lines=[ep.Line('X', 1, 100, 'x')], manifest_source='your CSV')
        self.assertFalse(r['supported'])
        self.assertIn('2 of our Costco trucks have 90 days of selling', r['message'])

    def test_before_the_first_fit_it_uses_the_sold_rates_and_says_so(self):
        r = ep.build_estimate(auction=self.auction, freight=0.0)
        if r['supported']:
            self.assertEqual(r['rates_source'], 'sold')
            self.assertTrue(any('first nightly fit' in n for n in r['notes']))

    def test_the_switch_goes_back_to_the_sold_rates(self):
        _fit_row()
        AppSetting.objects.update_or_create(key=rf.KEY_RATES, defaults={'value': 'sold'})
        r = ep.build_estimate(auction=self.auction, freight=0.0)
        self.assertNotEqual(r.get('rates_source'), 'recovery')


class ApiTests(APITestCase):
    def setUp(self):
        self.mp = Marketplace.objects.update_or_create(slug='target', defaults={'name': 'Target'})[0]
        self.auction = Auction.objects.create(
            marketplace=self.mp, external_id='rf22', url='https://bstock.com/buy/listings/details/rf22',
            total_retail_value=Decimal('1000'), current_price=Decimal('100'),
        )
        self.user = User.objects.create_user('buyer77@example.com', 'Test', 'User', password='x-pass-123')
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(self.user)

    def test_every_estimate_is_saved_with_its_fit(self):
        fit = _fit_row()
        r = self.client.post('/api/buying/estimate-profit/', {'link': self.auction.url, 'freight': '50'}, format='multipart')
        self.assertEqual(r.status_code, 200)
        log = EstimateLog.objects.get()
        self.assertEqual((log.auction_id, log.seller, log.rates, log.fit_id), (self.auction.pk, 'target', 'recovery', fit.pk))
        self.assertAlmostEqual(float(log.likely), 280, delta=1)
        self.assertEqual(log.created_by, self.user)

    def test_scores_endpoint_and_a_forward_score_once_the_lot_is_a_scored_po(self):
        vendor = Vendor.objects.update_or_create(code='TRGET', defaults={'name': 'Target', 'vendor_type': 'liquidation'})[0]
        fit_old = _fit_row()
        RecoveryFit.objects.filter(pk=fit_old.pk).update(fitted_at=timezone.now() - timedelta(days=200))
        fit_old.refresh_from_db()
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='T-F', ordered_date=timezone.localdate() - timedelta(days=150),
                                          status='complete')
        Auction.objects.filter(pk=self.auction.pk).update(purchase_order=po)
        EstimateLog.objects.create(auction=self.auction, seller='target', fit=fit_old, retail=Decimal('10000'),
                                   likely=Decimal('2500'), rates='recovery')
        scores = [{'po': po.pk, 'actual': 3000.0, 'retail': 10000.0, 'predicted': 2800.0, 'miss': -2.0}]
        _fit_row(scores=scores)
        r = self.client.get('/api/buying/estimate-scores/?seller=target')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['fit']['summary']['median_miss'], 7.3)
        [fwd] = r.data['forward']
        self.assertAlmostEqual(fwd['miss'], -5.0)  # 25% estimated, 30% real
        self.assertEqual(self.client.get('/api/buying/estimate-scores/?seller=nope').status_code, 400)

    def test_an_estimate_made_after_the_po_was_ordered_is_not_a_forward_score(self):
        vendor = Vendor.objects.update_or_create(code='TRGET', defaults={'name': 'Target', 'vendor_type': 'liquidation'})[0]
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='T-G', ordered_date=timezone.localdate() - timedelta(days=150),
                                          status='complete')
        Auction.objects.filter(pk=self.auction.pk).update(purchase_order=po)
        fit = _fit_row(scores=[{'po': po.pk, 'actual': 3000.0, 'retail': 10000.0, 'predicted': 2800.0, 'miss': -2.0}])
        EstimateLog.objects.create(auction=self.auction, seller='target', fit=fit, retail=Decimal('10000'),
                                   likely=Decimal('2500'), rates='recovery')
        self.assertEqual(rf.forward_scores('target', fit), [])

    def test_fit_command_dry_run_stores_nothing(self):
        from io import StringIO

        from django.core.management import call_command

        out = StringIO()
        call_command('fit_recovery_rates', '--dry-run', stdout=out)
        self.assertIn('dry run', out.getvalue())
        self.assertFalse(RecoveryFit.objects.exists())
        call_command('fit_recovery_rates', stdout=StringIO())
        self.assertEqual(RecoveryFit.objects.count(), 1)
