"""Phase 2: contact disposition, stop-item load, truck/route gates, day run API."""
from datetime import time, timedelta
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.pos.models import (
    DeliveryAvailability,
    DeliveryCallAttempt,
    DeliveryJob,
    DeliveryJobItem,
    DeliveryRun,
    DeliveryRunStop,
    DeliveryRunStopItem,
)
from apps.pos.services import delivery_phase2 as phase2
from apps.pos.services.delivery_run import (
    add_call_attempt,
    begin_route,
    mark_loaded,
    save_attachment,
    serialize_run,
    set_phase,
    start_or_resume_run,
)


class DeliveryPhase2ContactTests(TestCase):
    def setUp(self):
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='p2-contact@example.com',
            first_name='Pat',
            last_name='Driver',
            password='test-pass-123',
        )
        self.user.groups.add(manager)
        self.date = timezone.localdate() + timedelta(days=3)
        self.slot = DeliveryAvailability.objects.create(
            date=self.date,
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        self.job = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Casey',
            phone='402-555-0100',
            address='100 Main St, Omaha, NE',
            items_delivered='Washer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )

    def test_composer_opened_does_not_confirm(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        phase2.record_contact_attempt(
            stop,
            user=self.user,
            channel=DeliveryCallAttempt.CHANNEL_TEXT,
            action=DeliveryCallAttempt.ACTION_COMPOSER_OPENED,
        )
        stop.refresh_from_db()
        self.assertEqual(stop.contact_disposition, '')
        self.assertFalse(phase2.is_stop_confirmed(stop))
        payload = serialize_run(run)
        s = next(x for x in payload['stops'] if x['id'] == stop.id)
        self.assertFalse(s['is_confirmed'])

    def test_disposition_confirmed_independent_of_attempt(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        phase2.record_contact_attempt(
            stop,
            user=self.user,
            channel='call',
            action='call_placed',
        )
        phase2.set_contact_disposition(
            stop, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        stop.refresh_from_db()
        self.assertEqual(stop.contact_disposition, DeliveryRunStop.DISPOSITION_CONFIRMED)
        self.assertTrue(phase2.is_stop_confirmed(stop))

    def test_legacy_call_adapter_sets_disposition(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        add_call_attempt(stop, user=self.user, result='answered_will_be_there')
        stop.refresh_from_db()
        self.assertEqual(stop.contact_disposition, DeliveryRunStop.DISPOSITION_CONFIRMED)

    def test_exclude_defaults_reason_and_allows_confirmed(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        phase2.set_contact_disposition(
            stop, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        stop.refresh_from_db()
        phase2.exclude_unconfirmed_stop(stop, user=self.user, reason='')
        stop.refresh_from_db()
        self.assertTrue(stop.excluded_unconfirmed_at)
        self.assertEqual(stop.excluded_unconfirmed_reason, 'Taken off route')
        self.assertTrue(stop.contact_disposition == DeliveryRunStop.DISPOSITION_CONFIRMED)
        self.assertTrue(phase2.stop_has_contact_resolution(stop))


class DeliveryPhase2ItemTests(TestCase):
    def setUp(self):
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='p2-items@example.com',
            first_name='Ivy',
            last_name='Loader',
            password='test-pass-123',
        )
        self.user.groups.add(manager)
        self.date = timezone.localdate() + timedelta(days=4)
        self.slot = DeliveryAvailability.objects.create(
            date=self.date,
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=1,
            is_active=True,
        )
        self.job = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Dana',
            phone='402-555-0200',
            address='200 Oak St, Omaha, NE',
            items_delivered='Chair x2',
            item_count=2,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=self.job,
            sku='CHAIR-01',
            description='Dining chair',
            quantity=2,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )

    def test_start_snapshots_stop_items(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        items = list(stop.stop_items.all())
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].quantity, 2)
        self.assertEqual(items[0].sku, 'CHAIR-01')
        payload = serialize_run(run)
        s = next(x for x in payload['stops'] if x['id'] == stop.id)
        self.assertEqual(s['items_total_count'], 1)
        self.assertEqual(s['stop_items'][0]['scans_required'], 2)

    def test_quantity_two_requires_two_scans(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        item = stop.stop_items.get()
        phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01', client_scan_id=None)
        item.refresh_from_db()
        self.assertFalse(phase2.stop_item_is_verified(item))
        phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01')
        item.refresh_from_db()
        self.assertTrue(phase2.stop_item_is_verified(item))

    def test_scan_idempotent_by_client_scan_id(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        item = run.stops.get(job=self.job).stop_items.get()
        cid = '11111111-1111-1111-1111-111111111111'
        a = phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01', client_scan_id=cid)
        b = phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01', client_scan_id=cid)
        self.assertEqual(a.id, b.id)
        self.assertEqual(item.scans.count(), 1)

    def test_skip_verification_audited(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        item = run.stops.get(job=self.job).stop_items.get()
        phase2.skip_stop_item_verification(item, user=self.user, reason='Barcode damaged')
        item.refresh_from_db()
        self.assertTrue(item.verification_skipped_at)
        self.assertTrue(phase2.stop_item_is_verified(item))

    def test_scan_mismatch_looks_up_run_item(self):
        other_job = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Reese',
            phone='402-555-0201',
            address='201 Oak St, Omaha, NE',
            items_delivered='Lamp',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=other_job,
            sku='LAMP-99',
            description='Floor lamp',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        run = start_or_resume_run(date=self.date, user=self.user)
        chair = run.stops.get(job=self.job).stop_items.get()
        with self.assertRaises(phase2.ScanMismatchError) as ctx:
            phase2.scan_stop_item(chair, user=self.user, scanned_code='LAMP-99')
        err = ctx.exception
        self.assertEqual(err.scanned_code, 'LAMP-99')
        self.assertEqual(err.expected_sku, 'CHAIR-01')
        self.assertEqual(err.found['source'], 'run_item')
        self.assertEqual(err.found['description'], 'Floor lamp')
        self.assertEqual(err.found['customer_name'], 'Reese')
        self.assertEqual(chair.scans.count(), 0)

    def test_scan_mismatch_override_accepts_code(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        item = run.stops.get(job=self.job).stop_items.get()
        phase2.scan_stop_item(
            item,
            user=self.user,
            scanned_code='WRONG-SKU',
            allow_mismatch=True,
        )
        self.assertEqual(item.scans.count(), 1)
        self.assertEqual(item.scans.get().scanned_code, 'WRONG-SKU')

    def test_scan_marks_loaded_when_quantity_complete(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        item = run.stops.get(job=self.job).stop_items.get()
        self.assertEqual(item.quantity, 2)
        phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01')
        item.refresh_from_db()
        self.assertFalse(item.loaded_at)
        phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01')
        item.refresh_from_db()
        self.assertTrue(item.loaded_at)
        self.assertTrue(phase2.stop_item_is_ready(item))

    def test_skip_marks_loaded(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        item = run.stops.get(job=self.job).stop_items.get()
        phase2.skip_stop_item_verification(item, user=self.user, reason='No SKU on item')
        item.refresh_from_db()
        self.assertTrue(item.loaded_at)
        self.assertTrue(phase2.stop_item_is_ready(item))

    def test_unload_stop_with_reason_clears_loaded(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        item = stop.stop_items.get()
        phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01')
        phase2.scan_stop_item(item, user=self.user, scanned_code='CHAIR-01')
        item.refresh_from_db()
        self.assertTrue(item.loaded_at)
        mark_loaded(stop, user=self.user, loaded=False, reason='Left at dock by mistake')
        item.refresh_from_db()
        self.assertIsNone(item.loaded_at)
        self.assertFalse(phase2.stop_item_is_ready(item))

    def test_load_allowed_while_unconfirmed(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        self.assertFalse(phase2.is_stop_confirmed(stop))
        mark_loaded(stop, user=self.user, loaded=True)
        stop.refresh_from_db()
        self.assertTrue(stop.stop_items.filter(loaded_at__isnull=False).exists())


class DeliveryPhase2GateTests(TestCase):
    def setUp(self):
        manager, _ = Group.objects.get_or_create(name='Manager')
        employee, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='p2-gates@example.com',
            first_name='Gary',
            last_name='Gate',
            password='test-pass-123',
        )
        self.user.groups.add(manager, employee)
        self.employee = User.objects.create_user(
            email='p2-emp@example.com',
            first_name='Emp',
            last_name='Only',
            password='test-pass-123',
        )
        self.employee.groups.add(employee)
        self.date = timezone.localdate() + timedelta(days=5)
        self.slot = DeliveryAvailability.objects.create(
            date=self.date,
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=1,
            is_active=True,
        )
        self.job = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Eve',
            phone='402-555-0300',
            address='300 Pine St, Omaha, NE',
            items_delivered='Lamp',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=self.job,
            sku='LAMP-01',
            description='Floor lamp',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )

    def _ready_item(self, item: DeliveryRunStopItem):
        # Scan (or skip) marks the item loaded automatically — no per-item photo.
        phase2.scan_stop_item(item, user=self.user, scanned_code=item.sku)
        item.refresh_from_db()
        self.assertTrue(item.loaded_at)
        self.assertTrue(phase2.stop_item_is_ready(item))

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-phase2-media',
    )
    def test_phase_order_calls_load_truck_route(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        item = stop.stop_items.get()

        # Can enter load without confirmation.
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        run.refresh_from_db()
        self.assertEqual(run.phase, DeliveryRun.PHASE_LOAD)

        # Truck blocked until items ready.
        with self.assertRaises(ValueError):
            set_phase(run, DeliveryRun.PHASE_TRUCK, user=self.user)

        self._ready_item(item)
        uploaded = SimpleUploadedFile('truck.jpg', b'fakeimage', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        run.refresh_from_db()
        self.assertTrue(run.truck_closed_at)

        # Need at least one confirmed stop before route review (yellows may remain).
        with self.assertRaises(ValueError):
            set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)

        phase2.set_contact_disposition(
            stop, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)
        run.refresh_from_db()
        self.assertEqual(run.phase, DeliveryRun.PHASE_ROUTE)

        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {'optimized': False, 'etas': []}
            begin_route(run, user=self.user)
        run.refresh_from_db()
        self.assertEqual(run.status, DeliveryRun.STATUS_EN_ROUTE)
        self.assertEqual(run.phase, DeliveryRun.PHASE_ACTIVE)

        # Active runs cannot unload or reorder via phase-gated actions.
        from apps.pos.services.delivery_run import allowed_actions_for_run, reorder_stops

        self.assertNotIn('load', allowed_actions_for_run(run))
        self.assertNotIn('reorder', allowed_actions_for_run(run))
        with self.assertRaises(phase2.RunActionDenied):
            phase2.set_stop_item_loaded(item, user=self.user, loaded=False, reason='too late')
        with self.assertRaises(ValueError):
            reorder_stops(run, [stop.id], user=self.user, base_revision=run.route_revision)

    def test_employee_cannot_departure_override(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        with self.assertRaises(PermissionError):
            phase2.set_departure_override(run, user=self.employee, reason='Rush')
        phase2.set_departure_override(run, user=self.user, reason='Manager approved skip')
        run.refresh_from_db()
        self.assertTrue(run.departure_override)

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-phase2-media',
    )
    def test_close_truck_allows_unloaded_stops_left_off(self):
        """Seal when at least one delivery is fully on truck; unloaded stops don't block."""
        job2 = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Off Truck',
            phone='402-555-0301',
            address='301 Pine St, Omaha, NE',
            items_delivered='Chair',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=job2,
            sku='CHAIR-01',
            description='Chair',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        run = start_or_resume_run(date=self.date, user=self.user)
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        on_truck = run.stops.get(job=self.job)
        left_off = run.stops.get(job=job2)
        self._ready_item(on_truck.stop_items.get())
        # left_off stays unloaded
        self.assertFalse(phase2.stop_item_is_ready(left_off.stop_items.get()))
        progress = phase2.load_progress(run)
        self.assertTrue(progress['can_close_truck'])
        self.assertFalse(progress['all_ready'])
        uploaded = SimpleUploadedFile('truck.jpg', b'fakeimage', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        run.refresh_from_db()
        self.assertTrue(run.truck_closed_at)

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-phase2-media',
    )
    def test_route_review_allows_unresolved_yellow_contacts(self):
        """After seal, enter route with confirmed + yellow; begin_route still hard-gates."""
        job2 = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Yellow Contact',
            phone='402-555-0302',
            address='302 Pine St, Omaha, NE',
            items_delivered='Table',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=job2,
            sku='TABLE-01',
            description='Table',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        run = start_or_resume_run(date=self.date, user=self.user)
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        confirmed = run.stops.get(job=self.job)
        yellow = run.stops.get(job=job2)
        phase2.set_contact_disposition(
            confirmed, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.set_contact_disposition(
            yellow, user=self.user, disposition=DeliveryRunStop.DISPOSITION_NO_ANSWER
        )
        self._ready_item(confirmed.stop_items.get())
        uploaded = SimpleUploadedFile('truck.jpg', b'fakeimage', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        run.refresh_from_db()

        self.assertFalse(phase2.all_candidate_stops_resolved(run))
        self.assertIn('set_phase:route', serialize_run(run)['allowed_actions'])
        set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)
        run.refresh_from_db()
        self.assertEqual(run.phase, DeliveryRun.PHASE_ROUTE)

        with self.assertRaises(ValueError) as ctx:
            begin_route(run, user=self.user)
        self.assertTrue(
            'excluded' in str(ctx.exception).lower()
            or 'confirmed' in str(ctx.exception).lower()
            or 'reply' in str(ctx.exception).lower()
        )

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-phase2-media',
    )
    def test_begin_route_blocks_confirmed_not_on_truck(self):
        """Seal may leave a confirmed stop off the truck; Start Deliveries cannot."""
        job2 = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Left Off Truck',
            phone='402-555-0303',
            address='303 Pine St, Omaha, NE',
            items_delivered='Desk',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=job2,
            sku='DESK-01',
            description='Desk',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        run = start_or_resume_run(date=self.date, user=self.user)
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        on_truck = run.stops.get(job=self.job)
        left_off = run.stops.get(job=job2)
        phase2.set_contact_disposition(
            on_truck, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.set_contact_disposition(
            left_off, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        self._ready_item(on_truck.stop_items.get())
        uploaded = SimpleUploadedFile('truck.jpg', b'fakeimage', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)

        ok, reason = phase2.departure_gates_ok(run)
        self.assertFalse(ok)
        self.assertIn('not on the truck', reason)
        self.assertIn('reopen the truck', reason)
        self.assertIn('Left Off Truck', reason)
        with self.assertRaises(ValueError) as ctx:
            begin_route(run, user=self.user)
        self.assertIn('not on the truck', str(ctx.exception))
        self.assertIn('reopen the truck', str(ctx.exception))

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-phase2-media',
    )
    def test_reopen_truck_requires_fresh_photo_and_clears_override(self):
        """Reopen rolls route→truck, clears seal + override; reseal needs a new photo."""
        from apps.pos.services.delivery_run import allowed_actions_for_run

        run = start_or_resume_run(date=self.date, user=self.user)
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        stop = run.stops.get(job=self.job)
        phase2.set_contact_disposition(
            stop, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        item = stop.stop_items.get()
        self._ready_item(item)
        uploaded = SimpleUploadedFile('truck1.jpg', b'fakeimage1', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        phase2.set_departure_override(run, user=self.user, reason='Skip photo once')
        set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)
        run.refresh_from_db()
        self.assertEqual(run.phase, DeliveryRun.PHASE_ROUTE)
        self.assertTrue(run.truck_closed_at)
        self.assertTrue(run.departure_override)
        self.assertIn('reopen_truck', allowed_actions_for_run(run))
        self.assertIn('reorder', allowed_actions_for_run(run))

        phase2.reopen_truck(run, user=self.user, reason='Forgot a delivery')
        run.refresh_from_db()
        self.assertEqual(run.phase, DeliveryRun.PHASE_TRUCK)
        self.assertIsNone(run.truck_closed_at)
        self.assertIsNotNone(run.truck_reopened_at)
        self.assertFalse(run.departure_override)
        self.assertEqual(run.departure_override_reason, '')
        self.assertFalse(phase2.truck_is_closed(run))

        actions = allowed_actions_for_run(run)
        self.assertIn('load', actions)
        self.assertIn('scan_verify', actions)
        self.assertNotIn('reorder', actions)
        self.assertNotIn('optimize', actions)
        self.assertNotIn('begin_route', actions)
        self.assertNotIn('reopen_truck', actions)

        # Old photo does not satisfy reseal.
        with self.assertRaises(ValueError) as ctx:
            phase2.close_truck(run, user=self.user)
        self.assertIn('new closed-door truck photo', str(ctx.exception).lower())

        # Load still works after reopen.
        phase2.set_stop_item_loaded(item, user=self.user, loaded=False, reason='adjust')
        item.refresh_from_db()
        self.assertIsNone(item.loaded_at)
        phase2.set_stop_item_loaded(item, user=self.user, loaded=True)
        item.refresh_from_db()
        self.assertTrue(item.loaded_at)

        uploaded2 = SimpleUploadedFile('truck2.jpg', b'fakeimage2', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded2, kind='truck')
        phase2.close_truck(run, user=self.user)
        run.refresh_from_db()
        self.assertTrue(run.truck_closed_at)
        self.assertTrue(phase2.truck_is_closed(run))
        payload = serialize_run(run)
        self.assertEqual(payload['truck_photo_count'], 2)
        self.assertEqual(payload['truck_seal_photo_count'], 1)
        self.assertIsNotNone(payload['truck_reopened_at'])

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-phase2-media',
    )
    def test_reopen_truck_blocked_after_departure(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        stop = run.stops.get(job=self.job)
        phase2.set_contact_disposition(
            stop, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        self._ready_item(stop.stop_items.get())
        uploaded = SimpleUploadedFile('truck.jpg', b'fakeimage', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)
        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {'optimized': False, 'etas': []}
            begin_route(run, user=self.user)
        run.refresh_from_db()
        self.assertEqual(run.status, DeliveryRun.STATUS_EN_ROUTE)
        self.assertNotIn('reopen_truck', serialize_run(run)['allowed_actions'])
        with self.assertRaises(ValueError) as ctx:
            phase2.reopen_truck(run, user=self.user)
        self.assertIn('not allowed', str(ctx.exception).lower())

    def test_reopen_truck_blocked_when_not_sealed(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        with self.assertRaises(ValueError) as ctx:
            phase2.reopen_truck(run, user=self.user)
        self.assertIn('not sealed', str(ctx.exception).lower())

    def test_stale_route_revision_raises(self):
        from apps.pos.services.delivery_run import StaleRouteRevision, reorder_stops

        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        phase2.set_contact_disposition(
            stop, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        run.phase = DeliveryRun.PHASE_ROUTE
        run.save(update_fields=['phase', 'updated_at'])
        with self.assertRaises(StaleRouteRevision):
            with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
                mock_plan.return_value = {}
                reorder_stops(run, [stop.id], user=self.user, base_revision=999)


class DeliveryPhase2APITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        employee, _ = Group.objects.get_or_create(name='Employee')
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='p2-api@example.com',
            first_name='Ada',
            last_name='Pi',
            password='test-pass-123',
        )
        self.user.groups.add(employee, manager)
        self.client.force_authenticate(user=self.user)
        self.date = timezone.localdate()
        self.slot = DeliveryAvailability.objects.create(
            date=self.date,
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=1,
            is_active=True,
            planning_disposition=DeliveryAvailability.DISPOSITION_PLANNED,
        )
        self.job = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Fran',
            phone='402-555-0400',
            address='400 Elm St, Omaha, NE',
            items_delivered='Table',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )

    def test_day_run_get_and_contact_endpoints(self):
        start = self.client.post(f'/api/pos/delivery-days/{self.slot.id}/start-run/', {}, format='json')
        self.assertEqual(start.status_code, 200, start.content)
        run_id = start.data['id']
        stop_id = start.data['stops'][0]['id']

        got = self.client.get(f'/api/pos/delivery-days/{self.slot.id}/run/')
        self.assertEqual(got.status_code, 200, got.content)
        self.assertEqual(got.data['id'], run_id)
        self.assertIn('monitor', got.data)
        self.assertIn('contact', got.data['progress'])

        attempt = self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/contact-attempt/',
            {'channel': 'text', 'action': 'composer_opened'},
            format='json',
        )
        self.assertEqual(attempt.status_code, 200, attempt.content)
        stop = next(s for s in attempt.data['stops'] if s['id'] == stop_id)
        self.assertFalse(stop['is_confirmed'])

        disp = self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/disposition/',
            {'disposition': 'confirmed'},
            format='json',
        )
        self.assertEqual(disp.status_code, 200, disp.content)
        stop = next(s for s in disp.data['stops'] if s['id'] == stop_id)
        self.assertTrue(stop['is_confirmed'])
        self.assertEqual(stop['contact_disposition'], 'confirmed')

    def test_stop_item_scan_api(self):
        DeliveryJobItem.objects.create(
            job=self.job,
            sku='TBL-01',
            description='Table',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        start = self.client.post(f'/api/pos/delivery-days/{self.slot.id}/start-run/', {}, format='json')
        self.assertEqual(start.status_code, 200, start.content)
        item_id = start.data['stops'][0]['stop_items'][0]['id']
        scan = self.client.post(
            f'/api/pos/delivery-stop-items/{item_id}/scan/',
            {
                'scanned_code': 'TBL-01',
                'client_scan_id': '22222222-2222-2222-2222-222222222222',
            },
            format='json',
        )
        self.assertEqual(scan.status_code, 200, scan.content)
        item = scan.data['stops'][0]['stop_items'][0]
        self.assertTrue(item['is_verified'])
        self.assertEqual(item['scan_count'], 1)
