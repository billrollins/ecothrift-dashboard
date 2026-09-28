# R-072 · Tests: Thrift+ members and cards (thrift_plus_rewards Phase 1), plus the R-071 fixes and everything since
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 15:35 · **Finished:** 2026-09-25 15:48 · **Status:** done · **GREEN**

Snapshot `3d60eb57` (`refs/runner/R-072`). Compare-to `2e996c56` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-072/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1203 passed (1212), 4 files failed, exit 1, 111s | 0 | 4 tests + RestorationQueuePage file + 5 myWork | 6 baseline keys |
| tsc | exit 0 | 0 | 0 | — |
| py: thriftplus core inventory accounts pos buying | 84 failed, 1247 passed, 71 subtests passed, 707.76s, exit 1 | 0 | 77 inventory nodes + 2 POS delivery tests + 5 status-table SUBFAILED | 1 |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## POS

No NEW failure in `apps/pos`. The only POS failures are the two baseline delivery tests: `test_create_delivery_from_past_cart_is_audited` and `test_line_items_and_optional_scan_verify`.

## R-071 fixes

None of R-071's NEW failures are in this run. `slotCNavLayout` passed. No `FAILED` line in `apps/core/tests/test_approval_requests.py` or `apps/inventory/tests/test_approval_kinds.py`. `RequestsPage.tsx` is not in the `noDashes` hit list.

No `FAILED` line in `apps/thriftplus`, `apps/accounts`, or `apps/buying`.

## migrations-check

Only the two known webstore lines. No `thriftplus` or `core` operations.

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

Not pruned.

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`
- `apps/inventory/tests/test_restoration_history_forget.py::RestorationHistoryForgetTests::test_clear_history_clears_notes_and_superseded_not_actions`
