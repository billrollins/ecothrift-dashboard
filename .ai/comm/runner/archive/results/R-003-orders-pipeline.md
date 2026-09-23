# R-003 result · Orders pipeline: won through shelved

Read on 2026-09-23. PO window is `ordered_date >= 2026-05-26` (120 days). Queries: `workspace/runner/R-003/query.py` and `extra.py`.

## 1. PurchaseOrder stages

Model: `apps/inventory/models.py` `PurchaseOrder`.

### `status` (`models.py:67-88`)

| Value | Meaning in the app |
|---|---|
| `ordered` | Default on create (`models.py:88`). `revert-paid` sets this and clears `paid_date` (`apps/inventory/views.py:2556-2560`). |
| `paid` | `mark-paid` sets this and `paid_date` (`views.py:2546-2552`). |
| `shipped` | `mark-shipped` sets this, `shipped_date`, and optional `expected_delivery` (`views.py:2564-2572`). |
| `delivered` | Receiving complete calls `_finalize_purchase_order_deliver`, which sets this and `delivered_date` (`views.py:1515-1518`, `3225-3229`). |
| `processing` | Set when manifest items are created (`views.py:1508`) and on the processing paths at `views.py:5960` and `6053`. |
| `complete` | `mark-complete`, only when no items remain in `intake` or `processing` (`views.py:6134-6145`). |
| `cancelled` | A choice (`models.py:74`). No current view sets it. The serializer leaves `status` writable (`apps/inventory/serializers.py:459-514`). Two historical order numbers were cancelled in migration `0020`. |

### `preprocess_status` (`models.py:148-177`)

| Value | Meaning |
|---|---|
| `not_started` | Default. |
| `standardized` | Manifest standardize finished; `standardized_at` is set (`views.py:3594-3595`). |
| `cleaned` | AI cleanup completion (`apps/inventory/services/ai_cleanup.py:570-578`). |
| `reviewing` | A staff edit of preprocessing rows (`views.py:886-890`). |
| `finalized` | Finalize writes `ProcessingRow` bookmarks and `finalized_at` (`apps/inventory/services/processing_finalize.py:277-280`). |

### `receiving_status` (`models.py:155-181`)

| Value | Meaning |
|---|---|
| `not_started` | Default. |
| `active` | First edit of the receiving draft (`apps/inventory/services/receiving.py:76-84`). |
| `done` | Receiving is completed; `receiving_done_at` is set (`views.py:3231-3234`). |

### `processing_status` (`models.py:160-189`)

| Value | Meaning |
|---|---|
| `not_started` | Default. |
| `active` | A processing-data build starts (`processing_finalize.py:731-732`). |
| `done` | That build finishes (`processing_finalize.py:577-579`). |

Other status-like fields on the same model: `closeout_status` (only choice `open`, `models.py:165-203`), `intake_dispute_status` and `processing_dispute_status` (`none` / `active` / `resolved`, `models.py:168-211`).

### Dates (`models.py:89-93`, `183-191`, `214-218`)

| Field | What sets it |
|---|---|
| `ordered_date` | Required. Create defaults to today if omitted (`views.py:2542-2543`). |
| `paid_date` | `mark-paid`. Cleared by `revert-paid`. |
| `shipped_date` | `mark-shipped`. Cleared by `revert-shipped`. |
| `expected_delivery` | Optional on `mark-shipped`. |
| `delivered_date` | Receiving complete / deliver. |
| `receiving_started_at` | First receiving touch, or backfilled from the receiving row when it is marked done (`views.py:3231-3232`). |
| `receiving_done_at` | Receiving complete (`views.py:3234`). |
| `processing_started_at` | Build start (`processing_finalize.py:733-734`). |
| `processing_done_at` | Build finish (`processing_finalize.py:579`). |
| `standardized_at`, `ai_cleaned_at`, `review_saved_at`, `finalized_at` | The preprocess steps above. |
| `closed_at` | Column exists (`models.py:218`). No setter found in the views searched. |

## 2. POs ordered in the last 120 days

27 purchase orders. Grouped by (`status`, `processing_status`):

| status | processing_status | count | oldest ordered_date | sum retail_value |
|---|---|---:|---|---:|
| delivered | not_started | 22 | 2026-05-30 | 671673.71 |
| paid | not_started | 4 | 2026-09-15 | 79741.49 |
| shipped | not_started | 1 | 2026-06-30 | 15000.00 |

No row in this window is `ordered`, `processing`, `complete`, or `cancelled`, and none has `processing_status` other than `not_started`.

All-time, `processing_status = done` is 7 POs (all `status = delivered`). The other 342 are `not_started`, including 189 with `status = complete` and 62 with `status = processing`. The processing track is not what marks an order finished.

## 3. Category mix of open POs

"Open" here = ordered in the last 120 days, `processing_status != done`, `status != cancelled`. That is all 27.

**Line model.** `inventory.ManifestRow` (`models.py:372-463`), related name `manifest_rows`. The category string is `ManifestRow.category` (`models.py:459-463`). The help text calls it taxonomy v1, copied from preprocessing `final_category`. `PreprocessingRow.final_category` (`models.py:520`) and `ProcessingRow.category` (`models.py:753`) hold the same stage of the string. On these 27 orders the string is a B-Stock code, not a taxonomy v1 name.

