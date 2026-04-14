<!-- Last updated: 2026-04-14T22:00:00-05:00 -->

# Eco-Thrift Dashboard — Backend Context

## Project Structure

Django project with **8 apps** under `apps/`:

| App | Purpose |
|-----|---------|
| `apps.accounts` | Users, auth, profiles (Employee, Consignee, Customer) |
| `apps.core` | Shared models: WorkLocation, AppSetting, S3File, PrintServerRelease |
| `apps.hr` | HR: Departments, time entries, sick leave |
| `apps.inventory` | Vendors, purchase orders, products, items, processing, formula engine |
| `apps.ai` | Claude API proxy: chat endpoint, model list |
| `apps.pos` | Registers, drawers, carts, receipts, cash management |
| `apps.consignment` | Consignment agreements, items, payouts |
| `apps.buying` | B-Stock auction intelligence: marketplaces, auctions, manifests, watchlist, bids, outcomes; `CategoryMapping`, **`ManifestTemplate`** (CSV header signature + column map); services **`ai_manifest_template`**, **`ai_key_mapping`**, **`manifest_upload`**; management commands `sweep_auctions`, `pull_manifests`, `renormalize_manifest_rows`, `seed_category_mappings`, `seed_manifest_templates`, `seed_fast_cat_mappings`, **`create_test_auctions`** (local CSV upload test matrix), `categorize_manifests`, `watch_auctions`; **`POST /api/buying/auctions/{id}/upload_manifest/`** (multipart CSV); **`POST …/map_fast_cat_batch/`**; **`DELETE …/manifest/`**; dev-only `POST /api/buying/token/` for JWT ingest |

Root URL prefixes: `api/auth/`, `api/accounts/`, `api/core/`, `api/hr/`, `api/inventory/`, `api/ai/`, `api/pos/`, `api/consignment/`, `api/buying/` (staff auction list/detail/summary, sweep, manifest rows, pull manifest, upload manifest, map fast-cat batch, delete manifest, watchlist; dev-only token ingest — see Buying section below).

---

## Settings Highlights

- **Database**: PostgreSQL (`ecothrift_v3` default)
- **Auth**: `AUTH_USER_MODEL = 'accounts.User'`
- **REST Framework**:
  - `DEFAULT_AUTHENTICATION_CLASSES`: `JWTAuthentication`
  - `DEFAULT_PERMISSION_CLASSES`: `IsAuthenticated`
  - `DEFAULT_PAGINATION_CLASS`: `PageNumberPagination`, `PAGE_SIZE = 50`
  - `DEFAULT_FILTER_BACKENDS`: `DjangoFilterBackend`, `SearchFilter`, `OrderingFilter`
- **SimpleJWT**:
  - `ACCESS_TOKEN_LIFETIME`: 30 minutes
  - `REFRESH_TOKEN_LIFETIME`: 7 days
  - `ROTATE_REFRESH_TOKENS`: True
  - `BLACKLIST_AFTER_ROTATION`: True
- **Timezone**: `America/Chicago`, `USE_TZ = True`
- **CORS**: `localhost:5173`, `CORS_ALLOW_CREDENTIALS = True`
- **Static**: WhiteNoise, optional S3 for media
- **Optional `DATABASES['production']`:** When **`PROD_DATABASE_NAME`** (and related **`PROD_DATABASE_*`**) are set in the environment, **`ecothrift/settings.py`** registers alias **`production`** (same search path as V3). Used by **inventory** management commands that accept **`--database default|production`** and **`--no-input`** (skips interactive production confirmation) — see **`apps/inventory/management/command_db.py`**, **`recompute_cost_pipeline`**, **`backfill_phase*_*`**, **`populate_item_retail_value`**, **`classify_v2_*`**. Legacy **`psycopg2`** reads for V1/V2 still use the **`default`** connection unless a command documents otherwise.
- **`Product` / `Item` ID generation:** **`Product.generate_product_number`** and **`Item.generate_sku`** accept optional **`using=`** so **`save(using='production')`** sequences against the target DB (avoids collisions when the default DB differs from the write alias).

### Caching and memory (Django DB cache)

