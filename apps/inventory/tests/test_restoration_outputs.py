"""Finish outputs, reject, and minted salvage SKUs."""

from decimal import Decimal

from apps.inventory.models import Item, Product, RestorationJob, RestorationOutput
from apps.inventory.tests.test_restoration_queue import RestorationQueueTestBase


class RestorationRejectAndOutputsTests(RestorationQueueTestBase):
    def _bench_job(self, *, order_number='PO-OUT'):
        order, row, product = self._restoration_order(order_number=order_number)
        check_in = self._check_in_restoration(order, row, product)
        self.assertEqual(check_in.status_code, 200, check_in.data)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        sent = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.assertEqual(sent.status_code, 200, sent.data)
        parked = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        self.assertEqual(parked.status_code, 200, parked.data)
        job.refresh_from_db()
        return job, product

    def test_reject_sends_to_processing_as_untouched(self):
        job, _product = self._bench_job()
        rejected = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/reject/',
            {'reason': 'Wrong item on the tag'},
            format='json',
        )
        self.assertEqual(rejected.status_code, 200, rejected.data)
        self.assertEqual(rejected.data['stage'], 'done')
        self.assertEqual(rejected.data['bench_disposition'], 'processing')
        self.assertEqual(rejected.data['return_disposition_type'], 'untouched')
        self.assertEqual(rejected.data['return_reason'], 'rejected')
        self.assertEqual(rejected.data['from_family'], 'untouched')
        self.assertIn('Wrong item on the tag', rejected.data['disposition_notes'])

    def test_reject_requires_a_reason(self):
        job, _product = self._bench_job(order_number='PO-OUT-NO-REASON')
        rejected = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/reject/',
            {'reason': '   '},
            format='json',
        )
        self.assertEqual(rejected.status_code, 400, rejected.data)

    def test_finish_writes_main_and_part_outputs(self):
        job, _product = self._bench_job(order_number='PO-OUT-FINISH')
        done = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'starting_grade': 'Parts-only',
                'notes': 'Ready for the floor',
                'outputs': [
                    {'seq': 0, 'label': 'Whole item', 'notes': 'Keep the dryer body'},
                    {'seq': 1, 'label': 'Motor', 'notes': 'Salvaged, untested'},
                ],
            },
            format='json',
        )
        self.assertEqual(done.status_code, 200, done.data)
        rows = list(RestorationOutput.objects.filter(job=job).order_by('seq'))
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].seq, 0)
        self.assertEqual(rows[0].label, 'Whole item')
        self.assertEqual(rows[0].item_id, job.item_check_in.items.order_by('id').first().id)
        self.assertEqual(rows[1].seq, 1)
        self.assertEqual(rows[1].label, 'Motor')
        self.assertIsNone(rows[1].item_id)
        self.assertEqual(len(done.data['outputs']), 2)

    def test_minted_part_inherits_lineage_and_reduces_parent_retail(self):
        job, product = self._bench_job(order_number='PO-OUT-MINT')
        parent = job.item_check_in.items.order_by('id').first()
        parent.retail = Decimal('40.00')
        parent.save(update_fields=['retail'])
        done = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'starting_grade': 'Parts-only',
                'outputs': [
                    {'seq': 0, 'label': 'Whole item'},
                    {'seq': 1, 'label': 'Motor'},
                ],
            },
            format='json',
        )
        self.assertEqual(done.status_code, 200, done.data)
        part_line = RestorationOutput.objects.get(job=job, seq=1)
        motor = Product.objects.create(title='Electric motor', brand='Generic')
        minted = self.client.post(
            f'/api/inventory/restoration-outputs/{part_line.id}/create-item/',
            {
                'product_id': motor.id,
                'retail': '10.00',
                'price': '8.00',
                'parent_retail': '30.00',
            },
            format='json',
        )
        self.assertEqual(minted.status_code, 200, minted.data)
        parent.refresh_from_db()
        child = Item.objects.get(pk=minted.data['item_id'])
        self.assertEqual(parent.retail, Decimal('30.00'))
        self.assertEqual(child.retail, Decimal('10.00'))
        self.assertEqual(child.parent_item_id, parent.id)
        self.assertEqual(child.purchase_order_id, parent.purchase_order_id)
        self.assertEqual(child.manifest_row_id, parent.manifest_row_id)
        self.assertEqual(child.check_in_id, parent.check_in_id)
        self.assertEqual(child.product_id, motor.id)
        self.assertNotEqual(child.sku, parent.sku)
        self.assertTrue(child.sku.startswith('ITM'))
        self.assertIsNotNone(child.cost)

    def test_mint_refuses_to_keep_parent_retail(self):
        job, product = self._bench_job(order_number='PO-OUT-KEEP')
        parent = job.item_check_in.items.order_by('id').first()
        parent.retail = Decimal('40.00')
        parent.save(update_fields=['retail'])
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'starting_grade': 'Parts-only',
                'outputs': [
                    {'seq': 0, 'label': 'Whole item'},
                    {'seq': 1, 'label': 'Motor'},
                ],
            },
            format='json',
        )
        part_line = RestorationOutput.objects.get(job=job, seq=1)
        refused = self.client.post(
            f'/api/inventory/restoration-outputs/{part_line.id}/create-item/',
            {
                'product_id': product.id,
                'retail': '10.00',
                'price': '8.00',
                'parent_retail': '40.00',
            },
            format='json',
        )
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn('Reduce the main item retail', refused.data['detail'])

    def test_mint_applies_check_in_fields(self):
        job, _product = self._bench_job(order_number='PO-OUT-FIELDS')
        parent = job.item_check_in.items.order_by('id').first()
        parent.retail = Decimal('40.00')
        parent.save(update_fields=['retail'])
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'starting_grade': 'Parts-only',
                'outputs': [
                    {'seq': 0, 'label': 'Whole item'},
                    {'seq': 1, 'label': 'Motor'},
                ],
            },
            format='json',
        )
        part_line = RestorationOutput.objects.get(job=job, seq=1)
        motor = Product.objects.create(title='Electric motor fields', brand='Generic')
        minted = self.client.post(
            f'/api/inventory/restoration-outputs/{part_line.id}/create-item/',
            {
                'product_id': motor.id,
                'retail': '10.00',
                'price': '8.00',
                'parent_retail': '30.00',
                'condition': 'fair',
                'dispatch': 'on_shelf',
                'notes': 'Untested motor',
                'specifications': {'volts': '120'},
            },
            format='json',
        )
        self.assertEqual(minted.status_code, 200, minted.data)
        child = Item.objects.get(pk=minted.data['item_id'])
        self.assertEqual(child.condition, 'fair')
        self.assertEqual(child.location, 'on_shelf')
        self.assertEqual(child.notes, 'Untested motor')
        self.assertEqual(child.specifications, {'volts': '120'})

    def test_mint_creates_a_new_product_when_asked(self):
        job, _product = self._bench_job(order_number='PO-OUT-NEW-PRODUCT')
        parent = job.item_check_in.items.order_by('id').first()
        parent.retail = Decimal('40.00')
        parent.save(update_fields=['retail'])
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'starting_grade': 'Parts-only',
                'outputs': [
                    {'seq': 0, 'label': 'Whole item'},
                    {'seq': 1, 'label': 'Motor'},
                ],
            },
            format='json',
        )
        part_line = RestorationOutput.objects.get(job=job, seq=1)
        minted = self.client.post(
            f'/api/inventory/restoration-outputs/{part_line.id}/create-item/',
            {
                'product_mode': 'new',
                'title': 'Salvaged motor',
                'brand': 'Generic',
                'category': 'Motors',
                'retail': '10.00',
                'price': '8.00',
                'parent_retail': '30.00',
            },
            format='json',
        )
        self.assertEqual(minted.status_code, 200, minted.data)
        child = Item.objects.get(pk=minted.data['item_id'])
        self.assertEqual(child.product.title, 'Salvaged motor')
        self.assertEqual(child.product.brand, 'Generic')

    def test_mint_new_product_requires_a_title(self):
        job, _product = self._bench_job(order_number='PO-OUT-NEW-TITLE')
        parent = job.item_check_in.items.order_by('id').first()
        parent.retail = Decimal('40.00')
        parent.save(update_fields=['retail'])
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'starting_grade': 'Parts-only',
                'outputs': [
                    {'seq': 0, 'label': 'Whole item'},
                    {'seq': 1, 'label': 'Motor'},
                ],
            },
            format='json',
        )
        part_line = RestorationOutput.objects.get(job=job, seq=1)
        minted = self.client.post(
            f'/api/inventory/restoration-outputs/{part_line.id}/create-item/',
            {
                'product_mode': 'new',
                'title': '   ',
                'retail': '10.00',
                'price': '8.00',
                'parent_retail': '30.00',
            },
            format='json',
        )
        self.assertEqual(minted.status_code, 400, minted.data)
        self.assertIn('title', minted.data)

    def _finish_with_part(self, job):
        return self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {
                'destination': 'processing',
                'final_grade': 'Working',
                'starting_grade': 'Parts-only',
                'outputs': [
                    {'seq': 0, 'label': 'Whole item'},
                    {'seq': 1, 'label': 'Hex nut'},
                ],
            },
            format='json',
        )

    def test_mint_salvage_skips_catalog_and_leaves_parent_retail(self):
        job, _product = self._bench_job(order_number='PO-OUT-SALVAGE-NONE')
        parent = job.item_check_in.items.order_by('id').first()
        parent.retail = Decimal('40.00')
        parent.save(update_fields=['retail'])
        self.assertEqual(self._finish_with_part(job).status_code, 200)
        part_line = RestorationOutput.objects.get(job=job, seq=1)
        minted = self.client.post(
            f'/api/inventory/restoration-outputs/{part_line.id}/create-item/',
            {
                'product_mode': 'none',
                'dispatch': 'salvage',
                'condition': 'salvage',
                'notes': 'One hex nut',
            },
            format='json',
        )
        self.assertEqual(minted.status_code, 200, minted.data)
        parent.refresh_from_db()
        child = Item.objects.get(pk=minted.data['item_id'])
        self.assertEqual(parent.retail, Decimal('40.00'))
        self.assertEqual(child.retail, Decimal('0.00'))
        self.assertEqual(child.price, Decimal('0.00'))
        self.assertEqual(child.location, 'salvage')
        self.assertEqual(child.product.product_number, 'PRD-SALVAGE')
        self.assertEqual(child.product.title, 'Salvage')
        self.assertEqual(child.notes, 'One hex nut')

    def test_mint_none_requires_salvage(self):
        job, _product = self._bench_job(order_number='PO-OUT-SALVAGE-SHELF')
        parent = job.item_check_in.items.order_by('id').first()
        parent.retail = Decimal('40.00')
        parent.save(update_fields=['retail'])
        self.assertEqual(self._finish_with_part(job).status_code, 200)
        part_line = RestorationOutput.objects.get(job=job, seq=1)
        refused = self.client.post(
            f'/api/inventory/restoration-outputs/{part_line.id}/create-item/',
            {
                'product_mode': 'none',
                'dispatch': 'on_shelf',
            },
            format='json',
        )
        self.assertEqual(refused.status_code, 400, refused.data)
        self.assertIn('product_mode', refused.data)
