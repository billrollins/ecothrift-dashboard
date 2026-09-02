"""Seed / show / reset delivery test dataset commands."""
from django.core.management import call_command
from django.db.models import Count
from django.test import TestCase, override_settings
from io import StringIO

from apps.core.models import WorkLocation
from apps.pos.models import DeliveryDay, DeliveryJob, DeliveryTestDataset
from apps.pos.services.delivery_test_dataset import (
    DeliveryDatasetError,
    reset_dataset,
    seed_dataset,
    show_dataset,
)


@override_settings(DEBUG=True)
class DeliveryTestDatasetCommandTests(TestCase):
    def setUp(self):
        WorkLocation.objects.filter(is_active=True).update(is_active=False)
        WorkLocation.objects.create(name='Dataset Loc', is_active=True)

    def test_seed_show_reset_reseed(self):
        first = seed_dataset(key='phase1-smoke')
        self.assertEqual(first['days'], 4)
        self.assertEqual(first['jobs'], 10)  # 5 today + 2 past + 3 future
        shown = show_dataset('phase1-smoke')
        self.assertEqual(shown['active']['generation'], 1)
        self.assertEqual(len(shown['days']), 4)
        today_jobs = DeliveryJob.objects.filter(availability_id=first['today_day_id'])
        self.assertEqual(today_jobs.count(), 5)
        item_totals = sorted(j.item_count for j in today_jobs)
        self.assertEqual(item_totals, [1, 1, 1, 1, 1])
        addresses = list(today_jobs.values_list('address', flat=True))
        self.assertTrue(any('8724 N 30th' in a for a in addresses))
        self.assertTrue(any('4610 S 24th' in a for a in addresses))
        self.assertTrue(any('12102 Blondo' in a for a in addresses))
        # Seeded names look real - no [TEST] prefix.
        self.assertFalse(
            DeliveryJob.objects.filter(
                test_dataset_id=first['dataset_id'],
                customer_name__startswith='[TEST]',
            ).exists()
        )
        self.assertTrue(
            DeliveryJob.objects.filter(
                test_dataset_id=first['dataset_id'],
                customer_name='Maria Gonzalez',
            ).exists()
        )
        self.assertTrue(
            DeliveryJob.objects.filter(
                test_dataset_id=first['dataset_id'],
                customer_name='Carlos Ramirez',
            ).exists()
        )
        past_jobs = DeliveryJob.objects.filter(availability_id=first['past_day_id'])
        self.assertEqual(past_jobs.count(), 2)
        self.assertEqual(
            sorted(past_jobs.values_list('status', flat=True)),
            ['completed', 'failed'],
        )
        # 2 jobs on first future day, 1 on second
        by_day = (
            DeliveryJob.objects.filter(availability_id__in=first['future_day_ids'])
            .values('availability_id')
            .annotate(n=Count('id'))
            .values_list('n', flat=True)
        )
        self.assertEqual(sorted(by_day), [1, 2])

        dry = reset_dataset(key='phase1-smoke', execute=False)
        self.assertTrue(dry['dry_run'])
        self.assertTrue(DeliveryJob.objects.filter(test_dataset_id=first['dataset_id']).exists())

        done = reset_dataset(
            key='phase1-smoke',
            execute=True,
            allow_production=True,
            confirm_dataset='phase1-smoke',
        )
        self.assertEqual(done['status'], DeliveryTestDataset.STATUS_RESET)
        self.assertFalse(DeliveryDay.objects.filter(test_dataset_id=first['dataset_id']).exists())
        # Tombstone remains
        self.assertTrue(
            DeliveryTestDataset.objects.filter(key='phase1-smoke', generation=1).exists()
        )

        second = seed_dataset(key='phase1-smoke')
        self.assertEqual(second['generation'], 2)
        reset_dataset(
            key='phase1-smoke',
            execute=True,
            allow_production=True,
            confirm_dataset='phase1-smoke',
        )
        self.assertFalse(DeliveryJob.objects.filter(test_dataset_id=second['dataset_id']).exists())

    def test_seed_blocked_when_not_debug(self):
        with override_settings(DEBUG=False):
            with self.assertRaises(DeliveryDatasetError):
                seed_dataset(key='prod-blocked')

    def test_production_reset_requires_confirmation(self):
        seed_dataset(key='prod-guard')
        with override_settings(DEBUG=False):
            with self.assertRaises(Exception):
                reset_dataset(key='prod-guard', execute=True, allow_production=False)
            with self.assertRaises(Exception):
                reset_dataset(
                    key='prod-guard',
                    execute=True,
                    allow_production=True,
                    confirm_dataset='wrong',
                )
            result = reset_dataset(
                key='prod-guard',
                execute=True,
                allow_production=True,
                confirm_dataset='prod-guard',
            )
        self.assertEqual(result['status'], DeliveryTestDataset.STATUS_RESET)

    def test_management_command_smoke(self):
        out = StringIO()
        call_command('seed_delivery_test_dataset', '--key', 'cmd-smoke', stdout=out)
        call_command('show_delivery_test_dataset', '--key', 'cmd-smoke', stdout=out)
        call_command('reset_delivery_test_dataset', '--key', 'cmd-smoke', stdout=out)
        call_command(
            'reset_delivery_test_dataset',
            '--key', 'cmd-smoke',
            '--execute',
            '--allow-production',
            '--confirm-dataset', 'cmd-smoke',
            stdout=out,
        )
        self.assertIn('cmd-smoke', out.getvalue())
