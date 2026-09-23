# R-009 · Data eras: find the database restarts and imports
- **Runner:** Grok 4.7 · **Started:** 2026-09-23 13:20 CT · **Status:** done · **Finished:** 2026-09-23 14:05 CT

Read-only on dev database `local_shared`, schema `ecothrift` (Django `search_path`). Months are `created_at` (or the stand-in named in the section) in America/Chicago. Percents are of that month's rows, one decimal. Scratch: `workspace/runner/R-009/` (`profile.py`, `followup.py`).

`django_migrations` for every app starts at **2026-03-30 00:43 UTC**. There is one V3 schema birth in this database. Older business dates are imports into that schema, not earlier `created_at` generations. Schema `public` has no tables. Schemas `darkhorse` and `finances` are other apps on the same server, not prior Eco-Thrift inventory databases.

---

## 1. Creation profile

Totals:

| Table | Rows | Min id | Max id | created_at (UTC) |
|---|---:|---:|---:|---|
| `inventory_item` | 237,689 | 146,864 | 405,381 | 2026-03-30 15:50 → 2026-09-22 18:53 |
| `inventory_product` | 200,079 | 1 | 268,892 | 2026-04-12 01:27 → 2026-09-22 18:30 |
| `inventory_purchaseorder` | 349 | 1 | 382 | 2026-04-12 01:23 → 2026-09-15 16:12 |
| `inventory_manifestrow` | 159,561 | 1 | 175,136 | no `created_at` (model ends at `apps/inventory/models.py:476`) |
| `pos_cart` | 75,931 | 4 | 182,533 | 2026-04-06 16:19 → 2026-09-22 18:54 |
| `buying_auction` | 17,432 | 1 | 473,323 | 2026-04-12 02:09 → 2026-09-23 17:16 |

`product_id` is required on `Item`, so that column is 100% in every month. `PurchaseOrder.ordered_date` is required, so that column is 100% in every month.

### `inventory_item` (by `created_at`)

| Month | Rows | Min id | Max id | sold_at | listed_at | checked_in_at | sold_for | retail | cost | PO | product |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2026-03 | 4,905 | 146,864 | 151,805 | 53.5 | 100 | 0 | 53.5 | 100 | 0 | 0 | 100 |
| 2026-04 | 188,931 | 151,806 | 340,764 | 54.3 | 2.7 | 0.5 | 54.3 | 99.9 | 91.6 | 97.3 | 100 |
| 2026-05 | 6,086 | 345,181 | 353,260 | 63.2 | 92.2 | 92.2 | 63.2 | 98.9 | 98.7 | 99.3 | 100 |
| 2026-06 | 10,888 | 353,261 | 378,056 | 59.4 | 99.3 | 99.3 | 59.4 | 98.9 | 98.9 | 99.4 | 100 |
| 2026-07 | 5,960 | 378,057 | 384,310 | 56.0 | 100 | 100 | 56.0 | 94.1 | 88.5 | 99.7 | 100 |
| 2026-08 | 12,598 | 384,311 | 397,027 | 20.1 | 100 | 100 | 20.1 | 99.8 | 98.9 | 99.9 | 100 |
| 2026-09 | 8,321 | 397,028 | 405,381 | 9.2 | 100 | 100 | 9.2 | 96.9 | 96.5 | 99.8 | 100 |

Flags:

- **April jump.** 188,931 rows, against 4,905 in March and 6,086 in May. **183,773 of them were inserted on 2026-04-12** (ids 156,313–340,086), in one `BACKFILL` load (section 2).
- **Leading id gap.** Ids 1–146,863 are absent (`min(id) - 1`). The completed backfill write-up says an earlier import of about 155k item rows was removed (`.ai/initiatives/_archived/_completed/data_backfill_initiative.md:14`). The delete is not a migration in this repo. Whether those 146,863 ids are that import is **UNKNOWN** (the counts are close, not equal).
- **Internal id holes** (gap = missing ids between two surviving ids): 353,263→365,710 (12,446), 340,764→345,181 (4,416, the April-to-May boundary), 374,996→376,347 (1,350), 345,260→346,256 (995), 349,315→349,938 (622), 346,256→346,634 (377), 383,060→383,311 (250). 20,829 ids are missing inside 146,864–405,381.
- March rows are the retag cohort (section 2): `listed_at` and `retail` filled, `cost`, `checked_in_at`, and `purchase_order_id` empty. `sold_for` is filled exactly when `sold_at` is.
- From May 2026, `listed_at` and `checked_in_at` are both above 92%. July `cost` dips to 88.5%. August and September `sold_at` percents are low because those items are still on the shelf (August created: 9,848 on shelf, 2,749 sold).

