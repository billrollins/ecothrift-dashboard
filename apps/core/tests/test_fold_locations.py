"""fold_locations (#130): one store, Canfield at 8425 West Center Road; dry run by default."""
from io import StringIO

from django.core.management import CommandError, call_command
from django.test import TestCase

from apps.core.models import WorkLocation
from apps.floorplan.models import FloorPlan, FloorPlanCurrentPeriod, MapLayer, MapPin
from apps.pos.models import Register, SupplementalDrawer


class FoldLocationsTests(TestCase):
    def setUp(self):
        self.canfield = WorkLocation.objects.create(name='Omaha - Canfield', address='8425 West Center Road, Omaha NE 68124')
        self.main = WorkLocation.objects.create(name='Eco-Thrift Main')
        self.test_loc = WorkLocation.objects.create(name='[TEST] Delivery Location')
        Register.objects.create(location=self.canfield, name='Register 1', code='R1')
        self.backfill = Register.objects.create(location=self.main, name='Backfill Register', code='BACKFILL')
        SupplementalDrawer.objects.create(location=self.canfield)
        self.store_plan = FloorPlan.objects.create(name='Canfield - Main', location=self.canfield, is_current=True)
        self.office = FloorPlan.objects.create(name='DH - Office', location=self.main, is_current=True)
        FloorPlanCurrentPeriod.objects.create(plan=self.office, started_at=self.office.updated_at)
        MapPin.objects.create(plan=self.office, layer=MapLayer.objects.get(slug='signage'), x=1, y=2, name='Register sign')

    def run_fold(self, *args):
        out = StringIO()
        call_command('fold_locations', *args, stdout=out)
        return out.getvalue()

    def test_dry_run_changes_nothing(self):
        report = self.run_fold()
        self.assertIn('DRY RUN', report)
        self.assertIn('Moved 1 pos.Register.location', report)
        self.assertIn('DH - Office', report)
        self.assertEqual(WorkLocation.objects.count(), 3)
        self.backfill.refresh_from_db()
        self.assertEqual(self.backfill.location_id, self.main.id)
        self.office.refresh_from_db()
        self.assertTrue(self.office.is_current)

    def test_apply_leaves_one_store(self):
        report = self.run_fold('--apply')
        self.assertIn('Done', report)
        store = WorkLocation.objects.get()
        self.assertEqual(store.pk, self.canfield.pk)
        self.assertEqual(store.name, 'Canfield')
        self.assertEqual(store.address, '8425 West Center Road, Omaha NE 68124')
        self.assertEqual(Register.objects.filter(location=store).count(), 2)
        self.office.refresh_from_db()
        self.assertFalse(self.office.is_current)
        self.assertEqual(self.office.location_id, store.pk)
        self.assertEqual(self.office.pins.count(), 1)  # kept as a past version
        self.assertIsNotNone(FloorPlanCurrentPeriod.objects.get(plan=self.office).ended_at)
        self.store_plan.refresh_from_db()
        self.assertTrue(self.store_plan.is_current)

    def test_two_supplemental_drawers_stop_the_fold(self):
        SupplementalDrawer.objects.create(location=self.main)
        with self.assertRaises(CommandError):
            self.run_fold('--apply')
        self.assertEqual(WorkLocation.objects.count(), 3)
