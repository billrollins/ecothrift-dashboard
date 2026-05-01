"""
Item Processor validation matrix — API-level tests.

Traceability: .ai/reference/Processor Mockups/PROCESSING_VALIDATION_MATRIX.md
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from apps.inventory.models import (
    Item,
    ManifestRow,
    Product,
    ProductMergeAudit,
    PurchaseOrder,
    Vendor,
)


class ProcessingValidationMatrixMarkCompleteTests(TestCase):
    """V-35 Close out PO; V-42 scrapped does not block complete."""

    def setUp(self):
        self.client = APIClient()
        self.group, _ = Group.objects.get_or_create(name='Manager')
        self.user = get_user_model().objects.create_user(
            email='proc-val@example.com',
            first_name='P',
            last_name='Test',
            password='testpw',
        )
        self.user.groups.add(self.group)
        self.client.force_authenticate(user=self.user)

        self.vendor = Vendor.objects.create(name='ValVendor', code='VAL-V')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-VAL-MK-1',
            ordered_date='2026-05-01',
            purchase_cost=Decimal('50.00'),
            retail_value=Decimal('200.00'),
            status='processing',
            item_count=0,
        )

    def test_v35_mark_complete_rejects_when_intake_remaining(self):
        product = Product.objects.create(title='P', product_number='PRD-VAL-1')
        Item.objects.create(
            sku=Item.generate_sku(),
            product=product,
            purchase_order=self.po,
            title='Line',
            unit_retail=Decimal('25.00'),
            status='intake',
        )
        r = self.client.post(f'/api/inventory/orders/{self.po.id}/mark-complete/')
        self.assertEqual(r.status_code, 400)
        self.assertIn('pending', r.data['detail'].lower())
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, 'processing')

    def test_v35_mark_complete_rejects_when_processing_remaining(self):
        product = Product.objects.create(title='P2', product_number='PRD-VAL-2')
        Item.objects.create(
            sku=Item.generate_sku(),
            product=product,
            purchase_order=self.po,
            title='Line2',
            unit_retail=Decimal('25.00'),
            status='processing',
        )
        r = self.client.post(f'/api/inventory/orders/{self.po.id}/mark-complete/')
        self.assertEqual(r.status_code, 400)

    def test_v35_mark_complete_succeeds_when_all_on_shelf(self):
        product = Product.objects.create(title='P3', product_number='PRD-VAL-3')
        Item.objects.create(
            sku=Item.generate_sku(),
            product=product,
            purchase_order=self.po,
            title='Shelf',
            unit_retail=Decimal('25.00'),
            status='on_shelf',
        )
        r = self.client.post(f'/api/inventory/orders/{self.po.id}/mark-complete/')
        self.assertEqual(r.status_code, 200, r.data)
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, 'complete')

    def test_v42_scrapped_items_do_not_block_mark_complete(self):
        p1 = Product.objects.create(title='Ok', product_number='PRD-VAL-4')
        p2 = Product.objects.create(title='Broken', product_number='PRD-VAL-5')
        Item.objects.create(
            sku=Item.generate_sku(),
            product=p1,
            purchase_order=self.po,
            title='Good unit',
            unit_retail=Decimal('10.00'),
            status='on_shelf',
        )
        Item.objects.create(
            sku=Item.generate_sku(),
            product=p2,
            purchase_order=self.po,
            title='Bad unit',
            unit_retail=Decimal('10.00'),
            status='scrapped',
        )
        r = self.client.post(f'/api/inventory/orders/{self.po.id}/mark-complete/')
        self.assertEqual(r.status_code, 200, r.data)
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, 'complete')

    def test_v42_lost_items_do_not_block_mark_complete(self):
        p1 = Product.objects.create(title='OkLost', product_number='PRD-VAL-LOSTA')
        p2 = Product.objects.create(title='LostSku', product_number='PRD-VAL-LOSTB')
        Item.objects.create(
            sku=Item.generate_sku(),
            product=p1,
            purchase_order=self.po,
            title='Shelf unit',
            unit_retail=Decimal('10.00'),
            status='on_shelf',
        )
        Item.objects.create(
            sku=Item.generate_sku(),
            product=p2,
            purchase_order=self.po,
            title='Lost manifest item',
            unit_retail=Decimal('10.00'),
            status='lost',
        )
        r = self.client.post(f'/api/inventory/orders/{self.po.id}/mark-complete/')
        self.assertEqual(r.status_code, 200, r.data)
        self.po.refresh_from_db()
        self.assertEqual(self.po.status, 'complete')


class ProcessingWorkspaceAndMutationTests(TestCase):
    """V-02, V-26–V-31 — workspace + processing mutations."""

    def setUp(self):
        self.client = APIClient()
        self.group, _ = Group.objects.get_or_create(name='Manager')
        self.user = get_user_model().objects.create_user(
            email='proc-ws@example.com',
            first_name='W',
            last_name='Test',
            password='testpw',
        )
        self.user.groups.add(self.group)
        self.client.force_authenticate(user=self.user)

        self.vendor = Vendor.objects.create(name='WsVendor', code='WS-V')
        self.po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-WS-1',
            ordered_date='2026-05-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('300.00'),
            status='processing',
            item_count=3,
        )
        self.p1 = Product.objects.create(title='Mixer A', product_number='PRD-WS-1')
        self.p2 = Product.objects.create(title='Mixer B', product_number='PRD-WS-2')
        self.mr1 = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=1,
            quantity=2,
            title='Mixer A',
            matched_product=self.p1,
            identifiers={'upc': '111'},
            unit_retail=Decimal('40.00'),
        )
        self.mr2 = ManifestRow.objects.create(
            purchase_order=self.po,
            row_number=2,
            quantity=1,
            title='Mixer B',
            matched_product=self.p2,
            identifiers={'upc': '222'},
            unit_retail=Decimal('50.00'),
        )
        self.i1 = Item.objects.create(
            sku=Item.generate_sku(),
            product=self.p1,
            purchase_order=self.po,
            manifest_row=self.mr1,
            title='Mixer A',
            unit_retail=Decimal('40.00'),
            price=Decimal('15.00'),
            status='intake',
            condition='good',
        )
        self.i2 = Item.objects.create(
            sku=Item.generate_sku(),
            product=self.p1,
            purchase_order=self.po,
            manifest_row=self.mr1,
            title='Mixer A',
            unit_retail=Decimal('40.00'),
            price=Decimal('15.00'),
            status='intake',
            condition='good',
        )
        self.i3 = Item.objects.create(
            sku=Item.generate_sku(),
            product=self.p2,
            purchase_order=self.po,
            manifest_row=self.mr2,
            title='Mixer B',
            unit_retail=Decimal('50.00'),
            price=Decimal('18.00'),
            status='intake',
            condition='good',
        )

    def test_v02_workspace_payload_shape(self):
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('order', r.data)
        self.assertIn('rows', r.data)
        self.assertIn('session', r.data)
        self.assertIn('progress', r.data)
        self.assertEqual(len(r.data['rows']), 2)
        row_nums = {row['rowNum'] for row in r.data['rows']}
        self.assertEqual(row_nums, {1, 2})
        r1 = next(x for x in r.data['rows'] if x['rowNum'] == 1)
        self.assertEqual(len(r1['items']), 2)
        self.assertIn('likelyDuplicateOf', r1)

    def test_processing_print_multiple_runs_select_for_update_inside_atomic(self):
        """select_for_update must run inside transaction.atomic (avoids 500 on strict DBs)."""
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-print-multiple/',
            {
                'manifest_row_id': self.mr1.id,
                'qty': 2,
                'condition': 'Used Good',
                'dispatch': 'on_shelf',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(set(r.data['checked_in_item_ids']), {self.i1.id, self.i2.id})
        self.i1.refresh_from_db()
        self.i2.refresh_from_db()
        self.assertEqual(self.i1.status, 'on_shelf')
        self.assertEqual(self.i2.status, 'on_shelf')

    def test_v26_dispute_broken_requires_fields(self):
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-dispute/',
            {'scope': 'items', 'ids': [self.i1.id], 'type': 'broken'},
            format='json',
        )
        self.assertEqual(r.status_code, 400)
        self.assertIn('detail', r.data)

    def test_v26_dispute_broken_ok(self):
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-dispute/',
            {
                'scope': 'items',
                'ids': [self.i1.id],
                'type': 'broken',
                'pct_loss': 50,
                'description': 'Cracked',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.i1.refresh_from_db()
        self.assertEqual(self.i1.status, 'scrapped')
        self.assertEqual(self.i1.dispute_type, 'broken')

    def test_v27_dispute_undelivered(self):
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-dispute/',
            {'scope': 'items', 'ids': [self.i3.id], 'type': 'undelivered'},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.i3.refresh_from_db()
        self.assertEqual(self.i3.status, 'lost')
        self.assertEqual(self.i3.dispute_type, 'undelivered')

    def test_v28_merge_writes_audit(self):
        before = ProductMergeAudit.objects.count()
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-merge-rows/',
            {
                'manifest_row_ids': [self.mr1.id, self.mr2.id],
                'field_values': {
                    'title': 'Merged Mixer',
                    'brand': 'KitchenAid',
                    'model': 'X',
                    'description': '',
                    'specs': {},
                    'tags': '',
                    'taxonomy': '',
                    'category': 'Small Appliances',
                },
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(ProductMergeAudit.objects.count(), before + 1)
        self.mr1.refresh_from_db()
        self.mr2.refresh_from_db()
        self.assertEqual(self.mr1.matched_product_id, self.mr2.matched_product_id)

    def test_v29_merge_idempotent(self):
        payload = {
            'manifest_row_ids': [self.mr1.id, self.mr2.id],
            'field_values': {
                'title': 'Merged Mixer',
                'brand': 'KitchenAid',
                'model': 'X',
                'category': 'Cat',
            },
        }
        r1 = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-merge-rows/',
            payload,
            format='json',
        )
        self.assertEqual(r1.status_code, 200)
        pid = self.mr1.matched_product_id
        r2 = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-merge-rows/',
            payload,
            format='json',
        )
        self.assertEqual(r2.status_code, 200)
        self.mr1.refresh_from_db()
        self.assertEqual(self.mr1.matched_product_id, pid)

    def test_v30_bulk_disposition_sum_validation(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-BULK-BAD',
            ordered_date='2026-05-02',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('40.00'),
            status='processing',
            item_count=2,
        )
        p = Product.objects.create(title='Blender', product_number='PRD-BLK')
        mr = ManifestRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=2,
            title='Blender',
            matched_product=p,
            unit_retail=Decimal('20.00'),
        )
        Item.objects.create(
            sku=Item.generate_sku(),
            product=p,
            purchase_order=po,
            manifest_row=mr,
            title='Blender',
            unit_retail=Decimal('20.00'),
            status='intake',
        )
        Item.objects.create(
            sku=Item.generate_sku(),
            product=p,
            purchase_order=po,
            manifest_row=mr,
            title='Blender',
            unit_retail=Decimal('20.00'),
            status='intake',
        )
        r = self.client.post(
            f'/api/inventory/orders/{po.id}/processing-bulk-disposition/',
            {
                'manifest_row_ids': [mr.id],
                'retail': '19.99',
                'groups': [
                    {'count': 1, 'condition': 'New', 'dispatch': 'on_shelf', 'disputed': None},
                ],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400)

    def test_v31_bulk_disposition_item_order(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-BULK-OK',
            ordered_date='2026-05-03',
            purchase_cost=Decimal('10.00'),
            retail_value=Decimal('60.00'),
            status='processing',
            item_count=3,
        )
        p = Product.objects.create(title='Kettle', product_number='PRD-KTL')
        mr = ManifestRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=3,
            title='Kettle',
            matched_product=p,
            unit_retail=Decimal('20.00'),
        )
        items = []
        for _ in range(3):
            items.append(
                Item.objects.create(
                    sku=Item.generate_sku(),
                    product=p,
                    purchase_order=po,
                    manifest_row=mr,
                    title='Kettle',
                    unit_retail=Decimal('20.00'),
                    status='intake',
                    condition='unknown',
                ),
            )
        items.sort(key=lambda x: x.id)
        r = self.client.post(
            f'/api/inventory/orders/{po.id}/processing-bulk-disposition/',
            {
                'manifest_row_ids': [mr.id],
                'retail': '21.00',
                'groups': [
                    {
                        'count': 2,
                        'condition': 'New',
                        'dispatch': 'on_shelf',
                        'price': '9.00',
                        'disputed': None,
                    },
                    {
                        'count': 1,
                        'condition': 'Used Fair',
                        'dispatch': 'on_shelf',
                        'price': '7.00',
                        'disputed': None,
                    },
                ],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        items[0].refresh_from_db()
        items[1].refresh_from_db()
        items[2].refresh_from_db()
        self.assertEqual(items[0].condition, 'new')
        self.assertEqual(items[1].condition, 'new')
        self.assertEqual(items[2].condition, 'fair')
