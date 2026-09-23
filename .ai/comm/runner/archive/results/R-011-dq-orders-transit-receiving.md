# R-011 · Data quality: orders, in transit, receiving, vendors
- **Runner:** Grok 4.7 · **Started:** 2026-09-23 13:18 America/Chicago · **Finished:** 2026-09-23 13:45 America/Chicago · **Status:** done

Read-only. Dev database, as of 2026-09-23 13:22 America/Chicago. Queries: `workspace/runner/R-011/query.py` (and `followup.py`, `followup2.py`, `followup4.py`).

There is no `ReceivingSession` model. The session is `inventory.Receiving` (`apps/inventory/models.py:2288`), one per PO. Related rows: `ReceivingPallet`, `ReceivingAttachment`, `ReceivingPhotoOverride`, `Dispute`.

**Window.** Last 120 days for a PO is `ordered_date >= 2026-05-26` (27 of 349). For `Vendor`, `Receiving`, and `Dispute` it is `created_at` or `opened_at` on or after that date.

**Filled.** A nullable date or amount is filled when it is not null. Text is filled when it is not blank. `item_count` and `received_pallet_count` are filled when greater than 0 (the column default is 0). Status columns are never null; the distribution is the useful number. **First row** is the earliest `created_at` of a filled row. **Earliest value** is the earliest date stored in that column. Almost every PO row was created 2026-04-11, so a first-row of that day means the value came in with the import. A first-row in late April 2026 or later means this database first stored the field then.

---

## 1. Rails today

Money fields are never null. Zeros are in section 4 (PO-09, VEN-01). `PurchaseOrder.save` sets `total_cost` to the sum of the non-null components whenever any of `purchase_cost`, `shipping_cost`, or `fees` is set (`apps/inventory/models.py:288-292`). `total_cost` is read-only on the serializer (`apps/inventory/serializers.py:482`).

### PurchaseOrder (`apps/inventory/models.py:66`)

349 POs all-time. 27 in the window.

