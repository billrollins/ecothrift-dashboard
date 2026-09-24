> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-051 · Tests: weekly hours nag + forgotten clock-out on Today (supersedes R-050)

- **Type:** test · **Snapshot ref:** `refs/runner/R-051` (`4c14c2c3`) · **Compare-to:** `703ead8e` (v2.102.0, production)
- **Supersedes R-050** (RED: 1 NEW, `weekStatus.test.ts` expected the old wording; the test is updated).
- **What changed:**
  - Everything in R-050 (`useHoursNag`, `HoursNagCard`, `ClockInLimitDialog`, `nagSummary`, Hours & pay folded on phones, new wording).
  - **Forgotten clock-out (backend):** new `apps/hr/services/forgotten_punch.py` (`stale_info`, `parse_clock_out`, `close_forgotten_punch`); `apps/hr/views.py`: `current` adds `stale`, `clock_out` refuses a self clock-out of a punch open 14h+ (`code: stale_punch`; a manager clocking someone else out is allowed), new `fix_forgotten` action. New tests `apps/hr/tests/test_forgotten_punch.py`.
  - **Forgotten clock-out (frontend):** `ForgottenClockOutCard.tsx`; `ShiftHeroCard` shows it for `entry.stale`; `useFixForgotten` (hooks/useTimeClock), `fixForgottenClockOut` (api/hr.api), `useTimeClockActions.fixForgotten`; `useHoursNag` is quiet for a stale punch. Kiosk `staleNote` text.
  - Tests: `TodayPhone.test.tsx` (new forgotten-shift case; `useFixForgotten` mocked), `TodayPage.test.tsx` (mock), `weekStatus.test.ts` (wording).

## Run
1. `vitest`
2. `tsc`
3. `py: apps/hr apps/routines`

## Expect
- `tsc` exit 0.
- 0 NEW vitest failures; `weekStatus.test.ts`, `TodayPhone.test.tsx`, `TodayPage.test.tsx`, `RoutinesNag.test.tsx`, `useHoursNag.test.ts` pass. List every failure under `components/`, `hooks/`, `pages/routines`, `pages/hr` or `pages/kiosk`.
- 0 NEW pytest failures; all 6 tests in `apps/hr/tests/test_forgotten_punch.py` pass, and `apps/hr/tests/test_kiosk.py` is unchanged (its stale-punch tests still pass).
