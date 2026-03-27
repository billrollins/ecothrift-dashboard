<!-- Archived 2026-03-28: disposition=pending paused off main index (Phase 2 seed TBD) -->
<!-- initiative: slug=historical-data-export status=pending updated=2026-03-28 -->
<!-- Last updated: 2026-03-28T15:00:00-05:00 -->
# Historical Data Export (→ V3 seed)

## Status

| Phase | What | State |
|-------|------|--------|
| **1 — Extract** | DB1 + DB2 → pickles under `workspace/notebooks/historical-data/pickle/` + discovery notebook | **Done** |
| **2 — Seed V3** | Migration path from pickles into Django models; what to load for ops vs data science; 2025–2026 reporting slice | **Pending** |

## Phase 1 — What shipped

- **Notebooks layout:** Shared config in [`workspace/notebooks/_shared/`](../../../../workspace/notebooks/_shared/README.md); project folders `historical-data/`, `db-explorer/`, `bstock-scraper/`.
- **`schema_discovery.ipynb`** — Full schema discovery for DB1/DB2 (saved outputs).
- **`export_all.ipynb`** — Pulls sales, inventory, orders/manifests, POS, templates, etc. → `pickle/db1/*.pkl`, `pickle/db2/*.pkl`.
- **`pickle/manifest.json`** — Row/col counts; re-runnable cell at end of `export_all.ipynb` refreshes manifest **with column names** for every pickle.
- **Docs:** Paths updated in `.ai/context.md`, `databases.md`, `development.md`, `train_price_model` / `categorizer` hints.

## Phase 2 — Next (pending): seed & migration

**Goals**

1. **Clean V3 operational DB** — Production dashboard is not a full clone of legacy; only load what the app needs for live workflows.
2. **Historical slice for reporting (2025–2026)** — Enough structured data to run revenue/category/cashier-style reports for the period you care about, without importing all legacy rows blindly.
3. **Data science / ML corpus (retain separately or in dedicated tables)** — Subset of pickles or derived tables for:
   - **Naming / titles / brands** — Better product and item text for suggestions and matching.
   - **Categorization** — Train or validate classifiers using legacy `product_attrs` + manifest category/subcategory + sold outcomes.
   - **Embeddings (e.g. word2vec, later sentence transformers)** — Text from multiple layers (title, brand, category, manifest line, condition strings) for **“like items”**, which can feed **price estimate**, **retail value hints**, and **category suggestions**. Exact model stack TBD; may combine several feature layers over time.

**Open questions (to answer in a seed design doc or follow-on initiative)**

- Which V3 models get bulk-loaded vs generated fresh (e.g. `Item`, `Product`, `Category`, `HistoricalTransaction`, read-only fact tables)?
- What stays **only** in Parquet/CSV/pickle on S3 or a separate analytics DB vs rows in Postgres?
- Idempotency, SKU collisions, and mapping legacy keys → new PKs.

## Schema findings (reference)

### DB2 (Production) — 84 tables
- `inventory_product` has **no category column** — only `product_class_id` (all NULL). `inventory_product_class` exists but has 0 rows. `inventory_category` does not exist.
- Category text lives on **`inventory_manifest_rows`** (`category`, `subcategory`) — ~36K rows.
- ~59K items (~35K sold in DB2 era). POS, POs, CSV templates, etc. — see pickles.

### DB1 (Old Production) — 58 tables
- Category on **`product_attrs`** (`category`, `subcategory`) — ~153K rows.
- **`manifest`** lines also have category/subcategory — ~108K rows.
- Sales via `cart` / `cart_line` — see `db1/sold_items.pkl` and related.

## Deliverables — Phase 1

- [x] `workspace/notebooks/historical-data/schema_discovery.ipynb`
- [x] `workspace/notebooks/historical-data/export_all.ipynb` — full pull + manifest writer
- [x] `workspace/notebooks/historical-data/pickle/db2/*.pkl`
- [x] `workspace/notebooks/historical-data/pickle/db1/*.pkl`
- [x] `pickle/manifest.json` (with columns when manifest cell run)

## Deliverables — Phase 2 (pending)

- [ ] Document target V3 tables + field mapping from each pickle (or subset).
- [ ] Management command(s) or one-shot migration: pickle → DB (with dry-run / batch size).
- [ ] Policy for **analytics-only** retention (what lives in Postgres vs files).
- [ ] Optional: thin **reporting** schema or materialized views for 2025–2026 KPIs.

## See also

- `workspace/notebooks/historical-data/schema_discovery.ipynb`
- `workspace/notebooks/historical-data/export_all.ipynb`
- `.ai/extended/databases.md`
- `workspace/notebooks/_shared/README.md`
- `apps/inventory/management/commands/import_historical_sold.py` (prior art; may diverge for V3 seed)
