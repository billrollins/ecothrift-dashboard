# R-014 result · Pre-ship full run (before the Heroku deploy)

**Status:** GREEN

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 14:10 · **Finished:** 2026-09-23 14:26

Snapshot `fe2d2275` (`refs/runner/R-014`). Compare-to `ecc60707`. Logs: `workspace/runner/R-014/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps | 117 failed, 1653 passed, 57 subtests passed (858.72s) | 0 | 113 | 0 |
| vitest | 9 failed, 1155 passed (1164); 6 failed files, 181 passed (187); 1 failed suite (72.27s) | 0 | 10 | 0 |
| tsc | 0 errors, exit 0 | 0 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

Pytest's `117 failed` includes five `SUBFAILED` rows of one known node, `test_preprocessing_status_completed_step_table_per_preprocess_status`. Unique node ids: 113, all in the baseline.

## POS (known)

Both `apps/pos` failures are already in the baseline (seeded 2026-09-23 @ `ecc60707`). Same error line, log `1-py.log`:

- `apps/pos/tests/test_delivery_days_api.py::DeliveryDaysAPITests::test_create_delivery_from_past_cart_is_audited`
  - `E       TypeError: can't multiply sequence by non-int of type 'decimal.Decimal'`
- `apps/pos/tests/test_delivery_run.py::DeliveryRunAPITests::test_line_items_and_optional_scan_verify`
  - `E       TypeError: can't multiply sequence by non-int of type 'decimal.Decimal'`

## NEW

None.

## Baseline

Nothing appended.

## Now passing

None. Every baseline py and vitest key in this run failed again. tsc baseline is empty.

## Expect

- The R-008 tsc error is gone: `npx tsc --noEmit` exited 0 and `3-tsc.log` has no `TS` lines. `BuyingCategoryGoal` does not appear.
- Known migrations are the two `webstore` `Rename index` lines (`4-migrations.log`).
