<!-- Last updated: 2026-06-16 (v2.31.0 — processing product links and prior check-ins) -->

# Inventory Pipeline — Extended Context

This document describes the full inventory pipeline, models, and flows for the Eco-Thrift Dashboard.

---

## Design Decision: ManifestRow spine + physical check-in

**Current direction (2026-06-06):** standardize creates permanent `ManifestRow` rows as the stable audit spine; preprocessing stores cleaned (`ai_*`) and approved (`final_*`) overlays; finalize creates fast `ProcessingRow` bookmarks; real `Product` / `Item` rows are created only when staff physically check in units.

`BatchGroup` remains legacy/optional and is not the long-term bulk identity; bulk grouping should come from `manifest_row_id`, `product_id`, or both.

This preserves:
- vendor-readable manifest evidence for disputes,
- future template/data-science access to standardized vendor rows,
- fast processor search against `ProcessingRow`,
- POS scanning only after a real physical `Item` exists.

---

## Pipeline Overview

```
Vendor → PurchaseOrder → CSV upload (S3) → Standardize (expression formulas + preview) → Preprocessing staging rows → offline cleanup CSV round-trip (download → edit → apply-cleanup-csv) → Final Review (staging) → finalize-preprocessing → Processing → Check-in + print tags
```

1. **Vendor** — Source of purchased inventory (liquidation, retail, direct, other).
2. **PurchaseOrder** — Order placed with a vendor; tracks status from ordered through completion.
3. **CSV manifest upload** — Staff uploads a vendor CSV via `POST /inventory/orders/{id}/upload-manifest/`. File is saved to S3, preview persisted in `manifest_preview` JSON field. (Done on OrderDetailPage.)
4. **Standardize** (Step 1 of PreprocessingPage) — Uses persisted **`manifest_preview`** on the PO for headers/sample rows until **`POST .../process-manifest/`** commits (pulls full CSV from S3). Expression formulas map vendor columns to standard fields (preview-standardize / Formula Preview). Commit now creates/updates permanent **`ManifestRow`** rows (stable order + raw line spine, close-to-original standardized wording) and links **`PreprocessingRow.manifest_row_id`** overlays. Compatibility `standard_*` fields remain for now, but the long-term source for standardized data is `ManifestRow`.
5. **Clean** (Step 2 of PreprocessingPage) — **Primary (v2.28.0): in-app Run AI Cleanup** (`WebAiCleanupPanel` — browser pool of **`POST …/ai-cleanup-batch/`** calls, batch 10 / concurrency 4, resume via **`ai-cleanup-status`** `uncleaned_row_ids`, completion via **`ai-cleanup-complete`**). **Fallback: offline CSV** under the **Advanced** disclosure (`RowProcessingPanel` — **`GET …/download-cleanup-csv/`** exports **`row_id`** as stable **`ManifestRow.id`**; toolbar **Run Cleanup** applies in **50-row `partial: true` chunks** of **`POST …/apply-cleanup-csv/`**, then `ai-cleanup-complete`). Both paths merge into **`PreprocessingRow.ai_*`** / **`ai_title`** (optional **`ai_status`**) via the shared `services/ai_cleanup.py` helper and auto-generate **product match candidates** (`services/product_matching.py`) at completion. Local Grok harness: **`workspace/ai-cleanup-grok/`** (frozen; `.cleaned.csv` interchange). **Legacy `POST …/ai-cleanup-rows/`: 410 Gone on staging orders** — see § AI Row Cleanup below and archived initiative [`preprocessing_ai_cleanup_review`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md).
6. **Final Decisions** (Step 3 of PreprocessingPage; stepper label **Final Decisions**) — Staging-only review: **`GET/PATCH .../preprocessing-review/`** over **`PreprocessingRow`**, with standardized fallbacks from linked `ManifestRow`. Staff edits **`ai_*`** / **`final_*`** fields and pricing; substantive listing or price **`PATCH`** clears **`ai_status`** server-side. Review serializers expose **`match_candidates`**, **`final_matched_product`**, **`match_source`**, hydrated **`matched_product_detail`**, and peer **`same_product_row_numbers`**; match decisions **`PATCH`** immediately (sets `match_source='staff'`; match-only patches do **not** clear `ai_status`). **`POST …/regenerate-match-candidates/`** re-runs the P1 matcher (staff decisions preserved). Bulk pricing: **Scale AI prices** (Adjust % or Target total $, anchored to `proposed_price`) or **% of retail**; rows without a base are skipped. **`POST .../finalize-preprocessing/`** validates price + title/description, then creates/replaces **`ProcessingRow`** bookmarks linked to `manifest_row_id` **and copies the decided match to `ProcessingRow.matched_product`**; workspace row detail reads ProcessingRow match first. Design: [`.ai/reference/product_identity/product_identity_design.md`](../reference/product_identity/product_identity_design.md). Re-standardize (`bulk_clear_preprocess_ai_and_final_layers`) resets match fields along with `ai_*`/`final_*`.
7. **Eco-Thrift Receiving** — `GET /api/inventory/orders/for-receiving/` prioritizes POs by **expected_delivery** tiers for next-PO UX (**v2.20.0**). Staff open **`/inventory/receiving/:id`** from sidebar **Receiving** or the orders **Receive** control. **v2.24.1:** Receiving is operationally independent for now; staff do **not** need to complete Receiving before Processing.
8. **Processing handoff** — `ProcessingRow` is the fast processor/search surface immediately after finalize. `GET .../processing-workspace/` searches `ProcessingRow.search_string` (raw row bookmark tokens **plus** matched-product augment — both names stay searchable per design §3); list and detail payloads **coalesce identity display** (product wins title/brand/category/UPC when `ProcessingRow.matched_product` is set); row detail exposes read-only **`manifestEvidence`** when matched. The old **Create Processing Data** / chunked build path remains only as a legacy compatibility path for bookmark-only orders.
9. **Arrival check-in** — `POST .../processing-row-check-in/` creates/matches a **`Product`** and creates real **`Item`** rows linked to `purchase_order_id` and `manifest_row_id`, then labels are printed. Check-in **does not write `ManifestRow.matched_product`** (P3 Rule 3); match resolution is prior batch → **`ProcessingRow.matched_product`**. Prefill ladder: batch defaults → decided product (`keep`) → row bookmark (`new`). **P4 split:** when a row has ≥2 distinct checked-in products, implicit quick check-in is rejected (HTTP 400); staff pick product in Detailed check-in; **`POST …/processing-check-in-batch/{id}/remap-product/`** can re-point a batch's Items to another Product; denorm **`distinct_product_count`** + primary **`matched_product`** (most units) refresh on check-in/remap. **P5 collapse:** list exposes **`sameProductRowNumbers`** peer hints; queue **Group by product** + multi-select **Check in together** via **`POST …/processing-check-in-together/`** (shared defaults, per-row qty, separate Items/`manifest_row_id` per line; rejects mixed P4 rows). **P6 hint alignment:** when selected rows have different hints, bulk **Assign shared product** → **`POST …/processing-assign-shared-product/`** sets **`ProcessingRow.matched_product_id` only** (no manifest/Item writes); then **Check in together** applies. **`refresh_processing_rows_denorm`** and row detail read ProcessingRow-owned match only (no manifest match FK fallback). Over/under quantity is allowed; expected quantity comes from Manifest/Processing rows and actual count comes from Items.

