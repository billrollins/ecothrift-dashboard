"""Receiving API: for-receiving list, PATCH, photos, complete → deliver."""

import io
import uuid
from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from PIL import Image
from rest_framework import status
from rest_framework.test import APIClient

from apps.core.models import S3File
from apps.inventory.constants import PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES
from apps.inventory.models import (
    ManifestRow,
    PurchaseOrder,
    Receiving,
    ReceivingAttachment,
    ReceivingPhotoOverride,
    Vendor,
    Item,
)
from apps.inventory.services.receiving_photos import HIGH_RES_MAX_EDGE, THUMB_MAX_BYTES, THUMB_MAX_EDGE

_TEST_STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.InMemoryStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}


def _jpeg_bytes(width=120, height=80, color=(12, 34, 56)):
    buf = io.BytesIO()
    Image.new('RGB', (width, height), color).save(buf, format='JPEG', quality=85)
    return buf.getvalue()


@override_settings(STORAGES=_TEST_STORAGES)
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

    def _patch_receiving(self, po=None, *, pallet_count=1, condition='good', received_date='2026-04-12'):
        po = po or self.po_eligible
        pallets = [{'pallet_number': n, 'damaged': False} for n in range(1, pallet_count + 1)]
        return self.client.patch(
            f'/api/inventory/orders/{po.id}/receiving/',
            {
                'received_pallet_count': pallet_count,
                'condition': condition,
                'pallets': pallets,
                'received_date': received_date,
            },
            format='json',
        )

    def _upload(self, kind, *, pallet_number=None, side=None, client_photo_id=None, raw=None, po=None):
        po = po or self.po_eligible
        f = SimpleUploadedFile('t.jpg', raw or _jpeg_bytes(), content_type='image/jpeg')
        body = {
            'kind': kind,
            'file': f,
            'client_photo_id': client_photo_id or str(uuid.uuid4()),
        }
        if kind == 'pallet_side':
            body['pallet_number'] = str(pallet_number)
            body['side'] = side
        return self.client.post(
            f'/api/inventory/orders/{po.id}/receiving/photos/',
            body,
            format='multipart',
        )

    def _upload_required_photos(self, *, pallet_count=1, po=None):
        po = po or self.po_eligible
        self.assertEqual(self._upload('bol', po=po).status_code, 201)
        self.assertEqual(self._upload('truck', po=po).status_code, 201)
        for n in range(1, pallet_count + 1):
            for side in ('front', 'right', 'back', 'left'):
                r = self._upload('pallet_side', pallet_number=n, side=side, po=po)
                self.assertEqual(r.status_code, 201, r.data)

    def test_for_receiving_matches_processing_status_set(self):
        """Same statuses as Processing picker; excludes ordered / cancelled."""
        po_ordered = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-RECV-ORD',
            ordered_date=date(2026, 4, 8),
            description='Ordered only',
            status='ordered',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
        )
        po_cancelled = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-RECV-CXL',
            ordered_date=date(2026, 4, 7),
            description='Cancelled',
            status='cancelled',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
        )
        r = self.client.get('/api/inventory/orders/for-receiving/')
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        self.assertIn(self.po_eligible.id, ids)
        self.assertIn(self.po_bad.id, ids)  # delivered — same as Processing picker
        self.assertNotIn(po_ordered.id, ids)
        self.assertNotIn(po_cancelled.id, ids)

    def test_for_receiving_orders_by_milestone_dates(self):
        """Null milestones first (not yet delivered/shipped/paid), then newest dates — matches Processing."""
        today = timezone.localdate()
        v = self.vendor
        common = {
            'vendor': v,
            'description': 'Milestone sort',
            'purchase_cost': Decimal('10.00'),
            'retail_value': Decimal('40.00'),
            'item_count': 0,
        }
        po_paid_no_ship = PurchaseOrder.objects.create(
            **common,
            status='paid',
            order_number='PO-MS-PAID',
            ordered_date=today - timedelta(days=20),
            paid_date=today - timedelta(days=10),
            shipped_date=None,
        )
        po_shipped_older = PurchaseOrder.objects.create(
            **common,
            status='shipped',
            order_number='PO-MS-SHIP-OLD',
            ordered_date=today - timedelta(days=15),
            paid_date=today - timedelta(days=12),
            shipped_date=today - timedelta(days=8),
        )
        po_shipped_newer = PurchaseOrder.objects.create(
            **common,
            status='shipped',
            order_number='PO-MS-SHIP-NEW',
            ordered_date=today - timedelta(days=14),
            paid_date=today - timedelta(days=11),
            shipped_date=today - timedelta(days=2),
        )
        po_delivered = PurchaseOrder.objects.create(
            **common,
            status='delivered',
            order_number='PO-MS-DEL',
            ordered_date=today - timedelta(days=30),
            paid_date=today - timedelta(days=25),
            shipped_date=today - timedelta(days=20),
            delivered_date=today - timedelta(days=1),
        )
        r = self.client.get('/api/inventory/orders/for-receiving/', {'page_size': 25})
        self.assertEqual(r.status_code, 200)
        ids = [row['id'] for row in r.data['results']]
        expected = [
            po_paid_no_ship.id,
            po_shipped_newer.id,
            po_shipped_older.id,
            po_delivered.id,
        ]
        filtered = [i for i in ids if i in expected]
        self.assertListEqual(filtered, expected)
        sample = next(row for row in r.data['results'] if row['id'] == po_shipped_newer.id)
        self.assertEqual(sample['shipped_date'], (today - timedelta(days=2)).isoformat())
        self.assertIn('paid_date', sample)
        self.assertIn('receiving_status', sample)

    def test_patch_receiving_shapes_draft(self):
        r = self.client.patch(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/',
            {
                'received_pallet_count': 1,
                'condition': 'good',
                'issues': '',
                'pallets': [{'pallet_number': 1, 'damaged': False}],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.data['is_draft'])
        self.assertEqual(r.data['received_pallet_count'], 1)
        self.assertIn('missing_required_photos', r.data)
        keys = {s['key'] for s in r.data['missing_required_photos']}
        self.assertIn('bol', keys)
        self.assertIn('truck', keys)
        self.po_eligible.refresh_from_db()
        self.assertEqual(self.po_eligible.receiving_status, 'active')
        self.assertIsNotNone(self.po_eligible.receiving_started_at)

    def test_upload_creates_high_res_and_thumbnail(self):
        self._patch_receiving()
        r = self._upload('bol', raw=_jpeg_bytes(900, 600))
        self.assertEqual(r.status_code, 201, r.data)
        self.assertIsNotNone(r.data['s3_file'])
        self.assertIsNotNone(r.data['thumbnail_file'])
        self.assertNotEqual(r.data['s3_file']['id'], r.data['thumbnail_file']['id'])
        att = ReceivingAttachment.objects.select_related('s3_file', 'thumbnail_file').get(pk=r.data['id'])
        self.assertTrue(default_storage.exists(att.s3_file.key))
        self.assertTrue(default_storage.exists(att.thumbnail_file.key))
        self.assertTrue(att.s3_file.key.endswith('.jpg'))
        self.assertTrue(att.thumbnail_file.key.endswith('_thumb.jpg'))
        self.assertLessEqual(att.thumbnail_file.size, THUMB_MAX_BYTES)
        with default_storage.open(att.thumbnail_file.key, 'rb') as fh:
            thumb = Image.open(fh)
            thumb.load()
            self.assertLessEqual(max(thumb.size), THUMB_MAX_EDGE)

    def test_upload_downscales_high_res_to_2048(self):
        self._patch_receiving()
        r = self._upload('truck', raw=_jpeg_bytes(3000, 2000))
        self.assertEqual(r.status_code, 201, r.data)
        att = ReceivingAttachment.objects.select_related('s3_file').get(pk=r.data['id'])
        with default_storage.open(att.s3_file.key, 'rb') as fh:
            high = Image.open(fh)
            high.load()
            self.assertLessEqual(max(high.size), HIGH_RES_MAX_EDGE)

    def test_upload_rejects_invalid_image(self):
        self._patch_receiving()
        r = self._upload('bol', raw=b'not-an-image')
        self.assertEqual(r.status_code, 400)
        self.assertIn(r.data.get('code'), ('invalid_image', 'receiving_photo_error'))

    def test_client_photo_id_dedupes(self):
        self._patch_receiving(pallet_count=0)
        cid = str(uuid.uuid4())
        r1 = self._upload('bol', client_photo_id=cid)
        self.assertEqual(r1.status_code, 201)
        r2 = self._upload('bol', client_photo_id=cid)
        self.assertEqual(r2.status_code, 200)
        self.assertEqual(r2.data['id'], r1.data['id'])
        self.assertEqual(ReceivingAttachment.objects.filter(client_photo_id=cid).count(), 1)

    def test_delete_photo_removes_both_storage_objects(self):
        self._patch_receiving()
        r = self._upload('bol')
        self.assertEqual(r.status_code, 201)
        att_id = r.data['id']
        high_id = r.data['s3_file']['id']
        thumb_id = r.data['thumbnail_file']['id']
        att = ReceivingAttachment.objects.select_related('s3_file', 'thumbnail_file').get(pk=att_id)
        high_key = att.s3_file.key
        thumb_key = att.thumbnail_file.key
        d = self.client.delete(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/photos/{att_id}/',
        )
        self.assertEqual(d.status_code, 204)
        self.assertFalse(ReceivingAttachment.objects.filter(pk=att_id).exists())
        self.assertFalse(S3File.objects.filter(pk=high_id).exists())
        self.assertFalse(S3File.objects.filter(pk=thumb_id).exists())
        self.assertFalse(default_storage.exists(high_key))
        self.assertFalse(default_storage.exists(thumb_key))

    def test_replace_photo_swaps_variants_keeps_attachment(self):
        self._patch_receiving()
        r = self._upload('bol', raw=_jpeg_bytes(100, 80, (1, 2, 3)))
        self.assertEqual(r.status_code, 201)
        att_id = r.data['id']
        old_high = r.data['s3_file']['id']
        old_thumb = r.data['thumbnail_file']['id']
        att = ReceivingAttachment.objects.select_related('s3_file', 'thumbnail_file').get(pk=att_id)
        old_high_key = att.s3_file.key
        old_thumb_key = att.thumbnail_file.key
        f = SimpleUploadedFile('edited.jpg', _jpeg_bytes(160, 120, (200, 10, 10)), content_type='image/jpeg')
        repl = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/photos/{att_id}/replace/',
            {'file': f},
            format='multipart',
        )
        self.assertEqual(repl.status_code, 200, repl.data)
        self.assertEqual(repl.data['id'], att_id)
        self.assertEqual(repl.data['kind'], 'bol')
        self.assertNotEqual(repl.data['s3_file']['id'], old_high)
        self.assertNotEqual(repl.data['thumbnail_file']['id'], old_thumb)
        self.assertFalse(S3File.objects.filter(pk=old_high).exists())
        self.assertFalse(S3File.objects.filter(pk=old_thumb).exists())
        self.assertFalse(default_storage.exists(old_high_key))
        self.assertFalse(default_storage.exists(old_thumb_key))
        att.refresh_from_db()
        self.assertTrue(default_storage.exists(att.s3_file.key))
        self.assertTrue(default_storage.exists(att.thumbnail_file.key))

    def test_replace_photo_locked_when_complete(self):
        self._patch_receiving()
        self._upload_required_photos(pallet_count=1)
        self.assertEqual(
            self.client.post(
                f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
                {},
                format='json',
            ).status_code,
            200,
        )
        att = ReceivingAttachment.objects.filter(
            receiving__purchase_order=self.po_eligible,
            kind='bol',
        ).first()
        f = SimpleUploadedFile('edited.jpg', _jpeg_bytes(), content_type='image/jpeg')
        repl = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/photos/{att.id}/replace/',
            {'file': f},
            format='multipart',
        )
        self.assertEqual(repl.status_code, 409)
        self.assertEqual(repl.data.get('code'), 'receiving_complete')

    def test_download_photo_headers_and_body(self):
        self._patch_receiving()
        r = self._upload('truck', raw=_jpeg_bytes(90, 70))
        att_id = r.data['id']
        d = self.client.get(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/photos/{att_id}/download/',
        )
        self.assertEqual(d.status_code, 200)
        self.assertIn('attachment', d.get('Content-Disposition', ''))
        body = b''.join(d.streaming_content)
        self.assertGreater(len(body), 50)
        self.assertEqual(body[:2], b'\xff\xd8')  # JPEG SOI

    def test_complete_requires_bol_truck_and_four_sides(self):
        self._patch_receiving(pallet_count=1)
        for side in ('front', 'right', 'back', 'left'):
            self.assertEqual(self._upload('pallet_side', pallet_number=1, side=side).status_code, 201)
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data.get('code'), 'receiving_incomplete')
        keys = {s['key'] for s in r.data['missing_required_photos']}
        self.assertEqual(keys, {'bol', 'truck'})

    def test_complete_multi_pallet_missing_slot_calculation(self):
        self._patch_receiving(pallet_count=2)
        self.assertEqual(self._upload('bol').status_code, 201)
        self.assertEqual(self._upload('truck').status_code, 201)
        for side in ('front', 'right', 'back', 'left'):
            self.assertEqual(self._upload('pallet_side', pallet_number=1, side=side).status_code, 201)
        # Pallet 2: only front
        self.assertEqual(self._upload('pallet_side', pallet_number=2, side='front').status_code, 201)
        detail = self.client.get(f'/api/inventory/orders/{self.po_eligible.id}/receiving/')
        keys = {s['key'] for s in detail.data['missing_required_photos']}
        self.assertEqual(
            keys,
            {
                'pallet_side:2:right',
                'pallet_side:2:back',
                'pallet_side:2:left',
            },
        )

    def test_complete_with_per_slot_overrides(self):
        self._patch_receiving(pallet_count=1)
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {
                'photo_overrides': [
                    {'kind': 'bol', 'reason': 'BOL lost in transit'},
                    {'kind': 'truck', 'reason': 'Camera dead'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'front', 'reason': 'Blocked'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'right', 'reason': 'Blocked'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'back', 'reason': 'Blocked'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'left', 'reason': 'Blocked'},
                ],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        rec = Receiving.objects.get(purchase_order=self.po_eligible)
        self.assertEqual(ReceivingPhotoOverride.objects.filter(receiving=rec).count(), 6)
        ov = ReceivingPhotoOverride.objects.get(receiving=rec, kind='bol')
        self.assertEqual(ov.reason, 'BOL lost in transit')
        self.assertEqual(ov.overridden_by_id, self.user.id)
        self.assertIsNotNone(ov.created_at)
        self.assertEqual(len(r.data['photo_overrides']), 6)

    def test_complete_rejects_blank_and_stale_overrides(self):
        self._patch_receiving(pallet_count=1)
        self.assertEqual(self._upload('bol').status_code, 201)
        # Missing truck + four sides; try blank reason + override for bol which exists
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {
                'photo_overrides': [
                    {'kind': 'bol', 'reason': 'stale'},
                    {'kind': 'truck', 'reason': '   '},
                ],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data.get('code'), 'receiving_incomplete')

        r2 = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {
                'photo_overrides': [
                    {'kind': 'truck', 'reason': 'ok'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'front', 'reason': 'ok'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'right', 'reason': 'ok'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'back', 'reason': 'ok'},
                    {'kind': 'pallet_side', 'pallet_number': 1, 'side': 'left', 'reason': 'ok'},
                    {'kind': 'bol', 'reason': 'should reject'},
                ],
            },
            format='json',
        )
        self.assertEqual(r2.status_code, 400)
        self.assertTrue(
            any('not needed' in str(x).lower() or 'bol' in str(x).lower() for x in r2.data.get('detail', [])),
        )

    def test_complete_hard_gates_cannot_be_overridden(self):
        self.client.patch(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/',
            {'received_pallet_count': 0, 'condition': ''},
            format='json',
        )
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {
                'photo_overrides': [
                    {'kind': 'bol', 'reason': 'n/a'},
                    {'kind': 'truck', 'reason': 'n/a'},
                ],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        detail = ' '.join(r.data.get('detail') or [])
        self.assertIn('pallet', detail.lower())

    def test_complete_does_not_materialize_items_from_manifest_rows(self):
        ManifestRow.objects.create(
            purchase_order=self.po_eligible,
            row_number=1,
            quantity=1,
            title='Legacy row',
            final_price=Decimal('1.00'),
        )
        self._patch_receiving(received_date='2026-04-11')
        self._upload_required_photos(pallet_count=1)
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.po_eligible.refresh_from_db()
        self.assertEqual(self.po_eligible.receiving_status, 'done')
        self.assertIsNotNone(self.po_eligible.receiving_done_at)
        self.assertEqual(Item.objects.filter(purchase_order=self.po_eligible).count(), 0)
        self._patch_receiving(received_date='2026-04-11')
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {},
            format='json',
        )
        self.assertEqual(r.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(r.data.get('code'), 'receiving_complete')

    def test_complete_delivers_order(self):
        self._patch_receiving(received_date='2026-04-12')
        self._upload_required_photos(pallet_count=1)
        r = self.client.post(
            f'/api/inventory/orders/{self.po_eligible.id}/receiving/complete/',
            {},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIsNotNone(r.data.get('completed_at'))
        self.assertEqual(r.data.get('missing_required_photos'), [])
        self.po_eligible.refresh_from_db()
        self.assertEqual(self.po_eligible.status, 'delivered')
        self.assertEqual(str(self.po_eligible.delivered_date), '2026-04-12')

    def test_legacy_serializer_null_thumbnail_is_ok(self):
        self._patch_receiving()
        r = self._upload('bol')
        att = ReceivingAttachment.objects.get(pk=r.data['id'])
        att.thumbnail_file = None
        att.save(update_fields=['thumbnail_file'])
        detail = self.client.get(f'/api/inventory/orders/{self.po_eligible.id}/receiving/')
        row = next(a for a in detail.data['attachments'] if a['id'] == att.id)
        self.assertIsNotNone(row['s3_file'])
        self.assertIsNone(row['thumbnail_file'])


@override_settings(STORAGES=_TEST_STORAGES)
class ReceivingThumbnailBackfillCommandTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            email='backfill@example.com',
            first_name='B',
            last_name='F',
            password='testpw',
        )
        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        self.vendor = Vendor.objects.create(name=dash_name, code='BF-1')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-BF',
            ordered_date=date(2026, 4, 10),
            status='paid',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
        )
        self.rec = Receiving.objects.create(purchase_order=self.po, created_by=self.user)

    def _legacy_attachment(self, *, corrupt=False):
        raw = b'corrupt' if corrupt else _jpeg_bytes(200, 150)
        key = f'receiving/orders/{self.po.id}/{uuid.uuid4().hex}.jpg'
        saved = default_storage.save(key, ContentFile(raw))
        sf = S3File.objects.create(
            key=saved,
            filename='legacy.jpg',
            size=len(raw),
            content_type='image/jpeg',
            uploaded_by=self.user,
        )
        return ReceivingAttachment.objects.create(
            receiving=self.rec,
            s3_file=sf,
            thumbnail_file=None,
            kind='bol',
        )

    def test_dry_run_performs_no_writes(self):
        att = self._legacy_attachment()
        out = io.StringIO()
        call_command('backfill_receiving_photo_thumbnails', '--dry-run', stdout=out)
        att.refresh_from_db()
        self.assertIsNone(att.thumbnail_file_id)
        self.assertIn('would_create=1', out.getvalue())

    def test_backfill_idempotent(self):
        att = self._legacy_attachment()
        call_command('backfill_receiving_photo_thumbnails', stdout=io.StringIO())
        att.refresh_from_db()
        self.assertIsNotNone(att.thumbnail_file_id)
        thumb_id = att.thumbnail_file_id
        out = io.StringIO()
        call_command('backfill_receiving_photo_thumbnails', stdout=out)
        att.refresh_from_db()
        self.assertEqual(att.thumbnail_file_id, thumb_id)
        self.assertIn('skipped=1', out.getvalue())

    def test_corrupt_source_reported_without_stopping(self):
        bad = self._legacy_attachment(corrupt=True)
        good = self._legacy_attachment(corrupt=False)
        err = io.StringIO()
        out = io.StringIO()
        call_command('backfill_receiving_photo_thumbnails', stdout=out, stderr=err)
        bad.refresh_from_db()
        good.refresh_from_db()
        self.assertIsNone(bad.thumbnail_file_id)
        self.assertIsNotNone(good.thumbnail_file_id)
        self.assertIn('failed=1', out.getvalue())

    def test_order_id_and_after_id_filters(self):
        a1 = self._legacy_attachment()
        a2 = self._legacy_attachment()
        other_po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-BF-2',
            ordered_date=date(2026, 4, 11),
            status='paid',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
        )
        other_rec = Receiving.objects.create(purchase_order=other_po, created_by=self.user)
        raw = _jpeg_bytes()
        key = f'receiving/orders/{other_po.id}/{uuid.uuid4().hex}.jpg'
        saved = default_storage.save(key, ContentFile(raw))
        sf = S3File.objects.create(
            key=saved,
            filename='other.jpg',
            size=len(raw),
            content_type='image/jpeg',
            uploaded_by=self.user,
        )
        other_att = ReceivingAttachment.objects.create(
            receiving=other_rec,
            s3_file=sf,
            kind='truck',
        )
        call_command(
            'backfill_receiving_photo_thumbnails',
            f'--order-id={self.po.id}',
            f'--after-id={a1.id}',
            stdout=io.StringIO(),
        )
        a1.refresh_from_db()
        a2.refresh_from_db()
        other_att.refresh_from_db()
        self.assertIsNone(a1.thumbnail_file_id)
        self.assertIsNotNone(a2.thumbnail_file_id)
        self.assertIsNone(other_att.thumbnail_file_id)


