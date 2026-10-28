"""Undo check-in (move or delete a whole check-in) and the one-item queue scan (2026-10-28)."""

from django.utils import timezone

from apps.inventory.models import CheckInUndo, Item, ItemCheckIn, ProcessingRow, RestorationJob
from apps.inventory.tests.test_restoration_queue import RestorationQueueTestBase


class CheckInUndoTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        self.order, self.pr, self.product = self._restoration_order()

    def _floor_check_in(self, quantity):
        resp = self.client.post(
            f'/api/inventory/orders/{self.order.id}/processing-row-check-in/',
            {
                'processing_row_id': self.pr.id,
                'quantity': quantity,
                'condition': 'good',
                'dispatch': 'on_shelf',
                'price': '19.99',
                'retail': '49.99',
                'product_mode': 'existing',
                'product_id': self.product.id,
            },
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        return ItemCheckIn.objects.get(pk=resp.data['item_check_in_id'])

    def _undo_url(self, check_in_id):
        return f'/api/inventory/orders/{self.order.id}/item-check-ins/{check_in_id}/undo/'

    def test_queue_scan_takes_only_the_scanned_item(self):
        check_in = self._floor_check_in(3)
        first, *rest = list(check_in.items.order_by('id'))
        resp = self.client.post('/api/inventory/restoration-jobs/', {'sku': first.sku}, format='json')
        self.assertEqual(resp.status_code, 201, resp.data)
        job = RestorationJob.objects.get(pk=resp.data['id'])
        self.assertEqual(job.quantity, 1)
        self.assertNotEqual(job.item_check_in_id, check_in.pk)
        first.refresh_from_db()
        self.assertEqual(first.location, 'restoration')
        self.assertEqual(first.check_in_id, job.item_check_in_id)
        check_in.refresh_from_db()
        self.assertEqual(check_in.quantity, 2)
        self.assertEqual(check_in.defaults_snapshot.get('dispatch'), 'on_shelf')
        for item in rest:
            item.refresh_from_db()
            self.assertEqual(item.location, 'on_shelf')
            self.assertEqual(item.check_in_id, check_in.pk)

    def test_preview_says_what_will_happen(self):
        job = self._legacy_multitem_restoration_job(self.order, self.pr, self.product, 3)
        resp = self.client.get(self._undo_url(job.item_check_in_id))
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['quantity'], 3)
        self.assertEqual(resp.data['where'], {'restoration': 3})
        self.assertEqual(resp.data['restoration_job'], {'id': job.pk, 'stage': 'queued'})
        self.assertEqual(resp.data['blocks'], [])
        self.assertNotIn('restoration', resp.data['destinations'])

    def test_move_out_of_restoration_removes_the_job_and_logs(self):
        job = self._legacy_multitem_restoration_job(self.order, self.pr, self.product, 3)
        check_in_id = job.item_check_in_id
        resp = self.client.post(
            self._undo_url(check_in_id), {'action': 'move', 'dispatch': 'on_shelf'}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(RestorationJob.objects.filter(pk=job.pk).exists())
        self.assertEqual(
            sorted(Item.objects.filter(check_in_id=check_in_id).values_list('location', flat=True)),
            ['on_shelf'] * 3,
        )
        self.assertEqual(ItemCheckIn.objects.get(pk=check_in_id).defaults_snapshot['dispatch'], 'on_shelf')
        log = CheckInUndo.objects.get()
        self.assertEqual(
            (log.action, log.quantity, log.from_dispatch, log.to_dispatch, log.restoration_job_ids, log.created_by),
            ('move', 3, 'restoration', 'on_shelf', [job.pk], self.user),
        )

    def test_delete_removes_items_and_returns_pending(self):
        check_in = self._floor_check_in(4)
        self.pr.refresh_from_db()
        self.assertEqual(self.pr.quantity - self.pr.qty_dispositioned, 6)
        preview = self.client.get(self._undo_url(check_in.pk)).data
        self.assertEqual((preview['pending_now'], preview['pending_after_delete']), (6, 10))
        resp = self.client.post(self._undo_url(check_in.pk), {'action': 'delete'}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertFalse(ItemCheckIn.objects.filter(pk=check_in.pk).exists())
        self.assertFalse(Item.objects.filter(purchase_order=self.order).exists())
        pr = ProcessingRow.objects.get(pk=self.pr.pk)
        self.assertEqual(pr.quantity - pr.qty_dispositioned, 10)
        self.assertEqual(CheckInUndo.objects.get().action, 'delete')

    def test_sold_item_blocks_undo(self):
        check_in = self._floor_check_in(2)
        sold = check_in.items.order_by('id').first()
        Item.objects.filter(pk=sold.pk).update(status='sold', sold_at=timezone.now())
        preview = self.client.get(self._undo_url(check_in.pk)).data
        self.assertEqual(preview['blocks'], [f'1 sold ({sold.sku}).'])
        resp = self.client.post(self._undo_url(check_in.pk), {'action': 'delete'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('sold', resp.data['detail'])
        self.assertEqual(Item.objects.filter(check_in=check_in).count(), 2)
        self.assertFalse(CheckInUndo.objects.exists())

    def test_started_restoration_blocks_undo(self):
        job = self._legacy_multitem_restoration_job(self.order, self.pr, self.product, 2)
        RestorationJob.objects.filter(pk=job.pk).update(stage=RestorationJob.STAGE_BENCH)
        resp = self.client.post(
            self._undo_url(job.item_check_in_id), {'action': 'move', 'dispatch': 'on_shelf'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Restoration has it', resp.data['detail'])
        self.assertTrue(RestorationJob.objects.filter(pk=job.pk).exists())

    def test_move_to_restoration_is_refused(self):
        check_in = self._floor_check_in(1)
        resp = self.client.post(
            self._undo_url(check_in.pk), {'action': 'move', 'dispatch': 'restoration'}, format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(RestorationJob.objects.exists())
