<!-- Last updated: 2026-04-17 (manifests: CSV upload only; order-process pull + related commands removed) -->

# Eco-Thrift Dashboard — Backend Context

**2026-04:** Buying — **Manifest ingestion is CSV upload only** (`upload_manifest` / `DELETE …/manifest/`). Anonymous order-process manifest pulls, staff **`pull_manifest`** REST actions, **`pull_manifests*`** / **`benchmark_manifest_pull`** management commands, and **`manifest_api_pipeline`** were removed. Historical **`ManifestPullLog`** rows may remain in the DB.

**v2.14.0:** Buying — **`CategoryStats.need_score_1to99`** (daily **`compute_daily_category_stats`** / **`category_stats_sql`**); auction **`need_score`** & **`priority`** = weighted mix **1–99** (**`valuation._auction_need_from_mix`**). Inventory — **`PurchaseOrder.est_shrink`** drives **`Item.cost`**; **`recompute_all_item_costs`** for backfill. Details under **inventory** and **Item acquisition cost** sections below.

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
| `apps.buying` | B-Stock auction intelligence: marketplaces, auctions, manifests, watchlist, bids, outcomes; `CategoryMapping`, **`ManifestTemplate`** (CSV header signature + column map); services **`ai_manifest_template`**, **`ai_key_mapping`**, **`manifest_upload`**; management commands `sweep_auctions`, `renormalize_manifest_rows`, `seed_category_mappings`, `seed_manifest_templates`, `seed_fast_cat_mappings`, **`create_test_auctions`** (local CSV upload test matrix), `categorize_manifests`, `watch_auctions`; **`POST /api/buying/auctions/{id}/upload_manifest/`** (multipart CSV); **`POST …/map_fast_cat_batch/`**; **`DELETE …/manifest/`**; dev-only `POST /api/buying/token/` for JWT ingest |

Root URL prefixes: `api/auth/`, `api/accounts/`, `api/core/`, `api/hr/`, `api/inventory/`, `api/ai/`, `api/pos/`, `api/consignment/`, `api/buying/` (staff auction list/detail/summary, sweep, manifest rows, upload manifest, map fast-cat batch, delete manifest, watchlist; dev-only token ingest — see Buying section below).

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
- **Optional `DATABASES['production']`:** When **`PROD_DATABASE_NAME`** (and related **`PROD_DATABASE_*`**) are set in the environment, **`ecothrift/settings.py`** registers alias **`production`** (same search path as V3). Used by **inventory** management commands that accept **`--database default|production`** and **`--no-input`** (skips interactive production confirmation) — see **`apps/inventory/management/command_db.py`**, **`recompute_all_item_costs`**, **`backfill_phase*_*`**, **`populate_item_retail_value`**, **`classify_v2_*`**. Legacy **`psycopg2`** reads for V1/V2 still use the **`default`** connection unless a command documents otherwise.
- **`Product` / `Item` ID generation:** **`Product.generate_product_number`** and **`Item.generate_sku`** accept optional **`using=`** so **`save(using='production')`** sequences against the target DB (avoids collisions when the default DB differs from the write alias).

### Metrics, scheduled jobs, and caching

#### Metrics glossary (authoritative paths)

