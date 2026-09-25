# R-069 · Tests: seller revenue factors (after v2.104.0)
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 18:32 · **Finished:** 2026-09-24 18:36 · **Status:** done · **GREEN**

Snapshot `fc577c6f` (`refs/runner/R-069`). Compare-to `2a43ee2a` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-069/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 4 failed, 1205 passed, exit 1 | 0 | 4 tests + RestorationQueuePage file | — |
| tsc | exit 0 | 0 | 0 | — |
| py: apps/buying | 278 passed, 71 subtests passed, 176.28s, exit 0 | 0 | 0 | R-066's two `test_won_to_po` failures |

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

The two R-066 failures are not in this run. They were not baseline keys.
