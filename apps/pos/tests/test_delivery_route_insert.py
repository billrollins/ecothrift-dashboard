"""Revision-safe route insert preview/commit for sidelined field-run stops."""
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
    DeliveryJob,
    DeliveryJobItem,
    DeliveryRun,
    DeliveryRunEvent,
    DeliveryRunStop,
)
from apps.pos.services import delivery_phase2 as phase2
from apps.pos.services.delivery_distance import SERVICE_SECONDS_PER_STOP
from apps.pos.services.delivery_run import (
    StaleRouteRevision,
    commit_insert_stop,
    preview_insert_stop,
    save_attachment,
    set_phase,
    start_or_resume_run,
)


class DeliveryRouteInsertServiceTests(TestCase):
    def setUp(self):
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='insert-svc@example.com',
            first_name='Ina',
            last_name='Sert',
            password='test-pass-123',
        )
        self.user.groups.add(manager)
        self.date = timezone.localdate() + timedelta(days=4)
        self.slot = DeliveryAvailability.objects.create(
            date=self.date,
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        self.job_a = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Alice',
            phone='402-555-0101',
            address='100 Main St, Omaha, NE',
            items_delivered='Washer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        self.job_b = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Bob',
            phone='402-555-0102',
            address='200 Oak St, Omaha, NE',
            items_delivered='Dryer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        self.job_c = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Cara',
            phone='402-555-0103',
            address='300 Elm St, Omaha, NE',
            items_delivered='Fridge',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )

    @override_settings(GOOGLE_MAPS_API_KEY='')
    def test_preview_does_not_mutate_route(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop_a = run.stops.get(job=self.job_a)
        stop_b = run.stops.get(job=self.job_b)
        stop_c = run.stops.get(job=self.job_c)
        phase2.set_contact_disposition(
            stop_a, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.set_contact_disposition(
            stop_b, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.set_contact_disposition(
            stop_c, user=self.user, disposition=DeliveryRunStop.DISPOSITION_NO_ANSWER
        )
        run.refresh_from_db()
        before_rev = run.route_revision
        positions = {
            s.id: s.position
            for s in run.stops.order_by('id')
        }
        dispositions = {
            s.id: s.contact_disposition
            for s in run.stops.order_by('id')
        }

        preview = preview_insert_stop(run, stop_c.id, base_revision=before_rev)
        self.assertEqual(preview['stop_id'], stop_c.id)
        self.assertEqual(preview['added_service_seconds'], SERVICE_SECONDS_PER_STOP)
        self.assertEqual(preview['route_revision'], before_rev)
        self.assertIn('proposed_position', preview)
        self.assertIn('neighbors', preview)
        self.assertIn('before', preview['neighbors'])
        self.assertIn('after', preview['neighbors'])
        self.assertEqual(preview['stop']['customer_name'], 'Cara')

        run.refresh_from_db()
        self.assertEqual(run.route_revision, before_rev)
        for s in run.stops.all():
            self.assertEqual(s.position, positions[s.id])
            self.assertEqual(s.contact_disposition, dispositions[s.id])
        stop_c.refresh_from_db()
        self.assertFalse(phase2.is_stop_confirmed(stop_c))

    @override_settings(GOOGLE_MAPS_API_KEY='')
    def test_commit_confirms_and_bumps_revision(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop_a = run.stops.get(job=self.job_a)
        stop_c = run.stops.get(job=self.job_c)
        phase2.set_contact_disposition(
            stop_a, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.exclude_unconfirmed_stop(
            stop_c, user=self.user, reason='Waiting on customer'
        )
        run.refresh_from_db()
        before_rev = run.route_revision

        commit_insert_stop(
            run,
            stop_c.id,
            user=self.user,
            base_revision=before_rev,
            position=0,
        )
        run.refresh_from_db()
        stop_c.refresh_from_db()
        self.assertEqual(stop_c.contact_disposition, DeliveryRunStop.DISPOSITION_CONFIRMED)
        self.assertIsNone(stop_c.excluded_unconfirmed_at)
        self.assertGreater(run.route_revision, before_rev)
        self.assertEqual(stop_c.position, 0)
        self.assertTrue(
            DeliveryRunEvent.objects.filter(run=run, event_type='route_insert', stop=stop_c).exists()
        )

    def test_preview_stale_revision_raises(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job_c)
        with self.assertRaises(StaleRouteRevision):
            preview_insert_stop(run, stop.id, base_revision=999)

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-route-insert-media',
        GOOGLE_MAPS_API_KEY='',
    )
    def test_commit_insert_blocked_when_sealed_and_not_loaded(self):
        DeliveryJobItem.objects.create(
            job=self.job_a,
            sku='A-01',
            description='Washer',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=self.job_c,
            sku='C-01',
            description='Fridge',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        run = start_or_resume_run(date=self.date, user=self.user)
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        stop_a = run.stops.get(job=self.job_a)
        stop_c = run.stops.get(job=self.job_c)
        phase2.set_contact_disposition(
            stop_a, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.scan_stop_item(
            stop_a.stop_items.get(), user=self.user, scanned_code='A-01'
        )
        uploaded = SimpleUploadedFile('truck.jpg', b'fakeimage', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)
        run.refresh_from_db()

        with self.assertRaises(ValueError) as ctx:
            commit_insert_stop(
                run,
                stop_c.id,
                user=self.user,
                base_revision=run.route_revision,
            )
        self.assertIn('reopen', str(ctx.exception).lower())

    @override_settings(
        DEFAULT_FILE_STORAGE='django.core.files.storage.FileSystemStorage',
        MEDIA_ROOT='/tmp/delivery-route-insert-media',
        GOOGLE_MAPS_API_KEY='',
    )
    def test_commit_insert_allowed_when_sealed_and_already_loaded(self):
        DeliveryJobItem.objects.create(
            job=self.job_a,
            sku='A-01',
            description='Washer',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        DeliveryJobItem.objects.create(
            job=self.job_c,
            sku='C-01',
            description='Fridge',
            quantity=1,
            position=0,
            is_scannable=True,
            created_by=self.user,
        )
        run = start_or_resume_run(date=self.date, user=self.user)
        set_phase(run, DeliveryRun.PHASE_LOAD, user=self.user)
        stop_a = run.stops.get(job=self.job_a)
        stop_c = run.stops.get(job=self.job_c)
        phase2.set_contact_disposition(
            stop_a, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.scan_stop_item(
            stop_a.stop_items.get(), user=self.user, scanned_code='A-01'
        )
        # Pre-load C while still on the load board, without confirming it.
        phase2.scan_stop_item(
            stop_c.stop_items.get(), user=self.user, scanned_code='C-01'
        )
        uploaded = SimpleUploadedFile('truck.jpg', b'fakeimage', content_type='image/jpeg')
        save_attachment(run=run, user=self.user, uploaded_file=uploaded, kind='truck')
        phase2.close_truck(run, user=self.user)
        set_phase(run, DeliveryRun.PHASE_ROUTE, user=self.user)
        run.refresh_from_db()

        commit_insert_stop(
            run,
            stop_c.id,
            user=self.user,
            base_revision=run.route_revision,
        )
        stop_c.refresh_from_db()
        self.assertEqual(stop_c.contact_disposition, DeliveryRunStop.DISPOSITION_CONFIRMED)


class DeliveryRouteInsertAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        employee, _ = Group.objects.get_or_create(name='Employee')
        self.user = User.objects.create_user(
            email='insert-api@example.com',
            first_name='Api',
            last_name='Insert',
            password='test-pass-123',
        )
        self.user.groups.add(employee)
        self.client.force_authenticate(user=self.user)
        self.date = timezone.localdate() + timedelta(days=5)
        self.slot = DeliveryAvailability.objects.create(
            date=self.date,
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=1,
            is_active=True,
            planning_disposition=DeliveryAvailability.DISPOSITION_PLANNED,
        )
        self.job_a = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Dana',
            phone='402-555-0201',
            address='101 Main St, Omaha, NE',
            items_delivered='Sofa',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        self.job_b = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Eli',
            phone='402-555-0202',
            address='202 Oak St, Omaha, NE',
            items_delivered='Chair',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )

    @override_settings(GOOGLE_MAPS_API_KEY='')
    def test_preview_and_commit_api(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop_a = run.stops.get(job=self.job_a)
        stop_b = run.stops.get(job=self.job_b)
        phase2.set_contact_disposition(
            stop_a, user=self.user, disposition=DeliveryRunStop.DISPOSITION_CONFIRMED
        )
        phase2.set_contact_disposition(
            stop_b, user=self.user, disposition=DeliveryRunStop.DISPOSITION_AWAITING_REPLY
        )
        run.refresh_from_db()

        preview = self.client.post(
            f'/api/pos/delivery-runs/{run.id}/preview-insert/',
            {'stop_id': stop_b.id, 'base_revision': run.route_revision},
            format='json',
        )
        self.assertEqual(preview.status_code, 200, preview.content)
        self.assertEqual(preview.data['stop_id'], stop_b.id)
        self.assertEqual(preview.data['added_service_seconds'], SERVICE_SECONDS_PER_STOP)
        stop_b.refresh_from_db()
        self.assertEqual(stop_b.contact_disposition, DeliveryRunStop.DISPOSITION_AWAITING_REPLY)

        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {'optimized': False, 'etas': []}
            # Manual revision bump to mirror apply_route_plan side effect for assertion.
            def _apply(run_obj, **kwargs):
                run_obj.route_revision += 1
                run_obj.save(update_fields=['route_revision', 'updated_at'])
                return {'optimized': False, 'etas': []}

            mock_plan.side_effect = _apply
            before_rev = run.route_revision
            commit = self.client.post(
                f'/api/pos/delivery-runs/{run.id}/commit-insert/',
                {
                    'stop_id': stop_b.id,
                    'base_revision': before_rev,
                    'position': preview.data['proposed_position'],
                },
                format='json',
            )
        self.assertEqual(commit.status_code, 200, commit.content)
        stop_payload = next(s for s in commit.data['stops'] if s['id'] == stop_b.id)
        self.assertTrue(stop_payload['is_confirmed'])
        self.assertEqual(stop_payload['contact_disposition'], 'confirmed')
        self.assertGreater(commit.data['route_revision'], before_rev)

    def test_stale_revision_returns_409(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop_b = run.stops.get(job=self.job_b)
        phase2.set_contact_disposition(
            stop_b, user=self.user, disposition=DeliveryRunStop.DISPOSITION_NO_ANSWER
        )

        preview = self.client.post(
            f'/api/pos/delivery-runs/{run.id}/preview-insert/',
            {'stop_id': stop_b.id, 'base_revision': 999},
            format='json',
        )
        self.assertEqual(preview.status_code, 409, preview.content)
        self.assertEqual(preview.data['code'], 'STALE_ROUTE_REVISION')

        commit = self.client.post(
            f'/api/pos/delivery-runs/{run.id}/commit-insert/',
            {'stop_id': stop_b.id, 'base_revision': 999},
            format='json',
        )
        self.assertEqual(commit.status_code, 409, commit.content)
        self.assertEqual(commit.data['code'], 'STALE_ROUTE_REVISION')
