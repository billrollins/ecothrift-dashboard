# M4 Deep Dive: B-Stock Auction -> In-Store POS Sale

## Scope

This document explains **M4 (Pure Deferred Unitization)** in plain operational terms:

- You win a B-Stock auction.
- A manifested truckload arrives.
- Team processes inventory.
- Cashier scans item at POS and completes payment.

Focus is on:

1. **What humans do/see on screens**
2. **What tables are created/updated at each step**

---

## M4 in One Sentence

In M4, intake creates **quantity-based `StockLot` records first**, and creates individual `Item` rows **later** only when units are actually prepared for shelf/tag/POS.

---

## Quick Count Legend (per order)

Use these symbols to reason about row counts:

- `N` = number of normalized manifest lines (`ManifestRow` count)
- `Q` = total units in truckload (sum of all manifest quantities)
- `U` = number of truly new products discovered
- `L` = stock lots created (typically close to `N`, may vary if rows are split/merged)
- `I` = units actually unitized into `Item` rows
- `S` = units sold through POS

---

## Table Cheat Sheet (What Each Table Means)

| Table | Role in lifecycle | Typical rows per order | Created/updated by |
|---|---|---:|---|
| `Vendor` | Source company (B-Stock seller/vendor identity) | `+0` or `+1` | Buyer / back office |
| `PurchaseOrder` | One truckload/auction order header | `+1` | Buyer / inventory lead |
| `S3File` | Uploaded manifest file metadata | `+1` per manifest upload | Inventory lead |
| `ManifestRow` | Standardized line items from manifest | `+N` | Intake processor |
| `Product` | Reusable catalog identity | `+U` | Match engine + processor review |
| `VendorProductRef` *(M4 extension)* | Vendor identifier -> Product mapping | `+U` (or upserts) | Match engine |
| `StockLot` *(M4 extension)* | Quantity-first inventory lot | `+L` | Lot creation step |
| `LotLedgerEvent` *(M4 extension)* | Immutable lot movement/audit event log | `+L` minimum, then more | System on each movement |
| `Item` | POS-sellable unit with ITM barcode | `+I` (not `+Q`) | Unitization step |
| `ItemScanHistory` | Scan/audit trail for item lookups/scans | varies | POS/public lookup |
| `Drawer` | Cash drawer session | `+0` or `+1` for day/session | Cashier/manager |
| `Cart` | One in-progress checkout transaction | `+1` per customer sale | Cashier |
| `CartLine` | One scanned line in cart | `+S` (for sold units in cart) | Cashier scanner flow |
| `Receipt` | Finalized sale receipt record | `+1` per completed cart | POS completion |

---

## End-to-End Lifecycle (Human + Table Mutations)

| Step | Human role + what they see | Reads from | Writes to (rows) | Result |
|---|---|---|---|---|
| 1. Auction won | Buyer opens `OrderListPage`, clicks New Order | `Vendor` | `Vendor +0/+1`, `PurchaseOrder +1` | Order exists with status `ordered` |
| 2. Payment + shipment tracking | Buyer/manager updates order status in `OrderDetailPage` | `PurchaseOrder` | `PurchaseOrder` status/date updates | `ordered -> paid -> shipped` |
| 3. Truck delivered | Receiver confirms delivery in `OrderDetailPage` | `PurchaseOrder` | `PurchaseOrder` status/date update | `status='delivered'` |
| 4. Manifest upload | Intake user uploads CSV in `OrderDetailPage` | `PurchaseOrder` | `S3File +1`, `PurchaseOrder.manifest` update, `manifest_preview` update | File attached and preview visible |
| 5. Manifest normalization | Intake user maps columns and runs process action | `CSVTemplate`, `PurchaseOrder`, `S3File` | `ManifestRow +N`, `PurchaseOrder.status='processing'` | Normalized rows exist for processing |
| 6. Product matching | User clicks Match Products (auto + review) | `ManifestRow`, `Product`, `VendorProductRef` | `Product +U`, `VendorProductRef` upserts, row match fields updated | Rows are linked to known/new products |
| 7. Create lots (M4 core) | Processor runs Create Lots from order workflow | `ManifestRow`, `PurchaseOrder` | `StockLot +L`, `LotLedgerEvent +L` (`event='received'`) | Quantity enters lot-ledger inventory |
| 8. Lot QC/pricing | Processor opens `ProcessingPage` lot queue, sets condition/price/location | `StockLot`, `ManifestRow`, `Product` | `StockLot` updates, optional `LotLedgerEvent` adjustments | Lots become `ready_to_tag` / `active` |
| 9. Unitize for shelf | Processor chooses lot and quantity to unitize (e.g., 24 of 61) | `StockLot` | `Item +k`, `StockLot` qty updates, `LotLedgerEvent +1` (`event='unitized', delta=-k`) | Sellable ITM items created + tags printed |
| 10. Shelf placement | Processor marks unitized items ready/on shelf | `Item` | `Item.status='on_shelf'`, `listed_at` updates | Items now sellable in POS |
| 11. Checkout scan | Cashier in `TerminalPage` scans ITM barcode(s) | `Item`, `Drawer`, `Cart` | `Cart +1` (if new), `CartLine +S` | Cart populated with scanned items |
| 12. Payment complete | Cashier chooses cash/card/split and completes sale | `Cart`, `CartLine`, `Drawer` | `Cart.status='completed'`, `Receipt +1`, `Item.status='sold'`, `Item.sold_at/sold_for`, `StockLot` sold counters + ledger sold event(s), drawer totals update | Sale is final, inventory decremented |

