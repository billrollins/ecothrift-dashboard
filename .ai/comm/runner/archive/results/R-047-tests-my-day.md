# R-047 · Tests: My day (routines runner in place, Hours & pay, colour grades, no My QA)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 11:46 · **Finished:** 2026-09-24 11:53 · **Status:** done · **RED**

Snapshot `73662f5b` (`refs/runner/R-047`). Compare-to `add2f70b`. Logs: `workspace/runner/R-047/`.

`tests_qa.py` used `DATABASE_NAME=r047_qa`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1173 passed, 190 files (6 failed), 125.62s, exit 1 | 1 | 8 tests + RestorationQueuePage file | none |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/routines apps/hr | 15 failed, 145 passed, 300.74s, exit 1 | 1 | 14 | 18 |
| py: apps/routines/tests_qa.py | 4 failed, 99 passed, 2 errors, 251.27s, exit 1 | 0 | 6 | 6 |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## Expect

- `tsc` exit 0.
- `test_a_finished_shared_checklist_is_not_created_again` did not pass.
- 18 of the 32 known `tests.py` failures now pass. 14 still fail (listed below).
- 6 of the 12 `tests_qa.py` baseline keys now pass.

## Focused vitest failures

`components/layout` and `pages/hr`: none.

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out` — `Error: No QueryClient set, use QueryClientProvider to set one` (known)
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in` — `Error: No QueryClient set, use QueryClientProvider to set one` (known)
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line` — `Error: No QueryClient set, use QueryClientProvider to set one` (known)
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt` — `AssertionError: expected [ <button …(3)>…(3)</button> ] to have a length of 8 but got 1` (known)
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once` — `AssertionError: expected 3 to be greater than or equal to 7` (**NEW**)

## NEW failures

Neither key exists on `add2f70b`. Pytest: `compare-1-py.log` says `ERROR: not found`. Vitest: `TodayPage.test.tsx` on that ref still has `shows the desk punch column and the pick-your-shift line` (baseline), not this name.

- `apps/routines/tests.py::SectionRoutineTests::test_a_finished_shared_checklist_is_not_created_again` — `TypeError: django.db.models.query.QuerySet.create() got multiple values for keyword argument 'assignment'` (`3-py.log`)
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once` — `AssertionError: expected 3 to be greater than or equal to 7` (`1-vitest.log`)

## Pytest failures that remain

Known (first error line):

- `GradingTests::test_a_bad_week_parameter_falls_back_to_this_week` — `psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint "hr_shift_dept_name"`
- `GradingTests::test_a_day_with_expected_work_is_graded_even_without_runs` — same `hr_shift_dept_name`
- `GradingTests::test_a_done_spot_moves_the_owner_third` — same
- `GradingTests::test_a_full_day_of_checklists_and_tallies_is_an_a` — same
- `GradingTests::test_a_late_close_still_counts_as_done` — same
- `GradingTests::test_a_missed_cross_check_is_a_zero_in_the_cross_third` — same
- `GradingTests::test_a_missing_close_drops_doing` — same
- `GradingTests::test_a_week_with_no_cross_check_leans_on_doing_and_owner` — same
- `GradingTests::test_an_untouched_spot_check_is_empty_not_a_zero` — same
- `GradingTests::test_settings_override_the_letter_boundaries` — same
- `GradingTests::test_tallies_are_summed_per_section_for_the_report` — same
- `GradingTests::test_week_payload_has_thirds_and_people` — same
- `ProgramV2Tests::test_open_day_close_are_the_52_items` — `AssertionError: datetime.time(14, 0) is not None`
- `NoDashesTests::test_apps_source_has_no_em_or_en_dashes` — `AssertionError: Lists differ: ['routines\\grading.py', 'routines\\settin[136 chars].py'] != []`

## Now passing

`tests.py` (18 of the 32 baseline keys):

- `SectionRoutineTests::test_a_single_section_has_nobody_to_cross_check_it`
- `SectionRoutineTests::test_cover_hands_an_absent_owners_run_over`
- `SectionRoutineTests::test_cross_check_never_lands_on_your_own_aisle_and_rotates`
- `SectionRoutineTests::test_my_section_gives_each_owner_one_run_for_all_they_keep`
- `SectionRoutineTests::test_owner_spot_draws_a_fixed_sample_and_waits_for_a_tally`
- `SectionRoutineTests::test_owner_spot_stays_waiting_until_a_tally_exists`
- `SectionRoutineTests::test_reassigning_a_section_moves_todays_open_run`
- `SectionRoutineTests::test_reroll_section_needs_another_tallied_aisle`
- `SectionRoutineTests::test_spot_section_is_empty_until_tallied`
- `SectionApiTests::test_a_name_cannot_repeat_in_one_department`
- `SectionApiTests::test_hard_delete_refuses_until_retired`
- `SectionApiTests::test_reorder_writes_the_new_positions`
- `SectionApiTests::test_retire_hides_the_section_but_keeps_it`
- `SectionApiTests::test_retired_section_can_be_edited_and_restored`
- `SectionApiTests::test_staff_read_superuser_write`
- `SectionSubmitTests::test_a_real_audit_closes_the_run_and_scores`
- `SectionSubmitTests::test_a_walk_closes_without_a_photo_or_item_count`
- `SectionSubmitTests::test_the_draft_opens_on_the_section_it_was_assigned`

`tests_qa.py` (6 of 12):

- `SpotPoolTests::test_empty_pool_until_something_is_tallied`
- `SpotPoolTests::test_lazy_draw_waits_then_picks`
- `ShiftRosterTests::test_empty_days_keep_the_person_assigned`
- `ShiftRosterTests::test_manager_can_assign_a_shift`
- `ShiftRosterTests::test_person_days_limit_who_is_on_today`
- `FlagSpeedTests::test_a_ten_second_audit_is_too_fast`

## Baseline

Nothing added. Now-passing keys were not pruned.
