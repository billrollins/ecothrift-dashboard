# Processing data lifecycle — post-finalize CRUD vs Item Processor

**Audience:** Staff-facing inventory pipeline (engineering).  
**Last reviewed:** 2026-05-01 (**v2.21.0**: `ProcessingRow`, paginated workspace, lazy detail, **no** `processing-swap`; against `apps/inventory/models.py`, `views.py`, `processing_ops.py`, `services/processing_workspace.py`).

---

## 1. `ProcessingRow` queue bookmarks (**v2.21.0**)

The **`ProcessingRow`** table (`inventory_processingrow`) holds **one row per manifest queue line** for Item Processor UI: FK **`purchase_order`**, **`row_number`**, optional **`manifest_row`** / **`matched_product`**, mirrored listing + **`queue_*`** denormalizations (`queue_status`, `qty_dispositioned`, `pending_item_count`, `list_*`, `item_ids`). Bookmarks align with preprocessing finalize → **`ManifestRow`** + **`Product`** + **`Item`** creation (see **`build-processing-data`** / **`finalize-preprocessing`** flow in **`views.py`**).

**`GET …/processing-workspace/`** builds a paginated **`rows`** slice primarily from **`ProcessingRow`** (**not** hydrating every nested **`Item`** for the PO). **`GET …/processing-row-detail/`** returns full **`items` + `product`** for one bookmark when the active card expands.

Older **`ProcessingBatch`** remains audit/run metadata only — **not** a substitute for **`ProcessingRow`**.

Mutations in **`processing_ops.py`** persist **`Item`** (and **`ManifestRow`/`Product`** when merging or syncing manual-review).

---

## 2. Timeline: three phases

| Phase | When | Primary tables | Main APIs |
|-------|------|----------------|-----------|
| **A — Bootstrap** | Immediately after **`POST …/finalize-preprocessing/`** succeeds | `ManifestRow`, `Product`, `Item`, optional `BatchGroup`, `ProcessingBatch`; `PreprocessingOrder.finalized_at` set | Finalize runs internally; optional **`GET …/manual-review/`** calls `ensure_manifest_products_and_items` if no items yet |
| **B — Canonical line CRUD** | Any time after finalize (order-level listing edits) | `ManifestRow` (+ sync to `Product` + non-terminal `Item`) | **`GET/POST …/manual-review/`** |
| **C — Unit-level processing** | Dock / Item Processor | **`ProcessingRow`** (paginated workspace list), **`Item`** units; **`ManifestRow`/`Product`** listing glue | **`GET …/processing-workspace/`** + **`GET …/processing-row-detail/`** + mutation endpoints below |

---

## 3. Phase A — What exists right after finalize

**`finalize-preprocessing`** (single atomic transaction, see `PurchaseOrderViewSet.finalize_preprocessing`):

1. Applies optional staging **`rows`** payload; validates price + title/description on each **`PreprocessingRow`**.
2. **`snapshot_finalize_from_ai_and_standard(..., fill_missing_only=True)`** + `bulk_update` of **`final_*`** only.
3. **Deletes** all **`ManifestRow`** for the PO, **non-terminal `Item`**, and **all `BatchGroup`** for the PO.
4. **Creates** new **`ManifestRow`** rows from **`final_*`** (listing fields, identifiers, taxonomy, specs, tracking, pricing, `batch_flag`, `match_status='pending'`, etc.).
5. **`ensure_manifest_products_and_items`** — for each manifest row:
   - **Find-or-create `Product`**; set **`ManifestRow.matched_product`**, **`match_status='matched'`**, **`ai_match_decision='confirmed'`**.
   - **`_sync_manifest_items_for_row`** — maintain **exactly `quantity` intake `Item` rows** per manifest row (create/update/delete extras); link **`manifest_row`**, **`purchase_order`**, **`product`**, price/cost/condition/specs, **`processing_tier`** heuristic.
6. Optional **`BatchGroup`** creation + tagging **`Item.processing_tier='batch'`** for qualifying rows.
7. **`ProcessingBatch`** created or aligned (run metadata).
8. **`PreprocessingOrder`**: **`finalized_at`**, **`workflow_status='finalized'`**, **`current_step`** updated.

**Essential invariant after A:** every finalized line has **`ManifestRow`** + **`Product`** + **`Item`(s)** in sync for quantity (until staff change things in B/C).

---

## 4. Phase B — Initial / ongoing CRUD after final (“manual review”)

**Purpose:** Edit **canonical manifest lines** (listing + pricing at row level), then **push** those changes to **`Product`** and **non-terminal `Item`** rows on the same manifest line.

- **`GET …/manual-review/`** — paginated **`ManifestRow`** list + summary. If **`order.items`** is empty, calls **`ensure_manifest_products_and_items`** first (safety net).
- **`POST …/manual-review/`** — body `{ rows: [{ id, title?, brand?, model?, category?, condition?, search_tags?, notes?, specifications?, batch_flag?, final_price?, pricing_notes? }] }`. Updates **`ManifestRow`** fields, then **`sync_manifest_row_outputs_to_items`** for changed rows (updates **`Product`** + linked **`Item`** fields).

**Essential data touched in B:**

| Entity | Typical updates |
|--------|-----------------|
| **`ManifestRow`** | `title`, `brand`, `model`, `category`, `condition`, `notes`, `search_tags`, `specifications`, `batch_flag`, `final_price` / `proposed_price` / `pricing_stage`, `pricing_notes` |
| **`Product`** | Title, brand, model, category, description, specs, default price, UPC — mirrored from manifest row |
| **`Item`** | Title, brand, condition, price, unit retail, cost, specs, product link |