### Review surfaces (pre- vs post-finalize)

| Phase | HTTP | Rows |
|-------|------|------|
| Pre-finalize | `GET/PATCH …/preprocessing-review/` | **`PreprocessingRow`** staging (`standard_*` / `ai_*`; **`final_*`** written inside **`finalize-preprocessing`**) |
| Post-finalize | `GET/PATCH …/manual-review/` | Canonical **`ManifestRow`** (linked **`Item`** fields sync on save) |

### Intake rebuild wave (branch / Initiative Session 15)

Semver-tagged in **`CHANGELOG [2.24.0]`** with same-day patch **`[2.24.1]`** for Processing/Receiving decoupling. Historical plan + sessions: **[`order_processing_pipeline_rebuild`](../initiatives/_archived/_completed/order_processing_pipeline_rebuild.md)** (archived 2026-05-30). Schema highlights:

| Migration | User-visible theme |
|-----------|---------------------|
| **`0045_purchase_order_manifest_meta`** | PO manifest snapshot columns (`manifest_filename`, `manifest_row_count`, …) plus supporting indexes |
| **`0046_intake_wave1_po_preprocessing_receiving`** | PO preprocessing/receiving/track fields; renames pallets (`order_pallet_count` → **`pallet_count`**) |
| **`0047_drop_preprocessing_order`** | **`PreprocessingRow`** uniqueness + drops **`PreprocessingOrder`** |
| **`0048_receiving_track_timestamps`** | **`PurchaseOrder`** receiving started/done timestamps |
| **`0049_dispute_model_and_rollups`** | **`Dispute`** model + dispute rollups on PO |
| **`0050_processing_track_and_legacy_flag`** | **`processing_started_at` / `processing_done_at`**, **`uses_legacy_processing`** |

Operational rehearsal / recon SQL: **[`README`](../reference/order_processing_pipeline_rebuild/_recon/README.md)**. Deterministic rollout repair: **`python manage.py repair_intake_pipeline_pos`** (`apps/inventory/services/intake_po_repair.py`).

Orders dashboard queryset filter widening (stale **`vendor_name_cache`**): **`Q(vendor_name_cache__in=… \| vendor__name__in=…)`** in **`PurchaseOrderViewSet.get_queryset`** (`apps/inventory/views.py`). Unmanifested intake **`Item`** rows ( **`manifest_row` null**, status **`intake`**) are legitimate overage—the repair verifier must not flag them (`intake_po_repair.verify_intake_po`).

---

## Vendor Model

- **Types**: `liquidation`, `retail`, `direct`, `other`
- **Soft delete**: `perform_destroy` sets `is_active=False` instead of deleting
- **Fields**: `name`, `code` (unique), `vendor_type`, contact info, `address`, `notes`, `is_active` (legacy vendor shrinkage analytics fields removed **v2.14.0**)
- **API**: `/inventory/vendors/` — CRUD, staff-only; filter by `vendor_type`, `is_active`; search by `name`, `code`, `contact_name`