Days with at least 2,000 item inserts: 2026-03-30 (2,344), 03-31 (2,561), 04-01 (2,897), **04-12 (183,773)**, 05-06 (2,063), 05-18 (2,933), 06-20 (2,022), 06-22 (2,328), 08-13 (3,167), 09-14 (2,446). No `created_at` timestamp is shared by 500 or more rows.

### `inventory_product` (by `created_at`)

| Month | Rows | Min id | Max id |
|---|---:|---:|---:|
| 2026-04 | 184,564 | 1 | 249,444 |
| 2026-05 | 174 | 249,445 | 249,987 |
| 2026-06 | 10,352 | 253,459 | 263,848 |
| 2026-07 | 2,800 | 263,849 | 266,660 |
| 2026-08 | 1,390 | 266,661 | 268,086 |
| 2026-09 | 799 | 268,087 | 268,892 |

Flags: April is 92% of all products. May drops to 174. Id hole 249,508→249,878 (369) inside May, then **249,987→253,459 (3,471)** between May and June. `Product.description` was removed (`apps/inventory/migrations/0062_canonical_product_categories_drop_descriptions.py:199`), and that column was where phase 2 stored `BACKFILL:` tags. `specifications`, `tags`, and `identifiers` now contain the text `BACKFILL` on **0** products. The 9,200 retag items (created before 2026-04-12) point at 4,235 products whose `created_at` starts **2026-04-12 01:45 UTC**. Those product rows were attached on or after the backfill, so product `created_at` does not date the March retag.

### `inventory_purchaseorder` (by `created_at`)

| Month | Rows | Min id | Max id | ordered_date | delivered_date | purchase_cost | shipping_cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2026-04 | 316 | 1 | 316 | 100 | 99.1 | 100 | 100 |
| 2026-05 | 6 | 317 | 322 | 100 | 100 | 100 | 100 |
| 2026-06 | 7 | 323 | 361 | 100 | 100 | 100 | 100 |
| 2026-07 | 11 | 362 | 373 | 100 | 90.9 | 100 | 100 |
| 2026-08 | 5 | 374 | 378 | 100 | 100 | 100 | 100 |
| 2026-09 | 4 | 379 | 382 | 100 | 0 | 100 | 100 |

Flags:

- **April jump:** 316 rows, then a handful a month. 315 of the April rows have `notes` starting `BACKFILL:`. Their `ordered_date` runs **2024-03-01 through 2026-04-21**, while `created_at` is a few minutes on 2026-04-12. 313 have `uses_legacy_processing`.
- **Id hole 323→356 (32 ids)** inside the June span (7 rows, ids 323–361).
- By `ordered_date` (the business date), backfill POs are 2024-03 through 2025-06 (211 rows, tag `BACKFILL:v1`) and 2025-08 through 2025-12 (104 rows, tag `BACKFILL:v2`). **No PO has `ordered_date` in 2025-07.** Native POs (blank notes, 33 rows, plus 1 other) have `ordered_date` from 2026-04-21 through 2026-09-15.
- `delivered_date` is filled on the imported POs and on most later ones. September 2026 is 0 of 4. Treat it the way PO-02 already does: it is set far too often to mean "truck arrived."

### `inventory_manifestrow` (no `created_at`; month is the parent PO's `created_at`)

| PO created month | Rows | Min id | Max id | Notes `BACKFILL:` |
|---|---:|---:|---:|---:|
| 2026-04 | 144,904 | 1 | 159,516 | 143,968 |
| 2026-05 | 2,466 | 156,591 | 162,186 | 0 |
| 2026-06 | 2,925 | 162,931 | 165,870 | 0 |
| 2026-07 | 5,755 | 165,871 | 171,625 | 0 |
| 2026-08 | 1,980 | 171,626 | 173,605 | 0 |
| 2026-09 | 1,531 | 173,606 | 175,136 | 0 |

Flags: April is the import (143,968 `BACKFILL:` notes: 107,638 `v1`, 36,330 `v2`). Id hole **143,968→156,591 (12,622)**, then smaller holes 1,924 and 744. May's min id (156,591) is below April's max (159,516), so the two months' ids are interleaved. 10,245 rows have blank notes; 5,348 have other notes.

