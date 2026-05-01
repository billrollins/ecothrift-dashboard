<!-- Last updated: 2026-05-02 (Item Processor read-only `manual-review` audit UI; Final Review mockup visual pending — `fix_this.md`; `ai_status` / cleanup CSV) -->

# Inventory Pipeline — Extended Context

This document describes the full inventory pipeline, models, and flows for the Eco-Thrift Dashboard.

---

## Design Decision: M3 (Universal Items + Smart Batch)

**Chosen approach:** Every physical unit is created as an `Item` record during preprocessing standardization; `create-items` now opens processing and creates any needed `BatchGroup` records.

`BatchGroup` is a **processing accelerator** for bulk actions (price/condition/location/ready), not a separate inventory entity.

This preserves:
- single-path POS scanning (`ITM` only),
- per-unit traceability from day 1,
- faster processing for high-quantity rows through grouped actions.

Alternative approaches (including lot-ledger/deferred unitization) were archived under `.ai/prototype/archive/`.

---

## Pipeline Overview

```
Vendor → PurchaseOrder → CSV upload (S3) → Standardize (expression formulas + preview) → Preprocessing staging rows → offline cleanup CSV round-trip (download → edit → apply-cleanup-csv) → Final Review (staging) → finalize-preprocessing → Processing → Check-in + print tags
```

1. **Vendor** — Source of purchased inventory (liquidation, retail, direct, other).
2. **PurchaseOrder** — Order placed with a vendor; tracks status from ordered through completion.
3. **CSV manifest upload** — Staff uploads a vendor CSV via `POST /inventory/orders/{id}/upload-manifest/`. File is saved to S3, preview persisted in `manifest_preview` JSON field. (Done on OrderDetailPage.)
4. **Standardize** (Step 1 of PreprocessingPage) — Uses persisted **`manifest_preview`** on the PO for headers/sample rows until **`POST .../process-manifest/`** commits (pulls full CSV from S3). Expression formulas map vendor columns to standard fields (preview-standardize / Formula Preview). Commit seeds **`PreprocessingOrder`** / **`PreprocessingRow`** staging and prepares deterministic **`Product`** links plus early **`Item`** records per current **`process_manifest`** behavior.
5. **Clean** (Step 2 of PreprocessingPage) — Primary path: **`GET .../download-cleanup-csv/`** exports **`row_id`**, **`row_number`**, **`quantity`**, **`unit_retail`**, **`base_cost`**, **`ideal_price`**, then **`description`**, **`brand`**, **`model`**, **`condition`**, **`notes`**, **`identifiers_json`**, **`taxonomy_json`**, **`specifications_json`**, **`tracking_json`**, **`search_tags_json`** (no flat **`title`** / **`sku`** / **`upc`** / staging pricing columns). Staff edit offline (e.g. Excel) or run an optional **local** adjunct **`workspace/ai-cleanup-grok/helpers/clean-grok.mjs`** (xAI Grok: strict **`response_format`** JSON Schema with taxonomy/condition enums, vendor-code pre-normalization, **`unit_retail`** vs **`proposed_price`** sanity check, **`x-grok-conv-id`** for prompt cache, optional **`--batch-api`** / **`use_batch_api`** for async batch pricing — emits one **`<stem>.cleaned.csv`** including optional per-row **`ai_status`** JSON — tree is **gitignored** unless explicitly whitelisted). Then **`POST .../apply-cleanup-csv/`** with JSON **`rows`** or **`POST .../upload-cleanup-csv/`** with wide staging CSV or a narrow CSV (**`row_id`, `ai_title`, `ai_brand`, `ai_model`, `category`, `condition`, `proposed_price`**) to merge cleanup into staging **`ai_*`** / **`ai_title`** (and **`ai_status`** when present) by **`row_id`**. **Wide** apply relaxes quality blocking—details in **`cleanup_csv_validate`** / contract doc. Legacy alternate still on the API: **`POST .../ai-cleanup-rows/`** (in-app Claude batches) — not wired as the main Step 2 UI today. **Contract:** hard/soft validation and rule IDs — **[`cleanup_csv_contract.md`](../reference/cleanup_csv_contract.md)**.
6. **Final Review** (Step 3 of PreprocessingPage; stepper label **Final Review**) — Staging-only review: **`GET/PATCH .../preprocessing-review/`** over **`PreprocessingRow`**. UI (**`PreprocessingReviewTable`**) shows per-row **`ai_status`** (offline Grok validation metadata) as chips; substantive listing or price **`PATCH`** clears **`ai_status`** server-side ( **`batch_flag`** / **`pricing_notes`** alone do not). Staff edits **`ai_*`** fields (e.g. **`description` → `ai_description`**, **`title` → `ai_title`**); **`proposed_price`** / **`final_price`** live on the staging row until finalize. **`final_*`** stay **`NULL`** until **`POST .../finalize-preprocessing/`**, which runs **`snapshot_finalize_from_ai_and_standard`** (coalesce **`final_*`** from **`ai_*`** + **`standard_*`**; **`final_title`** from **`ai_title`**), validates price + title/description, then **replaces** **`ManifestRow`** rows from **`final_*`**. After finalize, staging review returns **409**; use canonical **`GET/PATCH .../manual-review/`** (manifest **`ManifestRow`**) for post-finalize line edits. **Mockup visual rebuild** of this step (**[`fix_this.md`](../reference/fix_this.md)**) is **not yet** reflected in the SPA.
7. **Eco-Thrift Receiving** — `GET /api/inventory/orders/for-receiving/` prioritizes POs by **expected_delivery** tiers for next-PO UX (**v2.20.0**). Staff open **`/inventory/receiving/:id`** from sidebar **Receiving** or the orders **Receive** control.
8. **Processing handoff** — `POST /inventory/orders/{id}/create-items/` no longer duplicates Items. It ensures Products/Items still exist, creates/open `ProcessingBatch`, creates needed `BatchGroup` rows, and moves delivered orders to processing.
9. **Arrival check-in** — Items/batches are checked in and marked shelf-ready via dedicated check-in actions, then labels are printed.