---

## PurchaseOrder Statuses

| Status       | Description                          |
|-------------|--------------------------------------|
| `ordered`   | Order placed (default)               |
| `paid`      | Payment made (via `mark-paid`)       |
| `shipped`   | Shipment in transit (via `mark-shipped`) |
| `delivered` | Received (via `deliver`)             |
| `processing`| Manifest processed, items being prepped |
| `complete`  | All items processed                  |
| `cancelled` | Order cancelled                      |

**Flow**: ordered → paid → shipped → delivered → processing → complete

### Status Actions

| Action | Endpoint | Sets | Clears |
|--------|----------|------|--------|
| Mark Paid | `POST .../mark-paid/` | status=paid, paid_date | — |
| Revert Paid | `POST .../revert-paid/` | status=ordered | paid_date |
| Mark Shipped | `POST .../mark-shipped/` | status=shipped, shipped_date, expected_delivery | — |
| Revert Shipped | `POST .../revert-shipped/` | status=paid (or ordered) | shipped_date, expected_delivery |
| Deliver | `POST .../deliver/` | status=delivered, delivered_date | — |
| Revert Delivered | `POST .../revert-delivered/` | status=paid (or ordered) | delivered_date |

### Cost Breakdown

`total_cost` is auto-computed in `save()` from: `purchase_cost + shipping_cost + fees`.

**Item acquisition cost (v2.14.0):** Each **`Item.cost`** is allocated when units are created from a manifest and when **`PurchaseOrder.est_shrink`**, listing **`retail_value`**, or **`total_cost`** change — formula **`(item.retail_value / (PO.retail_value × (1 − est_shrink))) × PO.total_cost`**. **`PO.retail_value`** must stay the **B-Stock listing** total (do not replace with sum of line retails). Default **`est_shrink`** = **0.15**; Django admin can edit **`est_shrink`** per PO. One-shot backfill: **`python manage.py recompute_all_item_costs`**. The legacy nightly commands **`compute_vendor_metrics`**, **`compute_po_cost_analysis`**, **`compute_item_cost`**, **`recompute_cost_pipeline`** were **removed**.

### Additional Fields

- **`order_number`** — Auto-generated `PO-XXXXX` or user-provided; editable after creation.
- **`description`** — Title-like summary of the order (e.g. "6 Pallets of Small Appliances, 130 Units...").
- **`condition`** — Choices: `new`, `like_new`, `good`, `fair`, `salvage`, `mixed`.
- **`retail_value`** — B-Stock **listing** estimated retail (do not overwrite with sum of line retails; drives **`Item.cost`** denominator with **`est_shrink`**).
- **`est_shrink`** — Expected shrink fraction (**0–1**, default **0.15**); changing it recomputes **`Item.cost`** for all items on the PO (**v2.14.0**).
- **`manifest_preview`** — JSONField persisting CSV headers + first 20 rows for display on reload.

---

## CSV Manifest Upload (S3)

**Staff UI:** Inventory **Order detail** (`/inventory/orders/:id`) — **Raw Manifest** drop zone and **Upload manifest** / **Replace manifest** (CSV). Unlocks **Preprocessing** when `manifest_file` is present.

**Upload flow**:
1. File uploaded via `POST /inventory/orders/{id}/upload-manifest/`
2. CSV parsed in-memory: headers extracted, rows collected
3. File saved to S3 at `manifests/orders/{order_id}/{filename}`
4. `S3File` record created; linked to PO via `manifest` FK
5. Preview data (headers + first 20 rows) persisted in `manifest_preview` JSON field
6. Returns full order detail (including `manifest_file` with download URL and `manifest_preview`)

**Re-upload**: Replaces old S3 file and S3File record. Preview is overwritten.

**S3File model** includes a `url` property that generates a presigned download URL via `default_storage.url()`.

---

## CSV Template System

**Model**: `CSVTemplate` — vendor-specific column mappings for manifests.

- **`vendor`** — FK to Vendor
- **`header_signature`** — MD5 hash of normalized header row (comma-joined, lowercased) for auto-matching
- **`column_mappings`** — JSON mapping vendor columns to standard fields
- **`is_default`** — Whether this is the default template for the vendor

**Auto-matching**: On manifest upload, headers are hashed and matched against `CSVTemplate` where `vendor=order.vendor` and `header_signature=sig`. If found, the template is suggested.

**Preprocessing behavior**:
- `process-manifest` can load mappings from explicit `template_id` or by `header_signature`
- if no mapping is provided, backend builds default alias-based mappings
- optional `save_template=true` stores the mapping under the same header signature for reuse

---

## ManifestRow

Canonical manifest line items for a PO **after** preprocessing (and whenever staging is not in use). When **`finalize-preprocessing`** runs, rows are **replaced** from staged **`final_*`** fields.

