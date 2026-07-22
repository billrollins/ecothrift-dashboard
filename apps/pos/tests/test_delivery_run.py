"""Delivery day wizard — calls confirmation, route/load gates, proof, return reconcile."""
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
    DeliveryRun,
    DeliveryRunStop,
)
from apps.pos.services.delivery_distance import plan_delivery_route_with_etas
from apps.pos.services.delivery_run import (
    add_call_attempt,
    append_address,
    complete_stop,
    log_event,
    mark_contact_present,
    mark_delivered,
    mark_loaded,
    mark_returned_to_store,
    mark_secured,
    report_issue,
    reorder_stops,
    reschedule_job_from_run,
    serialize_run,
    set_phase,
    start_or_resume_run,
    update_return_checklist,
)


class DeliveryRunServiceTests(TestCase):
    def setUp(self):
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='driver@example.com',
            first_name='Dee',
            last_name='Liver',
            password='test-pass-123',
        )
        self.user.groups.add(manager)
        self.date = timezone.localdate() + timedelta(days=2)
        self.slot = DeliveryAvailability.objects.create(
            date=self.date,
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            assigned_to='Jose',
            is_active=True,
        )
        self.job_a = DeliveryJob.objects.create(
            availability=self.slot,
            scheduled_date=self.date,
            customer_name='Alice',
            phone='402-555-0001',
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
            phone='402-555-0002',
            address='200 Oak St, Omaha, NE',
            items_delivered='Dryer',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )

    def test_start_snapshots_stops_and_starts_on_calls(self):
        run = start_or_resume_run(date=self.date, user=self.user, availability_id=self.slot.id)
        self.assertEqual(run.status, DeliveryRun.STATUS_PREPARING)
        self.assertEqual(run.phase, DeliveryRun.PHASE_CALLS)
        self.assertEqual(run.stops.count(), 2)
        payload = serialize_run(run)
        self.assertEqual(payload['progress']['total'], 2)
        self.assertFalse(payload['all_stops_called'])
        self.assertIsNone(payload['next_up'])  # unconfirmed cannot be next_up

    def test_resume_idempotent(self):
        a = start_or_resume_run(date=self.date, user=self.user)
        b = start_or_resume_run(date=self.date, user=self.user)
        self.assertEqual(a.id, b.id)
        self.assertEqual(DeliveryRun.objects.filter(date=self.date).count(), 1)

    def test_latest_call_drives_confirmation(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job_a)
        add_call_attempt(stop, user=self.user, result='no_answer')
        payload = serialize_run(run)
        s = next(x for x in payload['stops'] if x['id'] == stop.id)
        self.assertFalse(s['is_confirmed'])
        self.assertTrue(s['needs_call_again'])
        self.assertEqual(s['latest_call_result'], 'no_answer')

        add_call_attempt(stop, user=self.user, result='answered_will_be_there')
        payload = serialize_run(run)
        s = next(x for x in payload['stops'] if x['id'] == stop.id)
        self.assertTrue(s['is_confirmed'])
        self.assertFalse(s['needs_call_again'])
        self.assertEqual(payload['progress']['confirmed'], 1)
        self.assertEqual(
            run.stops.filter(state=DeliveryRunStop.STATE_NEXT_UP).count(),
            1,
        )

    @override_settings(GOOGLE_MAPS_API_KEY='')
    def test_plan_etas_fallback_without_key(self):
        plan = plan_delivery_route_with_etas(
            ['100 Main St', '200 Oak St'],
            optimize=True,
        )
        self.assertEqual(plan['ordered_addresses'], ['100 Main St', '200 Oak St'])
        self.assertFalse(plan['optimized'])
        self.assertFalse(plan['etas_available'])

    def test_reorder_accepts_confirmed_subset(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop_a = run.stops.get(job=self.job_a)
        stop_b = run.stops.get(job=self.job_b)
        add_call_attempt(stop_a, user=self.user, result='answered_will_be_there')
        add_call_attempt(stop_b, user=self.user, result='no_answer')
        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {}
            reorder_stops(run, [stop_a.id], user=self.user)
        stop_a.refresh_from_db()
        self.assertEqual(stop_a.position, 0)

    def test_complete_requires_checkpoints_or_override(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.order_by('position').first()
        add_call_attempt(stop, user=self.user, result='answered_will_be_there')
        with self.assertRaises(ValueError):
            complete_stop(stop, user=self.user, override=False)
        mark_contact_present(stop, user=self.user)
        mark_delivered(stop, user=self.user)
        with self.assertRaises(ValueError):
            complete_stop(stop, user=self.user, override=False)
        complete_stop(stop, user=self.user, override=True, override_reason='Customer signed paper')
        stop.refresh_from_db()
        self.assertEqual(stop.state, DeliveryRunStop.STATE_COMPLETED)
        self.job_a.refresh_from_db()
        self.assertEqual(self.job_a.status, DeliveryJob.STATUS_COMPLETED)

    def test_return_reconcile_fails_job_without_inventory_mutation(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job_a)
        add_call_attempt(stop, user=self.user, result='no_answer')
        mark_returned_to_store(run, user=self.user)
        run.refresh_from_db()
        self.assertIsNotNone(run.returned_to_store_at)
        self.assertEqual(run.phase, DeliveryRun.PHASE_RETURN)

        update_return_checklist(stop, user=self.user, unloaded=True, items_stored=True)
        with self.assertRaises(ValueError):
            update_return_checklist(stop, user=self.user, reconcile=True)

        update_return_checklist(
            stop,
            user=self.user,
            issue_code='no_customer',
            issue_notes='Nobody home after three attempts',
            reconcile=True,
        )
        stop.refresh_from_db()
        self.job_a.refresh_from_db()
        self.assertEqual(stop.state, DeliveryRunStop.STATE_FAILED)
        self.assertEqual(self.job_a.status, DeliveryJob.STATUS_FAILED)
        self.assertIsNotNone(stop.return_reconciled_at)

    def test_cannot_set_phase_to_active(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.first()
        add_call_attempt(stop, user=self.user, result='answered_will_be_there')
        mark_loaded(stop, user=self.user)
        with self.assertRaises(ValueError) as ctx:
            set_phase(run, DeliveryRun.PHASE_ACTIVE, user=self.user)
        self.assertIn('begin_route', str(ctx.exception))

    def test_cannot_set_phase_to_return(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        with self.assertRaises(ValueError) as ctx:
            set_phase(run, DeliveryRun.PHASE_RETURN, user=self.user)
        self.assertIn('return-store', str(ctx.exception))

    def test_report_issue_holds_and_promotes_next(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop_a = run.stops.get(job=self.job_a)
        stop_b = run.stops.get(job=self.job_b)
        add_call_attempt(stop_a, user=self.user, result='answered_will_be_there')
        add_call_attempt(stop_b, user=self.user, result='answered_will_be_there')
        stop_a.refresh_from_db()
        self.assertEqual(stop_a.state, DeliveryRunStop.STATE_NEXT_UP)

        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {}
            run.status = DeliveryRun.STATUS_EN_ROUTE
            run.save(update_fields=['status'])
            report_issue(
                stop_a,
                user=self.user,
                issue_code='no_customer',
                note='Gate locked',
                hold=True,
            )
            mock_plan.assert_called_once()

        stop_a.refresh_from_db()
        stop_b.refresh_from_db()
        self.assertEqual(stop_a.state, DeliveryRunStop.STATE_ON_HOLD)
        self.assertEqual(stop_b.state, DeliveryRunStop.STATE_NEXT_UP)
        self.assertIn('Gate locked', stop_a.hold_reason)

    def test_reschedule_before_load_removes_ghost_stop(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job_a)
        add_call_attempt(stop, user=self.user, result='answered_will_be_there')
        new_date = self.date + timedelta(days=7)
        new_slot = DeliveryAvailability.objects.create(
            date=new_date,
            time_start=time(10, 0),
            time_end=time(16, 0),
            crew_size=2,
            is_active=True,
        )
        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {}
            reschedule_job_from_run(
                self.job_a,
                user=self.user,
                availability=new_slot,
                notes='Customer requested next week',
            )
            mock_plan.assert_called_once()

        stop.refresh_from_db()
        self.job_a.refresh_from_db()
        self.assertEqual(stop.state, DeliveryRunStop.STATE_RESCHEDULED)
        self.assertEqual(self.job_a.scheduled_date, new_date)
        self.assertEqual(self.job_a.status, DeliveryJob.STATUS_SCHEDULED)
        payload = serialize_run(run)
        active_stops = [
            s for s in payload['stops'] if s['state'] not in ('rescheduled', 'failed', 'completed')
        ]
        self.assertEqual(len(active_stops), 1)
        self.assertEqual(active_stops[0]['job_id'], self.job_b.id)

    def test_reschedule_after_load_rejected(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job_a)
        add_call_attempt(stop, user=self.user, result='answered_will_be_there')
        mark_loaded(stop, user=self.user)
        new_date = self.date + timedelta(days=7)
        new_slot = DeliveryAvailability.objects.create(
            date=new_date,
            time_start=time(10, 0),
            time_end=time(16, 0),
            crew_size=2,
            is_active=True,
        )
        with self.assertRaises(ValueError) as ctx:
            reschedule_job_from_run(
                self.job_a,
                user=self.user,
                availability=new_slot,
            )
        self.assertIn('reconcile', str(ctx.exception))

    def test_append_address_recalculates_route(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.get(job=self.job_a)
        add_call_attempt(stop, user=self.user, result='answered_will_be_there')
        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {}
            append_address(
                self.job_a,
                user=self.user,
                address='555 Updated Blvd, Omaha, NE',
                reason='Customer correction',
            )
            mock_plan.assert_called_once()

    def test_serialize_run_includes_events_and_actions(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.first()
        log_event(run, 'note', actor=self.user, stop=stop, payload={'test': True})
        payload = serialize_run(run)
        self.assertIn('events', payload)
        self.assertGreaterEqual(len(payload['events']), 1)
        self.assertEqual(payload['events'][0]['event_type'], 'note')
        self.assertIn('next_action', payload)
        self.assertIn('allowed_actions', payload)
        self.assertIn('call', payload['allowed_actions'])


class DeliveryRunAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        employee, _ = Group.objects.get_or_create(name='Employee')
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='driver-api@example.com',
            first_name='Api',
            last_name='Driver',
            password='test-pass-123',
        )
        self.user.groups.add(employee, manager)
        self.client.force_authenticate(user=self.user)
        self.date = timezone.localdate() + timedelta(days=1)
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
            customer_name='Casey',
            phone='402-555-0199',
            address='300 Pine St, Omaha, NE',
            items_delivered='Fridge',
            item_count=1,
            status=DeliveryJob.STATUS_SCHEDULED,
            created_by=self.user,
        )

    def _confirm_stop(self, stop_id: int):
        r = self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/call/',
            {'result': 'answered_will_be_there', 'note': 'OK'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        return r

    def test_employee_can_start_call_and_load(self):
        r = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat(), 'availability_id': self.slot.id},
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['phase'], 'calls')
        self.assertEqual(r.data['progress']['total'], 1)
        stop_id = r.data['stops'][0]['id']
        item_id = r.data['stops'][0]['stop_items'][0]['id']

        # Phase 2: load is allowed while confirmation is still pending.
        loaded = self.client.post(f'/api/pos/delivery-stops/{stop_id}/load/', {'loaded': True})
        self.assertEqual(loaded.status_code, 200)

        self._confirm_stop(stop_id)
        # Secure requires item verified + photo (or exception).
        self.client.post(
            f'/api/pos/delivery-stop-items/{item_id}/skip/',
            {'reason': 'No barcode on appliance'},
            format='json',
        )
        self.client.post(
            f'/api/pos/delivery-stop-items/{item_id}/photo-exception/',
            {'reason': 'Camera offline for test'},
            format='json',
        )
        secured = self.client.post(f'/api/pos/delivery-stops/{stop_id}/secure/', {'secured': True})
        self.assertEqual(secured.status_code, 200)
        self.assertTrue(secured.data['all_loaded_secured'])
        self.assertTrue(secured.data['all_stops_called'])

    def test_phase_route_requires_truck_close(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        run_id = started.data['id']
        blocked = self.client.post(
            f'/api/pos/delivery-runs/{run_id}/phase/',
            {'phase': 'route'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400)
        # Load phase is allowed without confirmation.
        ok_load = self.client.post(
            f'/api/pos/delivery-runs/{run_id}/phase/',
            {'phase': 'load'},
            format='json',
        )
        self.assertEqual(ok_load.status_code, 200, ok_load.content)
        self.assertEqual(ok_load.data['phase'], 'load')

    def test_begin_route_requires_truck_photo(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        run_id = started.data['id']
        stop_id = started.data['stops'][0]['id']
        item_id = started.data['stops'][0]['stop_items'][0]['id']
        self._confirm_stop(stop_id)
        self.client.post(f'/api/pos/delivery-stops/{stop_id}/load/', {'loaded': True})
        self.client.post(
            f'/api/pos/delivery-stop-items/{item_id}/skip/',
            {'reason': 'test'},
            format='json',
        )
        self.client.post(
            f'/api/pos/delivery-stop-items/{item_id}/photo-exception/',
            {'reason': 'test'},
            format='json',
        )
        blocked = self.client.post(f'/api/pos/delivery-runs/{run_id}/begin-route/')
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.data['code'], 'BEGIN_ROUTE_BLOCKED')

    def test_upload_truck_photo_and_begin(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        run_id = started.data['id']
        stop_id = started.data['stops'][0]['id']
        item_id = started.data['stops'][0]['stop_items'][0]['id']
        self._confirm_stop(stop_id)
        self.client.post(f'/api/pos/delivery-stops/{stop_id}/load/', {'loaded': True})
        self.client.post(
            f'/api/pos/delivery-stop-items/{item_id}/skip/',
            {'reason': 'test'},
            format='json',
        )
        self.client.post(
            f'/api/pos/delivery-stop-items/{item_id}/photo-exception/',
            {'reason': 'test'},
            format='json',
        )
        self.assertEqual(
            self.client.post(
                f'/api/pos/delivery-runs/{run_id}/phase/',
                {'phase': 'load'},
                format='json',
            ).status_code,
            200,
        )
        img = SimpleUploadedFile('truck.jpg', b'\xff\xd8\xff\xd9fake', content_type='image/jpeg')
        up = self.client.post(
            f'/api/pos/delivery-runs/{run_id}/attachments/',
            {'file': img, 'kind': 'truck'},
            format='multipart',
        )
        self.assertEqual(up.status_code, 201, up.content)
        self.assertEqual(up.data['truck_photo_count'], 1)
        closed = self.client.post(f'/api/pos/delivery-runs/{run_id}/close-truck/')
        self.assertEqual(closed.status_code, 200, closed.content)
        self.client.post(
            f'/api/pos/delivery-runs/{run_id}/phase/',
            {'phase': 'route'},
            format='json',
        )
        with patch('apps.pos.services.delivery_run.apply_route_plan') as mock_plan:
            mock_plan.return_value = {'optimized': False, 'etas': []}
            began = self.client.post(f'/api/pos/delivery-runs/{run_id}/begin-route/')
        self.assertEqual(began.status_code, 200, began.content)
        self.assertEqual(began.data['status'], 'en_route')
        self.assertEqual(began.data['phase'], 'active')

    def test_contact_delivered_and_complete_gates(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        stop_id = started.data['stops'][0]['id']
        self._confirm_stop(stop_id)
        blocked = self.client.post(f'/api/pos/delivery-stops/{stop_id}/complete/', {})
        self.assertEqual(blocked.status_code, 400)
        self.client.post(f'/api/pos/delivery-stops/{stop_id}/contact-present/', {'present': True})
        self.client.post(f'/api/pos/delivery-stops/{stop_id}/delivered/', {'delivered': True})
        still = self.client.post(f'/api/pos/delivery-stops/{stop_id}/complete/', {})
        self.assertEqual(still.status_code, 400)
        ok = self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/complete/',
            {'override': True, 'override_reason': 'Paper signature'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.data['stops'][0]['state'], 'completed')

    def test_return_reconcile_and_finish_gate(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        run_id = started.data['id']
        stop_id = started.data['stops'][0]['id']
        self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/call/',
            {'result': 'no_answer'},
            format='json',
        )
        finish_blocked = self.client.post(f'/api/pos/delivery-runs/{run_id}/finish/')
        self.assertEqual(finish_blocked.status_code, 400)

        arrived = self.client.post(f'/api/pos/delivery-runs/{run_id}/return-store/')
        self.assertEqual(arrived.status_code, 200)
        self.assertIsNotNone(arrived.data['returned_to_store_at'])

        self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/return-reconcile/',
            {
                'unloaded': True,
                'items_stored': True,
                'issue_code': 'no_customer',
                'issue_notes': 'Left voicemail; returning fridge',
            },
            format='json',
        )
        reconciled = self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/return-reconcile/',
            {'reconcile': True},
            format='json',
        )
        self.assertEqual(reconciled.status_code, 200, reconciled.content)
        self.assertEqual(reconciled.data['stops'][0]['state'], 'failed')
        self.assertTrue(reconciled.data['can_finish'])

        finished = self.client.post(f'/api/pos/delivery-runs/{run_id}/finish/')
        self.assertEqual(finished.status_code, 200, finished.content)
        self.assertEqual(finished.data['status'], 'completed')

    def test_call_and_templates(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        stop = started.data['stops'][0]
        self.assertTrue(any(t['key'] == 'on_my_way' for t in stop['text_templates']))
        called = self.client.post(
            f'/api/pos/delivery-stops/{stop["id"]}/call/',
            {'result': 'answered_will_be_there', 'note': 'OK'},
            format='json',
        )
        self.assertEqual(called.status_code, 200)
        self.assertEqual(len(called.data['stops'][0]['call_attempts']), 1)
        self.assertTrue(called.data['stops'][0]['is_confirmed'])

    def test_append_address_keeps_original(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        job_id = started.data['stops'][0]['job_id']
        r = self.client.post(
            f'/api/pos/delivery-jobs/{job_id}/append-address/',
            {
                'address': '999 New Ave, Omaha, NE',
                'reason': 'Customer moved to side entrance',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('999 New Ave', r.data['stops'][0]['address'])
        self.job.refresh_from_db()
        self.assertEqual(self.job.address, '300 Pine St, Omaha, NE')

    def test_line_items_and_optional_scan_verify(self):
        from apps.core.models import WorkLocation
        from apps.inventory.models import Category, Item, Product
        from apps.pos.models import Cart, CartLine, Drawer, Register

        cat = Category.objects.create(name='Scan Cat Unique')
        product = Product.objects.create(title='Washer Pro', brand='GE', category=cat)
        item = Item.objects.create(
            product=product,
            sku='SCAN-WASHER-1',
            status='on_shelf',
            price='100.00',
        )
        location = WorkLocation.objects.create(name='Deliv Scan Loc')
        register = Register.objects.create(location=location, name='R1', code='SCAN-R1')
        drawer = Drawer.objects.create(
            register=register,
            date=timezone.localdate(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        cart = Cart.objects.create(drawer=drawer, cashier=self.user, status='open')
        merch = CartLine.objects.create(
            cart=cart,
            item=item,
            description=product.title,
            quantity=1,
            unit_price=item.price,
            line_kind=CartLine.LINE_KIND_ITEM,
        )
        delivery_line = CartLine.objects.create(
            cart=cart,
            description='Delivery',
            quantity=1,
            unit_price='50.00',
            line_kind=CartLine.LINE_KIND_DELIVERY,
            meta={'cart_line_ids': [merch.id], 'items_delivered': product.title},
        )
        self.job.cart = cart
        self.job.cart_line = delivery_line
        self.job.items_delivered = product.title
        self.job.save()

        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        self.assertEqual(started.status_code, 201, started.content)
        stop = started.data['stops'][0]
        self.assertEqual(len(stop['line_items']), 1)
        self.assertEqual(stop['line_items'][0]['sku'], 'SCAN-WASHER-1')
        self.assertTrue(stop['line_items'][0]['scannable'])

        bad = self.client.post(
            f'/api/pos/delivery-stops/{stop["id"]}/scan-verify/',
            {'sku': 'WRONG'},
            format='json',
        )
        self.assertEqual(bad.status_code, 400)

        ok = self.client.post(
            f'/api/pos/delivery-stops/{stop["id"]}/scan-verify/',
            {'sku': 'SCAN-WASHER-1'},
            format='json',
        )
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertTrue(ok.data['stops'][0]['line_items'][0]['scan_verified'])
        self.assertEqual(ok.data['stops'][0]['scan_verified_count'], 1)

    def test_maps_url_on_serialize_includes_store_loop(self):
        from urllib.parse import quote

        from apps.pos.services.delivery_distance import STORE_MAPS_ADDRESS

        run = start_or_resume_run(date=self.date, user=self.user)
        stop = run.stops.first()
        DeliveryCallAttempt.objects.create(
            stop=stop,
            result=DeliveryCallAttempt.RESULT_ANSWERED_WILL_BE_THERE,
            created_by=self.user,
        )
        with patch(
            'apps.pos.services.delivery_distance.plan_delivery_route_with_etas'
        ) as mock_plan:
            store_q = quote(STORE_MAPS_ADDRESS)
            mock_plan.return_value = {
                'ordered_addresses': [self.job.address],
                'order_indices': [0],
                'optimized': False,
                'maps_url': f'https://www.google.com/maps/dir/?api=1&origin={store_q}&destination={store_q}',
                'etas': [],
                'etas_available': False,
            }
            r = self.client.post(f'/api/pos/delivery-runs/{run.id}/optimize/', {'optimize': True})
        self.assertEqual(r.status_code, 200)
        self.assertIn('origin=', r.data['maps_url'])
        self.assertIn('destination=', r.data['maps_url'])

    def test_legacy_phase_review_maps_to_calls(self):
        run = start_or_resume_run(date=self.date, user=self.user)
        DeliveryRun.objects.filter(pk=run.id).update(phase='review')
        r = self.client.get(f'/api/pos/delivery-runs/{run.id}/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['phase'], 'calls')

    def test_cannot_set_phase_active_via_api(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        run_id = started.data['id']
        stop_id = started.data['stops'][0]['id']
        self._confirm_stop(stop_id)
        self.client.post(f'/api/pos/delivery-stops/{stop_id}/load/', {'loaded': True})
        self.client.post(f'/api/pos/delivery-stops/{stop_id}/secure/', {'secured': True})
        blocked = self.client.post(
            f'/api/pos/delivery-runs/{run_id}/phase/',
            {'phase': 'active'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('begin_route', blocked.data['detail'])

    def test_report_issue_via_api(self):
        started = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.date.isoformat()},
            format='json',
        )
        stop_id = started.data['stops'][0]['id']
        self._confirm_stop(stop_id)
        r = self.client.post(
            f'/api/pos/delivery-stops/{stop_id}/report-issue/',
            {'issue_code': 'could_not_access', 'note': 'Dog in yard', 'hold': True},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        stop = next(s for s in r.data['stops'] if s['id'] == stop_id)
        self.assertEqual(stop['state'], 'on_hold')
        self.assertTrue(any(e['event_type'] == 'issue' for e in r.data['events']))