| Field | What sets it | First row | Earliest value | All-time | Last 120 days |
|---|---|---|---|---:|---:|
| `status` | Default `ordered`. Writable on `PurchaseOrderSerializer` (`serializers.py:461`). `mark_paid` `views.py:2550`, `revert_paid` `:2559`, `mark_shipped` `:2568`, `revert_shipped` `:2581`, deliver via `_finalize_purchase_order_deliver` `:1517`, `revert_delivered` `:2599`, legacy check-in `:1508`, `create_items` `:5960`, bulk check-in `:6053`, `mark_complete` `:6144`. No live cancel action. | 2026-04-11 | — | 349/349 | 27/27 |
| `preprocess_status` | Default `not_started`. Standardize `views.py:3595`. AI cleanup `services/ai_cleanup.py:578`. Review save `views.py:890`. Finalize `services/processing_finalize.py:279`. Upload resets it `views.py:2718`. | 2026-04-11 | — | 349/349 | 27/27 |
| `receiving_status` | Default `not_started`. First touch sets `active` (`services/receiving.py:84`). Complete sets `done` (`views.py:3233`). | 2026-04-11 | — | 349/349 | 27/27 |
| `processing_status` | Default `not_started`. Build start sets `active` (`processing_finalize.py:732`). Finish sets `done` (`:578`). Clear sets `not_started` (`:952`). | 2026-04-11 | — | 349/349 | 27/27 |
| `closeout_status` | Default `open` (`models.py:199`). Choices are only `open`. No setter found. | 2026-04-11 | — | 349/349, all `open` | 27/27 `open` |
| `intake_dispute_status` | Default `none`. Rollup `services/disputes.py:26-28`. | 2026-04-11 | — | 349/349, all `none` | 27/27 `none` |
| `processing_dispute_status` | Same rollup. | 2026-04-11 | — | 7 not `none` | 0 not `none` |
| `condition` | Writable on the serializer (`serializers.py:465`). | 2026-04-11 | — | 349/349 non-blank | 27/27 |
| `ordered_date` | Required. Create defaults to today (`views.py:2543`). | 2026-04-11 | 2024-03-01 | 349/349 | 27/27 |
| `paid_date` | `mark_paid` `views.py:2551`. Cleared `revert_paid` `:2560`. Also writable on the serializer. | 2026-04-11 | 2024-03-14 | 243/349 (69.6%) | 26/27 (96.3%) |
| `shipped_date` | `mark_shipped` `views.py:2569`. Cleared `:2579`. | 2026-04-28 | 2026-04-28 | 20/349 (5.7%) | 13/27 (48.1%) |
| `expected_delivery` | `mark_shipped` when the body sends it (`views.py:2571`). Cleared `:2580`. Writable on the serializer. | 2026-04-11 | 2024-01-25 | 289/349 (82.8%) | 16/27 (59.3%) |
| `delivered_date` | `_finalize_purchase_order_deliver` `views.py:1518` (deliver action and receiving complete). Cleared `:2599`. | 2026-04-11 | 2024-01-25 | 341/349 (97.7%) | 22/27 (81.5%) |
| `receiving_started_at` | `services/receiving.py:86`. Receiving complete fills it if still empty (`views.py:3232`). | 2026-04-11 | 2026-04-29 | 29/349 (8.3%) | 20/27 (74.1%) |
| `receiving_done_at` | Receiving complete `views.py:3234`. | 2026-04-28 | 2026-04-29 | 18/349 (5.2%) | 14/27 (51.9%) |
| `processing_started_at` | `processing_finalize.py:734`. | 2026-04-28 | 2026-05-01 | 7/349 (2.0%) | 0/27 |
| `processing_done_at` | `processing_finalize.py:579`. Cleared `:954`. | 2026-04-28 | 2026-05-06 | 7/349 (2.0%) | 0/27 |
| `standardized_at` | `views.py:3594`. | 2026-04-28 | 2026-05-01 | 34/349 (9.7%) | 27/27 (100%) |
| `ai_cleaned_at` | `services/ai_cleanup.py:577`. | 2026-04-28 | 2026-05-01 | 34/349 (9.7%) | 27/27 |
| `review_saved_at` | `views.py:893`. | 2026-04-28 | 2026-05-01 | 34/349 (9.7%) | 27/27 |
| `finalized_at` | `processing_finalize.py:278`. | 2026-04-28 | 2026-05-01 | 34/349 (9.7%) | 27/27 |
| `closed_at` | Column `models.py:218`. No setter found. | — | — | 0/349 | 0/27 |
| `created_at` / `updated_at` | Django auto. | 2026-04-11 | 2026-04-11 | 349/349 | 27/27 |
| `manifest_uploaded_at` | Upload `views.py:2710`. | 2026-04-28 | 2026-05-01 | 34/349 (9.7%) | 27/27 |
| `manifest` (file) | Upload `views.py:2707`. | 2026-04-28 | — | 34/349 (9.7%) | 27/27 |
| `purchase_cost` | Writable on the serializer (`serializers.py:463`). Non-null on every row. Greater than 0: | 2026-04-11 | — | 307/349 (88.0%) | 27/27 |
| `shipping_cost` | Same. Greater than 0: | 2026-04-11 | — | 305/349 (87.4%) | 27/27 |
| `fees` | Same. Greater than 0: | 2026-04-11 | — | 261/349 (74.8%) | 27/27 |
| `total_cost` | Computed in `save` (`models.py:288-292`). Greater than 0: | 2026-04-11 | — | 307/349 (88.0%) | 27/27 |
| `retail_value` | Writable on the serializer (`serializers.py:464`). Greater than 0: | 2026-04-11 | — | 307/349 (88.0%) | 27/27 |
| `description` | Writable on the serializer (`serializers.py:465`). | 2026-04-11 | — | 349/349 non-blank | 27/27 |
| `item_count` | Default 0. Serializer-writable. Synced to `Item` rows at `views.py:1255`, `:1509`, `:4416`, `:5961`, and `processing_finalize.py:563`. Greater than 0: | 2026-04-11 | — | 306/349 (87.7%) | 26/27 (96.3%) |
| `pallet_count` | Writable on the serializer (`serializers.py:466`). Non-null: | 2026-04-28 | — | 34/349 (9.7%) | 27/27 |

Status distribution, all-time (window in parentheses when it differs):