| Metric / output | Source | Notes |
|-----------------|--------|--------|
| **Category need (1–99 per taxonomy row)** | `CategoryStats` populated by **`compute_daily_category_stats`** → SQL in **`apps/buying/services/category_stats_sql.py`**; panel rows via **`build_category_need_rows()`** in **`apps/buying/services/category_need.py`**. | **`need_score_1to99`** on `CategoryStats`; shelf/sold bar mix + **N-day** sold cohort for **want** counts; **recovery** / **avg sale–retail–cost** / **margin** use **all-time good-data** sold rows (**v2.17.0**: sale, retail, cost each **0.01–9999**). |
| **Auction `need_score` / auto `priority`** | **`apps/buying/services/valuation.py`** — **`_auction_need_from_mix()`** (weighted SUMPRODUCT of per-category **`need_score_1to99`**, clamped **1–99**). | Staff may set **`priority_override`** on **`Auction`**. |
| **`Item.cost`** | **`PurchaseOrder.est_shrink`** + listing **`Item.retail_value`** / PO retail totals — see **Item acquisition cost**; updates on PO save and on **Item** retail/PO FK change; **`recompute_all_item_costs`** for backfill only. | Not computed by daily buying batch. |
| **Profitability / fees / shipping** | **`valuation._fees_shipping_total_cost()`** + overrides on **`Auction`**; **`PricingRule`** sell-through where applicable. | |
| **Category distribution (auction)** | Manifest **`fast_cat_value`** counts or AI estimates — manifest upload, **`map_fast_cat_batch`**, delete manifest, sweep paths. | Feeds valuation mix. |
| **Shelf (“have”) / 90d sold (“want”)** | **`category_stats_sql`** aggregates from inventory + sold history (window from **`get_pricing_need_window_days()`**). | Drives need gap / bars. |
| **`ManifestRow.retail_value`** | **Per-unit MSRP** (canonical, **v2.17.1**). Set at ingest by **`apps/buying/services/normalize.py`** (API; prefers `unitRetail`, divides `extRetail / quantity` when only ext is present) and **`apps/buying/services/manifest_template.py`** **`standardize_row`** (CSV; divides `extended_retail / quantity` when only ext is mapped, warns on >2% disagreement). | **Extended retail** is **`SUM(Coalesce(quantity, 1) × retail_value)`** at query time — never stored. Computed by **`valuation._manifest_retail_sum`**, **`valuation.compute_and_save_manifest_distribution`** (per-bucket), **`api_views.annotate_auction_list_extras`** (`_manifest_retail_sum` annotation), and **`serializers.AuctionDetailSerializer.get_manifest_extended_retail_total`** (detail card). Audit with **`python manage.py diagnose_manifest_retail`**; backfill with **`python manage.py normalize_stored_manifest_retail --auction <id> --dry-run`**. |

#### Scheduled jobs (buying / inventory ops)

Heroku Scheduler (minimum) and local parity: **`.ai/extended/development.md`** — **Heroku Scheduler (buying)** table. Local batch: **`scripts/dev/daily_scheduled_tasks.bat`** runs the same commands in order; **`SKIP_BSTOCK=1`** runs only **`compute_daily_category_stats`**.

| Cadence | Command | What it refreshes |
|---------|---------|-------------------|
| **Daily** (~03:00 UTC on Heroku) | `python manage.py compute_daily_category_stats` | Upserts **`CategoryStats`** (incl. **`need_score_1to99`**); **`cache.delete('category_need_panel')`**; unless **`--skip-recompute-open`**, full **`recompute_auction_full`** for non-archived **open/closing** auctions with future **`end_time`**. |
| **Hourly** | `python manage.py scheduled_sweep` | Discovery (**`pipeline.run_discovery`**), optional AI estimate for swept IDs, **`recompute_active_auctions_lightweight`**. |
| **Third step (local bat / optional Heroku)** | `python manage.py watch_auctions` | Watchlist poll — snapshots + lightweight valuation per **`WatchlistEntry`** intervals. Documented in **development.md** as not necessarily the same Heroku clock as the table’s two rows. |
| **On-demand only** | `python manage.py recompute_all_item_costs` | Backfill **`Item.cost`** after **`est_shrink`** / data fixes — **not** daily. |

#### Django DB cache — keys, TTL, invalidation

- **Backend:** Django **database** cache (`django_cache_table` in production; tests use LocMem). **No** signal-based invalidation for inventory/item list keys — entries expire by TTL. **Exception:** **`category_need_panel`** is also **deleted** when **`compute_daily_category_stats`** runs successfully (`apps/buying/management/commands/compute_daily_category_stats.py`).

| Key | TTL (s) | Set by | Invalidation |
|-----|---------|--------|--------------|
| **`category_need_panel`** | **600** | **`GET /api/buying/category-need/`** — `cache.get_or_set` in **`apps/buying/api_views.py`**. | **Explicit `cache.delete`** in **`compute_daily_category_stats`**; otherwise TTL expiry. |
| **`item_stats_global`** | **300** | **`GET /api/inventory/items/item_stats/`** — **`apps/inventory/views.py`**. | TTL-only. |
| **`item_list_total_count`** | **300** | Unfiltered **`GET /api/inventory/items/`** pagination **`count`** — **`ecothrift/pagination.py`** (`ItemListPagination`). | TTL-only. |

### AI defaults (inventory — Bill decision, Phase 2)

