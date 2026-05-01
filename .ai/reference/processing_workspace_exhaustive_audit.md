# Item Processor workspace — exhaustive audit

**Route:** `/inventory/processing/:id` (e.g. `/inventory/processing/316`)  
**Front container:** `frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx`  
**Primary API:** `GET /api/inventory/orders/{id}/processing-workspace/`  
**Purpose of this doc:** Single reference for **all data sources**, **all mutations**, **client derivation**, **React Query behavior**, **backend query/build paths**, and **performance hotspots** found during code review (May 2026).

> **Supersedes in part (v2.21.0):** **`SwapModal`** and **`POST …/processing-swap/`** were **removed**. Workspace load is **paginated** (`GET …/processing-workspace/`) plus lazy **`GET …/processing-row-detail/`** — not a single monolithic `useQuery` that hydrates every nested line. Sections below remain a **May 2026 audit trail**; current surface: **`CHANGELOG [2.21.0]`**, **`extended/inventory-pipeline.md`**, **`processing_data_lifecycle.md`**.

---

## 1. Route and composition

| Piece | Role |
|-------|------|
| `ProcessingWorkspacePage` | Params (`id`), loads workspace slices + order picker list, owns filters/search/modals/state |
| `ProcessingWorkspaceHeader` | Order picker (`Autocomplete`), scanner/search input, progress stats, 1s tick for elapsed/rate |
| `ProcessingFilterRow` | Segment chips, hide-dispositioned toggle, product filter chip |
| `ProcessingQueueTable` | Sortable table; receives **already filtered** paginated `rows`; **no virtualization** |
| `ProcessingActiveCard` | Row detail + unit editor (**hydrates from `processing-row-detail`**); optional **PATCH product** + cache merge |
| `ProcessingBulkActionBar` | Merge / bulk disposition / dispute entry (≥2 rows); **no network** (**swap entry removed**) |
| `ProcessingWorkspaceFooter` | Close PO, reset-all entry |
| Modals | `PrintMultipleModal`, `DisputeModal`, `MergeModal`, `BulkDispositionModal`, reset + complete dialogs |

## 2. Initial load — every network dependency

### 2.1 Blocking / streaming: processing workspace slices

- **Hook:** `useProcessingWorkspace(orderId)` — **`useInfiniteQuery`** keyed by **`['processing-workspace', orderId, …filters]`** (plus **`getNextPageParam`** from **`limit`/`offset`**); **`flattenPages`** merges each **`rows`** page client-side (**v2.21.0**).
- **Client:** `getProcessingWorkspace(params)` → **`GET /inventory/orders/{orderId}/processing-workspace/?limit=…&offset=…`**
- **Row detail:** **`getProcessingRowDetail`** → **`GET …/processing-row-detail/?processing_row_id=…`** when the active row expands (**not always on first paint**).
- **Server:** `PurchaseOrderViewSet.processing_workspace` → **`build_processing_workspace`** / slim list path (DRF bypass; JSON `dict`).

**Workspace list aggregate shape** (`ProcessingWorkspaceDTO`):

- **`order`**, **`session`**, **`progress`**, **`processingBookmarkOnly?`**, **`preprocessing_finalized_at?`** — same as before (see `inventory.types.ts`).
- **`rows`** — slice for this request; includes **`row_count_filtered`**, **`row_count_total_po`**, **`workspace_limit`**, **`workspace_offset`** when paginated.

**Hydration:** list **`rows`** may omit or slim nested **`items`/`product`**; **`processing-row-detail`** returns the hydrated row blob for the active card.

Older sections of this audit that assume **every** list row carries full nested units describe the **pre-v2.21.0** posture.

### 2.2 Parallel (non-blocking for first paint of error/loading): order picker list

- **Hook:** `usePurchaseOrders({ status__in: 'delivered,processing,complete', ordering: '-ordered_date', page_size: 100 }, enabled)`
- **Query key:** `['purchaseOrders', params]` — **params object identity matters** for caching (memoized in page).
- **Purpose:** Populate `Autocomplete` in header; if current PO missing from page, page **merges** current order summary from workspace into `pickerOrders`.