| Field | Values |
|---|---|
| `status` | complete 189, delivered 91, processing 62, paid 5, shipped 1, ordered 1. Window: delivered 22, paid 4, shipped 1. |
| `preprocess_status` | not_started 315, finalized 34. Window: finalized 27. |
| `receiving_status` | not_started 320, done 18, active 11. Window: done 14, not_started 7, active 6. |
| `processing_status` | not_started 342, done 7. Window: not_started 27. |
| `condition` | good 201, fair 53, mixed 52, like_new 32, new 10, salvage 1. |
| `processing_dispute_status` | none 342, active 7. |
| `closeout_status`, `intake_dispute_status` | only the default, on all 349. |

The seven `processing_status=done` POs were all ordered 2026-04-21, so they sit just outside the 120-day window.

### Vendor (`apps/inventory/models.py:15`)

12 vendors. The API is `VendorViewSet` (`views.py:2166`) through `VendorSerializer` (`serializers.py:26-33`). One vendor (`NFMRT`) was created inside the window (2026-07-01). The other 11 were created 2026-04-11 or 2026-04-12.

| Field | All-time | Last 120 days |
|---|---:|---:|
| `name`, `code`, `vendor_type`, `is_active`, `created_at` | 12/12 | 1/1 |
| `contact_name`, `contact_email`, `contact_phone`, `address`, `notes` | 0/12 | 0/1 |

`vendor_type`: liquidation 8, other 4 (`TGT`, `GEN`, `MIS`, `RAM`). None inactive. Every vendor `created_at` is 2026-04-11 except `MIS` (2026-04-12) and `NFMRT` (2026-07-01).

### Receiving and related

26 sessions. 22 created on or after 2026-05-26. First session `created_at` 2026-05-01.

| Field | What sets it | First row | Earliest value | All-time | Last 120 days |
|---|---|---|---|---:|---:|
| `received_date` | Set to today on create (`services/receiving.py:63`). Patchable (`:108`). | 2026-05-01 | 2026-05-01 | 26/26 | 22/22 |
| `start_time` | Set on create (`receiving.py:65`). | 2026-05-01 | — | 26/26 | 22/22 |
| `end_time` | Patch, or complete if still empty (`views.py:3222-3223`). | 2026-06-24 | — | 15/26 (57.7%) | 15/22 (68.2%) |
| `condition` | Patch (`receiving.py:111`). Required to complete (`:208`). | 2026-06-24 | — | 14/26 non-blank | 14/22 |
| `issues` | Patch. | 2026-06-24 | — | 3/26 (11.5%) | 3/22 |
| `received_pallet_count` | Patch and pallet sync (`receiving.py:148`, `:163`). Greater than 0: | 2026-06-24 | — | 15/26 (57.7%) | 15/22 |
| `completed_at` | Receiving complete `views.py:3221`. | 2026-06-24 | 2026-06-29 | 14/26 (53.8%) | 14/22 |
| `created_at` / `updated_at` | Django auto. | 2026-05-01 | 2026-05-01 | 26/26 | 22/22 |

Condition on the session: blank 12, good 12, mixed 1, damaged 1.

| Related | Rows | In window | First row | Notes |
|---|---:|---:|---|---|
| `ReceivingPallet` | 158 | 158 | 2026-06-24 | 4 flagged damaged. Written by `receiving.py:154`. |
| `ReceivingAttachment` | 640 | 640 | 2026-06-29 | pallet_side 612, bol 15, truck 13. Written by `services/receiving_photos.py:186` and `:192`. |
| `ReceivingPhotoOverride` | 3 | 3 | 2026-08-05 | pallet_side 2, bol 1. Written by `receiving.py:286`. |

14 completed sessions, and all 14 sit on POs with `receiving_status=done`. 12 sessions are still drafts: 7 on delivered/active, 2 on paid/active, 2 on processing/active, 1 on delivered/done (that last one is in PO-15).

### Dispute (`apps/inventory/models.py:2459`)

Created by `services/disputes.py:61` and `:127`. Status changes `:85` and `:99`. Rollup back onto the PO `:26-28`. Counts are in PO-14.

---

## 2. Register rows PO-01 to PO-07

Same 349 POs as R-003 and R-005.

