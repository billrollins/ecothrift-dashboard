"""Item notes ledger - append, revise, void, fan-out, backfill, split/combine."""

import importlib

from django.apps import apps

backfill_item_notes = importlib.import_module(
    'apps.inventory.migrations.0094_item_note_backfill',
).backfill_item_notes
from apps.inventory.models import Item, ItemNote, RestorationJob
from apps.inventory.services.item_notes import (
    append_item_note,
    append_note_for_job,
    note_trail,
    record_surface_note_for_job,
    revise_item_note,
    void_item_note,
)
from apps.inventory.services.restoration import combine_restoration_jobs, split_restoration_job
from apps.inventory.tests.test_restoration_queue import RestorationQueueTestBase


class ItemNotesServiceTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        order, row, product = self._restoration_order()
        resp = self._check_in_restoration(order, row, product)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.item = self.job.item_check_in.items.order_by('id').first()

    def test_append_revise_void_manual_only(self):
        note = append_item_note(self.item, 'manual', 'first look', author=self.user)
        self.assertIsNotNone(note)
        revised = revise_item_note(note, body='second look', actor=self.user)
        self.assertEqual(revised.body, 'second look')
        note.refresh_from_db()
        self.assertEqual(note.status, ItemNote.STATUS_REVISED)
        trail = list(note_trail([self.item.pk]))
        self.assertEqual([row.body for row in trail], ['second look'])

        voided = void_item_note(revised, reason='typed the wrong item', actor=self.user)
        self.assertEqual(voided.status, ItemNote.STATUS_VOIDED)
        self.assertEqual(list(note_trail([self.item.pk])), [])

        system = append_item_note(self.item, 'queue', 'from the form', author=self.user)
        with self.assertRaises(ValueError):
            revise_item_note(system, body='nope', actor=self.user)
        with self.assertRaises(ValueError):
            void_item_note(system, reason='nope', actor=self.user)

    def test_other_author_cannot_revise(self):
        from django.contrib.auth import get_user_model

        other = get_user_model().objects.create_user(
            email='other@example.com',
            first_name='Other',
            last_name='User',
            password='pw',
        )
        note = append_item_note(self.item, 'manual', 'mine', author=self.user)
        with self.assertRaises(ValueError):
            revise_item_note(note, body='theirs', actor=other)

    def test_job_fan_out_writes_one_row_per_item(self):
        sibling = Item.objects.get(pk=self.item.pk)
        sibling.pk = None
        sibling.sku = 'ET-FANOUT'
        sibling.save()
        sibling.check_in = self.job.item_check_in
        sibling.save(update_fields=['check_in'])

        written = append_note_for_job(self.job, 'hold', 'waiting on a hinge', author=self.user)
        self.assertEqual(len(written), 2)
        self.assertEqual(
            ItemNote.objects.filter(restoration_job_id=self.job.pk, surface='hold').count(),
            2,
        )

    def test_queue_supersede_chain(self):
        record_surface_note_for_job(self.job, 'queue', 'first', author=self.user, source_key='queue')
        record_surface_note_for_job(self.job, 'queue', 'second', author=self.user, source_key='queue')
        active = ItemNote.objects.filter(item=self.item, surface='queue', status='active')
        revised = ItemNote.objects.filter(item=self.item, surface='queue', status='revised')
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.get().body, 'second')
        self.assertEqual(revised.count(), 1)
        self.assertEqual(revised.get().body, 'first')

    def test_deleting_the_job_leaves_the_note(self):
        note = append_item_note(
            self.item,
            'queue',
            'keep this through churn',
            author=self.user,
            job_id=self.job.pk,
        )
        job_id = self.job.pk
        self.job.delete()
        kept = ItemNote.objects.get(pk=note.pk)
        self.assertEqual(kept.item_id, self.item.pk)
        self.assertEqual(kept.restoration_job_id, job_id)


class ItemNotesApiTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        order, row, product = self._restoration_order(order_number='PO-NOTE-API')
        resp = self._check_in_restoration(order, row, product)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.item = self.job.item_check_in.items.first()

    def test_item_and_job_endpoints(self):
        created = self.client.post(
            f'/api/inventory/items/{self.item.pk}/notes/',
            {'body': 'Ashley: customer waiting'},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(created.data.get('can_delete'))
        self.assertTrue(created.data.get('can_edit'))
        self.assertTrue(
            self.job.timeline_events.filter(event_type='note.added').exists()
        )
        listed = self.client.get(f'/api/inventory/items/{self.item.pk}/notes/')
        self.assertEqual(listed.status_code, 200)
        self.assertTrue(any(row['body'] == 'Ashley: customer waiting' for row in listed.data))

        job_notes = self.client.get(f'/api/inventory/restoration-jobs/{self.job.pk}/notes/')
        self.assertEqual(job_notes.status_code, 200)
        self.assertTrue(any(row['body'] == 'Ashley: customer waiting' for row in job_notes.data))

        note_id = created.data['id']
        revised = self.client.patch(
            f'/api/inventory/item-notes/{note_id}/',
            {'body': 'updated'},
            format='json',
        )
        self.assertEqual(revised.status_code, 200, revised.data)
        self.assertEqual(revised.data['body'], 'updated')
        self.assertTrue(revised.data.get('can_edit'))
        twin = self.job.timeline_events.get(event_type='note.added')
        self.assertEqual(twin.payload.get('body'), 'updated')
        self.assertEqual(twin.payload.get('item_note_id'), revised.data['id'])
        voided = self.client.post(
            f'/api/inventory/item-notes/{revised.data["id"]}/void/',
            {'reason': 'wrong item'},
            format='json',
        )
        self.assertEqual(voided.status_code, 200, voided.data)
        self.assertEqual(voided.data['status'], 'voided')

    def test_queue_details_dual_writes(self):
        resp = self.client.patch(
            f'/api/inventory/restoration-jobs/{self.job.pk}/queue-details/',
            {'queue_note': 'check the cable'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(
            ItemNote.objects.filter(
                item=self.item,
                surface='queue',
                body='check the cable',
                status='active',
            ).exists()
        )
        note = ItemNote.objects.get(
            item=self.item,
            surface='queue',
            body='check the cable',
            status='active',
        )
        event = self.job.timeline_events.get(event_type='note.queue_changed')
        self.assertEqual(event.payload.get('item_note_id'), note.pk)


class ItemNotesBackfillTests(RestorationQueueTestBase):
    def test_backfill_reads_queue_note_and_timeline(self):
        order, row, product = self._restoration_order(order_number='PO-NOTE-BF')
        resp = self._check_in_restoration(order, row, product)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.pk}/queue-details/',
            {'queue_note': 'from timeline'},
            format='json',
        )
        ItemNote.objects.all().delete()
        self.assertFalse(ItemNote.objects.exists())
        backfill_item_notes(apps, None)
        self.assertTrue(
            ItemNote.objects.filter(surface='queue', body='from timeline', status='active').exists()
        )


class ItemNotesSplitCombineTests(RestorationQueueTestBase):
    def test_combine_then_split_keeps_notes(self):
        order, row, product = self._restoration_order(order_number='PO-NOTE-SPLIT')
        first = self._check_in_restoration(order, row, product)
        second = self._check_in_restoration(order, row, product)
        job_a = RestorationJob.objects.get(item_check_in_id=first.data['item_check_in_id'])
        job_b = RestorationJob.objects.get(item_check_in_id=second.data['item_check_in_id'])
        item_a = job_a.item_check_in.items.first()
        item_b = job_b.item_check_in.items.first()
        note_a = append_item_note(item_a, 'queue', 'stack A', author=self.user, job_id=job_a.pk)
        note_b = append_item_note(item_b, 'queue', 'stack B', author=self.user, job_id=job_b.pk)

        combined = combine_restoration_jobs(job_ids=[job_a.pk, job_b.pk], replace_values=True)
        self.assertTrue(ItemNote.objects.filter(pk=note_a.pk).exists())
        self.assertTrue(ItemNote.objects.filter(pk=note_b.pk).exists())
        self.assertFalse(RestorationJob.objects.filter(pk=job_b.pk).exists())

        split_restoration_job(
            combined,
            groups=[[item_b.pk]],
            user=self.user,
        )
        self.assertTrue(ItemNote.objects.filter(pk=note_a.pk, item=item_a).exists())
        self.assertTrue(ItemNote.objects.filter(pk=note_b.pk, item=item_b).exists())
