# R-054 · Recon: how a purchase order and its manifest are created today
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 15:48 · **Finished:** 2026-09-24 15:55 · **Status:** done

Code on the working tree plus the dev database, read-only.

## 1. Create a PO

Staff create: `POST /api/inventory/orders/` → `PurchaseOrderViewSet` (`apps/inventory/urls.py:22`, included at `ecothrift/urls.py:26`). Serializer `PurchaseOrderSerializer` (`apps/inventory/serializers.py:449`). `perform_create` (`apps/inventory/views.py:2533`) sets `created_by`, `est_shrink` from `get_default_po_est_shrink()`, generates `order_number` via `PurchaseOrder.generate_order_number()` (`apps/inventory/models.py:344`, shape `PO-00001`) when the client leaves it blank, and sets `ordered_date` to today when omitted.

Required on the model: `vendor` (FK) and `ordered_date` (the serializer makes the date optional and the view fills it). `order_number` is unique (`apps/inventory/models.py:88`).

Defaults: `status='ordered'` (`models.py:89`). Costs `purchase_cost`, `shipping_cost`, `fees`, `retail_value` are all null. `save()` (`models.py:279`) overwrites `total_cost` with purchase + shipping + fees whenever any of those three is set, and copies the vendor name and code into the cache fields.

A second path already exists for a win: `POST /api/buying/auctions/{id}/won/` (`apps/buying/api_views.py:816`) calls `mark_won` (`apps/buying/services/won_to_po.py:158`). That creates the PO with `status='ordered'`, `ordered_date` today, `purchase_cost` = hammer, `fees` from the body or the marketplace fee rate, `shipping_cost` from the body or `estimated_shipping`, `total_cost` = those three, `retail_value` = manifest unit retail × quantity (else the listing total), `order_number` = `BST-{lot_id}` (`won_to_po.py:80`), and `condition` mapped from the listing group (`won_to_po.py:47`).

## 2. PO manifest

Upload does not write `inventory.ManifestRow` rows. `POST /api/inventory/orders/{id}/upload-manifest/` (`apps/inventory/views.py:2616`) stores the CSV/TSV, a  header signature, and a 10-row preview on the PO. `upload_manifest_from_bytes` (`apps/inventory/services/intake_test_reset.py:267`) is the same path; `mark_won` calls it (`won_to_po.py:230`).

Rows are built later. `POST .../process-manifest/` (`apps/inventory/views.py:3382`) standardizes the file. `upsert_manifest_row_from_standardized_data` (`apps/inventory/views.py:1879`) writes title, brand, model, condition, quantity, `unit_retail`, notes, `identifiers` (UPC lives here, not a column), `taxonomy` / `category`, specifications, tracking. The formula mapper that feeds it is `apps/inventory/views.py:1810` (targets `title`, `brand`, `quantity`, `unit_retail`, `identifiers.*`, `taxonomy.*`).

A later processing build can also `bulk_create` rows for bookmarks that have none (`apps/inventory/services/processing_finalize.py:823`).

## 3. Vendors

`Vendor` (`apps/inventory/models.py:16`) has `name`, unique `code`, and `vendor_type`. No `external_id`. `vendor_for` (`won_to_po.py:60`) picks the vendor whose name equals the marketplace name, busiest order count first, and creates one only if none exists. Marketplace names are Amazon, Costco, Home Depot, Target, Walmart, Wayfair, so that picks the existing rows.

POs by vendor:

| Name | Code | POs |
|---|---|---:|
| Target | TGT | 69 |
| Amazon | AMZ | 67 |
| Walmart | WAL | 52 |
| Costco | CST | 46 |
| Generic | GEN | 40 |
| Target | TRGET | 33 |
| Wayfair | WFR | 18 |
| Home Depot | HMD | 15 |

Two Target vendors. The busiest-name rule uses TGT, not TRGET. Order numbers are vendor-style (`TGT105321`, `AMZ17694`, `TRGET-O0V-FC`), not lot ids. `Auction.purchase_order` (`apps/buying/models.py:573`) is the only auction link, and it is unused (below).

## 4. Existing links

| Rule | Matches |
|---|---:|
| `Auction.purchase_order` already set | 0 |
| `order_number = BST-{lot_id or external_id}` | 0 |
| `notes` contains `lot_id` | 0 |

No dev PO can be tied to an auction by those rules.

## 5. Status flow

Choices (`apps/inventory/models.py:68`): ordered → paid → shipped → delivered → processing → complete, plus cancelled.

| Move | Code |
|---|---|
| ordered → paid | `mark_paid` `apps/inventory/views.py:2546` |
| paid → ordered | `revert_paid` `:2555` |
| → shipped | `mark_shipped` `:2564` |
| shipped back | `revert_shipped` `:2575` |
| → delivered | `deliver` → `_finalize_purchase_order_deliver` `:2586` and `:1515` |
| delivered back | `revert_delivered` `:2596` |
| delivered → processing | when processing starts and the PO is still delivered (`:5959`) and when check-in items are created (`:1508`) |

Preprocessing queue (`:2470`) lists any non-cancelled PO that has a manifest file and is not finalized. It does not require `paid`. The receiving picker (`:2831`) starts at `paid`. A win should stay `ordered`, with the manifest file attached, so it shows under Orders and on the preprocessing queue. It should not start at `processing`.

## 6. What would break

- `upload-manifest` returns 409 if `finalized_at` is set (`apps/inventory/views.py:2620`).
- `upload_manifest_from_bytes` deletes `PreprocessingRow`s and clears the template, but it does not delete existing `ManifestRow`s (`intake_test_reset.py:308` and `:341`). A second upload leaves old spine rows in place; `process-manifest` updates the row number it sees and leaves extras.
- There is no unique constraint on `(purchase_order, row_number)` (`apps/inventory/models.py:467`). Two rows can share a number. The upsert keeps the lowest id (`views.py:1913`).
- `PurchaseOrder.save` recomputes `total_cost` from the three cost fields (`models.py:290`). Passing only `total_cost` does not stick once any component is set.
- `generate_order_number` assumes a `PO-` prefix (`models.py:349`). A `BST-` number makes the next auto number fall through to `count + 1`.
- Attaching spine rows without the CSV file does not put the PO on the preprocessing queue (`manifest_id` is required, `views.py:3385` and `:2489`).
- No receiving-row signal runs on create. Deliver only builds the legacy check-in queue.

## Observations

- Use `mark_won`. It already matches `perform_create` (ordered, shrink, dates) and then the same byte upload the Orders page uses.
- Do not insert `inventory.ManifestRow` rows in that step. Let `process-manifest` build them so the vendor CSV template and preprocessing overlays stay in charge.
- `vendor_for` will pick Target/TGT, Amazon/AMZ, and the other busiest name matches. It will not pick Target/TRGET.
- Leave status at `ordered` and require the manifest file. That is what the preprocessing queue lists. Receiving starts at `paid`.
- Nothing in the dev database is already linked. `BST-{lot_id}` plus `Auction.purchase_order` will be the first link, and it does not collide with today's order numbers.
