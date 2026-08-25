"""History lines that are allowed to go can be voided. Live facts stay."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group

from apps.inventory.models import RestorationJob, RestorationTimelineEvent
from apps.inventory.services.restoration_bench import hold_restoration_job
from apps.inventory.services.restoration_timeline import append_timeline_event

from .test_restoration_queue import RestorationQueueTestBase, FUNCTIONAL_GRADES


class RestorationHistoryForgetTests(RestorationQueueTestBase):
    def _bench_job(self):
        order, pr, product = self._restoration_order()
        check_in = self._check_in_restoration(order, pr, product)
        job = RestorationJob.objects.get(item_check_in_id=check_in.data['item_check_in_id'])
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/send/')
        self.client.post(f'/api/inventory/restoration-jobs/{job.id}/check-in/')
        job.refresh_from_db()
        return job

    def _forget(self, job, event):
        return self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/{event.pk}/forget-words/',
        )

    def _reset_note(self, job, event):
        return self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/timeline/{event.pk}/reset-note/',
        )

    def _patch_estimate(self, job, *, parts=None, minutes=None):
        estimate = {}
        if parts is not None:
            estimate['parts'] = parts
        if minutes is not None:
            estimate['minutes'] = minutes
        return self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/work-session/',
            {
                'work_session': {
                    'workState': 'bench',
                    'benchPlan': {
                        'startingGrade': 'Repairable',
                        'currentGrade': 'Repairable',
                        'estimates': {'Working': estimate},
                    },
                },
            },
            format='json',
        )

    def _patch_values(self, job, values):
        return self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'grade_values': values},
            format='json',
        )

    def test_cannot_void_a_lone_check_in_after_work(self):
        from apps.inventory.services.restoration_actions import start_action

        job = self._bench_job()
        start_action(job, self.user, force_new=True)
        event = job.timeline_events.get(event_type='job.checked_in')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 400, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_forget_the_current_note_reverts_the_live_note(self):
        from apps.inventory.models import ItemNote

        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'a slur'},
            format='json',
        )
        event = job.timeline_events.get(event_type='note.queue_changed')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 200, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_VOIDED)
        job.refresh_from_db()
        self.assertEqual(job.queue_note, '')
        self.assertFalse(
            ItemNote.objects.filter(
                restoration_job_id=job.pk, body='a slur', status='active'
            ).exists()
        )

    def test_reset_current_note_reverts_the_live_note(self):
        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'first'},
            format='json',
        )
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'second'},
            format='json',
        )
        first, latest = list(
            job.timeline_events.filter(event_type='note.queue_changed').order_by('id')
        )
        resp = self._reset_note(job, latest)
        self.assertEqual(resp.status_code, 200, resp.data)
        latest.refresh_from_db()
        first.refresh_from_db()
        self.assertEqual(latest.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_ACTIVE)
        job.refresh_from_db()
        self.assertEqual(job.queue_note, 'first')

    def test_cannot_reset_an_earlier_note(self):
        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'first'},
            format='json',
        )
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'second'},
            format='json',
        )
        first, latest = list(
            job.timeline_events.filter(event_type='note.queue_changed').order_by('id')
        )
        resp = self._reset_note(job, first)
        self.assertEqual(resp.status_code, 400, resp.data)
        first.refresh_from_db()
        latest.refresh_from_db()
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertEqual(latest.status, RestorationTimelineEvent.STATUS_ACTIVE)
        job.refresh_from_db()
        self.assertEqual(job.queue_note, 'second')

    def test_note_stays_when_another_user_changes_an_estimate(self):
        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'check the cable'},
            format='json',
        )
        bob = get_user_model().objects.create_user(
            email='bob@example.com',
            first_name='Bob',
            last_name='Staff',
            password='pw',
        )
        bob.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=bob)
        patch = self._patch_estimate(job, minutes=45)
        self.assertEqual(patch.status_code, 200, patch.data)
        self.client.force_authenticate(user=self.user)
        event = job.timeline_events.get(event_type='note.queue_changed')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 200, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_VOIDED)
        job.refresh_from_db()
        self.assertEqual(job.queue_note, '')

    def test_own_later_sitting_does_not_lock_a_note(self):
        from apps.inventory.services.restoration_actions import start_action

        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'check the cable'},
            format='json',
        )
        start_action(job, self.user, force_new=True)
        event = job.timeline_events.get(event_type='note.queue_changed')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 200, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_VOIDED)
        job.refresh_from_db()
        self.assertEqual(job.queue_note, '')

    def test_own_later_note_does_not_lock_an_earlier_one(self):
        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'first'},
            format='json',
        )
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'second'},
            format='json',
        )
        first, latest = list(
            job.timeline_events.filter(event_type='note.queue_changed').order_by('id')
        )
        resp = self._forget(job, first)
        self.assertEqual(resp.status_code, 200, resp.data)
        first.refresh_from_db()
        latest.refresh_from_db()
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(latest.status, RestorationTimelineEvent.STATUS_ACTIVE)
        job.refresh_from_db()
        self.assertEqual(job.queue_note, 'second')

    def test_later_sitting_by_someone_else_locks_a_note(self):
        from apps.inventory.services.restoration_actions import start_action

        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'check the cable'},
            format='json',
        )
        bob = get_user_model().objects.create_user(
            email='bob-sit@example.com',
            first_name='Bob',
            last_name='Staff',
            password='pw',
        )
        bob.groups.add(Group.objects.get_or_create(name='Manager')[0])
        start_action(job, bob, force_new=True)
        event = job.timeline_events.get(event_type='note.queue_changed')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 400, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_later_comment_by_someone_else_locks_a_note(self):
        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'first'},
            format='json',
        )
        bob = get_user_model().objects.create_user(
            email='bob-note@example.com',
            first_name='Bob',
            last_name='Staff',
            password='pw',
        )
        bob.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=bob)
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'bob was here'},
            format='json',
        )
        self.client.force_authenticate(user=self.user)
        first = job.timeline_events.filter(event_type='note.queue_changed').order_by('id').first()
        resp = self._forget(job, first)
        self.assertEqual(resp.status_code, 400, resp.data)
        first.refresh_from_db()
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_cannot_trash_someone_elses_note(self):
        from apps.inventory.models import ItemNote

        job = self._bench_job()
        item = job.item_check_in.items.first()
        created = self.client.post(
            f'/api/inventory/items/{item.pk}/notes/',
            {'body': 'mine'},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        bob = get_user_model().objects.create_user(
            email='bob-trash@example.com',
            first_name='Bob',
            last_name='Staff',
            password='pw',
        )
        bob.groups.add(Group.objects.get_or_create(name='Manager')[0])
        self.client.force_authenticate(user=bob)
        listed = self.client.get(f'/api/inventory/items/{item.pk}/notes/')
        self.assertEqual(listed.status_code, 200)
        theirs = next(row for row in listed.data if row['id'] == created.data['id'])
        self.assertFalse(theirs.get('can_delete'))
        self.assertFalse(theirs.get('can_edit'))
        voided = self.client.post(
            f'/api/inventory/item-notes/{created.data["id"]}/void/',
            {'reason': 'not yours'},
            format='json',
        )
        self.assertEqual(voided.status_code, 400, voided.data)
        twin = job.timeline_events.get(event_type='note.added')
        self.assertEqual(self._forget(job, twin).status_code, 400)
        twin.refresh_from_db()
        self.assertEqual(twin.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertEqual(
            ItemNote.objects.get(pk=created.data['id']).status,
            ItemNote.STATUS_ACTIVE,
        )

    def test_manual_add_creates_a_timeline_twin_and_trash_from_either_id_voids_both(self):
        from apps.inventory.models import ItemNote

        job = self._bench_job()
        item = job.item_check_in.items.first()
        created = self.client.post(
            f'/api/inventory/items/{item.pk}/notes/',
            {'body': 'hello from the drawer'},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertTrue(created.data.get('can_delete'))
        twin = job.timeline_events.get(event_type='note.added')
        self.assertEqual(twin.payload.get('item_note_id'), created.data['id'])
        self.assertEqual(twin.payload.get('body'), 'hello from the drawer')

        voided = self.client.post(
            f'/api/inventory/item-notes/{created.data["id"]}/void/',
            {'reason': 'from the drawer'},
            format='json',
        )
        self.assertEqual(voided.status_code, 200, voided.data)
        twin.refresh_from_db()
        self.assertEqual(twin.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(
            ItemNote.objects.get(pk=created.data['id']).status,
            ItemNote.STATUS_VOIDED,
        )

        created2 = self.client.post(
            f'/api/inventory/items/{item.pk}/notes/',
            {'body': 'second twin'},
            format='json',
        )
        self.assertEqual(created2.status_code, 201, created2.data)
        event2 = job.timeline_events.filter(event_type='note.added').latest('id')
        forget = self._forget(job, event2)
        self.assertEqual(forget.status_code, 200, forget.data)
        event2.refresh_from_db()
        self.assertEqual(event2.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(
            ItemNote.objects.get(pk=created2.data['id']).status,
            ItemNote.STATUS_VOIDED,
        )

    def test_clear_note_history_voids_every_queue_note_event(self):
        job = self._bench_job()
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'first'},
            format='json',
        )
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'second'},
            format='json',
        )
        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/clear-note-history/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['cleared'], 1)
        self.assertEqual(
            job.timeline_events.filter(
                event_type='note.queue_changed',
                status=RestorationTimelineEvent.STATUS_ACTIVE,
            ).count(),
            1,
        )
        job.refresh_from_db()
        self.assertEqual(job.queue_note, 'second')

    def test_hold_words_stay_on_the_hold(self):
        job = self._bench_job()
        hold_restoration_job(
            job,
            user=self.user,
            wait_for={'other': 'a slur'},
        )
        job.refresh_from_db()
        event = job.timeline_events.get(event_type='hold.placed')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 400, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertIn('a slur', event.payload.get('story') or '')

    def test_cannot_clear_the_latest_sell_as(self):
        job = self._bench_job()
        self._patch_values(job, {**FUNCTIONAL_GRADES, 'Working': 30.0})
        event = job.timeline_events.filter(event_type='valuation.values_changed').latest('id')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 400, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_earlier_working_sell_as_clears_when_working_changes_again(self):
        job = self._bench_job()
        self._patch_values(job, {**FUNCTIONAL_GRADES, 'Working': 20.0})
        self._patch_values(job, {**FUNCTIONAL_GRADES, 'Working': 30.0})
        first, latest = list(
            job.timeline_events.filter(event_type='valuation.values_changed').order_by('id')
        )[-2:]
        resp = self._forget(job, first)
        self.assertEqual(resp.status_code, 200, resp.data)
        first.refresh_from_db()
        latest.refresh_from_db()
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(latest.status, RestorationTimelineEvent.STATUS_ACTIVE)
        job.refresh_from_db()
        self.assertEqual(float(job.grade_values['Working']), 30.0)

    def test_working_then_repairable_sell_as_both_stay(self):
        job = self._bench_job()
        self._patch_values(job, {**FUNCTIONAL_GRADES, 'Working': 30.0})
        self._patch_values(job, {**FUNCTIONAL_GRADES, 'Working': 30.0, 'Repairable': 15.0})
        first, latest = list(
            job.timeline_events.filter(event_type='valuation.values_changed').order_by('id')
        )
        self.assertEqual(self._forget(job, first).status_code, 400)
        self.assertEqual(self._forget(job, latest).status_code, 400)
        first.refresh_from_db()
        latest.refresh_from_db()
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertEqual(latest.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_single_estimate_stays(self):
        job = self._bench_job()
        resp = self._patch_estimate(job, parts=20, minutes=45)
        self.assertEqual(resp.status_code, 200, resp.data)
        event = job.timeline_events.get(event_type='plan.estimate_changed')
        forget = self._forget(job, event)
        self.assertEqual(forget.status_code, 400, forget.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_ACTIVE)
        job.refresh_from_db()
        self.assertEqual(
            job.work_session['benchPlan']['estimates']['Working'],
            {'parts': 20, 'minutes': 45},
        )

    def test_earlier_minutes_void_and_live_minutes_stay(self):
        job = self._bench_job()
        self.assertEqual(self._patch_estimate(job, minutes=10).status_code, 200)
        self.assertEqual(self._patch_estimate(job, minutes=20).status_code, 200)
        self.assertEqual(self._patch_estimate(job, minutes=45).status_code, 200)
        first, middle, latest = list(
            job.timeline_events.filter(event_type='plan.estimate_changed').order_by('id')
        )
        self.assertEqual(self._forget(job, first).status_code, 200)
        self.assertEqual(self._forget(job, middle).status_code, 200)
        self.assertEqual(self._forget(job, latest).status_code, 400)
        first.refresh_from_db()
        middle.refresh_from_db()
        latest.refresh_from_db()
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(middle.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(latest.status, RestorationTimelineEvent.STATUS_ACTIVE)
        job.refresh_from_db()
        self.assertEqual(job.work_session['benchPlan']['estimates']['Working']['minutes'], 45)

    def test_estimate_parts_then_minutes_both_stay(self):
        job = self._bench_job()
        self.assertEqual(self._patch_estimate(job, parts=20).status_code, 200)
        self.assertEqual(self._patch_estimate(job, parts=20, minutes=45).status_code, 200)
        first, latest = list(
            job.timeline_events.filter(event_type='plan.estimate_changed').order_by('id')
        )
        self.assertEqual(self._forget(job, first).status_code, 400)
        self.assertEqual(self._forget(job, latest).status_code, 400)
        first.refresh_from_db()
        latest.refresh_from_db()
        self.assertEqual(first.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertEqual(latest.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_bounce_earlier_job_rows_clear_newest_and_sent_stay(self):
        job = self._bench_job()
        sent = job.timeline_events.get(event_type='job.sent')
        first_check_in = job.timeline_events.get(event_type='job.checked_in')
        back = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/move-back-to-queue/',
            {'reason': 'not_ready'},
            format='json',
        )
        self.assertEqual(back.status_code, 200, back.data)
        queue = job.timeline_events.get(event_type='job.moved_to_queue')
        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/clear-history/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data, {'notes': 0, 'superseded': 1})
        first_check_in.refresh_from_db()
        queue.refresh_from_db()
        sent.refresh_from_db()
        self.assertEqual(first_check_in.status, RestorationTimelineEvent.STATUS_VOIDED)
        self.assertEqual(queue.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertEqual(sent.status, RestorationTimelineEvent.STATUS_ACTIVE)
        job.refresh_from_db()
        self.assertEqual(job.stage, RestorationJob.STAGE_SENT)
        self.assertEqual(job.actions.count(), 1)

    def test_bounce_moves_stay_when_work_sat_between(self):
        from apps.inventory.services.restoration_actions import start_action

        job = self._bench_job()
        start_action(job, self.user, force_new=True)
        self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/move-back-to-queue/',
            {'reason': 'not_ready'},
            format='json',
        )
        check_in = job.timeline_events.get(event_type='job.checked_in')
        queue = job.timeline_events.get(event_type='job.moved_to_queue')
        self.assertEqual(self._forget(job, check_in).status_code, 400)
        self.assertEqual(self._forget(job, queue).status_code, 400)
        check_in.refresh_from_db()
        queue.refresh_from_db()
        self.assertEqual(check_in.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertEqual(queue.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_parts_ordered_and_valuation_requested_stay(self):
        job = self._bench_job()
        append_timeline_event(
            job,
            'parts.order_purchased',
            {'supplier_name': 'McMaster', 'total': '12.00'},
            actor=self.user,
            entity_id=f'parts-order:{job.pk}',
        )
        req = self.client.post(
            f'/api/inventory/restoration-jobs/{job.id}/request-valuation/',
            {'grades': ['Working'], 'notes': 'Need Working $'},
            format='json',
        )
        self.assertEqual(req.status_code, 200, req.data)
        parts = job.timeline_events.get(event_type='parts.order_purchased')
        valuation = job.timeline_events.get(event_type='valuation.requested')
        self.assertEqual(self._forget(job, parts).status_code, 400)
        self.assertEqual(self._forget(job, valuation).status_code, 400)
        parts.refresh_from_db()
        valuation.refresh_from_db()
        self.assertEqual(parts.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertEqual(valuation.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_finished_jobs_can_trash_comments(self):
        from apps.inventory.models import ItemNote

        job = self._bench_job()
        item = job.item_check_in.items.first()
        created = self.client.post(
            f'/api/inventory/items/{item.pk}/notes/',
            {'body': 'leave this'},
            format='json',
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'current note'},
            format='json',
        )
        job.stage = RestorationJob.STAGE_DONE
        job.save(update_fields=['stage'])
        listed = self.client.get(f'/api/inventory/items/{item.pk}/notes/')
        self.assertEqual(listed.status_code, 200)
        manual = next(row for row in listed.data if row['id'] == created.data['id'])
        self.assertTrue(manual.get('can_delete'))
        self.assertTrue(manual.get('can_edit'))
        event = job.timeline_events.filter(event_type='note.added').latest('id')
        resp = self._forget(job, event)
        self.assertEqual(resp.status_code, 200, resp.data)
        event.refresh_from_db()
        self.assertEqual(event.status, RestorationTimelineEvent.STATUS_VOIDED)
        current = job.timeline_events.get(event_type='note.queue_changed')
        self.assertEqual(self._reset_note(job, current).status_code, 200)
        self.assertEqual(
            ItemNote.objects.get(pk=created.data['id']).status,
            ItemNote.STATUS_VOIDED,
        )

    def test_finished_jobs_keep_non_comment_words(self):
        job = self._bench_job()
        self.assertEqual(self._patch_estimate(job, minutes=10).status_code, 200)
        self.assertEqual(self._patch_estimate(job, minutes=20).status_code, 200)
        job.stage = RestorationJob.STAGE_DONE
        job.save(update_fields=['stage'])
        earlier = (
            job.timeline_events.filter(event_type='plan.estimate_changed')
            .order_by('id')
            .first()
        )
        resp = self._forget(job, earlier)
        self.assertEqual(resp.status_code, 400, resp.data)
        earlier.refresh_from_db()
        self.assertEqual(earlier.status, RestorationTimelineEvent.STATUS_ACTIVE)

    def test_clear_history_clears_notes_and_superseded_not_actions(self):
        from apps.inventory.services.restoration_actions import describe_action, start_action

        job = self._bench_job()
        first = job.current_action
        describe_action(job, first.pk, description='looked inside')
        job.refresh_from_db()
        job, second = start_action(job, self.user, force_new=True)
        self.assertEqual(self._patch_estimate(job, minutes=10).status_code, 200)
        self.assertEqual(self._patch_estimate(job, minutes=20).status_code, 200)
        self.assertEqual(self._patch_estimate(job, minutes=45).status_code, 200)
        self._patch_values(job, {**FUNCTIONAL_GRADES, 'Working': 20.0})
        self._patch_values(job, {**FUNCTIONAL_GRADES, 'Working': 30.0})
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'first'},
            format='json',
        )
        self.client.patch(
            f'/api/inventory/restoration-jobs/{job.id}/queue-details/',
            {'queue_note': 'check the cable'},
            format='json',
        )
        hold_restoration_job(job, user=self.user, wait_for={'other': 'waiting on a hinge'})
        action_count = job.actions.count()
        resp = self.client.post(f'/api/inventory/restoration-jobs/{job.id}/clear-history/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['notes'], 1)
        self.assertEqual(resp.data['superseded'], 4)
        self.assertNotIn('actions', resp.data)
        job.refresh_from_db()
        self.assertEqual(job.actions.count(), action_count)
        self.assertEqual(job.current_action_id, second.pk)
        self.assertEqual(job.queue_note, 'check the cable')
        self.assertEqual(job.work_session['benchPlan']['estimates']['Working']['minutes'], 45)
        self.assertEqual(float(job.grade_values['Working']), 30.0)
        self.assertEqual(
            job.timeline_events.filter(
                event_type='note.queue_changed',
                status=RestorationTimelineEvent.STATUS_ACTIVE,
            ).count(),
            1,
        )
        hold = job.timeline_events.get(event_type='hold.placed')
        self.assertEqual(hold.status, RestorationTimelineEvent.STATUS_ACTIVE)
        self.assertIn('waiting on a hinge', hold.payload.get('story') or '')
        self.assertTrue(
            job.timeline_events.filter(
                event_type='job.checked_in',
                status=RestorationTimelineEvent.STATUS_ACTIVE,
            ).exists(),
        )
        self.assertEqual(
            job.timeline_events.filter(
                event_type='plan.estimate_changed',
                status=RestorationTimelineEvent.STATUS_ACTIVE,
            ).count(),
            1,
        )
        self.assertEqual(
            job.timeline_events.filter(
                event_type='valuation.values_changed',
                status=RestorationTimelineEvent.STATUS_ACTIVE,
            ).count(),
            1,
        )
