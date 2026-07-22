"""Seed / show / reset delivery test dataset commands."""
from django.core.management import call_command
from django.test import TestCase, override_settings
from io import StringIO

from apps.core.models import WorkLocation
from apps.pos.models import DeliveryDay, DeliveryJob, DeliveryTestDataset
from apps.pos.services.delivery_test_dataset import reset_dataset, seed_dataset, show_dataset


class DeliveryTestDatasetCommandTests(TestCase):
    def setUp(self):
        WorkLocation.objects.filter(is_active=True).update(is_active=False)
        WorkLocation.objects.create(name='Dataset Loc', is_active=True)

    def test_seed_show_reset_reseed(self):
        first = seed_dataset(key='phase1-smoke')
        self.assertEqual(first['days'], 3)
        self.assertGreaterEqual(first['jobs'], 8)
        shown = show_dataset('phase1-smoke')
        self.assertEqual(shown['active']['generation'], 1)
        self.assertEqual(len(shown['days']), 3)

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
        self.assertFalse(DeliveryJob.objects.filter(customer_name__startswith='[TEST]').exists())

    @override_settings(DEBUG=False)
    def test_production_reset_requires_confirmation(self):
        seed_dataset(key='prod-guard')
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
