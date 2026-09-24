# R-044 · Retest: routine visibility (R-043 fixes)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 10:47 · **Finished:** 2026-09-24 10:52 · **Status:** done · **GREEN**

Snapshot `bc920730` (`refs/runner/R-044`). Compare-to `2d1e2c5e` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-044/`.

`tests_qa.py` used a separate test database (`DATABASE_NAME=r044_qa`).

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/routines/tests_qa.py | 10 failed, 93 passed, 2 errors, 175.62s, exit 1 | 0 | 12 baseline keys | the 2 R-043 failures (not baseline keys) |
| py: apps/routines apps/pos | 34 failed, 272 passed, 265.98s, exit 1 | 0 | 32 `tests.py` keys + 2 POS delivery tests | none |

## Expect

- 0 NEW. The two R-043 failures pass: `test_reassigning_an_owners_check_covers_today_and_is_not_recreated` and `DayPunchesTests::test_open_punch_wins_then_latest_end`. Passed count went from 91 (R-043) to 93.
- The 12 baseline `tests_qa.py` keys are unchanged (10 `FAILED` + 2 `ERROR`).
- **POS:** no NEW failure. Only the two baseline delivery tests failed.

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

None of the baseline keys. The two R-043 failures were not in the baseline; they pass on this snapshot.
