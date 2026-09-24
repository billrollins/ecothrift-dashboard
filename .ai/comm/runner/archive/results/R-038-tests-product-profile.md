# R-038 · Tests: product profile, brand aliases, proposals, review page
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 08:47 · **Finished:** 2026-09-24 08:59 · **Status:** done · **GREEN**

Snapshot `4f619375` (`refs/runner/R-038`). Compare-to `41a77c23` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-038/`.

The shared worktree `C:\Coding\ecothrift-test` was in use by R-037, so this run used `C:\Coding\ecothrift-test-r038` and a separate test database (`DATABASE_NAME=r038_pytest`).

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/inventory apps/pos | 84 failed, 806 passed, 659.84s, exit 1 | 0 | 80 baseline keys (79 `FAILED` nodes + 5 `SUBFAILED` on the preprocessing status-table test) | none |
| vitest | 9 failed, 1157 passed, 188 files (6 failed), 91.91s, exit 1 | 0 | 9 tests + `RestorationQueuePage.test.tsx` file | none |
| tsc | exit 0 | 0 | 0 | — |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## Expect

- `apps/inventory/tests/test_product_profile.py` is not in the failure list. `ProductReviewPage.test.ts` and `slotCNavLayout.test.ts` match `src/**/*.test.{ts,tsx}` and are not in the vitest `FAIL` list.
- **POS:** no NEW failure. The only POS failures are the two baseline delivery tests (`test_create_delivery_from_past_cart_is_audited`, `test_line_items_and_optional_scan_verify`).
- **Inventory processing, check-in, preprocessing:** no NEW failure. Every failure in those areas is already in `baseline.md`.
- **Migration 0098:** applied cleanly. `1-py.log` has no migration error; pytest created the test database and ran the suite to 100%. `makemigrations --check` did not ask for a new inventory migration.

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

None. `test_preprocessing_status_completed_step_table_per_preprocess_status` is not a top-level `FAILED` line, but it still has five `SUBFAILED` rows (`not_started`, `standardized`, `cleaned`, `reviewing`, `finalized`).
