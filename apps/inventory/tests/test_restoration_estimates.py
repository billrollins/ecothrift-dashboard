"""Every Processing path that sends an item to Restoration needs the estimates (owner, 2026-10-26)."""

from decimal import Decimal

from apps.inventory.models import Item, ManifestRow, ProcessingRow, RestorationJob
from apps.inventory.services.restoration_estimate import estimate_line, restoration_estimate
from apps.inventory.tests.test_restoration_queue import (
    FUNCTIONAL_GRADES,
    RESTORATION_ESTIMATE,
    RestorationQueueTestBase,
)


class EstimateRuleTests(RestorationQueueTestBase):
    def test_rule_names_what_is_missing(self):
        with self.assertRaisesMessage(ValueError, 'pick the work it needs'):
            restoration_estimate({'hours': '1', 'value_after': '50'})
        with self.assertRaisesMessage(ValueError, 'hours or the parts cost'):
            restoration_estimate({'work': ['repair'], 'value_after': '50'})
        with self.assertRaisesMessage(ValueError, 'worth after the work'):
            restoration_estimate({'work': ['repair'], 'parts_cost': '8'})
        with self.assertRaisesMessage(ValueError, 'must be a number'):
            restoration_estimate({'work': ['repair'], 'hours': 'lots', 'value_after': '50'})

    def test_parts_cost_alone_is_enough(self):
        estimate = restoration_estimate({'work': ['Test', 'repair'], 'parts_cost': '8', 'value_after': '50'})
        self.assertEqual(estimate['work'], ['test', 'repair'])
        self.assertEqual(estimate_line(estimate), 'Estimate: test, repair · parts $8.00 · worth $50.00 after')


class RowCheckInTests(RestorationQueueTestBase):
    def _post(self, order, pr, product, **extra):
        return self.client.post(
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
                **extra,
            },
            format='json',
        )

    def test_refused_without_estimates_and_nothing_saved(self):
        order, pr, product = self._restoration_order()
        resp = self._post(order, pr, product)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration: pick the work it needs', resp.data['detail'])
        self.assertFalse(Item.objects.filter(purchase_order=order).exists())
        self.assertFalse(RestorationJob.objects.exists())

    def test_estimate_on_check_in_and_queue_note(self):
        order, pr, product = self._restoration_order()
        resp = self._post(order, pr, product, restoration=RESTORATION_ESTIMATE)
        self.assertEqual(resp.status_code, 200, resp.data)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.assertEqual(job.queue_note, 'Estimate: repair · about 1.5 h · worth $60.00 after')
        saved = job.item_check_in.defaults_snapshot['restoration_estimate']
        self.assertEqual(saved['value_after'], '60.00')
        self.assertEqual(saved['recorded_by_id'], self.user.pk)

    def test_shelf_check_in_needs_no_estimate(self):
        order, pr, product = self._restoration_order()
        resp = self._post(order, pr, product, dispatch='on_shelf')
        self.assertEqual(resp.status_code, 200, resp.data)


class CheckInTogetherTests(RestorationQueueTestBase):
    def _two_rows(self):
        order, pr, product = self._restoration_order()
        rows = [pr]
        mr = ManifestRow.objects.create(
            purchase_order=order, row_number=2, quantity=1, title='Xbox Controller', unit_retail=Decimal('49.99'),
        )
        rows.append(ProcessingRow.objects.create(
            purchase_order=order, manifest_row=mr, row_number=2, quantity=1, title='Xbox Controller',
        ))
        for row in rows:
            row.matched_product = product
            row.save(update_fields=['matched_product'])
        return order, product, rows

    def _post(self, order, product, rows, **extra):
        return self.client.post(
            f'/api/inventory/orders/{order.id}/processing-check-in-together/',
            {
                'processing_row_ids': [r.id for r in rows],
                'rows': [{'processing_row_id': r.id, 'quantity': 1} for r in rows],
                'product_mode': 'existing',
                'product_id': product.id,
                'condition': 'good',
                'dispatch': 'restoration',
                'price': '19.99',
                **extra,
            },
            format='json',
        )

    def test_refused_without_estimates(self):
        order, product, rows = self._two_rows()
        resp = self._post(order, product, rows)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration:', resp.data['detail'])
        self.assertFalse(Item.objects.filter(purchase_order=order).exists())

    def test_each_job_gets_the_estimate(self):
        order, product, rows = self._two_rows()
        resp = self._post(order, product, rows, restoration=RESTORATION_ESTIMATE)
        self.assertEqual(resp.status_code, 200, resp.data)
        jobs = RestorationJob.objects.filter(purchase_order=order)
        self.assertEqual(jobs.count(), 2)
        self.assertTrue(all(j.queue_note.startswith('Estimate: repair') for j in jobs))