---

## Human Walkthrough: Processor 1 (Detailed)

## Scenario

Processor 1 is assigned PO `PO-00987` from B-Stock truckload.

## A) Open processing work

- Screen: `ProcessingPage` (M4 lot-focused variant)
- They see:
  - Order header (from `PurchaseOrder`)
  - Lot queue (from `StockLot`)
  - Lot metadata summary (joined from `ManifestRow` + `Product`)

## B) Select lot and perform QC

- Processor clicks a lot row (example: 61 heated vests).
- Edits:
  - condition
  - suggested price
  - location
- Save action updates:
  - `StockLot.status`, `StockLot.condition`, `StockLot.suggested_price`, `StockLot.location`
  - optional `LotLedgerEvent` if adjustment is logged

## C) Unitize only what should hit the floor

- Processor enters `unitize quantity = 24`.
- System writes:
  - `Item +24` rows (each with new `ITM` SKU and `stock_lot_id`)
  - `StockLot.qty_unitized += 24`
  - `StockLot.qty_available -= 24`
  - `LotLedgerEvent +1` (`event_type='unitized', delta_qty=-24`)

## D) Print tags and shelf

- Processor prints 24 tags and sends items to shelf.
- Marks unitized items as shelf-ready:
  - `Item.status -> on_shelf`
  - `Item.listed_at` timestamp

What they see next:

- Lot still has reserve units for future replenishment.
- Item queue now includes 24 sellable units.

---

## Human Walkthrough: Cashier (Detailed)

## Scenario

Cashier handles one customer buying 3 unitized items.

## A) Open terminal + cart

- Screen: `TerminalPage`
- Reads:
  - active `Drawer` session
  - open/current `Cart` (or creates one)

## B) Scan each tag

- Cashier scans 3 `ITM` barcodes.
- For each scan:
  - POS finds `Item` by SKU
  - Adds one `CartLine`
  - Recalculates `Cart.subtotal/tax/total`
  - Optionally logs `ItemScanHistory` with source `pos_terminal`

## C) Take payment and complete

- Cashier selects payment method (cash/card/split) and confirms payment.
- System writes:
  - `Cart.status='completed'`, `completed_at`
  - `Receipt +1`
  - For each sold line item:
    - `Item.status='sold'`
    - `Item.sold_at`, `Item.sold_for`
    - parent lot bookkeeping (`StockLot.qty_sold += 1`) + `LotLedgerEvent` sold entries
  - `Drawer.cash_sales_total` and related totals update (if cash involved)

What cashier sees:

- Sale confirmation + receipt number.
- Cart clears for next customer.

---

## Table-by-Table Lifecycle Summary

| Table | Lifecycle start | Mid lifecycle | End lifecycle |
|---|---|---|---|
| `Vendor` | Created if missing | Usually unchanged | unchanged |
| `PurchaseOrder` | Created once per auction/truckload | status/date/meta updated during shipping/delivery/processing | eventually marked `complete` |
| `S3File` | Created when manifest uploaded | unchanged | unchanged |
| `ManifestRow` | Created in batch after normalization | may receive match metadata | unchanged |
| `Product` | Existing or created during matching | enriched over time | reused on future orders |
| `VendorProductRef` | Upserted during matching | strengthens future auto-match | reused on future orders |
| `StockLot` | Created from manifest rows | QC/pricing/unitization updates | becomes `depleted/closed` as sold out |
| `LotLedgerEvent` | starts with `received` | grows with `unitized/adjusted` | ends with `sold/depleted/closed` audit trail |
| `Item` | created only when unitized | moved to `on_shelf` | moved to `sold` at checkout |
| `Cart` | created at POS session | receives lines + totals | completed/voided |
| `CartLine` | created on each scan | line edits possible | fixed at completion |
| `Receipt` | none until checkout | created at completion | historical record |

---

## Practical "Basic Understanding" Using Your Example Pattern

- **Vendor table**: Vendor exists or is added for the B-Stock source.
- **Order table (`PurchaseOrder`)**: exactly one row for this auction/truckload, linked to the vendor.
- **Manifest rows**: one row per normalized line from the uploaded file.
- **Stock lots (M4)**: one row per lot grouping; this is where quantity exists first.
- **Item rows**: created later, only for units you actually prepare for shelf/POS.
- **Checkout rows**:
  - one `Cart` per transaction
  - one `CartLine` per scanned item
  - one `Receipt` when payment completes
  - sold items updated in `Item`; corresponding lot movement logged in `LotLedgerEvent`

---

## Why This Matters for B-Stock Truckloads

B-Stock manifests often contain large quantities of repeated/near-identical units. M4 avoids creating every unit row at intake, so your team can:

- move truckloads into accountable inventory quickly,
- process only what is needed for immediate shelf replenishment,
- keep POS simple (still scan `ITM`),
- and maintain a full movement audit via lot ledger events.

That is the core M4 value: **fast intake + controlled unit creation + clean checkout path**.
