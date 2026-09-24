> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-047 · Tests: My day (routines runner in place, Hours & pay, colour grades, no My QA)

- **Type:** test · **Snapshot ref:** `refs/runner/R-047` (`73662f5b`) · **Compare-to:** `add2f70b` (v2.101.1, production)
- **Supersedes:** R-045 and R-046 (both RED). This snapshot has their code plus the fixes.
- **What changed:**
  - **Colour grades:** `pages/routines/myWork.ts` has 4 states (later / soon / now / late), `sections` (Do now, Due soon, Later today), `nagCount` and `nagTone`. `MyWorkList.tsx` shows the sections, with a `compact` mode for the nag drawer.
  - **Nag:** `RoutinesNag.tsx` counts nagging runs only, is coloured by the worst one, and opens a Drawer. The My day nav badge is always grey (`useNavBadgeTones`).
  - **Runner in place:** new `pages/routines/myDayRunner.ts` (`/today?run=12`). `TodayDesk` slides the runner in beside the list; `TodayPhone` shows it full screen. `RoutinesPage` redirects all `/routines/run/...` and `/routines?run=` links to `/today?...`. `RoutineRunnerPage` takes `onClose`. `MyRoutinesPane.tsx` is deleted.
  - **Hours & pay:** new `components/hr/HoursPayPanel.tsx` on My day. `PayPage.tsx` and its test, and `WeekHoursBar.tsx`, are deleted. `/pay`, `/hr/time-clock` and `/hr/time-history` go to `/today?hours=1`. `ShiftHeroCard` shows only break and long-shift notes.
  - **My QA gone:** `StaffQaPage.tsx` is deleted; `/routines/qa` goes to `/today`.
  - **Names:** floor tabs are Store and My day (`floorNav.ts`, `navItemCatalog.ts`, `phoneFirstRoutes.ts`). The Pay nav item is removed.
  - **Backend tests:** `apps/routines/tests.py` and `tests_qa.py` setUp use `Department.objects.get_or_create(name='Retail')`. This fixes the duplicate `hr_department_name_key` error behind the 32 known `tests.py` failures and R-046's NEW failure.
  - **Tests updated or new:** `myWork.test.ts`, `myDayRunner.test.ts`, `HoursPayPanel.test.ts`, `TodayPage.test.tsx`, `TodayPhone.test.tsx`, `RoutinesPage.test.tsx`, `FloorNav.test.tsx`, `PhoneTabBar.test.tsx`, `phoneFirstRoutes.test.ts`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/routines apps/hr`
4. `py: apps/routines/tests_qa.py` (separate test database, as in R-044)
5. `migrations-check`

## Expect
- `tsc` exit 0.
- 0 NEW vitest failures. List separately every failure under `components/layout`, `components/routines`, `components/hr`, `pages/routines` or `pages/hr`, even if known.
- **Pytest `apps/routines`:** `test_a_finished_shared_checklist_is_not_created_again` passes. Many of the 32 known `tests.py` failures should now pass: list them under **Now passing**. Any failure that remains: give its first error line.
- **`tests_qa.py`:** compare with the 12 baseline keys; list any now passing.