### 2.3 Browser / local

- **`localStorage`:** `lastProcessingOrderId` updated when `workspace.order.id` is known.

### 2.4 React Query defaults (`frontend/src/main.tsx`)

- `staleTime: 30_000` — workspace refetch won’t auto-run again within 30s unless invalidated/refetched.
- `refetchOnWindowFocus: false`
- `retry: 1`

### 2.5 React `StrictMode`

- Root wraps `<React.StrictMode>` → in **development**, effects/queries may **double-invoke**; expect duplicate initial fetches when profiling dev builds only.

---

## 3. Workspace payload — per-row content (why responses get huge)

Each `ProcessingWorkspaceRowDTO` includes:

- Identity & ordering: `manifest_row_id`, `rowNum`, `productId`
- **Product snapshot:** `product` (`ProcessingWorkspaceProductDTO | null`) — includes **`specs`** (full `Record`), UPC, taxonomy-ish fields
- **Manifest text fields:** `title`, `brand`, `model`, `description`, `tags`, `taxonomy`, `category`
- **Heavy JSON:** `specs`, `identifiers`, `tracking` (arbitrary dicts from DB)
- **Economics:** `qty`, `qtyDispositioned`, `unitRetail`, `manifestNotes`, `price`, `dispatch`, `sku`
- **Queue UX:** `status` (pending/partial/checked_in/disputed), `likelyDuplicateOf[]`
- **Nested array:** `items` — list of `ProcessingWorkspaceItemDTO` (every unit on that line)

Every item includes prices, condition labels, dispatch/disposition mapping, dispute fields, status, etc.

**Implication:** Orders with hundreds of lines × multiple units × large `specifications` / `identifiers` JSON produce **very large JSON** bodies and **expensive React reconciliation** when replaced wholesale.

---

## 4. Backend — how `build_processing_workspace` is built

**Module:** `apps/inventory/services/processing_workspace.py`  
**Entry:** `build_processing_workspace(order: PurchaseOrder)`

### 4.1 Branching logic

1. **`ManifestRow.objects.filter(purchase_order=order).exists()`**
   - If **True** → `_workspace_from_manifest_rows(..., processingBookmarkOnly=False)`
   - Note: **extra query** before the real load.

2. Else **`ProcessingRow`** bookmarks ordered by `row_number`
   - If any → `_workspace_from_bookmarks(...)` with **`processingBookmarkOnly: True`**, synthetic negative `manifest_row_id` (`-bookmark_pk`), **`items: []`**.

3. Else empty workspace: `rows: []`, zero progress, still returns order shell + `preprocessing_finalized_at`.

### 4.2 Manifest path (`_workspace_from_manifest_rows`)

**Query:**

- `ManifestRow.objects.filter(purchase_order=order)`
- `.select_related('matched_product')`
- `.prefetch_related(Prefetch('items', queryset=Item.objects.select_related('product').order_by('id')))`
- `.order_by('row_number')`
- Evaluated as **`list`** (`rows_list = list(rows_qs)`).

**Per-row work:**

- `items = list(mr.items.all())` then sort by id
- UPC duplicate map across **all** rows (`_build_upc_dup_map_manifest`)
- Serialize each item via `_serialize_item`
- Serialize matched product via `_serialize_product` (**pulls full `prod.specifications`** into `specs`, extracts tags string)

**Progress:**

- `Item.objects.filter(purchase_order=order).exclude(status='sold').aggregate(total_units=Count, pending_units=Count filtered intake/processing)`

**Other:**

- `_preprocessing_finalized_iso(order)` → **`PreprocessingOrder.objects.filter(purchase_order_id=order.pk).only('finalized_at').first()`** — **one extra query per workspace build**.

### 4.3 Session block

Always returned as:

```python
'session': {'items_per_hour': 0, 'elapsed_seconds': 0, 'session_log': []}
```

(No server-side session aggregation implemented yet.)