class ProductPlusCheckInTests(RestorationQueueTestBase):
    def _post(self, order, product, **extra):
        return self.client.post(
            f'/api/inventory/products/{product.id}/check-in/',
            {'purchase_order': order.id, 'quantity': 1, 'price': '19.99', 'condition': 'good',
             'dispatch': 'restoration', **extra},
            format='json',
        )

    def test_refused_without_estimates(self):
        order, _pr, product = self._restoration_order()
        resp = self._post(order, product)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration:', resp.data['detail'])
        self.assertFalse(Item.objects.filter(product=product).exists())

    def test_with_estimates_makes_the_job(self):
        order, _pr, product = self._restoration_order()
        resp = self._post(order, product, restoration=RESTORATION_ESTIMATE)
        self.assertEqual(resp.status_code, 201, resp.data)
        job = RestorationJob.objects.get(pk=resp.data['restoration_job_id'])
        self.assertTrue(job.queue_note.startswith('Estimate: repair'))


class EditCheckInTests(RestorationQueueTestBase):
    def _shelf_check_in(self):
        order, pr, product = self._restoration_order()
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {'processing_row_id': pr.id, 'quantity': 1, 'condition': 'good', 'dispatch': 'on_shelf',
             'price': '19.99', 'product_mode': 'existing', 'product_id': product.id},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        return order, resp.data['item_check_in_id']

    def _update(self, order, check_in_id, payload):
        return self.client.post(
            f'/api/inventory/orders/{order.id}/item-check-ins/{check_in_id}/update/', payload, format='json',
        )

    def test_moving_to_restoration_needs_estimates(self):
        order, check_in_id = self._shelf_check_in()
        resp = self._update(order, check_in_id, {'dispatch': 'restoration'})
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration:', resp.data['detail'])
        self.assertFalse(RestorationJob.objects.filter(item_check_in_id=check_in_id).exists())
        self.assertEqual(Item.objects.get(check_in_id=check_in_id).location, 'on_shelf')

    def test_moving_to_restoration_with_estimates(self):
        order, check_in_id = self._shelf_check_in()
        resp = self._update(order, check_in_id, {'dispatch': 'restoration', 'restoration': RESTORATION_ESTIMATE})
        self.assertEqual(resp.status_code, 200, resp.data)
        job = RestorationJob.objects.get(item_check_in_id=check_in_id)
        self.assertTrue(job.queue_note.startswith('Estimate: repair'))

    def test_editing_a_restoration_check_in_keeps_working_without_resending(self):
        order, check_in_id = self._shelf_check_in()
        self._update(order, check_in_id, {'dispatch': 'restoration', 'restoration': RESTORATION_ESTIMATE})
        resp = self._update(order, check_in_id, {'price': '24.99'})
        self.assertEqual(resp.status_code, 200, resp.data)


class ItemLevelPathTests(RestorationQueueTestBase):
    def _shelf_item(self):
        order, pr, product = self._restoration_order()
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {'processing_row_id': pr.id, 'quantity': 1, 'condition': 'good', 'dispatch': 'on_shelf',
             'price': '19.99', 'product_mode': 'existing', 'product_id': product.id},
            format='json',
        )
        return Item.objects.get(check_in_id=resp.data['item_check_in_id'])

    def test_item_patch_cannot_send_to_restoration(self):
        item = self._shelf_item()
        resp = self.client.patch(
            f'/api/inventory/items/{item.id}/processing-patch/', {'dispatch': 'restoration'}, format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('from its check-in', resp.data['detail'])
        item.refresh_from_db()
        self.assertEqual(item.location, 'on_shelf')

    def test_item_editor_cannot_send_to_restoration(self):
        item = self._shelf_item()
        resp = self.client.patch(f'/api/inventory/items/{item.id}/', {'location': 'restoration'}, format='json')
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('from its check-in', str(resp.data['location']))
        item.refresh_from_db()
        self.assertEqual(item.location, 'on_shelf')
        ok = self.client.patch(f'/api/inventory/items/{item.id}/', {'location': 'back_storage'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.data)

    def test_item_patch_other_dispatch_still_works(self):
        item = self._shelf_item()
        resp = self.client.patch(
            f'/api/inventory/items/{item.id}/processing-patch/', {'dispatch': 'back_storage'}, format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