### `pos_cart` (by `created_at`)

| Month | Rows | Min id | Max id | `completed_at` filled | On register `BACKFILL` |
|---|---:|---:|---:|---:|---:|
| 2026-04 | 70,005 | 4 | 176,544 | 100.0% (69,987) | 69,326 |
| 2026-05 | 1,038 | 176,545 | 177,582 | 97.4% | 0 |
| 2026-06 | 1,064 | 177,583 | 178,678 | 98.7% | 0 |
| 2026-07 | 1,592 | 178,679 | 180,270 | 99.6% | 0 |
| 2026-08 | 1,313 | 180,271 | 181,614 | 99.5% | 0 |
| 2026-09 | 919 | 181,615 | 182,533 | 99.5% | 0 |

Flags: April is the import plus the first native carts. Register `BACKFILL` / "Backfill Register" holds **69,326 carts, all created 2026-04-12 06:46–07:41 UTC** (about one hour). Register `REG-01` holds the other 6,605 carts, from 2026-04-06 16:19 UTC through 2026-09-22. `REG-02` has 0 carts. Id hole **214→106,751 (106,536)**; ids 1–3 are also absent. Cart has no notes field (`apps/inventory/management/commands/backfill_phase4_sales.py:10`).

The legacy completed-sale table is `pos_historicaltransaction` (no `created_at`; keyed by `sale_date`). It has 69,362 rows: **53,304 `source_db=db1`** and **16,058 `source_db=db2`**. db2 occupies ids 1–16,058 (loaded first); db1 occupies 16,059–69,362. Month counts are in `historical_txn_by_sale_month.csv`. Year totals:

| Source | Sale dates | Carts |
|---|---|---:|
| db1 | 2023-02 → 2023-12 | 7,333 |
| db1 | 2024-01 → 2024-12 | 24,682 |
| db1 | 2025-01 → 2025-07 | 21,253 |
| db1 | `sale_date` in year 9999 (36 rows, month 9999-12) | 36 |
| db2 | 2025-08 → 2025-12 | 13,174 |
| db2 | 2026-01 → 2026-03 | 2,884 |

### `buying_auction` (by `created_at`)

| Month | Rows | Min id | Max id |
|---|---:|---:|---:|
| 2026-04 | 1,924 | 1 | 39,021 |
| 2026-05 | 2,358 | 41,055 | 107,626 |
| 2026-06 | 2,938 | 109,129 | 191,615 |
| 2026-07 | 3,591 | 193,925 | 293,211 |
| 2026-08 | 3,687 | 295,090 | 396,423 |
| 2026-09 | 2,934 | 398,461 | 473,323 |

`end_time` and `first_seen_at` are filled on every row. The buying app's first migration is 2026-04-12 01:21 UTC. No auction `created_at` is earlier. The id space is sparse: **455,891 missing ids** between 1 and 473,323. The largest holes are about 2,400–3,200 ids and they repeat (25 holes over 2,000). That matches sweep churn (insert, drop, sequence keeps climbing), not a second database. `end_time` in the April cohort already runs out to 2026-12-02, so `end_time` is the listing's end, not the row's insert.

---

## 2. Import markers

### Note and description prefixes (counts on this database)

| Where | Tag | Rows |
|---|---|---:|
| `inventory_item.notes` | `BACKFILL:v1:` | 123,942 |
| `inventory_item.notes` | `BACKFILL:v2:` | 59,843 |
| `inventory_item.notes` | `RETAGGED_FROM_DB2:` | 9,200 |
| `inventory_item.notes` | blank | 40,674 |
| `inventory_item.notes` | any other text | 4,030 |
| `inventory_item.notes` | `HISTORICAL:` | 0 |
| `inventory_purchaseorder.notes` | `BACKFILL:v1:` | 211 |
| `inventory_purchaseorder.notes` | `BACKFILL:v2:` | 104 |
| `inventory_purchaseorder.notes` | blank | 33 |
| `inventory_purchaseorder.notes` | other | 1 |
| `inventory_purchaseorder.notes` | contains `misfit` (inside a `BACKFILL:` tag) | 2 |
| `inventory_manifestrow.notes` | `BACKFILL:v1:` | 107,638 |
| `inventory_manifestrow.notes` | `BACKFILL:v2:` | 36,330 |
| `inventory_manifestrow.notes` | blank | 10,245 |
| `inventory_manifestrow.notes` | other | 5,348 |
| `inventory_product` | text `BACKFILL` in specs, tags, or identifiers | 0 |

