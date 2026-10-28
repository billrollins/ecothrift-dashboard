"""Stacks: one job with several units, split into groups and stacked back."""

from datetime import timedelta

from django.utils import timezone

from apps.inventory.models import Item, RestorationJob
from apps.inventory.tests.test_restoration_queue import FUNCTIONAL_GRADES, RestorationQueueTestBase


class RestorationStackTests(RestorationQueueTestBase):
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