- **`purchase_order`** — FK
- **`row_number`** — 1-based row index
- **`quantity`** — Number of items (default 1)
- **`description`**, **`title`**, **`brand`**, **`model`**, **`category`**, **`condition`**
- **`unit_retail`**, **`proposed_price`**, **`final_price`**, **`pricing_stage`**, **`pricing_notes`** — pricing workspace
- **`identifiers`**, **`taxonomy`**, **`tracking`** — JSON buckets (UPC/SKU live under **`identifiers`**)
- **`notes`**, **`batch_flag`**
- **`search_tags`**, **`specifications`**
- **`matched_product`** — FK to Product after matching
- **`match_status`** — `pending`, `matched`, `new`
- **`match_candidates`** — JSONField storing fuzzy match results with scores
- **`ai_match_decision`**, **`ai_reasoning`** — Product-matching AI assist (separate from preprocessing **`ai_*`** on **`PreprocessingRow`**)

**Legacy:** older docs referred to **`ai_suggested_title`** / **`ai_suggested_brand`** / **`ai_suggested_model`** on **`ManifestRow`**; current schema uses **`title`** / **`brand`** / **`model`** as canonical listing fields.

**Process-manifest** behavior:
- can accept explicit normalized `rows` OR parse the full uploaded manifest file
- supports two mapping paths: (1) **expression formulas** (`formula` key, e.g. `TITLE([Brand]) + " " + [Model]`) via `formula_engine.py`, (2) **legacy source+transforms** (`source` + `transforms` array: `trim`, `title_case`, `upper`, `lower`, `remove_special_chars`, `replace`)
- `normalize_row()` checks for `formula` first, falls back to `source` + `transforms`
- deletes existing PO manifest rows before writing the new normalized set

**Preview-standardize** behavior:
- validates mappings/functions and returns normalized preview without writing `ManifestRow` rows
- powers the UI preview before users click **Standardize Manifest**
- accepts `search_term` to filter full normalized output server-side before slicing preview rows

**Pre-arrival pricing endpoint**:
- `POST /inventory/orders/{id}/update-manifest-pricing/` updates `proposed_price`, `final_price`, `pricing_stage`, and `pricing_notes` in bulk

**Match-products** (legacy) — previously evaluated rows using UPC/vendor/text scoring and wrote **`ManifestRow.matched_product`** + match metadata. **P6:** use **Final Decisions** (`PreprocessingRow.final_matched_product`) and processing **Assign shared product** instead; **`POST match-products`** returns **410 Gone** (no manifest match writes). Read-only manifest match values may still display on legacy orders until columns are dropped.

---

## AI Row Cleanup — web batches (primary) + offline CSV (fallback)

Shipped 2026-06-10 per the Fable verdict in [`preprocessing_ai_cleanup_review`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md). Service: **`apps/inventory/services/ai_cleanup.py`** (shared staging merge used by both paths). Cleaned marker per row: **`PreprocessingRow.ai_reasoning != ''`**.

### Primary — Step 2 **Run AI Cleanup** (web batch pool)

| Step | Endpoint / code | Notes |
|------|-----------------|-------|
| Status / resume | **`GET …/ai-cleanup-status/`** | `{ total_rows, cleaned_rows, remaining_rows, generation, use_staging, uncleaned_row_ids[] }` — client partitions `uncleaned_row_ids` into batches; resume = re-fetch and process what's left |
| Batch | **`POST …/ai-cleanup-batch/`** `{ row_ids: [≤25] }` | One Anthropic call (25s client timeout) over those staging rows only; merges **`PreprocessingRow.ai_*`** + snapshots `final_*`; **no** ManifestRow writes, **no** Product/Item creation; `ai_cleanup_generation` guard discards stale saves (`cancelled: true`) |
| Complete | **`POST …/ai-cleanup-complete/`** | Fast, idempotent, no AI: `generate_match_candidates_for_order` + `ai_cleaned_at` + `preprocess_status=cleaned` |
| Cancel / undo | **`POST …/cancel-ai-cleanup/`** / intake timeline | Clears `ai_*`, bumps generation → running pools stop, in-flight batches discard |

**UI:** `WebAiCleanupPanel.tsx` (Step 2 primary) — browser worker pool (`utils/aiCleanupPool.ts`): **batch 10, concurrency default 4, cap 8**, per-batch retry ×2 with backoff, pause (client-side; in-flight batches finish + save) / resume, progress (batches, rows/s, ETA). Requires gthread gunicorn (`Procfile --threads 8`) so 4–8 concurrent AI waits don't starve the 2-worker dyno.

### Fallback — offline CSV (Grok), chunked apply

| Step | Endpoint / tool | Notes |
|------|-----------------|-------|
| Export | **`GET …/download-cleanup-csv/`** | Pre-AI lean CSV; **`row_id`** = **`ManifestRow.id`** on new-flow orders |
| Local AI | **`workspace/ai-cleanup-grok/helpers/clean-grok.mjs`** | Frozen (bugfix only); parallel pool 16×20; outputs 12/13-col `.cleaned.csv` |
| Validate + apply | **`POST …/apply-cleanup-csv/`** with **`partial: true`** | UI chunks **50 rows/POST**; per-chunk validation + atomic apply; one bad row fails its chunk, not the PO; full (non-partial) apply still enforces exact row coverage |
| Complete | **`POST …/ai-cleanup-complete/`** | Called by UI after the last chunk (candidates + flags deferred from chunks) |

