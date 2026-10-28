"""The recovery estimate (inventory review phase 4): the sources pulled toward their parents, the band and verdict,
the owner's switch, the price estimator using it, the API, and the priced high / low flags on Inventory review."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import AppSetting
from apps.inventory.services import recovery_estimate as rec
from apps.inventory.services.price_estimator import estimate_price
from apps.inventory.tests.test_inventory_review import KITCHEN, TODAY, ReviewTests

D = Decimal


def model() -> rec.RecoveryModel:
    return rec.RecoveryModel(
        store=rec.Rate(net=400.0, retail=1000.0, n=1000),                    # 40%
        category={KITCHEN: rec.Rate(net=150.0, retail=500.0, n=300)},        # 30%
        subcategory={(KITCHEN, 'Cookware'): rec.Rate(net=10.0, retail=20.0, n=10)},  # 50%, thin
        vendor={'TRGET': rec.Rate(net=200.0, retail=400.0, n=100)},          # 50%
        price_point={'10-25': rec.Rate(net=35.0, retail=100.0, n=60)},       # 35%
        condition={'good': rec.Rate(net=120.0, retail=400.0, n=200)},        # 30%
    )


def switch(on: bool):
    AppSetting.objects.update_or_create(key=rec.SWITCH_KEY, defaults={'value': on})


class EstimateMathTests(TestCase):
    def test_each_source_is_pulled_toward_its_parent_and_the_axes_are_weighted_by_sample(self):
        e = rec.estimate(retail='40', category=KITCHEN, subcategory='Cookware', vendor='TRGET', condition='good',
                         price='20', model=model(), with_neighbours=False)
        sources = {s['source']: s for s in e['sources']}
        k = 30
        cat = (300 * 0.30 + k * 0.40) / (300 + k)
        sub = (10 * 0.50 + k * cat) / (10 + k)
        self.assertAlmostEqual(sources['category']['pulled'], round(cat, 4), places=4)
        self.assertAlmostEqual(sources['subcategory']['pulled'], round(sub, 4), places=4)
        vendor = (100 * 0.5 + k * 0.4) / (100 + k)
        price = (60 * 0.35 + k * 0.4) / (60 + k)
        cond = (200 * 0.30 + k * 0.4) / (200 + k)
        axes = [(sub, 300), (vendor, 100), (price, 60), (cond, 200)]
        weights = [n / (n + k) for _r, n in axes]
        expected = sum(r * w for (r, _n), w in zip(axes, weights)) / sum(weights)
        self.assertAlmostEqual(e['recovery'], round(expected, 4), places=4)
        # n shown: the most specific level with at least k sales (Cookware has 10, so the category's 300).
        self.assertEqual((e['n'], e['basis']), (300, KITCHEN))
        self.assertAlmostEqual(float(e['mid']), 40 * expected, delta=0.01)
        self.assertAlmostEqual(float(e['low']), 40 * expected * 0.8, delta=0.01)
        self.assertAlmostEqual(float(e['high']), 40 * expected * 1.2, delta=0.01)
        self.assertEqual(e['verdict'], 'high')  # $20 is above the band (about $14 to $16)

    def test_no_retail_or_nothing_sold_gives_nothing_and_a_price_in_the_band_is_ok(self):
        self.assertIsNone(rec.estimate(retail=None, category=KITCHEN, model=model()))
        self.assertIsNone(rec.estimate(retail='0', category=KITCHEN, model=model()))
        self.assertIsNone(rec.estimate(retail='10', model=rec.RecoveryModel()))
        e = rec.estimate(retail='40', category='Toys & games', model=model(), with_neighbours=False)
        self.assertEqual((e['recovery'], e['basis']), (0.4, 'the whole store'))  # an unknown category: the store
        self.assertEqual(rec.estimate(retail='40', price=e['mid'], model=model())['verdict'], 'ok')

    def test_the_prior_and_band_are_owner_settings(self):
        AppSetting.objects.update_or_create(key=rec.PRIOR_KEY, defaults={'value': 0})
        AppSetting.objects.update_or_create(key=rec.BAND_KEY, defaults={'value': 0.5})
        e = rec.estimate(retail='100', category=KITCHEN, model=model(), with_neighbours=False)
        self.assertEqual(e['recovery'], 0.3)  # no pull: the category's own 30%
        self.assertEqual((e['low'], e['high']), ('15.00', '45.00'))


class SwitchTests(ReviewTests):
    def setUp(self):
        super().setUp()
        cache.delete(rec.CACHE_KEY)
        self.api = APIClient()
        user = User.objects.create_user('rec@example.com', 'Pat', 'Clerk', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        self.api.force_authenticate(user)

    def tearDown(self):
        cache.delete(rec.CACHE_KEY)

    def test_off_by_default_nothing_changes(self):
        self.assertFalse(rec.is_enabled())
        self.assertEqual(self.api.get('/api/inventory/recovery-estimate/', {'retail': '20'}).json(),
                         {'enabled': False, 'estimate': None})
        result = estimate_price('Pan', category_name=KITCHEN, condition='good', retail_value=D('20'),
                                include_comparables=False)
        self.assertEqual((result.method, result.recovery), ('heuristic', None))

    def test_on_the_api_and_the_price_estimate_use_the_rollup(self):
        switch(True)
        with mock.patch('apps.inventory.services.recovery_estimate.timezone.localdate', return_value=TODAY):
            r = self.api.get('/api/inventory/recovery-estimate/', {'retail': '20', 'product': self.pan.pk, 'price': '5'})
        e = r.json()['estimate']
        self.assertTrue(r.json()['enabled'])
        self.assertEqual(e['basis'], KITCHEN)  # Kitchen's 12 weeks of sales: 36 with a retail
        self.assertEqual(e['n'], 36)
        self.assertAlmostEqual(e['recovery'], 0.225, places=3)  # store and category are the same 22.5% here
        cache.delete(rec.CACHE_KEY)
        with mock.patch('apps.inventory.services.recovery_estimate.timezone.localdate', return_value=TODAY):
            result = estimate_price('Pan', category_name=KITCHEN, condition='good', retail_value=D('20'),
                                    include_comparables=False)
        self.assertEqual(result.method, 'recovery')
        self.assertEqual(result.estimated_price, D(result.recovery['mid']))
        self.assertIn('of retail (n=36, Kitchen & dining)', result.notes)

    def test_priced_high_flags_need_the_switch(self):
        AppSetting.objects.update_or_create(key='inventory_review_price_gap_share', defaults={'value': 0.1})
        row = next(r for r in self._review()['rows'] if r['key'] == KITCHEN)
        self.assertNotIn('priced_high', row['flags'])  # switch off
        self.assertAlmostEqual(row['asking'], 27 / 104, places=3)  # five $5 pans on $20, a $2 mug on $4
        switch(True)
        row = next(r for r in self._review()['rows'] if r['key'] == KITCHEN)
        self.assertIn('priced_high', row['flags'])  # 26% asked against 22.5% kept, 10% apart
        AppSetting.objects.update_or_create(key='inventory_review_price_min_n', defaults={'value': 100})
        row = next(r for r in self._review()['rows'] if r['key'] == KITCHEN)
        self.assertNotIn('priced_high', row['flags'])  # 36 sales is too few now

    def test_only_the_owner_turns_the_switch_on(self):
        manager = User.objects.create_user('recm@example.com', 'Mo', 'Manager', password='x-pass-123')
        manager.groups.add(Group.objects.get_or_create(name='Manager')[0])
        AppSetting.objects.update_or_create(key=rec.SWITCH_KEY, defaults={'value': False})
        api = APIClient()
        api.force_authenticate(manager)
        r = api.patch(f'/api/core/settings/{rec.SWITCH_KEY}/', {'value': True}, format='json')
        self.assertEqual(r.status_code, 403)
        self.assertFalse(rec.is_enabled())


class PreprocessingRowTests(TestCase):
    def test_review_rows_carry_the_estimate_only_with_the_switch(self):
        from apps.inventory.models import PreprocessingRow, PurchaseOrder, Vendor
        from apps.inventory.serializers import PreprocessingReviewRowMinimalSerializer

        vendor = Vendor.objects.create(name='Rec test', code='RECT')
        order = PurchaseOrder.objects.create(vendor=vendor, order_number='REC-1', ordered_date=date(2026, 9, 1))
        row = PreprocessingRow.objects.create(purchase_order=order, row_number=1, unit_retail=D('40'), quantity=1)
        data = PreprocessingReviewRowMinimalSerializer(row, context={}).data
        self.assertIsNone(data['recovery'])
        ctx = {'recovery_model': model(), 'recovery_vendor': 'TRGET'}
        data = PreprocessingReviewRowMinimalSerializer(row, context=ctx).data
        self.assertEqual(set(data['recovery']), {'recovery', 'n', 'basis', 'low', 'high', 'mid', 'verdict'})
        self.assertGreater(data['recovery']['recovery'], 0.4)  # TRGET's 50% pulls it above the store's 40%
