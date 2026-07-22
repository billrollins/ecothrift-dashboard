"""Tests for Delivery Day migration preflight conflict report."""
from datetime import time, timedelta

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import DeliveryAvailability, DeliveryJob, DeliveryRun
from apps.pos.services.delivery_migration_preflight import report_delivery_migration_conflicts


class DeliveryMigrationPreflightTests(TestCase):
    def setUp(self):
        WorkLocation.objects.filter(is_active=True).update(is_active=False)
        self.location = WorkLocation.objects.create(name='Preflight Loc', is_active=True)
        self.user = User.objects.create_user(
            email='preflight@example.com',
            first_name='Pre',
            last_name='Flight',
            password='test-pass-123',
        )
        self.today = timezone.localdate()

    def test_clean_dataset_is_ok_for_constraints(self):
        DeliveryAvailability.objects.create(
            date=self.today + timedelta(days=1),
            time_start=time(9, 0),
            time_end=time(15, 0),
            assigned_to='Pre Flight',
        )
        report = report_delivery_migration_conflicts()
        self.assertTrue(report['ok_for_constraints'])
        self.assertEqual(report['blocker_count'], 0)
        self.assertEqual(report['default_location_id'], self.location.id)

    def test_duplicate_day_dates_blocked_by_constraint(self):
        from django.db import IntegrityError, transaction

        from apps.pos.models import DeliveryDay

        d = self.today + timedelta(days=2)
        DeliveryAvailability.objects.create(
            date=d, time_start=time(9, 0), time_end=time(12, 0),
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                DeliveryDay.objects.create(date=d, time_start=time(12, 0), time_end=time(17, 0))
        report = report_delivery_migration_conflicts()
        self.assertEqual(report['buckets']['duplicate_day_dates']['count'], 0)

    def test_date_fk_mismatch_and_multiple_open_runs(self):
        day_a = DeliveryAvailability.objects.create(
            date=self.today + timedelta(days=3),
            time_start=time(9, 0),
            time_end=time(15, 0),
            location=self.location,
        )
        job = DeliveryJob.objects.create(
            availability=day_a,
            scheduled_date=self.today + timedelta(days=9),
            customer_name='Mismatch',
            phone='402-555-0101',
            address='1 Main',
            items_delivered='Dryer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        DeliveryRun.objects.create(
            date=day_a.date,
            availability=day_a,
            status=DeliveryRun.STATUS_PREPARING,
            is_canonical=True,
        )
        DeliveryRun.objects.create(
            date=day_a.date,
            availability=day_a,
            status=DeliveryRun.STATUS_EN_ROUTE,
            is_canonical=False,
        )

        report = report_delivery_migration_conflicts()
        self.assertFalse(report['ok_for_constraints'])
        self.assertGreaterEqual(report['buckets']['date_fk_mismatch']['count'], 1)
        self.assertGreaterEqual(report['buckets']['multiple_open_runs']['count'], 1)
        self.assertEqual(job.customer_name, 'Mismatch')

    def test_orphan_scheduled_job(self):
        DeliveryJob.objects.create(
            scheduled_date=self.today + timedelta(days=14),
            customer_name='Orphan',
            phone='402-555-0102',
            address='2 Main',
            items_delivered='Fridge',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        report = report_delivery_migration_conflicts()
        self.assertFalse(report['ok_for_constraints'])
        self.assertGreaterEqual(report['buckets']['orphan_scheduled_jobs']['count'], 1)

    def test_item_count_mismatch_is_warning(self):
        day = DeliveryAvailability.objects.create(
            date=self.today + timedelta(days=4),
            time_start=time(9, 0),
            time_end=time(15, 0),
        )
        DeliveryJob.objects.create(
            availability=day,
            scheduled_date=day.date,
            customer_name='Count',
            phone='402-555-0103',
            address='3 Main',
            items_delivered='Washer, Dryer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        report = report_delivery_migration_conflicts()
        self.assertGreaterEqual(report['buckets']['item_count_mismatch']['count'], 1)
        # Warnings alone do not block constraints.
        self.assertTrue(report['ok_for_constraints'])
        self.assertEqual(report['blocker_count'], 0)
