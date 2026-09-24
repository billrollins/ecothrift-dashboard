# R-066 · Tests: the hazard rules after R-060, and the R-065 fixes
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 17:29 · **Finished:** 2026-09-24 17:33 · **Status:** done · **RED**

Snapshot `767f7c76` (`refs/runner/R-066`). Compare-to `f6fd6051`. Logs: `workspace/runner/R-066/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 4 failed, 1205 passed, 197 files (3 failed), exit 1 | 0 | 4 tests + RestorationQueuePage file | — |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/buying | 2 failed, 273 passed, 71 subtests passed, 183.08s, exit 1 | 2 | 0 | R-065's other 5 buying failures |

`test_won_to_po.py` is not on `f6fd6051`. The vendor-code collisions and the Costco close-model failure from R-065 are not in this failure list.

## NEW failures

- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_a_win_makes_the_po_with_the_manifest_on_it` — `AssertionError: '3000.00' != '3000'` (`3-py.log`)
- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_report_card_compares_prediction_with_what_sold` — `AssertionError: '3000.00' != '3000'` (`3-py.log`)

## Baseline

Nothing added.

## Now passing

None of the baseline keys. The R-065 failures that pass here were not baseline keys.
