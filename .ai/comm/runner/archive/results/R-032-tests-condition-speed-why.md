# R-032 result · Tests: condition shrink, sell speed, why line

**Status:** GREEN

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:52 · **Finished:** 2026-09-23 17:56

Snapshot `d06603a3` (`refs/runner/R-032`). Compare-to `9e969a42`. Logs: `workspace/runner/R-032/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/buying apps/core apps/floorplan apps/labels | 426 passed, 57 subtests passed (228.37s) | 0 | 0 | 0 |
| vitest | 9 failed, 1156 passed (1165); 6 failed files, 181 passed (187); 1 failed suite (73.00s) | 0 | 10 | 0 |
| tsc | 0 errors, exit 0 | 0 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

## NEW

None.

## Baseline

Nothing appended.

## Now passing

None. The 10 baseline vitest keys failed again. This pytest selection does not include the baseline py keys.

## Expect

- `apps/buying` had no failures, so `test_condition.py`, `test_speed.py`, and `test_auction_why.py` passed. They are on this snapshot.
- `apps/core` had no failures, so the R-026 `test_seed_rows` failure did not return.
- `settingsRegistry` and `buyingCostNotes` are not among the failed vitest files, so those suites passed, including the new keys.
- Known vitest keys: the three `ShiftHeroCard` tests, `TodayPhone`, `noDashes`, the three `ListingStudioPage` tests, `TodayPage`, and `RestorationQueuePage.test.tsx`.
- Known migrations: the two `webstore` `Rename index` lines.
- tsc exited 0.
