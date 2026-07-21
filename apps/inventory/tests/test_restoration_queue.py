"""Restoration queue — processing handoff, API, send validation."""

from copy import deepcopy
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
    RestorationGradeScale,
    RestorationJob,
    RestorationTimelineEvent,
    Vendor,
)
from apps.inventory.services.restoration import (
    TARS_GRADE_SCALES,
    restoration_job_needs_setup,
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

    def test_restoration_check_in_allows_incomplete_grades_with_needs_setup(self):
        """Incomplete grade values are allowed at Processing check-in; TO setup later."""
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
        self.assertEqual(resp.status_code, 200, resp.data)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.assertTrue(restoration_job_needs_setup(job))
        self.assertEqual(job.scale, 'Functional')

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
        self.assertEqual(resp.status_code, 400)
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
        returned_job = RestorationJob.objects.get(
            stage=RestorationJob.STAGE_RETURNED,
            quantity=3,
        )
        return_event = RestorationTimelineEvent.objects.get(
            job=returned_job,
            event_type='return.to_processing',
        )
        self.assertTrue(return_event.payload['partial'])
        self.assertEqual(set(return_event.payload['item_ids']), set(to_return))

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
    def setUp(self):
        super().setUp()
        # Deterministic seed — migration 0070 may be absent under --keepdb.
        for sort_order, (name, grades) in enumerate(TARS_GRADE_SCALES.items(), start=1):
            RestorationGradeScale.objects.get_or_create(
                name=name,
                defaults={
                    'grades': list(grades),
                    'sort_order': sort_order * 10,
                    'is_active': True,
                },
            )

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

    def test_inactive_custom_scale_rejected_for_check_in(self):
        from apps.inventory.models import RestorationGradeScale

        # Seed scales are always valid; only deactivated *custom* scales are rejected.
        create = self.client.post(
            '/api/inventory/grade-scales/',
            {'name': 'Custom Inactive', 'grades': ['A', 'B']},
            format='json',
        )
        self.assertEqual(create.status_code, 201, create.data)
        row = RestorationGradeScale.objects.get(name='Custom Inactive')
        row.is_active = False
        row.save(update_fields=['is_active'])

        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(
            order,
            pr,
            product,
            scale='Custom Inactive',
            grade_values={'A': 5.0, 'B': 3.0},
        )
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
        self.assertFalse(resp.data['bench_ownership_ambiguous'])

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

    def test_legacy_unowned_bench_job_is_explicitly_flagged(self):
        job = self._sent_job()
        job.stage = RestorationJob.STAGE_BENCH
        job.bench_owner = None
        job.timer_started_by = self.user
        job.save(update_fields=['stage', 'bench_owner', 'timer_started_by'])

        response = self.client.get(f'/api/inventory/restoration-jobs/{job.id}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['bench_ownership_ambiguous'])

    def test_check_in_second_item_is_blocked_even_without_timer(self):
        active_job = self._sent_job()
        passive_job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{active_job.id}/check-in/')

        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{passive_job.id}/check-in/',
            {'start_timer': False},
            format='json',
        )
        self.assertEqual(resp.status_code, 409, resp.data)
        self.assertEqual(resp.data['active_job_id'], active_job.id)
        active_job.refresh_from_db()
        passive_job.refresh_from_db()
        self.assertTrue(active_job.timer_is_running)
        self.assertEqual(active_job.bench_owner_id, self.user.pk)
        self.assertEqual(passive_job.stage, RestorationJob.STAGE_SENT)
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

    def test_check_in_allows_needs_setup_but_done_blocks(self):
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
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'bench')
        self.assertTrue(resp.data['needs_setup'])

        done = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'notes': 'should fail',
            },
            format='json',
        )
        self.assertEqual(done.status_code, 400, done.data)
        self.assertIn('grade', done.data['detail'].lower())

    def test_request_valuation_and_fulfill(self):
        order, pr, product = self._restoration_order()
        item = Item.objects.create(
            sku='ITM-VAL-REQ',
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
        job_id = create.data['id']
        self.client.post(f'/api/inventory/restoration-jobs/{job_id}/check-in/')

        req = self.client.post(
            f'/api/inventory/restoration-jobs/{job_id}/request-valuation/',
            {'grades': ['Working'], 'notes': 'Need Working $'},
            format='json',
        )
        self.assertEqual(req.status_code, 200, req.data)
        self.assertTrue(req.data['valuation_pending'])
        self.assertEqual(req.data['valuation_requested_grades'], ['Working'])
        valuation_request = RestorationTimelineEvent.objects.get(
            job_id=job_id,
            event_type='valuation.requested',
        )
        self.assertEqual(valuation_request.actor, self.user)

        pending = self.client.get('/api/inventory/restoration-jobs/?valuation_pending=1')
        self.assertEqual(pending.status_code, 200)
        results = pending.data['results'] if isinstance(pending.data, dict) else pending.data
        self.assertTrue(any(row['id'] == job_id for row in results))

        # Incomplete still pending
        patch = self.client.patch(
            f'/api/inventory/restoration-jobs/{job_id}/',
            {
                'scale': 'Functional',
                'grade_values': {'Working': 40, 'Repairable': 0, 'Parts-only': 5},
            },
            format='json',
        )
        self.assertEqual(patch.status_code, 200, patch.data)
        self.assertTrue(patch.data['needs_setup'])
        self.assertTrue(patch.data['valuation_pending'])

        fulfill = self.client.patch(
            f'/api/inventory/restoration-jobs/{job_id}/',
            {
                'scale': 'Functional',
                'grade_values': {'Working': 40, 'Repairable': 20, 'Parts-only': 5},
            },
            format='json',
        )
        self.assertEqual(fulfill.status_code, 200, fulfill.data)
        self.assertFalse(fulfill.data['needs_setup'])
        self.assertFalse(fulfill.data['valuation_pending'])
        self.assertIsNotNone(fulfill.data['valuation_fulfilled_at'])
        fulfilled_event = RestorationTimelineEvent.objects.get(
            job_id=job_id,
            event_type='valuation.fulfilled',
        )
        latest_values_event = RestorationTimelineEvent.objects.filter(
            job_id=job_id,
            event_type='valuation.values_changed',
        ).latest('id')
        self.assertEqual(fulfilled_event.actor, self.user)
        self.assertEqual(fulfilled_event.correlation_id, latest_values_event.correlation_id)

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

    def test_meaningful_action_autostarts_timer_and_sets_idle_baseline(self):
        from apps.hr.models import TimeEntry

        job = self._sent_job()
        TimeEntry.objects.create(
            employee=self.user,
            clock_in=timezone.now() - timedelta(minutes=5),
        )
        checked_in = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/check-in/',
            {'start_timer': False},
            format='json',
        )
        self.assertEqual(checked_in.status_code, 200, checked_in.data)
        self.assertFalse(checked_in.data['timer_is_running'])

        response = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timer/meaningful-action/',
            {'label': 'Recorded current grade'},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data['timer_is_running'])
        self.assertEqual(response.data['last_meaningful_action_label'], 'Recorded current grade')
        self.assertIsNotNone(response.data['last_meaningful_action_at'])
        self.assertGreaterEqual(response.data['last_meaningful_active_seconds'], 0)

    def test_timeline_create_revise_and_void_preserves_history(self):
        from apps.hr.models import TimeEntry

        job = self._sent_job()
        TimeEntry.objects.create(
            employee=self.user,
            clock_in=timezone.now() - timedelta(minutes=5),
        )
        checked_in = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/check-in/',
            {'start_timer': False},
            format='json',
        )
        self.assertEqual(checked_in.status_code, 200, checked_in.data)

        created = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/',
            {
                'event_type': 'work.performed',
                'entity_id': 'work-1',
                'payload': {
                    'category': 'test',
                    'name': 'Power-on test',
                    'notes': 'Powered on',
                    'result': 'Pass',
                },
            },
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        event_id = created.data['id']
        job.refresh_from_db()
        self.assertEqual(job.work_session['benchRows'][0]['name'], 'Power-on test')
        self.assertTrue(job.timer_is_running)

        revised = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/{event_id}/',
            {'payload': {'notes': 'Powered on and held load'}},
            format='json',
        )
        self.assertEqual(revised.status_code, 200, revised.data)
        self.assertEqual(revised.data['supersedes_id'], event_id)
        current_event_id = revised.data['id']
        self.assertEqual(
            RestorationTimelineEvent.objects.get(pk=event_id).status,
            RestorationTimelineEvent.STATUS_REVISED,
        )

        voided = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/{current_event_id}/void/',
            {'reason': 'Entered against the wrong item'},
            format='json',
        )
        self.assertEqual(voided.status_code, 200, voided.data)
        self.assertEqual(voided.data['status'], 'voided')
        job.refresh_from_db()
        self.assertEqual(job.work_session['benchRows'], [])

        timeline = self.client.get(f'/api/inventory/restoration-jobs/{job.id}/timeline/')
        self.assertEqual(timeline.status_code, 200, timeline.data)
        statuses = {row['id']: row['status'] for row in timeline.data}
        self.assertEqual(statuses[event_id], 'revised')
        self.assertEqual(statuses[current_event_id], 'voided')

    def test_test_result_supersedes_added_state_for_same_entity(self):
        job = self._sent_job()
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/check-in/',
            {'start_timer': False},
            format='json',
        )
        added = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/',
            {
                'event_type': 'test.added',
                'entity_id': 'power-on',
                'payload': {
                    'id': 'power-on',
                    'label': 'Power on',
                    'result': 'untested',
                },
            },
            format='json',
        )
        self.assertEqual(added.status_code, 201, added.data)
        result = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/',
            {
                'event_type': 'test.result_set',
                'entity_id': 'power-on',
                'payload': {
                    'id': 'power-on',
                    'label': 'Power on',
                    'result': 'pass',
                },
            },
            format='json',
        )
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data['supersedes_id'], added.data['id'])
        self.assertEqual(
            RestorationTimelineEvent.objects.get(pk=added.data['id']).status,
            RestorationTimelineEvent.STATUS_REVISED,
        )
        self.assertEqual(
            RestorationTimelineEvent.objects.filter(
                job=job,
                entity_id='power-on',
                status=RestorationTimelineEvent.STATUS_ACTIVE,
            ).count(),
            1,
        )

    def test_system_timeline_entries_cannot_be_revised_or_voided(self):
        job = self._sent_job()
        checked_in = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/check-in/',
            {'start_timer': False},
            format='json',
        )
        self.assertEqual(checked_in.status_code, 200, checked_in.data)
        system_event = RestorationTimelineEvent.objects.get(
            job=job,
            event_type='job.checked_in',
        )

        revised = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/{system_event.id}/',
            {'payload': {'notes': 'Changed history'}},
            format='json',
        )
        self.assertEqual(revised.status_code, 400, revised.data)
        voided = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/{system_event.id}/void/',
            {'reason': 'Changed my mind'},
            format='json',
        )
        self.assertEqual(voided.status_code, 400, voided.data)
        system_event.refresh_from_db()
        self.assertEqual(system_event.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_check_in_and_hold_correlate_lifecycle_and_timer_events(self):
        job = self._sent_job()
        checked_in = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(checked_in.status_code, 200, checked_in.data)
        check_in_events = RestorationTimelineEvent.objects.filter(
            job=job,
            event_type__in=['job.checked_in', 'timer.started'],
        )
        self.assertEqual(check_in_events.count(), 2)
        self.assertEqual(check_in_events.values('correlation_id').distinct().count(), 1)

        held = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/hold/',
            {'reason': 'between_steps'},
            format='json',
        )
        self.assertEqual(held.status_code, 200, held.data)
        hold_events = RestorationTimelineEvent.objects.filter(
            job=job,
            event_type__in=['hold.placed', 'timer.paused'],
        )
        self.assertEqual(hold_events.count(), 2)
        self.assertEqual(hold_events.values('correlation_id').distinct().count(), 1)

    def test_standalone_studio_smoke_path_preserves_complete_item_story(self):
        from apps.hr.models import TimeEntry

        job = self._sent_job()
        TimeEntry.objects.create(
            employee=self.user,
            clock_in=timezone.now() - timedelta(minutes=10),
        )
        checked_in = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(checked_in.status_code, 200, checked_in.data)

        assessed_session = {
            'workState': 'bench',
            'selectedGrade': None,
            'parts': [],
            'orders': [],
            'gradePlans': {'Working': {'estimateHours': 0.25, 'orderIds': []}},
            'benchRows': [],
            'decisionWork': {
                'condition': {
                    'currentGrade': 'Working',
                    'condition': 'Clean housing',
                    'completeness': 'complete',
                    'testedStatus': 'tested',
                    'evidence': 'Visual inspection completed.',
                },
                'tests': [{
                    'id': 'power-on',
                    'catalogTestId': 'elec_turns_on',
                    'name': 'Turns on',
                    'prompt': 'Verify power.',
                    'relevant': True,
                    'result': None,
                    'evidence': '',
                }],
                'outcomes': [],
                'selection': {},
            },
        }
        assessed = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {'work_session': assessed_session},
            format='json',
        )
        self.assertEqual(assessed.status_code, 200, assessed.data)

        completed_session = deepcopy(assessed.data['work_session'])
        completed_session['decisionWork']['tests'][0].update({
            'result': 'pass',
            'evidence': 'Powered on and held load.',
        })
        completed_session['decisionWork']['outcomes'] = [{
            'id': 'working-repair',
            'grade': 'Working',
            'saleState': 'tested',
            'action': 'repair',
            'viable': True,
            'nonviableReason': '',
            'estimatedMinutes': 15,
        }]
        completed_session['decisionWork']['selection'] = {
            'outcomeId': 'working-repair',
            'grade': 'Working',
            'saleState': 'tested',
            'action': 'repair',
            'reason': 'Short repair preserves the Working value.',
            'overrideReason': '',
            'selectedAt': timezone.now().isoformat(),
            'selectedById': self.user.pk,
        }
        completed_session['benchRows'] = [{
            'id': 'work-repair',
            'category': 'repair',
            'name': 'Reseated power connector',
            'notes': 'Connector was loose.',
            'result': 'Power remained stable.',
            'durationMinutes': 6,
            'performedAt': timezone.now().isoformat(),
        }]
        worked = self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {'work_session': completed_session},
            format='json',
        )
        self.assertEqual(worked.status_code, 200, worked.data)

        held = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/hold/',
            {'reason': 'between_steps', 'notes': 'Paused for cleanup.'},
            format='json',
        )
        self.assertEqual(held.status_code, 200, held.data)
        resumed = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(resumed.status_code, 200, resumed.data)
        finished = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'notes': 'Ready for Processing.',
            },
            format='json',
        )
        self.assertEqual(finished.status_code, 200, finished.data)
        self.assertEqual(finished.data['stage'], 'done')

        event_types = set(
            RestorationTimelineEvent.objects.filter(job=job).values_list('event_type', flat=True)
        )
        self.assertTrue({
            'job.checked_in',
            'condition.current_grade.set',
            'test.added',
            'test.result_set',
            'plan.estimated',
            'plan.committed',
            'work.performed',
            'hold.placed',
            'hold.resumed',
            'disposition.completed',
        }.issubset(event_types))
        performed = RestorationTimelineEvent.objects.filter(
            job=job,
            event_type='work.performed',
            status=RestorationTimelineEvent.STATUS_ACTIVE,
        ).get()
        self.assertEqual(performed.actor, self.user)
        self.assertEqual(performed.payload['durationMinutes'], 6)

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

    def test_done_returns_item_to_processing_with_grade(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working', 'notes': 'Floor ready'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        job.refresh_from_db()
        check_in = job.item_check_in
        for item in check_in.items.all():
            self.assertEqual(item.location, 'processing')
        snapshot = check_in.defaults_snapshot or {}
        self.assertEqual(snapshot.get('restoration_return_grade'), 'Working')
        self.assertEqual(snapshot.get('restoration_return_scale'), job.scale)
        self.assertEqual(snapshot.get('location'), 'processing')

    def test_done_to_storage_moves_item_to_back_storage(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'storage', 'final_grade': 'Working'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        job.refresh_from_db()
        for item in job.item_check_in.items.all():
            self.assertEqual(item.location, 'back_storage')

    def test_returns_list_and_mark_handled(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working'},
            format='json',
        )
        listing = self.client.get('/api/inventory/restoration-jobs/returns/')
        self.assertEqual(listing.status_code, 200, listing.data)
        ids = [row['id'] for row in listing.data]
        self.assertIn(job.id, ids)
        returned_row = next(row for row in listing.data if row['id'] == job.id)
        self.assertEqual(returned_row['final_grade'], 'Working')

        handled = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/mark-handled/')
        self.assertEqual(handled.status_code, 200, handled.data)
        self.assertIsNotNone(handled.data['processing_handled_at'])

        listing2 = self.client.get('/api/inventory/restoration-jobs/returns/')
        self.assertNotIn(job.id, [row['id'] for row in listing2.data])

    def test_returns_list_includes_untouched_with_desk_summary(self):
        job = self._sent_job()
        returned = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/return-to-processing/',
            {
                'disposition_type': 'untouched',
                'reason': 'not_worth_it',
                'notes': 'Preliminary look — not worth bench time',
            },
            format='json',
        )
        self.assertEqual(returned.status_code, 200, returned.data)

        listing = self.client.get('/api/inventory/restoration-jobs/returns/')
        self.assertEqual(listing.status_code, 200, listing.data)
        row = next(r for r in listing.data if r['id'] == job.id)
        self.assertEqual(row['from_family'], 'untouched')
        self.assertEqual(row['direction'], 'from')
        self.assertEqual(row['unit_kind'], 'whole')
        self.assertEqual(row['work_verbs'], [])

        handled = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/mark-handled/')
        self.assertEqual(handled.status_code, 200, handled.data)
        listing2 = self.client.get('/api/inventory/restoration-jobs/returns/')
        self.assertNotIn(job.id, [row['id'] for row in listing2.data])

    def test_receive_parts_sets_pending_flag(self):
        from apps.inventory.models import RestorationPartsRequest

        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        work_session = {
            'workState': 'bench',
            'selectedGrade': 'Working',
            'parts': [{
                'id': 'p1', 'partNumber': 'TH-01', 'description': 'Thumbstick',
                'url': 'https://example.com/p1', 'qty': 1, 'unitPriceEstimate': 6,
                'unitPriceActual': 0, 'status': 'planned', 'procurementGroupId': 'g1',
            }],
            'orders': [{
                'id': 'g1', 'supplierName': 'Amazon', 'partIds': ['p1'],
                'shipping': 5, 'tax': 1, 'fees': 0,
            }],
            'gradePlans': {'Working': {'estimateHours': 1.5, 'orderIds': ['g1']}},
            'benchRows': [],
        }
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {'work_session': work_session},
            format='json',
        )
        upsert = self.client.post(
            f'/api/inventory/restoration-parts-requests/upsert-from-job/{job.id}/?submit=true',
            {'grade': 'Working', 'eval_snapshot': {'grade': 'Working'}},
            format='json',
        )
        self.assertEqual(upsert.status_code, 200, upsert.data)
        req = RestorationPartsRequest.objects.get(pk=upsert.data['id'])
        site = req.sites.first()
        line = site.lines.first()
        self.client.post(
            f'/api/inventory/restoration-parts-requests/{req.id}/record-order/',
            {
                'site_id': site.id, 'po_number': 'PO-9100', 'supplier_name': 'Amazon',
                'subtotal': '6.00', 'shipping': '5.00', 'tax': '1.00', 'fees': '0.00',
                'lines': [{'id': line.id, 'unit_cost': '6.00'}],
            },
            format='json',
        )
        # Park the job in pending (waiting on parts), then receive.
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/hold/',
            {'reason': 'parts_needed'},
            format='json',
        )
        receive = self.client.post(
            f'/api/inventory/restoration-parts-requests/{req.id}/receive/',
        )
        self.assertEqual(receive.status_code, 200, receive.data)
        job.refresh_from_db()
        self.assertTrue((job.work_session.get('pending') or {}).get('partsReceived'))

    def test_parts_request_upsert_and_order(self):
        from apps.inventory.models import RestorationPartsRequest

        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        work_session = {
            'workState': 'bench',
            'selectedGrade': 'Working',
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
            'orders': [{
                'id': 'g1',
                'supplierName': 'Amazon',
                'partIds': ['p1'],
                'shipping': 5,
                'tax': 1,
                'fees': 0,
            }],
            'gradePlans': {
                'Working': {'estimateHours': 1.5, 'orderIds': ['g1']},
            },
            'benchRows': [],
        }
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {'work_session': work_session},
            format='json',
        )
        upsert = self.client.post(
            f'/api/inventory/restoration-parts-requests/upsert-from-job/{job.id}/?submit=true',
            {
                'grade': 'Working',
                'eval_snapshot': {'grade': 'Working', 'processorValue': 19.99},
            },
            format='json',
        )
        self.assertEqual(upsert.status_code, 200, upsert.data)
        req = RestorationPartsRequest.objects.get(pk=upsert.data['id'])
        self.assertEqual(req.status, 'submitted')
        self.assertEqual(req.selected_grade, 'Working')
        site = req.sites.first()
        self.assertEqual(site.supplier_name, 'Amazon')
        line = site.lines.first()
        self.assertIsNotNone(line)
        order = self.client.post(
            f'/api/inventory/restoration-parts-requests/{req.id}/record-order/',
            {
                'site_id': site.id,
                'po_number': 'PO-9001',
                'supplier_name': 'Amazon',
                'supplier_url': 'https://amazon.com',
                'subtotal': '7.50',
                'shipping': '5.00',
                'tax': '1.00',
                'fees': '0.00',
                'ship_to_address': '123 Shop St',
                'lines': [{'id': line.id, 'unit_cost': '7.50'}],
            },
            format='json',
        )
        self.assertEqual(order.status_code, 200, order.data)
        self.assertEqual(order.data['po_number'], 'PO-9001')
        self.assertEqual(order.data['supplier_url'], 'https://amazon.com')

        order_line = order.data['lines'][0]
        self.assertEqual(order_line['unit_cost'], '7.50')
        line.refresh_from_db()
        self.assertEqual(line.unit_price_actual, Decimal('7.50'))
        self.assertEqual(line.unit_price_estimate, Decimal('6.00'))

        req.refresh_from_db()
        self.assertEqual(req.status, 'ordered')

        receive = self.client.post(
            f'/api/inventory/restoration-parts-requests/{req.id}/receive/',
        )
        self.assertEqual(receive.status_code, 200, receive.data)
        self.assertEqual(receive.data['status'], 'received')

    def test_second_item_can_enter_bench_after_first_is_held(self):
        job_a = self._sent_job()
        job_b = self._sent_job()
        first = self.client.post(f'/api/inventory/restoration-jobs/{job_a.id}/check-in/')
        self.assertEqual(first.status_code, 200, first.data)
        blocked = self.client.post(f'/api/inventory/restoration-jobs/{job_b.id}/check-in/')
        self.assertEqual(blocked.status_code, 409, blocked.data)
        held = self.client.post(
            f'/api/inventory/restoration-jobs/{job_a.id}/hold/',
            {'reason': 'between_steps'},
            format='json',
        )
        self.assertEqual(held.status_code, 200, held.data)
        second = self.client.post(f'/api/inventory/restoration-jobs/{job_b.id}/check-in/')
        self.assertEqual(second.status_code, 200, second.data)
        job_a.refresh_from_db()
        job_b.refresh_from_db()
        self.assertFalse(job_a.timer_is_running)
        self.assertIsNone(job_a.bench_owner_id)
        self.assertTrue(job_b.timer_is_running)
        self.assertEqual(job_b.bench_owner_id, self.user.pk)
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

    def test_scan_of_done_job_requeues_with_lifecycle_cleared(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        done = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'storage',
                'final_grade': 'Working',
                'spent_hours': '1.00',
                'spent_parts_cost': '3.00',
            },
            format='json',
        )
        self.assertEqual(done.status_code, 200, done.data)
        item = Item.objects.filter(check_in_id=job.item_check_in_id).first()

        resp = self.client.post(
            '/api/inventory/restoration-jobs/',
            {'sku': item.sku},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['queue_add_status'], 'requeued')

        job.refresh_from_db()
        self.assertEqual(job.stage, RestorationJob.STAGE_QUEUED)
        self.assertIsNone(job.sent_at)
        self.assertEqual(job.bench_disposition, '')
        self.assertEqual(job.final_grade, '')
        self.assertIsNone(job.dispositioned_at)
        self.assertIsNone(job.dispositioned_by)
        self.assertIsNone(job.spent_hours)
        self.assertIsNone(job.spent_parts_cost)
        self.assertEqual(job.active_seconds, 0)
        self.assertFalse(job.timer_is_running)
        self.assertIsNone(job.timer_started_at)
        self.assertIsNone(job.timer_started_by)
        self.assertIsNone(job.bench_started_at)
        self.assertEqual(job.work_session, {})
        self.assertIsNone(job.processing_handled_at)
        self.assertEqual(job.return_disposition_type, '')
        self.assertEqual(job.return_grade, '')
        self.assertIsNone(job.returned_at)

    def test_mark_handled_rejects_queued_job_and_unmark_handled_works(self):
        # Queued job — mark-handled must 400.
        order, pr, product = self._restoration_order(order_number='PO-REST-HANDLED')
        check_in = self._check_in_restoration(order, pr, product)
        queued_job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        blocked = self.client.post(f'/api/inventory/restoration-jobs/{queued_job.id}/mark-handled/')
        self.assertEqual(blocked.status_code, 400, blocked.data)
        queued_job.refresh_from_db()
        self.assertIsNone(queued_job.processing_handled_at)

        # Done-to-processing job — mark then unmark.
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working'},
            format='json',
        )
        handled = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/mark-handled/')
        self.assertEqual(handled.status_code, 200, handled.data)
        self.assertIsNotNone(handled.data['processing_handled_at'])

        unmarked = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/unmark-handled/')
        self.assertEqual(unmarked.status_code, 200, unmarked.data)
        self.assertIsNone(unmarked.data['processing_handled_at'])

        listing = self.client.get('/api/inventory/restoration-jobs/returns/')
        self.assertIn(job.id, [row['id'] for row in listing.data])

    def test_record_order_requires_site_on_multi_site_request(self):
        from apps.inventory.models import (
            RestorationPartsRequest,
            RestorationPartsRequestLine,
        )

        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        work_session = {
            'workState': 'bench',
            'selectedGrade': 'Working',
            'parts': [
                {
                    'id': 'p1', 'partNumber': 'TH-01', 'description': 'Thumbstick',
                    'url': 'https://example.com/p1', 'qty': 1, 'unitPriceEstimate': 6,
                    'unitPriceActual': 0, 'status': 'planned', 'procurementGroupId': 'g1',
                },
                {
                    'id': 'p2', 'partNumber': 'SH-02', 'description': 'Shell',
                    'url': 'https://example.com/p2', 'qty': 1, 'unitPriceEstimate': 9,
                    'unitPriceActual': 0, 'status': 'planned', 'procurementGroupId': 'g2',
                },
            ],
            'orders': [
                {'id': 'g1', 'supplierName': 'Amazon', 'partIds': ['p1']},
                {'id': 'g2', 'supplierName': 'DigiKey', 'partIds': ['p2']},
            ],
            'gradePlans': {'Working': {'estimateHours': 1.5, 'orderIds': ['g1', 'g2']}},
            'benchRows': [],
        }
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {'work_session': work_session},
            format='json',
        )
        upsert = self.client.post(
            f'/api/inventory/restoration-parts-requests/upsert-from-job/{job.id}/?submit=true',
            {'grade': 'Working'},
            format='json',
        )
        self.assertEqual(upsert.status_code, 200, upsert.data)
        req = RestorationPartsRequest.objects.get(pk=upsert.data['id'])
        self.assertEqual(req.sites.count(), 2)

        amazon_site = req.sites.get(supplier_name='Amazon')
        digikey_site = req.sites.get(supplier_name='DigiKey')
        skipped_line = digikey_site.lines.first()
        skipped_line.status = RestorationPartsRequestLine.STATUS_SKIPPED
        skipped_line.save(update_fields=['status'])

        blocked = self.client.post(
            f'/api/inventory/restoration-parts-requests/{req.id}/record-order/',
            {'po_number': 'PO-9200', 'supplier_name': 'Amazon', 'subtotal': '6.00'},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400, blocked.data)
        self.assertIn('site_id', blocked.data['detail'])

        ok = self.client.post(
            f'/api/inventory/restoration-parts-requests/{req.id}/record-order/',
            {
                'site_id': amazon_site.id, 'po_number': 'PO-9201',
                'supplier_name': 'Amazon', 'subtotal': '6.00',
            },
            format='json',
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        amazon_line = amazon_site.lines.first()
        amazon_line.refresh_from_db()
        skipped_line.refresh_from_db()
        self.assertEqual(amazon_line.status, RestorationPartsRequestLine.STATUS_ORDERED)
        self.assertEqual(skipped_line.status, RestorationPartsRequestLine.STATUS_SKIPPED)

    def test_count_tars_actions_survives_malformed_work_session(self):
        from apps.pos.services.dashboard_metrics import _count_tars_actions

        jobs = [
            RestorationJob(work_session={'actions': ['not-a-dict', 42]}),
            RestorationJob(work_session={'actions': 'not-a-list'}),
            RestorationJob(work_session={'actions': [{'type': 'test', 'tests': 'oops'}]}),
            RestorationJob(work_session={'actions': [{'type': 'assemble', 'steps': ['x', {'status': 'done'}]}]}),
            RestorationJob(work_session=None),
        ]
        self.assertEqual(_count_tars_actions(jobs, 'test'), 1)
        self.assertEqual(_count_tars_actions(jobs, 'assemble'), 1)
        self.assertEqual(_count_tars_actions(jobs, 'repair'), 0)

    def test_done_rejects_final_grade_not_in_scale(self):
        job = self._sent_job()
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Not A Grade'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('grade', resp.data['detail'].lower())
        job.refresh_from_db()
        self.assertEqual(job.stage, RestorationJob.STAGE_BENCH)

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

