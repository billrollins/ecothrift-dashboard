# Old pipeline surfaces (inventory snapshot)

High-level inventory **models**, **routes/pages**, **HTTP APIs**, and the **TypeScript/React Query layer** as wired today (`frontend/src/api/inventory.api.ts`, `frontend/src/hooks/useInventory.ts`). Field-level detail: **`old_data_model.md`**.

---

## 1. Django models / Postgres tables (`apps/inventory/models.py`)

Django default names: `inventory_<modelname lowercase>` unless overridden.

| Model | Table | Role |
|--------|------|------|
| `Vendor` | `inventory_vendor` | Suppliers |
| `Category` | `inventory_category` | Tree + product taxonomy helper |
| `PurchaseOrder` | `inventory_purchaseorder` | PO lifecycle; `manifest` → **`core.S3File`** |
| `CSVTemplate` | `inventory_csvtemplate` | Saved column maps per vendor |
| `ManifestRow` | `inventory_manifestrow` | Standardized manifest lines tied to PO |
| `PreprocessingOrder` | `inventory_preprocessingorder` | One-to-one prep session state per PO |
| `PreprocessingRow` | `inventory_preprocessingrow` | Staging rows before promotion to `ManifestRow` |
| `Product` | `inventory_product` | Catalog |
| `VendorProductRef` | `inventory_vendorproductref` | Vendor SKU ↔ product |
| `BatchGroup` | `inventory_batchgroup` | Processing batch units (`BTH-*`) |
| `Item` | `inventory_item` | Shelf SKU (`ITM*`…) |
| `ProcessingBatch` | `inventory_processingbatch` | Legacy/trace batch runs tied to PO |
| `ItemHistory` | `inventory_itemhistory` | Audit trail on items |
| `ItemScanHistory` | `inventory_itemscanhistory` | Lookup/POS scans; FK **`pos.Cart`** optional |

**Core extras touching intake:**

| Model | Table | Role |
|--------|------|------|
| `S3File` | `core_s3file` | Uploaded CSV blobs (`PurchaseOrder.manifest`) |
| `AppSetting` | `core_appsetting` | e.g. `ai_inventory_cleanup_models`, defaults for preprocessing cleanup |

---

## 2. React pages / routes (`frontend/src/App.tsx`)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/inventory/vendors` | `VendorListPage` | List vendors |
| `/inventory/vendors/:id` | `VendorDetailPage` | Vendor + templates |
| `/inventory/orders` | `OrderListPage` | PO list |
| `/inventory/orders/:id` | `OrderDetailPage` | PO detail, manifest upload, preprocess links |
| `/inventory/preprocessing` | redirect → last PO preprocess or `/inventory/orders` | Session-ish continuity |
| `/inventory/preprocessing/:id` | `PreprocessingPage` | Standardize → AI cleanup → manual review wizard |
| `/inventory/orders/:id/preprocess` | redirect → `/inventory/preprocessing/:id` | Legacy URL |
| `/inventory/processing` | `ProcessingPage` | Batches / tiers / items |
| `/inventory/products` | `ProductListPage` | Catalog browse |
| `/inventory/items` | `ItemListPage` | Item search/list |
| `/inventory/items/:id` | `ItemDetailPage` | Single item |
| `/inventory/quick-reprice` | `QuickRepricePage` | Fast SKU repricing |

---

## 3. HTTP API — router (`apps/inventory/urls.py`)

Base prefix: **`/api/inventory/`**.

### Resource ViewSets (CRUD + list semantics via DRF `DefaultRouter`)

| Prefix | ViewSet |
|--------|---------|
| `vendors/` | `VendorViewSet` |
| `categories/` | `CategoryViewSet` |
| `orders/` | `PurchaseOrderViewSet` | manifest/preprocessing actions here |
| `templates/` | `CSVTemplateViewSet` |
| `products/` | `ProductViewSet` |
| `product-refs/` | `VendorProductRefViewSet` |
| `batch-groups/` | `BatchGroupViewSet` |
| `items/` | `ItemViewSet` |
| `item-history/` | `ItemHistoryViewSet` |

### Extra function routes (`urlpatterns`)

| Method path | Handler |
|-------------|---------|
| `GET items/lookup/<sku>/` | `item_lookup` |
| `POST classify/` | `classify_item_view` |
| `GET store-report/` | `store_report_view` |
| `POST items/<pk>/verify-present/` | `verify_present_view` |
| `POST items/<pk>/quick-reprice/` | `quick_reprice_view` |
| `POST items/<pk>/duplicate-for-resale/` | `duplicate_item_for_resale_view` |
| `POST items/<pk>/mark-on-shelf/` | `mark_sold_item_on_shelf_view` |
| `POST estimate-price/` | `estimate_price_view` |

