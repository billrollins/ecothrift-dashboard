"""Delivery availability CRUD + add-delivery with scheduled date."""
from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import DeliveryAvailability, DeliveryJob, DeliveryRunStop, Drawer, Register


class DeliverySchedulingAPITests(TestCase):
    def setUp(self):
        self.client = APIClient()
        employee, _ = Group.objects.get_or_create(name='Employee')
        manager, _ = Group.objects.get_or_create(name='Manager')
        self.user = User.objects.create_user(
            email='pos-deliv@example.com',
            first_name='Pos',
            last_name='Deliv',
            password='test-pass-123',
        )
        self.user.groups.add(employee, manager)
        self.client.force_authenticate(user=self.user)

        self.location = WorkLocation.objects.create(name='POS Deliv Loc')
        self.register = Register.objects.create(
            location=self.location,
            name='Register Del',
            code='POS-DEL1',
        )
        self.drawer = Drawer.objects.create(
            register=self.register,
            date=timezone.now().date(),
            current_cashier=self.user,
            opened_by=self.user,
            opened_at=timezone.now(),
            status='open',
        )
        self.slot = DeliveryAvailability.objects.create(
            date=timezone.localdate() + timedelta(days=3),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            assigned_to='Jose + Mike',
            is_active=True,
        )

    def _open_cart(self):
        r = self.client.post('/api/pos/carts/', {'drawer': self.drawer.id}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        return r.data['id']

    def test_list_upcoming_availabilities_includes_counts(self):
        r = self.client.get('/api/pos/delivery-availabilities/', {'upcoming': '1'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(len(r.data), 1)
        self.assertEqual(r.data[0]['assigned_to'], 'Jose + Mike')
        self.assertEqual(r.data[0]['delivery_count'], 0)
        self.assertEqual(r.data[0]['items_booked'], 0)

    def test_add_delivery_without_date_needs_scheduling(self):
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'schedule_later': True,
                'notes': 'Prefers morning Saturdays',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        delivery = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'delivery')
        self.assertTrue(delivery['meta']['schedule_later'])
        self.assertIsNone(delivery['meta']['scheduled_date'])
        job = DeliveryJob.objects.get(cart_id=cid)
        self.assertEqual(job.status, DeliveryJob.STATUS_NEEDS_SCHEDULING)
        self.assertIsNone(job.scheduled_date)
        self.assertIsNone(job.availability_id)
        self.assertEqual(job.notes, 'Prefers morning Saturdays')

    def test_schedule_unscheduled_job_returns_customer_message(self):
        cid = self._open_cart()
        created = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'schedule_later': True,
            },
            format='json',
        )
        self.assertEqual(created.status_code, 200, created.content)
        job = DeliveryJob.objects.get(cart_id=cid)
        patched = self.client.patch(
            f'/api/pos/delivery-jobs/{job.id}/',
            {'availability_id': self.slot.id, 'notes': 'Gate code 1234'},
            format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.content)
        self.assertTrue(patched.data.get('just_scheduled'))
        self.assertIn('Your delivery has now been scheduled for', patched.data.get('customer_schedule_message', ''))
        job.refresh_from_db()
        self.assertEqual(job.status, DeliveryJob.STATUS_SCHEDULED)
        self.assertEqual(job.scheduled_date, self.slot.date)
        self.assertEqual(job.availability_id, self.slot.id)
        self.assertEqual(job.notes, 'Gate code 1234')

    def test_add_delivery_rejects_inactive_availability(self):
        self.slot.is_active = False
        self.slot.save(update_fields=['is_active'])
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['code'], 'AVAILABILITY_INACTIVE')

    def test_add_delivery_persists_cart_line_ids(self):
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
                'cart_line_ids': [101, 202],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        delivery = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'delivery')
        self.assertEqual(delivery['meta']['cart_line_ids'], [101, 202])

    def test_add_delivery_creates_job(self):
        cid = self._open_cart()
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer, Dryer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        delivery = next(ln for ln in r.data['lines'] if ln['line_kind'] == 'delivery')
        self.assertEqual(delivery['meta']['scheduled_date'], self.slot.date.isoformat())
        self.assertEqual(delivery['meta']['availability_id'], self.slot.id)
        job = DeliveryJob.objects.get(cart_id=cid)
        self.assertEqual(job.status, DeliveryJob.STATUS_SCHEDULED)
        self.assertEqual(job.item_count, 2)
        self.assertEqual(job.scheduled_date, self.slot.date)

        listed = self.client.get('/api/pos/delivery-jobs/', {'status': 'scheduled'})
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]['items_delivered'], 'Washer, Dryer')

        avail = self.client.get('/api/pos/delivery-availabilities/', {'upcoming': '1'})
        self.assertEqual(avail.data[0]['delivery_count'], 1)
        self.assertEqual(avail.data[0]['items_booked'], 2)

    def test_void_cancels_job(self):
        cid = self._open_cart()
        self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '10mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Fridge',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        r = self.client.post(f'/api/pos/carts/{cid}/void/')
        self.assertEqual(r.status_code, 200, r.content)
        job = DeliveryJob.objects.get(cart_id=cid)
        self.assertEqual(job.status, DeliveryJob.STATUS_CANCELLED)

    def test_delete_delivery_line_cancels_job(self):
        cid = self._open_cart()
        created = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        self.assertEqual(created.status_code, 200, created.content)
        line = next(ln for ln in created.data['lines'] if ln['line_kind'] == 'delivery')
        job = DeliveryJob.objects.get(cart_id=cid)
        self.assertEqual(job.status, DeliveryJob.STATUS_SCHEDULED)

        deleted = self.client.delete(f'/api/pos/carts/{cid}/lines/{line["id"]}/')
        self.assertEqual(deleted.status_code, 200, deleted.content)
        self.assertFalse(any(ln['line_kind'] == 'delivery' for ln in deleted.data['lines']))
        job.refresh_from_db()
        self.assertEqual(job.status, DeliveryJob.STATUS_CANCELLED)

    def test_patch_job_status_completed(self):
        cid = self._open_cart()
        created = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        self.assertEqual(created.status_code, 200, created.content)
        job = DeliveryJob.objects.get(cart_id=cid)
        patched = self.client.patch(
            f'/api/pos/delivery-jobs/{job.id}/',
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.content)
        job.refresh_from_db()
        self.assertEqual(job.status, DeliveryJob.STATUS_COMPLETED)

    def test_patch_job_completed_blocked_with_open_run(self):
        cid = self._open_cart()
        created = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        self.assertEqual(created.status_code, 200, created.content)
        job = DeliveryJob.objects.get(cart_id=cid)
        run_resp = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.slot.date.isoformat(), 'availability_id': self.slot.id},
            format='json',
        )
        self.assertEqual(run_resp.status_code, 201, run_resp.content)
        patched = self.client.patch(
            f'/api/pos/delivery-jobs/{job.id}/',
            {'status': 'completed'},
            format='json',
        )
        self.assertEqual(patched.status_code, 400)
        self.assertEqual(patched.data['code'], 'OPEN_RUN_STOP_INCOMPLETE')

    def test_patch_reschedule_removes_stop_from_open_run(self):
        later = DeliveryAvailability.objects.create(
            date=self.slot.date + timedelta(days=14),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        cid = self._open_cart()
        self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        job = DeliveryJob.objects.get(cart_id=cid)
        run_resp = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.slot.date.isoformat()},
            format='json',
        )
        self.assertEqual(run_resp.status_code, 201)
        stop = DeliveryRunStop.objects.get(run_id=run_resp.data['id'], job=job)
        patched = self.client.patch(
            f'/api/pos/delivery-jobs/{job.id}/',
            {'availability_id': later.id},
            format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.content)
        stop.refresh_from_db()
        job.refresh_from_db()
        self.assertEqual(stop.state, DeliveryRunStop.STATE_RESCHEDULED)
        self.assertEqual(job.scheduled_date, later.date)

    def test_reschedule_endpoint(self):
        later = DeliveryAvailability.objects.create(
            date=self.slot.date + timedelta(days=21),
            time_start=time(9, 0),
            time_end=time(15, 0),
            crew_size=2,
            is_active=True,
        )
        cid = self._open_cart()
        self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        job = DeliveryJob.objects.get(cart_id=cid)
        self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.slot.date.isoformat()},
            format='json',
        )
        r = self.client.post(
            f'/api/pos/delivery-jobs/{job.id}/reschedule/',
            {'availability_id': later.id, 'notes': 'Moved to later date'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['job']['scheduled_date'], later.date.isoformat())
        self.assertIn('run', r.data)

    def test_manager_can_patch_contact_fields(self):
        cid = self._open_cart()
        self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        job = DeliveryJob.objects.get(cart_id=cid)
        patched = self.client.patch(
            f'/api/pos/delivery-jobs/{job.id}/',
            {'customer_name': 'Jane Q. Doe', 'phone': '402-555-0199'},
            format='json',
        )
        self.assertEqual(patched.status_code, 200, patched.content)
        job.refresh_from_db()
        self.assertEqual(job.customer_name, 'Jane Q. Doe')
        self.assertEqual(job.phone, '402-555-0199')
        self.assertEqual(job.cart_line.meta.get('customer_name'), 'Jane Q. Doe')
        self.assertEqual(job.cart_line.meta.get('phone'), '402-555-0199')

    def test_create_standalone_delivery_job(self):
        r = self.client.post(
            '/api/pos/delivery-jobs/',
            {
                'customer_name': 'Pat Lee',
                'phone': '4025550111',
                'address': '500 Oak St',
                'items_delivered': 'Fridge',
                'availability_id': self.slot.id,
                'tier': '5mi',
                'notes': 'Board-created',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        job = DeliveryJob.objects.get(pk=r.data['id'])
        self.assertEqual(job.customer_name, 'Pat Lee')
        self.assertEqual(job.phone, '(402) 555-0111')
        self.assertEqual(job.status, DeliveryJob.STATUS_SCHEDULED)
        self.assertEqual(job.scheduled_date, self.slot.date)
        self.assertIsNone(job.cart_line_id)
        self.assertIn('customer_schedule_message', r.data)

    def test_create_delivery_schedule_later(self):
        r = self.client.post(
            '/api/pos/delivery-jobs/',
            {
                'customer_name': 'Sam',
                'phone': '402-555-0222',
                'address': '9 Pine',
                'items_delivered': 'Dryer',
                'schedule_later': True,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.data['status'], DeliveryJob.STATUS_NEEDS_SCHEDULING)

    def test_item_count_follows_linked_cart_line_qty(self):
        """Linked merchandise qty wins over a wrong client item_count."""
        from decimal import Decimal

        from apps.inventory.models import Category, Item, Product
        from apps.pos.models import CartLine

        cid = self._open_cart()
        cat = Category.objects.create(name='Appliances-Count', slug='appliances-count')
        product = Product.objects.create(title='Washer Count', brand='Acme', category=cat)
        item = Item.objects.create(
            sku='WASH-COUNT-1',
            product=product,
            price=Decimal('100.00'),
            status='on_shelf',
        )
        add = self.client.post(
            f'/api/pos/carts/{cid}/add-item/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(add.status_code, 200, add.content)
        merch = CartLine.objects.filter(cart_id=cid, item=item).first()
        self.assertIsNotNone(merch)
        r = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Count Test',
                'phone': '402-555-0333',
                'address': '1 Count St',
                'items_delivered': 'Washer Count',
                'availability_id': self.slot.id,
                'item_count': 9,  # wrong client value
                'cart_line_ids': [merch.id],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        job = DeliveryJob.objects.get(cart_id=cid)
        self.assertEqual(job.item_count, 1)
        listed = self.client.get(
            '/api/pos/delivery-jobs/',
            {'date_from': self.slot.date.isoformat()},
        )
        self.assertEqual(listed.status_code, 200)
        row = next(j for j in listed.data if j['id'] == job.id)
        self.assertEqual(row['item_count'], 1)

    def test_patch_cancel_syncs_open_run_stop(self):
        cid = self._open_cart()
        self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        job = DeliveryJob.objects.get(cart_id=cid)
        run_resp = self.client.post(
            '/api/pos/delivery-runs/',
            {'date': self.slot.date.isoformat()},
            format='json',
        )
        stop = DeliveryRunStop.objects.get(run_id=run_resp.data['id'], job=job)
        patched = self.client.patch(
            f'/api/pos/delivery-jobs/{job.id}/',
            {'status': 'cancelled'},
            format='json',
        )
        self.assertEqual(patched.status_code, 200)
        stop.refresh_from_db()
        job.refresh_from_db()
        self.assertEqual(job.status, DeliveryJob.STATUS_CANCELLED)
        self.assertEqual(stop.state, DeliveryRunStop.STATE_FAILED)

    def test_replace_line_updates_job_in_place(self):
        cid = self._open_cart()
        r1 = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '5mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0100',
                'address': '123 Main St',
                'items_delivered': 'Washer',
                'availability_id': self.slot.id,
            },
            format='json',
        )
        self.assertEqual(r1.status_code, 200, r1.content)
        line = next(ln for ln in r1.data['lines'] if ln['line_kind'] == 'delivery')
        r2 = self.client.post(
            f'/api/pos/carts/{cid}/add-delivery/',
            {
                'tier': '10mi',
                'customer_name': 'Jane Doe',
                'phone': '402-555-0199',
                'address': '456 Oak St',
                'items_delivered': 'Washer, Dryer',
                'availability_id': self.slot.id,
                'replace_line_id': line['id'],
            },
            format='json',
        )
        self.assertEqual(r2.status_code, 200, r2.content)
        deliveries = [ln for ln in r2.data['lines'] if ln['line_kind'] == 'delivery']
        self.assertEqual(len(deliveries), 1)
        self.assertEqual(deliveries[0]['id'], line['id'])
        self.assertEqual(deliveries[0]['meta']['phone'], '402-555-0199')
        self.assertEqual(Decimal(str(deliveries[0]['unit_price'])), Decimal('75.00'))
        self.assertEqual(DeliveryJob.objects.filter(cart_id=cid).count(), 1)
        job = DeliveryJob.objects.get(cart_id=cid)
        self.assertEqual(job.phone, '402-555-0199')
        self.assertEqual(job.items_delivered, 'Washer, Dryer')

    def test_optimize_route_returns_store_loop_maps_url(self):
        from urllib.parse import quote

        from apps.pos.services.delivery_distance import STORE_MAPS_ADDRESS

        r = self.client.post(
            '/api/pos/delivery/optimize-route/',
            {'addresses': ['100 Main St, Omaha, NE', '200 Oak Ave, Omaha, NE']},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn('maps_url', r.data)
        self.assertEqual(r.data['store_address'], STORE_MAPS_ADDRESS)
        store_q = quote(STORE_MAPS_ADDRESS)
        self.assertIn(f'origin={store_q}', r.data['maps_url'])
        self.assertIn(f'destination={store_q}', r.data['maps_url'])
        self.assertEqual(len(r.data['ordered_addresses']), 2)

    def test_optimize_route_requires_addresses(self):
        r = self.client.post('/api/pos/delivery/optimize-route/', {}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['code'], 'ADDRESSES_REQUIRED')