- **Backend:** Django **database** cache (`django_cache_table` in production; tests use LocMem). **TTL-only** — **no** signal-based invalidation when underlying data changes; cache entries expire on timeout.
- **Approximate TTLs (seconds):**
  - **`item_stats_global`** (inventory **`item_stats`** aggregate block): **300** (`apps/inventory/views.py`).
  - **`category_need_panel`** (**`GET /api/buying/category-need/`**): **600** (`apps/buying/api_views.py`).
  - **`item_list_total_count`** (DRF pagination **`count`** for **unfiltered** item list): **300** (`ecothrift/pagination.py`).

### AI defaults (inventory — Bill decision, Phase 2)

- **`POST …/suggest_item/`** and **`POST …/ai_cleanup_rows/`** default the model to **`AI_MODEL_FAST`** (Haiku, e.g. `claude-haiku-4-5` in `ecothrift/settings.py`), not **`AI_MODEL`** (Sonnet).
- **`suggest_item`** includes the **canonical taxonomy_v1 category list** in the prompt; on an **invalid** category from the model, the server **retries once** with a stricter instruction; if still invalid, category falls back to **`Mixed lots & uncategorized`** (`apps/inventory/views.py`).

---

## App Models

### accounts

| Model | Key Fields |
|-------|------------|
| **User** | email (unique), first_name, last_name, phone, is_active, is_staff, date_joined, updated_at; `role` property (first group), `roles` property (all groups as list) |
| **EmployeeProfile** | user (1:1), employee_number, department (FK hr.Department), position, employment_type, pay_rate, hire_date, termination_date, **termination_type** (choices: voluntary_resignation, job_abandonment, retirement, layoff, etc.), **termination_notes**, work_location (FK core.WorkLocation) |
| **ConsigneeProfile** | user (1:1), consignee_number, commission_rate, payout_method, status (active/paused/closed), join_date |
| **CustomerProfile** | user (1:1), customer_number, customer_since |

### core

| Model | Key Fields |
|-------|------------|
| **WorkLocation** | name, address, phone, timezone (default America/Chicago), is_active |
| **AppSetting** | key, value (JSON), description, updated_by |
| **S3File** | key, filename, size, content_type, uploaded_by |
| **PrintServerRelease** | version, s3_file (FK S3File), release_notes, is_current |

### hr

| Model | Key Fields |
|-------|------------|
| **Department** | name, location (FK core.WorkLocation), manager (FK User), is_active |
| **TimeEntry** | employee (FK User), date, clock_in, clock_out, break_minutes, total_hours, status (pending/approved/flagged), approved_by |
| **SickLeaveBalance** | employee, year, hours_earned, hours_used; ANNUAL_CAP 56h |
| **SickLeaveRequest** | employee, start_date, end_date, hours_requested, status (pending/approved/denied), reviewed_by |
| **TimeEntryModificationRequest** | time_entry (FK TimeEntry), employee (FK User), requested_clock_in/out, requested_break_minutes, reason, status (pending/approved/denied), reviewed_by, review_note |

### inventory

| Model | Key Fields |
|-------|------------|
| **Vendor** | name, code (unique), vendor_type (liquidation/retail/direct/other), is_active; **shrinkage_rate** (true shrink after misfit share removal), **misfit_rate** (untracked/misfit share of PO retail gap), **avg_sell_through**, **avg_fulfillment** — computed by `compute_vendor_metrics` from costed non-MISFIT POs. Legacy duplicate **TGT** merged into **TRGET** (migration `0018_merge_tgt_into_trget`); **TGT** row kept with `is_active=False`. |
| **Category** | name, slug, parent (self-FK), spec_template (JSON) |
| **PurchaseOrder** | vendor, order_number, status (ordered→paid→shipped→delivered→processing→complete), ordered_date, paid/shipped/delivered dates, purchase/shipping/fees, **total_cost** (sum of components), **retail_value**, **shrink_retail_est**, **mistracked_retail**, **misfit_sales_amt** (computed by `compute_po_cost_analysis`; exclude MISFIT POs `order_number` starting with `MISFIT`), manifest (FK core.S3File), manifest_preview (JSON) |
| **CSVTemplate** | vendor, name, header_signature, column_mappings (JSON), is_default |
| **ManifestRow** | purchase_order, row_number, quantity, description, title, brand, model, category, condition, retail_value, proposed_price, final_price, pricing_stage, pricing_notes, upc, vendor_item_number, batch_flag, search_tags, specifications (JSON), matched_product, matched_product_title, matched_product_number, match_status, match_candidates (JSON), ai_match_decision, ai_reasoning, ai_suggested_title, ai_suggested_brand, ai_suggested_model, notes |
| **Product** | product_number, title, brand, model, category, category_ref (FK Category), specifications (JSON), default_price, upc |
| **VendorProductRef** | vendor, product, vendor_item_number, vendor_description, last_unit_cost, times_seen, last_seen_date |
| **BatchGroup** | batch_number, product, purchase_order, manifest_row, total_qty, status, unit_price, **unit_cost** (legacy name — stores **manifest/vendor retail per unit**, not acquisition cost; rename to `unit_retail` planned), condition, location, processed_by/at |
| **Item** | sku (unique), product (FK), purchase_order (FK), manifest_row (FK), batch_group (FK), processing_tier, title, price, **retail_value** (vendor/manifest MSRP-style retail), **cost** (nullable — allocated acquisition cost from PO via **`compute_item_cost`** / **`recompute_cost_pipeline**`; read-only on API), source, status, condition, location, listed_at, checked_in_at/by, sold_at |
| **ProcessingBatch** | purchase_order, status, total_rows, processed_count, items_created |
| **ItemHistory** | item, event_type, old_value, new_value, note, created_by, created_at |
| **ItemScanHistory** | item, scanned_at, ip_address, source (public_lookup/pos_terminal) |

