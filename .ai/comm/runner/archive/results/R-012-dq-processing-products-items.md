# R-012 · Data quality: preprocessing, processing, products, items
- **Runner:** Grok 4.7 · **Started:** 2026-09-23 13:18 CT · **Finished:** 2026-09-23 13:45 CT · **Status:** done

Dev database, read 2026-09-23. Timestamps below are UTC. "Last 120 days" is on or after **2026-05-26** (same window as R-003). For `ManifestRow` and `PreprocessingRow`, which have no `created_at`, that window is `PurchaseOrder.ordered_date`. For every other model it is the row's `created_at`.

**Filled** means non-null, and for text not blank, and for JSON not `{}` or `null`. A stored `0` counts as filled. Where `0` matters, the table says so. `ManifestRow` has no `created_at`. "First filled" for it is the earliest `PurchaseOrder.created_at` on a row where the field is filled (when the order row landed in this database). Title and `unit_retail` are on orders whose `ordered_date` goes back to **2024-03-14**; those order rows were inserted **2026-04-11**.

`buying.ManifestRow` is a different table and is not in these counts. Queries: `workspace/runner/R-012/query.py`, `query2.py`, `query3.py`.

Populations: `ManifestRow` 159,561 · `PreprocessingRow` 15,593 · `ProcessingRow` 16,994 (15,593 manifest + 1,401 added) · `ItemCheckIn` 9,090 · `ItemHistory` 65,354 · `Product` 200,079 · `Category` 19 · `VendorProductRef` 174 · `Item` 237,689.

---

## 1. Rails today

### `inventory.ManifestRow` (`apps/inventory/models.py:372`)

What writes a row:

- Standardize creates or overwrites the spine from the CSV mapping, including `category` from the vendor column. `apps/inventory/views.py:1879-1924`, called at `views.py:3519`.
- Build creates a row only for a bookmark that does not already have one, and copies `ProcessingRow.category` onto it. `apps/inventory/services/processing_finalize.py:438-462` and `:824`, chunk filter `:474-476`.
- Older rows also came from `apps/inventory/management/commands/backfill_phase2_products_manifests.py:382` and `:460`.

Recent lines already have a manifest row from standardize, so build does not replace `category`. That is why recent `ManifestRow.category` is a vendor code while `PreprocessingRow.final_category` is a taxonomy name (section 2).

| Field | All-time filled | First filled (PO `created_at`) | Last 120 days |
|---|---:|---|---:|
| title | 159,561 / 159,561 (100%) | 2026-04-11 | 12,191 / 12,191 (100%) |
| brand | 131,935 (82.7%) | 2026-04-11 | 7,006 (57.5%) |
| model | 37,404 (23.4%) | 2026-04-11 | 1,235 (10.1%) |
| condition | 13,215 (8.3%) | 2026-04-28 | 9,813 (80.5%) |
| unit_retail not null | 159,324 (99.9%) | 2026-04-11 | 11,954 (98.1%) |
| unit_retail > 0 | 159,199 (99.8%) | 2026-04-11 | 11,954 (98.1%) |
| proposed_price | 15,356 (9.6%) | 2026-04-28 | 11,954 (98.1%) |
| final_price | 3,402 (2.1%) | 2026-04-28 | 0 |
| category non-blank | 15,592 (9.8%) | 2026-04-28 | 12,190 (100.0%, 1 blank) |
| category is taxonomy v1 | 3,402 (2.1%) | 2026-04-28 | 0 |
| identifiers non-empty | 140,226 (87.9%) | 2026-04-11 | 12,189 (100.0%) |
| taxonomy JSON non-empty | 159,548 (100.0%) | 2026-04-11 | 12,190 |
| matched_product | 66 (0.04%) | 2026-05-01 | 0 |

`pricing_stage`: unpriced 144,205 · draft 11,954 · final 3,402. `quantity` is always set (default 1). Earliest `ordered_date` on a row with a category is **2026-04-21**.

### `PreprocessingRow` (`models.py:478`)

