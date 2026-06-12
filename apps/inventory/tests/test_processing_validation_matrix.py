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
    ProcessingCheckInBatch,
    ProcessingDataBuild,
    ProcessingRow,
    Product,
    PurchaseOrder,
    Vendor,
)
from apps.inventory.services.processing_search_string import augment_processing_row_search_string
from apps.inventory.services.processing_workspace import refresh_processing_rows_denorm


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
        ProcessingRow.objects.create(
            purchase_order=self.po,
            row_number=int(self.mr1.row_number),
            quantity=int(self.mr1.quantity or 2),
            manifest_row=self.mr1,
            matched_product=self.p1,
            title=str(self.mr1.title or ''),
            identifiers=dict(self.mr1.identifiers or {}),
        )
        ProcessingRow.objects.create(
            purchase_order=self.po,
            row_number=int(self.mr2.row_number),
            quantity=int(self.mr2.quantity or 1),
            manifest_row=self.mr2,
            matched_product=self.p2,
            title=str(self.mr2.title or ''),
            identifiers=dict(self.mr2.identifiers or {}),
        )
        refresh_processing_rows_denorm(self.po)
        ProcessingRow.objects.filter(purchase_order=self.po, manifest_row=self.mr1).update(
            shelf_price=Decimal('15.00'),
        )
        ProcessingRow.objects.filter(purchase_order=self.po, manifest_row=self.mr2).update(
            shelf_price=Decimal('18.00'),
        )

    def test_v02_workspace_payload_shape(self):
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('order', r.data)
        self.assertIn('rows', r.data)
        self.assertIn('session', r.data)
        self.assertIn('progress', r.data)
        self.assertEqual(len(r.data['rows']), 2)
        self.assertEqual(r.data.get('row_count_filtered'), 2)
        self.assertEqual(r.data.get('row_count_total_po'), 2)
        row_nums = {row['rowNum'] for row in r.data['rows']}
        self.assertEqual(row_nums, {1, 2})
        r1 = next(x for x in r.data['rows'] if x['rowNum'] == 1)
        self.assertNotIn('items', r1)
        self.assertIn('processing_row_id', r1)
        self.assertIn('likelyDuplicateOf', r1)
        self.assertEqual(r1['likelyDuplicateOf'], [])
        self.assertNotIn('searchString', r1)
        self.assertNotIn('description', r1)
        self.assertNotIn('tags', r1)

    def test_workspace_pagination_default_limit(self):
        """List returns at most ``limit`` rows; metadata counts full filtered set."""
        r = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'limit': '1', 'offset': '0'},
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data['rows']), 1)
        self.assertEqual(r.data.get('row_count_filtered'), 2)
        self.assertEqual(r.data['rows'][0]['rowNum'], 1)
        r2 = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'limit': '1', 'offset': '1'},
        )
        self.assertEqual(r2.status_code, 200, r2.data)
        self.assertEqual(len(r2.data['rows']), 1)
        self.assertEqual(r2.data['rows'][0]['rowNum'], 2)

    def test_lazy_workspace_list_queries_skip_manifest_reads(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        from apps.inventory.services.processing_workspace import build_processing_workspace

        with CaptureQueriesContext(connection) as ctx:
            build_processing_workspace(self.po)
        joined = '\n'.join(q['sql'].lower() for q in ctx.captured_queries)
        self.assertNotIn('manifestrow', joined)

    def test_processing_row_detail_returns_items_and_product(self):
        pr = ProcessingRow.objects.get(purchase_order=self.po, row_number=1)
        r = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-row-detail/',
            {'processing_row_id': pr.pk},
        )
        self.assertEqual(r.status_code, 200, r.data)
        row = r.data['row']
        self.assertEqual(len(row['items']), 2)
        self.assertIsNotNone(row.get('product'))

    def test_processing_row_detail_query_count_bounded_no_manifest_bulk_load(self):
        """Regression: row detail must use slim PO queryset — not prefetched manifest storm."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        pr = ProcessingRow.objects.get(purchase_order=self.po, row_number=1)
        with CaptureQueriesContext(connection) as ctx:
            r = self.client.get(
                f'/api/inventory/orders/{self.po.id}/processing-row-detail/',
                {'processing_row_id': pr.pk},
            )
        self.assertEqual(r.status_code, 200, r.data)
        row = r.data['row']
        self.assertIn('processing_row_id', row)
        self.assertEqual(row['processing_row_id'], pr.pk)
        self.assertGreater(len(row['items']), 0)
        # Small PO fixture (~2 manifest rows): stay well below prefetch-all-manifest-rows path.
        self.assertLessEqual(len(ctx.captured_queries), 20)

    def test_purchase_order_retrieve_bounded_queries_no_live_stats(self):
        """PO retrieve is a hot path: one PO row, no multi-Count annotations on items."""
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        with CaptureQueriesContext(connection) as ctx:
            r = self.client.get(f'/api/inventory/orders/{self.po.id}/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('inventory_manifest_row_count', r.data)
        self.assertNotIn('processing_stats', r.data)
        self.assertLessEqual(len(ctx.captured_queries), 5)
        joined = '\n'.join(q['sql'].lower() for q in ctx.captured_queries)
        self.assertNotIn('bulk_load_objects', joined)

    def test_processing_stats_action_returns_counts(self):
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-stats/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertIn('item_status_counts', r.data)
        self.assertIn('pending_items', r.data)

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
        self.assertIn('dispute_id', r.data)
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
        ProcessingRow.objects.create(
            purchase_order=po,
            row_number=int(mr.row_number),
            quantity=int(mr.quantity or 3),
            manifest_row=mr,
            matched_product=p,
            title=str(mr.title or ''),
            identifiers=dict(mr.identifiers or {}),
        )
        refresh_processing_rows_denorm(po)
        ProcessingRow.objects.filter(purchase_order=po, manifest_row=mr).update(shelf_price=Decimal('20.00'))
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
        self.assertEqual(items[0].price, Decimal('9.00'))
        self.assertEqual(items[1].price, Decimal('9.00'))
        self.assertEqual(items[2].price, Decimal('7.00'))
        bm = ProcessingRow.objects.get(purchase_order=po, manifest_row=mr)
        self.assertEqual(bm.shelf_price, Decimal('7.00'))

    def test_processing_print_multiple_accepts_processing_row_id(self):
        pr1 = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-print-multiple/',
            {
                'processing_row_id': pr1.id,
                'qty': 2,
                'condition': 'Used Good',
                'dispatch': 'on_shelf',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(set(r.data['checked_in_item_ids']), {self.i1.id, self.i2.id})

    def test_processing_print_multiple_rejects_manifest_processing_row_conflict(self):
        pr2 = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr2)
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-print-multiple/',
            {
                'processing_row_id': pr2.id,
                'manifest_row_id': self.mr1.id,
                'qty': 1,
                'condition': 'Used Good',
                'dispatch': 'on_shelf',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.data)
        self.assertIn('conflict', str(r.data.get('detail', '')).lower())

    def test_processing_print_multiple_requires_data_for_unlinked_processing_row(self):
        po_bm = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-BOOKMARK-PRINT',
            ordered_date='2026-05-04',
            purchase_cost=Decimal('1.00'),
            retail_value=Decimal('10.00'),
            status='processing',
            item_count=0,
        )
        bookmark = ProcessingRow.objects.create(purchase_order=po_bm, row_number=1, quantity=2, title='Bookmark line')
        r = self.client.post(
            f'/api/inventory/orders/{po_bm.id}/processing-print-multiple/',
            {
                'processing_row_id': bookmark.id,
                'qty': 1,
                'condition': 'Used Good',
                'dispatch': 'on_shelf',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 400, r.data)
        self.assertEqual(r.data.get('code'), 'processing_data_required')

    def test_processing_dispute_processing_rows_scope_by_bookmark_pk(self):
        pr1 = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-dispute/',
            {
                'scope': 'processing_rows',
                'ids': [pr1.id],
                'type': 'broken',
                'pct_loss': 40,
                'description': 'Row-level broken',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.i1.refresh_from_db()
        self.i2.refresh_from_db()
        self.assertEqual(self.i1.status, 'scrapped')
        self.assertEqual(self.i2.status, 'scrapped')

    def test_processing_bulk_disposition_accepts_processing_row_ids(self):
        payload = {
            'processing_row_ids': [
                ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1).id,
                ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr2).id,
            ],
            'retail': '30.00',
            'groups': [
                {'count': 2, 'condition': 'New', 'dispatch': 'on_shelf', 'disputed': None},
                {'count': 1, 'condition': 'Used Good', 'dispatch': 'on_shelf', 'disputed': None},
            ],
        }
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-bulk-disposition/',
            payload,
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)

    def test_workspace_search_finds_tracking_json_via_search_string(self):
        pr = ProcessingRow.objects.get(purchase_order=self.po, row_number=1)
        pr.tracking = {'lot_id': 'unique-lot-marker-aaa'}
        pr.save(update_fields=['tracking'])
        r = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': 'unique-lot-marker'},
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data.get('row_count_filtered'), 1)
        row = r.data['rows'][0]
        self.assertEqual(row['rowNum'], 1)
        self.assertNotIn('searchString', row)

    def test_workspace_digit_only_token_matches_exact_row_number(self):
        ProcessingRow.objects.create(
            purchase_order=self.po,
            row_number=12,
            quantity=1,
            title='Line twelve',
        )
        r = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '1'},
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual({row['rowNum'] for row in r.data['rows']}, {1})
        self.assertEqual(r.data.get('row_count_filtered'), 1)

        r12 = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '12'},
        )
        self.assertEqual(r12.status_code, 200, r12.data)
        self.assertEqual({row['rowNum'] for row in r12.data['rows']}, {12})
        self.assertEqual(r12.data.get('row_count_filtered'), 1)

        r419 = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '419'},
        )
        self.assertEqual(r419.status_code, 200, r419.data)
        self.assertEqual(r419.data.get('row_count_filtered'), 0)

        ProcessingRow.objects.create(
            purchase_order=self.po,
            row_number=419,
            quantity=1,
            title='Line four nineteen',
            identifiers={'upc': '00041911000505'},
        )

        by_row = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '419'},
        )
        self.assertEqual(by_row.status_code, 200, by_row.data)
        self.assertEqual(by_row.data.get('row_count_filtered'), 1)
        self.assertEqual(by_row.data['rows'][0]['rowNum'], 419)

        by_upc_partial = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '4191'},
        )
        self.assertEqual(by_upc_partial.status_code, 200, by_upc_partial.data)
        self.assertGreaterEqual(by_upc_partial.data.get('row_count_filtered', 0), 1)
        self.assertTrue(any(row['rowNum'] == 419 for row in by_upc_partial.data['rows']))

    def test_workspace_search_finds_long_digit_identifiers_and_specs(self):
        pr = ProcessingRow.objects.get(purchase_order=self.po, row_number=1)
        pr.identifiers = {'upc': '00817939000038', 'item_number': '667885167'}
        pr.specifications = {'size': '28 oz'}
        pr.save()
        pr.refresh_from_db()
        self.assertIn('00817939000038', pr.search_string)

        full_upc = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '00817939000038'},
        )
        self.assertEqual(full_upc.status_code, 200, full_upc.data)
        self.assertEqual(full_upc.data.get('row_count_filtered'), 1)
        self.assertEqual(full_upc.data['rows'][0]['rowNum'], 1)

        partial_upc = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '8179390'},
        )
        self.assertEqual(partial_upc.status_code, 200, partial_upc.data)
        self.assertEqual(partial_upc.data.get('row_count_filtered'), 1)

        four_digit_partial = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '3900'},
        )
        self.assertEqual(four_digit_partial.status_code, 200, four_digit_partial.data)
        self.assertEqual(four_digit_partial.data.get('row_count_filtered'), 1)

        item_number = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '667885167'},
        )
        self.assertEqual(item_number.status_code, 200, item_number.data)
        self.assertEqual(item_number.data.get('row_count_filtered'), 1)

        spec = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': '28 oz'},
        )
        self.assertEqual(spec.status_code, 200, spec.data)
        self.assertEqual(spec.data.get('row_count_filtered'), 1)

    def test_manual_review_updates_linked_bookmark_search_string(self):
        self.mr1.final_price = Decimal('10.00')
        self.mr1.proposed_price = Decimal('10.00')
        self.mr1.pricing_stage = 'final'
        self.mr1.save()
        resp = self.client.post(
            f'/api/inventory/orders/{self.po.id}/manual-review/',
            {'rows': [{'id': self.mr1.id, 'title': 'Zebra manual review title'}]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        q = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': 'zebra manual'},
        )
        self.assertEqual(q.status_code, 200, q.data)
        self.assertGreaterEqual(q.data.get('row_count_filtered', 0), 1)

    def test_workspace_queue_price_follows_bookmark_shelf_price_not_item(self):
        pr1 = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        Item.objects.filter(pk=self.i1.pk).update(price=Decimal('1.00'))
        ProcessingRow.objects.filter(pk=pr1.pk).update(shelf_price=Decimal('42.00'))
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/')
        self.assertEqual(r.status_code, 200, r.data)
        row1 = next(x for x in r.data['rows'] if x['rowNum'] == 1)
        self.assertEqual(row1['price'], '42.00')

    def test_workspace_price_stays_bookmark_when_item_price_changed_without_bookmark(self):
        pr1 = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        ProcessingRow.objects.filter(pk=pr1.pk).update(shelf_price=Decimal('10.00'))
        Item.objects.filter(pk=self.i1.pk).update(price=Decimal('77.77'))
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/')
        self.assertEqual(r.status_code, 200, r.data)
        row1 = next(x for x in r.data['rows'] if x['rowNum'] == 1)
        self.assertEqual(row1['price'], '10.00')

    def test_processing_print_and_check_in_syncs_bookmark_shelf_price_with_item(self):
        pr1 = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        ProcessingRow.objects.filter(pk=pr1.pk).update(shelf_price=Decimal('15.00'))
        r = self.client.post(
            f'/api/inventory/items/{self.i1.id}/processing-print-and-check-in/',
            {
                'condition': 'Used Good',
                'dispatch': 'on_shelf',
                'price': '24.99',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        pr1.refresh_from_db()
        self.i1.refresh_from_db()
        self.assertEqual(pr1.shelf_price, Decimal('24.99'))
        self.assertEqual(pr1.final_price, Decimal('24.99'))
        self.assertEqual(self.i1.price, Decimal('24.99'))

    def test_processing_row_check_in_creates_items_without_prebuilt_units(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-ROW-CHECKIN',
            ordered_date='2026-05-03',
            purchase_cost=Decimal('20.00'),
            retail_value=Decimal('100.00'),
            status='processing',
        )
        mr = ManifestRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=5,
            title='Nerf Gun',
            brand='Nerf',
            category='Toys & Games',
            identifiers={'upc': '999111222333'},
            unit_retail=Decimal('20.00'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=po,
            manifest_row=mr,
            row_number=1,
            quantity=5,
            title='NERF Gun',
            brand='Nerf',
            category='Toys & Games',
            identifiers={'upc': '999111222333'},
            unit_retail=Decimal('20.00'),
            shelf_price=Decimal('7.99'),
        )

        r = self.client.post(
            f'/api/inventory/orders/{po.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 3,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '7.99',
                'retail': '20.00',
            },
            format='json',
        )

        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['created_count'], 3)
        items = Item.objects.filter(purchase_order=po, manifest_row=mr)
        self.assertEqual(items.count(), 3)
        self.assertEqual(items.filter(status='on_shelf', product__upc='999111222333').count(), 3)
        pr.refresh_from_db()
        self.assertEqual(pr.qty_dispositioned, 3)
        self.assertEqual(pr.pending_item_count, 0)
        self.assertEqual(pr.queue_status, 'checked_in')

    def test_workspace_search_finds_checked_in_item_sku(self):
        refresh_processing_rows_denorm(self.po)
        pr = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        self.assertIn(self.i1.sku.lower(), pr.search_string)
        r = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': self.i1.sku, 'hide_checked_in': 'false'},
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertGreaterEqual(r.data.get('row_count_filtered', 0), 1)
        self.assertTrue(any(row['rowNum'] == 1 for row in r.data['rows']))

    def test_augment_search_string_includes_product_and_item_sku(self):
        base = 'mixer a row1'
        blob = augment_processing_row_search_string(
            base,
            product=self.p1,
            items=[self.i1],
        )
        self.assertIn(self.p1.product_number.lower(), blob)
        self.assertIn(self.i1.sku.lower(), blob)

    def test_processing_row_patch_updates_defaults_without_creating_items(self):
        pr = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        before_count = Item.objects.filter(purchase_order=self.po).count()
        r = self.client.patch(
            f'/api/inventory/orders/{self.po.id}/processing-row-patch/',
            {
                'processing_row_id': pr.id,
                'title': 'Patched row title only',
                'shelf_price': '19.99',
                'search_tags': ['nerf', 'blaster'],
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(Item.objects.filter(purchase_order=self.po).count(), before_count)
        pr.refresh_from_db()
        self.assertEqual(pr.title, 'Patched row title only')
        self.assertEqual(pr.shelf_price, Decimal('19.99'))
        self.assertIn('nerf', pr.search_string)

    def test_processing_row_patch_identifiers_replace_add_remove(self):
        pr = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        r = self.client.patch(
            f'/api/inventory/orders/{self.po.id}/processing-row-patch/',
            {
                'processing_row_id': pr.id,
                'identifiers': {
                    'upc': '111222333',
                    'asin': 'B00TEST123',
                    'custom_ref': 'vendor-abc',
                },
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        pr.refresh_from_db()
        self.mr1.refresh_from_db()
        self.assertEqual(pr.identifiers['upc'], '111222333')
        self.assertEqual(pr.identifiers['asin'], 'B00TEST123')
        self.assertEqual(pr.identifiers['custom_ref'], 'vendor-abc')
        # Rule 1: row-default edits never touch the manifest (vendor claim stays frozen).
        self.assertEqual(self.mr1.identifiers['upc'], '111')
        self.assertEqual(r.data['row']['identifiers']['asin'], 'B00TEST123')

        r2 = self.client.patch(
            f'/api/inventory/orders/{self.po.id}/processing-row-patch/',
            {
                'processing_row_id': pr.id,
                'identifiers': {'upc': '999'},
            },
            format='json',
        )
        self.assertEqual(r2.status_code, 200, r2.data)
        pr.refresh_from_db()
        self.mr1.refresh_from_db()
        self.assertEqual(pr.identifiers, {'upc': '999'})
        self.assertEqual(self.mr1.identifiers['upc'], '111')
        self.assertNotIn('asin', r2.data['row']['identifiers'])

    def test_processing_row_patch_legacy_upc_only(self):
        pr = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr2)
        r = self.client.patch(
            f'/api/inventory/orders/{self.po.id}/processing-row-patch/',
            {
                'processing_row_id': pr.id,
                'upc': '555666777',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        pr.refresh_from_db()
        self.mr2.refresh_from_db()
        self.assertEqual(pr.identifiers['upc'], '555666777')
        # Rule 1: manifest UPC untouched by row-default edits.
        self.assertEqual(self.mr2.identifiers['upc'], '222')

    def test_workspace_payload_includes_rollups(self):
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/')
        self.assertEqual(r.status_code, 200, r.data)
        rollups = r.data.get('rollups') or {}
        self.assertIn('expected_qty', rollups)
        self.assertGreaterEqual(rollups['expected_qty'], 2)

    def test_processing_add_item_creates_added_row_in_queue(self):
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-add-item/',
            {
                'title': 'Surprise pallet find',
                'brand': 'Generic',
                'price': '12.99',
                'retail': '24.00',
                'condition': 'good',
                'quantity': 1,
                'product_mode': 'new',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['created_count'], 1)
        row = r.data['row']
        self.assertEqual(row.get('rowKind'), 'added')
        self.assertIsNone(row.get('manifest_row_id'))
        pr = ProcessingRow.objects.get(pk=row['processing_row_id'])
        self.assertEqual(pr.row_kind, ProcessingRow.ROW_KIND_ADDED)
        self.assertIsNone(pr.manifest_row_id)
        self.assertEqual(len(pr.item_ids), 1)
        item = Item.objects.get(pk=pr.item_ids[0])
        self.assertIsNone(item.manifest_row_id)
        self.assertEqual(item.purchase_order_id, self.po.id)

    def test_added_row_searchable_by_item_sku(self):
        add = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-add-item/',
            {
                'title': 'Scan test added',
                'brand': 'ScanBrand',
                'price': '5.00',
                'product_mode': 'new',
            },
            format='json',
        )
        self.assertEqual(add.status_code, 200, add.data)
        item = Item.objects.get(pk=add.data['items'][0]['id'])
        q = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-workspace/',
            {'search': item.sku, 'hide_checked_in': 'false'},
        )
        self.assertEqual(q.status_code, 200, q.data)
        self.assertGreaterEqual(q.data.get('row_count_filtered', 0), 1)
        self.assertTrue(any(row.get('rowKind') == 'added' for row in q.data['rows']))

    def test_check_in_product_mode_existing_uses_chosen_product(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-PROD-MODE',
            ordered_date='2026-05-04',
            purchase_cost=Decimal('20.00'),
            retail_value=Decimal('80.00'),
            status='processing',
        )
        alt = Product.objects.create(title='Alternate SKU', product_number='PRD-ALT-1', upc='ALT-UPC-1')
        mr = ManifestRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=2,
            title='Manifest widget',
            matched_product=self.p1,
            unit_retail=Decimal('20.00'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=po,
            manifest_row=mr,
            row_number=1,
            quantity=2,
            title='Manifest widget',
            matched_product=self.p1,
            unit_retail=Decimal('20.00'),
            shelf_price=Decimal('9.99'),
        )
        r = self.client.post(
            f'/api/inventory/orders/{po.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '9.99',
                'product_mode': 'existing',
                'product_id': alt.id,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        item = Item.objects.filter(purchase_order=po, manifest_row=mr).first()
        self.assertIsNotNone(item)
        self.assertEqual(item.product_id, alt.id)

    def test_processing_row_check_in_reuses_latest_batch_product(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-ROW-REUSE-PROD',
            ordered_date='2026-05-06',
            purchase_cost=Decimal('20.00'),
            retail_value=Decimal('100.00'),
            status='processing',
        )
        mr = ManifestRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=5,
            title='Reuse widget',
            brand='Acme',
            category='Home',
            unit_retail=Decimal('20.00'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=po,
            manifest_row=mr,
            row_number=1,
            quantity=5,
            title='Reuse widget',
            brand='Acme',
            category='Home',
            unit_retail=Decimal('20.00'),
            shelf_price=Decimal('7.99'),
        )

        first = self.client.post(
            f'/api/inventory/orders/{po.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '7.99',
                'product_mode': 'new',
                'title': 'Reuse widget',
                'brand': 'Acme',
                'category': 'Home',
            },
            format='json',
        )
        self.assertEqual(first.status_code, 200, first.data)
        first_product_id = Item.objects.filter(purchase_order=po, manifest_row=mr).first().product_id

        second = self.client.post(
            f'/api/inventory/orders/{po.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '7.99',
            },
            format='json',
        )
        self.assertEqual(second.status_code, 200, second.data)
        product_ids = set(Item.objects.filter(purchase_order=po, manifest_row=mr).values_list('product_id', flat=True))
        self.assertEqual(product_ids, {first_product_id})
        mr.refresh_from_db()
        self.assertIsNone(mr.matched_product_id)

    def test_check_in_overage_beyond_manifest_qty(self):
        po = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-OVERAGE',
            ordered_date='2026-05-05',
            purchase_cost=Decimal('20.00'),
            retail_value=Decimal('60.00'),
            status='processing',
        )
        mr = ManifestRow.objects.create(
            purchase_order=po,
            row_number=1,
            quantity=2,
            title='Two expected',
            unit_retail=Decimal('15.00'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=po,
            manifest_row=mr,
            row_number=1,
            quantity=2,
            title='Two expected',
            unit_retail=Decimal('15.00'),
            shelf_price=Decimal('7.00'),
        )
        r = self.client.post(
            f'/api/inventory/orders/{po.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 3,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '7.00',
                'product_mode': 'keep',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['created_count'], 3)
        self.assertEqual(Item.objects.filter(purchase_order=po, manifest_row=mr).count(), 3)
        pr.refresh_from_db()
        self.assertEqual(pr.qty_dispositioned, 3)

    def test_added_row_does_not_trigger_legacy_build_flag(self):
        self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-add-item/',
            {'title': 'Lone add', 'price': '3.00', 'product_mode': 'new'},
            format='json',
        )
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(r.data.get('processingBookmarkOnly'))
        migration = r.data.get('intake_migration') or {}
        self.assertTrue(migration.get('has_linked_manifest_rows'))

    def test_bookmark_only_false_when_manifest_linked_despite_incomplete_build(self):
        ProcessingDataBuild.objects.create(
            purchase_order=self.po,
            status=ProcessingDataBuild.STATUS_RUNNING,
            total_rows=3,
            processed_rows=1,
        )
        r = self.client.get(f'/api/inventory/orders/{self.po.id}/processing-workspace/')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertFalse(r.data.get('processingBookmarkOnly'))
        migration = r.data.get('intake_migration') or {}
        self.assertTrue(migration.get('has_linked_manifest_rows'))
        self.assertFalse(migration.get('requires_legacy_build'))

    def test_processing_row_detail_item_includes_created_at(self):
        self.i1.status = 'on_shelf'
        self.i1.checked_in_at = '2026-06-01T12:00:00Z'
        self.i1.save(update_fields=['status', 'checked_in_at'])
        pr = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        r = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-row-detail/',
            {'processing_row_id': pr.pk},
        )
        self.assertEqual(r.status_code, 200, r.data)
        item_payload = next(x for x in r.data['row']['items'] if x['id'] == self.i1.id)
        self.assertIsNotNone(item_payload.get('created_at'))
        self.assertEqual(item_payload.get('product_number'), self.p1.product_number)

    def test_processing_patch_item_dispute_on_shelf_keeps_status(self):
        self.i1.status = 'on_shelf'
        self.i1.save(update_fields=['status'])
        r = self.client.patch(
            f'/api/inventory/items/{self.i1.id}/processing-patch/',
            {
                'disputed': True,
                'dispute_type': 'missing_pieces',
                'dispute_pct_loss': 25,
                'dispute_description': 'Box incomplete',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.i1.refresh_from_db()
        self.assertEqual(self.i1.status, 'on_shelf')
        self.assertEqual(self.i1.dispute_type, 'missing_pieces')
        self.assertEqual(self.i1.dispute_pct_loss, 25)
        self.assertEqual(self.i1.dispute_description, 'Box incomplete')

    def test_processing_patch_item_clear_dispute_on_shelf(self):
        self.i1.status = 'on_shelf'
        self.i1.dispute_type = 'broken'
        self.i1.dispute_pct_loss = 50
        self.i1.dispute_description = 'Cracked'
        self.i1.save(update_fields=['status', 'dispute_type', 'dispute_pct_loss', 'dispute_description'])
        r = self.client.patch(
            f'/api/inventory/items/{self.i1.id}/processing-patch/',
            {'disputed': False},
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.i1.refresh_from_db()
        self.assertEqual(self.i1.status, 'on_shelf')
        self.assertEqual(self.i1.dispute_type, '')
        self.assertIsNone(self.i1.dispute_pct_loss)
        self.assertEqual(self.i1.dispute_description, '')

    def test_processing_row_check_in_creates_temp_batch_and_serializes_detail(self):
        pr = ProcessingRow.objects.get(purchase_order=self.po, manifest_row=self.mr1)
        r = self.client.post(
            f'/api/inventory/orders/{self.po.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 2,
                'condition': 'Used Good',
                'dispatch': 'on_shelf',
                'price': '12.00',
                'retail': '40.00',
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['created_count'], 2)
        self.assertIsNotNone(r.data.get('check_in_batch_id'))
        batch = ProcessingCheckInBatch.objects.get(pk=r.data['check_in_batch_id'])
        self.assertEqual(batch.processing_row_id, pr.id)
        self.assertEqual(batch.quantity, 2)
        self.assertEqual(len(batch.item_ids), 2)
        self.assertEqual(batch.defaults_snapshot['condition'], 'good')

        detail = self.client.get(
            f'/api/inventory/orders/{self.po.id}/processing-row-detail/',
            {'processing_row_id': pr.pk},
        )
        self.assertEqual(detail.status_code, 200, detail.data)
        batches = detail.data['row'].get('checkInBatches') or []
        self.assertEqual(len(batches), 1)
        self.assertEqual(batches[0]['id'], batch.id)
        self.assertEqual(batches[0]['quantity'], 2)
        self.assertEqual(len(batches[0]['items']), 2)

    def test_processing_print_and_check_in_ignores_legacy_sibling_apply_payload(self):
        self.i1.status = 'intake'
        self.i1.condition = 'good'
        self.i1.unit_retail = Decimal('40.00')
        self.i1.save(update_fields=['status', 'condition', 'unit_retail'])
        self.i2.status = 'intake'
        self.i2.condition = 'good'
        self.i2.unit_retail = Decimal('40.00')
        self.i2.save(update_fields=['status', 'condition', 'unit_retail'])

        r = self.client.post(
            f'/api/inventory/items/{self.i1.id}/processing-print-and-check-in/',
            {
                'condition': 'Salvage',
                'dispatch': 'salvage',
                'retail': '9.00',
                'applyConditionAll': True,
                'applyRetailAll': True,
            },
            format='json',
        )
        self.assertEqual(r.status_code, 200, r.data)
        self.i1.refresh_from_db()
        self.i2.refresh_from_db()
        self.assertEqual(self.i1.status, 'on_shelf')
        self.assertEqual(self.i1.condition, 'salvage')
        self.assertEqual(self.i1.unit_retail, Decimal('9.00'))
        self.assertEqual(self.i2.status, 'intake')
        self.assertEqual(self.i2.condition, 'good')
        self.assertEqual(self.i2.unit_retail, Decimal('40.00'))