**UI:** `RowProcessingPanel.tsx` under the Step 2 **Advanced — Offline CSV cleanup** disclosure; toolbar **Run Cleanup** chunks via `useUploadCleanupCsvRows({ partial })`. Re-applying after a failed chunk is safe (idempotent merge).

### Legacy — `ai-cleanup-rows` (deprecated)

**`POST …/ai-cleanup-rows/`** returns **410 Gone** on staging-active orders (it created Products/Items pre-check-in via `ensure_manifest_products_and_items` and wrote `ManifestRow` listing fields — both forbidden by the product-identity design). Still functional only for legacy non-staging orders; full removal after soak. Frontend `aiCleanupRows`/`useAICleanupRows` deleted 2026-06-10.

---

## Item Model

Core inventory entity flowing through the system.

### SKU Auto-Generation

- Format: `ITM` + 7-digit zero-padded number (e.g. `ITM0001234`)
- `Item.generate_sku()` — increments from last SKU or count
- Assigned on create (manual create or bulk from manifest)

### Status Lifecycle

| Status       | Description                    |
|-------------|--------------------------------|
| `intake`    | Received, not yet processed     |
| `processing`| Being prepped                  |
| `on_shelf`  | Ready for sale (via `ready` action) |
| `sold`      | Sold                           |
| `returned`  | Returned                       |
| `scrapped`  | Scrapped                       |
| `lost`      | Marked missing                 |

### Item Sources

| Source       | Description                    |
|-------------|--------------------------------|
| `purchased` | From vendor PO (default)       |
| `consignment` | Consignee item               |
| `house`     | Store-owned / house inventory  |

### Fields

- **`product`** — Optional FK to Product (catalog)
- **`purchase_order`** — Optional FK (for purchased items)
- **`manifest_row`** — Optional FK (source row from CSV)
- **`batch_group`** — Optional FK for batch-tier processing
- **`processing_tier`** — `individual` or `batch`
- **`title`**, **`brand`**, **`category`**, **`price`**, **`cost`**
- **`condition`**, **`location`**, **`listed_at`**, **`sold_at`**, **`sold_for`**, **`notes`**
- **`checked_in_at`**, **`checked_in_by`** — explicit arrival check-in audit fields

**Check-in actions**:
- `POST /inventory/items/{id}/check-in/` — single-item check-in + field finalize
- `POST /inventory/items/{id}/mark-broken/` — mark item as scrapped
- `POST /inventory/items/{id}/uncheck-in/` — revert item to intake
- `POST /inventory/orders/{id}/check-in-items/` — bulk check-in for order-scoped queues
- `POST /inventory/orders/{id}/mark-items-broken/` — bulk mark items scrapped
- `POST /inventory/orders/{id}/uncheck-in-items/` — bulk revert items to intake
- `POST /inventory/batch-groups/{id}/check-in/` — batch check-in; optional `check_in_count` and `scrap_count` for partial check-in

---

## ProcessingBatch

Tracks each **create-items run** from manifest rows (run-level audit).

- **`purchase_order`** — FK
- **`status`**: `pending`, `in_progress`, `complete`
- **`total_rows`**, **`processed_count`**, **`items_created`**
- **`started_at`**, **`completed_at`**, **`created_by`**

Created when `create-items` runs; one batch per run. Items are created by iterating manifest rows and creating `quantity` items per row (title from `description`, cost from `retail_value`, `source='purchased'`, `status='intake'`).

---

## BatchGroup (M3)

Batch-level processing helper for rows marked as batch tier.

- **Purpose**: apply shared processing decisions once to many already-created Items.
- **Not inventory**: quantity truth still lives in `Item` rows, not `BatchGroup`.
- **Typical fields**: `batch_number`, `product`, `purchase_order`, `manifest_row`, `total_qty`, `status`, `unit_price`, `unit_cost`, `condition`, `location`, `processed_by`, `processed_at`
- **Actions**:
  - `POST /inventory/batch-groups/{id}/process/` — apply batch settings to all items and mark ready
  - `POST /inventory/batch-groups/{id}/check-in/` — check in pending batch items; optional `check_in_count` and `scrap_count` for partial (e.g. check in 2 good, mark 3 broken)
  - `POST /inventory/batch-groups/{id}/detach/` — remove one item for individual exception processing

**Processing drawer (batch mode)** shows pending and checked-in items as clickable lists; clicking opens the item form; checked-in items have an Unprocess button to revert to intake.

---

## VendorProductRef (M3)

Cross-reference mapping of vendor identifiers to internal `Product`.

- **Fields**: `vendor`, `product`, `vendor_item_number`, `vendor_description`, `last_seen_date`, optional cost/usage counters
- **Use**: improves automatic matching accuracy across repeated manifests from the same vendor

---

## Public Item Lookup

- **Endpoint**: `GET /api/inventory/items/lookup/<sku>/`
- **Auth**: None (`AllowAny`)
- **Behavior**: Returns item via `ItemPublicSerializer`; creates `ItemScanHistory` with `source='public_lookup'` and `ip_address`
- **Frontend**: `itemLookup(sku)` in `inventory.api.ts` uses `apiPublic` (no auth)

---

## Product Catalog

**Model**: `Product` — Reusable product definitions with matching metadata.

