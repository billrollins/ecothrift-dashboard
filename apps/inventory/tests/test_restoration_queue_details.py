"""Queue details — grade scale, values, note and destination.

Anyone can answer these, at any screen, for as long as the item is unfinished.
The person who knows what an item is worth is often not the one who checked it
in, and the full patch path only accepts queued jobs, which would have left
half the queue uneditable.
"""

from apps.inventory.models import RestorationJob

from .test_restoration_queue import FUNCTIONAL_GRADES, RestorationQueueTestBase


class RestorationQueueDetailsTests(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])

    def _patch(self, payload, job=None):
        target = job or self.job
        return self.client.patch(
            f'/api/inventory/restoration-jobs/{target.pk}/queue-details/',
            payload,
            format='json',
        )

    def test_records_a_note_and_a_destination(self):
        resp = self._patch({'queue_note': 'Ashley: customer waiting', 'intended_destination': 'shelf'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.queue_note, 'Ashley: customer waiting')
        self.assertEqual(self.job.intended_destination, 'shelf')

    def test_serializer_exposes_them(self):
        self._patch({'queue_note': 'check the cable', 'intended_destination': 'online_sales'})
        resp = self.client.get(f'/api/inventory/restoration-jobs/{self.job.pk}/')
        self.assertEqual(resp.data['queue_note'], 'check the cable')
        self.assertEqual(resp.data['intended_destination'], 'online_sales')

    def test_rejects_a_destination_that_is_not_a_real_place(self):
        resp = self._patch({'intended_destination': 'the moon'})
        self.assertEqual(resp.status_code, 400, resp.data)

    def test_accepts_every_offered_destination(self):
        for value, _label in RestorationJob.INTENDED_DESTINATION_CHOICES:
            self.assertEqual(self._patch({'intended_destination': value}).status_code, 200)

    def test_clearing_a_destination_is_allowed(self):
        self._patch({'intended_destination': 'storage'})
        self.assertEqual(self._patch({'intended_destination': ''}).status_code, 200)
        self.job.refresh_from_db()
        self.assertEqual(self.job.intended_destination, '')

    def test_fills_in_grade_values(self):
        resp = self._patch({'grade_values': {**FUNCTIONAL_GRADES, 'Working': 25.0}})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.grade_values['Working'], 25.0)

    def test_rejects_an_unknown_scale(self):
        self.assertEqual(self._patch({'scale': 'Invented Scale'}).status_code, 400)

    def test_a_note_alone_leaves_the_grade_values_untouched(self):
        before = dict(self.job.grade_values)
        self._patch({'queue_note': 'just a note'})
        self.job.refresh_from_db()
        self.assertEqual(self.job.grade_values, before)

    def test_editable_after_the_item_has_been_sent(self):
        """The gap this endpoint exists to close."""

        self.job.stage = RestorationJob.STAGE_SENT
        self.job.save(update_fields=['stage'])
        self.assertEqual(self._patch({'queue_note': 'sent but still editable'}).status_code, 200)

    def test_editable_while_on_the_bench(self):
        self.job.stage = RestorationJob.STAGE_BENCH
        self.job.save(update_fields=['stage'])
        self.assertEqual(self._patch({'intended_destination': 'staff_pick'}).status_code, 200)

    def test_closed_once_the_item_is_finished(self):
        self.job.stage = RestorationJob.STAGE_DONE
        self.job.save(update_fields=['stage'])
        self.assertEqual(self._patch({'queue_note': 'too late'}).status_code, 400)

    def test_changing_values_is_written_to_the_timeline(self):
        self._patch({'grade_values': {**FUNCTIONAL_GRADES, 'Working': 30.0}})
        self.assertTrue(
            self.job.timeline_events.filter(event_type='valuation.values_changed').exists(),
        )

    def test_a_note_alone_writes_no_valuation_event(self):
        self._patch({'queue_note': 'no values changed here'})
        self.assertFalse(
            self.job.timeline_events.filter(event_type='valuation.values_changed').exists(),
        )
