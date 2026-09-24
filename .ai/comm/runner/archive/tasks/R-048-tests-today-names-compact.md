> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-048 · Tests: Dashboard / Today names, compact clock card, tighter Hours & pay

- **Type:** test · **Snapshot ref:** `refs/runner/R-048` (`9128ecd1`) · **Compare-to:** `refs/runner/R-047` (`73662f5b`). If R-047 is not finished yet, wait for it, then run this.
- **What changed since R-047 (frontend only):**
  - **Names:** floor tabs and titles are **Dashboard** and **Today** again, never "Store" or "My day" (`floorNav.ts`, `navItemCatalog.ts`, `phoneFirstRoutes.ts`, `DashboardPage.tsx`, `i18n/routines.ts`).
  - **Renamed:** `pages/routines/myDayRunner.ts` is now `todayRunner.ts` (`todayHref`, `todayRunnerSearch`, `useTodayRunner`), and its test `todayRunner.test.ts`.
  - **Compact clock card:** `ShiftHeroCard.tsx` (clocked-in layout); `PunchActions.tsx` puts both buttons in one row.
  - **Hours & pay:** `HoursPayPanel.tsx` has one Show pay toggle, one line per period, and hides empty periods. `ShiftRow.tsx` is a one-line row; `RecentShiftsList.tsx` shows 5 with "More shifts". `TodayDesk.tsx`: the left column's cards no longer shrink.
  - **Tests updated:** `FloorNav.test.tsx`, `PhoneTabBar.test.tsx`, `phoneFirstRoutes.test.ts`, `todayRunner.test.ts`.

## Run
1. `vitest`
2. `tsc`

## Expect
- `tsc` exit 0.
- 0 NEW vitest failures against R-047. List separately every failure under `components/layout`, `components/routines`, `components/hr` or `pages/routines`, even if known.
