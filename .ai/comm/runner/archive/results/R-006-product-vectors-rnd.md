# R-006 result · Product vectors: what exists from the early R&D

**Status:** done. Read-only. No embedding calls. Dev DB as of 2026-09-23. Queries: `workspace/runner/R-006/query.py`, `source.py`, `auto_fill.py`.

## 1. What is in the tree

Searched the repo, `workspace/` (notebooks and `workspace/models/`), `.ai/`, and `.ai/initiatives/_archived/` for embedding, vector, pgvector, cosine, similarity, and nearest. Also `git log -S pgvector` and `git log -S text-embedding`. No sentence-embedding index, no cosine search, and no nearest-neighbor index.

Hits that are about this work:

| Where | What |
|---|---|
| `.ai/initiatives/_archived/_completed/product_item_crud_and_processing.md:54-62` | Product search v1 is token AND. "No semantic embeddings yet." Fuzzy similarity is on hold. |
| `.ai/initiatives/_archived/_completed/product_item_crud_and_processing.md:84-86` | Sentence-embedding similarity "is in progress elsewhere." Not in this repo. |
| `.ai/initiatives/bstock_daily_buying.md:150` | Says the early vector R&D worked well, and that vectors swap in later. Does not name a model, file, or table. |
| `.ai/initiatives/_archived/_pending/historical_data_export.md:30` | Planned embeddings (word2vec, later sentence transformers) for "like items." "Exact model stack TBD." |
| `apps/inventory/management/commands/train_price_model.py:15-26` and `:112-117` | TF-IDF vectors inside a price model: title 500 features, brand 200, plus one-hot category/condition/source and scaled retail. Target is `sold_for`. |
| `apps/inventory/management/commands/train_price_model.py:246-274` | Second model: title+brand TF-IDF, 2,000 features, logistic regression for category. |
| `apps/inventory/services/price_estimator.py:129-138` | "Similar" sold items are category/brand text filters, not a vector lookup. |
| `apps/inventory/services/categorizer.py:194-205` | Loads `workspace/models/category_model.joblib` if the file exists. |
| `apps/inventory/services/product_matching.py:6-12` | Live product match is exact: UPC, vendor item number, exact title+brand. Not vectors. |
| `apps/core/tests/test_ai_settings.py:193` | Test fixture named `models/text-embedding-9`. Not a product index. |

`workspace/notebooks/` has five notebooks (historical export, schema discovery, category research). None mention embedding, vector, pgvector, cosine, or similarity. No `.pkl`, `.npy`, `.parquet`, or `.joblib` under `workspace/`. `workspace/models/` does not exist.

Where the "elsewhere" sentence-embedding experiment lives: **UNKNOWN**. Not searched outside this repo.

## 2. How the in-repo vector code works

**Model.** scikit-learn `TfidfVectorizer` plus LightGBM, XGBoost, or Ridge (`train_price_model.py:112-124`, `:228-244`). Not an embedding API. Dimensions: 500 (title) + 200 (brand) for price; 2,000 for the category classifier. No cosine step.

**Storage.** The command writes `workspace/models/price_model.joblib` and `category_model.joblib` (`train_price_model.py:35`, `:157`, `:273-274`). Those files are not on disk. Nothing is stored in Postgres.

**`vector` extension.** Not installed. `pg_extension` is only `pg_trgm` 1.6 and `plpgsql` 1.0. No column of type `vector`, `halfvec`, or `sparsevec`.

**Text that would be embedded (TF-IDF, if the command were run).** Price model: item title, brand, category, condition, source, retail. Category model: `title + ' ' + brand`. Sold-price is the training target, not an embedded field.

**Matching.** No vector match. Current product match (`product_matching.py:148-163`): UPC exact (score 100), `VendorProductRef` (90), case-insensitive title+brand (80).

**Recorded results.** None in the repo. The train command prints MAE and R² only when someone runs it (`train_price_model.py:130-138`). That output was not found. **UNKNOWN** whether it was ever run here.

## 3. Products today

`Product` (`apps/inventory/models.py:1543-1564`): `product_number`, `title`, `brand`, `model`, `category` FK, `specifications` JSON, `identifiers` JSON, `tags` JSON, `is_active`, `created_at`, `updated_at`.

No flat UPC, ASIN, or SKU column. UPC is `identifiers['upc']` (`:1594-1595`). ASIN and SKU are other keys in that JSON.

| | Count |
|---|---:|
| Products | 200,079 |
| Items | 237,689 |
| Items with a product | 237,689 (FK is required, `:1807-1810`) |
| Products that have at least one item | 134,731 |

**Duplicate titles** (same lower-cased, trimmed `title`, groups of 2 or more): **53,969 groups**, **132,419 rows** in those groups (66.2% of products).

**Identifier fill** (non-blank JSON value / 200,079):

| Key | Rows | % |
|---|---:|---:|
| `product_number` (internal `PRD-#####`, not a vendor SKU) | 200,079 | 100% |
| `identifiers.upc` | 91,807 | 45.9% |
| `identifiers.item_number` | 2,992 | 1.5% |
| `identifiers.asin` | 1,965 | 1.0% |
| `identifiers.ean` | 999 | 0.5% |
| `identifiers.sku` | 798 | 0.4% |
| `model` (column, not an id) | 63,571 | 31.8% |

Other identifier keys exist under 100 rows (`tcin` 72, `model_number` 52, `mpn` 36, and smaller).

## 4. Buying manifest lines

`buying.ManifestRow` (`apps/buying/models.py:607-618`): `title`, `brand`, `model`, `sku`, `upc`. **No ASIN column.** Normalization writes ASIN, else TCIN, else item number, else SKU into `sku` (`apps/buying/services/normalize.py:371-417`).

31,904 manifest rows, all with non-empty `raw_data`. By `Auction.manifest_source`: **auto 15,179 rows / 37 auctions** (API), manual 14,515 / 27, blank 2,210 / 1.

Fill on **auto** rows (the API set):

| Field | Rows | % of 15,179 |
|---|---:|---:|
| `title` | 15,179 | 100% |
| `sku` (may be ASIN, TCIN, or item number) | 15,179 | 100% |
| `upc` | 14,832 | 97.7% |
| `brand` | 12,527 | 82.5% |
| ASIN somewhere in `raw_data` (`attributes.ids.asin`, `uniqueIds.asin`, or top-level `asin`/`ASIN`) | 694 | 4.6% |
| `sku` matching `^[A-Z0-9]{10}$` | 836 | 5.5% |
| `model` | 113 | 0.7% |

Latest 2,000 raw rows use B-Stock API keys (`attributes`, `uniqueIds`, `categories`, `palletId`, `itemCondition`). That sample was not limited to `manifest_source=auto`.

## 5. What a full embed would count

| Text | Count |
|---|---:|
| Products (every row has a title) | 200,079 |
| Distinct lower-cased titles on API manifest rows | 7,966 (from 15,179 rows) |
| Distinct titles on all buying manifest rows | 18,264 (from 31,904 rows) |
| Distinct titles on inventory `ManifestRow` | 102,402 (from 159,561 rows) |

No batch embedder. The closest batch jobs are `train_price_model` (TF-IDF price and category files, not in `workspace/models/` now) and `generate_match_candidates_for_order` in `product_matching.py:75` (exact match, per PO, not an embedding).