- **`POST …/suggest_item/`** and **`POST …/ai_cleanup_rows/`** default the model to **`AI_MODEL_FAST`** (Haiku, e.g. `claude-haiku-4-5` in `ecothrift/settings.py`), not **`AI_MODEL`** (Sonnet). Per-request — **not** stored in the Django DB cache keys table above.
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
| **Vendor** | name, code (unique), vendor_type (liquidation/retail/direct/other), is_active. Legacy duplicate **TGT** merged into **TRGET** (migration `0018_merge_tgt_into_trget`); **TGT** row kept with `is_active=False`. |
| **Category** | name, slug, parent (self-FK), spec_template (JSON) |
| **PurchaseOrder** | vendor, order_number, status (ordered→paid→shipped→delivered→processing→complete), ordered_date, paid/shipped/delivered dates, purchase/shipping/fees, **total_cost** (sum of components), **retail_value** (B-Stock listing total — do not overwrite with sum of line retails), **est_shrink** (new POs: **`get_default_po_est_shrink()`** from **`AppSetting`** `po_default_est_shrink`, else model default **0.15**), manifest (FK core.S3File), manifest_preview (JSON) |
| **CSVTemplate** | vendor, name, header_signature, column_mappings (JSON), is_default |
| **ManifestRow** | purchase_order, row_number, quantity, description, title, brand, model, category, condition, retail_value, proposed_price, final_price, pricing_stage, pricing_notes, upc, vendor_item_number, batch_flag, search_tags, specifications (JSON), matched_product, matched_product_title, matched_product_number, match_status, match_candidates (JSON), ai_match_decision, ai_reasoning, ai_suggested_title, ai_suggested_brand, ai_suggested_model, notes |
| **Product** | product_number, title, brand, model, category, category_ref (FK Category), specifications (JSON), default_price, upc |
| **VendorProductRef** | vendor, product, vendor_item_number, vendor_description, last_unit_cost, times_seen, last_seen_date |
| **BatchGroup** | batch_number, product, purchase_order, manifest_row, total_qty, status, unit_price, **unit_cost** (legacy name — stores **manifest/vendor retail per unit**, not acquisition cost; rename to `unit_retail` planned), condition, location, processed_by/at |
| **Item** | sku (unique), product (FK), purchase_order (FK), manifest_row (FK), batch_group (FK), processing_tier, title, price, **retail_value** (vendor/manifest MSRP-style retail), **cost** (allocated from PO: `(item.retail / (PO.retail × (1 − PO.est_shrink))) × PO.total_cost` when PO has listing retail and total_cost; read-only on API), source, status, condition, location, listed_at, checked_in_at/by, sold_at |
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

## Item acquisition cost (inventory)

- **Formula (per line):** `Item.cost = (Item.retail_value / (PO.retail_value × (1 − PO.est_shrink))) × PO.total_cost`, where **`PO.retail_value`** is the **B-Stock listing** total.
- **Default `est_shrink` for new POs:** **`AppSetting`** key **`po_default_est_shrink`** (JSON number, typically **0.15**), seeded by **`setup_initial_data`**. Staff edit under **Admin → Assumptions** (`/admin/assumptions`). Changing this **does not** rewrite existing POs; **REST `POST /api/inventory/orders/`** uses **`get_default_po_est_shrink()`** in **`PurchaseOrderViewSet.perform_create`**. For **`PurchaseOrder.objects.create(...)`** in scripts/shell, pass **`est_shrink=`** explicitly or **`est_shrink=get_default_po_est_shrink()`** — the model field default alone stays **0.15** and does not read **`AppSetting`**.
- **Buying valuation (separate from PO shrink):** **`AppSetting`** **`pricing_shrinkage_factor`** — shrink on estimated auction revenue (**`get_global_shrinkage()`** in **`apps/buying/services/valuation.py`**); same typical default **0.15** as PO shrink but a different role. **`pricing_need_window_days`** — sold-items lookback for category need (**`buying_settings.get_pricing_need_window_days()`**). Both are editable on **Admin → Assumptions** and seeded by **`setup_initial_data`** / **`seed_pricing_rules`**.
- **When costs update (Django only — no Postgres triggers, no Heroku job):** Changing **`PurchaseOrder`** fields that affect **`total_cost`**, **`retail_value`**, or **`est_shrink`** runs **`recompute_item_costs()`** for that PO. Changing **`Item.retail_value`** or **`Item.purchase_order`** runs **`recompute_item_costs()`** for the affected PO(s). **`Item.cost`** is read-only on the item API.
- **Backfill command:** `python manage.py recompute_all_item_costs` (optional **`--database production`**) — **on-demand only** after bulk SQL, imports, or DB repair when rows may be stale. **Not** a scheduled task.
- **Data-quality check:** Some imports set **`PO.retail_value`** too low (e.g. cents treated as dollars) while **`notes`** embeds JSON with **`ext_retail`** at the true listing total. If **`total_cost / retail_value`** is implausibly high (near or above **1** for a truckload), compare to **`ext_retail`** (parse **`notes`** after the first `{`). Correct **`PurchaseOrder.retail_value`**, then **`recompute_all_item_costs`**; run **`compute_daily_category_stats`** so **`CategoryStats`** cost-based fields (**v2.17.0**) match. Raw SQL updates bypass **`PurchaseOrder.save()`** — **must** recompute item costs afterward.

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

