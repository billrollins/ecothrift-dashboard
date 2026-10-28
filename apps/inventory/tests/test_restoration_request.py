"""Every Processing path that sends an item to Restoration needs the request (owner, 2026-10-28)."""

from decimal import Decimal

from apps.core.models import AppSetting
from apps.inventory.models import Item, ManifestRow, ProcessingRow, PurchaseOrder, RestorationJob
from apps.inventory.services import restoration_request as rr
from apps.inventory.services.restoration_request import priority_for_job, request_line, restoration_request
from apps.inventory.tests.test_restoration_queue import (
    FUNCTIONAL_GRADES,
    RESTORATION_REQUEST,
    RestorationQueueTestBase,
)


class RequestRuleTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        rr.clear_cache()

    def test_rule_names_what_is_missing(self):
        with self.assertRaisesMessage(ValueError, 'pick what it needs'):
            restoration_request({'done_price': '50'})
        with self.assertRaisesMessage(ValueError, 'give the done price'):
            restoration_request({'needs': ['repair']})
        with self.assertRaisesMessage(ValueError, 'must be a dollar amount'):
            restoration_request({'needs': ['repair'], 'done_price': 'lots'})
        with self.assertRaisesMessage(ValueError, "can't be more than the done price"):
            restoration_request({'needs': ['test'], 'done_price': '50', 'as_is': {'untested': '60'}})

    def test_as_is_prices_fill_in_from_settings(self):
        req = restoration_request({'needs': ['Test', 'clean', 'assemble', 'repair', 'check parts'], 'done_price': '110'})
        self.assertEqual(req['needs'], ['test', 'clean', 'assemble', 'repair', 'check_parts'])
        self.assertEqual(req['as_is'], {'untested': '55.00', 'dirty': '77.00', 'flat_packed': '100.00',
                                        'broken': '33.00', 'parts_unchecked': '66.00'})
        self.assertEqual(restoration_request(req), req)  # its own output passes again

    def test_typed_as_is_and_scrap_win(self):
        req = restoration_request({'needs': ['test', 'repair'], 'done_price': '80', 'as_is': {'untested': '30'},
                                   'broken_scrap': True})
        self.assertEqual(req['as_is'], {'untested': '30.00', 'broken': '0.00'})
        self.assertEqual(request_line(req), 'Asked: test, repair · done $80.00 · as is $0.00 · at stake $80.00')

    def test_settings_change_the_defaults(self):
        AppSetting.objects.create(key='restoration.as_is_untested_pct', value=40)
        AppSetting.objects.create(key='restoration.flat_pack_markup_pct', value=25)
        rr.clear_cache()
        req = restoration_request({'needs': ['test', 'assemble'], 'done_price': '100'})
        self.assertEqual(req['as_is'], {'untested': '40.00', 'flat_packed': '80.00'})

    def test_settings_endpoint(self):
        resp = self.client.get('/api/inventory/restoration-request/settings/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['as_is_pct']['untested'], 50)
        self.assertEqual(resp.data['flat_pack_markup_pct'], 10)
        self.assertEqual([n['value'] for n in resp.data['needs']],
                         ['test', 'clean', 'assemble', 'repair', 'check_parts'])


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

    def test_refused_without_a_request_and_nothing_saved(self):
        order, pr, product = self._restoration_order()
        resp = self._post(order, pr, product)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration: pick what it needs', resp.data['detail'])
        self.assertFalse(Item.objects.filter(purchase_order=order).exists())
        self.assertFalse(RestorationJob.objects.exists())

    def test_request_on_check_in_job_and_queue_note(self):
        order, pr, product = self._restoration_order()
        resp = self._post(order, pr, product, restoration=RESTORATION_REQUEST)
        self.assertEqual(resp.status_code, 200, resp.data)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.assertEqual(job.queue_note, 'Asked: repair · done $60.00 · as is $18.00 · at stake $42.00')
        self.assertEqual((job.requested_needs, job.done_price, job.value_at_stake),
                         (['repair'], Decimal('60.00'), Decimal('42.00')))
        self.assertEqual(job.as_is_prices, {'broken': '18.00'})
        saved = job.item_check_in.defaults_snapshot['restoration_request']
        self.assertEqual(saved['done_price'], '60.00')
        self.assertEqual(saved['recorded_by_id'], self.user.pk)
        self.assertFalse(job.holdout)

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

    def test_refused_without_a_request(self):
        order, product, rows = self._two_rows()
        resp = self._post(order, product, rows)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration:', resp.data['detail'])
        self.assertFalse(Item.objects.filter(purchase_order=order).exists())

    def test_each_job_gets_the_request(self):
        order, product, rows = self._two_rows()
        resp = self._post(order, product, rows, restoration=RESTORATION_REQUEST)
        self.assertEqual(resp.status_code, 200, resp.data)
        jobs = RestorationJob.objects.filter(purchase_order=order)
        self.assertEqual(jobs.count(), 2)
        self.assertTrue(all(j.queue_note.startswith('Asked: repair') for j in jobs))


class ProductPlusCheckInTests(RestorationQueueTestBase):
    def _post(self, order, product, **extra):
        return self.client.post(
            f'/api/inventory/products/{product.id}/check-in/',
            {'purchase_order': order.id, 'quantity': 1, 'price': '19.99', 'condition': 'good',
             'dispatch': 'restoration', **extra},
            format='json',
        )

    def test_refused_without_a_request(self):
        order, _pr, product = self._restoration_order()
        resp = self._post(order, product)
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration:', resp.data['detail'])
        self.assertFalse(Item.objects.filter(product=product).exists())

    def test_with_a_request_makes_the_job(self):
        order, _pr, product = self._restoration_order()
        resp = self._post(order, product, restoration=RESTORATION_REQUEST)
        self.assertEqual(resp.status_code, 201, resp.data)
        job = RestorationJob.objects.get(pk=resp.data['restoration_job_id'])
        self.assertTrue(job.queue_note.startswith('Asked: repair'))


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

    def test_moving_to_restoration_needs_a_request(self):
        order, check_in_id = self._shelf_check_in()
        resp = self._update(order, check_in_id, {'dispatch': 'restoration'})
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertIn('Restoration:', resp.data['detail'])
        self.assertFalse(RestorationJob.objects.filter(item_check_in_id=check_in_id).exists())
        self.assertEqual(Item.objects.get(check_in_id=check_in_id).location, 'on_shelf')

    def test_moving_to_restoration_with_a_request(self):
        order, check_in_id = self._shelf_check_in()
        resp = self._update(order, check_in_id, {'dispatch': 'restoration', 'restoration': RESTORATION_REQUEST})
        self.assertEqual(resp.status_code, 200, resp.data)
        job = RestorationJob.objects.get(item_check_in_id=check_in_id)
        self.assertTrue(job.queue_note.startswith('Asked: repair'))

    def test_editing_a_restoration_check_in_keeps_working_without_resending(self):
        order, check_in_id = self._shelf_check_in()
        self._update(order, check_in_id, {'dispatch': 'restoration', 'restoration': RESTORATION_REQUEST})
        resp = self._update(order, check_in_id, {'price': '24.99'})
        self.assertEqual(resp.status_code, 200, resp.data)


    def test_old_estimate_check_in_still_edits_without_a_request(self):
        order, check_in_id = self._shelf_check_in()
        self._update(order, check_in_id, {'dispatch': 'restoration', 'restoration': RESTORATION_REQUEST})
        from apps.inventory.models import ItemCheckIn

        ci = ItemCheckIn.objects.get(pk=check_in_id)
        snap = dict(ci.defaults_snapshot)
        snap.pop('restoration_request')
        snap['restoration_estimate'] = {'work': ['repair'], 'hours': '1.5', 'value_after': '60.00'}
        ci.defaults_snapshot = snap
        ci.save(update_fields=['defaults_snapshot'])
        job = RestorationJob.objects.get(item_check_in_id=check_in_id)
        RestorationJob.objects.filter(pk=job.pk).update(queue_note='Estimate: repair · about 1.5 h · worth $60.00 after')
        resp = self._update(order, check_in_id, {'price': '24.99'})
        self.assertEqual(resp.status_code, 200, resp.data)
        job.refresh_from_db()
        self.assertTrue(job.queue_note.startswith('Estimate: repair'))


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


def _row_post(case, order, pr, product, request):
    return case.client.post(
        f'/api/inventory/orders/{order.id}/processing-row-check-in/',
        {'processing_row_id': pr.id, 'quantity': 1, 'condition': 'good', 'dispatch': 'restoration',
         'price': '19.99', 'product_mode': 'existing', 'product_id': product.id,
         'restoration_scale': 'Functional', 'restoration_grade_values': FUNCTIONAL_GRADES,
         'restoration': request},
        format='json',
    )


class HoldoutTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        rr.clear_cache()

    def _check_in(self, needs):
        order, pr, product = self._restoration_order(order_number=f'PO-P5-{PurchaseOrder.objects.count()}')
        resp = _row_post(self, order, pr, product, {'needs': needs, 'done_price': '110'})
        self.assertEqual(resp.status_code, 200, resp.data)
        return RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])

    def test_picked_holdout_is_flagged_on_job_item_and_note(self):
        AppSetting.objects.create(key='restoration.assembly_holdout_pct', value=100)
        rr.clear_cache()
        job = self._check_in(['assemble'])
        self.assertTrue(job.holdout)
        self.assertIn('HOLDOUT: sell flat-packed', job.queue_note)
        item = Item.objects.get(check_in_id=job.item_check_in_id)
        self.assertTrue(item.restoration_holdout)
        from apps.inventory.models import ItemNote

        self.assertTrue(ItemNote.objects.filter(item=item, source_key='holdout',
                                                body__startswith='Assembly holdout').exists())

    def test_only_assemble_requests_and_zero_turns_it_off(self):
        AppSetting.objects.create(key='restoration.assembly_holdout_pct', value=100)
        rr.clear_cache()
        self.assertFalse(self._check_in(['test']).holdout)
        AppSetting.objects.filter(key='restoration.assembly_holdout_pct').update(value=0)
        rr.clear_cache()
        self.assertFalse(self._check_in(['assemble']).holdout)


class PriorityTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        rr.clear_cache()

    def _job(self, needs, done='110'):
        order, pr, product = self._restoration_order(order_number=f'PO-P5-{PurchaseOrder.objects.count()}')
        resp = _row_post(self, order, pr, product, {'needs': needs, 'done_price': done})
        self.assertEqual(resp.status_code, 200, resp.data)
        return RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])

    def test_defaults_until_there_is_history(self):
        got = priority_for_job(self._job(['repair']))  # stake 110 - 33 = 77; 60% over 60 min
        self.assertEqual((got['stake'], got['odds'], got['minutes'], got['from_history']), (77.0, 0.6, 60.0, False))
        self.assertAlmostEqual(got['per_minute'], 0.77)
        both = priority_for_job(self._job(['test', 'repair']))  # odds multiply, minutes add
        self.assertEqual((both['odds'], both['minutes']), (0.51, 75.0))

    def test_history_replaces_the_defaults(self):
        AppSetting.objects.create(key='restoration.priority_min_jobs', value=2)
        rr.clear_cache()
        for disposition in ('processing', 'salvage'):
            old = self._job(['repair'])
            RestorationJob.objects.filter(pk=old.pk).update(stage='done', bench_disposition=disposition,
                                                            work_seconds=1800)
        rr.clear_cache()
        got = priority_for_job(self._job(['repair']))
        self.assertEqual((got['odds'], got['from_history']), (0.5, True))
        self.assertEqual(got['minutes'], 60.0)  # one success timed; still under the floor of 2

    def test_queue_api_carries_priority_and_old_jobs_use_the_grade_spread(self):
        job = self._job(['assemble'])
        legacy = self._job(['repair'])
        snap = dict(legacy.item_check_in.defaults_snapshot)
        snap.pop('restoration_request')
        snap['restoration_estimate'] = {'work': ['repair'], 'hours': '1', 'value_after': '60'}
        legacy.item_check_in.defaults_snapshot = snap
        legacy.item_check_in.save(update_fields=['defaults_snapshot'])
        RestorationJob.objects.filter(pk=legacy.pk).update(requested_needs=[], value_at_stake=None)
        legacy.refresh_from_db()
        self.assertIsNotNone(priority_for_job(legacy))
        resp = self.client.get(f'/api/inventory/restoration-jobs/{job.id}/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['requested_needs'], ['assemble'])
        self.assertEqual(resp.data['value_at_stake'], '10.00')
        self.assertGreater(resp.data['priority']['per_minute'], 0)

    def test_restoration_records_what_it_really_needed(self):
        job = self._job(['test'])
        resp = self.client.patch(f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
                                 {'found_needs': ['repair', 'test']}, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        job.refresh_from_db()
        self.assertEqual(job.found_needs, ['test', 'repair'])


class RestorationTagTests(RestorationQueueTestBase):
    """The check-in reply says which items get the restoration tag, and what it says (owner, 2026-10-28)."""

    def test_check_in_reply_carries_the_tag_facts(self):
        AppSetting.objects.create(key='restoration.assembly_holdout_pct', value=0)
        rr.clear_cache()
        self.user.first_name = 'Ashley'
        self.user.save(update_fields=['first_name'])
        order, pr, product = self._restoration_order()
        resp = _row_post(self, order, pr, product, {'needs': ['assemble', 'test'], 'done_price': '80'})
        self.assertEqual(resp.status_code, 200, resp.data)
        tag = resp.data['printed_items_preview'][0]['restoration_tag']
        self.assertEqual((tag['needs'], tag['holdout'], tag['sent_by']), (['Test', 'Assemble'], False, 'Ashley'))
        self.assertRegex(tag['sent_on'], r'^\d{4}-\d{2}-\d{2}$')
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        api = self.client.get(f'/api/inventory/restoration-jobs/{job.id}/')
        self.assertEqual(api.data['restoration_tag'], tag)

    def test_shelf_items_get_the_price_tag(self):
        order, pr, product = self._restoration_order()
        resp = RowCheckInTests._post(self, order, pr, product, dispatch='on_shelf')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn('restoration_tag', resp.data['printed_items_preview'][0])


class FoundAndStackTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        rr.clear_cache()

    def test_finish_records_what_it_really_needed(self):
        order, pr, product = self._restoration_order()
        resp = _row_post(self, order, pr, product, {'needs': ['test'], 'done_price': '50'})
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        done = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/done/',
                                {'destination': 'processing', 'final_grade': 'Working', 'notes': 'Fixed the cord.',
                                 'found_needs': ['repair', 'test']}, format='json')
        self.assertEqual(done.status_code, 200, done.data)
        job.refresh_from_db()
        self.assertEqual((job.stage, job.found_needs), ('done', ['test', 'repair']))

    def test_a_split_stack_keeps_the_request_per_unit(self):
        from apps.inventory.services.restoration import split_restoration_job

        order, pr, product = self._restoration_order()
        resp = self.client.post(
            f'/api/inventory/orders/{order.id}/processing-row-check-in/',
            {'processing_row_id': pr.id, 'quantity': 3, 'condition': 'good', 'dispatch': 'restoration',
             'price': '19.99', 'product_mode': 'existing', 'product_id': product.id,
             'restoration_scale': 'Functional', 'restoration_grade_values': FUNCTIONAL_GRADES,
             'restoration': {'needs': ['repair'], 'done_price': '60'}},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        items = list(job.item_check_in.items.order_by('id'))
        self.assertEqual(len(items), 3)
        self.assertEqual(len(resp.data['printed_items_preview']), 3)
        self.assertTrue(all('restoration_tag' in row for row in resp.data['printed_items_preview']))
        result = split_restoration_job(job, groups=[[items[2].pk]], user=self.user)
        new = result['created_jobs'][0]
        new.refresh_from_db()
        self.assertEqual((new.requested_needs, new.done_price, new.value_at_stake, new.as_is_prices),
                         (['repair'], Decimal('60.00'), Decimal('42.00'), {'broken': '18.00'}))