### pos

| Model | Key Fields |
|-------|------------|
| **Register** | location (FK core.WorkLocation), name, code, starting_cash, starting_breakdown |
| **Drawer** | register, date, status (open/closed), current_cashier, opened_by, opening_count, closing_count, cash_sales_total, variance |
| **DrawerHandoff** | drawer, outgoing_cashier, incoming_cashier, counted_at, count, variance |
| **CashDrop** | drawer, amount, total, dropped_by |
| **SupplementalDrawer** | location (1:1 WorkLocation), current_balance, current_total |
| **SupplementalTransaction** | supplemental, transaction_type (draw/return/audit_adjustment), amount, related_drawer |
| **BankTransaction** | location, transaction_type (deposit/change_pickup), amount, status |
| **Cart** | drawer, cashier, customer, status (open/completed/voided), subtotal, tax_rate, tax_amount, total, payment_method |
| **CartLine** | cart, item (FK inventory.Item), description, quantity, unit_price, line_total |
| **Receipt** | cart (1:1), receipt_number, printed, emailed |
| **RevenueGoal** | location, date, goal_amount |

### consignment

| Model | Key Fields |
|-------|------------|
| **ConsignmentAgreement** | consignee (FK User), agreement_number, commission_rate, status (active/paused/closed), start_date, end_date |
| **ConsignmentItem** | agreement, item (1:1 FK inventory.Item), asking_price, listed_price, status (pending_intake→sold), received_at, listed_at, sold_at, store_commission, consignee_earnings |
| **ConsignmentPayout** | consignee, payout_number, period_start/end, items_sold, total_sales, total_commission, payout_amount, status (pending/paid), payment_method |

---

## App Relationships

```
User (accounts)
  ├── EmployeeProfile → hr.Department, core.WorkLocation
  ├── ConsigneeProfile
  └── CustomerProfile

core.WorkLocation
  ├── hr.Department
  ├── pos.Register
  ├── pos.SupplementalDrawer (1:1)
  └── pos.BankTransaction, pos.RevenueGoal

inventory.PurchaseOrder → inventory.Vendor, core.S3File
inventory.ManifestRow → inventory.PurchaseOrder
inventory.Product → inventory.Category (optional)
inventory.VendorProductRef → inventory.Vendor, inventory.Product
inventory.BatchGroup → inventory.Product, inventory.PurchaseOrder, inventory.ManifestRow
inventory.Item → inventory.Product, inventory.PurchaseOrder, inventory.ManifestRow, inventory.BatchGroup
inventory.ProcessingBatch → inventory.PurchaseOrder
inventory.ItemHistory, inventory.ItemScanHistory → inventory.Item

pos.Drawer → pos.Register, User
pos.Cart → pos.Drawer, User, inventory.Item (via CartLine)
pos.Receipt → pos.Cart

consignment.ConsignmentAgreement → User (consignee)
consignment.ConsignmentItem → ConsignmentAgreement, inventory.Item (1:1)
consignment.ConsignmentPayout → User (consignee)
```

---

## Key Patterns

### ViewSets + DRF Routers

- Each app uses `DefaultRouter` and `router.register()` for CRUD endpoints.
- Example: `api/pos/drawers/`, `api/pos/drawers/<id>/`, etc.

