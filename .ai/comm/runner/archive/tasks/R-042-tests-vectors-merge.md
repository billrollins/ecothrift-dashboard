> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-042 · Tests: vectors (R-041 fix) and reversible product merges

- **Type:** test · **Snapshot ref:** `refs/runner/R-042` (`06301be9`) · **Compare-to:** `41a77c23` (v2.100.0, production)
- **Deps:** `pgvector==0.4.2` and `fastembed==0.7.4`, already in the main `venv`. Install nothing; if an import fails, report BLOCKED.
- **What changed since R-041:**
  - `test_product_vectors.py` now scopes to its own 3 products (the test database has products seeded by data migrations);
  - new: `CatalogMerge` (`inventory/0100`), `services/catalog_merge.py`, and the `merge_duplicate_products` command, with `test_catalog_merge.py`;
  - the review queue and similar products skip inactive (merged) products.

## Run
1. `py: apps/inventory apps/pos`
2. `migrations-check`

## Expect
- `test_product_vectors.py` and `test_catalog_merge.py` pass.
- Report separately any NEW failure in POS or processing.
- Report whether `0099` and `0100` applied cleanly.
