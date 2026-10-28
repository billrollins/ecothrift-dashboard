"""Stacks: one job with several units, split into groups and stacked back."""

from datetime import timedelta

from django.utils import timezone

from apps.inventory.models import Item, RestorationJob
from apps.inventory.tests.test_restoration_queue import FUNCTIONAL_GRADES, RestorationQueueTestBase


class StackHelpers:
    def _stack(self, quantity=6, **fields):
        order, pr, product = self._restoration_order()
        job = self._legacy_multitem_restoration_job(order, pr, product, quantity=quantity)
        fields.setdefault('intended_destination', 'online_sales')
        fields.setdefault('queue_note', 'All missing the lid')
        RestorationJob.objects.filter(pk=job.pk).update(
            created_at=timezone.now() - timedelta(days=3),
            **fields,
        )
        job.refresh_from_db()
        return job

    def _units(self, job):
        return list(Item.objects.filter(check_in_id=job.item_check_in_id).order_by('id').values_list('pk', flat=True))

    def _split(self, job, groups):
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/split/',
            {'groups': [{'item_ids': g} for g in groups]},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        return resp.data


class RestorationStackTests(StackHelpers, RestorationQueueTestBase):
    def test_groups_keep_every_decision_and_the_stack_age(self):
        job = self._stack()
        units = self._units(job)
        data = self._split(job, [units[:2], units[2:4]])

        self.assertEqual(data['source_job']['quantity'], 2)
        for row in data['created_jobs']:
            self.assertEqual(row['quantity'], 2)
            self.assertEqual(row['stage'], 'queued')
            self.assertEqual(row['scale'], 'Functional')
            self.assertEqual(row['grade_values'], FUNCTIONAL_GRADES)
            self.assertEqual(row['intended_destination'], 'online_sales')
            self.assertEqual(row['queue_note'], 'All missing the lid')
            self.assertEqual(row['stack_family'], job.pk)
            created = RestorationJob.objects.get(pk=row['id']).created_at
            self.assertEqual(created, job.created_at)
        self.assertEqual(data['source_job']['stack_family'], job.pk)

    def test_a_split_of_a_group_stays_in_the_first_family(self):
        job = self._stack()
        units = self._units(job)
        first = self._split(job, [units[:3]])['created_jobs'][0]
        again = self._split(RestorationJob.objects.get(pk=first['id']), [units[:1]])
        self.assertEqual(again['created_jobs'][0]['stack_family'], job.pk)

    def test_sent_stacks_split_and_stay_sent(self):
        job = self._stack(stage=RestorationJob.STAGE_SENT, sent_at=timezone.now())
        units = self._units(job)
        row = self._split(job, [units[:1]])['created_jobs'][0]
        self.assertEqual(row['stage'], 'sent')
        self.assertIsNotNone(row['sent_at'])

    def test_stack_back_together_undoes_a_split(self):
        job = self._stack()
        units = self._units(job)
        data = self._split(job, [units[:2], units[2:4]])
        ids = [job.pk] + [row['id'] for row in data['created_jobs']]
        combined = self._combine_restoration_jobs(ids)
        self.assertEqual(combined.pk, job.pk)
        self.assertEqual(combined.quantity, 6)
        self.assertEqual(RestorationJob.objects.count(), 1)

    def test_sent_groups_combine_but_not_across_stages(self):
        job = self._stack(stage=RestorationJob.STAGE_SENT, sent_at=timezone.now())
        units = self._units(job)
        created = self._split(job, [units[:2], units[2:4]])['created_jobs']
        self._combine_restoration_jobs([job.pk, created[0]['id']])

        RestorationJob.objects.filter(pk=created[1]['id']).update(stage=RestorationJob.STAGE_QUEUED)
        resp = self.client.post(
            '/api/inventory/restoration-jobs/combine/',
            {'job_ids': [job.pk, created[1]['id']]},
            format='json',
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn('same stage', resp.data['detail'])


class RestorationStackBenchTests(StackHelpers, RestorationQueueTestBase):
    """Phase B: a whole stack is worked as one item and finishes every unit."""

    def _bench(self, job, **payload):
        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/', payload, format='json')
        self.assertEqual(resp.status_code, 200, resp.data)
        return resp.data

    def _finish(self, job, **extra):
        return self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/done/',
            {'destination': 'processing', 'final_grade': 'Working', 'starting_grade': 'Parts-only',
             'notes': 'All tested.', **extra},
            format='json',
        )

    def test_the_whole_stack_goes_on_the_bench(self):
        job = self._stack()
        data = self._bench(job)
        self.assertEqual(data['id'], job.pk)
        self.assertEqual(data['stage'], 'bench')
        self.assertEqual(data['quantity'], 6)

    def test_an_item_id_still_takes_just_that_unit(self):
        job = self._stack()
        unit = self._units(job)[2]
        data = self._bench(job, item_id=unit)
        self.assertNotEqual(data['id'], job.pk)
        self.assertEqual(data['quantity'], 1)
        self.assertEqual(data['items'][0]['id'], unit)
        job.refresh_from_db()
        self.assertEqual((job.stage, job.quantity), ('queued', 5))

    def test_finishing_a_stack_counts_every_unit(self):
        job = self._stack()
        self._bench(job)
        done = self._finish(job)
        self.assertEqual(done.status_code, 200, done.data)
        job.refresh_from_db()
        # Working 19.99 - Parts-only 5.00 = 14.99 a unit, six units, no parts.
        self.assertEqual(str(job.value_added), '89.94')
        locations = set(Item.objects.filter(check_in_id=job.item_check_in_id).values_list('location', flat=True))
        self.assertEqual(locations, {'processing'})

        board = self.client.get('/api/inventory/restoration-jobs/scoreboard/').data
        self.assertEqual(board['today']['items'], 6)
        self.assertEqual(board['today']['value_added'], '89.94')

    def test_salvaged_parts_need_a_single_unit(self):
        job = self._stack()
        self._bench(job)
        done = self._finish(job, outputs=[{'seq': 0, 'label': 'Whole item'}, {'seq': 1, 'label': 'Motor'}])
        self.assertEqual(done.status_code, 400)
        self.assertIn('Pull that unit out', done.data['detail'])

    def test_processing_takes_the_whole_stack_in(self):
        job = self._stack()
        self._bench(job)
        self.assertEqual(self._finish(job).status_code, 200)
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/processing-check-in/',
            {'price': '24.00', 'dispatch': 'on_shelf'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        prices = set(Item.objects.filter(check_in_id=job.item_check_in_id).values_list('price', flat=True))
        self.assertEqual({str(p) for p in prices}, {'24.00'})



class RestorationTakeOutOfQueueTests(StackHelpers, RestorationQueueTestBase):
    """Take out of queue: give back to Processing, or check in here with no work."""

    def _take_out(self, job, mode, reason=''):
        return self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/take-out/',
            {'mode': mode, 'reason': reason},
            format='json',
        )

    def test_give_back_closes_to_done_with_the_reason_and_keeps_the_check_in(self):
        from apps.inventory.models import ItemNote

        job = self._stack(quantity=3)
        check_in_id = job.item_check_in_id
        self.assertEqual(self._take_out(job, 'given_back').status_code, 400)
        resp = self._take_out(job, 'given_back', 'Wrong product line')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['stage'], 'done')
        self.assertEqual((resp.data['return_reason'], resp.data['return_notes']), ('given_back', 'Wrong product line'))
        self.assertIsNone(resp.data['processing_handled_at'])
        units = Item.objects.filter(check_in_id=check_in_id)
        self.assertEqual(units.count(), 3)
        self.assertEqual(set(units.values_list('location', flat=True)), {'processing'})
        job.item_check_in.refresh_from_db()
        self.assertEqual(job.item_check_in.defaults_snapshot['dispatch'], 'processing')
        self.assertIn('Wrong product line', job.item_check_in.defaults_snapshot['restoration_return_notes'])
        self.assertTrue(ItemNote.objects.filter(body__contains='Given back to Processing: Wrong product line').exists())

    def test_check_in_here_closes_as_no_work_ready_for_its_tag(self):
        job = self._stack(quantity=2)
        resp = self._take_out(job, 'no_work')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual((resp.data['stage'], resp.data['return_reason']), ('done', 'no_work'))
        received = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/processing-check-in/',
            {'price': '30.00', 'dispatch': 'on_shelf'},
            format='json',
        )
        self.assertEqual(received.status_code, 200, received.data)
        self.assertEqual(len(received.data['printed_items_preview']), 2)

    def test_blocked_once_bench_work_started(self):
        job = self._stack(quantity=1)
        RestorationJob.objects.filter(pk=job.pk).update(bench_started_at=timezone.now())
        resp = self._take_out(job, 'no_work')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('Bench work has started', resp.data['detail'])
