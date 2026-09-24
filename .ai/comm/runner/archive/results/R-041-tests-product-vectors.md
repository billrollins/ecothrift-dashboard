# R-041 · Tests: product vectors (pgvector) and similar products
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 09:45 · **Finished:** 2026-09-24 10:01 · **Status:** done · **RED**

Snapshot `93a43dbb` (`refs/runner/R-041`). Compare-to `41a77c23`. Logs: `workspace/runner/R-041/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/inventory apps/pos | 87 failed, 808 passed, 857.38s, exit 1 | 3 | 80 baseline keys (79 `FAILED` nodes + 5 `SUBFAILED` on the preprocessing status-table test) | none |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## Expect

- `test_product_vectors.py` does not pass. 2 of 5 tests passed (`test_sold_only_and_category_filters`, `test_api`). The other 3 failed. The fake embedder ran; there was no model download and no import error for `pgvector` or `fastembed`.
- R-038's `test_product_profile.py` is not in the failure list.
- **POS:** no NEW failure. Only the two baseline delivery tests failed.
- **Processing / check-in / preprocessing:** no NEW failure. Those failures match `baseline.md`.
- **Migration 0099:** applied cleanly in the test database (tests run with `search_path=public`). The suite reached 100% with no migration error. The vector tests queried `ProductVector` and ran a similarity lookup, so the extension and table were there. `makemigrations --check` did not ask for a new inventory migration.

## NEW failures

Compare-to `41a77c23` has no `test_product_vectors.py` (`compare-1-py.log`: `ERROR: file or directory not found`, exit 4). These are not pre-existing.

- `apps/inventory/tests/test_product_vectors.py::ProductVectorTests::test_command_runs_in_chunks` — `AssertionError: 4 != 3` (`1-py.log`)
- `apps/inventory/tests/test_product_vectors.py::ProductVectorTests::test_embed_skips_unchanged_and_refreshes_on_profile_change` — `AssertionError: {'created': 4, 'updated': 0, 'skipped': 0} != {'created': 3, 'updated': 0, 'skipped': 0}` (`1-py.log`)
- `apps/inventory/tests/test_product_vectors.py::ProductVectorTests::test_similar_by_product_and_by_text` — `AssertionError: Lists differ: [373, 1] != [373, 374]` (`1-py.log`)

## Baseline

Nothing added.

## Now passing

None. `test_preprocessing_status_completed_step_table_per_preprocess_status` still has five `SUBFAILED` rows.
