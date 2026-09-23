"""Need v2: weeks of cover (shelf + pipeline) against a target, per category."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.buying.models import CategoryMapping, CategoryStats
from apps.buying.services.category_stats_sql import (
    category_code_to_taxonomy,
    compute_category_stats_payloads,
    effective_target_weeks,
    need_from_cover,
    upsert_category_stats_from_sql,
)
from apps.buying.taxonomy_v1 import MIXED_LOTS_UNCATEGORIZED
from apps.buying.tests.test_valuation import _stats_item
from apps.core.models import AppSetting
from apps.inventory.models import ManifestRow, PreprocessingRow, PurchaseOrder, Vendor

User = get_user_model()
TOYS = 'Toys & games'


class NeedFromCoverTests(SimpleTestCase):
    def _need(self, supply, weekly, target=10, goal='normal'):
        return need_from_cover(
            supply_units=supply, weekly_sales=Decimal(str(weekly)), target_weeks=Decimal(target), goal=goal
        )

    def test_fifty_is_on_target_and_it_moves_with_cover(self):
        self.assertEqual(self._need(100, 10)[0], 50)  # 10 weeks of cover, target 10
        self.assertEqual(self._need(50, 10)[0], 75)  # half the target
        self.assertEqual(self._need(0, 10)[0], 99)  # empty and selling
        self.assertEqual(self._need(150, 10)[0], 25)
        self.assertEqual(self._need(400, 10)[0], 1)  # 4x the target
        self.assertEqual(self._need(100, 10)[1], Decimal('10.0'))

    def test_goals_move_the_target(self):
        need, _, target = self._need(100, 10, goal='more')
        self.assertEqual((target, need), (Decimal('15.0'), 67))
        need, _, target = self._need(100, 10, goal='less')
        self.assertEqual((target, need), (Decimal('5.0'), 1))
        self.assertEqual(self._need(0, 10, goal='stop')[0], 1)

    def test_nothing_sold(self):
        self.assertEqual(self._need(40, 0)[:2], (1, None))  # stock that does not sell
        self.assertEqual(self._need(0, 0)[:2], (50, None))  # no signal either way


class TargetAndCodesTests(TestCase):
    def test_auto_target_is_the_store_cover(self):
        AppSetting.objects.update_or_create(key='buying_target_cover_weeks', defaults={'value': 0})
        target = effective_target_weeks({'a': 300, 'b': 100}, {'a': Decimal('10'), 'b': Decimal('10')})
        self.assertEqual(target, Decimal('20.0'))
        AppSetting.objects.update_or_create(key='buying_target_cover_weeks', defaults={'value': 12})
        self.assertEqual(effective_target_weeks({'a': 300}, {'a': Decimal('10')}), Decimal('12'))

    def test_po_category_codes_map_by_learned_mappings(self):
        for n in range(3):
            CategoryMapping.objects.create(
                source_key=f'tgt-api-toys-sub{n}', canonical_category=TOYS, rule_origin=CategoryMapping.RULE_AI
            )
        CategoryMapping.objects.create(source_key='tgt-api-mixed-home-a', canonical_category='Bedding & bath', rule_origin='ai')
        CategoryMapping.objects.create(source_key='tgt-api-mixed-home-b', canonical_category='Furniture', rule_origin='ai')
        names = category_code_to_taxonomy({'TOYS', 'MIXED_HOME', TOYS, 'UNKNOWN_CODE'})
        self.assertEqual(names, {'TOYS': TOYS, TOYS: TOYS})


class PipelineTests(TestCase):
    def setUp(self):
        AppSetting.objects.update_or_create(key='buying_target_cover_weeks', defaults={'value': 10})
        AppSetting.objects.update_or_create(key='buying_pipeline_max_age_days', defaults={'value': 120})
        for n in range(2):
            CategoryMapping.objects.create(
                source_key=f'tgt-api-toys-x{n}', canonical_category=TOYS, rule_origin=CategoryMapping.RULE_AI
            )
        now = timezone.now()
        # Shelf 10, intake 5; sold 13 in the 91-day window = 1 a week.
        for n in range(10):
            _stats_item(title=f'shelf {n}', category=TOYS, retail_value=Decimal('10'), status='on_shelf')
        for n in range(5):
            _stats_item(title=f'intake {n}', category=TOYS, retail_value=Decimal('10'), status='intake')
        for n in range(13):
            _stats_item(
                title=f'sold {n}', category=TOYS, retail_value=Decimal('10'), status='sold',
                sold_at=now - timedelta(days=5), sold_for=Decimal('5'),
                listed_at=now - timedelta(days=5 + (100 if n == 0 else 3)),
            )
        vendor = Vendor.objects.create(name='Target', code='TGT')
        fresh = PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-NEW', ordered_date=date.today() - timedelta(days=10), status='delivered'
        )
        ManifestRow.objects.create(purchase_order=fresh, row_number=1, quantity=4, unit_retail=Decimal('20'), category='TOYS')
        ManifestRow.objects.create(purchase_order=fresh, row_number=2, quantity=1, category='NO_SUCH_CODE')
        # The AI cleanup's pick on the preprocessing row wins over the line's B-Stock code.
        books_line = ManifestRow.objects.create(purchase_order=fresh, row_number=3, quantity=6, category='TOYS')
        PreprocessingRow.objects.create(
            purchase_order=fresh, manifest_row=books_line, row_number=3, quantity=6, final_category='Books & media'
        )
        stale = PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-OLD', ordered_date=date.today() - timedelta(days=400), status='processing'
        )
        ManifestRow.objects.create(purchase_order=stale, row_number=1, quantity=50, category='TOYS')
        done = PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-DONE', ordered_date=date.today() - timedelta(days=5), status='complete'
        )
        ManifestRow.objects.create(purchase_order=done, row_number=1, quantity=9, category='TOYS')
        self.since = now - timedelta(days=91)

    def test_pipeline_counts_building_and_recent_open_orders(self):
        toys = compute_category_stats_payloads(since=self.since)[TOYS]
        self.assertEqual((toys['have_units'], toys['in_building_units'], toys['on_order_units']), (10, 5, 4))
        self.assertEqual(toys['on_order_retail'], Decimal('80.00'))
        self.assertEqual(toys['weekly_sales_units'], Decimal('1.00'))
        # (10 + 5 + 4) / 1 a week = 19 weeks against a 10-week target.
        self.assertEqual((toys['cover_weeks'], toys['target_weeks']), (Decimal('19.0'), Decimal('10.0')))
        self.assertEqual(toys['need_score_1to99'], 5)
        payloads = compute_category_stats_payloads(since=self.since)
        self.assertEqual(payloads[MIXED_LOTS_UNCATEGORIZED]['on_order_units'], 1)
        self.assertEqual(payloads['Books & media']['on_order_units'], 6)

    def test_speed_and_upsert(self):
        upsert_category_stats_from_sql(since=self.since)
        row = CategoryStats.objects.get(category=TOYS)
        self.assertEqual((row.in_building_units, row.on_order_units, row.need_score_1to99), (5, 4, 5))
        # 12 sold 3 days after shelving, 1 after 100 days.
        self.assertEqual((row.median_days_to_sell, row.sold_within_90_pct), (3, Decimal('92.3')))


class CategoryGoalApiTests(TestCase):
    def setUp(self):
        AppSetting.objects.update_or_create(key='buying_target_cover_weeks', defaults={'value': 10})
        CategoryStats.objects.update_or_create(
            category=TOYS,
            defaults={
                'recovery_rate': Decimal('0.4'), 'have_units': 100, 'want_units': 130,
                'weekly_sales_units': Decimal('10'), 'need_score_1to99': 50,
            },
        )
        admin_group, _ = Group.objects.get_or_create(name='Admin')
        self.admin = User.objects.create_user('admin@x.test', 'Ad', 'Min', password='x')
        self.admin.groups.add(admin_group)
        self.client = APIClient()
        self.url = '/api/buying/category-need/goal/'

    def test_goal_rescores_the_category(self):
        self.client.force_authenticate(self.admin)
        r = self.client.patch(self.url, {'category': TOYS, 'goal': 'more'}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(AppSetting.objects.get(key='buying_category_goals').value, {TOYS: 'more'})
        row = next(c for c in r.data['categories'] if c['category'] == TOYS)
        # 100 / 10 = 10 weeks against 10 x 1.5 = 15.
        self.assertEqual((row['goal'], row['target_weeks'], row['need_score_1to99']), ('more', '15.0', 67))
        r = self.client.patch(self.url, {'category': TOYS, 'goal': 'normal'}, format='json')
        self.assertEqual(AppSetting.objects.get(key='buying_category_goals').value, {})
        self.assertEqual(next(c for c in r.data['categories'] if c['category'] == TOYS)['need_score_1to99'], 50)

    def test_bad_input_and_permissions(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.patch(self.url, {'category': 'Nope', 'goal': 'more'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(self.url, {'category': TOYS, 'goal': 'lots'}, format='json').status_code, 400)
        staff = User.objects.create_user('staff@x.test', 'St', 'Aff', password='x')
        self.client.force_authenticate(staff)
        self.assertEqual(self.client.patch(self.url, {'category': TOYS, 'goal': 'more'}, format='json').status_code, 403)


class PriorityTests(SimpleTestCase):
    def test_profit_score_scale(self):
        from apps.buying.services.valuation import profit_score

        self.assertEqual(
            [profit_score(Decimal(r)) for r in ('-0.5', '0', '0.5', '1.0', '3')], [1, 1, 50, 99, 99]
        )
        self.assertIsNone(profit_score(None))

    def test_blend_and_need_only(self):
        from apps.buying.services.valuation import compute_priority

        self.assertEqual(compute_priority(80, Decimal('0.2'), has_mix=True, weight=Decimal('0.5')), (50, 'need_profit'))
        self.assertEqual(compute_priority(80, Decimal('0.2'), has_mix=True, weight=Decimal('0')), (80, 'need_profit'))
        # No category mix: revenue is unknown, so profit is too; Priority is Need.
        self.assertEqual(compute_priority(50, Decimal('-1'), has_mix=False, weight=Decimal('0.5')), (50, 'need_only'))
        self.assertEqual(compute_priority(70, None, has_mix=True, weight=Decimal('0.5')), (70, 'need_only'))