### 4.4 `PurchaseOrderViewSet.get_queryset` — important optimization

For actions in `_PURCHASE_ORDER_SLIM_DETAIL_ACTIONS`, queryset is:

`PurchaseOrder.objects.select_related('vendor', 'created_by').all()` — **no** `_annotate_purchase_order_stats`, **no** `prefetch_related('manifest_rows')`.

**Comment in code:** prefetching every manifest row on `get_object()` **duplicate-loads giant manifests** and **can wedge SQLite**.

**Included actions:**  
`processing_workspace`, `processing_print_multiple_action`, `processing_dispute_action`, `processing_merge_rows_action`, `processing_bulk_disposition_action`, `build_processing_data`.

So **`get_object()` stays slim**; **`build_processing_workspace`** no longer implies loading **every** manifest line + nested item graph into one response (**v2.21.0** splits list vs detail).

---

## 5. Build / reset processing data (canonical manifest + items)

**Endpoint:** `POST /inventory/orders/{id}/build-processing-data/`  
**View:** `PurchaseOrderViewSet.build_processing_data`  
**Service:** `build_manifest_from_processing_rows` in `apps/inventory/services/processing_finalize.py`

** Preconditions:**

- `preprocessing.finalized_at` must be set (400 `not_finalized` otherwise).
- Raises **`terminal_items_block`** (409) if non-terminal rules hit terminal inventory state.

**High-level DB behavior (atomic):**

- Deletes existing **`ManifestRow`** for PO, deletes **non-terminal `Item`** rows, deletes **`batch_groups`**, bulk creates new manifest rows from **`ProcessingRow`** bookmarks, runs **`ensure_manifest_products_and_items`**, optional **`ProcessingBatch`** + **`BatchGroup`** heuristics for batch tiers.

**Response:** JSON summary, e.g. `manifest_rows`, `processing_row_bookmarks`, `batch_groups_created`, `processing_batch_id`, plus keys from `ensure_summary` (`items_created`, etc.) — see `BuildProcessingDataResponse` in `inventory.api.ts`.

**Frontend:** `useBuildProcessingData` → on success **invalidates** `processing-workspace`, `purchaseOrders`, `purchaseOrders/{id}`, `items`, `batchGroups`.

**Reset UX:** Same POST after typing `RESET` in-dialog — destructive rebuild path documented in UI copy.

---

## 6. All Item Processor mutation endpoints (server → always rebuilds workspace)

Implemented in `apps/inventory/processing_ops.py`, wired from `views.py`.

| Client route | HTTP | processing_ops function | Returns |
|--------------|------|-------------------------|---------|
| `/inventory/items/{id}/processing-print-and-check-in/` | POST | `processing_print_and_check_in` | `{ item, workspace, label_print_job_id }` (`label_print_job_id` currently `''`) |
| `/inventory/items/{id}/processing-patch/` | PATCH | `processing_patch_item` | `{ item, workspace }` |
| `/inventory/orders/{id}/processing-print-multiple/` | POST | `processing_print_multiple` | `{ checked_in_item_ids, workspace, label_print_job_id }` |
| `/inventory/orders/{id}/processing-dispute/` | POST | `processing_dispute` | `{ workspace }` |
| `/inventory/orders/{id}/processing-merge-rows/` | POST | `processing_merge_rows` | `{ workspace }` _(often includes **`workspace_patch`**)_
| `/inventory/orders/{id}/processing-bulk-disposition/` | POST | `processing_bulk_disposition` | `{ workspace }` _(often includes **`workspace_patch`**)_

**Pattern (v2.21.0+):** responses frequently include **`workspace_patch`** (incremental **`rows` + `progress`**) merged into the infinite-query cache; server may still return a **`workspace`** snapshot for backwards compatibility — see `useProcessingWorkspace.ts`.

_(**`processing_swap`** endpoint removed.)_

### 6.1 Payload contracts (frontend → backend)

**Print & check-in** (`ProcessingActiveCard` pending unit):