**PO-01 confirmed.** Open by the R-005 rule (status `delivered` or `processing`, or receiving `active`/`done`, and not `complete`/`cancelled`, and `processing_status != done`): **148**. The crosstab matches R-005 row for row (65, 60, 14, 5, 2, 2). Of those 148, **125** have `ordered_date` before 2026-05-26 and **23** are inside the window. Of the 125 older open POs: **85** have manifest rows and every `ManifestRow.category` is blank, **40** have no manifest rows, **0** have a non-blank category. `processing_status=done` is **7 of 349**, all `status=delivered`. `status=complete` is **189**, and **0** of them have `processing_done_at` (all 189 are `processing_status=not_started`).

**PO-02 confirmed on the count, correct the "paid" clause.** `delivered_date` is set on **341 of 349**. It is set on complete 187/189, delivered 91/91, processing 62/62, and the 1 ordered PO. It is **not** set on paid (0/5) or shipped (0/1). The eight missing dates are 2 complete, 5 paid, and 1 shipped.

**PO-03 confirmed.** Manifest rows on POs ordered on or after 2026-05-26: **12,191**. **0** have `category` equal to a `Category.name`. **1** is blank. (Same figures as R-003.)

**PO-04 correct the scope.** Manifest rows on POs ordered before 2026-05-26: **147,370**. **143,968** have a blank `ManifestRow.category`. The register's "16k+ lines" is low. The "85" in PO-01 is a count of open POs, not a count of lines.

**PO-05 confirmed.** Of 349: `shipped_date` 20, `receiving_done_at` 18, `processing_done_at` 7. Also, so the rail is not read as "all dates are rare": `expected_delivery` is 289 and `paid_date` is 243. In the last 120 days, `shipped_date` is 13/27 and `receiving_done_at` is 14/27. `processing_done_at` is still 0/27. `expected_delivery` is a copy problem, not a fill problem (PO-08).

**PO-06 confirmed, and the Costco guess is not a second vendor.** The only duplicate `Vendor` rows are Target: `TGT` and `TRGET`. Costco is one vendor, `CST`. `C5TC0` is an order-number prefix (8 POs on `CST`), not a vendor code. Canonical codes are in section 3.

**PO-07 confirmed.** `shipping_cost > 0` on **305** POs. Using `city_from_text` and `pallets_from_text` (`apps/buying/services/shipping_formula.py:60` and `:66`): **80** have no city, **32** have a city but no pallet count, **9** have neither (so 41 descriptions lack a pallet count). **193** have both, which is the purchase-order count the shipping fit used. The register's "80 and 32" is that split.

---

## 3. Vendors

Item count is `Item` rows whose PO points at that vendor.

| Code | Name | Type | POs | Items | Created |
|---|---|---|---:|---:|---|
| TGT | Target | other | 69 | 63,297 | 2026-04-11 |
| AMZ | Amazon | liquidation | 67 | 54,915 | 2026-04-11 |
| WAL | Walmart | liquidation | 52 | 47,519 | 2026-04-11 |
| CST | Costco | liquidation | 46 | 6,668 | 2026-04-11 |
| GEN | Generic | other | 40 | 2,450 | 2026-04-11 |
| TRGET | Target | liquidation | 33 | 30,854 | 2026-04-11 |
| WFR | Wayfair | liquidation | 18 | 2,159 | 2026-04-11 |
| HMD | Home Depot | liquidation | 15 | 9,922 | 2026-04-11 |
| ESS | Essendant | liquidation | 5 | 885 | 2026-04-11 |
| MIS | The Island of Misfit Items | other | 2 | 8,799 | 2026-04-12 |
| NFMRT | Nebraska Furniture Mart | liquidation | 1 | 0 | 2026-07-01 |
| RAM | Ramaekers | other | 1 | 0 | 2026-04-11 |

**Duplicate vendor rows.** One group: Target `TGT` (legacy order numbers like `TGT98432`, type `other`) and `TRGET` (current B-Stock numbers like `TRGET-O6G-PMPL`, type `liquidation`). **Canonical: `TRGET`.** It is the code on new orders, and its type is already `liquidation`. Map `TGT` → `TRGET` for any per-vendor number.

**Same seller, one vendor, two spellings on the order number.** Do not add a vendor for these prefixes.

