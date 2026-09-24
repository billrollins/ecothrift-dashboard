> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-045 · Tests: routines in one place (Today, one count, one set of words)

- **Type:** test · **Snapshot ref:** `refs/runner/R-045` (`9b18d709`) · **Compare-to:** `add2f70b` (v2.101.1, production)
- **What changed:**
  - **New shared model:** `frontend/src/pages/routines/myWork.ts` (`buildMyWork`) and `hooks/useMyWork.ts`.
  - **New shared list:** `components/routines/MyWorkList.tsx`, and `today/TodayWork.tsx` in Today (phone and desk).
  - **Deleted:** `TodayGlanceSections.tsx` and `GlanceRunRow.tsx`.
  - **Same count and words everywhere:** the Today badge (`useNavBadgeCounts` now keys `today`, plus `useNavBadgeTones`), the app-bar icon (`RoutinesNag`, which now opens Today), and the clock-out guard (`useTimeClockActions` and `ClockOutRoutineGuard`).
  - **Nav:** the Routines entry is gone from the phone tabs, floor nav and profile menu (`floorNav.ts`, `MainLayout`). Today has `pathAliases: ['/routines']`.
  - **RoutinesPage:** bare `/routines` sends to `/today`, and the catalog is superuser-only. The desk runner's side pane uses the shared list (`MyRoutinesPane`).
  - **Backend:** `views.start_with_run` is shared by `TodayView` and `runs/mine/`, which adds `start_with_id`.
  - **Tests updated:** `TodayPhone.test.tsx`, `FloorNav.test.tsx`, `PhoneTabBar.test.tsx`, `RoutinesPage.test.tsx`. New: `myWork.test.ts`.

## Run
1. `vitest`
2. `tsc`
3. `py: apps/routines apps/hr`
4. `py: apps/routines/tests_qa.py` (separate test database, as in R-044)
5. `migrations-check`

## Expect
- 0 NEW; the new `myWork.test.ts` and the updated tests pass.
- Report separately: any NEW vitest failure in `components/layout`, `components/routines` or `pages/routines`, and any NEW pytest failure touching `/api/routines/today/` or `runs/mine`.