### Custom Endpoints

- **`@action(detail=True, methods=['patch'])`** on ViewSets for sub-resource updates (e.g. `users/<id>/employee_profile/`).
- **Function-based views** for non-CRUD endpoints (e.g. `dashboard/metrics/`, `my/items/`, `my/payouts/`, `my/summary/`).

### Permission Classes

- Default: `IsAuthenticated`.
- Custom: `IsAdmin`, `IsManager`, `IsManagerOrAdmin`, `IsEmployee`, `IsConsignee`, `IsStaff`.
- Applied per ViewSet or view via `permission_classes`.

### Timestamps

- All `created_at` / `updated_at` use `auto_now_add` / `auto_now`; stored in `America/Chicago` (USE_TZ=True).

---

## Nightly cost pipeline (`apps/inventory/management/commands/`)

- **`compute_vendor_metrics`** — Sets `Vendor.avg_sell_through`, `avg_fulfillment` from item retail on costed non-MISFIT POs (`total_cost > 0`). Sold retail uses **one `retail_value` per item** (distinct items with a completed `CartLine`). For **marketplace** vendor codes (`AMZ`, `CST`, `ESS`, `HMD`, `TRGET`, `WAL`, `WFR`), splits the PO retail gap into **`misfit_rate`** (orphan POS lines vs global missing retail) and **`shrinkage_rate`** (remainder — true shrink). Other vendors: **`shrinkage_rate`** = legacy composite (1 minus sold item retail over total item retail), **`misfit_rate`** = null.
- **`compute_po_cost_analysis`** — Per non-MISFIT costed PO: `shrink_retail_est`, `mistracked_retail`; distributes **`misfit_sales_amt`** from POS lines with no `item_id` proportional to mistracked retail. MISFIT POs get `misfit_sales_amt = 0`.
- **`compute_item_cost`** — Retail-weighted allocation of `po.total_cost` to **sold** items (`retail_value > 0`, completed cart line); unsold and MISFIT PO items get `cost = null`. Idempotent: clears `cost` on affected items before writing.
- **`recompute_cost_pipeline`** — Runs all three; **`--dry-run`**, **`--vendor-only`**, **`--po-only`** (stops after PO analysis).
- **Heroku Scheduler:** run `python manage.py recompute_cost_pipeline` nightly (Bill configures schedule).

---

## Inventory Backend Updates (Post-1.4.0 UX Pass)

- Added guarded order reset workflow on `PurchaseOrderViewSet`:
  - `GET /api/inventory/orders/:id/delete-preview/`
  - `POST /api/inventory/orders/:id/purge-delete/` (requires `confirm_order_number`)
- Purge flow deletes order-owned artifacts in reverse operational sequence:
  1) `ItemHistory`, 2) `ItemScanHistory`, 3) `Item`,
  4) `BatchGroup`, 5) `ProcessingBatch`, 6) `ManifestRow`,
  7) manifest `S3File` (only if not referenced by another order), 8) `PurchaseOrder`.
- Shared catalog entities are intentionally retained during purge:
  - `Product`
  - `VendorProductRef`
  - `CSVTemplate`
- Enhanced preprocessing preview endpoints for full-dataset search + capped preview result windows:
  - `GET /api/inventory/orders/:id/manifest-rows/?search=...&limit=100`
    - searches full raw manifest rows server-side,
    - returns top N rows and `row_count_filtered`.
  - `POST /api/inventory/orders/:id/preview-standardize/` with `search_term`
    - filters full normalized row set server-side,
    - returns top preview rows with filtered count metadata.

---

## AI App (`apps/ai/`) — Added v1.6.0

- **`GET /api/ai/models/`** — Returns curated list of available Claude models (`claude-sonnet-4-6`, `claude-haiku-4-5`)
- **`POST /api/ai/chat/`** — Proxies to Anthropic Claude API. Accepts `model`, `system`, `messages`, `max_tokens`.
- `anthropic` library is lazy-imported to prevent startup crash if not installed.
- `ANTHROPIC_API_KEY` loaded from Django settings / `.env`.

## Inventory AI Endpoints — Added v1.6.0

