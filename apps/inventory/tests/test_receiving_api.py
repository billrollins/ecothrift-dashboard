"""Receiving API: for-receiving list, PATCH, photos, complete → deliver."""

import base64
import uuid
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.inventory.constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES
from apps.inventory.models import PurchaseOrder, Vendor

MIN_JPEG = base64.b64decode(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof'
    'Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwh'
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAB'
    'AAEADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAA'
    'AAAAAP/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQAC'
    'EQMRAD8ApsAD/9k='
)


class ReceivingApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.group, _ = Group.objects.get_or_create(name='Manager')
        self.user = get_user_model().objects.create_user(
            email='recv-test@example.com',
            first_name='R',
            last_name='Test',
            password='testpw',
        )
        self.user.groups.add(self.group)
        self.client.force_authenticate(user=self.user)

        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        self.vendor = Vendor.objects.create(name=dash_name, code='RCV-1')
        self.po_eligible = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-RECV-OK',
            ordered_date=date(2026, 4, 10),
            description='Eligible',
            status='paid',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
        )
        self.po_bad = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-RECV-BAD',
            ordered_date=date(2026, 4, 9),
            description='Delivered',
            status='delivered',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
        )

    def test_for_receiving_excludes_delivered_orders(self):
        r = self.client.get('/api/inventory/orders/for-receiving/')
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertIn(self.po_eligible.id, ids)
        self.assertNotIn(self.po_bad.id, ids)

    def test_for_receiving_orders_by_expected_delivery_tiers(self):
        """Future (asc) before overdue (desc) before null ED; nulls by ordered_date."""
        today = timezone.localdate()
        v = self.vendor
        common = {
            'vendor': v,
            'description': 'Tier test',
            'status': 'paid',
            'purchase_cost': Decimal('10.00'),
            'retail_value': Decimal('40.00'),
            'item_count': 0,
        }
        po_null = PurchaseOrder.objects.create(
            **common,
            order_number='PO-TIER-NULL',
            ordered_date=today - timedelta(days=1),
            expected_delivery=None,
        )
        po_future_later = PurchaseOrder.objects.create(
            **common,
            order_number='PO-TIER-F2',
            ordered_date=today,
            expected_delivery=today + timedelta(days=5),
        )
        po_future_soon = PurchaseOrder.objects.create(
            **common,
            order_number='PO-TIER-F1',
            ordered_date=today,
            expected_delivery=today + timedelta(days=1),
        )
        po_past_old = PurchaseOrder.objects.create(
            **common,
            order_number='PO-TIER-POLD',
            ordered_date=today,
            expected_delivery=today - timedelta(days=40),
        )
        po_past_recent = PurchaseOrder.objects.create(
            **common,
            order_number='PO-TIER-PNEW',
            ordered_date=today,
            expected_delivery=today - timedelta(days=2),
        )

        r = self.client.get('/api/inventory/orders/for-receiving/', {'page_size': 25})
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        expected_mid = [
            po_future_soon.id,
            po_future_later.id,
            po_past_recent.id,
            po_past_old.id,
        ]
        filtered = [i for i in ids if i in expected_mid]
        self.assertListEqual(filtered, expected_mid)

        self.assertLess(ids.index(po_past_old.id), ids.index(po_null.id), 'null ED after dated')

    def test_patch_receiving_shapes_draft(self):
        r = self.client.patch(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/',
            {
                'pallet_count': 1,
                'condition': 'good',
                'issues': '',
                'pallets': [{'pallet_number': 1, 'damaged': False}],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['is_draft'])
        self.assertEqual(r.data['pallet_count'], 1)

    def test_complete_rejected_without_side_photos(self):
        self.client.patch(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/',
            {
                'pallet_count': 1,
                'condition': 'good',
                'pallets': [{'pallet_number': 1, 'damaged': False}],
                'received_date': '2026-04-11',
            },
            format='json',
        )
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIsInstance(r.data['detail'], list)

    def _upload_photo(self, pallet_number, side):
        f = SimpleUploadedFile('t.jpg', MIN_JPEG, content_type='image/jpeg')
        return self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/photos/',
            {
                'kind': 'pallet_side',
                'file': f,
                'pallet_number': str(pallet_number),
                'side': side,
                'client_photo_id': str(uuid.uuid4()),
            },
            format='multipart',
        )

    def test_complete_delivers_order(self):
        self.client.patch(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/',
            {
                'pallet_count': 1,
                'condition': 'good',
                'pallets': [{'pallet_number': 1, 'damaged': False}],
                'received_date': '2026-04-12',
            },
            format='json',
        )
        for side in ('front', 'right', 'back', 'left'):
            r = self._upload_photo(1, side)
            self.assertEqual(r.status_code, 201, r.data)

        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNotNone(r.data.get('completed_at'))
        self.po_eligible.refresh_from_db()
        self.assertEqual(self.po_eligible.status, 'delivered')
        self.assertEqual(str(self.po_eligible.delivered_date), '2026-04-12')

    def test_client_photo_id_dedupes(self):
        self.client.patch(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/',
            {'pallet_count': 0, 'condition': 'good'},
            format='json',
        )
        cid = str(uuid.uuid4())
        f = SimpleUploadedFile('t.jpg', MIN_JPEG, content_type='image/jpeg')
        body = {
            'kind': 'bol',
            'file': f,
            'client_photo_id': cid,
        }
        r1 = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/photos/',
            body,
            format='multipart',
        )
        self.assertEqual(r1.status_code, 201)
        f2 = SimpleUploadedFile('t2.jpg', MIN_JPEG, content_type='image/jpeg')
        body2 = {'kind': 'bol', 'file': f2, 'client_photo_id': cid}
        r2 = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/photos/',
            body2,
            format='multipart',
        )
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['id'], r1.data['id'])
