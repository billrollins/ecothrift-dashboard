"""Inventory → Review, Categories tab (services/inventory_review.py): flows from the weekly rollup, stock now, the flags,
the search drill, the API, and the rollup riding on the daily category stats."""
from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

from django.contrib.auth.models import Group
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.inventory.models import Category, InventoryWeek, Item, Product, ProductProfile
from apps.inventory.services import inventory_review as review, inventory_search

D = Decimal
TODAY = date(2026, 10, 28)       # a Wednesday
LAST = date(2026, 10, 19)        # the last complete week
KITCHEN = 'Kitchen & dining'


def week(ws: date, key: str = KITCHEN, *, dimension='category', parent='', **values):
    defaults = dict(units_in=0, units_sold=0, sales=D('0'), net=D('0'), sold_retail=D('0'), sold_with_retail=0,
                    sold_net_with_retail=D('0'), sold_cost=D('0'), sold_with_cost=0, sold_net_with_cost=D('0'))
    label = values.pop('label', key or 'No subcategory')
    defaults.update(values)
    return InventoryWeek.objects.create(week_start=ws, dimension=dimension, parent=parent, key=key, label=label, **defaults)


class ReviewTests(TestCase):
    def setUp(self):
        kitchen = Category.objects.get_or_create(name=KITCHEN, defaults={'slug': 'kitchen-rv'})[0]
        self.pan = Product.objects.create(title='Pan', category=kitchen)
        ProductProfile.objects.create(product=self.pan, category=KITCHEN, subcategory='Cookware')
        self.mug = Product.objects.create(title='Mug', category=kitchen)
        now = timezone.now()
        for n in range(6):  # 6 pans on the shelf, 2 of them stale; no retail on one
            it = Item.objects.create(sku=f'ITMRV{n}', product=self.pan, status='on_shelf', price=D('5.00'),
                                     retail=None if n == 0 else D('20.00'))
            Item.objects.filter(pk=it.pk).update(checked_in_at=now - timedelta(days=200 if n < 2 else 5))
        it = Item.objects.create(sku='ITMRVM', product=self.mug, status='on_shelf', price=D('2.00'), retail=D('4.00'))
        Item.objects.filter(pk=it.pk).update(checked_in_at=now - timedelta(days=3))
        # 12 weeks of Kitchen sales: 4 a week for weeks 5-12 back, 1 a week for the last 4 (slowing).
        for k in range(12):
            ws = LAST - timedelta(weeks=k)
            sold = 1 if k < 4 else 4
            week(ws, units_in=2, units_sold=sold, units_scrapped=1 if k == 0 else 0, sales=D('10.00') * sold,
                 net=D('9.00') * sold, sold_retail=D('40.00') * sold, sold_with_retail=sold, sold_net_with_retail=D('9.00') * sold,
                 sold_cost=D('3.00') * sold, sold_with_cost=sold, sold_net_with_cost=D('9.00') * sold,
                 median_days_to_sell=10.0 + k)
        week(LAST, 'Cookware', dimension='subcategory', parent=KITCHEN, units_in=2, units_sold=1)

    def _review(self, span=1, category=None):
        with mock.patch('apps.inventory.services.inventory_week.bulk_min_units', return_value=6):
            return review.review(span, category, today=TODAY)

    def test_a_category_row_reads_the_rollup_and_the_shelf_now(self):
        data = self._review()
        self.assertEqual((data['from'], data['to']), ('2026-10-19', '2026-10-25'))
        row = next(r for r in data['rows'] if r['key'] == KITCHEN)
        self.assertEqual((row['units_in'], row['units_out'], row['units_sold']), (2, 2, 1))
        self.assertEqual((row['on_hand'], row['stale_on_hand'], row['bulk_on_hand'], row['on_hand_no_retail']), (7, 2, 6, 1))
        self.assertEqual(row['weeks_of_supply'], 7.0)  # 7 on hand / (4 sold in 4 weeks / 4)
        self.assertEqual((row['recovery'], row['net_to_cost']), (0.225, 3.0))
        self.assertEqual(row['median_days_to_sell'], 10.0)
        self.assertEqual(row['sales'], '10.00')
        self.assertEqual(sorted(row['flags']), ['missing', 'slowing'])  # 1 in 7 has no retail (over 10%)
        four = next(r for r in self._review(4)['rows'] if r['key'] == KITCHEN)
        self.assertEqual((four['units_in'], four['units_sold'], four['median_days_to_sell']), (8, 4, 11.0))

    def test_flags_follow_the_settings(self):
        from apps.core.models import AppSetting

        AppSetting.objects.update_or_create(key='inventory_review_overstock_weeks', defaults={'value': 6})
        AppSetting.objects.update_or_create(key='inventory_review_stale_heavy_share', defaults={'value': 0.2})
        AppSetting.objects.update_or_create(key='inventory_review_missing_share', defaults={'value': 0.5})
        row = next(r for r in self._review()['rows'] if r['key'] == KITCHEN)
        self.assertEqual(sorted(row['flags']), ['overstocked', 'slowing', 'stale'])

    def test_subcategories_and_the_no_subcategory_row(self):
        data = self._review(category=KITCHEN)
        rows = {r['key']: r for r in data['rows']}
        self.assertEqual((rows['Cookware']['on_hand'], rows['Cookware']['units_in']), (6, 2))
        self.assertEqual((rows['']['label'], rows['']['on_hand']), ('No subcategory', 1))
        self.assertEqual(data['total']['on_hand'], 7)

    def test_the_search_drill_finds_the_products(self):
        def ids(**kw):
            return {r['product_id'] for r in inventory_search.search('', **kw)['results']}

        self.assertEqual(ids(category=KITCHEN), {self.pan.pk, self.mug.pk})
        self.assertEqual(ids(category=KITCHEN, sub='Cookware'), {self.pan.pk})
        self.assertEqual(ids(category=KITCHEN, sub=review.NO_SUBCATEGORY_KEY), {self.mug.pk})
        self.assertEqual(ids(stale=True), {self.pan.pk})
        self.assertEqual(ids(category='Toys & games'), set())

    def test_the_api_is_for_staff(self):
        api = APIClient()
        self.assertIn(api.get('/api/inventory/review/').status_code, (401, 403))
        user = User.objects.create_user('rv@example.com', 'Pat', 'Clerk', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        api.force_authenticate(user)
        r = api.get('/api/inventory/review/', {'span': 4, 'category': KITCHEN})
        self.assertEqual(r.status_code, 200)
        self.assertEqual((r.json()['span'], r.json()['category']), (4, KITCHEN))


class DailyStatsRunsTheRollupTests(TestCase):
    def test_the_daily_stats_end_with_the_rollup_and_a_failure_never_breaks_them(self):
        out, err = StringIO(), StringIO()
        with mock.patch('apps.inventory.services.inventory_week.nightly', return_value=(8, 0)) as nightly:
            call_command('compute_daily_category_stats', '--skip-recompute-open', stdout=out, stderr=err)
        nightly.assert_called_once()
        with mock.patch('apps.inventory.services.inventory_week.nightly', side_effect=RuntimeError('boom')):
            call_command('compute_daily_category_stats', '--skip-recompute-open', stdout=out, stderr=err)
        self.assertIn('Inventory weeks skipped: boom', err.getvalue())
        with mock.patch('apps.inventory.services.inventory_week.nightly') as nightly:
            call_command('compute_daily_category_stats', '--skip-recompute-open', '--skip-inventory-weeks', stdout=out)
        nightly.assert_not_called()


class VendorPriceFlagsTests(ReviewTests):
    """Phase 3: the Vendors and Price points tabs on the same rollup, and the Flags tab."""

    def setUp(self):
        super().setUp()
        from apps.inventory.models import PurchaseOrder, Vendor

        vendor = Vendor.objects.create(name='Week test', code='RVTST')
        po = PurchaseOrder.objects.create(vendor=vendor, order_number='RV-1', ordered_date=date(2026, 4, 1))
        Item.objects.filter(product=self.mug).update(purchase_order=po)
        week(LAST, 'RVTST', dimension='vendor', label='Week test (RVTST)', units_in=1, units_sold=1, median_days_to_sell=4.0)
        week(LAST, 'u5', dimension='price_point', units_in=2, units_sold=1)

    def _tab(self, dimension):
        with mock.patch('apps.inventory.services.inventory_week.bulk_min_units', return_value=6):
            return review.review(1, dimension=dimension, today=TODAY)

    def test_vendors_name_themselves_and_keep_no_vendor(self):
        data = self._tab('vendor')
        rows = {r['key']: r for r in data['rows']}
        self.assertEqual((rows['RVTST']['label'], rows['RVTST']['on_hand'], rows['RVTST']['units_in']), ('Week test (RVTST)', 1, 1))
        self.assertEqual((rows['']['label'], rows['']['on_hand']), ('No vendor', 6))
        self.assertEqual((data['total']['label'], data['total']['on_hand']), ('All vendors', 7))

    def test_price_points_follow_the_tag_price_in_band_order(self):
        data = self._tab('price_point')
        rows = {r['key']: r for r in data['rows']}
        self.assertEqual((rows['5-10']['on_hand'], rows['u5']['on_hand'], rows['u5']['units_in']), (6, 1, 2))
        self.assertEqual((rows['u5']['label'], rows['u5']['rank'], rows['5-10']['rank']), ('Under $5', 0, 1))

    def test_the_flags_tab_lists_what_carries_each_flag(self):
        with mock.patch('apps.inventory.services.inventory_week.bulk_min_units', return_value=6):
            data = review.flags_summary(1, today=TODAY)
        flags = {f['key']: f['carried'] for f in data['flags']}
        self.assertEqual([c['key'] for c in flags['slowing']['category']], [KITCHEN])
        self.assertEqual(data['setting_keys']['stale'], 'inventory_review_stale_heavy_share')
        self.assertEqual(set(flags['missing']), {'category', 'vendor', 'price_point'})

    def test_the_search_drill_takes_a_vendor_and_a_price_point(self):
        def ids(**kw):
            return {r['product_id'] for r in inventory_search.search('', **kw)['results']}

        self.assertEqual(ids(vendor='RVTST'), {self.mug.pk})
        self.assertEqual(ids(vendor=review.NO_SUBCATEGORY_KEY), {self.pan.pk})
        self.assertEqual(ids(price_point='u5'), {self.mug.pk})
        self.assertEqual(ids(price_point='5-10', stale=True), {self.pan.pk})

    def test_the_api_takes_a_tab_and_serves_the_flags(self):
        api = APIClient()
        user = User.objects.create_user('rv3@example.com', 'Pat', 'Clerk', password='x-pass-123')
        user.groups.add(Group.objects.get_or_create(name='Employee')[0])
        api.force_authenticate(user)
        self.assertEqual(api.get('/api/inventory/review/', {'tab': 'vendor'}).json()['dimension'], 'vendor')
        self.assertEqual(api.get('/api/inventory/review/', {'tab': 'nonsense'}).json()['dimension'], 'category')
        flags = api.get('/api/inventory/review/flags/', {'span': 4})
        self.assertEqual((flags.status_code, flags.json()['span'], len(flags.json()['flags'])), (200, 4, len(review.FLAGS)))


class WholeStoreTotalTests(ReviewTests):
    def test_the_total_reads_the_whole_store_rows_once_they_cover_every_week(self):
        for k in range(12):
            week(LAST - timedelta(weeks=k), '', dimension='all', label='All', units_in=2, units_sold=1,
                 median_days_to_sell=50.0)
        self.assertEqual(self._review()['total']['median_days_to_sell'], 50.0)
        InventoryWeek.objects.filter(dimension='all', week_start=LAST - timedelta(weeks=11)).delete()
        self.assertEqual(self._review()['total']['median_days_to_sell'], 10.0)  # a week missing: adds up the rows
