> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-050 · Tests: weekly hours nag, clock-in at the limit, Hours & pay folded on phones

- **Type:** test · **Snapshot ref:** `refs/runner/R-050` (`f0635cbc`) · **Compare-to:** `703ead8e` (v2.102.0, production)
- **What changed (frontend only):**
  - New `hooks/useHoursNag.ts` (`hoursNag`, `useHoursNag`) and its test; new `components/hr/HoursNagCard.tsx`, `components/hr/ClockInLimitDialog.tsx`, `components/routines/nagSummary.ts`.
  - `RoutinesNag.tsx` counts the hours nag and shows `HoursNagCard` in the drawer; `useTodayModel` exposes `hours` and `nag`; `TodayPhone`, `TodayDesk` and `ShiftHeroCard` show it; the Today chip uses `nag`.
  - `pages/hr/useTimeClockActions.ts`: clocking in at the weekly limit opens `ClockInLimitDialog` (`limitOpen`, `confirmLimit`, `closeLimit`).
  - `HoursPayPanel.tsx`: folded by default on a phone (`?hours=1` opens), open on a desk (`?hours=0` folds).
  - Text: `i18n/routines.ts` (new hours strings, `limitReached`, `overtimeNotAllowed`), `i18n/kiosk.ts` (`warnOvertime`).
  - Tests: `RoutinesNag.test.tsx` (mocks `useHoursNag`; two new cases), `useHoursNag.test.ts` (new), `TodayPhone.test.tsx` (Hours & pay folded).

## Run
1. `vitest`
2. `tsc`

## Expect
- `tsc` exit 0.
- 0 NEW vitest failures. `useHoursNag.test.ts`, `RoutinesNag.test.tsx`, `TodayPhone.test.tsx`, `TodayPage.test.tsx`, `ShiftHeroCard.test.tsx` and any kiosk test pass. List every failure under `components/`, `hooks/`, `pages/routines`, `pages/hr` or `pages/kiosk`, even if known.
