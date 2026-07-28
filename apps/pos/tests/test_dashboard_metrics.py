"""Tests for dashboard metrics aggregation."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.core.models import WorkLocation
from apps.inventory.models import Item, ItemHistory, Product, PurchaseOrder, Vendor
from apps.pos.models import (
    Cart,
    CartLine,
    DashboardDepartmentGoal,
    DashboardSalesGoal,
    Drawer,
    QualityAudit,
    QualityAuditForm,
    Register,
)
from apps.pos.quality_audit_seed import build_retail_form_definition
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

    def test_retail_placeholder(self):
        payload = build_dashboard_metrics(self.today)
        retail = payload['department_metrics']['retail']
        self.assertFalse(retail['ready'])
        self.assertIsNone(retail['average_grade'])

    def test_retail_daily_weeks_show_submitted_grade(self):
        form, _ = QualityAuditForm.objects.get_or_create(
            slug='retail',
            defaults={
                'title': 'Retail floor operations',
                'definition': build_retail_form_definition(),
                'feeds_dashboard': True,
                'is_system': True,
                'is_active': True,
            },
        )
        if not form.feeds_dashboard:
            form.feeds_dashboard = True
            form.save(update_fields=['feeds_dashboard'])
        QualityAudit.objects.create(
            form=form,
            audit_type='retail',
            status=QualityAudit.STATUS_SUBMITTED,
            conducted_by=self.user,
            submitted_at=timezone.now(),
            overall_grade='B',
            responses={'template_version': 1, 'sections': []},
        )
        payload = build_dashboard_metrics(self.today)
        retail = payload['department_metrics']['retail']
        self.assertTrue(retail['ready'])
        self.assertEqual(retail['last_grade'], 'B')
        today_iso = self.today.isoformat()
        day_grade = None
        for week in payload['department_metrics']['daily_weeks']:
            for day in week['days']:
                if day['date'] == today_iso:
                    day_grade = day['retail']
        self.assertEqual(day_grade, 'B')

    def test_retail_week_grade_is_last_submitted_not_highest(self):
        """Week score = last by submitted_at (F after A), not highest letter."""
        from apps.pos.services.dashboard_metrics import _week_start_monday

        form, _ = QualityAuditForm.objects.get_or_create(
            slug='retail',
            defaults={
                'title': 'Retail floor operations',
                'definition': build_retail_form_definition(),
                'feeds_dashboard': True,
                'is_system': True,
                'is_active': True,
            },
        )
        if not form.feeds_dashboard:
            form.feeds_dashboard = True
            form.save(update_fields=['feeds_dashboard'])

        week_start = _week_start_monday(self.today)
        self.assertLessEqual(week_start, self.today)
        # Both audits must already be submitted (never future-dated) or the week rollup drops them.
        later = timezone.now() - timedelta(minutes=5)
        earlier = later - timedelta(minutes=10)
        QualityAudit.objects.create(
            form=form,
            audit_type='retail',
            status=QualityAudit.STATUS_SUBMITTED,
            conducted_by=self.user,
            submitted_at=earlier,
            overall_grade='A',
            responses={'template_version': 1, 'sections': []},
        )
        QualityAudit.objects.create(
            form=form,
            audit_type='retail',
            status=QualityAudit.STATUS_SUBMITTED,
            conducted_by=self.user,
            submitted_at=later,
            overall_grade='F',
            responses={'template_version': 1, 'sections': []},
        )
        payload = build_dashboard_metrics(self.today)
        this_week = next(
            w for w in payload['department_metrics']['daily_weeks'] if w['label'] == 'This Week'
        )
        self.assertEqual(this_week['retail_week_grade'], 'F')
        self.assertEqual(payload['department_metrics']['retail']['last_grade'], 'F')

    def test_retail_scheduled_goal_requires_count_and_last_grade(self):
        """Gold achievement requires the day's count and its last grade."""
        form, _ = QualityAuditForm.objects.get_or_create(
            slug='retail',
            defaults={
                'title': 'Retail floor operations',
                'definition': build_retail_form_definition(),
                'feeds_dashboard': True,
                'is_system': True,
                'is_active': True,
            },
        )
        if not form.feeds_dashboard:
            form.feeds_dashboard = True
            form.save(update_fields=['feeds_dashboard'])
        DashboardDepartmentGoal.objects.update_or_create(
            department=DashboardDepartmentGoal.RETAIL,
            defaults={
                'value': 'B',
                'description': 'Two audits today at B or better.',
                'schedule': {
                    'weekdays': [self.today.weekday()],
                    'audits_per_day': 2,
                },
            },
        )
        now = timezone.now()
        for submitted_at, grade in (
            (now - timedelta(hours=2), 'A'),
            (now - timedelta(hours=1), 'B'),
        ):
            QualityAudit.objects.create(
                form=form,
                audit_type='retail',
                status=QualityAudit.STATUS_SUBMITTED,
                conducted_by=self.user,
                submitted_at=submitted_at,
                overall_grade=grade,
                responses={'template_version': 1, 'sections': []},
            )

        payload = build_dashboard_metrics(self.today)
        this_week = next(
            week
            for week in payload['department_metrics']['daily_weeks']
            if week['label'] == 'This Week'
        )
        today_cell = next(day for day in this_week['days'] if day['date'] == self.today.isoformat())
        self.assertEqual(today_cell['retail_count'], 2)
        self.assertEqual(today_cell['retail_required'], 2)
        self.assertEqual(today_cell['retail'], 'B')
        self.assertTrue(today_cell['retail_goal_met'])
        self.assertTrue(this_week['retail_week_goal_met'])
        self.assertTrue(payload['department_metrics']['retail']['week_goal_met'])

        # A later F becomes the day's/week's LAST grade and removes achievement,
        # even though the required audit count remains satisfied.
        QualityAudit.objects.create(
            form=form,
            audit_type='retail',
            status=QualityAudit.STATUS_SUBMITTED,
            conducted_by=self.user,
            submitted_at=now,
            overall_grade='F',
            responses={'template_version': 1, 'sections': []},
        )
        payload = build_dashboard_metrics(self.today)
        this_week = next(
            week
            for week in payload['department_metrics']['daily_weeks']
            if week['label'] == 'This Week'
        )
        today_cell = next(day for day in this_week['days'] if day['date'] == self.today.isoformat())
        self.assertEqual(today_cell['retail_count'], 3)
        self.assertEqual(today_cell['retail'], 'F')
        self.assertFalse(today_cell['retail_grade_met'])
        self.assertFalse(today_cell['retail_goal_met'])
        self.assertFalse(this_week['retail_week_goal_met'])

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

        self.assertEqual(len(weeks), 2)
        self.assertEqual([w['label'] for w in weeks], ['Last Week', 'This Week'])
        self.assertEqual(len(weeks[0]['days']), 7)
        self.assertEqual(weeks[0]['days'][0]['day'], 'Monday')
        self.assertEqual(weeks[0]['days'][-1]['day'], 'Sunday')

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
        last_week = payload['department_metrics']['daily_weeks'][0]
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