- **Models:** `Marketplace`, `Auction`, `AuctionSnapshot`, `ManifestRow`, `WatchlistEntry`, `Bid`, `Outcome`, **`CategoryMapping`** (global `source_key` → taxonomy_v1 canonical name; origins `seeded` / `ai` / `manual`). **`ManifestTemplate`** (per marketplace **header signature** + **`column_map`** / **`category_fields`**, **`is_reviewed`**). **`ManifestRow`** adds **`canonical_category`**, **`category_confidence`** (`direct` / `ai_mapped` / **`fast_cat`** / `fallback`), **`manifest_template`** FK, **`fast_cat_key`** / **`fast_cat_value`**. **`fast_cat`** is set when **`fast_cat_value`** is resolved from **`CategoryMapping`** on CSV upload (**Phase 4.1A**); tier-1/3 canonical categorization is separate (**`categorize_manifest_rows`** after CSV ingest, or **`categorize_manifests`** command). **`PricingRule`**: one row per taxonomy_v1 category, **`sell_through_rate`** (legacy CSV seed; **not** used by live valuation). **`CategoryStats`**: **`recovery_rate`** (0–1, `SUM(sold_for)/SUM(retail_value)` per bucket; **v2.17.0** qualifying rows require **`sold_for`**, **`retail_value`**, **`cost`** each **0.01–9999**), **`recovery_sold_amount`** / **`recovery_retail_amount`** / **`recovery_cost_amount`**, **`good_data_sample_size`**, **`avg_sold_price`** / **`avg_retail`** / **`avg_cost`** (means on that cohort) — **live valuation** reads **`CategoryStats`** only. Staff category want-vote (**`CategoryWantVote`**) removed **2026-04**. **`Auction` (Phase 5):** **`ai_category_estimates`**, **`manifest_category_distribution`**, **`estimated_revenue`**, **`revenue_override`**, **`fees_override`**, **`shipping_override`** (nullable USD overrides; else estimated from marketplace rates × **`current_price`**), **`estimated_fees`**, **`estimated_shipping`**, **`estimated_total_cost`**, **`profitability_ratio`**, **`need_score`**, **`shrinkage_override`**, **`profit_target_override`**, **`priority`**, **`priority_override`**, **`thumbs_up`**. **`Marketplace`:** **`default_fee_rate`**, **`default_shipping_rate`** (fractions of purchase price).
- **Phase 5 (v2.8.0) — valuation design:** **`estimated_revenue`** = category mix × retail base × **`CategoryStats.recovery_rate`** per category (**no** vendor × category matrix). **`estimated_revenue`** is **pre-shrinkage**; **`revenue_override`** (USD) replaces that dollar amount for effective margin math when set (**`coalesce`**); **`profitability_ratio`** uses **effective revenue after shrinkage**. **`fees_override`** / **`shipping_override`** are **USD** only when set (no percentage mode on overrides). **Mix:** **`manifest_category_distribution`** (retail share per **`fast_cat_value`**, with row-count fallback if retail is all null/zero) takes precedence over **`ai_category_estimates`**; while mapping is partial, the **Mixed lots & uncategorized** slice is **blended** with AI title estimates. **`run_ai_estimate_for_swept_auctions`** is uncapped and skips auctions that already have AI estimates.
- **Taxonomy:** `apps/buying/taxonomy_v1.py` — `TAXONOMY_V1_CATEGORY_NAMES` (19 names; sync with `workspace/notebooks/category-research/taxonomy_v1.example.json`).
- **Commands:** `python manage.py sweep_auctions` (POST `search.bstock.com/v1/all-listings/listings` — same API as GET; max **`limit` 200**), `python manage.py renormalize_manifest_rows` (re-apply `normalize_manifest_row` to stored `ManifestRow.raw_data` — no live B-Stock; optional `--auction-id`, `--marketplace`, `--limit`, `--dry-run`), **`python manage.py seed_category_mappings`** (loads rules from `workspace/notebooks/category-research/cr/taxonomy_estimate.py`; refuses when `DEBUG` is False unless `--force`), **`python manage.py seed_manifest_templates`** (four Phase 4.1A reviewed templates: Target 17-col, Walmart 13-col, Amazon 16-col, Amazon 17-col; refuses when `DEBUG` is False unless `--force`), **`python manage.py seed_fast_cat_mappings`** (343 consultant-reviewed **`fast_cat_key`** → **`canonical_category`** rows inlined in the command — **Target beauty-heavy**, **Walmart** general merch, **Amazon** mixed; not exhaustive for every vendor category path), **`python manage.py create_test_auctions`** (10 placeholder auctions for local CSV upload testing without B-Stock API calls), **`python manage.py categorize_manifests`** (tier 1 + tier 3; **`--ai`** for Claude tier 2 with **`--ai-limit`** default 10), `python manage.py watch_auctions` (JWT: batch `GET auction.bstock.com/v1/auctions` with comma-separated `listingId`; writes `AuctionSnapshot`, updates `Auction`, sets `WatchlistEntry.last_polled_at`; flags `--dry-run`, `--auction-id`, `--force`). **`python manage.py seed_pricing_rules`** — loads **`PricingRule`** from `workspace/data/sell_through_by_category.csv` and ensures **`AppSetting`** keys: **`pricing_shrinkage_factor`**, **`pricing_profit_factor`**, **`pricing_need_window_days`**. **`python manage.py seed_marketplace_pricing_defaults`** — sets **`Marketplace.default_fee_rate`** / **`default_shipping_rate`** from optional CSV `workspace/data/marketplace_pricing_defaults.csv` (`slug`, `default_fee_rate`, `default_shipping_rate`) or built-in placeholders for known slugs. **`python manage.py estimate_auction_categories`** — runs **`estimate_batch`** for given auction PKs (Claude fast); **`--missing-both`** selects open/closing auctions with neither **`ai_category_estimates`** nor **`manifest_category_distribution`** (default cap **500** unless **`--limit`**). **`python manage.py recompute_buying_valuations`** — recomputes all open/closing auctions (run after **`seed_pricing_rules`** or data changes; seed command does not auto-recompute). **Heroku Scheduler:** run `watch_auctions` on a cadence **longer** than worst-case runtime (e.g. every 10+ minutes); server must have a valid JWT in `workspace/.bstock_token` or `BSTOCK_AUTH_TOKEN`.
- **Services:** `apps.buying.services.scraper`, `normalize` (maps nested B-Stock `attributes`, `attributes.ids`, `uniqueIds`, `categories`, `itemCondition`, etc. to `ManifestRow` columns), `pipeline`, **`categorize_manifest`** (tier 1 + 3), **`category_ai`** (optional Claude tier 2; `ANTHROPIC_API_KEY`, `BUYING_CATEGORY_AI_MODEL` → `AI_MODEL`), **`ai_manifest_template`** (Claude template proposal), **`ai_key_mapping`** (Claude batch `fast_cat_key` → taxonomy_v1), **`manifest_upload`**, **`buying_settings`** (read **`pricing_need_window_days`**), **`category_need`** (`taxonomy_bucket_for_item`, **`build_category_need_rows`** for inventory aggregates), **`valuation`** (**`recompute_auction_valuation`** refreshes manifest mix when **`has_manifest`**, **`recompute_all_open_auctions`**, **`compute_and_save_manifest_distribution`** retail-weighted, **`get_valuation_source`**, **`run_ai_estimate_for_swept_auctions`** uncapped / skip existing AI), **`ai_title_category_estimate`** (**`estimate_batch`**, `AI_MODEL_FAST` few-shot; cached system block with taxonomy + rules + JSON schema sized above Haiku **2048**-token cache minimum; per-vendor few-shot drops rows where **`Mixed lots & uncategorized` ≥ 80%** and skips entirely when vendor has no clean examples; output rows keyed by **`auction_id`** only — **`title_echo`** removed)
- **Core AI logging:** `apps/core/services/ai_usage_log.py` — `workspace/logs/ai_usage.jsonl`, `AI_PRICING` in `ecothrift/settings.py`
- **Settings:** `workspace/.bstock_token` (from `python manage.py bstock_token`) preferred over `BSTOCK_AUTH_TOKEN`; `BUYING_REQUEST_DELAY_SECONDS`, `BSTOCK_MAX_RETRIES`, `BSTOCK_SEARCH_MAX_PAGES`; **`AI_MODEL`**, **`AI_MODEL_FAST`**, **`AI_PRICING`** (see `ecothrift/settings.py`, `.env.example`). Bookmarklet: `apps/buying/bookmarklet/bstock_elt_bookmarklet.md`
- **Sweep / search debug (no Django):** `python workspace/test_bstock_api.py` — POST `search.bstock.com/v1/all-listings/listings` with the same JSON body and browser-like headers as `apps.buying.services.scraper.discover_auctions` (default Target `storeFrontId`). Use to see HTTP status, extracted listing count, and sample titles without app code or JWT.
- **Dev:** `POST /api/buying/token/` saves JWT to `workspace/.bstock_token` (DEBUG or localhost only)
- **API (staff):** `GET/POST` sweep (after discovery: optional AI title estimates for swept auctions without a manifest mix or existing AI estimates + **`recompute_all_open_auctions`** summary fields); `GET` auctions (list; ordering includes **`priority`**, **`estimated_revenue`**, **`profitability_ratio`**, **`need_score`**; filters **`thumbs_up`**, **`profitable`** (boolean → **`profitability_ratio` ≥ 1.5**), **`needed`** (boolean → **`need_score` > 0), **`has_manifest`**, marketplace/status); `GET` auctions/summary/, marketplaces/; `GET` auctions/{id}/ (`category_distribution`, optional `manifest_template_name`; valuation fields incl. **`valuation_source`**, **`has_revenue_override`**, **`effective_revenue_after_shrink`**); **`POST`/`DELETE` auctions/{id}/thumbs-up/** (Admin); **`PATCH` auctions/{id}/valuation-inputs/** (Admin: fee/shipping/revenue/shrinkage/profit/priority overrides; recomputes); `GET` manifest_rows/ (query: `search`, `category`; fields include `canonical_category`, `category_confidence`, `fast_cat_key`, `fast_cat_value`); `GET` auctions/{id}/snapshots/ (200/page); **`POST` auctions/{id}/upload_manifest/** (multipart **`file`**, **v2.7.0+**): Stage **1** — rows + template; response includes **`unmapped_key_count`**, **`total_batches`** when applicable; may run **Claude** template proposal for unknown headers; sets **`fast_cat_key`** / **`fast_cat_value`** from **`CategoryMapping`** where keys exist (**does not** invoke **`categorize_manifest_rows`**). **`POST` auctions/{id}/map_fast_cat_batch/** (body `{}` — **v2.7.0+**): one batch of up to **10** unmapped keys; **`CategoryMapping`** **`rule_origin='ai'`**. **`DELETE` auctions/{id}/manifest/** (**v2.7.0+**): deletes **`ManifestRow`** only; templates + **`CategoryMapping`** retained. **HTTP 400** if headers unknown (**`code=unknown_template`**, stub template created for admin) or template exists but **`is_reviewed=False`** (**`template_not_reviewed`**). `POST` poll/; `POST`/`DELETE` auctions/{id}/watchlist/; `GET` watchlist/ (collection; filters **`marketplace`**, **`status`**, **`has_manifest`**, watchlist **`priority`** / **`watchlist_status`**). **`GET` /api/buying/category-need/** — **`need_window_days`**, **`categories`** (19 rows: shelf/sold counts and %, **`avg_profit`** / **`profit_margin`** / **`good_data_sample_size`**, need gap, **`recovery_rate`** / **`recovery_pct`**, **`bar_scale_max`**; sorted by need gap).
- **Verification (Phase 5):** After migrate + optional **`seed_pricing_rules`** / **`seed_marketplace_pricing_defaults`**, **`GET /api/buying/category-need/`** should return **`need_window_days`** and **19** **`categories`**. Spot-check shelf/sold counts vs `inventory_item` for one taxonomy name. Upload a manifest or run **`estimate_auction_categories`** then **`GET /api/buying/auctions/{id}/`** — expect **`valuation_source`**, **`estimated_revenue`**, **`priority`**, etc.
- **UI:** Django admin at `/db-admin/`; staff React under `/buying/*` (see `frontend.md`)