Of 12,191 manifest rows on these POs: **0** have a category equal to a taxonomy v1 name, **1** is blank. Top codes by row count: `MIXED_LOTS` 1856, `MIXED_HOME_AND_GARDEN` 1599, `OFFICE_SUPPLIES` 970, `KITCHEN_AND_DINING` 771, `MIXED_HEALTH_AND_BEAUTY` 682, `OUTDOOR_LIVING_AND_GARDEN` 621, `TOYS` 599, `PET_SUPPLIES` 566.

Units by canonical category are not on the row as stored. `category_code_to_taxonomy` (`apps/buying/services/category_stats_sql.py:172-200`) maps a code when learned `CategoryMapping` rows agree (at least 2 votes and 60%); otherwise the units go to Mixed lots. Shelf items are different: their product category name is already a taxonomy v1 name (Apparel on the shelf is 6,113, which matches `CategoryStats.have_units`).

**0 of the 27 open POs have no manifest lines.**

Ten most recently ordered. Units are `SUM(quantity)` on `ManifestRow`. "Rows with a category" excludes a blank category.

| order_number | status | processing | rows | rows with category | top categories (units) |
|---|---|---|---:|---:|---|
| TRGET-O6G-PMPL | paid | not_started | 1140 | 1140 | MIXED_HEALTH_AND_BEAUTY 1345, PERSONAL_CARE 536, HAIR_CARE 481 |
| AMZ0N-O0N-VVGJ | paid | not_started | 150 | 150 | MIXED_BUILDING_AND_INDUSTRIAL 130, BUILDING_AND_HARDWARE 20 |
| TRGET-OQ4-T71L | paid | not_started | 164 | 164 | GAMING 520, MIXED_LOTS 67 |
| TRGET-OGG-9L2P | paid | not_started | 77 | 77 | HOME_DECOR 44, MIXED_HOME_AND_GARDEN 25, KIDS_FURNITURE 16 |
| TRGET-O99-4GL5 | delivered | not_started | 110 | 110 | MIXED_LOTS 100, HOME_DECOR 25 |
| C5TC0-OA3-D08P | delivered | not_started | 15 | 15 | VACUUMS 33 |
| TRGET-OVC-4JCU | delivered | not_started | 95 | 95 | HOME_DECOR 145, MIXED_FURNITURE 4 |
| C5TC0-O55-32NL | delivered | not_started | 127 | 127 | KITCHEN_AND_DINING 252, MIXED_SMALL_APPLIANCES 46, HOME_DECOR 12 |
| WLMRT-O99-8G11 | delivered | not_started | 1633 | 1633 | MIXED_LOTS 13317 |
| TRGET-ORD-G511 | delivered | not_started | 84 | 84 | MIXED_LOTS 54, PERSONAL_CARE 37, OUTDOOR_FURNITURE 18 |

Each of these also has a preprocessing row and a processing bookmark per manifest line, with `final_category` / `category` filled on the manifest-backed rows. `preprocess_status` is `finalized` on all ten. `processing_status` is still `not_started`.

## 4. Items not on the shelf

`Item` status choices, `apps/inventory/models.py:1783-1791`: `intake`, `processing`, `on_shelf`, `sold`, `returned`, `scrapped`, `lost`. Default `intake` (`models.py:1841`).

| status | count |
|---|---:|
| sold | 122617 |
| scrapped | 83506 |
| on_shelf | 31128 |
| intake | 290 |
| lost | 148 |
| processing | 0 |
| returned | 0 |

- **On the shelf:** `on_shelf`. Putting an item there sets `status`, `listed_at`, and `checked_in_at` together (`apps/inventory/processing_ops.py:1820-1822`).
- **In the building but not on the shelf:** `intake` and `processing`. That is the set Need v2 calls in-building (`category_stats_sql.py:144-145`). Dev count is 290, all `intake`.
- **Not that pipeline:** `sold` has left. `scrapped` and `lost` are off the shelf and are not in-building. `returned` is unused.

There is no category column on `Item`. The canonical category is `Product.category` → `Category.name` (`models.py:1554-1558`). The bucket SQL uses that first, then `ManifestRow.category` (`taxonomy_bucket_sql.py:31-39`).

## 5. Auction to PO

No field on `buying.Auction` points at `PurchaseOrder`, and none on `PurchaseOrder` points at `Auction` (`_meta` related models, both empty).

Of the 27 POs in the 120-day window, all 27 have a non-empty `description`. **20** have `description` exactly equal to some `Auction.title`. **20** match on the first 60 characters. The 60-character check adds no POs beyond the exact matches. **7** match neither way.

## 6. Won auctions

| Table | Count |
|---|---|
| `Outcome` | 0 (no win true, no win false) |
| `Bid` | 0 |
| `WatchlistEntry` status `watching` | 53 |
| `WatchlistEntry` `bidding` / `won` / `lost` / `passed` | 0 |

What writes them today:

- `WatchlistEntry`: the auction watchlist POST creates one with status `watching` (`apps/buying/api_views.py:553-558`). DELETE removes it (`api_views.py:564`). The watch poll updates `last_polled_at` only (`apps/buying/services/pipeline.py:541-543`). Nothing in app code sets `won`.
- `Outcome` and `Bid`: no `objects.create` / `objects.update` outside tests. Both are registered in Django admin (`apps/buying/admin.py:161-169`), so a manual admin row is possible. The manifest-pull test notes that nothing sets watchlist status to won (`apps/buying/tests/test_manifest_pull.py:833`).
