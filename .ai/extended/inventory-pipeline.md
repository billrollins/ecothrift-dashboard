<!-- Last updated: 2026-02-13T10:53:00-06:00 -->

# Inventory Pipeline — Extended Context

This document describes the full inventory pipeline, models, and flows for the Eco-Thrift Dashboard.

---

## Pipeline Overview

```
Vendor → PurchaseOrder → CSV manifest upload → ManifestRow parsing → Item creation
```

1. **Vendor** — Source of purchased inventory (liquidation, retail, direct, other).
2. **PurchaseOrder** — Order placed with a vendor; tracks status from ordered through completion.
3. **CSV manifest upload** — Staff uploads a vendor CSV via `POST /inventory/orders/{id}/upload-manifest/`.
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
| `in_transit`| Shipment in transit                  |
| `delivered` | Received (via `POST .../deliver/`)   |
| `processing`| Manifest processed, items being prepped |
| `complete`  | All items processed                  |
| `cancelled` | Order cancelled                      |

**Flow**: ordered → in_transit → delivered → processing → complete

- `deliver` action: sets `status='delivered'`, `delivered_date` (from request or today).
- `upload-manifest` and `process-manifest` move the order into `processing` when manifest rows exist.

---

## CSV Template System

**Model**: `CSVTemplate` — vendor-specific column mappings for manifests.

- **`vendor`** — FK to Vendor
- **`header_signature`** — MD5 hash of normalized header row (comma-joined, lowercased) for auto-matching
- **`column_mappings`** — JSON mapping vendor columns to standard fields
- **`is_default`** — Whether this is the default template for the vendor

**Auto-matching**: On manifest upload, headers are hashed and matched against `CSVTemplate` where `vendor=order.vendor` and `header_signature=sig`. If found, the template is suggested.

**Upload response** includes: `headers`, `signature`, `template_id`, `template_name`, `row_count`, `rows` (preview of first 20).

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

### Order Detail Page (`OrderDetailPage.tsx`)

- Status stepper: ordered → in_transit → delivered → processing → complete
- "Mark Delivered" with date picker
- CSV manifest upload (Select CSV → Upload)
- Manifest rows table; "Go to Processing" when status is delivered/processing/complete

### Processing Page (`ProcessingPage.tsx`)

- **Tab 1 — Manifest Processing**: Select PO, upload CSV, "Upload & Process" (calls `uploadManifest` then `processManifest`)
- **Tab 2 — Item Queue**: DataGrid of items with `status__in=['intake','processing']`; editable title, brand, category, price; "Mark Ready" per item

### Hooks (`useInventory.ts`)

- `usePurchaseOrder`, `useDeliverOrder`, `useUploadManifest`, `useProcessManifest`, `useCreateItems`
- `useItems`, `useUpdateItem`, `useMarkItemReady`
- `useProducts`, `useVendors`, etc.

### API (`inventory.api.ts`)

- Orders: `getOrders`, `getOrder`, `deliverOrder`, `uploadManifest`, `processManifest`, `createItems`
- Items: `getItems`, `updateItem`, `markItemReady`
- Public: `itemLookup(sku)` — no auth

---

## ItemScanHistory

Tracks public lookups and POS scans.

- **`item`** — FK
- **`scanned_at`** — auto
- **`ip_address`** — from request
- **`source`**: `public_lookup` or `pos_terminal`
