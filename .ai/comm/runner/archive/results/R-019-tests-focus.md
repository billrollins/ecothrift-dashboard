# R-019 result · Focus chip

**Status:** GREEN

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 16:07 · **Finished:** 2026-09-23 16:10

Snapshot `720677f7` (`refs/runner/R-019`). Compare-to `9e969a42`. Logs: `workspace/runner/R-019/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/buying | 200 passed, 50 subtests passed (131.85s) | 0 | 0 | 0 |
| vitest | 9 failed, 1156 passed (1165); 6 failed files, 181 passed (187); 1 failed suite (78.33s) | 0 | 10 | 0 |
| tsc | 0 errors, exit 0 | 0 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

## NEW

None.

## Baseline

Nothing appended.

## Now passing

None. Every baseline vitest key in this run failed again. This pytest selection does not include the baseline py keys.

## Expect

- `apps/buying` had no failures (200 passed). R-015 was 199 passed. `FocusFilterTests.test_focus_is_the_pull_window_without_contracts` is in `apps/buying/tests/test_need_v2.py` on this snapshot, so it passed with the suite.
- Vitest totals match R-015 (9 failed, 1156 passed). Failure keys are unchanged.
- Known vitest keys (all failed again): the three `ShiftHeroCard` tests, `TodayPhone`, `noDashes`, the three `ListingStudioPage` tests, `TodayPage`, and `RestorationQueuePage.test.tsx` (suite failure).
- Known migrations: the two `webstore` `Rename index` lines (`4-migrations.log`).
- tsc exited 0. `3-tsc.log` has no `TS` lines.
