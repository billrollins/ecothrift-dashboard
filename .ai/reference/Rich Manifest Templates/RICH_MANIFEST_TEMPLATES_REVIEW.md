# Rich manifest templates — reference review

This note ties together B-Stock **raw** liquidation CSV manifests and **standardized** exports derived from preprocessing, alongside sample CSVs in **Raw Manifests/** and **Standardized Manifest/** in this directory. “Ray” manifests in the authoring ask are interpreted as **raw** CSVs.

**Shapes:** `(data_rows × columns)` counts **excluding** the header line; columns = fields per row.

---

## 1. Pairing map (reference files)

Raw files live in `Raw Manifests/`; standardized siblings use the purchase-order style filename prefix in `Standardized Manifest/` (same data row counts as their raw counterpart).

| Raw manifest (basename) | Standardized CSV | Rows × cols (same data rows) |
| --- | --- | --- |
| `BStock_Fast Shipping - 24 Pallets of FBA Home Improvement_Manifest.csv` | `AMZ0N-OQL-CCP4.csv` | 936 × 17 → **936 × 15** |
| `BStock_Truckload (23 Pallets) of Bikes, E-Scooters & More, … Indianapolis, IN_Manifest.csv` | `TRGET-O4U-QP68.csv` | 988 × 20 → **988 × 15** |
| `BStock_1 Pallet of Small Appliances, … Indianapolis, IN_Manifest.csv` | `TRGET-O2R-1K40.csv` | 135 × 20 → **135 × 15** |
| `BStock_2 Pallets of Small Kitchen Appliances … Owat_Manifest.csv` | `C5TC0-OM1-A8R3.csv` | 66 × 16 → **66 × 15** |

The standardized side always has the **same fifteen** canonical columns:

`row_id`, `row_number`, `description`, `title`, `brand`, `model`, `category`, `condition`, `sku`, `upc`, `quantity`, `retail_value`, `notes`, `base_cost`, `ideal_price`.

---

## 2. Detailed tables per pair

Below, **Raw** lists every CSV header (field names). **Standard** lists shape and which raw headers are referenced by the preprocessing formulas that produced that standardized file (derived from inspecting the formulas used for each marketplace workflow; SKU slot comes from vendor item formulas where applicable).

### 2.1 Amazon FBA liquidation — Home Improvement raw → `AMZ0N-OQL-CCP4`

**Raw**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **936 × 17** |
| Fields (header order) | `Category`, `Subcategory`, `ASIN`, `Item Description`, `Qty`, `Unit Retail`, `Ext. Retail`, `Product Class`, `GL Description`, `Seller Category`, `EAN`, `LPN`, `UPC`, `Brand`, `Condition`, `Pallet ID`, `Lot ID` |

**Standard (`AMZ0N-OQL-CCP4.csv`)**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **936 × 15** |
| Raw fields used | `Qty`, `Item Description`, `Brand`, `Category`, `Condition`, `Unit Retail`, `UPC`, `ASIN`, `Lot ID`, `Pallet ID`, `LPN` |
| Unused raw columns | `Subcategory`, `Ext. Retail`, `Product Class`, `GL Description`, `Seller Category`, `EAN` |

`title` / `model` were left blank in preprocessing (no formula); `sku` standard column maps from `ASIN` on Amazon-style manifests.

---

### 2.2 Target — Truckload bikes / scooters raw → `TRGET-O4U-QP68`

**Raw**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **988 × 20** |
| Fields (header order) | `Item #`, `Seller Category`, `Item Description`, `Qty`, `Unit Retail`, `Ext. Retail`, `Brand`, `UPC`, `TCIN`, `Origin`, `Category`, `Condition`, `Product Class`, `Category Code`, `Division`, `Department`, `Optoro Condition`, `Pallet ID`, `Subcategory`, `Lot ID` |

**Standard (`TRGET-O4U-QP68.csv`)**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **988 × 15** |
| Raw fields used | `Qty`, `Item Description`, `Brand`, `Category`, `Condition`, `Unit Retail`, `UPC`, `Item #`, `Seller Category`, `Subcategory`, `Product Class` |
| Unused raw columns | `Ext. Retail`, `TCIN`, `Origin`, `Category Code`, `Division`, `Department`, `Optoro Condition`, `Pallet ID`, `Lot ID` |

**Item #** maps to preprocessing `vendor_item_number` (standard **`sku`** in exports when that formula is chosen).

---

### 2.3 Target — One pallet small appliances raw → `TRGET-O2R-1K40`

Same **20-column Target-style** schema as §2.2 (headers match §2.2).

**Raw**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **135 × 20** |
| Fields | Same twenty headers as §2.2 |

**Standard (`TRGET-O2R-1K40.csv`)**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **135 × 15** |
| Raw fields used | Same subset as §2.2 (`Qty`, `Item Description`, `Brand`, `Category`, `Condition`, `Unit Retail`, `UPC`, `Item #`, `Seller Category`, `Subcategory`, `Product Class`) |

---

### 2.4 Costco-format raw → `C5TC0-OM1-A8R3`

**Raw**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **66 × 16** |
| Fields (header order) | `Lot ID`, `Location`, `Item #`, `Dept. Code`, `Department`, `Item Description`, `Qty`, `Unit Retail`, `Ext. Retail`, `Model`, `Serial #`, `Vendor`, `Category Code`, `Seller Category`, `Category`, `Condition` |

**Standard (`C5TC0-OM1-A8R3.csv`)**

| Aspect | Value |
| --- | --- |
| Shape (data_rows × cols) | **66 × 15** |
| Raw fields used | `Qty`, `Item Description`, `Vendor`, `Model`, `Category`, `Condition`, `Unit Retail`, `Item #`, `Lot ID`, `Location`, `Seller Category` |
| Unused raw columns | `Dept. Code`, `Department`, `Ext. Retail`, `Serial #`, `Category Code` |

`title` unused; `sku` ← `Item #`; `notes` aggregates lot / location / seller category per Costco basic mapping.

---

## 3. `inventory_csvtemplate` rows created from **Use AI** suggestions

Production templates below were captured from Postgres (`SELECT * FROM ecothrift.inventory_csvtemplate`). They illustrate what the preprocessing **Suggest formulas / Use AI** path produced without hand-editing richer composition. **`column_mappings`** mixes **formula-style** `{ target, formula }` rows with legacy **empty `{ source, transforms }`** stubs where the model left `title`, `model`, or (Costco) `upc` unmapped — those standardized fields stay empty unless you add formulas manually.

IDs and timestamps are snapshot values from 2026-04-30; vendor IDs are FKs (`9` Amazon, `2` Target, `3` Costco-style vendor in DB).

---

### Template 1 — `Basic Amazon` (id **1**, vendor_id **9**)

| Field | Details |
| --- | --- |
| `header_signature` | `57f77563eb078df9cb0ee9f76ef4170b` |
| Naming | Mirrors Amazon raw headers (ASIN / Lot / LPN / Pallet semantics). |

**Mappings**

| Target | Formula / legacy row | Behavior |
| --- | --- | --- |
| `quantity` | `[Qty]` | Direct numeric-ish qty column. |
| `description` | `TRIM([Item Description])` | Primary prose line. |
| `title` | legacy `source`: `""`, `transforms`: `[]` | **Unmapped** by AI suggestion. |
| `brand` | `TRIM([Brand])` | |
| `model` | legacy empty | **Unmapped.** |
| `category` | `[Category]` | B-Stock category slug/column string. |
| `condition` | `[Condition]` | |
| `retail_value` | `[Unit Retail]` | Unit MSRP emphasis (not Ext. Retail). |
| `upc` | `[UPC]` | |
| `vendor_item_number` | `[ASIN]` | Amazon SKU equivalent in preprocessing. |
| `notes` | `CONCAT("Lot: ", [Lot ID], " \| Pallet: ", [Pallet ID], " \| LPN: ", [LPN])` | Fulfillment lineage for receiving and disputes. |

**Raw columns implied:** `Qty`, `Item Description`, `Brand`, `Category`, `Condition`, `Unit Retail`, `UPC`, `ASIN`, `Lot ID`, `Pallet ID`, `LPN`.

---

### Template 2 — `Target Basic` (id **2**, vendor_id **2**)

| Field | Details |
| --- | --- |
| `header_signature` | `8a3a1ebe47b314b269941bed35cbe35b` |
| Naming | Fits Target’s `Item #` + merchandising rollup columns. |

**Mappings**

| Target | Formula / legacy row |
| --- | --- |
| `quantity` | `TRIM([Qty])` |
| `description` | `TRIM([Item Description])` |
| `title` | legacy empty — **Unmapped.** |
| `brand` | `TRIM([Brand])` |
| `model` | legacy empty — **Unmapped.** |
| `category` | `TRIM([Category])` |
| `condition` | `TRIM([Condition])` |
| `retail_value` | `TRIM([Unit Retail])` |
| `upc` | `TRIM([UPC])` |
| `vendor_item_number` | `TRIM([Item #])` |
| `notes` | `CONCAT(TRIM([Seller Category]), " \| ", TRIM([Subcategory]), " \| ", TRIM([Product Class]))` |

**Raw columns implied:** `Qty`, `Item Description`, `Brand`, `Category`, `Condition`, `Unit Retail`, `UPC`, `Item #`, `Seller Category`, `Subcategory`, `Product Class`.

---

### Template 3 — `Costco Basic` (id **3**, vendor_id **3**)

| Field | Details |
| --- | --- |
| `header_signature` | `734f4c7a4fec30554575fddf48ac94ab` |
| Naming | Costco liquidation sample: emphasizes `Vendor`, `Model`, pallet `Location`, `Lot ID`. |

**Mappings**

| Target | Formula / legacy row |
| --- | --- |
| `quantity` | `[Qty]` |
| `description` | `TRIM([Item Description])` |
| `title` | legacy empty — **Unmapped.** |
| `brand` | `TRIM([Vendor])` (! not `Brand` column — Costco feeds vendor as supplier name) |
| `model` | `TRIM([Model])` |
| `category` | `TRIM([Category])` |
| `condition` | `TRIM([Condition])` |
| `retail_value` | `[Unit Retail]` |
| `upc` | legacy empty — **Unmapped** (often missing on Costco-style loads). |
| `vendor_item_number` | `TRIM([Item #])` |
| `notes` | `CONCAT("Lot: ", [Lot ID], " \| Location: ", [Location], " \| Seller Category: ", [Seller Category])` |

**Raw columns implied:** `Qty`, `Item Description`, `Vendor`, `Model`, `Category`, `Condition`, `Unit Retail`, `Item #`, `Lot ID`, `Location`, `Seller Category`.

---

### Cross-template gaps (follow-up for “richer” formulas)

- **`title`** is never suggested; titles today fall back blank or downstream cleanup.
- **`model`** is empty on Amazon and Target AI runs; Costco alone gets `Model`.
- **`UPC`** is empty only on Costco in this trio (Costco extracts often omit UPC in the sampled headers).
- **Notes** concatenate different facets by marketplace — good for lineage but not interchangeable across vendors without header alignment.