| Order-number token | POs | Vendor code | Canonical |
|---|---:|---|---|
| `TRGET-` | 33 | TRGET | TRGET |
| `TGT` + digits | 69 | TGT | TRGET |
| `C5TC0-` | 8 | CST | CST |
| `CST` + digits | 38 | CST | CST |
| `WLMRT-` | 6 | WAL | WAL |
| `WAL` + digits | 46 | WAL | WAL |
| `AMZ0N-` | 7 | AMZ | AMZ |
| `AMZ` + digits | 59 | AMZ | AMZ |
| `HMDPT-` | 1 | HMD | HMD |
| `HMD` + digits | 14 | HMD | HMD |
| `NFMRT-` | 1 | NFMRT | NFMRT |

`WFR`, `ESS`, and `RAM` appear only as `CODE` + digits, on those vendors. One order breaks the prefix rule: `TRGET-O7D-FRTF` is vendor `AMZ` (VEN-02).

`GEN` and `MIS` are placeholders, not duplicate sellers (VEN-01).

---

## 4. Checks that were asked for

**`total_cost` vs `purchase_cost + shipping_cost + fees`.** Not a break. On all **349** POs, `total_cost` equals the sum of the non-null components (the `save` rule). No row has a null component. No row has all three null.

**Costs of 0 or null, by vendor and year.** Nulls: **0** on purchase, shipping, fees, total, and retail. Zeros:

| Vendor | Year | POs | purchase 0 | shipping 0 | fees 0 | total 0 | retail 0 |
|---|---:|---:|---:|---:|---:|---:|---:|
| GEN | 2025 | 40 | 40 | 40 | 40 | 40 | 40 |
| MIS | 2024 | 1 | 1 | 1 | 1 | 1 | 1 |
| MIS | 2025 | 1 | 1 | 1 | 1 | 1 | 1 |
| AMZ | 2024 | 29 | 0 | 0 | 29 | 0 | 0 |
| AMZ | 2025 | 30 | 0 | 0 | 17 | 0 | 0 |
| CST | 2025 | 18 | 0 | 1 | 0 | 0 | 0 |
| WAL | 2025 | 33 | 0 | 1 | 0 | 0 | 0 |

Amazon 2026: 8 POs, fees 0 on none. The two shipping zeros with a real purchase cost are `WAL130984` (complete, ordered 2025-04-24) and `CST525654` (complete, ordered 2025-03-12). Every PO in the 120-day window has purchase, shipping, fees, total, and retail all greater than 0.

**`retail_value` vs manifest retail.** Manifest retail is `SUM(unit_retail * quantity)` on `ManifestRow`. `PurchaseOrder.retail_value` is the listing total, not that sum (`models.py:307`).

| Bucket | POs |
|---|---:|
| No manifest rows | 45 |
| Abs diff ≤ $0.02 | 25 |
| Else within 1% | 259 |
| Else within 5% | 5 |
| Off by more than 5% | 15 |

The worst gaps: `WAL129206` listing $132,519 vs lines $1,295.78 (8 priced rows); `WFR10979` $9,999 vs $49,401 (1 row); `NFMRT-ONV-61LA` $15,000 vs $1.00 (1 row).

**Dates out of order.** `delivered_date < shipped_date`: **0**. `shipped_date < ordered_date`: **0**.

| Break | POs | What they are |
|---|---:|---|
| `paid_date` before `ordered_date` | 1 | `C5TC0-OD7-3Q1L` (CST, delivered). Paid 2026-06-24, ordered 2026-06-26. |
| `delivered_date` before `ordered_date` | 8 | All `complete`, ordered 2024-03-14 or 2024-03-16. The same 8 have delivered before paid. |

**Manifest and items, by status.**

| | complete | delivered | processing | paid | shipped | ordered |
|---|---:|---:|---:|---:|---:|---:|
| POs | 189 | 91 | 62 | 5 | 1 | 1 |
| No manifest file | 189 | 62 | 62 | 1 | 0 | 1 |
| No manifest rows | 4 | 40 | 0 | 0 | 0 | 1 |
| No Item rows | 1 | 0 | 0 | 4 | 1 | 1 |

