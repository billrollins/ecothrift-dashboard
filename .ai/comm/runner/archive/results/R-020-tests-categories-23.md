# R-020 result · 23 categories, B-Stock code mapping, Focus

**Status:** GREEN

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 16:22 · **Finished:** 2026-09-23 16:32

Snapshot `e78fdd81` (`refs/runner/R-020`). Compare-to `9e969a42`. Logs: `workspace/runner/R-020/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/buying apps/inventory apps/webstore | 83 failed, 1016 passed, 50 subtests passed (579.47s) | 0 | 79 | 0 |
| vitest | 9 failed, 1156 passed (1165); 6 failed files, 181 passed (187); 1 failed suite (88.99s) | 0 | 10 | 0 |
| tsc | 0 errors, exit 0 | 0 | 0 | 0 |
| migrations-check | 2 operation lines, exit 1 | 0 | 2 | 0 |

Pytest's `83 failed` includes five `SUBFAILED` rows of one known node, `test_preprocessing_status_completed_step_table_per_preprocess_status`. Unique node ids: 79, all in the baseline. Every baseline key in this selection failed again. `apps/buying` had no failures.

## Webstore and inventory category tests (known)

No NEW failures in `apps/webstore` or the inventory category tests. These three failed and are already in the baseline:

- `apps/webstore/tests/test_query_budget.py::QueryBudgetTests::test_staff_listings_query_budget`
- `apps/inventory/tests/test_inventory_category_views.py::InventoryCategoryViewTests::test_item_stats_category_uses_product_or_manifest_category`
- `apps/inventory/tests/test_inventory_category_views.py::InventoryCategoryViewTests::test_store_report_uses_product_and_manifest_category`

## NEW

None.

## Baseline

Nothing appended.

## Now passing

None.

## Expect

- `FocusFilterTests` and `CategoryCodeMappingTests` are in `apps/buying/tests/test_need_v2.py` on this snapshot. `apps/buying` had no failures (the run is 1016 passed across buying, inventory, and webstore), so both passed.
- Known vitest keys (all failed again): the three `ShiftHeroCard` tests, `TodayPhone`, `noDashes`, the three `ListingStudioPage` tests, `TodayPage`, and `RestorationQueuePage.test.tsx` (suite failure).
- Known migrations: the two `webstore` `Rename index` lines (`4-migrations.log`).
- tsc exited 0. `3-tsc.log` has no `TS` lines.