- `condition` (UI label e.g. `'Used Good'`), `dispatch`, `retail` / `unit_retail`, `price`, `notes`, `applyConditionAll`, `applyRetailAll`

**Print multiple** (`PrintMultipleModal`):

- `manifest_row_id`, `qty`, `condition`, `dispatch`, `retail`, `price`

**Patch checked-in:**

- `price`, `retail` / `unit_retail`, `dispatch` (and optionally `condition`, `notes` per backend)

**Dispute** (`DisputeModal`):

- `type`: `'broken'` \| `'undelivered'`
- `scope`: `'items'` + `ids: [itemId]` **or** `'manifest_rows'` + `ids: [manifestRowId, ...]`
- Broken: `pct_loss`, `description`

**Merge** (`MergeModal`):

- `manifest_row_ids: number[]`
- `field_values`: `{ title, brand, model, category, description, tags, specs? }`

**Bulk disposition** (`BulkDispositionModal`):

- `manifest_row_ids`, `retail?`, `groups[]` with `count`, `condition`, `dispatch`, `price`, optional `disputed` object (`broken` / `undelivered`)

---

## 7. Additional APIs touched from this page (non-workspace)

| Trigger | API | Notes |
|---------|-----|------|
| Save product from detail card | `PATCH /inventory/products/{id}/` via `updateProduct` | On success: **`invalidateQueries(['processing-workspace', orderId])`** + parent **`refetch()`** |
| Close PO | `POST /inventory/orders/{id}/mark-complete/` | `useMarkOrderComplete` invalidates **`purchaseOrders`** keys; page **`refetch()`** workspace on success |
| Label printing | `localPrintService` → **`http://127.0.0.1:8888`** | After successful Django mutations only; failures surface as snackbars |

---

## 8. Client-side-only data flow (no extra HTTP)

### 8.1 `ProcessingWorkspacePage` local state

- `search`, `segment`, `hideDispositioned`, `detailManifestRowId`, `selectedItemId`
- `bulkSelectedIds` (`Set<number>` manifest row ids)
- `productFilterProductId`, `productFilterTitle`
- `sessionCheckInCount`, `searchFocusSignal`
- Modal open flags + dispute bulk ids + reset phrase

### 8.2 Derived data (recomputed when workspace / filters change)

- `manifestTotalQty`, `manifestDispositioned` — **`reduce` over all `workspace.rows`**
- **`scopeRows`** — segment + product filter (**maps each row’s items** for segment match)
- **`filteredRows`** — search tokens **or** hide-dispositioned when search empty  
  - Search path: **`buildProcessingSearchBlob` per row**, **`matchesProcessingSearch`** (every whitespace token must appear as substring in blob)
- **`selectedRow`**, **`activeItem`**, **`bulkRowsSelected`**, **`sameProductBulk`**, **`swapRowNums`**

### 8.3 Scanner behavior

- **Enter** in search: if single token (`isSingleScanToken`), **`rowsMatchingExactUpc(scopeRows, q)`** — if exactly one hit, opens detail and clears search.

### 8.4 Queue table

- **`sortedRows`** — client sort (`localeCompare`, numeric parses on money strings)
- **Sticky header**, **`maxHeight: min(52vh, 560px)`**, scroll inside container
- **Every row:** checkbox, multiple cells, optional dup chip + **Tooltip**

---

## 9. React Query cache — writes and invalidations

### 9.1 Workspace query

- **Set:** `patchWorkspaceCache` on successful processing mutations that return `workspace`.
- **Invalidate:**
  - `useBuildProcessingData.onSuccess`
  - `useFinalizePreprocessing.onSuccess` (`useInventory.ts`) — also invalidates **`['processing-workspace', orderId]`**
  - `ProcessingActiveCard` product save success

### 9.2 Purchase order list thrash

Most hooks in `useProcessingWorkspace.ts` **`invalidateQueries({ queryKey: ['purchaseOrders'] })`** on success — matches **all** cached purchase-order list queries regardless of params.

That includes the workspace header query **`['purchaseOrders', processingOrdersParams]`**, causing **refetch up to 100 orders** after check-in, dispute, merge, bulk disposition, print multiple.