304 POs have manifest rows. 34 have the S3 manifest file. **270 have rows and no file. 0 have a file and no rows.** The file is on every PO in the 120-day window (27/27). The 40 delivered POs with no rows are all `GEN`. The 4 complete with no rows include both `MIS` POs. The 7 with no items: `TRGET-OQ4-T71L`, `TRGET-OGG-9L2P`, `TRGET-O6G-PMPL`, `AMZ0N-O0N-VVGJ` (all paid, 2026-09-15), `NFMRT-ONV-61LA` (shipped), `RAM251013` (ordered), `AMZ24714` (complete, `item_count` 155, ordered 2024-11-10).

**`item_count` vs Item rows.**

| | POs |
|---|---:|
| Equals `SUM(ManifestRow.quantity)` | 281 |
| Equals the `Item` row count | 34 |
| Those 34 also equal the unit sum | 34 |
| Equals the unit sum but not the Item rows | 247 |
| No manifest, and not equal to Item rows | 45 |
| Equals neither | 23 |
| `item_count` is 0 but items exist | 43 |
| `item_count` > 0 and no items | 7 |

The 43 zeros-with-items are the 40 `GEN` POs, both `MIS` POs, and one other delivered PO in that zero bucket's delivered count (41 delivered + 2 complete = 43; the 2 complete are the `MIS` POs, so the delivered 41 are `GEN` 40 plus one more). The live sync writes the Item-row count (`processing_finalize.py:560-564`). On the imported POs, and on the four paid POs that have no items yet, `item_count` is the manifest unit total.

**Dispute fields.** In use, narrowly.

| | Count |
|---|---:|
| `Dispute` rows | 162 |
| kind `processing`, status `open` | 162 |
| kind `intake` | 0 |
| `resolved_at` set | 0 |
| `subject_item` set | 162 |
| subject receiving, pallet, manifest row, or processing row | 0 |
| Distinct POs | 7 |
| `processing_dispute_status=active` | those same 7 |
| `intake_dispute_status` not `none` | 0 |
| `Item.dispute_type` non-blank | 162 of 237,689 items |
| `Item.dispute_pct_loss` not null and not 0 | 162 |

Every payload has `dispute_type`, `dispute_pct_loss`, and `source`. 95 also have `item_ids` and `dispute_description`. There is no credit amount column. The 7 POs are exactly the `processing_status=done` set: `TRGET-OL9-8K83`, `TRGET-OC3-C598`, `TRGET-O80-86PM`, `AMZ0N-OQL-CCP4`, `TRGET-O2R-1K40`, `C5TC0-OM1-A8R3`, `TRGET-O4U-QP68`. First `opened_at` is on those rows; none are resolved.

---

## 5. New register rows

Scope is the dev database as of 2026-09-23. Next free ids after PO-07. No `VEN-` row existed.

