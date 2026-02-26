<!-- Last updated: 2026-02-25T22:00:00-06:00 -->

# Inventory Pipeline — Extended Context

This document describes the full inventory pipeline, models, and flows for the Eco-Thrift Dashboard.

---

## Design Decision: M3 (Universal Items + Smart Batch)

**Chosen approach:** Every physical unit is created as an `Item` record during `create-items`.

`BatchGroup` is a **processing accelerator** for bulk actions (price/condition/location/ready), not a separate inventory entity.

This preserves:
- single-path POS scanning (`ITM` only),
- per-unit traceability from day 1,
- faster processing for high-quantity rows through grouped actions.

Alternative approaches (including lot-ledger/deferred unitization) were archived under `.ai/prototype/archive/`.

---

## Pipeline Overview

```
Vendor → PurchaseOrder → CSV upload (S3) → Standard Manifest mapping (expression formulas + preview) → ManifestRow normalization → AI Row Cleanup (batch + concurrent) → Product Matching (fuzzy + AI decision) → Pricing & Finalize → Build check-in queue (create-items) → Check-in + print tags
```

1. **Vendor** — Source of purchased inventory (liquidation, retail, direct, other).
2. **PurchaseOrder** — Order placed with a vendor; tracks status from ordered through completion.
3. **CSV manifest upload** — Staff uploads a vendor CSV via `POST /inventory/orders/{id}/upload-manifest/`. File is saved to S3, preview persisted in `manifest_preview` JSON field. (Done on OrderDetailPage.)
4. **Standard Manifest preprocessing** (Step 1 of PreprocessingPage) — Raw CSV rows are loaded with `GET /inventory/orders/{id}/manifest-rows/`. Expression-based formulas map source columns to standard fields. Previewed via `POST .../preview-standardize/` and committed with `POST .../process-manifest/`. Formula engine supports `[COLUMN]` refs, functions (UPPER, LOWER, etc.), concatenation.
5. **AI Row Cleanup** (Step 2a of PreprocessingPage) — `POST .../ai-cleanup-rows/` sends rows in batches to Claude for title/brand/model/specs suggestions. Frontend controls batch iteration with configurable batch_size (5/10/25/50) and concurrency (1/4/8/16 threads). Supports pause, resume (via localStorage offset), and cancel (clears AI fields).
6. **Product matching** (Step 2b) — `POST .../match-products/` scores rows using UPC exact match, VendorProductRef, and text similarity. AI batch decisions determine whether to reuse existing product or create new. Results reviewed via match-results/review-matches endpoints.
7. **Pricing & Finalize** (Step 3) — User sets prices, makes final tweaks. Can navigate back to order overview or proceed to processing.
8. **Build check-in queue** — Items are created from manifest rows via `POST /inventory/orders/{id}/create-items/` (post-delivery), with optional `BatchGroup` assignment for batch-tier rows.
9. **Arrival check-in** — Items/batches are checked in and marked shelf-ready via dedicated check-in actions, then labels are printed.

---

## Vendor Model

- **Types**: `liquidation`, `retail`, `direct`, `other`
- **Soft delete**: `perform_destroy` sets `is_active=False` instead of deleting
- **Fields**: `name`, `code` (unique), `vendor_type`, contact info, `address`, `notes`, `is_active`
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

### Additional Fields

- **`order_number`** — Auto-generated `PO-XXXXX` or user-provided; editable after creation.
- **`description`** — Title-like summary of the order (e.g. "6 Pallets of Small Appliances, 130 Units...").
- **`condition`** — Choices: `new`, `like_new`, `good`, `fair`, `salvage`, `mixed`.
- **`retail_value`** — Estimated retail value (can be blank for unmanifested orders).
- **`manifest_preview`** — JSONField persisting CSV headers + first 20 rows for display on reload.

---

## CSV Manifest Upload (S3)

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

Standardized row data extracted from vendor CSVs.