- Raw rows from the manifest file: `views.py:317-326` (`purchase_order`, `row_number`, `raw_row` only).
- Standard layer, plus the manifest link: `views.py:3532-3580`.
- AI layer: `apps/inventory/services/ai_cleanup.py:143-156`.
- Staff `final_*`: `views.py:741-769`. `layer_helpers.py:285` sets `final_category`.

No `created_at`. `updated_at` is `auto_now` (earliest 2026-05-01, latest 2026-09-15), so it is the last save, not the birth. First filled below uses `PurchaseOrder.created_at`.

| Field | All-time filled | First filled | Last 120 days (n=12,191) |
|---|---:|---|---:|
| manifest_row | 12,191 / 15,593 (78.2%) | 2026-06-06 | 12,191 (100%) |
| raw_row | 15,593 (100%) | 2026-04-28 | 100% |
| unit_retail | 15,358 (98.5%) | 2026-04-28 | 11,956 (98.1%) |
| proposed_price | 15,144 (97.1%) | 2026-04-28 | 11,742 (96.3%) |
| final_price | 15,593 (100%) | 2026-04-28 | 100% |
| final_title | 15,593 (100%) | 2026-04-28 | 100% |
| final_category | 15,593 (100%) | 2026-04-28 | 100% |
| final_category is taxonomy v1 | 15,587 (100.0%) | 2026-04-28 | 12,185 (99.95%) |
| ai_category is taxonomy v1 | 15,587 (100.0%) | 2026-04-28 | 12,185 |
| standard_brand | 10,406 (66.7%) | 2026-04-28 | 7,006 (57.5%) |
| final_brand | 13,680 (87.7%) | 2026-04-28 | 10,278 (84.3%) |
| standard_condition | 13,215 (84.7%) | 2026-04-28 | 9,813 (80.5%) |
| final_condition | 15,593 (100%) | 2026-04-28 | 100% |
| final_matched_product | 112 (0.7%) | 2026-06-18 | 112 (0.9%) |

The 15,593 preprocessing rows are the lines that went through this pipeline. The other ~144k manifest rows have no preprocessing row.

### `ProcessingRow` (`models.py:614`)

- Finalize copies the preprocessing finals into a bookmark, including `category` from `final_category` and `shelf_price`. `processing_finalize.py:230-275`.
- Added lines (no manifest): `processing_ops.py:2197` (`processing_add_item`) and the create at `processing_ops.py:2248`.
- Break-apart / make-set children: `processing_transforms.py:206`.
- `queue_status`, `qty_dispositioned`, `matched_product` denorm: `processing_workspace.py:1173` (`refresh_processing_rows_denorm`), assignments at `:1218` and `:1269`.

| Field | All-time (n=16,994) | First `created_at` | Last 120 days (n=13,592) |
|---|---:|---|---:|
| preprocessing_row | 15,593 (91.8%) | 2026-05-01 | 12,191 (89.7%) |
| manifest_row | 15,593 (91.8%) | 2026-05-01 | 12,191 (89.7%) |
| matched_product | 8,888 (52.3%) | 2026-05-01 | 8,808 (64.8%) |
| title | 16,994 (100%) | 2026-05-01 | 100% |
| category non-blank | 15,919 (93.7%) | 2026-05-01 | 12,517 (92.1%) |
| category is taxonomy v1 | 15,913 (93.6%) | 2026-05-01 | 12,511 (92.0%) |
| condition non-blank | 16,994 (100%) | 2026-05-01 | 100% |
| unit_retail | 15,702 (92.4%) | 2026-05-01 | 12,300 (90.5%) |
| final_price | 16,994 (100%) | 2026-05-01 | 100% |
| shelf_price | 16,994 (100%) | 2026-05-01 | 100% |
| qty_dispositioned > 0 | 12,059 (71.0%) | 2026-05-01 | 8,741 (64.3%) |

`row_kind` / `queue_status`: manifest checked_in 9,426 · manifest pending 5,513 · added checked_in 1,269 · manifest partial 508 · manifest disputed 146 · added pending 86 · added partial 46. Condition values (all rows): good 5,791 · new 3,901 · fair 3,484 · like_new 1,962 · very_good 1,141 · unknown 694 · salvage 21. Blank category is 1,075 added rows and 0 manifest rows (PRE-04). `split_parent` is 0. Rows exist from 2026-05-01 through 2026-09-22.

