<!-- Last updated: 2026-09-23 (merged runner recon R-009 to R-013; eras mapped; decisions recorded) -->
# Data quality: register, handling, and rails

Eco-Thrift has run for 4+ years, through at least 3 database restarts and many workflow changes. The data is not clean, and it never will be all at once: new, better data keeps arriving on top of old, messy data. This file is how we live with that.

Initiative: [`data_quality_rails`](../initiatives/data_quality_rails.md).

---

## Rules (every report, metric, feature and phase)

1. **Name the issues.** Before building on data, list the register IDs below that touch it. A phase or report with no data-quality note is not done.
2. **Use imperfect data by default.** Keep rows and label them, for example "Mixed lots", "(no PO)" or "unknown". Exclude only when a row would mislead more than it informs (a negative duration, a stale PO that was never closed), and write down the rule.
3. **Say what was filled in.** Every fill-in (a default, a mapping, a cutoff, a neutral 50) is written here with its rule, and shown where the number is shown ("filled in: no category mix, Need 50").
4. **Show coverage.** Next to a metric, say how much of the data backs it: "days to sell: 40% of sold items have a shelf date".
5. **Rails before cleanup.** First stop new bad data at the stage where it starts. Then fix old data, reversibly and with a log.
6. **Newer eras win ties.** When eras disagree, weight or segment by era (see **Eras**) rather than drop the old one.

