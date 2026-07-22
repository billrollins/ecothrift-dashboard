"""Canonical /api/pos/delivery-days/ and /api/pos/deliveries/ API tests."""
from datetime import time, timedelta

from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.core.models import WorkLocation
from apps.pos.models import DeliveryChangeEvent, DeliveryDay, DeliveryJob, DeliveryJobItem


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
                'customer_name': '[TEST] Search Me',
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
