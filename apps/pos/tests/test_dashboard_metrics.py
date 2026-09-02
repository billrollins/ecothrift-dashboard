"""Tests for dashboard metrics aggregation."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.core.models import WorkLocation
from apps.inventory.models import Item, ItemCheckIn, ItemHistory, Product, PurchaseOrder, RestorationJob, Vendor
from apps.pos.models import (
    Cart,
    CartLine,
    DashboardDepartmentGoal,
    DashboardSalesGoal,
    Drawer,
    Register,
)
from apps.pos.services.dashboard_metrics import build_dashboard_metrics, get_dashboard_metrics

User = get_user_model()

class DashboardMetricsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='dash@example.com',
            first_name='Dash',
            last_name='User',
            password='testpass123',
        )
        self.vendor = Vendor.objects.create(name='Test Vendor', code='TV')
        self.location = WorkLocation.objects.create(name='Dashboard Test Location')
        self.product = Product.objects.create(title='Test Product', brand='Generic')
        self.register = Register.objects.create(
            location=self.location,
            name='Reg 1',
            code='DASH-R1',
        )
        self.today = timezone.now().date()

    def _complete_cart(self, amount: str, *, day=None):
        day = day or self.today
        completed_at = timezone.make_aware(datetime.combine(day, datetime.min.time()))
        drawer, _ = Drawer.objects.get_or_create(
            register=self.register,
            date=day,
            defaults={
                'status': 'closed',
                'opening_total': '200.00',
                'opened_by': self.user,
                'opened_at': completed_at,
                'current_cashier': self.user,
            },
        )
        return Cart.objects.create(
            drawer=drawer,
            cashier=self.user,
            status='completed',
            subtotal=amount,
            tax_rate='0',
            tax_amount='0',
            total=amount,
            payment_method='cash',
            completed_at=completed_at,
        )

    def test_sales_today_and_last_7_days(self):
        self._complete_cart('100.00', day=self.today)
        self._complete_cart('50.00', day=self.today - timedelta(days=1))

        payload = build_dashboard_metrics(self.today)
        sales = payload['sales']

        self.assertEqual(sales['today'], '100.00')
        self.assertEqual(sales['yesterday'], '50.00')
        self.assertEqual(len(sales['daily_last_90_days']), 90)
        self.assertIn('rolling_week_total', sales['daily_last_90_days'][-1])
        self.assertIn('four_week_weekly_avg', sales['daily_last_90_days'][-1])
        self.assertEqual(len(sales['weekly_last_14_weeks']), 14)

    def test_weekly_calendar_includes_items_sold(self):
        cart = self._complete_cart('120.00', day=self.today)
        CartLine.objects.create(
            cart=cart,
            description='Test item',
            quantity=3,
            unit_price=Decimal('40.00'),
            line_total=Decimal('120.00'),
        )
        CartLine.objects.create(
            cart=cart,
            description='Another item',
            quantity=2,
            unit_price=Decimal('10.00'),
            line_total=Decimal('20.00'),
        )

        payload = build_dashboard_metrics(self.today)
        this_week = payload['sales']['weekly_last_14_weeks'][0]
        today_day = next(d for d in this_week['days'] if d['date'] == self.today.isoformat())

        self.assertEqual(today_day['items_sold'], 5)
        self.assertEqual(this_week['week_items_sold'], 5)

    def test_sales_goal_is_included_when_configured(self):
        DashboardSalesGoal.objects.create(
            amount=Decimal('12500.00'),
            description='Stretch target for 7-day sales velocity.',
        )

        payload = build_dashboard_metrics(self.today)
        goal = payload['sales']['goal']

        self.assertEqual(goal['amount'], '12500.00')
        self.assertEqual(goal['description'], 'Stretch target for 7-day sales velocity.')

    def test_buying_uses_purchase_order_total_cost(self):
        PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-1001',
            status='ordered',
            ordered_date=self.today,
            total_cost=Decimal('250.00'),
        )
        payload = build_dashboard_metrics(self.today)
        self.assertEqual(payload['department_metrics']['buying']['today'], '250.00')

    def test_processing_excludes_retag_quick_reprice(self):
        item = Item.objects.create(
            sku='TST0000001',
            product=self.product,
            price=Decimal('25.00'),
            status='on_shelf',
        )
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value='processing',
            new_value='on_shelf',
            note='Created and checked in via Item Processor row check-in',
        )
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value='sold',
            new_value='on_shelf',
            note='Marked on shelf from Quick reprice / inventory (manager)',
        )

        payload = build_dashboard_metrics(self.today)
        self.assertEqual(payload['department_metrics']['processing']['today'], '25.00')

    def test_processing_does_not_count_send_to_restoration(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-DASH-SEND-REST',
            ordered_date=self.today,
            status='processing',
        )
        check_in = ItemCheckIn.objects.create(
            purchase_order=order,
            product=self.product,
            origin=ItemCheckIn.ORIGIN_PROCESSING,
            quantity=1,
            created_by=self.user,
        )
        item = Item.objects.create(
            sku='TST0000101',
            product=self.product,
            purchase_order=order,
            check_in=check_in,
            price=Decimal('40.00'),
            status='on_shelf',
            location='restoration',
        )
        RestorationJob.objects.create(
            item_check_in=check_in,
            product=self.product,
            purchase_order=order,
            quantity=1,
            stage=RestorationJob.STAGE_QUEUED,
        )
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value='',
            new_value='on_shelf',
            note='Created and checked in via Item Processor row check-in',
        )

        payload = build_dashboard_metrics(self.today)
        self.assertEqual(payload['department_metrics']['processing']['today'], '0')

    def test_processing_counts_restoration_overview_check_in(self):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-DASH-FROM-REST',
            ordered_date=self.today,
            status='processing',
        )
        check_in = ItemCheckIn.objects.create(
            purchase_order=order,
            product=self.product,
            origin=ItemCheckIn.ORIGIN_PROCESSING,
            quantity=1,
            created_by=self.user,
        )
        item = Item.objects.create(
            sku='TST0000102',
            product=self.product,
            purchase_order=order,
            check_in=check_in,
            price=Decimal('40.00'),
            status='on_shelf',
            location='on_shelf',
        )
        RestorationJob.objects.create(
            item_check_in=check_in,
            product=self.product,
            purchase_order=order,
            quantity=1,
            stage=RestorationJob.STAGE_DONE,
            processing_handled_at=timezone.now(),
        )
        ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value='',
            new_value='on_shelf',
            note='Created and checked in via Item Processor row check-in',
        )

        payload = build_dashboard_metrics(self.today)
        self.assertEqual(payload['department_metrics']['processing']['today'], '40.00')
        self.assertEqual(payload['department_metrics']['processing']['week'], '40.00')

    def test_retail_counts_submitted_routines(self):
        payload = build_dashboard_metrics(self.today)
        retail = payload['department_metrics']['retail']
        self.assertTrue(retail['ready'])
        self.assertIsNone(retail['average_grade'])
        self.assertEqual(retail['week_audits'], 0)
        self.assertEqual(retail['today_work_cycles'], 0)
        self.assertEqual(retail['week_work_cycles'], 0)
        self.assertEqual(retail['week_idle_dismissed'], 0)

    def test_retail_work_cycles_are_counted_apart_from_audits(self):
        from apps.routines.models import Routine, RoutineSubmission, WorkCyclePrompt

        cycle = Routine.objects.get(system_key='retail.work_cycle')
        cycle.kind = Routine.KIND_WORK_CYCLE
        cycle.is_active = True
        cycle.save(update_fields=['kind', 'is_active'])
        RoutineSubmission.objects.create(
            routine=cycle,
            submitted_by=self.user,
            status=RoutineSubmission.STATUS_SUBMITTED,
            submitted_at=timezone.now(),
            responses={'mode': 'shelf', 'shelf': {'section_id': 1, 'counts': {}}, 'non_shelf': {'done': [], 'notes': ''}},
        )
        WorkCyclePrompt.objects.create(
            user=self.user,
            shown_at=timezone.now(),
            answered_at=timezone.now(),
            idle_seconds=400,
            outcome=WorkCyclePrompt.OUTCOME_DISMISSED,
        )
        payload = build_dashboard_metrics(self.today)
        retail = payload['department_metrics']['retail']
        self.assertEqual(retail['week_audits'], 0)
        self.assertEqual(retail['week_work_cycles'], 1)
        self.assertEqual(retail['today_work_cycles'], 1)
        self.assertEqual(retail['week_idle_dismissed'], 1)

    def test_restoration_active_jobs_counts_active_stages(self):
        from apps.inventory.models import ItemCheckIn, RestorationJob

        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-DASH-REST',
            ordered_date=self.today,
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('50.00'),
            status='processing',
        )

        def _make_job(stage):
            check_in = ItemCheckIn.objects.create(
                purchase_order=order,
                product=self.product,
                origin=ItemCheckIn.ORIGIN_PRODUCT_AD_HOC,
                quantity=1,
                created_by=self.user,
            )
            return RestorationJob.objects.create(
                item_check_in=check_in,
                product=self.product,
                purchase_order=order,
                quantity=1,
                stage=stage,
            )

        _make_job(RestorationJob.STAGE_BENCH)
        _make_job(RestorationJob.STAGE_PENDING)
        # Done is not active.
        _make_job(RestorationJob.STAGE_DONE)

        payload = build_dashboard_metrics(self.today)
        restoration = payload['department_metrics']['restoration']
        self.assertTrue(restoration['ready'])
        self.assertEqual(restoration['active_jobs'], 2)
        self.assertEqual(restoration['awaiting_parts'], 1)

    def test_department_daily_weeks_are_monday_sunday(self):
        payload = build_dashboard_metrics(self.today)
        weeks = payload['department_metrics']['daily_weeks']

        self.assertEqual(len(weeks), 8)
        self.assertEqual(weeks[-1]['label'], 'This Week')
        self.assertEqual(weeks[-2]['label'], 'Last Week')
        self.assertTrue(weeks[-1]['is_current'])
        self.assertEqual(sum(1 for w in weeks if w.get('is_current')), 1)
        self.assertEqual(len(weeks[0]['days']), 7)
        self.assertEqual(weeks[0]['days'][0]['day'], 'Monday')
        self.assertEqual(weeks[0]['days'][-1]['day'], 'Sunday')

    def test_department_weeks_param_clamps(self):
        two = build_dashboard_metrics(self.today, weeks_back=2)
        self.assertEqual(len(two['department_metrics']['daily_weeks']), 2)
        twelve = build_dashboard_metrics(self.today, weeks_back=99)
        self.assertEqual(len(twelve['department_metrics']['daily_weeks']), 12)

    def test_processing_daily_weeks_include_last_week(self):
        """Processing by-day must span last week for the department grid."""
        from apps.pos.services.dashboard_metrics import _week_start_monday

        this_week_start = _week_start_monday(self.today)
        last_week_start = this_week_start - timedelta(days=7)
        last_week_day = last_week_start + timedelta(days=2)
        created_at = timezone.make_aware(datetime.combine(last_week_day, datetime.min.time()))

        item = Item.objects.create(
            sku='TST0000002',
            product=self.product,
            price=Decimal('40.00'),
            status='on_shelf',
        )
        history = ItemHistory.objects.create(
            item=item,
            event_type='status_change',
            old_value='processing',
            new_value='on_shelf',
        )
        ItemHistory.objects.filter(pk=history.pk).update(created_at=created_at)

        payload = build_dashboard_metrics(self.today)
        last_week = next(
            w for w in payload['department_metrics']['daily_weeks'] if w['label'] == 'Last Week'
        )
        last_week_day_payload = next(d for d in last_week['days'] if d['date'] == last_week_day.isoformat())

        self.assertEqual(last_week_day_payload['processing'], '40.00')

    def test_get_dashboard_metrics_uses_cache(self):
        from unittest.mock import patch
        from django.core.cache import cache

        cache.clear()
        with patch(
            'apps.pos.services.dashboard_metrics.build_dashboard_metrics',
            wraps=build_dashboard_metrics,
        ) as build_mock:
            first = get_dashboard_metrics(self.today)
            second = get_dashboard_metrics(self.today)
            self.assertEqual(first, second)
            self.assertEqual(build_mock.call_count, 1)
        cache.clear()