- **Fields**: `product_number`, `title`, `brand`, `model`, `category`, `category_ref`, `description`, `specifications`, `default_price`, `upc`
- **Relation**: Items can optionally link to a Product via `product` FK
- **API**: `/inventory/products/` — CRUD, staff-only; search by `product_number`, `title`, `brand`, `model`, `category`, `upc`

---

## Frontend Integration

### Order List Page (`OrderListPage.tsx`)

- DataGrid with columns: Order #, Vendor, Status, Description, Condition, Items, Ordered, Expected, Delivered, Cost, Retail
- Filters: status, vendor, date range
- "New Order" dialog with same section layout as edit: Order # + Date → Details → Costs → Notes

### Order Detail Page (`OrderDetailPage.tsx`)

- Status stepper: ordered → paid → shipped → delivered → processing → complete
- Display sections: Dates → Details (description, condition, retail value, items) → Costs → Notes
- Action buttons: Mark Paid, Undo Paid, Mark Shipped / Edit Shipped, Mark Delivered, Undo Delivered
- "Shipped" modal with dual modes (Mark Shipped / Edit Shipped) and date pickers
- Manifest section: upload CSV, file info bar with download link, persisted CSV preview table
- Preprocessing UI replaced with **Standard Manifest builder** (standard columns first, function chains, preview, and **Standardize Manifest** CTA)
- Preprocessing now follows a 3-step accordion flow (Upload -> Raw Sample -> Standardize), with multi-open accordion support
- Raw sample supports server-side search over the full manifest and returns top 100 rows in a scrollable preview
- Standardized preview supports server-side search over full normalized output (`search_term`) and returns top 100 rows
- Pre-arrival pricing table on standardized `ManifestRow` data
- Actions follow the new flow: Save Pre-Arrival Pricing → Match Products → Build Check-In Queue → Open Processing Workspace
- Includes order reset modal using reverse-sequence artifact preview + guarded purge deletion

### Processing Page (`ProcessingPage.tsx`) — v1.9.0 — **legacy**

Moved to **`/inventory/processing-legacy`**. The primary staff flow is **Item Processor workspace** (see below).

### Item Processor workspace (`ProcessingWorkspacePage.tsx`) — current

