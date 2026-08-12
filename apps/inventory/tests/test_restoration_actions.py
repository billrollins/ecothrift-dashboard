"""Actions: what was done, where the time went, and why.

The three rules under test are the ones the log depends on. The clock is never
homeless, a pause is not a new action, and nothing is left unsaid.
"""

from apps.inventory.models import RestorationAction, RestorationJob
from apps.inventory.services.restoration_actions import (
    ActionNeedsDescriptionError,
    action_totals,
    describe_action,
    ensure_initial_action,
    start_action,
    undo_last_action,
)
from apps.inventory.services.restoration_bench import (
    check_in_restoration_job,
    pause_restoration_timer,
)

from .test_restoration_queue import RestorationQueueTestBase


class RestorationActionTestBase(RestorationQueueTestBase):
    def setUp(self):
        super().setUp()
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.job = check_in_restoration_job(self.job, self.user, start_timer=False)

    def _age_timer(self, seconds):
        """Pretend the running clock started `seconds` ago."""

        from datetime import timedelta

        from django.utils import timezone

        RestorationJob.objects.filter(pk=self.job.pk).update(
            timer_started_at=timezone.now() - timedelta(seconds=seconds),
        )
        self.job.refresh_from_db()


class InitialActionTests(RestorationActionTestBase):
    def test_an_item_arrives_with_somewhere_for_time_to_go(self):
        self.assertIsNotNone(self.job.current_action_id)
        action = self.job.current_action
        self.assertEqual(action.grade, '')
        self.assertEqual(action.category, RestorationAction.CATEGORY_INSPECT)

    def test_the_first_action_is_already_described_so_it_never_blocks(self):
        self.assertTrue(self.job.current_action.is_described)

    def test_opening_one_twice_does_not_make_two(self):
        first = self.job.current_action
        again = ensure_initial_action(self.job, self.user)
        self.assertEqual(again.pk, first.pk)
        self.assertEqual(self.job.actions.count(), 1)

    def test_adopts_an_orphaned_action_rather_than_opening_another(self):
        existing = self.job.current_action
        RestorationJob.objects.filter(pk=self.job.pk).update(current_action=None)
        self.job.refresh_from_db()
        self.assertEqual(ensure_initial_action(self.job, self.user).pk, existing.pk)


