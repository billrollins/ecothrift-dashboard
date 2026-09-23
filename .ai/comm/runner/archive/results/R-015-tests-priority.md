# R-015 result · Priority v2 and Need coverage

**Status:** GREEN

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 15:37 · **Finished:** 2026-09-23 15:40

Snapshot `b98f31a5` (`refs/runner/R-015`). Compare-to `50bf6143`. Logs: `workspace/runner/R-015/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/buying | 199 passed, 50 subtests passed (135.55s) | 0 | 0 | 0 |
| vitest | 9 failed, 1156 passed (1165); 6 failed files, 181 passed (187); 1 failed suite (78.58s) | 0 | 10 | 0 |
| tsc | 0 errors, exit 0 | 0 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

## NEW

None.

## Baseline

Nothing appended.

## Now passing

None. Every baseline vitest key in this run failed again. This pytest selection does not include the baseline py keys.

## Expect

- `apps/buying` had no failures (199 passed). `PriorityTests` in `test_need_v2.py` is in that run, so it passed. The buying suite was 197 passed on R-008; this run is 2 higher.
- Vitest gained one passing test against R-014 (1155 passed of 1164, now 1156 of 1165) and the failure keys are unchanged, so the `needNote and priorityNote` test in `buyingCostNotes.test.ts` passed.
- Known vitest keys (all failed again): the three `ShiftHeroCard` tests, `TodayPhone`, `noDashes`, the three `ListingStudioPage` tests, `TodayPage`, and `RestorationQueuePage.test.tsx` (suite failure).
- Known migrations: the two `webstore` `Rename index` lines (`4-migrations.log`).
- tsc exited 0. `3-tsc.log` has no `TS` lines.