- **`purchase_order`** — FK
- **`row_number`** — 1-based row index
- **`quantity`** — Number of items (default 1)
- **`description`**, **`title`**, **`brand`**, **`model`**, **`category`**, **`condition`**
- **`retail_value`** — Used as item cost
- **`proposed_price`**, **`final_price`**, **`pricing_stage`**, **`pricing_notes`** — pre-arrival pricing workspace fields
- **`upc`**, **`vendor_item_number`**, **`notes`**
- **`batch_flag`** — Boolean for batch-tier marking
- **`search_tags`** — Text for search optimization
- **`specifications`** — JSONField for structured specs (key-value pairs)
- **`matched_product`** — FK to Product after matching
- **`matched_product_title`**, **`matched_product_number`** — Denormalized for display
- **`match_status`** — `pending`, `matched`, `new`
- **`match_candidates`** — JSONField storing fuzzy match results with scores
- **`ai_match_decision`** — AI's recommendation: `use_existing`, `create_new`, `uncertain`
- **`ai_reasoning`** — Text explanation from AI about the match decision
- **`ai_suggested_title`**, **`ai_suggested_brand`**, **`ai_suggested_model`** — AI-cleaned values

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

## AI Row Cleanup Pipeline (v1.6.0)

### Backend Flow
1. **`POST /api/inventory/orders/{id}/ai-cleanup-rows/`** — Accepts `model`, `batch_size`, `offset`.
   - Fetches `batch_size` rows starting at `offset` (ordered by `row_number`).
   - Constructs a Claude prompt with row data asking for cleaned title, brand, model, search tags, specifications, and reasoning.
   - Parses JSON response and saves `ai_suggested_title`, `ai_suggested_brand`, `ai_suggested_model`, `search_tags`, `specifications`, `ai_reasoning` to each row.
   - Returns `{ rows_processed, total_rows, offset, suggestions, model_used, has_more }`.
2. **`GET .../ai-cleanup-status/`** — Returns `{ total_rows, cleaned_rows, remaining_rows }` based on presence of `ai_suggested_title`.
3. **`POST .../cancel-ai-cleanup/`** — Clears all AI-generated fields across all manifest rows for the order.

### Frontend Flow
- `RowProcessingPanel` drives the batch loop from the frontend.
- User selects model (via `ModelSelector`), batch size (5/10/25/50), and thread count (1/4/8/16).
- On "Run AI Cleanup", launches `concurrency` workers via `Promise.allSettled`.
- Each worker grabs the next offset from shared `nextOffsetRef`, sends the API request, and loops until `has_more` is false or paused/cancelled.
- **Pause**: Sets `pauseRef` flag; workers complete current request then stop. Offset persisted to localStorage for cross-session resume.
- **Cancel**: Calls `cancel-ai-cleanup` endpoint to clear all AI data, resets state.
- Progress shows: "X of Y rows cleaned" with spinner and active thread count.

### Expandable Row Details
- Each row in the cleanup table can be expanded (chevron toggle, multi-expand supported).
- Expanded view shows two side-by-side Paper cards:
  - **Original Manifest Data**: description, brand, model, category, condition, retail_value, UPC, vendor_item_number, quantity
  - **AI Suggestions**: ai_suggested_title, ai_suggested_brand, ai_suggested_model, search_tags, specifications (key-value grid), ai_reasoning (quote block)
- Changed fields are highlighted with bold text and warning color.

### Known Issues (Pending Fix)
- User reported "there's a lot wrong" after concurrent batching was added. Likely issues: race conditions in shared offset, duplicate processing, error handling gaps, progress counter drift. **Next session should test and fix.**

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
- `POST /inventory/orders/{id}/check-in-items/` — bulk check-in for order-scoped queues
- `POST /inventory/batch-groups/{id}/check-in/` — batch check-in path

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
  - `POST /inventory/batch-groups/{id}/check-in/` — check in pending batch items and mark shelf-ready
  - `POST /inventory/batch-groups/{id}/detach/` — remove one item for individual exception processing

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

### Processing Page (`ProcessingPage.tsx`) — v1.9.0

"Command Center + Side Drawer" design. Key features:
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
- Manifest/processing: `uploadManifest`, `getManifestRows`, `previewStandardize`, `processManifest`, `updateManifestPricing`, `matchProducts`, `createItems`, `checkInOrderItems`, `markOrderComplete`, `aiCleanupRows`, `getAICleanupStatus`, `cancelAICleanup`
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