### `PurchaseOrderViewSet` custom actions (`orders/<id>/…`)

Grouped by concern:

- **Manifest / ingest:** `upload-manifest`, `process-manifest`, `preview-standardize`, `suggest-formulas`, `manifest-rows`, `clear-manifest-rows`, `clear-pricing`, `update-manifest-pricing`
- **Preprocessing staging:** `preprocessing-status`, `manual-review`, `preprocessing-review`, `finalize-preprocessing`
- **AI cleanup:** `ai-cleanup-rows`, `ai-cleanup-status`, `cancel-ai-cleanup`, `ai-cleanup-models`, `download-cleanup-csv`, `upload-cleanup-csv`
- **Legacy matching paths:** `match-products`, `match-results`, `review-matches`, `undo-product-matching`, `suggest-finalization`, `finalize-rows`
- **Handoff → inventory:** `create-items`, `estimate-prices`
- **PO lifecycle:** `mark-paid`, `revert-paid`, `mark-shipped`, `revert-shipped`, `deliver`, `revert-delivered`, `mark-complete`, `check-in-items`, `mark-items-broken`, `uncheck-in-items`
- **Delete:** `delete-preview`, `purge-delete`

(Item/BatchGroup ViewSets also expose check-in/process/detach-style `@actions`; see `views.py` for exact names.)

---

## 4. TypeScript API helpers (`inventory.api.ts`)

Thin Axios wrappers around the endpoints above — **`get*` / `*` verbs** mirroring REST:

**Orders / manifest:** `getOrders`, `getOrder`, `createOrder`, `updateOrder`, `deleteOrder`, `getOrderDeletePreview`, `purgeDeleteOrder`, status transitions (`markOrderPaid`, `deliverOrder`, …), `uploadManifest`, `processManifest`, `previewStandardize`, `getManifestRows`, `updateManifestPricing`, `suggestFormulas`, AI cleanup (`aiCleanupRows`, `getAICleanupStatus`, `cancelAICleanup`, CSV upload/download), `clearManifestRows`, `undoProductMatching`, `clearPricing`, `matchProducts`, `getMatchResults`, `reviewMatches`, `suggestFinalization`, `finalizeRows`, `createItems`, `finalizePreprocessing`, cleanup-model helpers, `getPreprocessingStatus`, manual/preprocessing review GET/PATCH, `markOrderComplete`, bulk broken/uncheck-in helpers.

**Templates / categories / products / refs:** `getTemplates`, CRUD template; CRUD `Categories`; CRUD `Products`; `getVendorProductRefs`.

**Items / batches / stats:** `getItems`, `getItem`, CRUD item; `getBatchGroups`, `getBatchGroup`, updates/process/detach; `getItemHistory`; `itemLookup`; `estimatePrice`, `estimateManifestPrices`; POS-ish helpers (`quickReprice`, `duplicateItemForResale`, `markSoldItemOnShelf`, `verifyItemPresent`, `getStoreReport`).

---

## 5. React Query hooks (`useInventory.ts`)

Hooks **`use*`** wrapping mutations/queries — mirrors **`inventory.api.ts`** (prefetch + invalidation). Highlights:

- Orders: `usePurchaseOrders`, `usePurchaseOrder`, mutations for CRUD + lifecycle + manifest pipeline hooks (`useUploadManifest`, `useProcessManifest`, `usePreviewStandardize`, … `useCreateItems`, `useFinalizePreprocessing`, preprocessing/manual-review hooks, cleanup-model hooks).
- Items/batches: `useItems`, `useItem`, `useBatchGroups`, `useBatchGroup`, processing mutations (`useProcessBatchGroup`, `useUpdateBatchGroup`, check-in/detach, bulk ops).
- Catalog: `useVendors`, `useProducts`, `useCategories`, templates, vendor refs.
- Misc: `useItemHistory`, `useItemStats`, `useAISuggestItem`, etc.

---

## 6. Inventory UI components (`frontend/src/components/inventory/`)

Not exhaustive — main building blocks tied to **preprocessing/processing**:

`StandardManifestBuilder`, `StandardManifestPreview`, `RowProcessingPanel`, `ManualReviewPanel`, `PreprocessingReviewTable`, `MatchReviewPanel`, `ProductMatchingPanel`, `FinalizePanel`, `ProcessingDrawer`, `ProcessingStatsBar`, `ProcessingSettingsModal`, `ItemForm`, `ItemFormWithActions`, `ItemDrawer`, `ItemActionBar`, `ItemListPanel`, `ItemHeroStats`, `ItemStatsPanel`.
