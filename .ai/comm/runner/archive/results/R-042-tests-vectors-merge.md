# R-042 · Tests: vectors (R-041 fix) and reversible product merges
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 10:06 · **Finished:** 2026-09-24 10:17 · **Status:** done · **GREEN**

Snapshot `06301be9` (`refs/runner/R-042`). Compare-to `41a77c23` (not re-run: no failures outside the baseline). Logs: `workspace/runner/R-042/`.

| Command | Totals | NEW | Known | Now passing |
|---|---|---|---|---|
| py: apps/inventory apps/pos | 84 failed, 817 passed, 627.54s, exit 1 | 0 | 80 baseline keys (79 `FAILED` nodes + 5 `SUBFAILED` on the preprocessing status-table test) | none |
| migrations-check | exit 1 | 0 | 2 webstore rename-index lines | — |

## Expect

- `test_product_vectors.py` and `test_catalog_merge.py` are not in the failure list. Passed count is 817, up from 806 on R-038 (the same suite before these tests), which matches the new tests passing. The three R-041 vector failures are gone.
- **POS:** no NEW failure. Only the two baseline delivery tests failed.
- **Processing / check-in / preprocessing:** no NEW failure. Those failures match `baseline.md`.
- **Migrations 0099 and 0100:** applied cleanly. The suite reached 100% with no migration error, and the tests that use the vector and merge tables passed. `makemigrations --check` did not ask for a new inventory migration.

## NEW failures

None.

## Baseline

Nothing added.

## Now passing

None. `test_preprocessing_status_completed_step_table_per_preprocess_status` still has five `SUBFAILED` rows.
