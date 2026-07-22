"""Tests for Delivery Day expand/backfill preservation."""
from datetime import time, timedelta

from django.test import TestCase
from django.utils import timezone

from apps.core.models import WorkLocation
from apps.pos.models import (
    DeliveryAvailability,
    DeliveryDay,
    DeliveryJob,
    DeliveryJobItem,
    DeliveryRun,
    DeliveryRunStop,
    DeliveryRunStopItem,
)
from apps.pos.services.delivery_migration_backfill import backfill_delivery_days


class DeliveryMigrationBackfillTests(TestCase):
    def setUp(self):
        WorkLocation.objects.filter(is_active=True).update(is_active=False)
        self.location = WorkLocation.objects.create(name='Backfill Loc', is_active=True)
        self.today = timezone.localdate()

    def test_alias_and_table_preserve_ids(self):
        day = DeliveryDay.objects.create(
            date=self.today + timedelta(days=1),
            time_start=time(9, 0),
            time_end=time(15, 0),
        )
        self.assertEqual(DeliveryAvailability.objects.get(pk=day.id).id, day.id)
        self.assertEqual(DeliveryDay._meta.db_table, 'pos_deliveryavailability')

    def test_backfill_creates_items_and_links_orphan_job(self):
        orphan_date = self.today + timedelta(days=10)
        job = DeliveryJob.objects.create(
            scheduled_date=orphan_date,
            customer_name='Orphan Job',
            phone='402-555-0199',
            address='9 Main',
            items_delivered='Washer, Dryer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        summary = backfill_delivery_days(dry_run=False)
        job.refresh_from_db()
        self.assertIsNotNone(job.availability_id)
        self.assertGreaterEqual(summary['orphan_days_created'], 1)
        self.assertTrue(DeliveryJobItem.objects.filter(job=job).exists())
        self.assertEqual(
            DeliveryJobItem.objects.filter(job=job, is_active=True).count(),
            2,
        )
        day = job.availability
        self.assertEqual(day.location_id, self.location.id)
        self.assertFalse(day.is_active)

    def test_backfill_snapshots_stop_items_and_marks_canonical_run(self):
        day = DeliveryDay.objects.create(
            date=self.today,
            time_start=time(9, 0),
            time_end=time(15, 0),
            location=self.location,
        )
        job = DeliveryJob.objects.create(
            availability=day,
            scheduled_date=day.date,
            customer_name='Snap',
            phone='402-555-0188',
            address='8 Main',
            items_delivered='Fridge',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        run_old = DeliveryRun.objects.create(
            date=day.date,
            availability=day,
            status=DeliveryRun.STATUS_COMPLETED,
            is_canonical=False,
        )
        run_new = DeliveryRun.objects.create(
            date=day.date,
            availability=day,
            status=DeliveryRun.STATUS_PREPARING,
            is_canonical=True,
        )
        stop = DeliveryRunStop.objects.create(run=run_new, job=job, position=0)
        stop.scan_verified = [{'sku': 'ABC', 'description': 'Fridge'}]
        stop.save(update_fields=['scan_verified'])

        backfill_delivery_days(dry_run=False)
        run_old.refresh_from_db()
        run_new.refresh_from_db()
        self.assertTrue(run_new.is_canonical)
        self.assertFalse(run_old.is_canonical)
        self.assertEqual(run_old.superseded_by_id, run_new.id)
        self.assertTrue(DeliveryRunStopItem.objects.filter(stop=stop).exists())
