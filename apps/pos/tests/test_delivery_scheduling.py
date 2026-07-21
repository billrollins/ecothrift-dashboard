"""Delivery availability CRUD + add-delivery with scheduled date."""
from datetime import time, timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import DeliveryAvailability, DeliveryJob, Drawer, Register


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