**Not** the primary place for **check-in**, **dispatch location**, or **per-unit dispute** — those are **Item**-level (Phase C).

---

## 5. Phase C — During Item Processor (“processing”)

**Read model (**v2.21.0**):**

- **`GET …/processing-workspace/`** — **`build_processing_workspace`** returns **`rows`** (**`ProcessingRow`** + light joins), **`progress`** aggregates, **`row_count_filtered`/`row_count_total_po`**. Optional duplicate hints when enabled (no longer require scanning the **entire** PO manifest on every lazy-detail request — see **`processing_workspace.py`**).
- **`GET …/processing-row-detail/`** — full nested **`manifest_row`/`items`/`product`** slice for **`processing_row_id`**.

Historical note: legacy docs described a single **`build_processing_workspace`** graph that hydrated **all** manifest lines at once — that path is superseded by the split **list/detail** posture above.

**Writes** (orchestrated in `processing_ops.py`, exposed on `PurchaseOrderViewSet`):

| Endpoint (pattern) | Role |
|--------------------|------|
| **`POST …/processing-print-and-check-in/`** (item id in route) | Primary **check-in**: updates **`Item`** condition, price, retail, **location/dispatch**, notes; sets **`status='on_shelf'`**, **`checked_in_*`**; **`ItemHistory`** |
| **`POST …/processing-print-multiple/`** | Batch print path for a manifest row + qty (pending items) |
| **`POST …/processing-dispute/`** | Dispute / scrapped / lost paths — **`Item`** dispute fields + status |
| **`POST …/processing-merge-rows/`** | Merge manifest/products/items |
| **`POST …/processing-bulk-disposition/`** | Bulk disposition |

**Essential data touched in C (MVP operational loop):**

| Entity | Created / updated |
|--------|-------------------|
| **`Item`** | **`status`** (intake → processing → on_shelf; terminal disputed paths), **`condition`**, **`price`**, **`unit_retail`**, **`location`** (dispatch), **`notes`**, **`checked_in_at`**, **`checked_in_by`**, **`listed_at`**, **`dispute_*`** fields |
| **`ItemHistory`** | Audit rows for check-in and field changes |
| **`ManifestRow` / `Product`** | When merge runs or **`manual-review`** sync runs — **not** on every check-in |

**Removed from shipping:** **`POST …/processing-swap/`** — see **`CHANGELOG [2.21.0]`**.

**`ProcessingBatch`** — audit/run header (`inventory_processingbatch`); **not** a row-level workspace table.

---

## 6. What absolutely must stay consistent

1. **`ManifestRow.quantity`** ↔ **count of non-terminal `Item` rows** for that manifest row — enforced when **`ensure_manifest_products_and_items`** / **`_sync_manifest_items_for_row`** run (manual-review POST does **not** change quantity; fixing qty mismatches is **re-sync** or operational tooling).
2. **Listing truth for POS/catalog:** Prefer **`ManifestRow`** + **`manual-review`** for bulk listing edits; **check-in** adjusts **unit** price/condition/location on **`Item`**.
3. **Terminal items** (sold/scrapped/lost) are **never** deleted by finalize; finalize **blocks** if terminal items exist on the PO.

---

## 7. MVP definition (already largely shipped)

**MVP to support “finalize → process → shelf”:**

| # | Capability | Implementation status |
|---|------------|-------------------------|
| 1 | Promote staging → canonical **`ManifestRow` + Product + Item** | **`finalize-preprocessing`** |
| 2 | Fix listing/pricing on canonical rows post-final | **`manual-review`** GET/POST + **`sync_manifest_row_outputs_to_items`** |
| 3 | Load processor UI queue | **`processing-workspace`** |
| 4 | Check in one unit (price, condition, dispatch, on-shelf) | **`processing-print-and-check-in`** |
| 5 | Progress counts | **`processing_workspace`** `progress` block |
| 6 | Audit trail | **`ItemHistory`** on check-in |

**Nice-to-have / beyond MVP:** bulk disposition + multi-print + disputes — routed through `processing_ops.py` per UX rollout (**swap intentionally not shipped** in **v2.21.0**).

**Schema note:** **`ProcessingRow`** (**`inventory_processingrow`**) ships in **v2.21.0** as the **`processing-workspace`** queue projection — **`CHANGELOG [2.21.0]`**.

---

## 8. Quick reference — files

| Concern | Location |
|---------|----------|
| Finalize promotion | `apps/inventory/views.py` — `finalize_preprocessing` |
| Product/item sync from manifest | `ensure_manifest_products_and_items`, `_sync_manifest_items_for_row`, `sync_manifest_row_outputs_to_items` |
| Post-final row CRUD | `manual_review` |
| Workspace JSON | `apps/inventory/services/processing_workspace.py` — `build_processing_workspace` |
| Processor mutations | `apps/inventory/processing_ops.py` |
| Models | `apps/inventory/models.py` — **`ProcessingRow`**, `ManifestRow`, `Product`, `Item`, `BatchGroup`, `ProcessingBatch`, `PreprocessingOrder`, `PreprocessingRow` |

---

## 9. Summary sentence

**After final:** **`ManifestRow`** is the canonical **line**; **`Item`** is the **unit**; **`ProcessingRow`** is the **paginated queue projection** consumed by **`processing-workspace`**; **`manual-review`** is **line CRUD + sync**; processing mutations primarily update **`Item`** (**`processing-swap`** removed from shipping scope — **v2.21.0**) with **`processing-row-detail`** for heavy nested reads.
