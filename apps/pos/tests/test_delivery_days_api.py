"""Canonical /api/pos/delivery-days/ and /api/pos/deliveries/ API tests."""
from datetime import time, timedelta
from unittest.mock import patch

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import (
    Cart,
    CartLine,
    DeliveryChangeEvent,
    DeliveryDay,
    DeliveryJob,
    DeliveryJobItem,
    DeliveryRun,
    DeliveryRunStop,
    Drawer,
    Register,
)
from apps.pos.services.delivery_run import start_or_resume_run


class DeliveryDaysAPITests(TestCase):
    def setUp(self):
        WorkLocation.objects.filter(is_active=True).update(is_active=False)
        self.location = WorkLocation.objects.create(name='Days API Loc', is_active=True)
        employee, _ = Group.objects.get_or_create(name='Employee')
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='days-api@example.com',
            first_name='Days',
            last_name='Api',
            password='test-pass-123',
        )
        self.user.groups.add(employee, manager)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.today = timezone.localdate()
        self.day = DeliveryDay.objects.create(
            date=self.today + timedelta(days=1),
            time_start=time(9, 0),
            time_end=time(15, 0),
            location=self.location,
            assigned_to='Days Api',
        )

    def test_list_and_detail_days(self):
        r = self.client.get('/api/pos/delivery-days/', {'bucket': 'future'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('results', r.data)
        self.assertGreaterEqual(len(r.data['results']), 1)
        detail = self.client.get(f'/api/pos/delivery-days/{self.day.id}/')
        self.assertEqual(detail.status_code, 200, detail.content)
        self.assertEqual(detail.data['id'], self.day.id)
        self.assertEqual(detail.data['display_state'], 'planned')

    def test_create_delivery_with_items_and_search(self):
        r = self.client.post(
            '/api/pos/deliveries/',
            {
                'day': self.day.id,
                'customer_name': 'Search Me',
                'phone': '402-555-0177',
                'address': '77 Search St',
                'items_delivered': 'Washer',
                'items': [
                    {'description': 'Washer', 'sku': 'WASH1', 'quantity': 2},
                ],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        job_id = r.data['id']
        self.assertEqual(r.data['item_count'], 2)
        self.assertEqual(len(r.data['items']), 1)
        self.assertTrue(
            DeliveryChangeEvent.objects.filter(
                entity_type='job', entity_id=job_id, action='create',
            ).exists()
        )

        search = self.client.get('/api/pos/deliveries/', {'search': 'Search Me'})
        self.assertEqual(search.status_code, 200, search.content)
        ids = [row['id'] for row in search.data['results']]
        self.assertIn(job_id, ids)

        sku_search = self.client.get('/api/pos/deliveries/', {'search': 'WASH1'})
        self.assertIn(job_id, [row['id'] for row in sku_search.data['results']])

    def test_archive_restore_and_item_remove(self):
        job = DeliveryJob.objects.create(
            availability=self.day,
            scheduled_date=self.day.date,
            customer_name='Archive Me',
            phone='402-555-0166',
            address='66 Main',
            items_delivered='Dryer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        item = DeliveryJobItem.objects.create(
            job=job, description='Dryer', quantity=1, position=0, is_scannable=False,
        )
        arch = self.client.delete(f'/api/pos/deliveries/{job.id}/', {'reason': 'test'}, format='json')
        self.assertEqual(arch.status_code, 204, arch.content)
        job.refresh_from_db()
        self.assertIsNotNone(job.archived_at)
        self.assertEqual(job.status, DeliveryJob.STATUS_CANCELLED)

        # Archived excluded by default
        listed = self.client.get('/api/pos/deliveries/', {'search': 'Archive Me'})
        self.assertNotIn(job.id, [row['id'] for row in listed.data['results']])

        restored = self.client.post(
            f'/api/pos/deliveries/{job.id}/restore/',
            {'reason': 'oops'},
            format='json',
        )
        self.assertEqual(restored.status_code, 200, restored.content)
        job.refresh_from_db()
        self.assertIsNone(job.archived_at)

        removed = self.client.post(
            f'/api/pos/deliveries/{job.id}/items/{item.id}/remove/',
            {'reason': 'not needed'},
            format='json',
        )
        self.assertEqual(removed.status_code, 200, removed.content)
        item.refresh_from_db()
        self.assertFalse(item.is_active)

    def test_create_delivery_from_past_cart_is_audited(self):
        register = Register.objects.create(
            location=self.location,
            name='Days API Reg',
            code='DAYS-API1',
        )
        drawer = Drawer.objects.create(
            register=register,
            date=self.today,
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        cart = Cart.objects.create(
            drawer=drawer,
            cashier=self.user,
            status='completed',
            completed_at=timezone.now(),
        )
        line = CartLine.objects.create(
            cart=cart,
            description='Past Sofa',
            quantity=1,
            unit_price='100.00',
            line_total='100.00',
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        r = self.client.post(
            '/api/pos/deliveries/',
            {
                'day': self.day.id,
                'customer_name': 'Past Sale Customer',
                'phone': '402-555-0199',
                'address': '99 Past St',
                'items_delivered': 'Past Sofa',
                'cart_id': cart.id,
                'cart_line_ids': [line.id],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        job = DeliveryJob.objects.get(pk=r.data['id'])
        self.assertEqual(job.cart_id, cart.id)
        items = list(job.items.filter(is_active=True))
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0].source_cart_line_id, line.id)
        self.assertEqual(items[0].description, 'Past Sofa')
        self.assertTrue(
            DeliveryChangeEvent.objects.filter(
                entity_type='job',
                entity_id=job.id,
                action='create',
            ).exists()
        )

    def test_route_map_serves_png_and_hides_the_key(self):
        DeliveryJob.objects.create(
            availability=self.day,
            scheduled_date=self.day.date,
            customer_name='Map Customer',
            phone='402-555-0188',
            address='88 Map St',
            items_delivered='Fridge',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        with patch(
            'apps.pos.services.delivery_route_map.fetch_route_map_png',
            return_value=b'\x89PNG-bytes',
        ) as fetch:
            r = self.client.get(f'/api/pos/delivery-days/{self.day.id}/route-map/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r['Content-Type'], 'image/png')
        self.assertEqual(r.content, b'\x89PNG-bytes')
        self.assertIn('88 Map St', ' '.join(fetch.call_args.kwargs['stop_addresses']))

        with patch(
            'apps.pos.services.delivery_route_map.fetch_route_map_png',
            return_value=None,
        ):
            missing = self.client.get(f'/api/pos/delivery-days/{self.day.id}/route-map/')
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data['code'], 'ROUTE_MAP_UNAVAILABLE')

    def test_day_and_delivery_history_endpoints(self):
        job = DeliveryJob.objects.create(
            availability=self.day,
            scheduled_date=self.day.date,
            customer_name='History Customer',
            phone='402-555-0177',
            address='77 History Ln',
            items_delivered='Table',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
        )
        patched = self.client.patch(
            f'/api/pos/deliveries/{job.id}/',
            {'notes': 'gate code 4321', 'reason': 'customer called'},
            format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.content)

        day_history = self.client.get(f'/api/pos/delivery-days/{self.day.id}/history/')
        self.assertEqual(day_history.status_code, 200, day_history.content)
        actions = [row['action'] for row in day_history.data['results']]
        self.assertIn('update', actions)

        job_history = self.client.get(f'/api/pos/deliveries/{job.id}/history/')
        self.assertEqual(job_history.status_code, 200, job_history.content)
        rows = job_history.data['results']
        self.assertTrue(rows)
        update_row = next(r for r in rows if r['action'] == 'update')
        self.assertIn('notes', update_row['changed_fields'])
        self.assertEqual(update_row['reason'], 'customer called')
        self.assertTrue(update_row['summary'])
        self.assertEqual(update_row['job_id'], job.id)

        self.assertEqual(self.client.get('/api/pos/delivery-days/999999/history/').status_code, 404)
        self.assertEqual(self.client.get('/api/pos/deliveries/999999/history/').status_code, 404)

    def test_assign_day_syncs_onto_open_run(self):
        run = start_or_resume_run(
            date=self.day.date,
            user=self.user,
            availability_id=self.day.id,
        )
        self.assertEqual(run.status, DeliveryRun.STATUS_PREPARING)
        job = DeliveryJob.objects.create(
            customer_name='Late Add',
            phone='402-555-0144',
            address='44 Late St',
            items_delivered='Chair',
            item_count=1,
            status=DeliveryJob.STATUS_NEEDS_SCHEDULING,
            created_by=self.user,
        )
        r = self.client.post(
            f'/api/pos/deliveries/{job.id}/assign-day/',
            {'day': self.day.id, 'reason': 'desk assign'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        job.refresh_from_db()
        self.assertEqual(job.availability_id, self.day.id)
        self.assertEqual(job.status, DeliveryJob.STATUS_SCHEDULED)
        stop = DeliveryRunStop.objects.filter(run=run, job=job).first()
        self.assertIsNotNone(stop)
        self.assertEqual(stop.state, DeliveryRunStop.STATE_QUEUED)
        self.assertTrue(
            DeliveryChangeEvent.objects.filter(
                entity_type='job',
                entity_id=job.id,
                action='schedule',
            ).exists()
        )

    def test_archive_fails_open_run_stop(self):
        job = DeliveryJob.objects.create(
            availability=self.day,
            scheduled_date=self.day.date,
            customer_name='Archive Run Sync',
            phone='402-555-0155',
            address='55 Archive St',
            items_delivered='Table',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        run = start_or_resume_run(
            date=self.day.date,
            user=self.user,
            availability_id=self.day.id,
        )
        stop = DeliveryRunStop.objects.get(run=run, job=job)
        self.assertNotEqual(stop.state, DeliveryRunStop.STATE_FAILED)

        arch = self.client.delete(
            f'/api/pos/deliveries/{job.id}/',
            {'reason': 'desk archive'},
            format='json',
        )
        self.assertEqual(arch.status_code, 204, arch.content)
        job.refresh_from_db()
        stop.refresh_from_db()
        self.assertIsNotNone(job.archived_at)
        self.assertEqual(job.status, DeliveryJob.STATUS_CANCELLED)
        self.assertEqual(stop.state, DeliveryRunStop.STATE_FAILED)
        self.assertTrue(
            DeliveryChangeEvent.objects.filter(
                entity_type='job',
                entity_id=job.id,
                action='archive',
            ).exists()
        )

        # Restore must put the stop back on the live route, not just un-archive the job.
        restored = self.client.post(
            f'/api/pos/deliveries/{job.id}/restore/',
            {'reason': 'desk undo'},
            format='json',
        )
        self.assertEqual(restored.status_code, 200, restored.content)
        job.refresh_from_db()
        stop.refresh_from_db()
        self.assertIsNone(job.archived_at)
        self.assertEqual(job.status, DeliveryJob.STATUS_SCHEDULED)
        self.assertEqual(stop.state, DeliveryRunStop.STATE_QUEUED)
        self.assertEqual(stop.return_issue_code, '')
        self.assertEqual(stop.hold_reason, '')

    def test_assign_day_blocked_for_loaded_or_en_route_stop(self):
        job = DeliveryJob.objects.create(
            availability=self.day,
            scheduled_date=self.day.date,
            customer_name='On The Truck',
            phone='402-555-0188',
            address='88 Loaded Ln',
            items_delivered='Sofa',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )
        run = start_or_resume_run(
            date=self.day.date,
            user=self.user,
            availability_id=self.day.id,
        )
        stop = DeliveryRunStop.objects.get(run=run, job=job)
        stop.loaded_at = timezone.now()
        stop.save(update_fields=['loaded_at', 'updated_at'])

        other_day = DeliveryDay.objects.create(
            date=self.day.date + timedelta(days=2),
            time_start=time(9, 0),
            time_end=time(15, 0),
            location=self.location,
            assigned_to='Days Api',
        )
        r = self.client.post(
            f'/api/pos/deliveries/{job.id}/assign-day/',
            {'day': other_day.id, 'reason': 'desk move'},
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(r.data['code'], 'ASSIGN_DAY_BLOCKED')

        # The job and its stop must be untouched by the rejected move.
        job.refresh_from_db()
        stop.refresh_from_db()
        self.assertEqual(job.availability_id, self.day.id)
        self.assertEqual(job.scheduled_date, self.day.date)
        self.assertEqual(stop.state, DeliveryRunStop.STATE_QUEUED)
        self.assertFalse(
            DeliveryRunStop.objects.filter(job=job, run__date=other_day.date).exists()
        )