- **`POST /api/inventory/orders/:id/ai-cleanup-rows/`** — Sends manifest rows to Claude in batches for title/brand/model/specs cleanup. Accepts `model`, `batch_size`, `offset`. Returns `{ rows_processed, total_rows, offset, suggestions, model_used, has_more }`.
- **`GET /api/inventory/orders/:id/ai-cleanup-status/`** — Returns `{ total_rows, cleaned_rows, remaining_rows }`.
- **`POST /api/inventory/orders/:id/cancel-ai-cleanup/`** — Clears all AI-generated fields on manifest rows.
- **`POST /api/inventory/orders/:id/suggest-formulas/`** — AI suggests expression formulas for standard fields given manifest headers and sample data.
- **`POST /api/inventory/orders/:id/match-products/`** — Fuzzy scoring (UPC, VendorRef, text similarity) + AI batch decisions.
- **`POST /api/inventory/orders/:id/review-matches/`** — User submits accept/reject/modify decisions for match results.
- **`GET /api/inventory/orders/:id/match-results/`** — Returns all rows with candidates, AI decisions, scores.

## Expression Formula Engine (`apps/inventory/formula_engine.py`) — Added v1.6.0

- Tokenizer + recursive descent parser + AST evaluator
- Column refs: `[COLUMN_NAME]`, Functions: `UPPER()`, `LOWER()`, `TITLE()`, `TRIM()`, `REPLACE()`, `CONCAT()`, `LEFT()`, `RIGHT()`
- String concatenation with `+`, quoted string literals
- `evaluate_formula(formula_str, row_dict) -> str` public entry point
- `normalize_row()` in views.py checks for `formula` key (new path) vs `source` + `transforms` (legacy path)

## Buying / B-Stock (`apps/buying/`) — Added v2.3.0

