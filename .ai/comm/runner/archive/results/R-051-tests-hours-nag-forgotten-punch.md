# R-051 · Tests: weekly hours nag + forgotten clock-out on Today (supersedes R-050)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 13:09 · **Finished:** 2026-09-24 13:14 · **Status:** done · **GREEN**

Snapshot `4c14c2c3` (`refs/runner/R-051`). Compare-to `703ead8e` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-051/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 4 failed, 1190 passed, 192 files (3 failed), exit 1 | 0 | 4 tests + RestorationQueuePage file | R-050 `weekStatus` wording test |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/hr apps/routines | 5 failed, 162 passed, 283.51s, exit 1 | 0 | the same 5 keys as R-049 | none of the baseline keys |

## Expect

- `tsc` exit 0.
- `weekStatus.test.ts`, `TodayPhone.test.tsx`, `TodayPage.test.tsx`, `RoutinesNag.test.tsx` and `useHoursNag.test.ts` are not in the vitest failure list. The R-050 failure (`says overtime is not allowed`) is gone.
- No vitest failure under `components/`, `hooks/`, `pages/routines`, `pages/hr` or `pages/kiosk`.
- All 6 tests in `apps/hr/tests/test_forgotten_punch.py` passed (passed count is 162, up 6 from R-049's 156 on the same apps). `apps/hr/tests/test_kiosk.py` is not in the failure list.

The 5 pytest failures are the R-049 leftovers: three `GradingTests` (`A+` / `18.5 != 71.4`), `ProgramV2Tests::test_open_day_close_are_the_52_items`, and `NoDashesTests` (webstore files only).

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

`weekStatusLine > says overtime is not allowed` (R-050's new failure; it was not a baseline key).
