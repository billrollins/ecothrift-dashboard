# R-010 · Data quality: auctions, bids, outcomes
- **Runner:** Grok 4.7 · **Started:** 2026-09-23 13:18 CT · **Finished:** 2026-09-23 13:32 CT · **Status:** done

Read on the dev database, 2026-09-23 13:23–13:26 CT. Last-90-days cohort is rows created on or after 2026-06-25 13:23 CT. **Filled** means non-blank text, non-null numbers and timestamps, or a JSON value that is not `{}` or `[]`. For booleans the table shows how many are true. **First filled** is the earliest `created_at` of a row that holds the value now, unless a note gives the write timestamp instead.

This database's auction rows start 2026-04-11 (`created_at` and `first_seen_at`). Manifest rows start 2026-04-16.

The normal sweep maps a search listing in `apps/buying/services/listing_mapping.py:171-288` and upserts it in `apps/buying/services/sweep_upsert.py:17-62`, called from `apps/buying/services/pipeline.py:331`. A watch poll or a manual refresh writes the same listing columns plus a snapshot (`pipeline.py:401-427`, `535-540`, `584-588`).

---

## 1. Rails today

### Auction (`buying_auction`) — 17,432 rows; 10,767 created in the last 90 days

| Field | Set by | First filled | All-time | Last 90 days |
|---|---|---|---|---|
| `marketplace` | sweep upsert `sweep_upsert.py:97` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `external_id` | `listing_mapping.py:182-183` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `lot_id` | `listing_mapping.py:185-186` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `group_id` | `listing_mapping.py:188` | — | 0 | 0 |
| `auction_ext_id` | `listing_mapping.py:193-196` | 2026-04-11 | 17,426 (100.0%) | 10,767 (100%) |
| `seller_id` | `listing_mapping.py:190-191` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `title` | `listing_mapping.py:198` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `description` | `listing_mapping.py:199` | — | 0 | 0 |
| `url` | `listing_mapping.py:200-203` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `category` | `listing_mapping.py:204-210` | 2026-04-11 | 17,425 (100.0%) | 10,761 (99.9%) |
| `condition_summary` | `listing_mapping.py:211-213` | 2026-04-11 | 17,425 (100.0%) | 10,761 (99.9%) |
| `lot_size` | `listing_mapping.py:215` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `pallet_count` | `listing_mapping.py:216` (`pallet_count_from_listing`) | 2026-04-11 | 16,726 (95.9%) | 10,368 (96.3%) |
| `origin_city`, `origin_zip`, `shipment_type` | `listing_mapping.py:217-218` | **2026-09-23** (every filled row's `last_updated_at` is that day; the oldest such auction was created 2026-08-17) | 463 (2.7%) each, same rows | 463 (4.3%) |
| `listing_type` | `listing_mapping.py:220-221` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `total_retail_value` | `listing_mapping.py:223` | 2026-04-11 | 16,643 (95.5%); 0 are $0; 789 null | 10,370 (96.3%) |
| `current_price` | `listing_mapping.py:225-235` | 2026-04-11 | 17,426 (100.0%); 0 are $0; 6 null | 10,767 (100%) |
| `starting_price` | `listing_mapping.py:236-238` | 2026-04-16 | 54 (0.3%) | 0 |
| `buy_now_price` | `listing_mapping.py:239-241` | 2026-04-20 | 3 (0.0%) | 0 |
| `bid_count` | `listing_mapping.py:243` | 2026-04-11 | 17,426 (100.0%) | 10,767 (100%) |
| `time_remaining_seconds` | `listing_mapping.py:245-247` | — | 0 | 0 |
| `end_time` | `listing_mapping.py:249` | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `status` | `listing_mapping.py:251`; also `valuation.py:197-198` when a recompute sees a past `end_time` | 2026-04-11 | 17,432 (100%). `closed` 16,905; `open` 527; `closing` 0; `cancelled` 0 | 10,767 (100%) |
| `has_manifest` (column) | sweep: `listing_mapping.py:253-261` then `sweep_upsert.py:60`. Row save: `manifest_pull.py:297`, `manifest_upload.py:168`. Clear: `api_views.py:519`, prune `manifest_pull.py:962-964` | 2026-04-11 | true on 17,429. See AUC-07 | true on 10,766 |
| `first_seen_at`, `last_updated_at` | sweep `sweep_upsert.py:61-62` (`first_seen_at` kept on conflict) | 2026-04-11 | 17,432 (100%) | 10,767 (100%) |
| `ai_category_estimates` | `ai_title_category_estimate.py:269-270` | 2026-04-11 | 16,839 (96.6%) | 10,381 (96.4%) |
| `manifest_category_distribution` | `valuation.py:116-123` | 2026-04-16 | 65 (0.4%) | 40 (0.4%) |
| `shipping_quote`, `shipping_quote_at`, `shipping_quote_info` | `shipping_quote.py:27-31` | 2026-09-23 (`shipping_quote_at`) | 2 | 2 |
| `manifest_pulled_at` | `manifest_pull.py:298`, `manifest_upload.py:169` | 2026-04-16 | 65 | 40 |
| `manifest_source` | `manifest_pull.py:299` (`auto`), `manifest_upload.py:170` (`manual`) | 2026-04-16 | 64 (37 `auto`, 27 `manual`) | 40 |
| `manifest_pull_attempted_at` | `manifest_pull.py:384` | 2026-09-21 | 37 | 37 |
| `manifest_pull_error`, `manifest_pull_blocked` | `manifest_pull.py:534-537` | — | 0 | 0 |
| `need_score`, `priority`, `estimated_revenue`, `estimated_fees`, `estimated_shipping`, `estimated_total_cost`, `est_profit` | full recompute `valuation.py:365-387`; lightweight `valuation.py:421-431` | 2026-04-11 | 17,432 (100%). This means the job wrote a number, including 0 | 10,767 (100%) |
| `profitability_ratio` | same recompute | 2026-04-11 | 17,426 (the 6 with no price stay null) | 10,767 (100%) |
| `priority` not the default 50 | same, unless `priority_override` | 2026-04-11 | 16,220 (93.0%) | 10,195 (94.7%) |
| `priority_override` | `api_views.py:702-715` | — | 0 | 0 |
| overrides (`revenue`, `fees`, `shipping`, `shrinkage`, `profit_target`) | `api_views.py:680-716` | 2026-04-16 | 5, 13, 18, 9, 1 | 0, 0, 1, 0, 0 |
| `archived_at` | `api_views.py:751-755` | 2026-04-21 | 12 | 0 |
| `ai_score`, `ai_score_data` | sweep inserts `ai_score_data` as `{}` (`sweep_upsert.py:123`). Nothing writes `ai_score` | — | 0 | 0 |

`listing_type`: `SPOT` 17,267 (16,787 closed, 480 open); `CONTRACT` 165 (118 closed, 47 open).

`group_id`, `description`, and `time_remaining_seconds` are mapped from the search payload and have never been present on a saved row. Manifest pulls use `lot_id` (`manifest_pull.py:450-455`), so the empty `group_id` is not what blocks a pull.

### AuctionSnapshot — 177 rows; 2 in the last 90 days

Written only by the watch poll and the manual refresh (`pipeline.py:535-540` and `584-588`).

| Field | First filled | All-time | Last 90 days |
|---|---|---|---|
| `price` | 2026-04-16 | 177 (100%); 3 are $0 | 2 (100%) |
| `bid_count` | 2026-04-16 | 177 (100%) | 2 (100%) |
| `time_remaining_seconds` | — | 0 | 0 |
| `captured_at` | 2026-04-16 | 177. Latest capture **2026-07-06** | 2 |

64 auctions have at least one snapshot. All 53 watchlist auctions do. See AUC-14.

### ManifestRow (buying) — 31,904 rows; 17,458 created in the last 90 days

API rows: `manifest_pull.py:266-286` (`whole_numbers_are_cents=True`). CSV rows: `manifest_upload.py:146-164`. `fast_cat_value` is also filled later by `manifest_pull.py:320-322` and `ai_key_mapping.py:310-313`. `canonical_category` is a second column, written by `categorize_manifest.py:100-105`.

| Field | First filled | All-time | Last 90 days |
|---|---|---|---|
| `title`, `sku`, `quantity`, `fast_cat_key` | 2026-04-16 | 31,904 (100%) | 17,458 (100%) |
| `fast_cat_value` | 2026-04-16 | 31,788 (99.6%) | 17,370 (99.5%) |
| `category_confidence` | 2026-04-16 | 31,788 (99.6%), same rows as `fast_cat_value` | 17,370 (99.5%) |
| `canonical_category` | 2026-04-16 | 2,210 (6.9%), all on auction 523 | 0 |
| `retail_value` not null | 2026-04-16 | 31,893 (100.0%) | 17,458 (100%) |
| `retail_value` = 0 | 2026-09-23 | 202 (0.6%) | 202 (1.2%) |
| `retail_value` null | 2026-04-17 | 11 | 0 |
| `brand` | 2026-04-16 | 24,600 (77.1%) | 13,127 (75.2%) |
| `model` | 2026-04-16 | 5,526 (17.3%) | 2,037 (11.7%) |
| `upc` | 2026-04-16 | 28,437 (89.1%) | 15,433 (88.4%) |
| `condition` | 2026-04-16 | 30,392 (95.3%) | 17,458 (100%) |
| `manifest_template` (CSV) | 2026-04-16 | 16,725 (52.4%) | 2,279 (13.1%) |
| raw `_id` (API shape) | 2026-04-16 | 17,389 (54.5%) | 15,179 (86.9%) |

65 auctions have rows: 37 `manifest_source=auto`, 27 `manual`, 1 blank (auction 523, 2,210 rows, saved 2026-04-16). Auction 523's rows have both a template id and an API `_id`.

### CategoryMapping — 3,448 rows; 1,340 created in the last 90 days

| Field | Set by | First filled | All-time | Last 90 days |
|---|---|---|---|---|
| `source_key`, `canonical_category` | `ai_key_mapping.py:301-308`; also `categorize_manifest.py:189-196`, `seed_fast_cat_mappings.py:426-432`, `seed_category_mappings.py:49-55`, admin `admin.py:37` | 2026-04-16 | 3,448 (100%) | 1,340 (100%) |
| `rule_origin` | those writers | 2026-04-16 | `ai` 3,448; `seeded` 0; `manual` 0 | 1,340 `ai` |
| `ai_reasoning` | the AI writers | 2026-04-16 | 3,448 (100%) | 1,340 (100%) |

`source_key` is unique (`models.py:69-73`), so one full key has one category.

### WatchlistEntry — 53 rows; 0 added in the last 90 days

Created by `api_views.py:553-558` (`status=watching`). The poll writes only `last_polled_at` (`pipeline.py:541-543`). Admin can edit the row (`admin.py:148-158`). Nothing in app code sets `won`, `lost`, `bidding`, or `passed`.

| Field | First filled | All-time |
|---|---|---|
| `status` | 2026-04-21 | 53 `watching`; other statuses 0 |
| `priority` | 2026-04-21 | 53 `medium` |
| `notes` | — | 0 |
| `last_polled_at` | 2026-04-21 | 53. Latest poll **2026-05-27** |
| `added_at` | 2026-04-21 | through 2026-05-27 |

### Bid — 0 rows

Columns: `amount`, `strategy` (default `other`), `bid_time`, `was_winning`, `notes`, `created_at` (`models.py:875-889`). No app code creates a row. Django admin can (`admin.py:161-166`). First filled: none.

### Outcome — 0 rows

Columns: `hammer_price`, `fees`, `shipping_cost`, `total_cost`, `win` (default false), `margin_estimate`, `notes`, `captured_at`, `created_at` (`models.py:904-937`). No app code creates a row. Django admin can (`admin.py:168-180`). First filled: none.

### ManifestPullLog — 42 rows; 37 in the last 90 days

One writer: `manifest_pull.py:542-552`. All 42 have `success` true, `rows_downloaded` > 0, and a blank `error_message`. `used_socks5` is true on 5 (all 2026-04-16); the writer now saves false (`manifest_pull.py:549`). First row 2026-04-16, latest 2026-09-23.

### ManifestPullJob — 1 row, created 2026-09-23

| Field | Set by | This row |
|---|---|---|
| `requested_by`, `created_at` | `manifest_pull.py:893` | set |
| `status`, `runner`, `started_at`, `heartbeat_at` | claim `manifest_pull.py:665-669`; finish `624-629`; stop `908-911`; expire `581-586` | `done`, started and finished 2026-09-23 |
| `auction_ids`, `total` | `manifest_pull.py:734` | 40 |
| `results`, `done_count`, `ok_count` | `manifest_pull.py:782-786` | 40 done, 37 ok |
| `error` | finish / expire | blank |

The 3 not-ok results are skips: `No longer needs a pull.` No failed pull is stored on an auction (`manifest_pull_error` is empty everywhere).

---

## 2. Register rows AUC-01 to AUC-06

Live, here and below: `archived_at` is null, `status` in (`open`, `closing`), `end_time >= now`. Same set as `valuation.py:482-487`. At 13:23 CT that was **447** auctions.

| ID | Verdict | Fresh count |
|---|---|---|
| AUC-01 | **confirmed** | 27 POs with `ordered_date >= 2026-05-26` (the 120-day window; `buying_pipeline_max_age_days` is 120). 20 descriptions equal an `Auction.title` exactly. The first-60-characters check adds none. 0 blank descriptions. Status of the 27: `delivered` 22, `paid` 4, `shipped` 1. A 90-day window is 23 POs and 16 exact matches. Still no auction↔PO foreign key. |
| AUC-02 | **confirmed** | `Outcome` 0, `Bid` 0, watchlist `won` / `lost` / `bidding` / `passed` 0. Watchlist `watching` 53. |
| AUC-03 | **corrected** | 317 of 447 live auctions have no manifest mix and no AI mix. R-002's 357 of 487 was earlier the same day; the definition matches, the set has shrunk as auctions ended. Of the 447, 130 have `ai_category_estimates` and 17 have manifest rows. All 17 with rows also have an AI mix, so the 317 are the ones with neither. |
| AUC-04 | **confirmed** | `origin_city` 463 of 17,432, and the same 463 have `origin_zip` and `shipment_type`. `pallet_count` 16,726 of 17,432. Every origin row was last updated 2026-09-23. Shipment types on those 463: `LTL` 329, `Truckload` 107, `PARCEL` 27. |
| AUC-05 | **corrected** | List-shaped (`[`…) on **12,342** of 17,425 non-blank values. **5,083** are plain text (`Used Good` 2,664, `Used Fair` 1,124, `Like New` 492, `Brand New` 467, `Salvage` 304, and smaller). **7** blank. The detail chip compares the raw string (`frontend/src/components/buying/AuctionDetailsInfoCard.tsx:28-34`), so `['Used Good']` does not match `used good`. |
| AUC-06 | **corrected** | New API saves divide by 100 (`manifest_pull.py:266`). Of 17,389 rows with `attributes.unitRetail`, 15,842 are stored as dollars (`retail_value ≈ unitRetail / 100`). The rows still stored as the raw cent integer are **1,547, all on auction 523** (saved 2026-04-16): 1,547 of its 2,210 rows, for example `500` stored as `500.00` while `3500` on the same auction was stored as `35.00`. That auction's qty-weighted manifest retail is $66,394,033 against a listing retail of $96,167. The other 64 auctions that have rows are within 10% of listing retail. |

---

## 3. Checks asked for

**Duplicate auctions.** `lot_id` duplicates: **0** groups. `external_id` duplicates: **0**. Same lowercased title and same `end_time`: **43 groups, 91 rows**, all inside one marketplace, and every group has more than one `lot_id`. They are separate listings (different `external_id` and `lot_id`). The largest groups are term agreements that share a title and an end instant (four Target "1 Truckload of Furniture Every Other Week…" rows, each its own lot, `current_price` 13.00) and sister lots with the same short title (three Walmart "2 Pallet Spaces of Appliances…" at $242, $100, and $236). Not a duplicate-row issue.

**Prices of 0 or null on closed auctions.** `current_price = 0`: **0** on any status. `current_price` null: **6**, all `closed`, all Walmart, all missing `auction_ext_id`, all titled "Truckload (24 Pallet Spaces) of Toter 50-Gal Trash Cans", ended 2026-06-08 (3) and 2026-06-22 (3). Ids 115235, 115236, 115356, 146621, 146622, 146726. `total_retail_value` is null on 733 closed auctions and $0 on none. See AUC-13 and AUC-15.

**`status` against `end_time`.** At 13:26 CT, 85 auctions were `open` with `end_time` already past (`closing` is unused). **73** are not archived and all ended less than 6 hours ago. **0** non-archived auctions have been open for more than a day after `end_time`. **12** archived auctions (8 Target, 4 Walmart) ended 2026-04-21 and are still `open`. Those 12 are the entire archived set. See AUC-08.

**`total_retail_value` against manifest retail.** 65 auctions have buying `ManifestRow`s. Qty-weighted sum is `SUM(COALESCE(quantity, 1) * retail_value)`, the same product as `valuation.py:142-144`. 64 of 65 are within 10%. The one past 25% (and past 50×) is auction 523, the AUC-06 leftover.

**Manifest rows with no `fast_cat_value`, or retail 0 or null.** No `fast_cat_value`: **116 rows on 2 auctions** (none use the `__no_key__` sentinel). Retail 0: **202 rows on 13 auctions**, every one with API `unitRetail` 0, all created 2026-09-23. Retail null: **11 rows on 2 manual Walmart auctions** (auction 616 has 10, created 2026-04-17; auction 9929 has 1, created 2026-04-21). See AUC-09 and AUC-10.

**CategoryMapping conflicts.** Six pairs share the category text after the vendor prefix and disagree. Four are the same vendor's `-api-` key against its CSV key. Two are different vendors.

| Key | Category | Key | Category |
|---|---|---|---|
| `wal-api-arts-and-crafts-art-craft` | Home décor & lighting | `wal-arts-and-crafts-art-craft` | Office & school supplies |
| `wal-api-home-entertainment` | Kitchen & dining | `wal-home-entertainment` | Electronics |
| `wal-api-mixed-automotive-supplies-toys` | Books & media | `wal-mixed-automotive-supplies-toys` | Mixed lots & uncategorized |
| `wal-api-personal-care-health-beauty-electronics` | Health, beauty & personal care | `wal-personal-care-health-beauty-electronics` | Electronics |
| `tgt-storage-furniture` | Furniture | `wal-storage-furniture` | Storage & organization |
| `amz-building-and-hardware-home-improvement` | Home décor & lighting | `wal-building-and-hardware-home-improvement` | Tools & hardware |

See AUC-11.

**Marketplace gaps.** All 6 marketplaces are active and have a storefront id, a fee rate, and a shipping rate. `seller_id` matches the marketplace storefront on every auction (0 mismatches). Costco `requires_login` is true; the other five are false.

| Marketplace | Auctions | Live | Origin | Pallets > 0 | Retail > 0 | Condition list-shaped | Condition plain |
|---|---:|---:|---:|---:|---:|---:|---:|
| amazon | 2,305 | 16 | 15 | 2,267 | 2,261 | 1,395 | 910 |
| costco | 272 | 235 | 272 | 245 | 272 | 272 | 0 |
| homedepot | 1,890 | 27 | 27 | 1,742 | 1,332 | 1,320 | 569 |
| target | 8,124 | 96 | 70 | 8,058 | 8,058 | 5,662 | 2,462 |
| walmart | 4,478 | 43 | 53 | 4,388 | 4,397 | 3,441 | 1,036 |
| wayfair | 363 | 30 | 26 | 26 | 323 | 252 | 106 |

Costco's 272 auctions all have origin, zip, shipment type, and retail, because that seller's rows were loaded under the 2026-09-23 sweep. Home Depot is missing `total_retail_value` on 558 of 1,890. Wayfair has a pallet count on 26 of 363. See AUC-15. Condition encoding is AUC-05.

**Also seen, not given their own row.** `CONTRACT` `current_price` is a different scale from `SPOT`: median $13 (min $7, max $9,000) against a `SPOT` median of $1,051. 139 of 165 `CONTRACT` prices are under $100, including 42 of 47 live ones. The model calls `CONTRACT` term / percent-of-retail (`models.py:251-252`). Agreement titles in the duplicate-title check sit at $12 and $13. See AUC-12.

---

## 4. New register rows

| ID | Stage | Issue | Scope | Affects | Handling | Rail | Status |
|---|---|---|---|---|---|---|---|
| AUC-07 | auction | `Auction.has_manifest` is true when the sweep saw a `lot_id`, which is almost every row. The API ignores the column and checks for manifest rows (`serializers.py:94-98`). | Column true on 17,429 of 17,432. Rows exist on 65. 17,364 are true with no rows. 3 closed Target auctions are false and also have no rows (540, 565, 469386). As of 2026-09-23. | Any query on the column. Valuation reads it (`valuation.py:326-332`) and, with no rows, falls back to listing retail, so the dollar value is unaffected. | **exclude** the column. Use "has rows". | The sweep stops writing this flag (`listing_mapping.py:253-261`). Set it only when rows are saved. | open |
| AUC-08 | auction | Archived auctions stay `status=open` after `end_time`. Non-archived auctions that have ended are only the ones the sweep has not updated yet (all under 6 hours at this read). | 12 archived, all ended 2026-04-21 (Target 8, Walmart 4). 73 non-archived were open and already ended, all by less than 6 hours. `closing` is unused. As of 2026-09-23 13:26 CT. | Live counts, if archived rows are included. The live definition already requires `archived_at` null and `end_time >= now`. | **exclude** archived from live. The under-6-hour set is the gap until the next sweep. | Close from `end_time` when the listing drops out of search (`valuation.py:185-198` only runs for auctions the job still treats as live, `valuation.py:482-487`). | open |
| AUC-09 | auction | Buying manifest lines with retail 0. The API `unitRetail` is 0 on every one of them. | 202 rows, 13 auctions, all created 2026-09-23. Largest: auction 472738, 113 rows. Null retail is separate: 11 rows on 2 manual Walmart auctions from April (616, 9929). | Manifest retail, category mix (a $0 line adds no weight), the soft-delete signal in the buying plan. | **flag** $0 lines as soft-deleted. Leave them out of the retail sum (a 0 already adds nothing). Null retail: **unknown**. | Store the raw 0 and a deleted flag at pull time. | open |
| AUC-10 | auction | Buying manifest lines with a category key and no `fast_cat_value`. | 116 rows, 2 auctions. Auction 472244 (Target, auto, open): 88 rows, keys like `tgt-api-toys-xshot`. Auction 136845 (Walmart, manual, closed): 28 rows, mostly `wal-grills-grills-outdoor-cooking`. As of 2026-09-23. | Those lines' category. Valuation already treats a blank `fast_cat_value` as Mixed lots (`valuation.py:100-102`). | **fill** Mixed lots at valuation, and **flag** the unmapped key. | Map the key before the row is saved (`ai_key_mapping.py:301-313`). | open |
| AUC-11 | auction | The same category text maps to two taxonomy names: four Walmart API keys disagree with the Walmart CSV key, and two texts disagree across vendors. | 6 pairs out of 3,448 keys (table in section 3). All `rule_origin=ai`. As of 2026-09-23. | Category mix on those keys, and any vote that treats keys from two vendors as the same code. | **flag** the pair. Do not let one vendor's mapping stand for another. | One mapping per vendor prefix; the API key and the CSV key for the same text have to agree. | open |
| AUC-12 | auction | `CONTRACT` `current_price` is not on the same scale as `SPOT`. | 165 `CONTRACT` (47 open and not ended). Median price $13; 139 under $100; 42 of 47 live ones under $100. `SPOT` median $1,051. As of 2026-09-23. | Max bid, fees, and profit if a percent is added like a dollar hammer. | **flag** `CONTRACT`. **unknown** whether the 26 prices at $100 or more are dollars. | Store the unit (dollars or percent of retail) on the auction. | open |
| AUC-13 | auction | Closed auctions with no `current_price` and no `auction_ext_id`. | 6 Walmart auctions, one repeated title, ended 2026-06-08 and 2026-06-22. Ids in section 3. No `current_price` of 0 anywhere. As of 2026-09-23. | Price history and any average that skips nulls. | **unknown** (no price was captured). | The sweep stores the price it saw, including 0, and does not leave the column null. | open |
| AUC-14 | bids | Price history stopped. Snapshots are only written by the watch poll and the manual refresh. | 177 snapshots on 64 auctions, latest capture 2026-07-06. Watchlist `last_polled_at` latest 2026-05-27 (53 of 53 were polled at least once). As of 2026-09-23. | Price history on the wish list. | **use** the snapshots that exist. **unknown** after 2026-07-06. | The watch poll keeps writing snapshots until `end_time` (`pipeline.py:535-543`). | open |
| AUC-15 | auction | Coverage differs by marketplace, beyond origin (AUC-04) and condition (AUC-05). | Home Depot: `total_retail_value` null on 558 of 1,890. Wayfair: `pallet_count` on 26 of 363 (337 missing). Other sellers are over 95% on both. As of 2026-09-23. | Retail-based value for Home Depot. Wayfair shipping falls through to the rate × price fallback whenever pallets are missing. | Home Depot null retail: **unknown**. Wayfair missing pallets: **fill** with the rate × price path already in `valuation.py:242-245`. | The sweep keeps retail and pallets when the listing has them. | open |