### `ItemCheckIn` (`models.py:811`)

- Row check-in: `processing_ops.py:547-556`. `origin` is `product_ad_hoc` for an added row, else `processing` (`:527`).
- Restoration can create one with `origin` `manual` when the item has no processing row: `apps/inventory/services/restoration.py:763-778`. No `manual` row exists.

Every check-in is inside the 120-day window. The table starts **2026-06-16**.

| Field | Filled |
|---|---:|
| purchase_order, product, processing_row, created_by, quantity > 0, defaults_snapshot | 9,090 / 9,090 (100%) |
| manifest_row | 7,672 (84.4%) |

`origin`: processing 7,672 · product_ad_hoc 1,418 · manual 0. Latest row 2026-09-22.

### `ItemHistory` (`models.py:2098`)

Writers (all use `event_type='status_change'` for a status move, not the `sold` / `lost` / `found` choices): `processing_ops.py:580`, `:1831`, `:2079`; `views.py:6027`, `:6083`, `:7065`, `:7937`. POS sale does not write a history row (`apps/pos/views.py:1500-1506`).

| Field | All-time (n=65,354) | First `created_at` | Last 120 days (n=45,337) |
|---|---:|---|---:|
| note | 65,354 (100%) | 2026-03-30 | 100% |
| created_by | 65,354 (100%) | 2026-03-30 | 100% |
| new_value | 56,217 (86.0%) | 2026-03-30 | 45,337 (100%) |
| old_value | 12,897 (19.7%) | 2026-03-30 | 5,817 (12.8%) |

`event_type` counts: status_change 43,959 · created 9,576 · location_change 5,672 · price_change 5,468 · condition_change 603 · note 76. The choices `sold`, `returned`, `lost`, `found`, `batch_processed`, `detached_from_batch` have **0** rows. Span: 2026-03-30 through 2026-09-22. 65,354 events cover far fewer than 237,689 items; the April backfill did not write history (section 3).

### `Product` (`models.py:1543`)

- `find_or_create_product_for_manual_item` creates one when UPC and exact title/brand/model/category miss. `apps/inventory/services/manual_item.py:148-202`. Build calls it at `processing_finalize.py:503`.
- The older manifest sync creates one at `views.py:1119-1127`.
- `Product.save` fills `product_number` and, if `category` is empty, Mixed lots (`models.py:1638-1647`).

| Field | All-time (n=200,079) | First `created_at` | Last 120 days (n=15,341) |
|---|---:|---|---:|
| product_number | 200,079 (100%) | 2026-04-11 | 100% |
| title | 100% | 2026-04-11 | 100% |
| brand | 100% | 2026-04-11 | 100% |
| brand other than Generic | 191,533 (95.7%) | 2026-04-11 | 13,407 (87.4%) |
| model | 63,571 (31.8%) | 2026-04-11 | 1,949 (12.7%) |
| category | 200,079 (100%) | 2026-04-11 | 100% |
| identifiers non-empty | 93,167 (46.6%) | 2026-04-11 | 5,489 (35.8%) |
| identifiers.upc | 91,807 (45.9%) | 2026-04-11 | 4,129 (26.9%) |
| is_active true | 200,079 (100%) | 2026-04-11 | 100% |

Latest product 2026-09-22. No inactive products.

### `Category` (`models.py:41`)

`name` and `slug` are filled on all 19 rows. `save` builds `slug` (`models.py:51-60`). Rows are created with `get_or_create` of a canonical name: `views.py:1102` and `:1298`, `manual_item.py` via `canonical_category_name`, `seed_categories.py:73`, and `Product.save` (`models.py:1645`). Names were inserted 2026-03-29 (8 names) and 2026-05-30 (the rest, including Mixed lots).