### Review surfaces (pre- vs post-finalize)

| Phase | HTTP | Rows |
|-------|------|------|
| Pre-finalize | `GET/PATCH …/preprocessing-review/` | **`PreprocessingRow`** staging (`standard_*` / `ai_*`; **`final_*`** written inside **`finalize-preprocessing`**) |
| Post-finalize | `GET/PATCH …/manual-review/` | Canonical **`ManifestRow`** (linked **`Item`** fields sync on save) |

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

**Match-products** evaluates rows using UPC exact match, vendor cross-reference, and fallback text similarity scoring, enhanced by AI-cleaned data. AI batch decisions determine whether to reuse an existing product or create new. Sets `matched_product` + `match_status` + `match_candidates` + `ai_match_decision`.

---

## AI Row Cleanup (in-app Claude batch) — legacy path

**Primary path today:** offline / Grok cleanup CSV → **`apply-cleanup-csv`** → **`PreprocessingRow`** **`ai_*`**.

**`POST /api/inventory/orders/{id}/ai-cleanup-rows/`** still exists: it batches over existing **`ManifestRow`** rows (when present), calls Anthropic, and writes **`title`**, **`brand`**, **`model`**, **`taxonomy.category`**, **`condition`**, **`proposed_price`**, **`search_tags`**, **`specifications`**, **`ai_reasoning`**, etc. — **not** separate **`ai_suggested_*`** columns.

### Backend Flow
1. **`POST .../ai-cleanup-rows/`** — `model`, `batch_size`, `offset`; returns **`has_more`** for worker loops.
2. **`GET .../ai-cleanup-status/`** — Counts rows with non-empty **`ai_reasoning`** (staging **`PreprocessingRow`** when active, else **`ManifestRow`**).
3. **`POST .../cancel-ai-cleanup/`** — Clears AI-populated fields on **`ManifestRow`** rows for the order (legacy behavior).