| ID | Stage | Issue | Scope | Affects | Handling | Rail | Status |
|---|---|---|---|---|---|---|---|
| PO-08 | in transit | `expected_delivery` is usually a copy of `delivered_date`, so it is not an ETA. `shipped_date` stays rare (PO-05). | 246 of 289 expected dates equal `delivered_date`. 230 of those 246 have no `shipped_date`. Last 120 days: 12 of 16 expected dates equal `delivered_date` (R-011). | Transit time | **flag** when they are equal or `shipped_date` is null. Do not treat `expected_delivery` as a forecast. | `mark-shipped` sets both dates, and nothing copies `delivered_date` into `expected_delivery`. | open |
| PO-09 | order | Amounts are never null, and `total_cost` always matches the component sum, but zeros stand in for unknown money. | Fees are 0 on 46 of 67 Amazon POs: 29 of 29 in 2024, 17 of 30 in 2025, 0 of 8 in 2026. Shipping is 0 with purchase > 0 on `WAL130984` and `CST525654`. The 42 all-zero POs are VEN-01. Sum mismatches: 0 of 349 (R-011). | Item cost, shipping history, recovery | **exclude** a 0 fee from a fee rate before 2026. **flag** a 0 shipping cost on a real vendor. **use** the sum as `total_cost`. | A fee and a shipping cost are required on a purchased PO. Amazon fees are already filled in 2026. | open |
| PO-10 | order | Listing `retail_value` and the manifest line total diverge. | Of 304 POs with lines: 25 within $0.02, 259 more within 1%, 5 within 5%, **15 off by more than 5%**. 45 POs have no lines. Worst: `WAL129206`, `WFR10979`, `NFMRT-ONV-61LA` (R-011). | Item cost (`compute_item_cost` uses `PO.retail_value`) | **flag** a gap over 5%. **use** `PO.retail_value` as the listing total (`models.py:307`). | On manifest save, show listing retail next to the line sum. | open |
| PO-11 | order | A few dates run backwards. | Paid before ordered: 1 (`C5TC0-OD7-3Q1L`, paid 2026-06-24, ordered 2026-06-26). Delivered before ordered: 8, all `complete`, ordered 2024-03-14 or 2024-03-16; those same 8 are delivered before paid. Delivered before shipped: 0 (R-011). | Durations | **flag**. **exclude** the 8 from any delivered-minus-ordered figure. | Reject a paid, shipped, or delivered date before `ordered_date`. | open |
| PO-12 | order | The manifest file, the manifest rows, and the items do not match status. | File on 34 of 349, and on 27 of 27 since 2026-05-26. Rows and no file: 270. No rows: 45 (delivered 40, all `GEN`; complete 4, including both `MIS`; ordered 1). No items: 7 (paid 4, shipped 1, ordered 1, complete 1 = `AMZ24714`) (R-011). | Pipeline and Need | **use** rows when the file is missing. **flag** a PO that is not paid/shipped/ordered and has no rows, and **flag** `AMZ24714`. | The file is already kept on new POs. A non-placeholder PO that is past shipped must have rows. | open |
| PO-13 | order | `item_count` is the manifest unit total, not the number of `Item` rows. | Equals `SUM(quantity)` on 281 of 349. Equals `Item` rows on 34 of 349. `item_count` 0 but items exist: 43. `item_count` > 0 and no items: 7 (R-011). | Any "how many items" figure | **use** `Item` rows for stock. **use** `item_count` only as manifest units, and **flag** when the two disagree. | Store manifest units separately. The processor already rewrites `item_count` from `Item` rows (`processing_finalize.py:560-564`). | open |
| PO-14 | disputes | Processing disputes are recorded and left open. Intake disputes are unused. There is no credit amount. | 162 `Dispute` rows, all `processing` / `open`, on the 7 POs with `processing_status=done`. Each has `subject_item` and `dispute_pct_loss`. 0 resolved. `intake_dispute_status` is `none` on all 349 (R-011). | Credit and the dispute rail | **use** as open processing disputes. Credit is **unknown**. | Resolve stores a credit. Intake uses the same `Dispute` model. | open |
| PO-15 | receiving | `receiving_status=done` without a completed `Receiving`. | 4 of 18 done POs. `receiving_done_at` is 04:59:59 UTC (`AMZ0N-OQL-CCP4`, `C5TC0-OM1-A8R3`, `TRGET-O4U-QP68`, `TRGET-O2R-1K40`). 3 of the 4 have no `Receiving` row. 14 sessions are completed, all on done POs (R-011). | Receiving duration | **exclude** these 4. **use** `Receiving.completed_at`. | `receiving_status=done` is set only in `receiving_complete` (`views.py:3233`). | open |
| VEN-01 | order | `GEN` and `MIS` are placeholders with real items and zero cost. | `GEN`: 40 POs, all `delivered`, all ordered 2025, 2,450 items, every money field 0, no manifest rows. `MIS`: `MISFIT-V1-2024` and `MISFIT-V2-2025`, both `complete`, 8,799 items, money 0, no manifest rows (R-011). | Vendor cost and recovery | **use** as "(placeholder)". **exclude** from vendor cost and from the shipping fit. | A purchased truck is not filed on `GEN` or `MIS`. | open |
| VEN-02 | order | One current-style order number is on the wrong vendor. | `TRGET-O7D-FRTF` is vendor `AMZ`, status `delivered` (R-011). | Per-vendor counts | **flag**. **fill** the vendor from a known order-number token (`TRGET` → `TRGET`). | The seller token on a new order number must match `Vendor.code`, or the map in section 3. | open |
