# R-050 · Tests: weekly hours nag, clock-in at the limit, Hours & pay folded on phones
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 12:32 · **Finished:** 2026-09-24 12:34 · **Status:** done · **RED**

Snapshot `f0635cbc` (`refs/runner/R-050`). Compare-to `703ead8e`. Logs: `workspace/runner/R-050/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 5 failed, 1188 passed, 192 files (4 failed), exit 1 | 1 | 4 tests + RestorationQueuePage file | none |
| tsc | exit 0 | 0 | 0 | — |

## Expect

- `tsc` exit 0.
- `useHoursNag.test.ts`, `RoutinesNag.test.tsx`, `TodayPhone.test.tsx`, `TodayPage.test.tsx` and `ShiftHeroCard.test.tsx` are not in the failure list. No kiosk test failed.

Failures under `components/`, `hooks/`, `pages/routines`, `pages/hr` or `pages/kiosk`:

- `src/components/hr/weekStatus.test.ts > weekStatusLine > says overtime is not allowed` — `AssertionError: expected 'Over the weekly limit · clock out now…' to be 'Overtime is not allowed'` (**NEW**, `1-vitest.log`). Received: `Over the weekly limit · clock out now. No overtime is approved.`

## NEW failures

This test passes on `703ead8e` (1 passed, 7 skipped).

- `src/components/hr/weekStatus.test.ts > weekStatusLine > says overtime is not allowed` — `AssertionError: expected 'Over the weekly limit · clock out now…' to be 'Overtime is not allowed'` (`1-vitest.log`)

## Baseline

Nothing added.

## Now passing

None.