### Frontend Flow
- May still be wired for canonical-row experiments; **PreprocessingPage** Step 2 centers on CSV download/apply.

### Expandable Row Details
- If surfaced, compare **original manifest** cells vs **cleaned `title` / `brand` / `model`** and reasoning — naming matches saved **`ManifestRow`** fields.

### Known Issues (Pending Fix)
- Concurrent batching for **`ai-cleanup-rows`** may still have race/progress edge cases if re-enabled at scale.

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

- **Routes**: **`/inventory/processing`** (`ProcessingEntryRedirect` — `?order=` or last-used PO from eligible list), **`/inventory/processing/:id`** (`ProcessingWorkspacePage`), legacy **`/inventory/processing-legacy`** (`ProcessingPage`).
- **Read**: **`GET /api/inventory/orders/{id}/processing-workspace/`** — nested manifest rows, items, products, progress, duplicate-row hints (UPC).
- **Pricing audit (read-only, UI)**: expanding **Manifest pricing audit** calls **`GET /api/inventory/orders/{id}/manual-review/`** — same paginated **`ManifestRow`** economics surface as legacy manual review (**`unit_retail`**, allocated base, 2× ideal, set price); edits remain on preprocessing/Final Review or via **`POST …/manual-review/`** when exposed elsewhere.
- **Check-in**: **`POST /api/inventory/items/{id}/processing-print-and-check-in/`** then browser **`localPrintService`** (persist-first); optional sibling **`applyRetailAll`** / **`applyConditionAll`**.
- **Print multiple / dispute / merge / swap / bulk disposition**: order-scoped **`POST`** actions (see `inventory.api.ts`); UI wires **`ProcessingBulkActionBar`** + **`MergeModal`** / **`BulkDispositionModal`** / **`SwapModal`** + dispute flows.
- **Client**: React Query key **`['processing-workspace', orderId]`** (`useProcessingWorkspace.ts`), filters via **`processingWorkspaceFilters.ts`** (**V-07 / V-08 / V-12**).

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

- `usePurchaseOrder`, `useDeliverOrder`, `useUploadManifest`, `useManifestRows`, `usePreviewStandardize`, `useProcessManifest`, `useUpdateManifestPricing`, `useMatchProducts`, `useCreateItems`, `useMarkOrderComplete`, `useAICleanupRows`, `useAICleanupStatus`, `useCancelAICleanup`
- `useBatchGroups(params, enabled)`, `useUpdateBatchGroup`, `useCheckInBatchGroup`, `useDetachBatchItem`
- `useMarkOrderPaid`, `useRevertOrderPaid`, `useMarkOrderShipped`, `useRevertOrderShipped`, `useRevertOrderDelivered`
- `useItems(params, enabled)`, `useUpdateItem`, `useCheckInItem`, `useMarkItemReady`, `useCheckInOrderItems`
- `useProducts`, `useVendors`, etc.
- `useOrderDeletePreview`, `usePurgeDeleteOrder`

### API (`inventory.api.ts`)

- Orders: `getOrders`, `getOrder`, `createOrder`, `updateOrder`, `deleteOrder`, `getOrderDeletePreview`, `purgeDeleteOrder`
- Status: `markOrderPaid`, `revertOrderPaid`, `markOrderShipped`, `revertOrderShipped`, `deliverOrder`, `revertOrderDelivered`
- Manifest/processing: `uploadManifest`, `getManifestRows`, `previewStandardize`, `processManifest`, `updateManifestPricing`, `matchProducts`, `createItems`, `checkInOrderItems`, `markOrderComplete`, `getProcessingWorkspace`, `processingPrintAndCheckIn`, `processingPrintMultiple`, `processingDispute`, `processingMergeRows`, `processingSwap`, `processingBulkDisposition`, `processingPatchItem`, `aiCleanupRows`, `getAICleanupStatus`, `cancelAICleanup`
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
