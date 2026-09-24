# R-049 · Tests: nags and nudges in one drawer, Hours & pay fills the column, R-047 fixes
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 12:09 · **Finished:** 2026-09-24 12:16 · **Status:** done · **GREEN**

Snapshot `b25d4aa5` (`refs/runner/R-049`). Compare-to `add2f70b`. Logs: `workspace/runner/R-049/`.

R-048 was using `C:\Coding\ecothrift-test`, so this run used `C:\Coding\ecothrift-test-r049`. Pytest used `DATABASE_NAME=r049_py` and `r049_qa`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 5 failed in the full run, 1181 passed, 191 files (4 failed),  exit 1. Solo re-run of the timeout passed | 0 | 4 tests + RestorationQueuePage file | ShiftHeroCard (3), TodayPhone, R-047's TodayPage test |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/routines apps/hr | 5 failed, 156 passed, 307.74s, exit 1 | 0 | 5 baseline keys | 9 GradingTests, plus R-047's shared-checklist test |
| py: apps/routines/tests_qa.py | 4 failed, 99 passed, 2 errors, 256.74s, exit 1 | 0 | same 6 keys as R-047 | none beyond R-047 |

## Expect

- `tsc` exit 0.
- `RoutinesNag.test.tsx`, `ShiftHeroCard.test.tsx`, `TodayPage.test.tsx` and `TodayPhone.test.tsx` are not in the vitest failure list.
- No vitest failure under `components/layout`, `components/routines`, `components/hr` or `pages/routines`.
- `test_a_finished_shared_checklist_is_not_created_again` and `test_mine_keeps_the_nudge_note_after_it_is_heard` are not in the pytest failure list.
- 9 of the 12 `GradingTests` keys pass. These 3 still fail (baseline keys; the error is no longer the `hr_shift_dept_name` collision from R-047):
  - `test_a_full_day_of_checklists_and_tallies_is_an_a` — `AssertionError: 'A+' != 'A'`
  - `test_an_untouched_spot_check_is_empty_not_a_zero` — `AssertionError: 'A+' != 'A'`
  - `test_a_week_with_no_cross_check_leans_on_doing_and_owner` — `AssertionError: 18.5 != 71.4`
- `ProgramV2Tests::test_open_day_close_are_the_52_items` still fails: `AssertionError: datetime.time(14, 0) is not None`.
- `NoDashesTests` still fails. The list is only webstore: `webstore\emails.py`, `webstore\models.py`, `webstore\services\hours.py`.

## R-047 failures that are gone

- `test_a_finished_shared_checklist_is_not_created_again`
- `TodayPage > shows the desk punch column, an empty list, and Hours & pay once`
- The three `ShiftHeroCard` failures and `TodayPhone > shows shift tiles and the clocked-out prompt`
- 9 of the 12 `GradingTests` keys (the ones that were `hr_shift_dept_name` on R-047, except the three still listed above)

## Full-run timeout

`HoldDetailDrawer > requires an internal note to reopen and posts it` timed out at 15s in the full vitest run, which overlapped R-048's vitest on the shared `node_modules`. A solo re-run on this snapshot passed (3.03s), and the same test passed on `add2f70b`. Not counted as NEW.

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

Not pruned. See the R-047 list above.