Every `name` equals a `TAXONOMY_V1_CATEGORY_NAMES` entry (`apps/buying/taxonomy_v1.py:9-29`), including `Home décor & lighting`. Product counts: Mixed lots & uncategorized 186,569 · Electronics 4,289 · Toys & games 1,368 · Kitchen & dining 864 · Home décor & lighting 827 · Health, beauty & personal care 802 · Apparel & accessories 750 · Office & school supplies 666 · Household & cleaning 592 · Tools & hardware 574 · Sports & outdoors 550 · Bedding & bath 497 · Pet supplies 389 · Party, seasonal & novelty 371 · Outdoor & patio furniture 341 · Baby & kids 247 · Storage & organization 143 · Books & media 128 · Furniture 112. Sum is 200,079.

### `VendorProductRef` (`models.py:1651`)

Written by the older manifest sync: `get_or_create` at `views.py:1129-1137`, and `times_seen` / `last_unit_cost` at `views.py:1095-1098`. Row check-in does not write one.

174 rows. `vendor_item_number`, `vendor_description`, `last_unit_cost`, and `last_seen_date` are filled on all 174. `times_seen > 1` on 65. Every `created_at` and every `last_seen_date` is **2026-05-01**. Last 120 days: **0** new rows.

### `Item` (`models.py:1776`)

There is no category column. The bucket is product category, else manifest category, else Mixed lots (`apps/buying/services/taxonomy_bucket_sql.py:36-39`).

| Field | What sets it | All-time filled | First `created_at` | Last 120 days (n=37,798) |
|---|---|---:|---|---:|
| product | Required. Build `processing_finalize.py:517`. Manifest sync `views.py:1184-1190`. Check-in `processing_ops.py:559`. Backfill `backfill_phase3_items.py`. | 237,689 (100%) | 2026-03-30 | 100% |
| purchase_order | Same creates. Null when the backfill or an add could not resolve a PO. | 227,468 (95.7%) | 2026-04-12 | 37,662 (99.6%) |
| manifest_row | Set when the item is born from a line (`processing_finalize.py:519`, `views.py:1187`, `processing_ops.py:561`). Null on backfill and on added-row units. | 35,431 (14.9%) | 2026-05-01 | 29,425 (77.8%) |
| price | Build uses `final_price`, else `proposed_price`, else 0 (`processing_finalize.py:499-520`). Check-in `processing_ops.py:563` and `:1813-1814`. Column default 0, not null. | > 0: 237,613 (100.0%). = 0: 76. null: 0 | 2026-03-30 | > 0: 37,794. = 0: 4 |
| retail | Line `unit_retail` at create (`processing_finalize.py:521`, `views.py:1161`). Check-in can overwrite (`processing_ops.py:1815`). | not null 236,605 (99.5%). > 0: 236,536. = 0: 69. null: 1,084 | 2026-03-30 | not null 37,016 (97.9%). = 0: 2 |
| cost | `PurchaseOrder.compute_item_cost` (`models.py:303-325`), stored at create and rewritten by `recompute_item_costs` (`models.py:327-339`). Returns null when retail, PO `retail_value`, or PO `total_cost` is missing. | not null 215,671 (90.7%). > 0: 215,452. = 0: 219. null: 22,018 | 2026-04-12 | not null 36,539 (96.7%). = 0: 3 |
| status | Default `intake`. Shelf: `processing_ops.py:567` and `:1820`, `views.py:6018` and `:7928`. Sold: `pos/views.py:1502`. Scrap and lost: section 3. | 237,689 (100%) | 2026-03-30 | 100% |
| condition | Create and check-in. Default `unknown`. | not `unknown`: 225,252 (94.8%) | 2026-03-30 | 32,585 (86.2%) |
| location | Dispatch label at check-in (`processing_ops.py:569`, `:1797-1800`). Backfill wrote `""` (`backfill_phase3_items.py:544` and `:700`). | 43,250 (18.2%) | 2026-03-30 | 37,629 (99.6%) |
| listed_at | Same moment as check-in (`processing_ops.py:570` and `:1821`, `views.py:6019` and `:7929`). | 53,366 (22.5%) | 2026-03-30 | 37,696 (99.7%) |
| checked_in_at | Same check-in lines (`:571`, `:1822`, `views.py:6020`, `:7930`). | 44,229 (18.6%) | 2026-03-31 | 37,696 (99.7%) |
| sold_at | POS complete `pos/views.py:1503`. Cleared on void `:1555` and `views.py:8312`. Also backfill and `import_historical_sold.py:214`. | 122,220 (51.4%) | 2026-03-30 | 13,135 (34.7% of items created in the window) |
| sold_for | POS `pos/views.py:1505` (`line_total / qty`). Same clear paths. | 122,220 not null. > 0: 121,429 | 2026-03-30 | 13,131 > 0 |
| dispute_type | Only `processing_dispute` / bulk disposition (`processing_ops.py:2069` and `:2074`, `:2151` and `:2159`). Cleared on check-in (`:1824`). | 162 (0.07%) | 2026-05-01 | 0 |

