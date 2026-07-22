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

    def test_exclude_unconfirmed_requires_reason(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        with self.assertRaises(ValueError):
            phase2.exclude_unconfirmed_stop(stop, user=self.user, reason='')
        phase2.exclude_unconfirmed_stop(stop, user=self.user, reason='No reply by departure')
        stop.refresh_from_db()
        self.assertTrue(stop.excluded_unconfirmed_at)
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
        phase2.scan_stop_item(item, user=self.user, scanned_code=item.sku)
        phase2.set_stop_item_loaded(item, user=self.user, loaded=True)
        phase2.set_stop_item_photo_exception(item, user=self.user, reason='Test photo exception')

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

        # Route blocked until contact resolved.
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

    def test_employee_cannot_departure_override(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        with self.assertRaises(PermissionError):
            phase2.set_departure_override(run, user=self.employee, reason='Rush')
        phase2.set_departure_override(run, user=self.user, reason='Manager approved skip')
        run.refresh_from_db()
        self.assertTrue(run.departure_override)

    def test_stale_route_revision_raises(self):
        from apps.pos.services.delivery_run import StaleRouteRevision, reorder_stops

        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job)
        phase2.set_contact_disposition(
            stop, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
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
