"""Tests for dashboard metrics aggregation."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.core.models import WorkLocation
from apps.inventory.models import Item, ItemHistory, Product, PurchaseOrder, Vendor
from apps.pos.models import Cart, DashboardSalesGoal, Drawer, Register
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

    def test_department_daily_weeks_are_monday_sunday(self):
        payload = build_dashboard_metrics(self.today)
        weeks = payload['department_metrics']['daily_weeks']

        self.assertEqual(len(weeks), 2)
        self.assertEqual([w['label'] for w in weeks], ['Last Week', 'This Week'])
        self.assertEqual(len(weeks[0]['days']), 7)
        self.assertEqual(weeks[0]['days'][0]['day'], 'Monday')
        self.assertEqual(weeks[0]['days'][-1]['day'], 'Sunday')

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
