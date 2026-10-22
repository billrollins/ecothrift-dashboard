"""E3 restoration tracking: the path from bench actions, where it goes next, where it landed, and days."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.models import (
    Item,
    ItemCheckIn,
    Product,
    PurchaseOrder,
    RestorationAction,
    RestorationJob,
    RestorationOutput,
    Vendor,
)


class RestorationTrackingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='mike@example.com', first_name='Mike', last_name='Bench', password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)
        vendor = Vendor.objects.create(name='Vendor', code='VNDRT')
        self.order = PurchaseOrder.objects.create(
            vendor=vendor, order_number='PO-RT', ordered_date='2026-09-01', purchase_cost=Decimal('10'),
        )
        self.n = 0

    def _job(self, title, *, stage, days_ago, **fields):
        self.n += 1
        product = Product.objects.create(title=title)
        check_in = ItemCheckIn.objects.create(purchase_order=self.order, product=product, quantity=1)
        item = Item.objects.create(
            product=product, purchase_order=self.order, check_in=check_in, status='on_shelf',
            location=fields.pop('item_location', 'restoration'), price=Decimal('10'),
        )
        job = RestorationJob.objects.create(
            item_check_in=check_in, product=product, purchase_order=self.order, stage=stage, **fields,
        )
        RestorationJob.objects.filter(pk=job.pk).update(created_at=timezone.now() - timedelta(days=days_ago))
        job.refresh_from_db()
        return job, item

    def _get(self, **params):
        r = self.client.get('/api/inventory/restoration-jobs/tracking/', params)
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def test_open_list_oldest_first_with_path_and_days(self):
        now = timezone.now()
        old, _ = self._job('Mixer', stage='bench', days_ago=40, bench_started_at=now - timedelta(days=2),
                           intended_destination='shelf')
        RestorationAction.objects.create(job=old, category='test', started_at=now - timedelta(days=3))
        RestorationAction.objects.create(job=old, category='repair', started_at=now - timedelta(days=2))
        RestorationAction.objects.create(job=old, category='inspect', started_at=now - timedelta(days=4))
        self._job('Lamp', stage='queued', days_ago=1)

        data = self._get()
        self.assertEqual([r['title'] for r in data['rows']], ['Mixer', 'Lamp'])
        mixer = data['rows'][0]
        self.assertEqual([p['step'] for p in mixer['path']], ['tested', 'repaired'])
        self.assertEqual(mixer['stage_label'], 'On a bench')
        self.assertEqual(mixer['next'], 'Meant for shelf')
        self.assertAlmostEqual(mixer['days_in_restoration'], 40, delta=0.2)
        self.assertAlmostEqual(mixer['days_in_stage'], 2, delta=0.2)
        self.assertEqual(data['summary']['over_30_days'], 1)
        self.assertEqual(data['summary']['by_stage']['Queued'], 1)

    def test_done_waiting_for_processing_then_landed(self):
        now = timezone.now()
        job, item = self._job('Vacuum', stage='done', days_ago=10, dispositioned_at=now - timedelta(days=1),
                              bench_disposition='processing', final_grade='Working')
        RestorationOutput.objects.create(job=job, seq=1, label='Motor', destination='salvage')

        row = self._get()['rows'][0]
        self.assertEqual(row['stage_label'], 'Waiting for processing')
        self.assertEqual(row['next'], 'Back to processing')
        self.assertEqual([p['step'] for p in row['path']], ['salvaged'])
        self.assertEqual(row['landed'], '')

        # Processing checks it back in to the floor: it leaves the open list and shows as landed.
        RestorationJob.objects.filter(pk=job.pk).update(processing_handled_at=now)
        Item.objects.filter(pk=item.pk).update(location='on_shelf')
        self.assertEqual(self._get()['rows'], [])
        done = self._get(scope='done', days=30)['rows'][0]
        self.assertEqual(done['landed'], 'Floor')
        self.assertAlmostEqual(done['days_in_restoration'], 10, delta=0.2)
        self.assertIsNone(done['days_in_stage'])

    def test_returned_untouched_goes_back_to_processing(self):
        self._job('Toaster', stage='returned', days_ago=3, returned_at=timezone.now())
        row = self._get()['rows'][0]
        self.assertEqual(row['next'], 'Back to processing')
        self.assertEqual(row['path'], [])
