"""Actions: what was done, and why.

The log is a diary. An item always has a current action, a pause is not a new
action, and nothing is left unsaid.
"""

from apps.inventory.models import RestorationAction, RestorationJob
from apps.inventory.services.restoration_actions import (
    ActionNeedsDescriptionError,
    delete_action,
    describe_action,
    ensure_initial_action,
    start_action,
    undo_last_action,
)
from apps.inventory.services.restoration_bench import check_in_restoration_job

from .test_restoration_queue import RestorationQueueTestBase


class RestorationActionTestBase(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.job = check_in_restoration_job(self.job, self.user)


class InitialActionTests(RestorationActionTestBase):
    def test_an_item_arrives_with_an_open_action(self):
        self.assertIsNotNone(self.job.current_action_id)
        action = self.job.current_action
        self.assertEqual(action.grade, '')
        self.assertEqual(action.category, RestorationAction.CATEGORY_INSPECT)

    def test_the_first_action_is_already_described_so_it_never_blocks(self):
        self.assertTrue(self.job.current_action.is_described)

    def test_the_auto_inspect_is_written_to_the_timeline(self):
        started = [
            event
            for event in self.job.timeline_events.filter(event_type='action.started')
            if event.payload.get('action_id') == self.job.current_action_id
        ]
        self.assertEqual(len(started), 1)
        self.assertEqual(started[0].payload['category'], RestorationAction.CATEGORY_INSPECT)

    def test_opening_one_twice_does_not_make_two(self):
        first = self.job.current_action
        again = ensure_initial_action(self.job, self.user)
        self.assertEqual(again.pk, first.pk)
        self.assertEqual(self.job.actions.count(), 1)

    def test_coming_back_from_a_hold_opens_a_fresh_action(self):
        """Picking a job back up is a new sitting, not the old one continuing."""

        from apps.inventory.services.restoration_bench import hold_restoration_job

        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        hold_restoration_job(self.job, reason='parts_needed', user=self.user)
        self.job.refresh_from_db()

        self.job = check_in_restoration_job(self.job, self.user)
        resumed = self.job.current_action
        self.assertNotEqual(resumed.pk, first.pk)
        self.assertEqual(resumed.grade, '')
        self.assertEqual(resumed.category, RestorationAction.CATEGORY_INSPECT)
        self.assertEqual(resumed.description, RestorationAction.RESUME_DESCRIPTION)
        self.assertTrue(
            any(
                event.payload.get('action_id') == resumed.pk
                for event in self.job.timeline_events.filter(event_type='action.started')
            ),
        )

    def test_a_hold_closes_whatever_was_open(self):
        from apps.inventory.services.restoration_bench import hold_restoration_job

        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        hold_restoration_job(self.job, reason='parts_needed', user=self.user)

        first.refresh_from_db()
        self.assertIsNotNone(first.ended_at)

    def test_the_resume_action_is_described_so_it_never_blocks(self):
        from apps.inventory.services.restoration_bench import hold_restoration_job

        hold_restoration_job(self.job, reason='parts_needed', user=self.user)
        self.job.refresh_from_db()
        self.job = check_in_restoration_job(self.job, self.user)
        self.assertTrue(self.job.current_action.is_described)

    def test_adopts_an_orphaned_action_rather_than_opening_another(self):
        existing = self.job.current_action
        RestorationJob.objects.filter(pk=self.job.pk).update(current_action=None)
        self.job.refresh_from_db()
        self.assertEqual(ensure_initial_action(self.job, self.user).pk, existing.pk)


class StartActionTests(RestorationActionTestBase):
    def test_starting_again_resumes_the_open_sitting(self):
        first = self.job.current_action
        self.job, again = start_action(self.job, self.user)
        self.assertEqual(again.pk, first.pk)
        self.assertEqual(again.grade, '')
        self.assertEqual(self.job.actions.count(), 1)

    def test_force_new_opens_another_sitting_on_the_item(self):
        first = self.job.current_action
        self.job, action = start_action(self.job, self.user, force_new=True)
        self.assertNotEqual(action.pk, first.pk)
        self.assertEqual(action.grade, '')
        self.assertEqual(self.job.current_action_id, action.pk)
        self.assertEqual(self.job.actions.count(), 2)

    def test_a_new_action_defaults_to_inspect_without_a_clock(self):
        self.job, action = start_action(self.job, self.user, force_new=True)
        self.assertEqual(action.category, RestorationAction.CATEGORY_INSPECT)
        self.assertEqual(action.description, '')
        self.assertEqual(action.seconds, 0)
        self.assertFalse(self.job.timer_is_running)

    def test_a_category_may_be_chosen_up_front(self):
        self.job, action = start_action(
            self.job, self.user, force_new=True, category='repair', description='swapped the board',
        )
        self.assertEqual(action.category, RestorationAction.CATEGORY_REPAIR)
        self.assertEqual(action.grade, '')

    def test_rejects_a_category_that_is_not_a_kind_of_work(self):
        with self.assertRaises(ValueError):
            start_action(self.job, self.user, force_new=True, category='pondering')

    def test_work_cannot_be_recorded_on_a_finished_item(self):
        self.job.stage = RestorationJob.STAGE_DONE
        self.job.save(update_fields=['stage'])
        with self.assertRaises(ValueError):
            start_action(self.job, self.user, force_new=True)


class DescriptionGateTests(RestorationActionTestBase):
    """Nothing is left unsaid: you cannot walk away from undescribed work."""

    def test_moving_on_from_undescribed_work_is_refused(self):
        self.job, _first = start_action(self.job, self.user, force_new=True)
        with self.assertRaises(ActionNeedsDescriptionError):
            start_action(self.job, self.user, force_new=True)

    def test_the_refusal_names_the_gap(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        with self.assertRaises(ActionNeedsDescriptionError) as caught:
            start_action(self.job, self.user, force_new=True)
        self.assertEqual(caught.exception.action_id, first.pk)
        self.assertIn('Say what you did', str(caught.exception))

    def test_describing_it_clears_the_way(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='thumbstick drifts')
        self.job.refresh_from_db()
        self.job, second = start_action(self.job, self.user, force_new=True)
        self.assertNotEqual(second.pk, first.pk)

    def test_whitespace_is_not_a_description(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='   ')
        self.job.refresh_from_db()
        with self.assertRaises(ActionNeedsDescriptionError):
            start_action(self.job, self.user, force_new=True)

    def test_resuming_the_same_work_is_never_blocked(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        self.job, again = start_action(self.job, self.user)
        self.assertEqual(again.pk, first.pk)


class DescribeActionTests(RestorationActionTestBase):
    def test_a_description_can_be_corrected_later(self):
        self.job, action = start_action(self.job, self.user)
        describe_action(self.job, action.pk, description='first guess')
        describe_action(self.job, action.pk, description='what actually happened')
        action.refresh_from_db()
        self.assertEqual(action.description, 'what actually happened')

    def test_the_category_can_be_corrected_as_the_work_reveals_itself(self):
        self.job, action = start_action(self.job, self.user)
        describe_action(self.job, action.pk, category='repair')
        action.refresh_from_db()
        self.assertEqual(action.category, RestorationAction.CATEGORY_REPAIR)

    def test_every_change_is_written_to_the_timeline(self):
        self.job, action = start_action(self.job, self.user)
        describe_action(self.job, action.pk, description='thumbstick drifts')
        self.assertTrue(self.job.timeline_events.filter(event_type='action.described').exists())

    def test_an_over_long_description_is_trimmed_rather_than_refused(self):
        self.job, action = start_action(self.job, self.user)
        describe_action(self.job, action.pk, description='x' * 5000)
        action.refresh_from_db()
        self.assertEqual(len(action.description), 2000)


class UndoActionTests(RestorationActionTestBase):
    def test_the_mistaken_row_disappears(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, wrong = start_action(self.job, self.user, force_new=True)

        self.job, landed = undo_last_action(self.job, self.user)
        self.assertFalse(self.job.actions.filter(pk=wrong.pk).exists())
        self.assertEqual(landed.pk, first.pk)
        self.assertEqual(self.job.current_action_id, first.pk)

    def test_the_action_it_lands_on_is_open_again(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _wrong = start_action(self.job, self.user, force_new=True)

        self.job, landed = undo_last_action(self.job, self.user)
        self.assertIsNone(landed.ended_at)

    def test_the_first_action_on_an_item_cannot_be_undone(self):
        with self.assertRaises(ValueError):
            undo_last_action(self.job, self.user)

    def test_undoing_twice_walks_back_two_actions(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _second = start_action(self.job, self.user, force_new=True)

        self.job, _landed = undo_last_action(self.job, self.user)
        self.job, landed = undo_last_action(self.job, self.user)
        self.assertEqual(self.job.actions.count(), 1)
        self.assertEqual(landed.description, RestorationAction.INITIAL_DESCRIPTION)

    def test_it_is_recorded_in_the_timeline(self):
        self.job, first = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        start_action(self.job, self.user, force_new=True)
        self.job.refresh_from_db()
        undo_last_action(self.job, self.user)
        self.assertTrue(self.job.timeline_events.filter(event_type='action.deleted').exists())


class DeleteActionTests(RestorationActionTestBase):
    def _three_actions(self):
        first = self.job.current_action
        self.job, second = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, second.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, third = start_action(self.job, self.user, force_new=True)
        describe_action(self.job, third.pk, description='looked at the hinge')
        self.job.refresh_from_db()
        return first, second, third

    def test_a_middle_row_is_removed(self):
        first, working, _repairable = self._three_actions()

        self.job, absorber = delete_action(self.job, working.pk, self.user)
        self.assertFalse(self.job.actions.filter(pk=working.pk).exists())
        self.assertEqual(absorber.pk, first.pk)

    def test_deleting_a_row_that_is_not_current_leaves_the_open_action(self):
        _first, working, repairable = self._three_actions()

        self.job, _absorber = delete_action(self.job, working.pk, self.user)
        self.assertEqual(self.job.current_action_id, repairable.pk)

    def test_a_finished_row_stays_finished_after_a_neighbour_is_deleted(self):
        first, working, _repairable = self._three_actions()

        delete_action(self.job, working.pk, self.user)
        first.refresh_from_db()
        self.assertIsNotNone(first.ended_at)

    def test_the_oldest_row_hands_current_to_the_next_if_it_was_current(self):
        first, working, _repairable = self._three_actions()

        self.job, absorber = delete_action(self.job, first.pk, self.user)
        self.assertEqual(absorber.pk, working.pk)

    def test_deleting_the_current_row_opens_the_neighbour(self):
        _first, working, repairable = self._three_actions()

        self.job, absorber = delete_action(self.job, repairable.pk, self.user)
        self.assertEqual(absorber.pk, working.pk)
        self.assertEqual(self.job.current_action_id, working.pk)
        self.assertIsNone(absorber.ended_at)

    def test_the_last_row_standing_cannot_be_deleted(self):
        only = self.job.current_action
        with self.assertRaises(ValueError):
            delete_action(self.job, only.pk, self.user)

    def test_a_row_that_is_not_on_this_item_is_refused(self):
        self._three_actions()
        with self.assertRaises(RestorationAction.DoesNotExist):
            delete_action(self.job, 999_999, self.user)

    def test_it_is_recorded_in_the_timeline(self):
        _first, working, _repairable = self._three_actions()

        delete_action(self.job, working.pk, self.user)
        self.job.refresh_from_db()
        event = self.job.timeline_events.filter(event_type='action.deleted').first()
        self.assertIsNotNone(event)
        self.assertEqual(event.payload['returned_to_action_id'], _first.pk)


class ActionEndpointTests(RestorationActionTestBase):
    def _post(self, path, payload):
        return self.client.post(
            f'/api/inventory/restoration-jobs/{self.job.pk}/{path}/', payload, format='json',
        )

    def test_lists_what_has_been_done(self):
        resp = self.client.get(f'/api/inventory/restoration-jobs/{self.job.pk}/actions/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(resp.data['results']), 1)
        self.assertEqual(resp.data['current_action_id'], self.job.current_action_id)

    def test_starting_work_through_the_api(self):
        resp = self._post('start-action', {'force_new': True, 'category': 'test'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.current_action.grade, '')
        self.assertEqual(self.job.current_action.category, RestorationAction.CATEGORY_TEST)

    def test_the_description_gate_answers_with_a_code_the_bench_can_act_on(self):
        self._post('start-action', {'force_new': True})
        resp = self._post('start-action', {'force_new': True})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'action_needs_description')
        self.assertIn('action_id', resp.data)

    def test_describing_through_the_api(self):
        self._post('start-action', {'force_new': True})
        self.job.refresh_from_db()
        resp = self._post(
            'describe-action',
            {'action_id': self.job.current_action_id, 'description': 'thumbstick drifts'},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.current_action.description, 'thumbstick drifts')

    def test_cannot_describe_an_action_on_someone_else_s_item(self):
        resp = self._post('describe-action', {'action_id': 999999, 'description': 'nope'})
        self.assertEqual(resp.status_code, 404)

    def test_an_unknown_category_is_refused(self):
        resp = self._post('start-action', {'force_new': True, 'category': 'pondering'})
        self.assertEqual(resp.status_code, 400)

    def test_undoing_through_the_api(self):
        self._post('start-action', {'force_new': True, 'description': 'checked the ports'})
        self._post('start-action', {'force_new': True})
        resp = self._post('undo-action', {})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.current_action.grade, '')
        self.assertEqual(self.job.actions.count(), 2)

    def test_undo_is_refused_when_there_is_only_the_first_action(self):
        resp = self._post('undo-action', {})
        self.assertEqual(resp.status_code, 400)

    def test_deleting_a_row_through_the_api(self):
        self._post('start-action', {'force_new': True, 'description': 'checked the ports'})
        self._post('start-action', {'force_new': True, 'description': 'looked at the hinge'})
        self.job.refresh_from_db()
        middle = self.job.actions.order_by('started_at', 'id')[1]

        resp = self._post('delete-action', {'action_id': middle.pk})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.actions.count(), 2)
        self.assertFalse(self.job.actions.filter(pk=middle.pk).exists())

    def test_deleting_the_only_row_is_refused(self):
        resp = self._post('delete-action', {'action_id': self.job.current_action_id})
        self.assertEqual(resp.status_code, 400)

    def test_deleting_a_row_that_is_not_on_this_item_is_a_404(self):
        resp = self._post('delete-action', {'action_id': 999_999})
        self.assertEqual(resp.status_code, 404)

    def test_going_back_to_the_queue_records_why(self):
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{self.job.pk}/move-back-to-queue/',
            {'note': 'missing the power brick'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.queue_note, '{Sent Back to Queue}: missing the power brick')

    def test_going_back_to_the_queue_keeps_the_item_note(self):
        self.job.queue_note = 'Hinge is loose'
        self.job.save(update_fields=['queue_note'])
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{self.job.pk}/move-back-to-queue/',
            {'note': 'missing the power brick'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(
            self.job.queue_note,
            'Hinge is loose\n{Sent Back to Queue}: missing the power brick',
        )
