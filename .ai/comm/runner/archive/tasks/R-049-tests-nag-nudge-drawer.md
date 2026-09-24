> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-049 · Tests: nags and nudges in one drawer, Hours & pay fills the column, R-047 fixes

- **Type:** test · **Snapshot ref:** `refs/runner/R-049` (`b25d4aa5`) · **Compare-to:** `add2f70b` (v2.101.1, production). Also compare with R-047's result: say which of its failures are gone.
- **Includes R-048's changes.** If R-048 is still queued when you reach this, run it first as usual; this task stands on its own.
- **What changed:**
  - **Nags and nudges in one drawer:** new `components/routines/NagMessages.tsx`; `RoutinesNag.tsx` shows Messages (Heard, "I'm not <name>") above the routine sections and opens itself for a new message. `NudgeBlockingDialog.tsx` is deleted (removed from `MainLayout`).
  - **Nudge note on runs:** `apps/routines/views.py` `runs/mine` adds `nudge` to each open run (`_attach_nudges`). `pages/routines/myWork.ts`: `dueState` (clock only) and `workState` (a nudged run is red), `nudgeNote`. `MyWorkList` shows the note.
  - **Hours & pay:** open by default (`?hours=0` folds it); `HoursPayPanel fill` stretches on the desk and fits as many shifts as the height allows; `RecentShiftsList` is controlled (`limit`, `all`, `onToggleAll`).
  - **R-047 RED fixes:** `SectionRoutineTests._routine` takes `assignment`; `GradingTests.setUp` uses `Shift.objects.update_or_create` on the seeded Retail shifts; en dashes removed from `routines/grading.py`, `routines/settings.py`, migration `0016`. Tests that counted unmocked shift tiles no longer do (`TodayPage.test.tsx`, `TodayPhone.test.tsx`); `ShiftHeroCard.test.tsx` has a QueryClient and mocked tiles.
  - **New or updated tests:** `RoutinesNag.test.tsx` (new), `myWork.test.ts`, `apps/routines/tests.py::RoutineApiTests::test_mine_keeps_the_nudge_note_after_it_is_heard` (new), plus the files above.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/routines apps/hr`
4. `py: apps/routines/tests_qa.py` (separate test database, as in R-044)

## Expect
- `tsc` exit 0.
- 0 NEW vitest failures. `RoutinesNag.test.tsx`, `ShiftHeroCard.test.tsx`, `TodayPage.test.tsx` and `TodayPhone.test.tsx` all pass. List every failure under `components/layout`, `components/routines`, `components/hr` or `pages/routines`, even if known.
- **Pytest:** `test_a_finished_shared_checklist_is_not_created_again` and `test_mine_keeps_the_nudge_note_after_it_is_heard` pass; the 12 `GradingTests` keys should now pass. Known leftovers: `ProgramV2Tests::test_open_day_close_are_the_52_items`, and `NoDashesTests` (only `webstore` files should remain in its list; give the list).