`status`: sold 122,617 · scrapped 83,506 · on_shelf 31,128 · intake 290 · lost 148 · processing 0 · returned 0.

`source`: purchased 237,689. consignment 0. misc 0.

`condition`: very_good 130,401 · good 63,077 · new 24,886 · unknown 12,437 · fair 3,509 · like_new 3,068 · salvage 311.

`location` values are workflow labels, not bin addresses: blank 194,439 · `on_shelf` 43,205 · salvage 22 · processing 16 · restoration 6 · online_sales 1.

`sold_at` is null on **397** items whose status is `sold`. `sold_for = 0` on 791 items that have a `sold_for`.

---

## 2. Register checks

As of 2026-09-23.

| ID | Verdict | Fresh count |
|---|---|---|
| PO-03 | **Confirmed** for `ManifestRow.category`. **Narrow it.** | Recent lines (`ordered_date >= 2026-05-26`): **0 of 12,191** are taxonomy names. 12,190 are vendor codes, 1 is blank. Top codes unchanged from R-003: `MIXED_LOTS` 1,856, `MIXED_HOME_AND_GARDEN` 1,599, `OFFICE_SUPPLIES` 970, `KITCHEN_AND_DINING` 771, `MIXED_HEALTH_AND_BEAUTY` 682, `OUTDOOR_LIVING_AND_GARDEN` 621, `TOYS` 599, `PET_SUPPLIES` 566. On those same 12,191 lines, `PreprocessingRow.final_category` and `ProcessingRow.category` **are** taxonomy names on **12,185**. The pipeline still reads the manifest code (PO-03's map). See PRE-01. |
| PO-04 | **Correct the scope.** | Lines on POs ordered before 2026-05-26 with a blank `ManifestRow.category`: **143,968 of 147,370**. The ~16k figure matches lines that **have** a category (15,592 all-time), not the blank ones. Of the 3,402 older lines that do have a category, all 3,402 are taxonomy names (the earlier preprocess set). |
| ITM-01 | **Confirmed.** | Sold with `sold_at >= 2025-09-23`: 43,600 of 55,079 (79.2%) have product category Mixed lots. Sold before 2026-06-15: 38,305 of 38,357 are Mixed lots. Sold from 2026-06-15: 5,295 of 16,722 are Mixed lots. Check-in weeks of 2026-05-04 through 2026-06-08 are 100% Mixed lots. The week of 2026-06-15 is the break: 5,446 named of 6,348. One earlier week (2026-04-27) had 77 named of 143, then the mix went back to all Mixed lots until 2026-06-15. |
| ITM-02 | **Confirmed.** | Of 55,079 sold since 2025-09-23, **33,050** have `created_at` after `sold_at`, and **33,069** have `label_printed_at` after `sold_at`. R-004's "33k of 55k" used 55,012 because that window started later on 2025-09-23. Zero of these sold items have `sold_at` before `listed_at`. |
| ITM-03 | **Confirmed.** | `listed_at` is set on **21,859** of **55,079** sold since 2025-09-23 (39.7%). The 21,859 matches R-004. The sold base is 55,079 rather than 55,012 for the same midnight-versus-later-cutoff reason. |
| ITM-04 | **Confirmed.** | Sold with no PO: **5,127**, all of them inside `sold_at >= 2025-09-23`. All-time sold-without-PO outside that window: 0. |
| ITM-05 | **Confirmed on the count. Correct the age.** | Intake is still **290**. As of 2026-09-23 their ages are **93 to 144 days** (289 fall in 90–140; 1 is 144, created 2026-05-02). 254 sit on a PO with `processing_status = done`. 33 have no PO. 3 sit on a `delivered` PO with `processing_status = not_started`. 5 distinct POs. `created_at` still runs 2026-05-02 to 2026-06-22. |
| ITM-06 | **Count confirmed. Meaning corrected** in section 3. | Scrapped is still **83,506**. |
| PRD-01 | **Confirmed.** | Same lowercased trimmed title, groups of 2 or more: **53,969 groups**, **132,419 rows**, 66.2% of 200,079. |
| PRD-02 | **Confirmed.** | `pg_extension`: `pg_trgm` and `plpgsql` only. No vector extension. |

---

## 3. Scrapped and lost (ITM-06)

### What sets the status

`scrapped`:

- Item Processor dispute, type `broken`: sets `status`, `dispute_type='broken'`, `dispute_pct_loss`, `dispute_description`, and a history note `Marked disputed (broken)`. `processing_ops.py:2068-2070` and `:2079-2084`.
- Bulk disposition with the same dispute type sets the fields and does **not** write history. `processing_ops.py:2149-2156` (history is only appended on the shelf branch, `:2176-2185`).
- `mark-items-broken` and `mark-broken` set `status` only, notes `Bulk marked broken` / `Marked broken`. `views.py:6080-6088` and `:7992-8000`.
- Batch scrap sets `status` only, note `Marked broken via {batch}`. `views.py:7062-7070`.
- Backfill mapped every legacy row that was not a recorded sale to `scrapped`. V1: `backfill_phase3_items.py:487-489` (`status_id` not in 16, 23). V2: `:649-651` (`sold_at` is null). The note is `BACKFILL:v1:{code}` or `BACKFILL:v2:…`.

`lost`:

- Item Processor dispute, type `undelivered`: `status='lost'`, `dispute_type='undelivered'`, description cleared. `processing_ops.py:2073-2076`. History note `Marked disputed (undelivered)` at `:2084`.
- Bulk disposition can set the same fields without history (`:2157-2164`). No current `lost` row has that shape.

`import_legacy_data.py:120-123` maps the words `scrapped`/`broken` and `lost`/`missing`, but the rows in this database match the phase-3 backfill notes, not that command's history writer.

### Counts

| status | n | notes | dispute_type | manifest_row | POs | created_at | updated_at |
|---|---:|---|---|---:|---:|---|---|
| scrapped | 83,506 | `BACKFILL:v1` 59,874 · `BACKFILL:v2` 23,617 · blank 15 | blank 83,492 · `broken` 14 | 15 | 314 | 2026-04-12 to 2026-08-07 | 2026-04-16 to 2026-09-22 |
| lost | 148 | blank 148 | `undelivered` 148 | 148 | 7 | 2026-05-01 to 2026-05-18 | 2026-05-01 to 2026-09-19 |

`dispute_description` is filled on the 14 `broken` rows and on 0 `lost` rows (the undelivered branch clears it).

**`updated_at` by month**

| month | scrapped | lost |
|---|---:|---:|
| 2026-04 | 81,235 | 0 |
| 2026-05 | 652 | 2 |
| 2026-06 | 182 | 0 |
| 2026-07 | 235 | 0 |
| 2026-08 | 1,058 | 6 |
| 2026-09 | 144 | 140 |

**`created_at` by month**

| month | scrapped | lost |
|---|---:|---:|
| 2026-04 | 83,491 | 0 |
| 2026-05 | 14 | 148 |
| 2026-08 | 1 | 0 |

`updated_at` is not a scrap date. `recompute_item_costs` rewrites it (`models.py:335-339`). Creation month is the insert. **83,491 scrapped rows were inserted in April 2026**, which is the backfill, and 81,235 of them were never saved again.

### Where they come from

Scrapped, by vendor code (PO-06: `TGT` and `TRGET` are the same seller):

| vendor | items | POs |
|---|---:|---:|
| TGT | 32,245 | 69 |
| AMZ | 22,541 | 59 |
| TRGET | 8,729 | 22 |
| WAL | 8,041 | 46 |
| HMD | 4,918 | 15 |
| MIS | 2,712 | 2 |
| CST | 1,668 | 41 |
| GEN | 1,121 | 37 |
| WFR | 1,034 | 18 |
| ESS | 497 | 5 |

Largest single PO is `TGT122665` at 2,099 items (2.5% of scrapped). `MISFIT-V2-2025` has 1,730. No PO is the bulk of the set.

Lost, all 7 POs:

| order | vendor | ordered | n |
|---|---|---|---:|
| TRGET-OL9-8K83 | TRGET | 2026-05-14 | 54 |
| AMZ0N-OQL-CCP4 | AMZ | 2026-04-21 | 50 |
| TRGET-O80-86PM | TRGET | 2026-05-08 | 24 |
| TRGET-OC3-C598 | TRGET | 2026-05-13 | 8 |
| TRGET-O2R-1K40 | TRGET | 2026-04-21 | 6 |
| TRGET-O4U-QP68 | TRGET | 2026-04-21 | 4 |
| C5TC0-OM1-A8R3 | CST | 2026-04-21 | 2 |

### Is there a reason?

History for current scrapped/lost items:

| bucket | items |
|---|---:|
| scrapped, no history row at all | 83,491 |
| scrapped, history `Marked disputed (broken)` | 14 |
| lost, history `Marked disputed (undelivered)` | 148 |

No history note is `Marked broken`, `Bulk marked broken`, or `Marked broken via …`. Those view paths have not produced any row that is still scrapped.

The backfill note is an import tag (legacy SKU), not a scrap reason. The 14 `broken` rows have `dispute_type` and `dispute_description`. The 148 `lost` rows have `dispute_type='undelivered'` and a history note, and no description. **1** scrapped item was created 2026-08-07 with blank notes, blank `dispute_type`, and no `new_value='scrapped'` history. Reason: **UNKNOWN**.

### Is it one era cleanup?

**Scrapped, yes: one import, not one truck.** 83,491 of 83,506 were inserted in April 2026 by the phase-3 backfill, which stored "not a recorded sale" as `scrapped`. They sit on 314 POs across every major vendor. They are not a floor scrap event, and they have no scrap date older than the import (`created_at` starts 2026-04-12).

**Lost, no.** 148 items, born May 2026 on 7 POs, marked undelivered by Item Processor (140 of the `updated_at` stamps are September 2026). That is the live dispute path.

Corrected ITM-06 handling: **exclude** the 83,491 `BACKFILL:` rows from shrink (they are unsold legacy imports). **use** the 14 `broken` and 148 `lost` as processor disputes. The August singleton stays **unknown**.

---

## 4. Checks that came back empty

- Price is never null (the column default is 0). See ITM-07 for the 76 zeros.
- Items whose category comes from neither product nor manifest: **0**. Every product category name is a taxonomy v1 name, so `taxonomy_bucket_sql.py:37` always takes the product. The related miss is ITM-11.
- Products with `category_id` null: **0**. Products whose category name is outside taxonomy v1: **0**.
- `Category.name` values that are not taxonomy names: **0**.
- `ManifestRow.quantity` 0 or negative: **0**.
- Item `manifest_row` pointing at a different PO than `item.purchase_order`: **0**. Items with a manifest row and no PO: **0**.

---

## 5. New register rows

Scope is the dev database as of 2026-09-23.

| ID | Stage | Issue | Scope | Affects | Handling | Rail | Status |
|---|---|---|---|---|---|---|---|
| PRE-01 | preprocessing | Taxonomy name is stored on `PreprocessingRow.final_category` and `ProcessingRow.category`, while `ManifestRow.category` on the same recent line stays the vendor code. Standardize writes the code (`views.py:1909`). Build only creates a manifest row when the bookmark has none (`processing_finalize.py:474`), so it never copies the taxonomy name back. | 12,185 of 12,191 lines on POs ordered since 2026-05-26. 6 finals are still codes (PRE-02). | Need on-order mix, which maps `ManifestRow.category` (PO-03) | **use** the code map in PO-03. **flag** that `final_category` already holds the name. | At the end of finalize, copy the taxonomy name onto `ManifestRow.category` and keep the vendor code on another field. | open |
| PRE-02 | preprocessing | `final_category` left as a vendor code | 6 preprocessing rows: `ARTS_AND_CRAFTS` 4, `AUTOMOTIVE_ACCESSORIES` 1, `MIXED_LOTS` 1 | Those lines miss the taxonomy rail | **fill** with Mixed lots under the PO-03 rule | Finalize rejects a `final_category` that is not a taxonomy v1 name | open |
| PRE-03 | preprocessing | Manifest quantity over 500 | 11 `ManifestRow`s. Quantities: 580, 766, 784, 936, 1,003, 1,187, 1,872 (4 rows), 4,186. Also 323 rows with quantity 51–500. Zero rows at 0 or below. | Processing time, item explosion if a build creates one item per unit | **flag** the row. **use** the quantity. | Standardize warns when quantity > 500 | open |
| PRE-04 | processing | Added processing rows (no manifest line) have a blank category | 1,075 of 1,401 `row_kind='added'`. Manifest-kind rows: 0 blank. | Category on units checked in from an added line, if the product falls back to Mixed lots | **fill** Mixed lots when the name is blank | `processing_add_item` requires a taxonomy category (`processing_ops.py:2210` reads it and allows blank) | open |
| PRD-03 | products | `VendorProductRef` stopped on 2026-05-01 | 174 rows, all created that day, `last_seen_date` all 2026-05-01, 0 created since 2026-05-26. Check-in does not write a ref. | Vendor-item match on new trucks | **use** title match (PRD-01) | The check-in path writes a ref when the line has a vendor item number (`views.py:1129` is the old sync only) | open |
| ITM-07 | items | Shelf price is 0 | 76 items, 0 nulls. By status: scrapped 69, on_shelf 3, sold 2, intake 1, lost 1. Items created since 2026-05-26: 4. | Price, recovery, a $0 tag | **flag** price 0 on `on_shelf` and `intake`. Scrapped zeros can stay. | Check-in rejects price 0 (`processing_ops.py:499` turns a missing price into 0) | open |
| ITM-08 | items | Retail is null or 0 | 1,153 items. By status (null / 0): sold 444 / 1, on_shelf 599 / 2, intake 41 / 0, scrapped 0 / 66, lost 0 / 0. | Cost allocation (`compute_item_cost` returns null when retail is null, `models.py:311`) | **unknown** cost when retail is null. **flag** an on-shelf item with no retail. | Retail required at check-in | open |
| ITM-09 | items | Cost is null or 0 on purchased items | Every item is `source='purchased'`. Cost null 22,018 (10,221 have no PO, 11,797 have a PO). Cost 0: 219. On `on_shelf` + `intake`: 5,844 null or 0. | Recovery, truck cost | No-PO cost stays **unknown** (ITM-04). Has-PO null cost stays **unknown** until the PO has `total_cost` and `retail_value` (`models.py:313-316`). **exclude** cost 0 from a recovery average. | A processed PO has `total_cost` and `retail_value`, and check-in runs `recompute_item_costs` | open |
| ITM-10 | items | Price is above retail | 79 items with `price > retail` (77 of them have retail > 0). sold 42, scrapped 22, on_shelf 14, lost 1. Created since 2026-05-26: 13 on_shelf, 12 sold. | Margin, a tag priced over the manifest retail | **flag**. **use** `price` as the shelf price. | Check-in warns when price > retail | open |
| ITM-11 | items | Product category Mixed lots hides a taxonomy name already on the manifest | 0 items are in the "neither" bucket. 6,052 items have product Mixed lots and a `ManifestRow.category` that is a different taxonomy name, so the bucket keeps Mixed lots (`taxonomy_bucket_sql.py:37` wins before `:38`). Another 2,509 have Mixed lots on the product and a vendor code on the manifest. | Per-category have and sales | **fill** the manifest taxonomy name when the product is Mixed lots and the manifest name is a taxonomy name other than Mixed lots | At check-in, set the product category from `ProcessingRow.category` when that name is a specific taxonomy name | open |