- **Models:** `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`, **`CategoryMapping`** (global `source_key` → taxonomy_v1 canonical name; origins `seeded` / `ai` / `manual`). **`ManifestTemplate`** (per marketplace **header signature** + **`column_map`** / **`category_fields`**, **`is_reviewed`**). **`ManifestRow`** adds **`canonical_category`**, **`category_confidence`** (`direct` / `ai_mapped` / **`fast_cat`** / `fallback`), **`manifest_template`** FK, **`fast_cat_key`** / **`fast_cat_value`**. **`fast_cat`** is set when **`fast_cat_value`** is resolved from **`CategoryMapping`** on CSV upload (**Phase 4.1A**); tier-1/3 canonical categorization is separate (**`categorize_manifest_rows`** after **`pull_manifest`**, or **`categorize_manifests`** command). **`PricingRule`**: one row per taxonomy_v1 category, **`sell_through_rate`** (flat rates for Phase 5 sumproduct). **`CategoryWantVote`**: staff **`value`** 1–10 per category, **`voted_at`**. **`Auction` (Phase 5):** **`ai_category_estimates`**, **`manifest_category_distribution`**, **`estimated_revenue`**, **`revenue_override`**, **`fees_override`**, **`shipping_override`** (nullable USD overrides; else estimated from marketplace rates × **`current_price`**), **`estimated_fees`**, **`estimated_shipping`**, **`estimated_total_cost`**, **`profitability_ratio`**, **`need_score`**, **`shrinkage_override`**, **`profit_target_override`**, **`priority`**, **`priority_override`**, **`thumbs_up`**. **`Marketplace`:** **`default_fee_rate`**, **`default_shipping_rate`** (fractions of purchase price).
- **Phase 5 (v2.8.0) — valuation design:** **`PricingRule`** uses **flat** per-category sell-through (**no** vendor × category matrix). **`estimated_revenue`** is **pre-shrinkage**; **`revenue_override`** (USD) replaces that dollar amount for effective margin math when set (**`coalesce`**); **`profitability_ratio`** uses **effective revenue after shrinkage**. **`fees_override`** / **`shipping_override`** are **USD** only when set (no percentage mode on overrides). **Mix:** **`manifest_category_distribution`** before **`ai_category_estimates`**; manifest plumbing shipped before AI-only **`estimate_batch`**.
- **Taxonomy:** `apps/buying/taxonomy_v1.py` — `TAXONOMY_V1_CATEGORY_NAMES` (19 names; sync with `workspace/notebooks/category-research/taxonomy_v1.example.json`).
- **Commands:** `python manage.py sweep_auctions` (POST `search.bstock.com/v1/all-listings/listings` — same API as GET; max **`limit` 200**), `python manage.py pull_manifests` (`order-process.bstock.com/v1/manifests/{lotId}`; after save, **tier 1 + tier 3** categorization runs for new manifest rows), `python manage.py renormalize_manifest_rows` (re-apply `normalize_manifest_row` to stored `ManifestRow.raw_data` — no JWT; optional `--auction-id`, `--marketplace`, `--limit`, `--dry-run`), **`python manage.py seed_category_mappings`** (loads rules from `workspace/notebooks/category-research/cr/taxonomy_estimate.py`; refuses when `DEBUG` is False unless `--force`), **`python manage.py seed_manifest_templates`** (four Phase 4.1A reviewed templates: Target 17-col, Walmart 13-col, Amazon 16-col, Amazon 17-col; refuses when `DEBUG` is False unless `--force`), **`python manage.py seed_fast_cat_mappings`** (343 consultant-reviewed **`fast_cat_key`** → **`canonical_category`** rows inlined in the command — **Target beauty-heavy**, **Walmart** general merch, **Amazon** mixed; not exhaustive for every vendor category path), **`python manage.py create_test_auctions`** (10 placeholder auctions for local CSV upload testing without B-Stock API calls), **`python manage.py categorize_manifests`** (tier 1 + tier 3; **`--ai`** for Claude tier 2 with **`--ai-limit`** default 10), `python manage.py watch_auctions` (JWT: batch `GET auction.bstock.com/v1/auctions` with comma-separated `listingId`; writes `AuctionSnapshot`, updates `Auction`, sets `WatchlistEntry.last_polled_at`; flags `--dry-run`, `--auction-id`, `--force`). **`python manage.py seed_pricing_rules`** — loads **`PricingRule`** from `workspace/data/sell_through_by_category.csv` and ensures **`AppSetting`** keys: **`pricing_shrinkage_factor`**, **`pricing_profit_factor`**, **`pricing_need_window_days`**, **`buying_want_vote_decay_per_day`**. **`python manage.py seed_marketplace_pricing_defaults`** — sets **`Marketplace.default_fee_rate`** / **`default_shipping_rate`** from optional CSV `workspace/data/marketplace_pricing_defaults.csv` (`slug`, `default_fee_rate`, `default_shipping_rate`) or built-in placeholders for known slugs. **`python manage.py estimate_auction_categories`** — runs **`estimate_batch`** for given auction PKs (Claude fast). **`python manage.py recompute_buying_valuations`** — recomputes all open/closing auctions (run after **`seed_pricing_rules`** or data changes; seed command does not auto-recompute). **Heroku Scheduler:** run `watch_auctions` on a cadence **longer** than worst-case runtime (e.g. every 10+ minutes); server must have a valid JWT in `workspace/.bstock_token` or `BSTOCK_AUTH_TOKEN`.
- **Services:** `apps.buying.services.scraper`, `normalize` (maps nested B-Stock `attributes`, `attributes.ids`, `uniqueIds`, `categories`, `itemCondition`, etc. to `ManifestRow` columns), `pipeline`, **`categorize_manifest`** (tier 1 + 3), **`category_ai`** (optional Claude tier 2; `ANTHROPIC_API_KEY`, `BUYING_CATEGORY_AI_MODEL` → `AI_MODEL`), **`ai_manifest_template`** (Claude template proposal), **`ai_key_mapping`** (Claude batch `fast_cat_key` → taxonomy_v1), **`manifest_upload`**, **`buying_settings`** (read **`pricing_need_window_days`**, **`buying_want_vote_decay_per_day`**), **`category_need`** (`taxonomy_bucket_for_item`, **`build_category_need_rows`** for inventory aggregates), **`want_vote`** (**`effective_want_value`** — step decay toward 5), **`valuation`** (**`recompute_auction_valuation`**, **`recompute_all_open_auctions`**, **`compute_and_save_manifest_distribution`**, **`get_valuation_source`**, **`run_ai_estimate_for_swept_auctions`**), **`ai_title_category_estimate`** (**`estimate_batch`**, `AI_MODEL_FAST` few-shot)
- **Core AI logging:** `apps/core/services/ai_usage_log.py` — `workspace/logs/ai_usage.jsonl`, `AI_PRICING` in `ecothrift/settings.py`
- **Settings:** `workspace/.bstock_token` (from `python manage.py bstock_token`) preferred over `BSTOCK_AUTH_TOKEN`; `BUYING_REQUEST_DELAY_SECONDS`, `BSTOCK_MAX_RETRIES`, `BSTOCK_SEARCH_MAX_PAGES`; **`AI_MODEL`**, **`AI_MODEL_FAST`**, **`AI_PRICING`** (see `ecothrift/settings.py`, `.env.example`). Bookmarklet: `apps/buying/bookmarklet/bstock_elt_bookmarklet.md`
- **Sweep / search debug (no Django):** `python workspace/test_bstock_api.py` — POST `search.bstock.com/v1/all-listings/listings` with the same JSON body and browser-like headers as `apps.buying.services.scraper.discover_auctions` (default Target `storeFrontId`). Use to see HTTP status, extracted listing count, and sample titles without app code or JWT.
- **Dev:** `POST /api/buying/token/` saves JWT to `workspace/.bstock_token` (DEBUG or localhost only)
- **API (staff):** `GET/POST` sweep (after discovery: optional AI title estimates for a limited batch + **`recompute_all_open_auctions`** summary fields); `GET` auctions (list; ordering includes **`priority`**, **`estimated_revenue`**, **`profitability_ratio`**, **`need_score`**; filters **`thumbs_up`**, **`profitable`** (boolean → **`profitability_ratio` ≥ 1.5**), **`needed`** (boolean → **`need_score` > 0), **`has_manifest`**, marketplace/status); `GET` auctions/summary/, marketplaces/; `GET` auctions/{id}/ (`category_distribution`, optional `manifest_template_name`; valuation fields incl. **`valuation_source`**, **`has_revenue_override`**, **`effective_revenue_after_shrink`**); **`POST`/`DELETE` auctions/{id}/thumbs-up/** (Admin); **`PATCH` auctions/{id}/valuation-inputs/** (Admin: fee/shipping/revenue/shrinkage/profit/priority overrides; recomputes); `GET` manifest_rows/ (query: `search`, `category`; fields include `canonical_category`, `category_confidence`, `fast_cat_key`, `fast_cat_value`); `GET` auctions/{id}/snapshots/ (200/page); `POST` pull_manifest/; **`POST` auctions/{id}/upload_manifest/** (multipart **`file`**, **v2.7.0+**): Stage **1** — rows + template; response includes **`unmapped_key_count`**, **`total_batches`** when applicable; may run **Claude** template proposal for unknown headers; sets **`fast_cat_key`** / **`fast_cat_value`** from **`CategoryMapping`** where keys exist (**does not** invoke **`categorize_manifest_rows`**). **`POST` auctions/{id}/map_fast_cat_batch/** (body `{}` — **v2.7.0+**): one batch of up to **10** unmapped keys; **`CategoryMapping`** **`rule_origin='ai'`**. **`DELETE` auctions/{id}/manifest/** (**v2.7.0+**): deletes **`ManifestRow`** only; templates + **`CategoryMapping`** retained. **HTTP 400** if headers unknown (**`code=unknown_template`**, stub template created for admin) or template exists but **`is_reviewed=False`** (**`template_not_reviewed`**). `POST` poll/; `POST`/`DELETE` auctions/{id}/watchlist/; `GET` watchlist/ (collection; filters **`marketplace`**, **`status`**, **`has_manifest`**, watchlist **`priority`** / **`watchlist_status`**). **`GET` /api/buying/category-need/** — **`need_window_days`**, **`categories`** (19 rows: shelf/sold counts and %, averages, need gap, **`sell_through_rate`** from **`PricingRule`**, **`bar_scale_max`**; sorted by need gap). **`GET`/`POST` /api/buying/category-want/** — per-user votes; **`effective_value`** with step decay toward 5.
- **Verification (Phase 5):** After migrate + optional **`seed_pricing_rules`** / **`seed_marketplace_pricing_defaults`**, **`GET /api/buying/category-need/`** should return **`need_window_days`** and **19** **`categories`**. Spot-check shelf/sold counts vs `inventory_item` for one taxonomy name. **`POST /api/buying/category-want/`** with `{"category":"<taxonomy name>","value":8}` then **`GET`** should return that category with **`effective_value`** near **`value`** when **`voted_at`** is recent. Upload a manifest or run **`estimate_auction_categories`** then **`GET /api/buying/auctions/{id}/`** — expect **`valuation_source`**, **`estimated_revenue`**, **`priority`**, etc.
- **UI:** Django admin at `/db-admin/`; staff React under `/buying/*` (see `frontend.md`)
