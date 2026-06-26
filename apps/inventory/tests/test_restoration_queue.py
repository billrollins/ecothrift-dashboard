"""Restoration queue — processing handoff, API, send validation."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from datetime import timedelta
from rest_framework.test import APIClient

from apps.inventory.models import (
    Item,
    ItemCheckIn,
    ManifestRow,
    ProcessingRow,
    Product,
    PurchaseOrder,
    RestorationJob,
    Vendor,
)

FUNCTIONAL_GRADES = {
    'Working': 19.99,
    'Repairable': 12.0,
    'Parts-only': 5.0,
}


class RestorationQueueTestBase(TestCase):
    def setUp(self):
        self.vendor = Vendor.objects.create(name='Target Liquidation', code='TGT')
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(
            email='staff@example.com',
            first_name='Staff',
            last_name='User',
            password='pw',
        )
        self.user.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=self.user)

    def _restoration_order(self, *, order_number='PO-REST'):
        order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number=order_number,
            ordered_date='2026-06-01',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        product = Product.objects.create(title='Xbox Controller', brand='Microsoft')
        mr = ManifestRow.objects.create(
            purchase_order=order,
            row_number=1,
            quantity=10,
            title='Xbox Controller',
            brand='Microsoft',
            unit_retail=Decimal('49.99'),
        )
        pr = ProcessingRow.objects.create(
            purchase_order=order,
            manifest_row=mr,
            row_number=1,
            quantity=10,
            title='Xbox Controller',
            brand='Microsoft',
            unit_retail=Decimal('49.99'),
            shelf_price=Decimal('19.99'),
        )
        return order, pr, product

    def _check_in_restoration(
        self,
        order,
        pr,
        product,
        *,
        quantity=1,
        price='19.99',
        retail='49.99',
        scale='Functional',
        grade_values=None,
    ):
        return self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': quantity,
                'condition': 'good',
                'dispatch': 'restoration',
                'price': price,
                'retail': retail,
                'product_mode': 'existing',
                'product_id': product.id,
                'restoration_scale': scale,
                'restoration_grade_values': grade_values or FUNCTIONAL_GRADES,
            },
            format='json',
        )

    def _restoration_unit_job_ids(self, order, pr, product, count, **kwargs):
        job_ids = []
        for _ in range(count):
            resp = self._check_in_restoration(order, pr, product, quantity=1, **kwargs)
            self.assertEqual(resp.status_code, 200, resp.data)
            job_ids.append(
                RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id']).pk
            )
        return job_ids

    def _combine_restoration_jobs(self, job_ids, *, replace_values=False):
        resp = self.client.post(
            '/api/inventory/restoration-jobs/combine/',
            {'job_ids': job_ids, 'replace_values': replace_values},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        return RestorationJob.objects.get(pk=resp.data['id'])

    def _legacy_multitem_restoration_job(self, order, pr, product, quantity):
        """Build a multi-item stack directly for split/combine tests."""
        from apps.inventory.models import ItemCheckIn
        from apps.inventory.processing_ops import _sync_item_check_in_quantity
        from apps.inventory.services.restoration import merge_restoration_into_defaults_snapshot

        defaults = merge_restoration_into_defaults_snapshot(
            {
                'condition': 'good',
                'dispatch': 'restoration',
                'location': 'restoration',
                'price': '19.99',
                'retail': '49.99',
            },
            'Functional',
            FUNCTIONAL_GRADES,
        )
        check_in = ItemCheckIn.objects.create(
            purchase_order=order,
            processing_row=pr,
            manifest_row=pr.manifest_row,
            product=product,
            origin=ItemCheckIn.ORIGIN_PROCESSING,
            quantity=0,
            defaults_snapshot=defaults,
            created_by=self.user,
        )
        for _ in range(quantity):
            Item.objects.create(
                sku=Item.generate_sku(),
                product=product,
                purchase_order=order,
                manifest_row=pr.manifest_row,
                check_in=check_in,
                price=Decimal('19.99'),
                retail=Decimal('49.99'),
                cost=Decimal('5.00'),
                source='purchased',
                status='on_shelf',
                condition='good',
                location='restoration',
            )
        _sync_item_check_in_quantity(check_in)
        return RestorationJob.objects.create(
            item_check_in=check_in,
            product=product,
            purchase_order=order,
            quantity=quantity,
            stage=RestorationJob.STAGE_QUEUED,
            scale='Functional',
            grade_values=FUNCTIONAL_GRADES,
            created_by=self.user,
        )


class ProcessingHandoffTests(RestorationQueueTestBase):
    def test_restoration_check_in_creates_job_and_snapshot(self):
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.assertEqual(resp.status_code, 200, resp.data)

        check_in = ItemCheckIn.objects.get(pk=resp.data['item_check_in_id'])
        snap = check_in.defaults_snapshot
        self.assertEqual(snap.get('restoration_scale'), 'Functional')
        self.assertEqual(snap.get('restoration_grade_values'), FUNCTIONAL_GRADES)

        job = RestorationJob.objects.get(item_check_in=check_in)
        self.assertEqual(job.stage, RestorationJob.STAGE_QUEUED)
        self.assertEqual(job.scale, 'Functional')
        self.assertEqual(job.grade_values, FUNCTIONAL_GRADES)
        self.assertEqual(job.quantity, 1)
        self.assertEqual(
            Item.objects.filter(check_in=check_in, location='restoration').count(),
            1,
        )

    def test_restoration_check_in_rejects_multi_quantity(self):
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product, quantity=2)
        self.assertEqual(resp.status_code, 400)
        self.assertIn('one item at a time', resp.data['detail'].lower())
        self.assertFalse(RestorationJob.objects.exists())

    def test_restoration_check_in_rejects_incomplete_grades(self):
        order, pr, product = self._restoration_order()
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'restoration',
                'price': '19.99',
                'product_mode': 'existing',
                'product_id': product.id,
                'restoration_scale': 'Functional',
                'restoration_grade_values': {'Working': 19.99},
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(RestorationJob.objects.exists())

    def test_dispatch_change_away_from_restoration_deletes_queued_job(self):
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product, quantity=1)
        batch_id = resp.data['item_check_in_id']
        self.assertEqual(RestorationJob.objects.filter(item_check_in_id=batch_id).count(), 1)

        update = self.client.post(
            f'/api/inventory/orders/{order.id}/item-check-ins/{batch_id}/update/',
            {'dispatch': 'on_shelf'},
            format='json',
        )
        self.assertEqual(update.status_code, 200, update.data)
        self.assertFalse(RestorationJob.objects.filter(item_check_in_id=batch_id).exists())


class RestorationJobApiTests(RestorationQueueTestBase):
    def test_list_queued_jobs(self):
        order, pr, product = self._restoration_order()
        self._check_in_restoration(order, pr, product)
        resp = self.client.get('/api/inventory/restoration-jobs/?stage=queued')
        self.assertEqual(resp.status_code, 200)
        results = resp.data['results'] if isinstance(resp.data, dict) else resp.data
        self.assertEqual(len(results), 1)
        row = results[0]
        self.assertEqual(row['scale'], 'Functional')
        self.assertFalse(row['needs_setup'])
        self.assertEqual(row['source'], 'Target')

    def test_manual_scan_creates_job(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'restoration',
                'price': '19.99',
                'product_mode': 'existing',
                'product_id': product.id,
                'restoration_scale': 'Functional',
                'restoration_grade_values': FUNCTIONAL_GRADES,
            },
            format='json',
        )
        self.assertEqual(check_in_resp.status_code, 200)
        RestorationJob.objects.all().delete()

        item = Item.objects.filter(check_in_id=check_in_resp.data['item_check_in_id']).first()
        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['stage'], 'queued')
        self.assertEqual(resp.data['sku'], item.sku)
        self.assertEqual(resp.data['queue_add_status'], 'created')

        by_id = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': str(item.id)},
            format='json',
        )
        self.assertEqual(by_id.status_code, 200)
        self.assertEqual(by_id.data['id'], resp.data['id'])
        self.assertEqual(by_id.data['queue_add_status'], 'already_queued')

    def test_manual_scan_after_send_is_idempotent(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        job = RestorationJob.objects.get(item_check_in_id=check_in_resp.data['item_check_in_id'])
        item = Item.objects.filter(check_in_id=check_in_resp.data['item_check_in_id']).first()
        send = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(send.status_code, 200)

        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['id'], job.id)
        self.assertEqual(resp.data['queue_add_status'], 'already_queued')

    def test_manual_scan_on_bench_returns_on_bench(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        job = RestorationJob.objects.get(item_check_in_id=check_in_resp.data['item_check_in_id'])
        item = Item.objects.filter(check_in_id=check_in_resp.data['item_check_in_id']).first()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')

        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['queue_add_status'], 'on_bench')

    def test_manual_scan_strips_trailing_period(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        item = Item.objects.filter(check_in_id=check_in_resp.data['item_check_in_id']).first()
        RestorationJob.objects.all().delete()

        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': f'{item.sku}.'},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data['sku'], item.sku)

    def test_list_backfills_missing_jobs(self):
        order, pr, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, pr, product, quantity=2)
        RestorationJob.objects.all().delete()

        resp = self.client.get('/api/inventory/restoration-jobs/?stage=queued')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['results'][0]['quantity'], 2)

    def test_patch_and_send(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        job = RestorationJob.objects.get(item_check_in_id=check_in_resp.data['item_check_in_id'])

        incomplete = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/',
            {'scale': 'Completeness', 'grade_values': {'Complete': 18.0}},
            format='json',
        )
        self.assertEqual(incomplete.status_code, 200, incomplete.data)
        self.assertTrue(incomplete.data['needs_setup'])

        reject = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(reject.status_code, 400)

        patch = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/',
            {'grade_values': {'Complete': 18.0, 'Incomplete': 9.0}},
            format='json',
        )
        self.assertEqual(patch.status_code, 200, patch.data)
        self.assertFalse(patch.data['needs_setup'])

        sent = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(sent.status_code, 200, sent.data)
        self.assertEqual(sent.data['stage'], 'sent')
        self.assertIsNotNone(sent.data['sent_at'])

        blocked = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/',
            {'grade_values': {'Complete': 20.0, 'Incomplete': 10.0}},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400)

    def test_return_to_processing_with_untouched_reason(self):
        order, pr, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, pr, product, quantity=2)

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/return-to-processing/',
            {
                'disposition_type': 'untouched',
                'reason': 'not_worth_it',
                'notes': 'Preliminary inspection says no TARS needed.',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'returned')
        self.assertEqual(resp.data['return_disposition_type'], 'untouched')
        self.assertEqual(resp.data['return_reason'], 'not_worth_it')
        self.assertIsNotNone(resp.data['returned_at'])

        item_locations = set(
            Item.objects.filter(check_in_id=job.item_check_in_id)
            .values_list('location', flat=True)
        )
        self.assertEqual(item_locations, {'processing'})

        queued = self.client.get('/api/inventory/restoration-jobs/?stage=queued')
        self.assertEqual(queued.status_code, 200)
        self.assertEqual(queued.data['results'], [])

    def test_return_to_processing_with_tars_completed_grade(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        job = RestorationJob.objects.get(item_check_in_id=check_in_resp.data['item_check_in_id'])

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/return-to-processing/',
            {
                'disposition_type': 'tars_completed',
                'scale': 'Functional',
                'grade': 'Working',
                'notes': 'Tested working.',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'returned')
        self.assertEqual(resp.data['return_disposition_type'], 'tars_completed')
        self.assertEqual(resp.data['return_scale'], 'Functional')
        self.assertEqual(resp.data['return_grade'], 'Working')
        self.assertEqual(resp.data['return_notes'], 'Tested working.')

    def test_return_to_processing_from_sent_stage(self):
        order, pr, product = self._restoration_order(order_number='PO-REST-SENT-RETURN')
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        job = RestorationJob.objects.get(item_check_in_id=check_in_resp.data['item_check_in_id'])
        send = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(send.status_code, 200, send.data)

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/return-to-processing/',
            {
                'disposition_type': 'untouched',
                'reason': 'recalled',
                'notes': 'No longer needs TARS.',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'returned')
        self.assertEqual(resp.data['return_disposition_type'], 'untouched')

    def test_return_to_processing_requires_valid_disposition(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        job = RestorationJob.objects.get(item_check_in_id=check_in_resp.data['item_check_in_id'])

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/return-to-processing/',
            {'disposition_type': 'untouched', 'reason': ''},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_manual_scan_adds_intake_item_and_sets_restoration_dispatch(self):
        order, pr, product = self._restoration_order()
        item = Item.objects.create(
            sku='ITM-INTAKE-TEST',
            product=product,
            purchase_order=order,
            manifest_row=pr.manifest_row,
            status='intake',
            location='',
            price=Decimal('9.99'),
        )
        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        item.refresh_from_db()
        self.assertEqual(item.status, 'on_shelf')
        self.assertEqual(item.location, 'restoration')
        self.assertIsNotNone(item.check_in_id)
        self.assertTrue(resp.data['needs_setup'])

    def test_manual_scan_moves_on_shelf_item_to_restoration(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {
                'processing_row_id': pr.id,
                'quantity': 1,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '19.99',
                'product_mode': 'existing',
                'product_id': product.id,
            },
            format='json',
        )
        self.assertEqual(check_in_resp.status_code, 200)
        RestorationJob.objects.all().delete()
        item = Item.objects.filter(check_in_id=check_in_resp.data['item_check_in_id']).first()
        self.assertEqual(item.location, 'on_shelf')

        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        item.refresh_from_db()
        self.assertEqual(item.location, 'restoration')
        self.assertEqual(resp.data['stage'], 'queued')

    def test_manual_scan_rejects_item_without_purchase_order(self):
        product = Product.objects.create(title='Orphan', brand='X')
        item = Item.objects.create(
            sku='ITM-ORPHAN',
            product=product,
            status='intake',
            location='',
            price=Decimal('5.00'),
        )
        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(resp.status_code, 404)
        self.assertIn('no purchase order', resp.data['detail'].lower())

    def test_list_includes_items_and_quantity(self):
        order, pr, product = self._restoration_order()
        check_in_resp = self._check_in_restoration(order, pr, product, quantity=1)
        resp = self.client.get('/api/inventory/restoration-jobs/?stage=queued')
        self.assertEqual(resp.status_code, 200)
        row = resp.data['results'][0]
        self.assertEqual(row['quantity'], 1)
        self.assertEqual(len(row['items']), 1)
        self.assertTrue(all('sku' in item for item in row['items']))

    def test_split_into_multiple_stacks(self):
        order, pr, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, pr, product, quantity=10)
        items = list(Item.objects.filter(check_in_id=job.item_check_in_id).order_by('id'))
        group_a = [items[i].pk for i in range(4)]
        group_b = [items[i].pk for i in range(4, 7)]

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/split/',
            {'groups': [{'item_ids': group_a}, {'item_ids': group_b}]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['source_job']['quantity'], 3)
        self.assertEqual(len(resp.data['created_jobs']), 2)
        self.assertEqual(resp.data['created_jobs'][0]['quantity'], 4)
        self.assertEqual(resp.data['created_jobs'][1]['quantity'], 3)
        self.assertEqual(resp.data['created_jobs'][0]['scale'], 'Functional')
        self.assertEqual(resp.data['created_jobs'][0]['grade_values'], FUNCTIONAL_GRADES)

        queued = self.client.get('/api/inventory/restoration-jobs/?stage=queued')
        self.assertEqual(queued.status_code, 200)
        self.assertEqual(len(queued.data['results']), 3)
        quantities = sorted(row['quantity'] for row in queued.data['results'])
        self.assertEqual(quantities, [3, 3, 4])

    def test_split_into_individuals(self):
        order, pr, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, pr, product, quantity=3)
        items = list(Item.objects.filter(check_in_id=job.item_check_in_id).order_by('id'))

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/split/',
            {'groups': [{'item_ids': [it.pk]} for it in items]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data['source_job'])
        self.assertEqual(len(resp.data['created_jobs']), 3)
        self.assertTrue(all(row['quantity'] == 1 for row in resp.data['created_jobs']))

    def test_partial_return_keeps_remaining_job_queued(self):
        order, pr, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, pr, product, quantity=5)
        items = list(Item.objects.filter(check_in_id=job.item_check_in_id).order_by('id'))
        to_return = [items[0].pk, items[1].pk, items[2].pk]

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/return-to-processing/',
            {
                'disposition_type': 'untouched',
                'reason': 'recalled',
                'notes': 'Three units not worth TARS.',
                'item_ids': to_return,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'queued')
        self.assertEqual(resp.data['quantity'], 2)

        returned_locations = set(
            Item.objects.filter(pk__in=to_return).values_list('location', flat=True)
        )
        self.assertEqual(returned_locations, {'processing'})

        remaining_locations = set(
            Item.objects.filter(check_in_id=job.item_check_in_id).values_list('location', flat=True)
        )
        self.assertEqual(remaining_locations, {'restoration'})

        queued = self.client.get('/api/inventory/restoration-jobs/?stage=queued')
        self.assertEqual(len(queued.data['results']), 1)
        self.assertEqual(queued.data['results'][0]['quantity'], 2)

    def test_combine_stacks_uses_first_stack_with_complete_merge_data(self):
        order, pr, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, pr, product, quantity=4)
        items = list(Item.objects.filter(check_in_id=job.item_check_in_id).order_by('id'))

        split = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/split/',
            {'groups': [{'item_ids': [items[0].pk, items[1].pk]}]},
            format='json',
        )
        self.assertEqual(split.status_code, 200, split.data)
        source_id = split.data['source_job']['id']
        created_id = split.data['created_jobs'][0]['id']

        clear_source = self.client.patch(
            f'/api/inventory/restoration-jobs/{source_id}/',
            {'scale': '', 'grade_values': {}},
            format='json',
        )
        self.assertEqual(clear_source.status_code, 200, clear_source.data)

        patch = self.client.patch(
            f'/api/inventory/restoration-jobs/{created_id}/',
            {'scale': 'Completeness', 'grade_values': {'Complete': 18.0, 'Incomplete': 9.0}},
            format='json',
        )
        self.assertEqual(patch.status_code, 200, patch.data)

        combined = self.client.post(
            '/api/inventory/restoration-jobs/combine/',
            {'job_ids': [source_id, created_id], 'replace_values': False},
            format='json',
        )
        self.assertEqual(combined.status_code, 200, combined.data)
        self.assertEqual(combined.data['id'], source_id)
        self.assertEqual(combined.data['quantity'], 4)
        self.assertEqual(combined.data['scale'], 'Completeness')
        self.assertEqual(combined.data['grade_values'], {'Complete': 18.0, 'Incomplete': 9.0})
        self.assertEqual(RestorationJob.objects.filter(stage=RestorationJob.STAGE_QUEUED).count(), 1)

    def test_combine_stacks_requires_price_confirmation_when_retail_or_price_differs(self):
        order, pr, product = self._restoration_order()
        first = self._check_in_restoration(order, pr, product, quantity=1, price='19.99', retail='49.99')
        second = self._check_in_restoration(order, pr, product, quantity=1, price='24.99', retail='59.99')
        first_job = RestorationJob.objects.get(item_check_in_id=first.data['item_check_in_id'])
        second_job = RestorationJob.objects.get(item_check_in_id=second.data['item_check_in_id'])

        blocked = self.client.post(
            '/api/inventory/restoration-jobs/combine/',
            {'job_ids': [first_job.id, second_job.id], 'replace_values': False},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertIn('different retail or price', blocked.data['detail'])

        combined = self.client.post(
            '/api/inventory/restoration-jobs/combine/',
            {'job_ids': [first_job.id, second_job.id], 'replace_values': True},
            format='json',
        )
        self.assertEqual(combined.status_code, 200, combined.data)
        self.assertEqual(combined.data['retail'], '49.99')
        self.assertEqual(combined.data['price'], '19.99')

    def test_combine_stacks_rejects_mixed_products(self):
        order, pr, product = self._restoration_order()
        first = self._check_in_restoration(order, pr, product, quantity=1)
        other_product = Product.objects.create(title='PlayStation Controller', brand='Sony')
        second = self._check_in_restoration(order, pr, other_product, quantity=1)
        first_job = RestorationJob.objects.get(item_check_in_id=first.data['item_check_in_id'])
        second_job = RestorationJob.objects.get(item_check_in_id=second.data['item_check_in_id'])

        resp = self.client.post(
            '/api/inventory/restoration-jobs/combine/',
            {'job_ids': [first_job.id, second_job.id], 'replace_values': True},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('same product', resp.data['detail'])

    def test_combine_stacks_rejects_mixed_orders(self):
        order, pr, product = self._restoration_order()
        first = self._check_in_restoration(order, pr, product, quantity=1)
        other_order = PurchaseOrder.objects.create(
            vendor=self.vendor,
            order_number='PO-REST-2',
            ordered_date='2026-06-02',
            purchase_cost=Decimal('100.00'),
            retail_value=Decimal('500.00'),
            status='processing',
        )
        other_mr = ManifestRow.objects.create(
            purchase_order=other_order,
            row_number=1,
            quantity=10,
            title='Xbox Controller',
            brand='Microsoft',
            unit_retail=Decimal('49.99'),
        )
        other_pr = ProcessingRow.objects.create(
            purchase_order=other_order,
            manifest_row=other_mr,
            row_number=1,
            quantity=10,
            title='Xbox Controller',
            brand='Microsoft',
            unit_retail=Decimal('49.99'),
            shelf_price=Decimal('19.99'),
        )
        second = self._check_in_restoration(other_order, other_pr, product, quantity=1)
        self.assertEqual(second.status_code, 200, second.data)
        first_job = RestorationJob.objects.get(item_check_in_id=first.data['item_check_in_id'])
        second_job = RestorationJob.objects.get(item_check_in_id=second.data['item_check_in_id'])

        resp = self.client.post(
            '/api/inventory/restoration-jobs/combine/',
            {'job_ids': [first_job.id, second_job.id], 'replace_values': True},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('same order', resp.data['detail'])


class RestorationGradeScaleTests(RestorationQueueTestBase):
    def test_seeded_scales_are_listed(self):
        resp = self.client.get('/api/inventory/grade-scales/')
        self.assertEqual(resp.status_code, 200, resp.data)
        names = {row['name'] for row in resp.data}
        self.assertIn('Functional', names)
        self.assertIn('Completeness', names)
        self.assertIn('Assembly', names)
        self.assertIn('Condition', names)

    def test_create_custom_scale_and_patch_job(self):
        create = self.client.post(
            '/api/inventory/grade-scales/',
            {'name': 'Custom Test', 'grades': ['A', 'B', 'C']},
            format='json',
        )
        self.assertEqual(create.status_code, 201, create.data)
        self.assertEqual(create.data['name'], 'Custom Test')
        self.assertEqual(create.data['grades'], ['A', 'B', 'C'])

        order, pr, product = self._restoration_order()
        check_in = self._check_in_restoration(
            order,
            pr,
            product,
            scale='Custom Test',
            grade_values={'A': 10.0, 'B': 8.0, 'C': 4.0},
        )
        self.assertEqual(check_in.status_code, 200, check_in.data)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        self.assertEqual(job.scale, 'Custom Test')

    def test_patch_job_rejects_unknown_scale(self):
        order, pr, product = self._restoration_order()
        check_in = self._check_in_restoration(order, pr, product)
        self.assertEqual(check_in.status_code, 200, check_in.data)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])

        resp = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/',
            {'scale': 'Not A Real Scale', 'grade_values': {'Working': 1.0}},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)

    def test_inactive_scale_rejected_for_check_in(self):
        from apps.inventory.models import RestorationGradeScale

        row = RestorationGradeScale.objects.get(name='Functional')
        row.is_active = False
        row.save(update_fields=['is_active'])

        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product, scale='Functional')
        self.assertEqual(resp.status_code, 400)

    def test_suggest_scale_picks_most_common_for_vendor(self):
        order, pr, product = self._restoration_order()
        scale_configs = [
            ('Functional', FUNCTIONAL_GRADES),
            ('Functional', FUNCTIONAL_GRADES),
            ('Completeness', {'Complete': 20.0, 'Incomplete': 8.0}),
        ]
        for scale, grade_values in scale_configs:
            check_in = self._check_in_restoration(
                order,
                pr,
                product,
                quantity=1,
                scale=scale,
                grade_values=grade_values,
            )
            self.assertEqual(check_in.status_code, 200, check_in.data)
            job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
            job.stage = RestorationJob.STAGE_SENT
            job.save(update_fields=['stage'])

        resp = self.client.get(
            '/api/inventory/grade-scales/suggest/',
            {'source': 'Target', 'filter_vendor': 'true'},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['scale'], 'Functional')
        self.assertGreaterEqual(resp.data['count'], 2)


class RestorationWorkSessionTests(RestorationQueueTestBase):
    def test_patch_work_session_on_sent_job(self):
        order, pr, product = self._restoration_order()
        check_in = self._check_in_restoration(order, pr, product)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        send = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(send.status_code, 200, send.data)

        payload = {
            'work_session': {
                'workState': 'bench',
                'selectedGrade': 'Working',
                'actions': [{'id': 'a1', 'type': 'test', 'status': 'planned', 'tests': []}],
                'procurementGroups': [],
                'benchStartedAt': '2026-06-24T12:00:00Z',
            },
        }
        resp = self.client.patch(f'/api/inventory/restoration-jobs/{job.id}/work-session/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['work_session']['selectedGrade'], 'Working')
        self.assertEqual(resp.data['work_session']['workState'], 'bench')


class RestorationBenchWorkflowTests(RestorationQueueTestBase):
    def _sent_job(self, *, order_number=None):
        if order_number is None:
            order_number = f'PO-REST-{PurchaseOrder.objects.count()}'
        order, pr, product = self._restoration_order(order_number=order_number)
        check_in = self._check_in_restoration(order, pr, product)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        send = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(send.status_code, 200, send.data)
        job.refresh_from_db()
        return job

    def test_check_in_starts_timer(self):
        job = self._sent_job()
        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'bench')
        self.assertTrue(resp.data['timer_is_running'])
        self.assertIsNotNone(resp.data['bench_started_at'])

    def test_check_in_can_skip_timer_start(self):
        job = self._sent_job()
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/check-in/',
            {'start_timer': False},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'bench')
        self.assertFalse(resp.data['timer_is_running'])
        self.assertIsNone(resp.data['timer_started_at'])

    def test_check_in_without_timer_does_not_pause_active_timer(self):
        active_job = self._sent_job()
        passive_job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{active_job.id}/check-in/')

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{passive_job.id}/check-in/',
            {'start_timer': False},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        active_job.refresh_from_db()
        passive_job.refresh_from_db()
        self.assertTrue(active_job.timer_is_running)
        self.assertFalse(passive_job.timer_is_running)
        self.assertIsNone(passive_job.timer_started_at)

    def test_check_in_from_queued_with_complete_prices(self):
        job = self._sent_job()
        job.stage = RestorationJob.STAGE_QUEUED
        job.sent_at = None
        job.save(update_fields=['stage', 'sent_at'])

        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'bench')
        self.assertTrue(resp.data['timer_is_running'])

    def test_check_in_rejects_needs_setup(self):
        order, pr, product = self._restoration_order()
        item = Item.objects.create(
            sku='ITM-NO-PRICES',
            product=product,
            purchase_order=order,
            manifest_row=pr.manifest_row,
            status='intake',
            location='',
            price=Decimal('9.99'),
        )
        create = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(create.status_code, 201, create.data)
        job = RestorationJob.objects.get(pk=create.data['id'])
        self.assertTrue(create.data['needs_setup'])

        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('grade', resp.data['detail'].lower())

    def test_timer_pause_and_start_accumulates(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        job.refresh_from_db()
        job.active_seconds = 120
        job.save(update_fields=['active_seconds'])
        pause = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/timer/pause/')
        self.assertEqual(pause.status_code, 200, pause.data)
        self.assertFalse(pause.data['timer_is_running'])
        self.assertIsNotNone(pause.data['timer_started_at'])
        self.assertGreaterEqual(pause.data['elapsed_seconds'], 120)
        start = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/timer/start/')
        self.assertEqual(start.status_code, 200, start.data)
        self.assertTrue(start.data['timer_is_running'])

    def test_timer_adjust_sets_elapsed_and_keeps_running(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timer/adjust/',
            {'active_seconds': 3723},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data['timer_is_running'])
        self.assertGreaterEqual(resp.data['elapsed_seconds'], 3723)
        job.refresh_from_db()
        self.assertEqual(job.active_seconds, 3723)
        self.assertIsNotNone(job.timer_started_at)

    def test_hold_moves_to_pending(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/hold/',
            {'reason': 'parts_needed', 'notes': 'Need thumbstick', 'storage_location': 'R3-B'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'pending')
        self.assertEqual(resp.data['pending_reason'], 'parts_needed')
        self.assertFalse(resp.data['timer_is_running'])

    def test_move_back_to_queue(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/move-back-to-queue/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'sent')

    def test_done_stores_disposition(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'notes': 'Ready for floor',
                'spent_hours': '1.25',
                'spent_parts_cost': '6.50',
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'done')
        self.assertEqual(resp.data['bench_disposition'], 'processing')
        self.assertEqual(resp.data['final_grade'], 'Working')
        self.assertEqual(resp.data['spent_hours'], '1.25')

    def test_parts_request_upsert_and_order(self):
        from apps.inventory.models import RestorationPartsRequest

        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        work_session = {
            'workState': 'bench',
            'selectedGrade': 'Working',
            'actions': [{
                'id': 'a1',
                'type': 'repair',
                'status': 'planned',
                'linkedGrade': 'Working',
                'options': [{
                    'id': 'o1',
                    'name': 'Option A',
                    'selected': True,
                    'parts': [{
                        'id': 'p1',
                        'partNumber': 'TH-01',
                        'description': 'Thumbstick',
                        'url': 'https://example.com/p1',
                        'qty': 1,
                        'unitPriceEstimate': 6,
                        'unitPriceActual': 0,
                        'status': 'planned',
                        'procurementGroupId': 'g1',
                    }],
                }],
            }],
            'procurementGroups': [{
                'id': 'g1',
                'supplierName': 'Amazon',
                'partIds': ['p1'],
                'shipping': 5,
                'tax': 1,
                'fees': 0,
            }],
        }
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {'work_session': work_session},
            format='json',
        )
        upsert = self.client.post(
            f'/api/inventory/restoration-parts-requests/upsert-from-job/{job.id}/?submit=true',
            {'eval_snapshot': {'directions': [{'grade': 'Working', 'processorValue': 19.99}]}},
            format='json',
        )
        self.assertEqual(upsert.status_code, 200, upsert.data)
        req = RestorationPartsRequest.objects.get(pk=upsert.data['id'])
        self.assertEqual(req.status, 'submitted')
        site = req.sites.first()
        self.assertEqual(site.supplier_name, 'Amazon')
        order = self.client.post(
            f'/api/inventory/restoration-parts-requests/{req.id}/record-order/',
            {
                'site_id': site.id,
                'po_number': 'PO-9001',
                'supplier_name': 'Amazon',
                'subtotal': '6.00',
                'shipping': '5.00',
                'tax': '1.00',
                'fees': '0.00',
                'ship_to_address': '123 Shop St',
            },
            format='json',
        )
        self.assertEqual(order.status_code, 200, order.data)
        self.assertEqual(order.data['po_number'], 'PO-9001')

    def test_starting_second_timer_pauses_first(self):
        job_a = self._sent_job()
        job_b = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job_a.id}/check-in/')
        self.client.post(f'/api/inventory/restoration-jobs/{job_b.id}/check-in/')
        job_a.refresh_from_db()
        job_b.refresh_from_db()
        self.assertFalse(job_a.timer_is_running)
        self.assertTrue(job_b.timer_is_running)
        self.assertEqual(job_b.timer_started_by_id, self.user.pk)

    def test_hr_start_break_pauses_restoration_timer(self):
        from apps.hr.models import TimeEntry

        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        entry = TimeEntry.objects.create(
            employee=self.user,
            clock_in=parse_datetime('2026-06-24T08:00:00Z'),
        )
        resp = self.client.post(f'/api/hr/time-entries/{entry.id}/start_break/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn('restoration_timer_paused_job_id', resp.data)
        job.refresh_from_db()
        self.assertFalse(job.timer_is_running)

    def test_hr_clock_out_pauses_restoration_timer(self):
        from apps.hr.models import TimeEntry

        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        entry = TimeEntry.objects.create(
            employee=self.user,
            clock_in=timezone.now() - timedelta(minutes=30),
        )
        resp = self.client.post(f'/api/hr/time-entries/{entry.id}/clock_out/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn('restoration_timer_paused_job_id', resp.data)
        job.refresh_from_db()
        self.assertFalse(job.timer_is_running)

