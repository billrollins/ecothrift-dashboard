# R-076 · Tests: Thrift+ at the register (Phase 3), plus npm install for the scanner packages
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 16:34 · **Finished:** 2026-09-25 16:43 · **Status:** done · **GREEN**

Snapshot `18ef1d59` (`refs/runner/R-076`). Compare-to `ef679c16` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-076/`.

`npm ci` in the test-worktree frontend: exit 0, 427 packages, 39s (`0-npm.log`). `barcode-detector` and `zxing-wasm` are installed. The junction was removed first so this did not write the main tree's `node_modules`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1241 passed (1250), 4 files failed, exit 1 | 0 | 4 tests + RestorationQueuePage file + 5 myWork | scanner page file |
| tsc | exit 0 | 0 | 0 | the `TS2307` line |
| py: thriftplus pos core webstore + two inventory files | 1 failed, 615 passed, 407.57s, exit 1 | 0 | 1 webstore query-budget node | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## POS

No NEW failure in `apps/pos`. No `apps/pos` failure at all, same as R-075.

The only pytest failure is the baseline key `apps/webstore/tests/test_query_budget.py::QueryBudgetTests::test_staff_listings_query_budget` — `E       AssertionError: 7 != 6 : 7 queries executed, 6 expected`.

## Scanner

After `npm ci`, `tsc` exits 0 and `ThriftPlusScannerPage.test.tsx` is not in the vitest failure list. Both baseline entries R-075 added were pruned.

## Print server

`format_receipt_text` printed the THRIFT+ MEMBER block, including the lamp line (`5-printserver-utf8.txt`):

```
THRIFT+ MEMBER Ana (card ...0008)
 Lamp tag $90.00                          $87.00
Rewards this trip                         $13.00
  Toward this month's cover               $10.00
  Off your price today                     $3.00
Cover 2026-10: $10.00 of $10.00
Banked balance                             $0.00
Store credit balance                       $0.00
Members: items that don't work can come back
within 3 days for store credit.
```

## migrations-check

Only the two known webstore lines. No `pos` or `thriftplus` operations.

## NEW failures

None.

## Baseline

Pruned:

- `src/pages/thriftplus/scanner/ThriftPlusScannerPage.test.tsx [ src/pages/thriftplus/scanner/ThriftPlusScannerPage.test.tsx ]`
- `src/pages/thriftplus/scanner/useQrCamera.ts: TS2307 Cannot find module 'barcode-detector/ponyfill' or its corresponding type declarations.`

Nothing added.

## Now passing

Those two pruned scanner keys.

Vitest baseline keys that passed, not pruned:

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`
