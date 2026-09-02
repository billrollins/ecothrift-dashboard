"""What restoration earned - stamped value and the Overview scoreboard.

Value added is frozen at completion, and where it cannot be computed honestly
it stays null rather than guessing.
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.inventory.models import RestorationJob
from apps.inventory.services.restoration_bench import (
    check_in_restoration_job,
    complete_restoration_job,
)
from apps.inventory.services.tars_value import (
    build_restoration_scoreboard,
    compute_value_added,
    starting_grade_from_session,
    sync_starting_grade,
)

from .test_restoration_queue import FUNCTIONAL_GRADES, RestorationQueueTestBase


class TarsStartingGradeTests(RestorationQueueTestBase):
    """The datum is mirrored onto the row so it can be reported on."""

    def setUp(self):
        super().setUp()
        order, pr, product = self._restoration_order()
        resp = self._check_in_restoration(order, pr, product)
        self.job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])

    def test_reads_the_datum_the_bench_writes(self):
        session = {'benchPlan': {'startingGrade': 'Repairable'}}
        self.assertEqual(starting_grade_from_session(session), 'Repairable')

    def test_still_reads_jobs_the_retired_cockpit_touched(self):
        session = {'decisionWork': {'condition': {'currentGrade': 'Repairable'}}}
        self.assertEqual(starting_grade_from_session(session), 'Repairable')

    def test_the_bench_wins_over_the_retired_cockpit(self):
        session = {
            'benchPlan': {'startingGrade': 'Working'},
            'decisionWork': {'condition': {'currentGrade': 'Repairable'}},
        }
        self.assertEqual(starting_grade_from_session(session), 'Working')

    def test_tolerates_every_shape_of_missing(self):
        for session in (None, {}, {'decisionWork': None}, {'decisionWork': {}},
                        {'decisionWork': {'condition': 'nope'}},
                        {'decisionWork': {'condition': {}}},
                        {'benchPlan': None}, {'benchPlan': {}},
                        {'benchPlan': {'startingGrade': ''}}):
            self.assertEqual(starting_grade_from_session(session), '')

    def test_sync_reports_whether_it_changed(self):
        self.job.work_session = {'benchPlan': {'startingGrade': 'Repairable'}}
        self.assertTrue(sync_starting_grade(self.job))
        self.assertEqual(self.job.starting_grade, 'Repairable')
        self.assertFalse(sync_starting_grade(self.job))

    def test_a_correction_moves_the_datum(self):
        self.job.starting_grade = 'Parts-only'
        self.job.work_session = {'benchPlan': {'startingGrade': 'Repairable'}}
        self.assertTrue(sync_starting_grade(self.job))
        self.assertEqual(self.job.starting_grade, 'Repairable')

    def test_an_empty_grade_never_erases_a_recorded_datum(self):
        self.job.starting_grade = 'Repairable'
        self.job.work_session = {'benchPlan': {'startingGrade': ''}}
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

    def test_session_current_grade_does_not_change_the_stamp(self):
        self.job.starting_grade = 'Parts-only'
        self.job.spent_parts_cost = Decimal('2.00')
        self.job.work_session = {
            'benchPlan': {'startingGrade': 'Parts-only', 'currentGrade': 'Working'},
        }
        value = compute_value_added(self.job, final_grade='Working')
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
        check_in_restoration_job(self.job, user=self.user)
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
        check_in_restoration_job(self.job, user=self.user)
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

    def _finish(self, *, value, days_ago=0, measured=True):
        order, pr, product = self._restoration_order(order_number=f'PO-{timezone.now().timestamp()}')
        resp = self._check_in_restoration(order, pr, product)
        job = RestorationJob.objects.get(item_check_in_id=resp.data['item_check_in_id'])
        job.stage = RestorationJob.STAGE_DONE
        job.dispositioned_at = timezone.now() - timedelta(days=days_ago)
        job.value_added = Decimal(str(value)) if measured else None
        job.save()
        return job

    def test_empty_is_honest_rather_than_zero_dollars(self):
        board = build_restoration_scoreboard()
        self.assertEqual(board['today']['items'], 0)
        self.assertEqual(board['today']['value_added'], '0.00')
        self.assertNotIn('per_hour_while_working', board)
        self.assertNotIn('floor_rate', board)

    def test_value_added_is_summed_for_the_day(self):
        self._finish(value='30.00')
        board = build_restoration_scoreboard()
        self.assertEqual(board['today']['value_added'], '30.00')
        self.assertEqual(board['today']['items'], 1)

    def test_unmeasured_jobs_are_counted_but_never_priced(self):
        self._finish(value='60.00')
        self._finish(value=None, measured=False)
        board = build_restoration_scoreboard()
        self.assertEqual(board['today']['items'], 2)
        self.assertEqual(board['today']['items_measured'], 1)
        self.assertEqual(board['today']['items_unmeasured'], 1)
        self.assertEqual(board['today']['value_added'], '60.00')

    def test_four_week_window_averages_by_week(self):
        for days_ago in (0, 7, 14, 21):
            self._finish(value='70.00', days_ago=days_ago)
        board = build_restoration_scoreboard()
        self.assertEqual(board['four_week']['items'], 4)
        self.assertEqual(board['four_week']['value_added'], '280.00')
        self.assertEqual(board['four_week']['weekly_average_value'], '70.00')
        self.assertEqual(board['four_week']['weekly_average_items'], '1.00')

    def test_work_older_than_the_window_is_excluded(self):
        self._finish(value='90.00', days_ago=60)
        board = build_restoration_scoreboard()
        self.assertEqual(board['four_week']['items'], 0)

    def test_daily_series_covers_a_fortnight_with_gaps_filled(self):
        self._finish(value='25.00')
        board = build_restoration_scoreboard()
        self.assertEqual(len(board['days']), 14)
        self.assertEqual(board['days'][-1]['items'], 1)
        self.assertEqual(board['days'][0]['items'], 0)
        self.assertEqual(board['days'][0]['value_added'], '0.00')

    def test_endpoint_serves_the_board(self):
        self._finish(value='10.00')
        resp = self.client.get('/api/inventory/restoration-jobs/scoreboard/')
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data['today']['items'], 1)
        self.assertNotIn('floor_rate', resp.data)
        self.assertNotIn('per_hour_while_working', resp.data)