@override_settings(STORAGES=_TEST_STORAGES)
class ManifestPreviewDownloadApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.group, _ = Group.objects.get_or_create(name='Manager')
        self.user = get_user_model().objects.create_user(
            email='manifest-view@example.com',
            first_name='M',
            last_name='V',
            password='testpw',
        )
        self.user.groups.add(self.group)
        self.client.force_authenticate(user=self.user)
        dash_name = next(iter(PURCHASE_ORDER_DASHBOARD_VENDOR_NAMES))
        self.vendor = Vendor.objects.create(name=dash_name, code='MAN-1')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-MAN',
            ordered_date=date(2026, 4, 10),
            status='paid',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            item_count=0,
        )
        csv_bytes = b'a,b\n1,2\n3,4\n'
        key = default_storage.save('manifests/test-man.csv', ContentFile(csv_bytes))
        self.s3 = S3File.objects.create(
            key=key,
            filename='test-man.csv',
            size=len(csv_bytes),
            content_type='text/csv',
            uploaded_by=self.user,
        )
        self.po.manifest = self.s3
        self.po.manifest_filename = 'test-man.csv'
        self.po.manifest_row_count = 2
        self.po.manifest_preview = {
            'headers': ['a', 'b'],
            'rows': [
                {'row_number': 1, 'raw': {'a': '1', 'b': '2'}},
                {'row_number': 2, 'raw': {'a': '3', 'b': '4'}},
            ],
            'delimiter': ',',
            'row_count': 2,
        }
        self.po.save()

    def test_manifest_preview_shape(self):
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/manifest-preview/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['filename'], 'test-man.csv')
        self.assertEqual(r.data['headers'], ['a', 'b'])
        self.assertEqual(r.data['preview_row_count'], 2)
        self.assertEqual(r.data['total_row_count'], 2)
        self.assertEqual(r.data['delimiter'], ',')

    def test_manifest_download_headers_and_body(self):
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/manifest-download/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('attachment', r.get('Content-Disposition', ''))
        self.assertIn('test-man.csv', r.get('Content-Disposition', ''))
        self.assertEqual(b''.join(r.streaming_content), b'a,b\n1,2\n3,4\n')

    def test_manifest_missing_file_404(self):
        self.po.manifest = None
        self.po.save(update_fields=['manifest'])
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/manifest-preview/')
        self.assertEqual(r.status_code, 404)

    def test_manifest_storage_missing_404(self):
        default_storage.delete(self.s3.key)
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/manifest-download/')
        self.assertEqual(r.status_code, 404)
        self.assertEqual(r.data.get('code'), 'storage_missing')

    def test_manifest_requires_auth(self):
        anon = APIClient()
        r = anon.get(f'/api/inventory/orders/{self.po.id}/manifest-preview/')
        self.assertIn(r.status_code, (401, 403))