class StartActionTests(RestorationActionTestBase):
    def test_working_a_grade_opens_an_action_on_it(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        self.assertEqual(action.grade, 'Working')
        self.assertEqual(self.job.current_action_id, action.pk)
        self.assertEqual(self.job.actions.count(), 2)

    def test_a_new_action_defaults_to_inspect_and_starts_the_clock_at_once(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        self.assertEqual(action.category, RestorationAction.CATEGORY_INSPECT)
        self.assertEqual(action.description, '')
        self.assertTrue(self.job.timer_is_running)

    def test_returning_to_the_same_grade_resumes_rather_than_splitting(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        self.job, again = start_action(self.job, self.user, grade='Working')
        self.assertEqual(again.pk, first.pk)
        self.assertEqual(self.job.actions.count(), 2)

    def test_turning_to_another_grade_opens_a_new_action(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()

        self.job, second = start_action(self.job, self.user, grade='Repairable')
        self.assertNotEqual(second.pk, first.pk)
        first.refresh_from_db()
        self.assertIsNotNone(first.ended_at)

    def test_turning_back_to_the_item_as_a_whole_opens_a_new_action(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()

        self.job, back = start_action(self.job, self.user, grade='')
        self.assertEqual(back.grade, '')
        self.assertNotEqual(back.pk, first.pk)

    def test_a_category_may_be_chosen_up_front(self):
        self.job, action = start_action(
            self.job, self.user, grade='Working', category='repair', description='swapped the board',
        )
        self.assertEqual(action.category, RestorationAction.CATEGORY_REPAIR)

    def test_rejects_a_category_that_is_not_a_kind_of_work(self):
        with self.assertRaises(ValueError):
            start_action(self.job, self.user, grade='Working', category='pondering')

    def test_rejects_a_grade_that_is_not_on_the_scale(self):
        with self.assertRaises(ValueError):
            start_action(self.job, self.user, grade='Mint In Box')

    def test_work_cannot_be_recorded_on_a_finished_item(self):
        self.job.stage = RestorationJob.STAGE_DONE
        self.job.save(update_fields=['stage'])
        with self.assertRaises(ValueError):
            start_action(self.job, self.user, grade='Working')


class DescriptionGateTests(RestorationActionTestBase):
    """Nothing is left unsaid: you cannot walk away from undescribed work."""

    def test_moving_on_from_undescribed_work_is_refused(self):
        self.job, _first = start_action(self.job, self.user, grade='Working')
        with self.assertRaises(ActionNeedsDescriptionError):
            start_action(self.job, self.user, grade='Repairable')

    def test_the_refusal_names_where_the_gap_is(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        with self.assertRaises(ActionNeedsDescriptionError) as caught:
            start_action(self.job, self.user, grade='Repairable')
        self.assertEqual(caught.exception.action_id, first.pk)
        self.assertIn('Working', str(caught.exception))

    def test_describing_it_clears_the_way(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='thumbstick drifts')
        self.job.refresh_from_db()
        self.job, second = start_action(self.job, self.user, grade='Repairable')
        self.assertNotEqual(second.pk, first.pk)

    def test_whitespace_is_not_a_description(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='   ')
        self.job.refresh_from_db()
        with self.assertRaises(ActionNeedsDescriptionError):
            start_action(self.job, self.user, grade='Repairable')

    def test_resuming_the_same_work_is_never_blocked(self):
        """The gate is about moving on, not about pausing."""

        self.job, first = start_action(self.job, self.user, grade='Working')
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()
        self.job, again = start_action(self.job, self.user, grade='Working')
        self.assertEqual(again.pk, first.pk)


class ActionTimeTests(RestorationActionTestBase):
    def test_time_is_banked_against_the_action_it_was_spent_on(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        self._age_timer(600)
        pause_restoration_timer(self.job)

        action.refresh_from_db()
        self.assertEqual(action.seconds, 600)

    def test_switching_work_splits_the_time_between_the_two_actions(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        self._age_timer(300)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()

        self.job, second = start_action(self.job, self.user, grade='Repairable')
        self._age_timer(120)
        pause_restoration_timer(self.job)

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.seconds, 300)
        self.assertEqual(second.seconds, 120)

    def test_the_actions_account_for_the_whole_of_the_job_total(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        self._age_timer(300)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _second = start_action(self.job, self.user, grade='Repairable')
        self._age_timer(120)
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        self.assertEqual(action_totals(self.job)['total_seconds'], self.job.active_seconds)

    def test_a_pause_and_resume_keeps_adding_to_one_action(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        self._age_timer(200)
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        self.job, _same = start_action(self.job, self.user, grade='Working')
        self._age_timer(100)
        pause_restoration_timer(self.job)

        action.refresh_from_db()
        self.assertEqual(action.seconds, 300)

    def test_grade_work_is_charged_to_the_grade_and_item_work_to_the_item(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        self._age_timer(300)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()

        self.job, _whole = start_action(self.job, self.user, grade='')
        self._age_timer(120)
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        self.assertEqual(self.job.work_seconds, 300)
        self.assertEqual(self.job.look_seconds, 120)

    def test_totals_are_reported_by_scope_and_by_category(self):
        self.job, first = start_action(self.job, self.user, grade='Working', category='test')
        self._age_timer(300)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _second = start_action(self.job, self.user, grade='Repairable', category='repair')
        self._age_timer(120)
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        totals = action_totals(self.job)
        self.assertEqual(totals['by_grade']['Working'], 300)
        self.assertEqual(totals['by_grade']['Repairable'], 120)
        self.assertEqual(totals['by_category']['test'], 300)
        self.assertEqual(totals['by_category']['repair'], 120)

    def test_relabelling_resumed_work_relabels_all_of_its_time(self):
        """One action holds one category, so a correction applies to the whole of it."""

        self.job, action = start_action(self.job, self.user, grade='Working', category='test')
        self._age_timer(300)
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        self.job, same = start_action(self.job, self.user, grade='Working', category='repair')
        self.assertEqual(same.pk, action.pk)
        self._age_timer(120)
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        totals = action_totals(self.job)
        self.assertEqual(totals['by_category']['repair'], 420)
        self.assertNotIn('test', totals['by_category'])


class DescribeActionTests(RestorationActionTestBase):
    def test_a_description_can_be_corrected_later(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, action.pk, description='first guess')
        describe_action(self.job, action.pk, description='what actually happened')
        action.refresh_from_db()
        self.assertEqual(action.description, 'what actually happened')

    def test_the_category_can_be_corrected_as_the_work_reveals_itself(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, action.pk, category='repair')
        action.refresh_from_db()
        self.assertEqual(action.category, RestorationAction.CATEGORY_REPAIR)

    def test_every_change_is_written_to_the_timeline(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, action.pk, description='thumbstick drifts')
        self.assertTrue(self.job.timeline_events.filter(event_type='action.described').exists())

    def test_an_over_long_description_is_trimmed_rather_than_refused(self):
        self.job, action = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, action.pk, description='x' * 5000)
        action.refresh_from_db()
        self.assertEqual(len(action.description), 2000)


class UndoActionTests(RestorationActionTestBase):
    """Undo hands the time back rather than throwing it away."""

    def test_the_mistaken_row_disappears(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, wrong = start_action(self.job, self.user, grade='Repairable')

        self.job, landed = undo_last_action(self.job, self.user)
        self.assertFalse(self.job.actions.filter(pk=wrong.pk).exists())
        self.assertEqual(landed.pk, first.pk)
        self.assertEqual(self.job.current_action_id, first.pk)

    def test_its_time_goes_to_the_action_it_was_taken_from(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        self._age_timer(300)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _wrong = start_action(self.job, self.user, grade='Repairable')
        self._age_timer(90)

        self.job, _landed = undo_last_action(self.job, self.user)
        first.refresh_from_db()
        self.assertEqual(first.seconds, 390)

    def test_the_job_total_is_untouched(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        self._age_timer(300)
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _wrong = start_action(self.job, self.user, grade='Repairable')
        self._age_timer(90)
        self.job.refresh_from_db()

        self.job, _landed = undo_last_action(self.job, self.user)
        self.job.refresh_from_db()
        self.assertEqual(action_totals(self.job)['total_seconds'], self.job.active_seconds)

    def test_time_moves_between_buckets_when_the_scope_differs(self):
        """Undoing grade work back onto item work re-files the seconds."""

        self.job, first = start_action(self.job, self.user, grade='')
        self._age_timer(200)
        describe_action(self.job, first.pk, description='opened it up')
        self.job.refresh_from_db()
        self.job, _wrong = start_action(self.job, self.user, grade='Working')
        self._age_timer(100)

        self.job, _landed = undo_last_action(self.job, self.user)
        self.job.refresh_from_db()
        self.assertEqual(self.job.work_seconds, 0)
        self.assertEqual(self.job.look_seconds, 300)

    def test_the_clock_keeps_running_if_it_was(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _wrong = start_action(self.job, self.user, grade='Repairable')

        self.job, _landed = undo_last_action(self.job, self.user)
        self.assertTrue(self.job.timer_is_running)
        self.assertEqual(self.job.timer_grade, 'Working')

    def test_the_clock_stays_stopped_if_it_was(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _wrong = start_action(self.job, self.user, grade='Repairable')
        pause_restoration_timer(self.job)
        self.job.refresh_from_db()

        self.job, _landed = undo_last_action(self.job, self.user)
        self.assertFalse(self.job.timer_is_running)
        self.assertEqual(self.job.timer_grade, 'Working')

    def test_the_action_it_lands_on_is_open_again(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _wrong = start_action(self.job, self.user, grade='Repairable')

        self.job, landed = undo_last_action(self.job, self.user)
        self.assertIsNone(landed.ended_at)

    def test_the_first_action_on_an_item_cannot_be_undone(self):
        with self.assertRaises(ValueError):
            undo_last_action(self.job, self.user)

    def test_undoing_twice_walks_back_two_actions(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        self.job, _second = start_action(self.job, self.user, grade='Repairable')

        self.job, _landed = undo_last_action(self.job, self.user)
        self.job, landed = undo_last_action(self.job, self.user)
        self.assertEqual(self.job.actions.count(), 1)
        self.assertEqual(landed.description, RestorationAction.INITIAL_DESCRIPTION)

    def test_it_is_recorded_in_the_timeline(self):
        self.job, first = start_action(self.job, self.user, grade='Working')
        describe_action(self.job, first.pk, description='checked the ports')
        self.job.refresh_from_db()
        start_action(self.job, self.user, grade='Repairable')
        self.job.refresh_from_db()
        undo_last_action(self.job, self.user)
        self.assertTrue(self.job.timeline_events.filter(event_type='action.undone').exists())


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
        resp = self._post('start-action', {'grade': 'Working', 'category': 'test'})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.current_action.grade, 'Working')

    def test_the_description_gate_answers_with_a_code_the_bench_can_act_on(self):
        self._post('start-action', {'grade': 'Working'})
        resp = self._post('start-action', {'grade': 'Repairable'})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data['code'], 'action_needs_description')
        self.assertIn('action_id', resp.data)

    def test_describing_through_the_api(self):
        self._post('start-action', {'grade': 'Working'})
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
        resp = self._post('start-action', {'grade': 'Working', 'category': 'pondering'})
        self.assertEqual(resp.status_code, 400)

    def test_undoing_through_the_api(self):
        self._post('start-action', {'grade': 'Working', 'description': 'checked the ports'})
        self._post('start-action', {'grade': 'Repairable'})
        resp = self._post('undo-action', {})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.current_action.grade, 'Working')
        self.assertEqual(self.job.actions.count(), 2)

    def test_undo_is_refused_when_there_is_only_the_first_action(self):
        resp = self._post('undo-action', {})
        self.assertEqual(resp.status_code, 400)

    def test_going_back_to_the_queue_records_why(self):
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{self.job.pk}/move-back-to-queue/',
            {'note': 'missing the power brick'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job.refresh_from_db()
        self.assertEqual(self.job.queue_note, 'missing the power brick')