**Exceptions:**

- `useProcessingPatchItem` — patches workspace; invalidates **`items`** only (no `purchaseOrders`).

### 9.3 Mark complete

- Invalidates **`purchaseOrders`** + **`purchaseOrders/{orderId}`**; workspace refetch only via explicit **`refetch()`** in dialog success handler.

---

## 10. UI timers and rendering notes

### 10.1 Header 1-second interval

`ProcessingWorkspaceHeader`:

- `useEffect` + `setInterval(..., 1000)` updates local `tick` state → **header subtree re-renders once per second** for elapsed time and items/hour estimate.
- Does **not** by itself refetch server data.

### 10.2 Search input

- Plain controlled `<input>` bound to parent `search` → **every keystroke** updates parent state → **full page re-render** + **`filteredRows` rebuild**.

### 10.3 Modals receiving large props

- **`MergeModal` / `BulkDispositionModal`** receive **`ProcessingWorkspaceRowDTO[]`** for selected rows — can be heavy when nested **`items`** are hydrated.

---

## 11. Performance findings (ranked by typical impact)

**v2.21.0 mitigation:** paginated **`processing-workspace`** (**default ~25-row slice**) + **`processing-row-detail`** reduce baseline payload vs the original “hydrate entire PO graph on every workspace GET”. Bullets below still matter for worst-case paths (pagination max, patch merges, DEV StrictMode).

1. **Large workspace GET when `limit` is high + deep nested payloads** — still scales with **slice size × nested JSON**; pagination trades round-trips vs bytes.
2. **Server work per mutation** — may still rebuild **slices** / patches; verify hot paths return **`workspace_patch`** instead of forcing a full **`limit=∞`** replay.
3. **No table virtualization** — **`ProcessingQueueTable`** maps **every** filtered row to DOM nodes.
4. **Search/filter work per keystroke** — rebuilds search blob per row; **no debouncing**, **no precomputed search index** keyed by workspace revision.
5. **`invalidateQueries(['purchaseOrders'])`** after most mutations — extra **list fetch + JSON parse** unrelated to queue redraw (workspace already patched).
6. **Product PATCH + full workspace refetch** — doubles network vs patching workspace from response if API returned updated slice (future optimization).
7. **`reduce` over full rows** for manifest totals on each relevant render — minor vs (1)–(4).
8. **Dev StrictMode** — doubles initial requests during development profiling.

---

## 12. Related tests (for regressions)

- `apps/inventory/tests/test_processing_validation_matrix.py` — workspace GET + several processing endpoints.
- `apps/inventory/tests/test_preprocessing_redesign.py` — `build-processing-data`, bookmark workspace behavior.

---

## 13. Source index (quick navigation)

| Area | Path |
|------|------|
| Page | `frontend/src/pages/inventory/processing/ProcessingWorkspacePage.tsx` |
| Hooks | `frontend/src/hooks/useProcessingWorkspace.ts`, `frontend/src/hooks/useInventory.ts` (`usePurchaseOrders`, `useMarkOrderComplete`, `useFinalizePreprocessing`) |
| API client | `frontend/src/api/inventory.api.ts` |
| Types | `frontend/src/types/inventory.types.ts` (`ProcessingWorkspace*` types) |
| Filters | `frontend/src/pages/inventory/processing/processingWorkspaceFilters.ts` |
| Workspace builder | `apps/inventory/services/processing_workspace.py` |
| Mutations | `apps/inventory/processing_ops.py` |
| Canonical build | `apps/inventory/services/processing_finalize.py` (`build_manifest_from_processing_rows`) |
| Routes | `apps/inventory/views.py` (`PurchaseOrderViewSet`, `ItemViewSet` processing actions) |
| Print client | `frontend/src/services/localPrintService.ts`, `frontend/src/pages/inventory/processing/printProcessingLabel.ts` |
| Query defaults | `frontend/src/main.tsx` |

---

*Generated from repository inspection; behavior reflects code as of the audit date.*
