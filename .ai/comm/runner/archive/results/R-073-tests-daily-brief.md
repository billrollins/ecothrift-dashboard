# R-073 · Tests: the morning brief (data_platform Phase 2)
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 15:49 · **Finished:** 2026-09-25 16:00 · **Status:** done · **RED**

Snapshot `34014f81` (`refs/runner/R-073`). Compare-to `2e996c56` (v2.105.1). Logs: `workspace/runner/R-073/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1204 passed (1213), 4 files failed, exit 1 | 0 | 4 tests + RestorationQueuePage file + 5 myWork | 6 baseline keys |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/core apps/hr apps/routines | 6 failed, 246 passed, 375.97s, exit 1 | 1 | 5 routines nodes | 27 routines baseline keys |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

`apps/hr` had no failures. `tests_qa.py` is not collected (`pytest.ini` `python_files`). Migrations show only the two webstore lines. No `core` operations (`0009` and `0010` are in the tree).

## NEW failures

### py (`3-py.log`)

Passes at `2e996c56` (`5-py-compare.log`: `1 passed in 59.26s`).

- `apps/core/tests/test_ai_settings.py::AiModelResolutionTests::test_seed_rows` — `E       AssertionError: 16 != 15`

## Known still failing

- `apps/routines/tests.py::GradingTests::test_a_full_day_of_checklists_and_tallies_is_an_a` — `E       AssertionError: 'A+' != 'A'`
- `apps/routines/tests.py::GradingTests::test_a_week_with_no_cross_check_leans_on_doing_and_owner` — `E       AssertionError: 18.5 != 71.4`
- `apps/routines/tests.py::GradingTests::test_an_untouched_spot_check_is_empty_not_a_zero` — `E       AssertionError: 'A+' != 'A'`
- `apps/routines/tests.py::ProgramV2Tests::test_open_day_close_are_the_52_items` — `E       AssertionError: datetime.time(14, 0) is not None`
- `apps/routines/tests.py::NoDashesTests::test_apps_source_has_no_em_or_en_dashes` — `E       AssertionError: Lists differ: ['inventory\\approval_kinds.py', 'webstore[103 chars].py'] != []`

The dash list is `inventory\approval_kinds.py`, `webstore\emails.py`, `webstore\models.py`, `buying\services\close_model_fit.py`, `webstore\services\hours.py`.

Vitest known: `noDashes`, the three `ListingStudioPage` tests, the five `myWork` tests, and `RestorationQueuePage.test.tsx` (`EMFILE`).

## Baseline

Nothing added.

## Now passing

Not pruned. The 27 routines keys:

- `apps/routines/tests.py::SectionRoutineTests::test_a_single_section_has_nobody_to_cross_check_it`
- `apps/routines/tests.py::SectionRoutineTests::test_cover_hands_an_absent_owners_run_over`
- `apps/routines/tests.py::SectionRoutineTests::test_cross_check_never_lands_on_your_own_aisle_and_rotates`
- `apps/routines/tests.py::SectionRoutineTests::test_my_section_gives_each_owner_one_run_for_all_they_keep`
- `apps/routines/tests.py::SectionRoutineTests::test_owner_spot_draws_a_fixed_sample_and_waits_for_a_tally`
- `apps/routines/tests.py::SectionRoutineTests::test_owner_spot_stays_waiting_until_a_tally_exists`
- `apps/routines/tests.py::SectionRoutineTests::test_reassigning_a_section_moves_todays_open_run`
- `apps/routines/tests.py::SectionRoutineTests::test_reroll_section_needs_another_tallied_aisle`
- `apps/routines/tests.py::SectionRoutineTests::test_spot_section_is_empty_until_tallied`
- `apps/routines/tests.py::SectionApiTests::test_a_name_cannot_repeat_in_one_department`
- `apps/routines/tests.py::SectionApiTests::test_hard_delete_refuses_until_retired`
- `apps/routines/tests.py::SectionApiTests::test_reorder_writes_the_new_positions`
- `apps/routines/tests.py::SectionApiTests::test_retire_hides_the_section_but_keeps_it`
- `apps/routines/tests.py::SectionApiTests::test_retired_section_can_be_edited_and_restored`
- `apps/routines/tests.py::SectionApiTests::test_staff_read_superuser_write`
- `apps/routines/tests.py::GradingTests::test_a_bad_week_parameter_falls_back_to_this_week`
- `apps/routines/tests.py::GradingTests::test_a_day_with_expected_work_is_graded_even_without_runs`
- `apps/routines/tests.py::GradingTests::test_a_done_spot_moves_the_owner_third`
- `apps/routines/tests.py::GradingTests::test_a_late_close_still_counts_as_done`
- `apps/routines/tests.py::GradingTests::test_a_missed_cross_check_is_a_zero_in_the_cross_third`
- `apps/routines/tests.py::GradingTests::test_a_missing_close_drops_doing`
- `apps/routines/tests.py::GradingTests::test_settings_override_the_letter_boundaries`
- `apps/routines/tests.py::GradingTests::test_tallies_are_summed_per_section_for_the_report`
- `apps/routines/tests.py::GradingTests::test_week_payload_has_thirds_and_people`
- `apps/routines/tests.py::SectionSubmitTests::test_a_real_audit_closes_the_run_and_scores`
- `apps/routines/tests.py::SectionSubmitTests::test_a_walk_closes_without_a_photo_or_item_count`
- `apps/routines/tests.py::SectionSubmitTests::test_the_draft_opens_on_the_section_it_was_assigned`

Vitest baseline keys that passed:

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`
