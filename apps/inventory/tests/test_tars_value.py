"""What restoration earned — time attribution, stamped value, scoreboard.

Investigation is charged to the item and performance to a grade, so the two
buckets must always account for the whole clock. Value added is frozen at
completion, and where it cannot be computed honestly it stays null rather than
guessing.
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.inventory.models import RestorationJob
from apps.inventory.services.restoration_bench import (
    adjust_restoration_timer,
    check_in_restoration_job,
    complete_restoration_job,
    pause_restoration_timer,
    start_restoration_timer,
)
from apps.inventory.services.tars_value import (
    build_restoration_scoreboard,
    compute_value_added,
    starting_grade_from_session,
    sync_starting_grade,
)

from .test_restoration_queue import FUNCTIONAL_GRADES, RestorationQueueTestBase


class TarsTimerAttributionTests(RestorationQueueTestBase):
    """Every second lands in exactly one bucket, and the buckets add up."""

    def setUp(self):
        super().setUp()
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.assertEqual(resp.status_code, 200, resp.data)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        self.job.stage = RestorationJob.STAGE_BENCH
        self.job.save(update_fields=['stage'])

    def _run_for(self, seconds: int) -> None:
        """Backdate the running clock instead of sleeping."""

        self.job.refresh_from_db()
        self.job.timer_started_at = timezone.now() - timedelta(seconds=seconds)
        self.job.save(update_fields=['timer_started_at'])

    def test_defaults_to_looking_with_no_grade(self):
        self.assertEqual(self.job.timer_mode, RestorationJob.TIMER_MODE_LOOK)
        self.assertEqual(self.job.timer_grade, '')
        self.assertEqual(self.job.look_seconds, 0)
        self.assertEqual(self.job.work_seconds, 0)

    def test_looking_time_is_charged_to_the_item(self):
        start_restoration_timer(self.job, user=self.user)
        self._run_for(120)
        job = pause_restoration_timer(self.job, user=self.user)

        self.assertGreaterEqual(job.look_seconds, 120)
        self.assertEqual(job.work_seconds, 0)
        self.assertEqual(job.look_seconds + job.work_seconds, job.active_seconds)

    def test_working_time_is_charged_to_its_grade(self):
        start_restoration_timer(
            self.job, user=self.user, mode=RestorationJob.TIMER_MODE_WORK, grade='Working',
        )
        self._run_for(60)
        job = pause_restoration_timer(self.job, user=self.user)

        self.assertGreaterEqual(job.work_seconds, 60)
        self.assertEqual(job.look_seconds, 0)
        self.assertEqual(job.timer_grade, 'Working')

    def test_switching_mode_banks_the_previous_attribution(self):
        """The seconds already spent looking must not be relabelled as work."""

        start_restoration_timer(self.job, user=self.user)
        self._run_for(100)
        start_restoration_timer(
            self.job, user=self.user, mode=RestorationJob.TIMER_MODE_WORK, grade='Working',
        )

        job = RestorationJob.objects.get(pk=self.job.pk)
        self.assertGreaterEqual(job.look_seconds, 100)
        self.assertEqual(job.work_seconds, 0)
        self.assertTrue(job.timer_is_running)

        self._run_for(50)
        job = pause_restoration_timer(job, user=self.user)
        self.assertGreaterEqual(job.look_seconds, 100)
        self.assertGreaterEqual(job.work_seconds, 50)
        self.assertEqual(job.look_seconds + job.work_seconds, job.active_seconds)

    def test_switching_grade_splits_work_between_grades(self):
        start_restoration_timer(
            self.job, user=self.user, mode=RestorationJob.TIMER_MODE_WORK, grade='Working',
        )
        self._run_for(90)
        start_restoration_timer(
            self.job, user=self.user, mode=RestorationJob.TIMER_MODE_WORK, grade='Repairable',
        )

        job = RestorationJob.objects.get(pk=self.job.pk)
        self.assertEqual(job.timer_grade, 'Repairable')
        self.assertGreaterEqual(job.work_seconds, 90)

    def test_looking_clears_the_grade(self):
        """Looking belongs to the item, so it cannot carry a grade."""

        start_restoration_timer(
            self.job, user=self.user, mode=RestorationJob.TIMER_MODE_WORK, grade='Working',
        )
        start_restoration_timer(self.job, user=self.user, mode=RestorationJob.TIMER_MODE_LOOK)

        job = RestorationJob.objects.get(pk=self.job.pk)
        self.assertEqual(job.timer_grade, '')

    def test_unknown_mode_is_rejected(self):
        with self.assertRaises(ValueError):
            start_restoration_timer(self.job, user=self.user, mode='daydreaming')

    def test_adjusting_the_total_keeps_the_buckets_consistent(self):
        start_restoration_timer(self.job, user=self.user)
        self._run_for(300)
        job = pause_restoration_timer(self.job, user=self.user)

        job = adjust_restoration_timer(job, active_seconds=600, user=self.user)
        self.assertEqual(job.look_seconds + job.work_seconds, 600)

        job = adjust_restoration_timer(job, active_seconds=60, user=self.user)
        self.assertEqual(job.look_seconds + job.work_seconds, 60)

    def test_adjusting_down_past_one_bucket_drains_the_other(self):
        start_restoration_timer(
            self.job, user=self.user, mode=RestorationJob.TIMER_MODE_WORK, grade='Working',
        )
        self._run_for(200)
        job = pause_restoration_timer(self.job, user=self.user)
        start_restoration_timer(job, user=self.user, mode=RestorationJob.TIMER_MODE_LOOK)
        self._run_for(200)
        job = pause_restoration_timer(job, user=self.user)

        job = adjust_restoration_timer(job, active_seconds=10, user=self.user)
        self.assertEqual(job.look_seconds + job.work_seconds, 10)
        self.assertGreaterEqual(job.look_seconds, 0)
        self.assertGreaterEqual(job.work_seconds, 0)

    def test_pausing_a_stopped_clock_adds_nothing(self):
        job = pause_restoration_timer(self.job, user=self.user)
        self.assertEqual(job.look_seconds, 0)
        self.assertEqual(job.work_seconds, 0)

    def test_timer_start_endpoint_accepts_a_mode_and_grade(self):
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{self.job.pk}/timer/start/',
            {'mode': 'work', 'grade': 'Working'},
            format='json',
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['timer_mode'], 'work')
        self.assertEqual(resp.data['timer_grade'], 'Working')

    def test_timer_start_endpoint_rejects_a_bad_mode(self):
        resp = self.client.post(
            f'/api/inventory/restoration-jobs/{self.job.pk}/timer/start/',
            {'mode': 'nonsense'},
            format='json',
        )
        self.assertEqual(resp.status_code, 400, resp.data)


class TarsStartingGradeTests(RestorationQueueTestBase):
    """The datum is mirrored onto the row so it can be reported on."""

    def setUp(self):
        super().setUp()
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])

    def test_reads_the_current_grade_from_the_decision_work(self):
        session = {'decisionWork': {'condition': {'currentGrade': 'Repairable'}}}
        self.assertEqual(starting_grade_from_session(session), 'Repairable')

    def test_tolerates_every_shape_of_missing(self):
        for session in (None, {}, {'decisionWork': None}, {'decisionWork': {}},
                        {'decisionWork': {'condition': 'nope'}},
                        {'decisionWork': {'condition': {}}}):
            self.assertEqual(starting_grade_from_session(session), '')

    def test_sync_reports_whether_it_changed(self):
        self.job.work_session = {'decisionWork': {'condition': {'currentGrade': 'Repairable'}}}
        self.assertTrue(sync_starting_grade(self.job))
        self.assertEqual(self.job.starting_grade, 'Repairable')
        self.assertFalse(sync_starting_grade(self.job))

    def test_a_correction_moves_the_datum(self):
        self.job.starting_grade = 'Parts-only'
        self.job.work_session = {'decisionWork': {'condition': {'currentGrade': 'Repairable'}}}
        self.assertTrue(sync_starting_grade(self.job))
        self.assertEqual(self.job.starting_grade, 'Repairable')

    def test_an_empty_grade_never_erases_a_recorded_datum(self):
        self.job.starting_grade = 'Repairable'
        self.job.work_session = {'decisionWork': {'condition': {'currentGrade': ''}}}
        self.assertFalse(sync_starting_grade(self.job))
        self.assertEqual(self.job.starting_grade, 'Repairable')


class TarsValueAddedTests(RestorationQueueTestBase):
    """Value added is forward-looking, parts-net, and frozen once earned."""

    def setUp(self):
        super().setUp()
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])

    def test_gain_between_grades_less_parts(self):
        self.job.starting_grade = 'Parts-only'
        self.job.spent_parts_cost = Decimal('2.00')
        value = compute_value_added(self.job, final_grade='Working')
        # 19.99 working - 5.00 parts-only - 2.00 spent
        self.assertEqual(value, Decimal('12.99'))

    def test_no_starting_grade_means_unmeasured_rather_than_inflated(self):
        self.job.starting_grade = ''
        self.assertIsNone(compute_value_added(self.job, final_grade='Working'))

    def test_a_grade_outside_the_scale_is_unmeasured(self):
        self.job.starting_grade = 'Parts-only'
        self.assertIsNone(compute_value_added(self.job, final_grade='Invented'))

    def test_going_backwards_is_allowed_to_be_negative(self):
        self.job.starting_grade = 'Working'
        value = compute_value_added(self.job, final_grade='Parts-only')
        self.assertEqual(value, Decimal('-14.99'))

    def test_junk_grade_values_do_not_raise(self):
        self.job.grade_values = {'Working': 'not a number', 'Parts-only': None}
        self.job.starting_grade = 'Parts-only'
        self.assertIsNone(compute_value_added(self.job, final_grade='Working'))

    def test_completion_stamps_the_value(self):
        self.job.starting_grade = 'Parts-only'
        self.job.save(update_fields=['starting_grade'])
        check_in_restoration_job(self.job, user=self.user, start_timer=False)
        job = complete_restoration_job(
            self.job,
            destination=RestorationJob.BENCH_DISPOSITION_PROCESSING,
            final_grade='Working',
            spent_parts_cost=Decimal('2.00'),
            user=self.user,
        )
        self.assertEqual(job.value_added, Decimal('12.99'))

    def test_a_later_edit_to_the_scale_does_not_rewrite_history(self):
        self.job.starting_grade = 'Parts-only'
        self.job.save(update_fields=['starting_grade'])
        check_in_restoration_job(self.job, user=self.user, start_timer=False)
        job = complete_restoration_job(
            self.job,
            destination=RestorationJob.BENCH_DISPOSITION_PROCESSING,
            final_grade='Working',
            spent_parts_cost=Decimal('0'),
            user=self.user,
        )
        stamped = job.value_added

        job.grade_values = {**FUNCTIONAL_GRADES, 'Working': 500.0}
        job.save(update_fields=['grade_values'])
        job.refresh_from_db()
        self.assertEqual(job.value_added, stamped)


class TarsScoreboardTests(RestorationQueueTestBase):
    """The at-a-glance numbers, including when there is nothing to show."""

    def _finish(self, *, value, seconds, days_ago=0, measured=True):
        order, pr, product = self._restoration_order(order_number=f'PO-{timezone.now().timestamp()}')
        resp = self._check_in_restoration(order, pr, product)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        job.stage = RestorationJob.STAGE_DONE
        job.dispositioned_at = timezone.now() - timedelta(days=days_ago)
        job.value_added = Decimal(str(value)) if measured else None
        job.look_seconds = seconds
        job.work_seconds = 0
        job.active_seconds = seconds
        job.save()
        return job

    def test_empty_is_honest_rather_than_zero_dollars_an_hour(self):
        board = build_restoration_scoreboard()
        self.assertEqual(board['today']['items'], 0)
        self.assertEqual(board['today']['value_added'], '0.00')
        self.assertIsNone(board['today']['per_hour'])
        self.assertIsNone(board['benchmark_rate'])
        self.assertFalse(board['benchmark_ready'])

    def test_records_the_floor_rate(self):
        self.assertEqual(build_restoration_scoreboard()['floor_rate'], '20.00')

    def test_rate_is_value_over_hours_including_looking(self):
        self._finish(value='30.00', seconds=3600)
        board = build_restoration_scoreboard()
        self.assertEqual(board['today']['value_added'], '30.00')
        self.assertEqual(board['today']['items'], 1)
        self.assertEqual(board['today']['per_hour'], '30.00')

    def test_unmeasured_jobs_are_counted_but_never_priced(self):
        self._finish(value='60.00', seconds=3600)
        self._finish(value=None, seconds=3600, measured=False)
        board = build_restoration_scoreboard()
        self.assertEqual(board['today']['items'], 2)
        self.assertEqual(board['today']['items_measured'], 1)
        self.assertEqual(board['today']['items_unmeasured'], 1)
        # The unmeasured hour must not dilute the rate it contributed nothing to.
        self.assertEqual(board['today']['per_hour'], '60.00')

    def test_a_job_with_no_recorded_time_does_not_divide_by_zero(self):
        self._finish(value='40.00', seconds=0)
        board = build_restoration_scoreboard()
        self.assertEqual(board['today']['value_added'], '40.00')
        self.assertIsNone(board['today']['per_hour'])

    def test_four_week_window_averages_by_week(self):
        for days_ago in (0, 7, 14, 21):
            self._finish(value='70.00', seconds=3600, days_ago=days_ago)
        board = build_restoration_scoreboard()
        self.assertEqual(board['four_week']['items'], 4)
        self.assertEqual(board['four_week']['value_added'], '280.00')
        self.assertEqual(board['four_week']['weekly_average_value'], '70.00')
        self.assertEqual(board['four_week']['weekly_average_items'], '1.00')

    def test_work_older_than_the_window_is_excluded(self):
        self._finish(value='90.00', seconds=3600, days_ago=60)
        board = build_restoration_scoreboard()
        self.assertEqual(board['four_week']['items'], 0)

    def test_benchmark_waits_for_enough_jobs_to_mean_something(self):
        for _ in range(9):
            self._finish(value='50.00', seconds=3600)
        self.assertIsNone(build_restoration_scoreboard()['benchmark_rate'])

        self._finish(value='50.00', seconds=3600)
        board = build_restoration_scoreboard()
        self.assertTrue(board['benchmark_ready'])
        self.assertEqual(board['benchmark_rate'], '50.00')

    def test_daily_series_covers_a_fortnight_with_gaps_filled(self):
        self._finish(value='25.00', seconds=1800)
        board = build_restoration_scoreboard()
        self.assertEqual(len(board['days']), 14)
        self.assertEqual(board['days'][-1]['items'], 1)
        self.assertEqual(board['days'][0]['items'], 0)
        self.assertEqual(board['days'][0]['value_added'], '0.00')

    def test_endpoint_serves_the_board(self):
        self._finish(value='10.00', seconds=3600)
        resp = self.client.get('/api/inventory/restoration-jobs/scoreboard/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['today']['items'], 1)
        self.assertEqual(resp.data['floor_rate'], '20.00')
