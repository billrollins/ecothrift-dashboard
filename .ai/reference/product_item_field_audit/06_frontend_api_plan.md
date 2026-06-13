# 06 — Frontend + API Contract Plan

**Purpose:** define what the frontend should send, display, and stop depending on during the cleanup.

Also keep [`10_audit_followups.md`](./10_audit_followups.md) open during implementation; it captures the concrete frontend/API hotspots found by the audit pass.

## API Contract Targets

### Product DTO

Keep/send:

- `id`
- `product_number`
- `title`
- `brand`
- `model`
- `category`
- `description`
- `specifications`
- `identifiers`
- `tags`
- `is_active`

Remove from target write/read contract:

- `default_price`
- flat `upc`
- `times_ordered`
- `total_units_received`

Do not add a flat UPC write path. Display UPC-like values from `identifiers`.

### Item DTO

Keep/send:

- `id`
- `sku`
- `product`
- Product-backed display fields: `product_title`, `product_brand`, `product_model`, `product_category` or equivalent
- `purchase_order`
- `manifest_row`
- `price`
- `retail`
- `status`
- `condition`
- `location`
- `specifications`
- lifecycle fields
- `notes`
- dispute fields

Remove from target write/read contract:

- Item-owned `title`
- Item-owned `brand`
- `unit_retail` as an Item field
- `unit_count`
- `processing_tier`
- `batch_group`

Row-level APIs still use:

- `ProcessingRow.unit_retail`
- `ProcessingRow.quantity`
- `ProcessingRow.shelf_price`

## Product Page / Table

Files:

- `frontend/src/pages/inventory/ManageProductsPage.tsx`
- `frontend/src/pages/inventory/manage/ProductCatalogTable.tsx`
- Product API/type files

Required changes:

- Search bar keeps the same UX.
- Product search calls `search` against the new backend token-AND search.
- Display identifiers and tags in a compact way.
- Remove Product price column/sort.
- Remove flat UPC as a primary column unless shown as read-only `identifiers.upc`.
- Remove stats columns if they exist.
- Product edit/create form edits `identifiers` and tags.

## Item Page / Table

Files:

- `frontend/src/pages/inventory/ManageItemsPage.tsx`
- `frontend/src/pages/inventory/manage/ItemCatalogTable.tsx`
- `frontend/src/components/inventory/ItemForm.tsx`
- Item API/type files

Required changes:

- Item create starts with Product selected or Product search/create flow.
- Item create/update sends Item fields only.
- Title/brand/model/category display from Product-backed DTO fields.
- Item form sends `retail`, not Item `unit_retail`.
- Item table sort/display uses Product-backed fields.
- Remove `unit_count`, `processing_tier`, and `batch_group`.
- Keep `location` as internal Item field.

## Processing Check-In

Files:

- `ProcessingCheckInDialog.tsx`
- `ProcessingActiveCard.tsx`
- `ProcessingQueueTable.tsx`
- `ProcessingTransformDialogs.tsx`
- `ProcessingScanBar.tsx`
- processing hooks/API/types

Required changes:

- Detailed check-in chooses Product mode first: keep/edit/existing/new.
- Check-in payload includes Product identity only when creating/editing Product, not when creating Item fields.
- Check-in payload sends Item `retail` from row `unit_retail`.
- Check-in payload sends Item `price` / shelf price separately.
- Quick check-in must still create Items with Product.
- Remove UI for multi-unit Item creation.
- Remove `unitsPerItem` / `unit_count` from transform dialogs and row DTOs.
- Keep row collapse/uncollapse if it operates at row level without multi-unit Items.

## Product Search-Or-Create Modal

Target behavior:

1. User searches Products by token search.
2. API searches Product fields, identifiers, and tags.
3. User selects Product, edits Product, or creates new Product.
4. Caller receives selected Product ID and display DTO.

Used by:

- Product page
- Item create
- processing row detail
- processing check-in

Fields:

- Product identity: title, brand, model, category
- identifiers JSON editor or key/value editor
- tags editor
- optional Product description/specifications

No Product price field.

## Print Labels / Local Print Service

Files:

- `frontend/src/pages/inventory/processing/printProcessingLabel.ts`
- `frontend/src/services/localPrintService.ts`

Required changes:

- Label text uses Product-backed item title/brand fields.
- Price uses Item price.
- Retail uses Item retail if printed.
- UPC/identifier prints from Product identifiers if needed.
- Do not rely on Item title/brand or flat Product UPC.

## TypeScript Types

Files:

- `frontend/src/types/inventory.types.ts`
- API client response/request types

Required changes:

- Add `Product.identifiers`.
- Add Product tags.
- Remove Product `default_price` and flat `upc` from write types.
- Add Item `retail`.
- Remove Item `unit_retail`, `unit_count`, `processing_tier`, `batch_group` from final Item types.
- Keep row-level `unit_retail` on ProcessingRow types.
- Represent Product-backed Item display fields explicitly.

## Frontend Tests To Update

- Product catalog table search/display tests.
- Item catalog table display/sort tests.
- Item form create/update payload tests.
- Processing check-in dialog payload tests.
- Processing transform tests for unit removal.
- Print label payload tests.
- Processing workspace filter tests for identifier search.

## Frontend Done Criteria

- No frontend create/update request sends Product `default_price`.
- No frontend create/update request sends Item-owned `title` or `brand`.
- No frontend Item payload sends Item `unit_retail`.
- No frontend code depends on `unit_count` or `unitsPerItem`.
- Product and Item tables still render identity, price, retail, condition, and location correctly.
- TypeScript check passes after backend API/type updates.