Tag shapes in code: `BACKFILL:v1:{legacy_id}` and `BACKFILL:v2:{legacy_id}` (`apps/inventory/management/commands/backfill_phase1_vendors_pos.py:206`). V2 PO notes can continue with legacy text and a JSON line (`:210`). Item sales tags are the same prefixes (`backfill_phase3_items.py:7`, `backfill_phase4_sales.py:40`).

`RETAGGED_FROM_DB2:{legacy sku}` is the other item prefix. Nothing in the current management commands writes it. The only reader in app code is `apps/inventory/migrations/0021_retag_category_inheritance.py:11`, which copies a category onto on-shelf rows with that prefix. Those 9,200 rows were inserted **2026-03-30 through 2026-04-11** (9,138 of them before 2026-04-12; 62 later). On the days before April 12 they are almost the whole insert: March 30 is 2,344 of 2,344, April 1 is 2,897 of 2,897. `listed_at` on these rows is 0.0002–0.7 seconds before `created_at` (median 0.0003 s), so that pair is one insert, not a historical shelf date. They have retail and a product, and **no PO, no cost** (63 have `checked_in_at`). The backfill initiative says these retag rows were the live V3 stock to keep when the earlier import was removed.

The largest other item-note token is the word `Walmart` (3,023 rows). Remaining other notes are free text, not a generation tag.

`HISTORICAL:db1` / `HISTORICAL:db2` is what `import_historical_sold` writes (`apps/inventory/management/commands/import_historical_sold.py:17`). **Zero items** have it. The rows that exist use `BACKFILL:` instead.

