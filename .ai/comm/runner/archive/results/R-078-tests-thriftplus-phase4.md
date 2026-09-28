# R-078 · Tests: Thrift+ Phase 4, the discount logic, and return credit
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 16:57 · **Finished:** 2026-09-25 17:05 · **Status:** done · **GREEN**

Snapshot `737f928d` (`refs/runner/R-078`). Compare-to `18ef1d59` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-078/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1245 passed (1254), 4 files failed, exit 1 | 0 | 4 tests + RestorationQueuePage file + 5 myWork | 6 baseline keys |
| tsc | exit 0 | 0 | 0 | — |
| py: thriftplus pos accounts core ai | 422 passed, 12 subtests passed, 442.96s, exit 0 | 0 | 0 | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## POS

No NEW failure in `apps/pos`. No `apps/pos` failure at all.

## migrations-check

Only the two known webstore lines.

## NEW failures

None.

## Baseline

Nothing added. Nothing pruned.

## Now passing

Vitest baseline keys that passed, not pruned:

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`
