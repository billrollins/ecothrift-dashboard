<!-- Last updated: 2026-02-13T21:00:00-06:00 -->

# Inventory Pipeline — Extended Context

This document describes the full inventory pipeline, models, and flows for the Eco-Thrift Dashboard.

---

## Pipeline Overview

```
Vendor → PurchaseOrder → CSV manifest upload (S3) → ManifestRow parsing → Item creation
```

1. **Vendor** — Source of purchased inventory (liquidation, retail, direct, other).
2. **PurchaseOrder** — Order placed with a vendor; tracks status from ordered through completion.
3. **CSV manifest upload** — Staff uploads a vendor CSV via `POST /inventory/orders/{id}/upload-manifest/`. File is saved to S3, preview persisted in `manifest_preview` JSON field.
4. **ManifestRow parsing** — CSV is parsed using a vendor-specific `CSVTemplate`; rows become `ManifestRow` records via `POST /inventory/orders/{id}/process-manifest/`.
5. **Item creation** — Items are created from manifest rows via `POST /inventory/orders/{id}/create-items/`.

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
| Revert Delivered | `POST .../revert-delivered/` | status=shipped | delivered_date |

### Cost Breakdown

`total_cost` is auto-computed in `save()` from: `purchase_cost + shipping_cost + fees`.

### Additional Fields (v1.2.0)

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

---

## ManifestRow

Standardized row data extracted from vendor CSVs.

- **`purchase_order`** — FK
- **`row_number`** — 1-based row index
- **`quantity`** — Number of items (default 1)
- **`description`**, **`brand`**, **`model`**, **`category`**
- **`retail_value`** — Used as item cost
- **`upc`**, **`notes`**

**Process-manifest** expects `rows` with `row_number`, `quantity`, `description`, `brand`, `model`, `category`, `retail_value`, `upc`, `notes`. Existing manifest rows for the PO are deleted before creating new ones.

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

### Item Sources

| Source       | Description                    |
|-------------|--------------------------------|
| `purchased` | From vendor PO (default)       |
| `consignment` | Consignee item               |
| `house`     | Store-owned / house inventory  |

### Fields

- **`product`** — Optional FK to Product (catalog)
- **`purchase_order`** — Optional FK (for purchased items)
- **`title`**, **`brand`**, **`category`**, **`price`**, **`cost`**
- **`location`**, **`listed_at`**, **`sold_at`**, **`sold_for`**, **`notes`**

**Mark ready**: `POST /inventory/items/{id}/ready/` sets `status='on_shelf'`, `listed_at=now`.

---

## ProcessingBatch

Tracks bulk item creation from manifest rows.

- **`purchase_order`** — FK
- **`status`**: `pending`, `in_progress`, `complete`
- **`total_rows`**, **`processed_count`**, **`items_created`**
- **`started_at`**, **`completed_at`**, **`created_by`**

Created when `create-items` runs; one batch per run. Items are created by iterating manifest rows and creating `quantity` items per row (title from `description`, cost from `retail_value`, `source='purchased'`, `status='intake'`).

---

## Public Item Lookup

- **Endpoint**: `GET /api/inventory/items/lookup/<sku>/`
- **Auth**: None (`AllowAny`)
- **Behavior**: Returns item via `ItemPublicSerializer`; creates `ItemScanHistory` with `source='public_lookup'` and `ip_address`
- **Frontend**: `itemLookup(sku)` in `inventory.api.ts` uses `apiPublic` (no auth)

---

## Product Catalog

**Model**: `Product` — Reusable product definitions.

- **Fields**: `title`, `brand`, `model`, `category`, `description`, `default_price`
- **Relation**: Items can optionally link to a Product via `product` FK
- **API**: `/inventory/products/` — CRUD, staff-only; search by `title`, `brand`, `model`, `category`

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
- Manifest rows table (from processed data)
- Edit dialog: Order # + Date → Details → Costs → Notes (consistent with create)
- Delete guard: only shows when item_count === 0

### Hooks (`useInventory.ts`)

- `usePurchaseOrder`, `useDeliverOrder`, `useUploadManifest`, `useProcessManifest`, `useCreateItems`
- `useMarkOrderPaid`, `useRevertOrderPaid`, `useMarkOrderShipped`, `useRevertOrderShipped`, `useRevertOrderDelivered`
- `useItems`, `useUpdateItem`, `useMarkItemReady`
- `useProducts`, `useVendors`, etc.

### API (`inventory.api.ts`)

- Orders: `getOrders`, `getOrder`, `createOrder`, `updateOrder`, `deleteOrder`
- Status: `markOrderPaid`, `revertOrderPaid`, `markOrderShipped`, `revertOrderShipped`, `deliverOrder`, `revertOrderDelivered`
- Manifest: `uploadManifest`, `processManifest`, `createItems`
- Items: `getItems`, `updateItem`, `markItemReady`
- Public: `itemLookup(sku)` — no auth

---

## ItemScanHistory

Tracks public lookups and POS scans.

- **`item`** — FK
- **`scanned_at`** — auto
- **`ip_address`** — from request
- **`source`**: `public_lookup` or `pos_terminal`