**Handling words:** **use** (as is) · **fill** (fill it in by a stated rule) · **flag** (use it, but mark it in the UI) · **exclude** (leave it out by a stated rule) · **unknown** (don't guess; show it as unknown).

**Status words:** **open** (not handled) · **handled** (the rule is in code) · **railed** (new data can't break it again) · **fixed** (old data corrected too).

---

## The lifecycle and its rails

The rail is what must be captured at each stage so the next stage can trust it. "Today" is filled in from runner recon (R-010 to R-013).

| # | Stage | Record | Must capture (rail) | Today |
|---|---|---|---|---|
| 1 | Auction | `buying.Auction` | Listing id, lot id, seller, pallets, origin, shipment type, price history, end time | Good since 2026-09-23. Origin and shipment type only on new sweeps (AUC-04). |
| 2 | Bids | `buying.Bid` | Our max bid and time | Unused (AUC-02) |
| 3 | Won / lost | `buying.Outcome` | Won yes/no, hammer price, fees, shipping | Unused (AUC-02) |
| 4 | Order | `inventory.PurchaseOrder` | A link to the auction, vendor, cost, fees, shipping, manifest | No auction link (AUC-01). Vendor duplicates (PO-06). |
| 5 | In transit | PO `shipped_date`, `expected_delivery` | Shipped and expected dates | Rarely set (PO-05) |
| 6 | Receiving | PO `receiving_*`, `ReceivingSession` | Received date, pallet and box counts, damage | Partial (PO-02, PO-05) |
| 7 | Preprocessing | `PreprocessingRow`, PO `preprocess_status` | Lines with a taxonomy category | The AI cleanup categorizes: 15,587 of 15,593 rows since April have a taxonomy `final_category`. PO lines keep the B-Stock code, and a skipped AI cleanup leaks codes (PO-03). |
| 8 | Processing | `ProcessingRow`, PO `processing_status` | Start and done stamps, items created | Rarely stamped (PO-01, PO-05) |
| 9 | Products | `inventory.Product` | One product per real thing, identifiers | 66% in duplicate-title groups (PRD-01) |
| 10 | Items | `inventory.Item` | Category, cost, retail, `listed_at` at check-in | Mostly "Mixed lots" before 2026-06 (ITM-01). Dates (ITM-02). |
| 11 | Sales | `Item.sold_*`, `pos.CartLine` | Price, date, channel, discount, cash back | No channel or cash back (SAL-01, SAL-02) |
| 12 | Disputes | `Item.dispute_type`, PO dispute fields | What, why, credit | To check (R-012 / R-013) |
| 13 | Shrinkage | `Item` `lost` / `scrapped` | Reason and date | No reasons; 83k scrapped, meaning unknown (ITM-06) |
| 14 | Inventory counts | none | Monday floor counts: found, missing, moved | None (SHR-01, SHR-02) |

---

## Eras

Mapped by runner R-009 (archived). It is one V3 database: V1 and V2 were imported into it on **2026-04-12** and tagged in `notes` (`BACKFILL:v1`, `BACKFILL:v2`). Split eras on those tags or on register `BACKFILL`, **not** on the calendar or `created_at`.

| Era | Business dates | Source | Trust |
|---|---|---|---|
| V1 carts only | sales 2023-02 → 2024-02 | `pos_historicaltransaction` (`source_db=db1`) | Cart totals and `sale_date` only; no item rows. Exclude 36 rows dated year 9999. |
| V1 | items sold 2024-03-18 → 2025-07-27; POs 2024-03 → 2025-06 | Import `BACKFILL:v1` | **Use:** `sold_at`, `sold_for`, `ordered_date`, cost (filled by PO allocation, inflated where the backfill `retail_value` is bad), retail, PO link. **Don't use:** `created_at` (it is the load date), `listed_at`, `checked_in_at`. `scrapped` means "not a recorded sale" (ITM-06). |
| Gap | 2025-07-28 → 2025-08-22 | UNKNOWN | No item sales and no POs. Carts continue. Treat as missing data, not a slump. |
| V2 | items sold 2025-08-23 → 2026-03; POs 2025-08 → 2025-12 | Import `BACKFILL:v2` | Same rules as V1. Cost on 87%. |
| V3 retag | 2026-03-30 → 2026-04-11 | Native, notes `RETAGGED_FROM_DB2:` | Old shelf stock carried over: `created_at` / `listed_at` = the retag moment; **no cost, no PO**; retail filled. |
| V3 native | from 2026-04 (POs from 2026-04-21; check-in common from May 2026; categories good from mid-June 2026) | Native app | Everything. The only clean era. |

---

## Standing decisions

Settled; every future run follows these unless the owner changes them.

1. **Sales history:** use `sold_at` + `sold_for` from all eras. Timing (days to sell, age) only from V3 `listed_at` (ITM-02, ITM-03).
2. **Profit by era:** cost before V3 is shaky (allocation, placeholders, $0 for unknown). Use **recovery** (sold ÷ retail) for V1/V2 comparisons, and profit only where cost is real (V3, non-placeholder vendors) (PO-09, VEN-01, ITM-09).
3. **"Scrapped" import rows are not shrink.** The 83,491 `BACKFILL:` scrapped items are unsold legacy imports; exclude them from shrink and from have. Real losses are the dispute path: `lost` and `broken` (ITM-06, DSP-01).
4. **$0 means unknown, not free,** for PO fees and shipping before 2026 and for placeholder vendors `GEN` / `MIS` (PO-09, VEN-01).
5. **Categories:** the taxonomy name lives on `PreprocessingRow.final_category` / `ProcessingRow.category`; PO lines keep the vendor code. Prefer the taxonomy name wherever both exist (PO-03, PRE-01, ITM-11).
6. **Stale open POs** (older than 120 days) count as processed (PO-01).
7. **Legacy duplicates on carts** (one `BACKFILL:` item on several carts) are import artifacts: count the item's own `sold_at` / `sold_for` once (SAL-08).
8. **Product-first enrichment:** categories, names and other AI enrichment are done per product, and items inherit. The catalog is deduped first. Bulk jobs follow the audition method: a gold sample of 100–1,000, audition cheap models (Spark and others) on cost and accuracy, then a long, resumable, logged run (owner, 2026-09-23; plan to be written as `product_intelligence`).
9. **Reviews:** a data-quality review at the end of each truck and weekly (duplicates, bad names, bad categories, rail breaks) (owner, 2026-09-23; built in `data_quality_rails` Phase 3).

---

## Register

Scope numbers are from the dev database copy, as of the date given.

| ID | Stage | Issue | Scope | Affects | Handling | Rail | Status |
|---|---|---|---|---|---|---|---|
| ERA-01 | all | Three generations in one database (V1, V2 imported 2026-04-12; V3 native) | see **Eras** (R-009) | Every trend and every all-time average | **use** by era, per the Eras table | Stamp the source and era on imports | handled |
| ERA-02 | all | No item sales and no POs from 2025-07-28 to 2025-08-22 (V1 → V2 handoff) | 26 days (R-009) | Trends, weekly rates | **flag** as missing data; don't read it as a slump | n/a | open |
| AUC-01 | auction→order | No link between an auction and its PO | 20 of 27 recent POs match an auction title exactly (R-003) | Pipeline by auction, report card, shipping history | **fill:** link by exact title match for analysis | The Won → PO button creates the link (bstock Phase 6) | open |
| AUC-02 | bids, won | No bids, outcomes or wins recorded | `Outcome` 0, `Bid` 0, watchlist `won` 0 (R-003) | Win rate, price targets, report card | **unknown**; wins only through AUC-01 | Mark won or lost with the hammer price | open |
| AUC-03 | auction | Live auctions with no category mix (no manifest, no AI estimate) | 357 of 487 live (R-002) | Auction Need and Priority | **fill:** 50 (neutral), and **flag** "no mix" | Listing triage reads title and category (bstock Phase 3) | handled (fill), flag open |
| AUC-04 | auction | Origin city, ZIP and shipment type only on listings swept since 2026-09-23; pallets from the title before that | origin on 463 of 17,432; pallets 16,726 of 17,432 (R-007) | Shipping estimate | **fill:** distance formula when known, else $100 a pallet, else rate × price | The sweep stores them (done) | railed |
| AUC-05 | auction | `condition_summary` is a list-shaped string, such as `['Used Good']`. It is 99.9% filled, with 6 groups (R-024). No won-auction outcome exists yet to fit shrink per condition | all | Condition in triage | **use**, parsed by `condition_group()`. **fill:** shrink per group, set in Assumptions (`buying_shrink_<group>`); 0 = use the global shrink | Won → PO link (bstock Phase 6) to fit shrink per group | handled (parse); fit open |
| AUC-06 | auction | Manifest retail units: API rows in cents, CSV rows in dollars | older API rows | Manifest retail, valuation | **handled** at save; `renormalize_manifest_rows` for old rows | done (`whole_numbers_are_cents`) | railed |
| PO-01 | order→processing | POs stay `delivered` or `processing` after they are done. `complete` never gets `processing_done_at`. | 148 open by status. 85+ older than 120 days, with no categorized lines. `processing_status=done` on only 7 of 349 (R-003, R-005). | Need pipeline, processing speed, backlog | **exclude:** open POs older than `buying_pipeline_max_age_days` (120) count as done | Auto-complete a PO when no line is left unprocessed; stamp `processing_done_at` | handled |
| PO-02 | in transit | `delivered_date` is set on 341 of 349 POs, including ordered and paid ones | 341 of 349 (R-005) | Transit time, arrival | **exclude** as an arrival date; use `receiving_done_at` / `ReceivingSession.completed_at` | Set `delivered_date` only when receiving completes | open |
| PO-03 | preprocessing | `inventory.ManifestRow.category` keeps the B-Stock code (`TOYS`), while the AI cleanup's taxonomy pick sits on `PreprocessingRow.final_category`. When the AI cleanup is skipped, `final_category` falls back to the code (`coalesce_final_category_from_row`), and check-in's `canonical_category_name` turns an unknown code into Mixed lots. | 0 of 12,191 recent lines have a taxonomy name (R-003); 4,828 of 4,830 open lines have a taxonomy `final_category` (2026-09-23) | Need pipeline by category; items from POs that skipped the AI | **use** `final_category` when it is a taxonomy name; else **fill:** a `CategoryMapping` majority of the code (at least 2 votes and 60%), else Mixed lots | Map B-Stock codes in `canonical_category_name` (done 2026-09-23: `BSTOCK_CODE_TO_CANONICAL`, then learned mapping); write the taxonomy name to `ManifestRow.category` at finalize | handled (pipeline); check-in railed |
| PO-04 | preprocessing | Lines on POs ordered before 2026-05-26 have a blank category | 143,968 of 147,370 (R-012) | History by category | **use** as Mixed lots | PO-03 | handled |
| PO-05 | order→processing | Stage timestamps are rare | `shipped_date` 20, `receiving_done_at` 18, `processing_done_at` 7 of 349 (R-005) | Transit, receiving and processing times | **fill:** processing speed from item check-ins; transit **unknown** | Stamp every transition | open |
| PO-06 | order | The same vendor under two codes, such as Target as `TGT` and `TRGET` | seen in shipping history | Vendor sales, shipping, any per-vendor number | **fill:** map to one vendor for analysis (list in R-011) | One vendor per B-Stock seller; merge duplicates | open |
| PO-07 | order | PO description has no ship-from city, or no pallet count | 80 and 32 of 305 POs with shipping | Shipping formula history | **exclude** those rows from the fit | A PO created from its auction carries origin, pallets and lot id | handled |
| ITM-01 | items | Category is "Mixed lots" for most items before mid-June 2026. The history is the problem, not current processing: check-ins are only 1.8% Mixed in Aug 2026 and 3.4% in Sep. Items added with no PO are 100% Mixed (10 to 20 a month). | 87.6% of all 122k sold; 79% of units sold in 12 months; Mixed share of check-ins: May 98%, Jun 26%, Jul 8%, Aug 2% (2026-09-23) | Every per-category number: Need, speed, recovery | **use:** Mixed lots is its own category; **flag** coverage on per-category numbers | Category required at processing; AI recategorization backfill | open |
| ITM-02 | items | `created_at` and `label_printed_at` do not time anything (imports, backfill; stamped after the sale on 60% of recent sales) | 33k of 55k sold in 12 months (R-004) | Days to sell, age | **exclude** for timing; days to sell from `listed_at` only | `listed_at` at check-in (done) | handled |
| ITM-03 | items | `listed_at` only on 40% of items sold in 12 months | 21,859 of 55,012 (R-004) | Days to sell | **use** the listed subset, and **flag** the sample share | done going forward | handled, flag open |
| ITM-04 | items | Sold items with no PO | 5,127 in 12 months (R-004) | Vendor, cost, recovery by vendor | **use** as "(no PO)"; cost **unknown** | A purchased item must link a PO | open |
| ITM-05 | items | Items stuck in intake for 90 to 140 days | 290; 254 on POs already processed (R-005) | In-building pipeline | **use** as in the building (small) | Intake aging alert | open |
| ITM-06 | items | 83,491 of 83,506 `scrapped` items are the April 2026 import's label for "not a recorded sale" on legacy rows, not a floor scrap | 83,506 (R-012); 1 native scrap (2026-08-07) | Shrink, recovery, have | **exclude** `BACKFILL:` scrapped rows from shrink and have; the native one is **unknown** | Scrap reason and date on every scrap | handled (decision 3) |
| PRD-01 | products | Duplicate products (same title) | 53,969 groups, 132,419 rows = 66% of 200,079 (R-006) | Product-level sales, matching, vectors | **fill:** group by normalized title for analysis | Match on create; a scheduled dedupe job | open |
| PRD-02 | products | No embeddings or pgvector; the early vector R&D is not in this repo | `pg_extension`: only `pg_trgm` (R-006) | Product matching (bstock Phase 4) | **use** exact and TF-IDF matching for now | Vectors (future) | open |
| SAL-01 | sales | No sales channel; every sale is POS | 55,008 of 55,012 on POS carts (R-004) | In-store vs online | **use** as in store | A channel on every sale | open |
| SAL-02 | sales | No Thrift+ cash back or realized-price field | all (R-004) | Realized price, cash-back pricing | **use** `sold_for` (net of `sale_percent`) as realized | Record cash back per sale | open |
| SAL-03 | sales | Monthly sales swing hard (11,010 units in Oct 2025 vs 1,552 in Apr 2026) | 18 months (R-004) | Weekly sales rates | **use** a 90-day window; **flag** seasonality and eras | n/a | open |
| SHR-01 | inventory | The shelf has never been counted; stock listed long ago may be gone | 11,017 on-shelf items listed over 90 days ago, $416k retail (R-004) | Have, cover, Need | **use** as have (may overstate supply); **flag** | Monday floor counts; mark missing items lost | open |
| AUC-07 | auction | `Auction.has_manifest` is true whenever the sweep saw a lot id | 17,364 of 17,432 true with no manifest rows (R-010) | Anything reading the column | **exclude** the column; use manifest-row existence | Set it from manifest rows | open |
| AUC-08 | auction | Archived auctions stay `open` after `end_time` | 12 (R-010) | Status counts | **fill:** ended = closed | Close on archive | open |
| AUC-09 | auction | Manifest lines with retail 0 (the API sends `unitRetail` 0; can mean soft-deleted) | 202 rows on 13 auctions (R-010) | Manifest retail, valuation | **flag** as a hazard (bstock Phase 4) | n/a (seller data) | open |
| AUC-10 | auction | Manifest lines with a category key and no `fast_cat_value` | 116 rows on 2 auctions (R-010) | Category mix | **fill:** map on the next pull | Retry mapping | open |
| AUC-11 | auction | The same category text maps to two taxonomy names | 6 pairs of 3,448 keys (R-010) | Category mix | **use**; review the 6 | Mapping review in the DQ review | open |
| AUC-12 | auction | `CONTRACT` prices are per unit or small, not lot prices | 165 contract auctions (R-010) | Price, valuation, triage | **exclude** contracts from lot-price math | n/a | open |
| AUC-13 | auction | Closed auctions with no price and no auction id | 6 Walmart (R-010) | Price history | **exclude** | n/a | open |
| AUC-14 | auction | Price history stopped: snapshots only from watch polls; last on 2026-07-06 | 177 snapshots on 64 auctions (R-010) | Price tracking (bstock Phase 5) | **unknown** | Snapshot on every sweep for watched and shortlisted auctions | open |
| AUC-15 | auction | Marketplace gaps: Home Depot retail null on 558 of 1,890; Wayfair pallets on 26 of 363 | (R-010) | Valuation, shipping | **fill** per AUC-04 | n/a (seller data) | open |
| PO-08 | in transit | `expected_delivery` is usually a copy of `delivered_date`, not an ETA | 246 of 289 (R-011) | Transit ETA | **exclude** as an ETA | Set it only from the carrier or seller | open |
| PO-09 | order | $0 stands in for unknown money (Amazon fees 0 on 29 of 29 in 2024 and 17 of 30 in 2025; some shipping 0) | (R-011) | Cost, profit, shipping history | **unknown** where 0 before 2026 (decision 4) | Required fields on PO entry | handled (decision) |
| PO-10 | order | PO `retail_value` against the manifest total: 15 POs off by more than 5%; 45 have no lines | (R-011) | Recovery by PO | **use** the manifest total when lines exist | Recompute on manifest change | open |
| PO-11 | order | Dates run backwards (paid before ordered 1; delivered before ordered 8, all 2024) | (R-011) | Timing | **exclude** those from timing | Validate order of dates | open |
| PO-12 | order | Manifest file, rows and items disagree with status (no rows: 45, mostly `GEN`) | (R-011) | Pipeline, recovery | **use** rows when present | Status gates on manifest | open |
| PO-13 | order | `item_count` is the manifest unit total, not the item count | matches items on 34 of 349 (R-011) | Unit counts | **use** as manifest units only | Rename or compute | open |
| PO-14 | order | Processing disputes are open forever, with no credit amount; intake disputes unused | 162 open (R-011) | Dispute clawback, report card | **use** as the loss record | Resolve with a credit amount | open |
| PO-15 | receiving | `receiving_status=done` without a completed `Receiving` | 4 of 18 (R-011) | Receiving times | **exclude** from receiving timing | Done only via a completed session | open |
| VEN-01 | order | `GEN` and `MIS` are placeholder vendors with $0 money | 40 + 2 POs, 11,249 items (R-011) | Cost, profit, vendor stats | **flag**; cost **unknown** (decision 4) | Real vendors only | handled (decision) |
| VEN-02 | order | An order number on the wrong vendor (`TRGET-O7D-FRTF` on `AMZ`) | 1 (R-011) | Vendor stats | **fill:** fix by hand | Validate prefix against vendor | open |
| PRE-01 | preprocessing | The taxonomy name is on preprocessing and processing rows, not on the PO line (see PO-03) | all recent (R-012) | Category by PO | **use** the preprocessing row (decision 5) | Write the taxonomy to the PO line at finalize | handled (decision) |
| PRE-02 | preprocessing | `final_category` left as a vendor code | 6 rows (R-012) | Category | **fill:** code mapping | Validate against taxonomy | open |
| PRE-03 | preprocessing | Manifest quantity over 500 on a line | 11 lines (max 4,186) (R-012) | Units, processing load | **flag** as a hazard | n/a | open |
| PRE-04 | processing | Rows added during processing (no manifest line) have a blank category | 1,075 of 1,401 (R-012) | Item category | **fill:** product category | Require category on added rows | open |
| PRD-03 | products | `VendorProductRef` stopped on 2026-05-01; check-in doesn't write it | 174 rows (R-012) | Product matching | **unknown** | Write refs at check-in | open |
| ITM-07 | items | Shelf price 0 | 76 items (R-012) | Pricing | **flag** | Require price > 0 | open |
| ITM-08 | items | Retail null or 0 | 1,153 items (R-012) | Recovery | **exclude** from recovery | Require retail | open |
| ITM-09 | items | Cost null or 0 on purchased items | 22,237 (R-012) | Profit | **unknown** (decision 2) | Cost from PO allocation | open |
| ITM-10 | items | Price above retail | 79 (R-012) | Pricing | **flag** | Warn at pricing | open |
| ITM-11 | items | Product says Mixed lots while the manifest line or the processing row has a real category. The product category isn't updated from processing | 6,052 items (R-012). Of V3 Mixed products: 3,516 products and $74k have a free source, mostly processing `category` (R-028) | Every per-category number | **fill:** use the free source. The B-Stock code map wins where it names one of the 4 new categories; otherwise use the processing category (R-028: 132 conflicts, all old-19 vs new-4) | Processing writes the category back to the product; prefer the manifest category at check-in | open |
| SAL-04 | sales | `sold` with no `sold_at` and no `sold_for` | 397 (375 native, no cart line) (R-013) | Sales counts | **exclude** from sales math | Only a completed cart sets sold | open |
| SAL-05 | sales | `sold_for` 0 | 791 (737 backfill) (R-013) | Revenue, recovery | **use** (free or discounted) | n/a | open |
| SAL-06 | sales | `sold_at` set and no completed cart line | 4 (R-013) | Sales | **use** | n/a | open |
| SAL-07 | sales | Completed cart lines with no item (manual lines) | 62,741 lines, $711,869; last 90 days 311 lines, $3,559 (R-013) | Revenue by category (not placeable) | **use** in totals as "unassigned"; excluded from category numbers | Scan every item; manual lines only for misc | open |
| SAL-08 | sales | One `BACKFILL:` item on several completed carts | 8,903 items (R-013) | Sales counts | **fill:** count the item once (decision 7) | n/a (import) | handled (decision) |
| SAL-09 | sales | Item lines with quantity > 1 | 8,622 (230 native in 90 days) (R-013) | Units sold | **use** quantity | n/a | open |
| SAL-10 | sales | `sold_at` outside posted hours (Mondays, 18:00 hour) | 346 on Mondays in 90 days (R-013) | Hour/day reports | **use**; check posted hours | n/a | open |
| SAL-11 | sales | `sold_for` above retail | 39 (R-013) | Recovery | **flag** | n/a | open |
| SAL-12 | sales | `sold_for` above the item's current price (mostly 2025 import) | 12,144 (R-013) | Markdown analysis | **use** `sold_for` as the truth | n/a | open |
| SAL-13 | sales | A return is a discount line with no item; the item stays sold | 7 lines, −$516 (R-013) | Returns, net sales | **use** as negative revenue | Returns link the item and restock it | open |
| DSP-01 | disputes | Disputes used only for `undelivered` (148 lost) and `broken` (14 scrapped); no credit; none resolved | 162 (R-013) | Shrink, clawback | **use** as the loss record (decision 3) | Resolve with credit | open |
| SHR-03 | inventory | On the shelf and also on a completed cart, with no `sold_at` | 43 (R-013) | Have, sales | **flag**; likely sold | Checkout always sets sold | open |
| SHR-04 | shrink | Lost items have no loss date on the item (only in history) | 148 (R-013) | Shrink timing | **fill** from `ItemHistory` | A `lost_at` field | open |
| ITM-12 | items | 4 categories added 2026-09-23 (Lawn & garden, Appliances, Arts & crafts, Automotive) have no history: past items and past AI picks use the old 19 (the garden truck sits in Home décor) | all history (2026-09-23) | Need, sales by category | **fill:** Need 50 until they have sales | AI prompts and check-in know the 23; product-intelligence backfill re-places history | handled (fill) |
| ITM-13 | products | V1/V2 products carry a near-random category. On the gold set, the current category matched a hand label for 8 of 82 V1/V2 products (10%), against 81 of 98 for V3 (83%). There is no consistent mapping, so it isn't an ID shift. 72 of 300 gold rows are flagged `miscat_old`. Weighted by the real mix it is milder: Spark keeps the current category on 3,575 of 5,566 V1/V2 title groups (64%; Electronics is mostly right). 1,991 groups ($32k sold) would move, and 1,861 of those moves are auto-accepted (`workspace/backfill/pilot_out_v1v2_placed.jsonl`) | 2,774 V1/V2 products placed outside Mixed, 3,667 sold items, $78k (Electronics $48k) (R-027). Gold set 2026-09-23 | Category sales history before 2026-04. **Not** Need, want mix or speed: their 90-day window is 99.75% V3 (R-027) | **unknown:** treat a V1/V2 product's category as missing; don't trust it or copy it to siblings | The product_intelligence backfill re-places V1/V2 products (`workspace/backfill/pilot_out_v1v2_placed.jsonl`). No free-copy source exists for them: 0 of 183k V1/V2 items have a manifest row, and only 1% of their titles have a V3 twin | open |
| SHR-02 | shrink | No shrink measure at all | all | Truck value, report card | **unknown** | Counts (SHR-01) and scrap reasons (ITM-06) | open |

---

## Imputation catalog

Every fill-in in code, in one place.

| Rule | Where | Register |
|---|---|---|
| Open PO older than 120 days = processed | `category_stats_sql._on_order_rows`, `buying_pipeline_max_age_days` | PO-01 |
| PO line category: preprocessing `final_category` if a taxonomy name; else the code by `CategoryMapping` majority (at least 2 votes and 60%); else Mixed lots | `category_stats_sql._on_order_rows`, `category_code_to_taxonomy` | PO-03 |
| New category with no sales yet → Need 50 | `category_stats_sql` (`TAXONOMY_ADDED_2026_09`) | ITM-12 |
| No category mix → Need 50, and Priority = Need (no profit blend); shown on the auction as "filled in" | `valuation._auction_need_from_mix`, `valuation.compute_priority` | AUC-03 |
| Nothing sold in the window → Need 1 when stocked, 50 when empty | `category_stats_sql.need_from_cover` | (Need v2) |
| Need target = the store's own cover when the setting is 0 | `category_stats_sql.effective_target_weeks` | (Need v2) |
| Days to sell only from `listed_at` ≤ `sold_at` | `category_stats_sql._speed_rows` | ITM-02, ITM-03 |
| Shipping: quote, else distance formula, else $100 a pallet, else rate × price | `valuation.shipping_estimate`, `shipping_formula` | AUC-04 |
| Pallets from the title when B-Stock gives none | `listing_mapping.pallet_count_from_listing` | AUC-04 |
| API manifest retail whole numbers are cents | `normalize.whole_numbers_are_cents` | AUC-06 |

---

## How to add to this file

- **New issue:** take the next ID in its stage (ERA, AUC, PO, PRE, PRD, ITM, SAL, DSP, SHR, VEN). Fill in every column. If the scope number is from a runner, name the runner task.
- **New fill-in in code:** add a row to the imputation catalog in the same change.
- **Runner recon:** results give issue rows in this table's shape. The coder merges them here.
