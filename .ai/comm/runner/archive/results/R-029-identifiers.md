# R-029 result · Which product identifiers do we have?

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:40 · **Finished:** 2026-09-23 17:46

Era is the R-021 tag. A UPC counts as valid when it is 12 digits. An ASIN is valid when it matches `B0` plus 8 letters or digits. A TCIN is valid when it is 8 digits.

## Fields

| Field | Path | Fill | Valid |
|---|---|---|---|
| Product `identifiers.upc` | `apps/inventory/models.py:1560` (`primary_upc` at `:1594`) | V1/V2 41,452 / 73,699 (56%). V3 50,468 / 126,643 (40%). | 12 digits: V1/V2 5,329 (7% of products, 13% of the filled values). V3 8,529 (7% of products, 17% of filled). |
| Product `identifiers.asin` | same JSON | 2,211 / 200,342 (1.1%), not split by era | 2,210 match `B0` + 8 |
| Product `identifiers.tcin` | same JSON | 72 / 200,342 | all 72 are 8 digits |
| Product `identifiers` also | same JSON | item_number 3,004, ean 1,108, sku 810, model_number 52, mpn 36 | not checked against a format |
| `product_number` | `apps/inventory/models.py:1545` | 200,342 / 200,342 | our own `PRD-` id, not a manufacturer id |
| Item `sku` | `apps/inventory/models.py:1806` | 238,191 / 238,191 | our own `ITM` id |
| Inventory manifest `identifiers` | `apps/inventory/models.py:426` | upc key on 137,014 rows; also item_number 10,431, sku 5,165, asin 4,773, ean 2,123, tcin 172 | V1/V2 items have no manifest row (R-027), so this table is the native lines |
| Preprocessing `standard_identifiers` | `apps/inventory/models.py:538` | same key counts as the manifest (upc 12,379 on staging rows) | copied forward, not a second source |
| Processing `identifiers` | `apps/inventory/models.py:757` | JSON bag on the processing row | |
| Processing `list_sku` | `apps/inventory/models.py:722` | shelf label text, not a UPC | |
| `VendorProductRef.vendor_item_number` | `apps/inventory/models.py:1662` | 174 rows, every one filled | vendor's number, unique per vendor |
| Buying line `upc`, `sku` | `apps/buying/models.py:641` and `:642` | see below | |
| Buying line `raw_data` | `apps/buying/models.py:619` | CSV/API columns `UPC`, `ASIN`, `TCIN` | |

## Buying lines, by marketplace

16,725 rows.

| Marketplace | Rows | `upc` column filled | 12-digit UPC | ASIN in raw JSON | TCIN in raw JSON |
|---|---:|---:|---:|---:|---:|
| Target | 9,897 | 9,897 | 9,655 | 0 | 7,687 |
| Walmart | 3,199 | 3,199 | 568 | 0 | 0 |
| Home Depot | 2,464 | 264 | 0 | 0 | 0 |
| Amazon | 1,165 | 245 | 245 | 1,165 | 0 |

## Same valid UPC on more than one product

2,606 UPCs are shared by 7,200 products. The groups look like one product typed twice, except the Fiskars pair, which may be two products on one code.

| UPC | Titles |
|---|---|
| 002033507993 | Fiskars Paper Edgers Decorative Scissors; Fiskars Craft Set |
| 010279724736 | OUT! Petcare XXL Puppy Pads 30-Count; OUT! Petcare Puppy Pads XXL 30ct |
| 023883200022 | CHAPIN 2-Gallon Pump Sprayer; Chapin 2-Gallon SureSpray Pump Sprayer |
| 031374581093 | Casaluna Queen 4-inch Memory Foam Mattress Topper (twice); Casaluna Queen 4" Dual Layer Mattress Topper |
| 032700131326 | Hartz Comfitables Disposable Dog Diapers; Hartz Comfitables Disposable Dog Diapers Large 12-Count |

## Do we drop UPC at check-in?

No. Check-in merges a UPC onto the product (`apps/inventory/processing_ops.py:359`, `apps/inventory/views.py:1125`). The buying line keeps `upc` and the raw `UPC` / `ASIN` / `TCIN` columns. What never arrives is the old era: V1/V2 items have no manifest row, so those sales have only whatever was stored in `Product.identifiers`, and most of those UPC strings are not 12 digits.
