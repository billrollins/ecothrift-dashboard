# R-065 · Tests: retest R-059's RED, with the fixes and the changes after its snapshot
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 17:15 · **Finished:** 2026-09-24 17:26 · **Status:** done · **RED**

Snapshot `1e01d208` (`refs/runner/R-065`). Compare-to `f6fd6051`. Logs: `workspace/runner/R-065/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| vitest | 4 failed, 1205 passed, 197 files (3 failed), exit 1 | 0 | 4 tests + RestorationQueuePage file | R-059's 3 buying tests |
| tsc | exit 0 | 0 | 0 | R-059 WishListPage TS2322 |
| py: apps/buying apps/inventory | 89 failed, 869 passed, 56 subtests passed, 524.60s, exit 1 | 7 | 77 `FAILED` nodes + 5 `SUBFAILED` on the preprocessing status-table test | 44 of R-059's 51 buying failures |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

`apps/inventory` has 0 NEW failures. `migrations-check` did not ask for a buying migration.

## NEW failures

`test_close_model_fit.py` and `test_won_to_po.py` are not on `f6fd6051`.

- `apps/buying/tests/test_close_model_fit.py::CloseModelFitTests::test_sellers_with_enough_auctions_get_their_own_ratio` — `AssertionError: 'costco' unexpectedly found in {'target': '0.080', 'walmart': '0.075', 'amazon': '0.066', 'costco': '0.081', 'home depot': '0.021', 'homedepot': '0.021', 'wayfair': '0.033'}` (`3-py.log`)
- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_a_loss_is_recorded` — `psycopg2.errors.UniqueViolation: duplicate key value violates unique constraint "inventory_vendor_code_key"` (`3-py.log`)
- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_a_new_seller_gets_a_vendor` — same `inventory_vendor_code_key` (`3-py.log`)
- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_a_second_win_is_refused` — same (`3-py.log`)
- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_a_win_makes_the_po_with_the_manifest_on_it` — same (`3-py.log`)
- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_columns_follow_an_earlier_po_from_the_vendor_so_its_template_still_matches` — same (`3-py.log`)
- `apps/buying/tests/test_won_to_po.py::WonToPoTests::test_report_card_compares_prediction_with_what_sold` — same (`3-py.log`)

The marketplace-slug collisions, the category-stats collisions, and `test_success_saves_rows_maps_and_values` (20.0 != 19.98) from R-059 pass on this snapshot.

## Baseline

Nothing added.

## Now passing

None of the baseline keys. The R-059 buying failures that pass here were not baseline keys.
