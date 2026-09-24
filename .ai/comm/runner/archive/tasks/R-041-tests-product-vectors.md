> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-041 · Tests: product vectors (pgvector) and similar products

- **Type:** test · **Snapshot ref:** `refs/runner/R-041` (`93a43dbb`) · **Compare-to:** `41a77c23` (v2.100.0, production)
- **Deps: the new Python packages** `pgvector==0.4.2` and `fastembed==0.7.4` are in `requirements.txt`. They're already installed in the main `venv` the protocol uses. If an import fails, report it as BLOCKED. Don't install anything.
- **Postgres:** pgvector 0.8.1 is now built into the local PostgreSQL 18, so test databases can create the extension.
- **What changed (on top of R-038):**
  - `inventory/0099` creates the vector extension in the connection's schema and a `ProductVector` table with an HNSW index;
  - `services/product_vectors.py`, the `embed_products` command, and `/api/inventory/similar-products/`;
  - the prod-pull script now creates the extensions before the restore.

## Run
1. `py: apps/inventory apps/pos`
2. `migrations-check`

## Expect
- `test_product_vectors.py` passes. It uses a fake embedder, so it never downloads a model.
- R-038's tests still pass.
- Report whether `0099` applied cleanly in the test database (schema `public` there). List any NEW failure in POS or processing separately.