Status `scrapped`: 59,874 `BACKFILL:v1`, 23,617 `BACKFILL:v2`, 15 other (83,506). That is the April 12 insert (April's created-month status mix is 83,491 scrapped). V1 items with no `sold_at`: 59,896. V2 items with no `sold_at`: 23,622. The scrapped counts match the unsold imported items within a few dozen rows. What the old system meant by that status is **UNKNOWN**.

By tag, field fill on items:

| Tag | Rows | sold_at | sold_for | listed_at | checked_in_at | cost | retail | PO |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `BACKFILL:v1` | 123,942 | 64,046 | 64,046 | 1 | 1 | 120,958 | 123,936 | 123,942 |
| `BACKFILL:v2` | 59,843 | 36,221 | 36,221 | 11 | 11 | 52,171 | 59,843 | 59,843 |
| `RETAGGED_FROM_DB2` | 9,200 | 4,524 | 4,524 | 9,200 | 63 | 0 | 9,199 | 0 |
| other | 44,704 | 17,429 | 17,429 | 44,154 | 44,154 | 42,542 | 43,627 | 43,683 |

`sold_for` is filled on every row that has `sold_at`, including V1. The phase 3 docstring says V1 `sold_for` was left null (`backfill_phase3_items.py:4`). Phase 4 is what writes the sale (`backfill_phase4_sales.py:8`). The stored rows follow phase 4.

`BACKFILL:v1` sales (`sold_at`): **2024-03-18 → 2025-07-27** (37,244 in 2024, 26,800 in 2025), plus 2 rows with `sold_at` in August 2026. Those two were inserted 2026-04-12 and one of them has `created_at` 2026-08-27. **UNKNOWN** why those two carry a V1 tag and a 2026 sale.

`BACKFILL:v2` sales: **2025-08-23 → 2026-09-18** (29,590 in 2025, 6,631 in 2026). Most of those rows were inserted 2026-04-12 05:47 UTC; a few `BACKFILL:v2` rows were inserted later (4 in May, 4 in July, 1 in August, 2 in September). Sales after the import are later updates of `sold_at` on rows that kept the tag, plus those few new tagged rows.

### Management commands (import, backfill, or legacy in the name)

Generation loads (read `ecothrift_v1` / `ecothrift_v2` or DB1/DB2, write V3):

| Command | Line | What it loads |
|---|---|---|
| `apps/inventory/management/commands/setup_misfit_backfill_pos.py` | 1 | Misfit vendor and two catch-all POs (`BACKFILL:v1:misfit`, `BACKFILL:v2:misfit`) |
| `apps/inventory/management/commands/backfill_phase1_vendors_pos.py` | 1 | V1/V2 vendors and purchase orders. Skips the misfit order numbers (`:29`) |
| `apps/inventory/management/commands/backfill_phase2_products_manifests.py` | 1 | V1/V2 products and manifest rows. Docstring recon: ~140.6k + ~41.5k products, ~107.7k + ~36.3k manifest rows (`:7`) |
| `apps/inventory/management/commands/backfill_phase3_items.py` | 1 | V1/V2 items. Idempotent on `BACKFILL:v1:{code}` / `BACKFILL:v2:{id}` (`:7`) |
| `apps/inventory/management/commands/backfill_phase4_sales.py` | 1 | V1/V2 carts and cart lines onto register code `BACKFILL` |
| `apps/inventory/management/commands/backfill_phase5_categories.py` | 1 | Taxonomy onto existing `BACKFILL` items and products; recomputes `PricingRule`. Not a new row load |
| `apps/inventory/management/commands/import_historical_sold.py` | 1 | Sold items from DB1/DB2 into `Item`, notes `HISTORICAL:db1` / `HISTORICAL:db2`. Expected ~34,762 DB2 and ~50k DB1 (`:13`). **0 such notes now** |
| `apps/inventory/management/commands/import_historical_transactions.py` | 1 | DB1/DB2 completed carts into `HistoricalTransaction`. Expected ~53,304 DB1 and ~16,275 DB2 (`:11`). Stored counts are 53,304 and 16,058 |
| `apps/inventory/management/commands/import_legacy_data.py` | 1 | Skeleton. Status at `:23`: waiting on a schema review, not a finished loader |
| `apps/inventory/management/commands/build_legacy_checkin_queue.py` | 1 | One PO at a time: items from that PO's manifest rows, only when `uses_legacy_processing` |

Same-name commands that rewrite fields already in V3, not a generation import: `backfill_categories.py:1` (classify products), `backfill_search_text.py:1`, `backfill_receiving_photo_thumbnails.py:1`, `backfill_preprocessing_final_snapshots.py:1`, `apps/routines/management/commands/backfill_section_observations.py:6`, `apps/webstore/management/commands/backfill_listing_image_variants.py:1`. `recompute_all_item_costs.py:1` recomputes `Item.cost` from the PO formula.

The backfill initiative (completed 2026-04-11) states the business eras the commands were built for: **V1 Mar 2024–Jul 2025, V2 Aug 2025–Mar 2026, V3 live for about four days** at that writing (`.ai/initiatives/_archived/_completed/data_backfill_initiative.md:16`). The row dates below match that, with the cart-level V1 history starting earlier (2023-02).

### Migrations that load data

No migration inserts the V1/V2 dump. That load is the commands above. Migrations that exist for the import:

| Migration | Line | What it does |
|---|---|---|
| `apps/inventory/migrations/0009_add_temp_legacy_item_and_historical_transaction.py` | 18 | Creates `TempLegacyItem` (`source_db` db1/db2). Dropped later |
| `apps/inventory/migrations/0015_remove_retag_scaffolding_and_cleanup_generation.py` | 18 | Removes `TempLegacyItem`. Table is gone |
| `apps/pos/migrations/0003_add_temp_legacy_item_and_historical_transaction.py` | 13 | Creates `HistoricalTransaction`. Rows come from `import_historical_transactions`, not from this migration |
| `apps/inventory/migrations/0021_retag_category_inheritance.py` | 5 | Reads `RETAGGED_FROM_DB2:` and copies a category. Does not insert the retag rows |
| `apps/inventory/migrations/0062_canonical_product_categories_drop_descriptions.py` | 199 | Drops `Product.description`, the phase 2 tag column |

Other `RunPython` migrations seed settings or copy columns on rows already in V3 (category seeds, PO vendor cache, receiving timestamps, and similar). They are not generation loads.

### What the two pending initiatives say about V1, V2, and V3

`historical_data_export.md` (paused 2026-03-28) does **not** use the names V1/V2/V3 for the sources. It calls them **DB1** and **DB2**:

- Phase 1 done: extract DB1 + DB2 to pickles. Phase 2, seeding V3, was still pending (`:10`).
- **DB2 (Production),** 84 tables (`:40`): `inventory_product` has no category column; category text is on `inventory_manifest_rows` (~36k rows); ~59k items, ~35k sold in the DB2 era.
- **DB1 (Old Production),** 58 tables (`:45`): category on `product_attrs` (~153k rows) and on `manifest` lines (~108k rows); sales via `cart` / `cart_line`.
- Phase 2's goal was a clean V3 operational database plus a 2025–2026 reporting slice, not a full clone (`:24`).

That file is older than the April 12 backfill. The commands and the row tags are the seed it still lists as pending.

`historical_sell_through_analysis.md` (paused 2026-04-10) does use three generations (`:22`): sell-through "lives across three database generations (V1, V2, and V3)". It says V1 and V2 are frozen (`:51`), names the databases `ecothrift_v1`, `ecothrift_v2`, and `ecothrift_v3` (`:16`), and planned schema docs that are not in `.ai/extended/databases/`. Its delivered piece is a PO extract, not a loaded era map. `.ai/extended/databases.md:11` is the naming key that ties those labels together: DB1 = V1 = `ecothrift_v1`, DB2 = V2 = `ecothrift_v2`, this app = V3.

---

## 3. Time that runs backwards

`listed_at > sold_at` is **0 items** in every month (0 of 21,859 items that have both timestamps; the other 21,859 have `listed_at` on or before `sold_at`).

`sold_at < created_at` is **100,191 items**, all with `created_at` in April 2026. That is the import writing `created_at` at load time and keeping the old sale timestamp.

By `created_at` month:

| Month | Rows | sold_at before created_at | listed_at after sold_at | Rows with sold_at |
|---|---:|---:|---:|---:|
| 2026-03 | 4,905 | 0 | 0 | 2,626 |
| 2026-04 | 188,931 | 100,191 | 0 | 102,638 |
| 2026-05 | 6,086 | 0 | 0 | 3,846 |
| 2026-06 | 10,888 | 0 | 0 | 6,468 |
| 2026-07 | 5,960 | 0 | 0 | 3,337 |
| 2026-08 | 12,598 | 0 | 0 | 2,537 |
| 2026-09 | 8,321 | 0 | 0 | 768 |

By `sold_at` month (every pre-April-2026 month is entirely "sold before the row existed"):

| Sold month | With sold_at | sold before created | listed after sold |
|---|---:|---:|---:|
| 2024-03 | 258 | 258 | 0 |
| 2024-04 | 1,583 | 1,583 | 0 |
| 2024-05 | 2,833 | 2,833 | 0 |
| 2024-06 | 5,452 | 5,452 | 0 |
| 2024-07 | 5,446 | 5,446 | 0 |
| 2024-08 | 4,627 | 4,627 | 0 |
| 2024-09 | 4,415 | 4,415 | 0 |
| 2024-10 | 3,360 | 3,360 | 0 |
| 2024-11 | 4,263 | 4,263 | 0 |
| 2024-12 | 5,007 | 5,007 | 0 |
| 2025-01 | 3,579 | 3,579 | 0 |
| 2025-02 | 2,814 | 2,814 | 0 |
| 2025-03 | 3,610 | 3,610 | 0 |
| 2025-04 | 4,063 | 4,063 | 0 |
| 2025-05 | 5,147 | 5,147 | 0 |
| 2025-06 | 4,439 | 4,439 | 0 |
| 2025-07 | 3,148 | 3,148 | 0 |
| 2025-08 | 909 | 909 | 0 |
| 2025-09 | 4,044 | 4,044 | 0 |
| 2025-10 | 10,995 | 10,995 | 0 |
| 2025-11 | 8,214 | 8,214 | 0 |
| 2025-12 | 5,428 | 5,428 | 0 |
| 2026-01 | 2,194 | 2,194 | 0 |
| 2026-02 | 2,749 | 2,749 | 0 |
| 2026-03 | 1,614 | 1,614 | 0 |
| 2026-04 | 1,552 | 0 | 0 |
| 2026-05 | 2,574 | 0 | 0 |
| 2026-06 | 4,470 | 0 | 0 |
| 2026-07 | 6,044 | 0 | 0 |
| 2026-08 | 4,041 | 0 | 0 |
| 2026-09 | 3,348 | 0 | 0 |

The stamp flips at **sold month 2026-04**: from there on, `sold_at` is on or after `created_at`. March 2026 *sales* (1,614) are still imported history. March 2026 *inserts* (the retag) are not: their sales fall on or after 2026-04-06.

2025-08 is a thin month (909 sales) between July (3,148) and September (4,044). That is the V1/V2 handoff, not a `created_at` glitch.

---

## 4. Era table

Dates are the business dates on the rows. "Loaded" is when this V3 database received them. Trust is for the fields this task measured.

| Era | Date range | Source | Tables | Trust |
|---|---|---|---|---|
| V1 carts, before item sales | Sale dates **2023-02 → 2024-02** | Legacy import. `pos_historicaltransaction.source_db=db1`, loaded with db2 (ids show db2 first). Item `sold_at` does not reach these months | `pos_historicaltransaction` only | Cart totals and `sale_date` are the record. No matching `Item.sold_at`. 36 db1 rows have `sale_date` in year 9999; exclude those |
| V1 operations | Items sold **2024-03-18 → 2025-07-27**. POs ordered **2024-03-01 → 2025-06-22**. Carts through **2025-07** | Legacy import, tag `BACKFILL:v1`. Inserted **2026-04-12** (POs ~01:23 UTC, items ~05:46 UTC, `pos_cart` on register `BACKFILL` ~06:46–07:41 UTC) | PO, manifest row, product, item, `pos_cart`, `pos_historicaltransaction` | **Use** `sold_at` and `sold_for` as the sale (they are paired). **Use** `ordered_date` as the PO date. **Do not use** `created_at` for timing: it is the load. **Do not use** `listed_at` or `checked_in_at` (1 row each). **Cost is filled** (120,958 of 123,942) by the PO allocation; a bad backfill `retail_value` inflates it (`CHANGELOG.md` note on `PurchaseOrder.retail_value` vs `BACKFILL` notes). **Retail** is filled. **PO link** is filled. `status=scrapped` (59,874) lines up with "no sold_at"; the old meaning is **UNKNOWN**. Product rows have no remaining `BACKFILL` tag; April 2026 `created_at` is the marker, and it also covers products later attached to retag items |
| Handoff | **2025-07-28 → 2025-08-22** | **UNKNOWN** | Items, POs | No item `sold_at` in this window (last V1 sale 2025-07-27, first V2 sale 2025-08-23). No PO `ordered_date` in 2025-07. V1 carts still include July 2025 (1,950). V2 carts start 2025-08. Whether the floor was quiet or the export cut here is **UNKNOWN** |
| V2 operations | Items sold **2025-08-23 → 2026-03** (tag still on some sales through 2026-09-18). POs ordered **2025-08-01 → 2025-12-29**. Carts **2025-08 → 2026-03** | Legacy import, tag `BACKFILL:v2`, same 2026-04-12 load | Same tables as V1 | Same trust rules as V1. Cost filled on 52,171 of 59,843 (87%). `listed_at` / `checked_in_at` empty (11 rows). A sale after 2026-04-12 on a `BACKFILL:v2` row can be a real later V3 sale that kept the old note; `created_at` is still the April load unless the row's own `created_at` is later (11 such item rows) |
| V3 open and retag | Schema **2026-03-30**. Retag inserts **2026-03-30 → 2026-04-11**. First native cart **2026-04-06** | Native app. Notes `RETAGGED_FROM_DB2:`. Writer of that prefix is not in the current commands | `inventory_item`, then `pos_cart` on `REG-01` | **Use** `created_at` and `listed_at` as the retag moment (they match within a second). **Use** `sold_at` / `sold_for` when the sale is on or after 2026-04-06. **Cost and PO are empty.** Retail is filled. These are shelf units carried over, not a full V2 history |
| V3 native | Sales **from 2026-04** (`sold_at` on or after `created_at`). POs ordered **from 2026-04-21**. `checked_in_at` common **from May 2026 creates** (92%+) | Native app. Blank notes, register `REG-01`, `uses_legacy_processing` false | All six tables, plus auctions from 2026-04-12 | **Use** `created_at`, `sold_at`, `sold_for`, `listed_at`, `checked_in_at`, `cost`, `retail`, PO link. April 2026 *creates* are still mostly the import; split April on the `BACKFILL:` tag or on register `BACKFILL`, not on the calendar month. Auction `created_at` / `end_time` / `first_seen_at` are native sweep fields. Auction ids are sparse from deletes during sweeps, not from a restart |

Three generations, one current database: V1 and V2 survive as tagged rows and as `pos_historicaltransaction`, loaded on 2026-04-12. V3's own schema starts 2026-03-30. The restart boundaries are those business-date cuts, not three `created_at` cliffs.