- **Routes**: **`/inventory/processing`** (`ProcessingEntryRedirect`), **`/inventory/processing/:id`** (`ProcessingWorkspacePage`), legacy **`/inventory/processing-legacy`** (`ProcessingPage`).
- **Workspace list**: **`GET …/processing-workspace/`** — slim **`ProcessingRow`** slice (**`limit`/`offset`**, **`segment`**, **`search`**, etc.): queue fields + counts; **`row_count_filtered`** / **`row_count_total_po`**. **`search`** uses lowercased **`search_string`** (**`search_string__contains`**) with **`row_number`** shortcuts for pure digits / **`rowNNN`** (**v2.23.0**); list rows include **`searchString`**. **Shelf price:** list + merged detail **`price`** come from **`ProcessingRow.shelf_price`** (**`final_price`** fallback when **`shelf_price`** is null); **`refresh_processing_rows_denorm`** does **not** mirror **`Item.price`** onto **`shelf_price`** for linked manifest lines; check-in / bulk / patch mutations align **`Item.price`** from the bookmark (**[`CHANGELOG [Unreleased]`](../CHANGELOG.md)**). Hydrate one row (**items**, **`product`**) via **`GET …/processing-row-detail/`** (`processing_row_id`). **`v2.22.1`:** **`PurchaseOrderViewSet`** routes **`processing_row_detail`** through the **slim** PO queryset (no heavy annotate + **`manifest_rows`** prefetch on **`get_object()`** before building one row); **`GET …/orders/{id}/`** **retrieve** no longer **`prefetch_related('manifest_rows')`** (counts still annotated).
- **Pricing audit (read-only, UI)**: expanding **Manifest pricing audit** calls **`GET /api/inventory/orders/{id}/manual-review/`** — same paginated **`ManifestRow`** economics surface as legacy manual review (**`unit_retail`**, allocated base, 2× ideal, set price); edits remain on preprocessing/Final Review or via **`POST …/manual-review/`** when exposed elsewhere.
- **Check-in**: Primary path is **`POST …/processing-row-check-in/`** from row detail **Quick check-in** or **Detailed check-in** — creates/matches **`Product`** and N **`Item`** rows from manifest/row defaults (no prebuilt intake units required). Each check-in creates an **`ItemCheckIn`** event; items link via **`Item.check_in`** FK only ([12_check_in_normalization](../reference/product_item_field_audit/12_check_in_normalization.md)). **v2.31.0:** migration **`0066_processingrow_product_links`** persists product links for processing rows/check-ins; prior check-ins can remap among products attached to the row and open the Product editor from product cells. Repeat check-ins on the same row reuse the latest check-in product when mode is unset/`keep` **only when the row has ≤1 product**; mixed rows require explicit product in Detailed check-in. **`POST …/item-check-ins/{id}/remap-product/`** remaps all Items in a check-in. **`POST /api/inventory/products/{id}/check-in/`** (product-first catalog path) creates an Added **`ProcessingRow`** + **`ItemCheckIn`** with **`origin=product_ad_hoc`**. **`POST /api/inventory/items/{id}/processing-print-and-check-in/`** remains for legacy prebuilt **`intake`/`processing`** units only. Prior check-ins allow inline condition/dispatch/price edits but do **not** expose Status; manual `status="sold"` is rejected.
- **Print multiple / dispute / assign shared product / bulk disposition** (**v2.22.0 row-first**): order-scoped **`POST`** actions prefer **`processing_row_id` / `processing_row_ids`**; server maps to **`ManifestRow`**/**`Item`**; legacy **`manifest_row_*`** accepted when not conflicting; **`processing_data_required`** (+ HTTP 400 **`code`**) for unlinked bookmarks. UI: **`ProcessingBulkActionBar`** + **`AssignSharedProductDialog`** / **Check in together** / **`BulkDispositionModal`** + dispute / print-multiple (**`SwapModal`** not shipped — **v2.21.0**). Destructive **`processing-merge-rows`** removed (P6).
- **Collapse groups (P7, 2026-06-10)**: **`POST …/processing-collapse-rows/`** sets `ProcessingRow.collapse_master` on follower rows (migration 0059; presentation + distribution only — manifest untouched; `product_mode` keep/existing/new, the latter two delegating to assign-shared-product). The master (lowest row number) carries a **`collapsedGroup`** rollup in workspace payloads; members are hidden in the queue unless the **Show collapsed rows** toggle is on; check-ins on the master **fill members in row order** (one **`ItemCheckIn`** per member touched; **`item_check_in_ids`** in the response; overage lands on the last row); followers reject direct check-in. **`POST …/processing-uncollapse-rows/`** dissolves by master id. Bulk bar: **Collapse rows** / **Uncollapse**. **Group coherence (2026-06-11):** the master's denorm'd **`queue_status` reflects GROUP totals** (fill-in-order fills the master first; own-items status would drop a half-checked group from `hide_checked_in`/segment filters — scoped denorm pulls the master in when only members were touched); master **row detail** returns `collapsedGroup` + all member items/check-ins + group status; every client qty surface (queue cell/sort, detail tiles, check-in caps/pills) combines via **`effectiveRowQty`**; opening a member redirects to its master; Check-in-together / assign-shared exclude collapse-involved rows.
- **Check-in & add-item UX (P8, 2026-06-10)**: detailed check-in dialog is buttons-first (segmented product action / condition / dispatch — no dropdowns) and warns **"affects X items across Y orders"** via **`GET /api/inventory/products/{id}/usage/`** when editing the linked product; quick check-in on a no-product row asks new-vs-existing explicitly (`QuickCheckInProductPrompt`); row detail shows **Row defaults at the top**. **One add-item model:** the workspace add dialog hosts the Items-page `ItemForm` (submitOverride → `processing-add-item`); **`POST /api/inventory/items/`** is quantity-aware (1–500) and routes workspace-enabled POs through `processing_add_item` so manual adds land as Added queue rows (`created_count`/`created_items` in the response). **No 500 check-in cap (owner ruling, 2026-06-11):** quantities accepted up to **`MAX_CHECK_IN_QUANTITY` (10,000)** everywhere (explicit 400 above it, never a silent clamp); the UI confirms >100-unit runs via `LargeCheckInConfirmDialog` — printing requires typing **`PRINT <qty>`**.
- **Singles & sets — row transforms (P9, 2026-06-12)**: design — landmark doc **§7.5**. **`POST …/processing-break-apart-row/`** (`units` × `factor`: 10 cases of 500 plates → 5,000 plates) and **`POST …/processing-make-set-row/`** (`num_sets` × `set_size`: candle boxes for churches, one tag per box) rewrite the row in place when they cover the full un-checked-in quantity, else create a **sub row** (`ProcessingRow.split_parent`/`split_seq`, migration **0060**; queue shows `12.1` numbers and `↳ … (from #12)` titles; same frozen `manifest_row`). `product_mode` keep/existing/new (new = Level-3 exception, P7 precedent); prices/retail scale by the factor unless given. `ProcessingRow.units_per_item` → **`Item.unit_count`** at check-in (unit reports sum it). **Attribution is family-aware** (`split_family_attribution`: items claim to the row whose batch created them, unclaimed → root) across denorm, row detail, mixed-product guard, and shelf-price push (`push_shelf_price_to_bookmark` pins by `processing_row_id`/`item_id`). **`POST …/processing-restart-row/`** = coarse undo (two-step `confirm`): deletes family Items/batches/sub rows, restores the root from its first-transform `original_snapshot`, deletes transform-created Products only when unreferenced; blocked on sold/cart-referenced items or collapsed family rows. Split families and collapse groups are mutually exclusive. UI: row detail **Break apart… / Make set…** (managers, original rows) + family alerts with **Restart row…** (`ProcessingTransformDialogs.tsx`). Tests: `test_processing_transforms.py`.
- **Client**: React Query key **`['processing-workspace', orderId]`** (`useProcessingWorkspace.ts`), filters via **`processingWorkspaceFilters.ts`** (**V-07 / V-08 / V-12**). Product search (`useProductSearch`) is debounced 250ms with keep-previous results.

**Legacy grid (`ProcessingPage` at `/inventory/processing-legacy`):** "Command Center + Side Drawer" design. Key features:
- **MUI Autocomplete** order selector (search, status chips per option) replaces basic dropdown
- **Progress ring** (CircularProgress, 52px) with % overlaid; stats chips for pending/on-shelf/batch counts
- **SKU scanner input** always visible; F2 focuses it; Enter finds item by SKU and opens Drawer
- **Three-tab DataGrid** (Batches / Items / Checked In) with badge counts; compact density
- **Right-side Drawer** (`ProcessingDrawer.tsx`) — form + collapsible source context, Copy from Last, Save/Check-In/Reprint, keyboard hints
- **Bulk check-in**: checkbox selection on Items tab → dialog with shared overrides → `check-in-items` endpoint
- **Batch labels**: staggered `Promise.allSettled` with 200ms stagger; progress alert
- **Reprint**: per-row printer icon on Checked In tab + Reprint button in drawer after check-in
- **Detach confirmation**: popover before detach (was instant)
- **Keyboard shortcuts**: F2 (scanner), Ctrl+Enter (check-in), Escape (close), Ctrl+P (reprint), N (next)
- **Auto-advance**: opens next pending item after check-in; toggle in stats bar
- **Sticky defaults**: condition + location persisted to `localStorage` (`processing_sticky_defaults`)
- **Session stats bar** (`ProcessingStatsBar.tsx`): elapsed, items/hr, ETA, session count

### Hooks (`useInventory.ts`)

- `usePurchaseOrder`, `useDeliverOrder`, `useUploadManifest`, `useManifestRows`, `usePreviewStandardize`, `useProcessManifest`, `useUpdateManifestPricing`, `useCreateItems`, `useMarkOrderComplete`, `useAICleanupStatus`, `useCancelAICleanup` (web batch pool calls `aiCleanupBatch`/`aiCleanupComplete` API fns directly)
- `useBatchGroups(params, enabled)`, `useUpdateBatchGroup`, `useCheckInBatchGroup`, `useDetachBatchItem`
- `useMarkOrderPaid`, `useRevertOrderPaid`, `useMarkOrderShipped`, `useRevertOrderShipped`, `useRevertOrderDelivered`
- `useItems(params, enabled)`, `useUpdateItem`, `useCheckInItem`, `useMarkItemReady`, `useCheckInOrderItems`
- `useProducts`, `useVendors`, etc.
- `useOrderDeletePreview`, `usePurgeDeleteOrder`

### API (`inventory.api.ts`)

- Orders: `getOrders`, `getOrder`, `createOrder`, `updateOrder`, `deleteOrder`, `getOrderDeletePreview`, `purgeDeleteOrder`
- Status: `markOrderPaid`, `revertOrderPaid`, `markOrderShipped`, `revertOrderShipped`, `deliverOrder`, `revertOrderDelivered`
- Manifest/processing: `uploadManifest`, `getManifestRows`, `previewStandardize`, `processManifest`, `updateManifestPricing`, `matchProducts`, `createItems`, `checkInOrderItems`, `markOrderComplete`, `getProcessingWorkspace`, `getProcessingRowDetail`, `processingPrintAndCheckIn`, `processingPrintMultiple`, `processingDispute`, `processingAssignSharedProduct`, `processingCheckInTogether`, `processingBulkDisposition`, `processingPatchItem`, `aiCleanupRows`, `getAICleanupStatus`, `cancelAICleanup`
- Batch groups: `getBatchGroups`, `updateBatchGroup`, `processBatchGroup`, `checkInBatchGroup`, `detachBatchItem`
- Items: `getItems`, `updateItem`, `checkInItem`, `markItemReady`
- Public: `itemLookup(sku)` — no auth

---

## ItemScanHistory

Tracks public lookups and POS scans.

- **`item`** — FK
- **`scanned_at`** — auto
- **`ip_address`** — from request
- **`source`**: `public_lookup` or `pos_terminal`

---

## Retag v2 (historical)

The **March 2026** DB2→DB3 retag cutover used temporary models (`TempLegacyItem`, `RetagLog`), staging import (`import_db2_staging`), API routes under `/api/inventory/retag/`, and the **`RetagPage`** UI. That scaffolding was **removed** after cutover (inventory migration removing those models; see git history around **v2.10.0 cleanup**).

For the **archived operational narrative** (day-of workflow, cleanup checklist, and history-endpoint notes), see **[`.ai/extended/retag-operations.md`](retag-operations.md)**. Do not treat the sections below as live API surface unless you are reading old commits.

### Pricing Model Foundation Commands

Also in `apps/inventory/management/commands/` — scaffolded but not yet run:

| Command | Purpose |
|---|---|
| `import_historical_sold` | Import ~145K sold items from DB1+DB2 into DB3 `inventory_item` (status=`sold`) for ML training |
| `import_historical_transactions` | Import ~68K transactions from DB1+DB2 into `pos_historicaltransaction` for multi-generation revenue reporting |
| `train_price_model` | Train gradient-boosted price estimator on sold items; saves to `workspace/models/price_model.joblib` |
| `backfill_categories` | Retroactively classify all items into the `Category` taxonomy |

Run these when the pricing/ML initiative schedules them (legacy retag cutover is complete).
