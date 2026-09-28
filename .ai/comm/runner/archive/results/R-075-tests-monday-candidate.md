# R-075 · Tests: the Monday candidate after the merge (scanner code, 10% floor, /scan passthrough, POS line-price fix)
- **Runner:** Grok 4.7 · **Started:** 2026-09-25 16:16 · **Finished:** 2026-09-25 16:24 · **Status:** done · **GREEN**

Snapshot `ef679c16` (`refs/runner/R-075`). Compare-to `fd7eb327` (v2.107.0). Logs: `workspace/runner/R-075/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 9 failed, 1230 passed (1239), 5 files failed, exit 1 | 0 | 4 tests + RestorationQueuePage file + 5 myWork + scanner page file | 6 baseline keys |
| tsc | exit 2 | 0 | 1 (`barcode-detector/ponyfill`) | — |
| py: thriftplus core pos + two files | 361 passed, 326.65s, exit 0 | 0 | 0 | 2 POS delivery tests |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## POS

No NEW failure in `apps/pos`. No `apps/pos` failure at all. The two delivery tests passed and were pruned from the baseline:

- `apps/pos/tests/test_delivery_days_api.py::DeliveryDaysAPITests::test_create_delivery_from_past_cart_is_audited`
- `apps/pos/tests/test_delivery_run.py::DeliveryRunAPITests::test_line_items_and_optional_scan_verify`

## Scanner

`src/api/thriftPlusMock.test.ts` passed (17 tests, `6-vitest-compare.log`).

The scanner page file fails to load, on this snapshot and on `fd7eb327`:

- `src/pages/thriftplus/scanner/ThriftPlusScannerPage.test.tsx [ src/pages/thriftplus/scanner/ThriftPlusScannerPage.test.tsx ]` — `Caused by: Error: Failed to resolve import "barcode-detector/ponyfill" from "src/pages/thriftplus/scanner/useQrCamera.ts". Does the file exist?` (`1-vitest.log`)

tsc, same error on both refs (`2-tsc.log`, `5-tsc-compare.log`):

- `src/pages/thriftplus/scanner/useQrCamera.ts: TS2307 Cannot find module 'barcode-detector/ponyfill' or its corresponding type declarations.`

## migrations-check

Only the two known webstore lines.

## NEW failures

None.

## Baseline

Pruned the two POS delivery tests.

Added, both confirmed at `fd7eb327`:

- `src/pages/thriftplus/scanner/ThriftPlusScannerPage.test.tsx [ src/pages/thriftplus/scanner/ThriftPlusScannerPage.test.tsx ]`
- `src/pages/thriftplus/scanner/useQrCamera.ts: TS2307 Cannot find module 'barcode-detector/ponyfill' or its corresponding type declarations.`

## Now passing

The two POS delivery tests, pruned.

Vitest baseline keys that passed, not pruned:

- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > names the break on the status line`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows seven single-line tiles when clocked out`
- `src/components/hr/ShiftHeroCard.test.tsx > ShiftHeroCard > shows the timer, Change, and hours left when clocked in`
- `src/components/routines/today/TodayPhone.test.tsx > TodayPhone > shows shift tiles and the clocked-out prompt`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column and the pick-your-shift line`
- `src/pages/routines/TodayPage.test.tsx > TodayPage > shows the desk punch column, an empty list, and Hours & pay once`
