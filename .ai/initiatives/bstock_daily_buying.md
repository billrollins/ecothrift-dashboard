<!-- initiative: slug=bstock-daily-buying status=active updated=2026-09-23 -->
<!-- Last updated: 2026-09-23 (process rethink; phases 2-6 re-planned) -->

# Initiative: B-Stock daily buying

**Status:** **Active**. Phase 1 is done. Phase 2 (buying context) is next and waits on runner recon R-002 to R-007 (`.ai/comm/runner/`).

**Objective:** The buyer can go from ad-hoc buying (about 5 auctions every week or two, manifests downloaded and uploaded by hand) to buying the best 1–2 B-Stock auctions a day. The app finds candidates, pulls their manifests without a manual step, and scores each truck on what the store already has, what sells, how fast it sells, shelf space, what is already won and on the way, the all-in cost (bid + fees + shipping), and bulk (same or similar items across lines). A won auction becomes a PO without a second manifest upload, so every truck gets a report card that feeds the next score.

**Compass:** this file is the compass. Documents is pending: [`documents`](./_archived/_pending/documents.md).

---

## Finish line

Each morning the buyer opens the wish list: the few auctions worth bidding on, each with a price target (buy at or under), a truck score, how badly we need it, a duration estimate, hazards, and why we want it or might not. Prices are tracked, and an auction drops off when it passes its target. The buyer bids by hand near the end. A won auction becomes a PO with its manifest, and when its items sell the auction shows predicted vs actual.

---

## Out of scope

- Placing bids on B-Stock from the app, or any automated bidding
- Automated B-Stock login, CAPTCHA handling, or storing B-Stock passwords
- Buying marketplaces other than B-Stock
- Building the weekly inventory count, online-sales tracking, product vectors, or Thrift+ cash back themselves (this initiative only leaves the hooks for them)

---

## Audit (2026-09-22, before Phase 1)

- **Discovery works.** Hourly `scheduled_sweep` uses public search (`search.bstock.com/v1/all-listings/listings`, no login). About 17k auctions locally.
- **Manifests are manual.** CSV download from B-Stock, then `POST /api/buying/auctions/{id}/upload_manifest/`. 28 of ~17k local auctions have manifest rows.
- **Probe (2026-09-22).** Anonymous `GET order-process.bstock.com/v1/manifests/{lotId}` answers 200 with `total` (213 on a Target pet lot) but always the same first 10 lines: `limit` comes back 10 and `offset` comes back 0 whatever is sent (`page` / `skip` are 400s). The anonymous API is a preview. Full manifests need the buyer's JWT (v2.4.0 pulled 1,000 lines a page with it).
- **Auto pull existed and was removed.** v2.18.0 (`61081ecc`, 2026-04-17) removed the anonymous `GET order-process.bstock.com/v1/manifests/{lotId}` pull (10 rows per page, ~100 requests per 1,000-row manifest). Reason on record: speed and ban-risk caution; no block was ever recorded. Whether it ever returned more than the preview is unknown; the 2026-09-22 probe says it does not now. Recover with `git show 61081ecc^:apps/buying/services/scraper.py`.
- **Stats job broken.** `apps/buying/services/category_stats_sql.py` reads `inventory_item.unit_retail`; migration `inventory.0061` renamed it to `retail`. Local `CategoryStats.computed_at` is frozen at 2026-04-16, so Need / Priority are five months stale.
- **Scoring gaps.** Priority = Need only (profit not used). Fees and shipping are flat % of current price. On-order (won, not received) stock, days-to-sell, bulk across lines, and condition are ignored.
- **No win → PO link.** `Bid`, `Outcome`, `WatchlistEntry.status=won` exist but nothing fills them. The PO manifest is a second upload into a separate table.

---

## The daily process (owner, 2026-09-23)

1. **Get context:** inventory, sales, goals, processing, orders, and listings.
2. **Make intermediate decisions:** which listings are worth a closer look.
3. **Get deeper context on those:** the signed-in data (manifest, fees, shipping quote).
4. **Process them for full context:** exact products, and what the truck really holds.
5. **Decide the wish list:** very good insight, driven by profit.
6. **Set a buy price** (buy at or under it), track the price, and drop the auction when it gets too high.

The owner bids by hand near the end of the auction (outbid at the last second, then wait). The app never bids. It hands over a short list with a price target, a strategy, and the reasons for and against each auction.

**Contexts the process needs**

1. **Inventory.** We have it by canonical category now. Product vectors come later.
   - We know nothing about shrink yet, because we never count.
   - Coming: Monday counts of the floor (not backstock), customer price scans (last seen, and scanned but not bought), and product dedupe.
2. **Sales.** By category, vendor, price and day, and by product vector later. This drives truck value, pricing to sell within 90 days, and buying pressure.
3. **Goals.** What the manager wants: more of a category, better sales or profit, or faster sales.
4. **Processing.** Velocity, what is waiting in receiving, and what we have that is not on the shelf.
5. **Orders.** Won auctions at every stage: entered, preprocessed, shipped, received, or none of these.
6. **Listings.** What is live on B-Stock, and what the listing text alone says: vendor, category, condition, pallets, units, retail $, price and location.
7. **Decisions.** Which auctions to focus on, and the signed-in data for those (shipping, fees, manifest).
8. **Manifest analysis.** The exact products (and vectors), then the hazards:
   - high-volume items, and whether we can sell them;
   - items we need, and items that are hard to sell;
   - likely breakage;
   - "box 1 of 4" and missing pieces;
   - high-value items (theft, damage, a wrong retail price);
   - $0 lines (soft-deleted);
   - quantities too large for processing.
9. **Final list.** Auctions to watch, each with how badly we need it, a price target, the truck score, a duration estimate, and why we want it or might not.

---

## Data quality (every phase)

The data is messy (4+ years, at least 3 database restarts). Every phase reads the register [`.ai/extended/data-quality.md`](../extended/data-quality.md) and, before it is done, states the register IDs it touches, the fill-ins it uses, and what coverage the screen shows. Imperfect data is used and labelled, not dropped. The work itself lives in [`data_quality_rails`](./data_quality_rails.md).

| Phase | Register IDs |
|---|---|
| 2 · Buying context | PO-01, PO-03, PO-04, ITM-01, ITM-02, ITM-03, ITM-05, SHR-01, AUC-03, SAL-03, ERA-01 |
| 3 · Listing triage | AUC-03, AUC-04, AUC-05, PO-06, PO-07 |
| 4 · Manifest analysis | PRD-01, PRD-02, AUC-06, ITM-01 |
| 5 · Wish list | AUC-02, SHR-02, ERA-01 |
| 6 · Won to PO | AUC-01, AUC-02, PO-01, PO-02, PO-05, PO-07 (this phase is also their rail) |

---

## Phases

### Phase 1 — Fresh stats and automatic manifests (done)
Need scores are current again. The owner hands over the B-Stock login each day from a superuser routine (desk or phone), and the server pulls manifests for the shortlist. Manual upload stays as a fallback.

Acceptance:
- [x] `compute_daily_category_stats` runs green again; local stats refreshed.
- [x] The anonymous manifest API was probed: it returns a 10-line preview only.
- [x] Shortlist: watchlisted auctions first, then priority, then soonest ending. Window, cap, retry wait and pause are settings.
- [x] `ManifestPullJob`:
  - one live job at a time, with Stop and runner ownership;
  - the Scheduler only resumes a job whose runner died;
  - a partial download is never saved.
- [x] The daily **Pull B-Stock manifests** routine, with the bookmark hand-off, on desk and phone.
- [x] Each auction records its manifest source, last attempt and error. Manual CSV upload still works.
- [x] Verified with a real B-Stock login (2026-09-23): 40 manifests, then Costco.
- [x] Also shipped on 2026-09-23:
  - B-Stock's 5% fee;
  - B-Stock shipping quotes;
  - a shipping formula from distance and pallets, fitted on 193 POs;
  - pallets, origin and shipment type from each listing;
  - Costco and other signed-in-only sellers.

### Phase 2 — Buying context (steps 1 and 3 to 5 of the contexts)
One context per category, which everything later reads:

| Measure | What it is |
|---|---|
| **Have** | Items on the shelf |
| **Pipeline** | Won, then PO entered, preprocessed, shipped, received, and in processing but not shelved |
| **Sales** | Units, revenue, days to sell, and sold price vs retail, by category and vendor |
| **Processing** | Items per week, and the backlog |
| **Goals** | Manager settings per category (more, less, or normal), and the weight on profit vs speed |

**Need v2** is weeks of cover: (have + pipeline) ÷ weekly sales, compared with a target number of weeks. This fixes today's Need, which ignores what is won but not yet processed. Priority is re-based on Need v2 and profit.
**Gated by:** Phase 1, and runner recon R-002 to R-006.

### Phase 3 — Listing triage, no sign-in (step 2; context 6)
Every live listing gets:
- **parsed facts** from the listing text: vendor, category, condition, pallets, units, retail $, price, location;
- **an estimated all-in cost:** fees plus the shipping formula;
- **a cheap triage score:** estimated profit at the current price, fit with Need v2, and speed of sale.

The top N form the **focus list**. The morning Pull pulls the focus list instead of "ending soon by priority".
**Gated by:** Phase 2, and recon R-007.

### Phase 4 — Deep context and manifest analysis (steps 3 and 4; contexts 7 and 8)
The signed-in data for the focus list is built: manifest, fees and shipping quote. What this phase adds:
- **Product grouping:** UPC, ASIN or near-same title first, vectors later.
- **Sell-through per product or category**, and the high-volume items.
- **Hazard flags:** box 1 of N or missing pieces, high value (theft, damage, or a wrong retail price), $0 lines, quantities too big for processing, and likely breakage.
- **Truck valuation v2** from the matched products.

**Gated by:** Phase 3.

### Phase 5 — Wish list and price targets (steps 5, 6 and 9)
The final list of auctions to bid on. Each one shows:
- truck score, Need v2 and a duration estimate;
- why we want it and why we might not;
- its hazards;
- a **price target** (buy at or under it).

Prices are tracked, and an auction drops off once it passes its target. The board says to bid near the end. The app never bids.
**Gated by:** Phase 4.

### Phase 6 — Won to PO, and the report card
Marking an auction Won creates a PO that carries the manifest, which feeds the Pipeline in Phase 2. When the truck's items sell, predicted vs actual is shown and fed back into the valuation and the shipping formula.
**Gated by:** Phase 5. The Won-to-PO link can move earlier if Phase 2's Pipeline needs it.

---

## Future hooks (design for, do not build here)

- **Monday inventory count:** the floor is counted every Monday (backstock is not). Item places are one list (floor, backstock, processing, restoration, in transit, online, sold, lost, broken), so a count updates places and gives real shrink per category and seller.
- **Online sales:** a sale channel on every sale, so days-to-sell and price split in-store vs online.
- **Product vectors:** product matching sits behind one "which products is this like?" function. UPC, ASIN or description first; vectors swap in later (the early vector R&D worked well). Also planned: a scheduled product-dedupe script on Heroku, vector matching in preprocessing and auction processing, and better categorization (new categories and/or better AI).
- **Customer price scans:** customers scanning prices tell us an item is in the store, when it was last seen, and when it was scanned but not bought (the price is probably too high).
- **Thrift+ cash back:** expected price = starting price × (1 − cash back on the likely sell day); record the realized price after cash back.

---

## Acceptance

- [x] Phase 1: fresh stats and automatic manifests
- [ ] Phase 2: buying context and Need v2
- [ ] Phase 3: listing triage and focus list
- [ ] Phase 4: manifest analysis and hazards
- [ ] Phase 5: wish list with price targets and price tracking
- [ ] Phase 6: won to PO, and the report card
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-23 — Phase 2 done (pending tests).** Priority = (1 − w) × Need + w × profit score (w = `buying_priority_profit_weight`, 0.5). The profit score is profit ÷ all-in cost at the current price, 1–99. No category mix means Need only (AUC-03). The Need panel shows coverage (70% of 90-day sales categorized, 99.5% with a shelf date). Buying `0027` seeds the weight. Known limit: the profit score at the current bid runs high early in an auction; Phase 5 price targets handle that.

**2026-09-23 — Shipped v2.98.0.** Fees, the shipping formula, Costco and Need v2 (Phase 2 part) go live. The runner R-014 pre-ship run was GREEN. The owner still needs to add the Heroku Scheduler job `pull_shortlist_manifests` every 10 minutes.

**2026-09-23 — Phase 2 started: Need v2.** Need is weeks of cover: (shelf + in the building + on order) ÷ weekly sales, against a target that defaults to the store's own cover (35.5 weeks locally). Goals per category (more / normal / less / stop) are set from the panel. Open POs older than 120 days are ignored: 98k units on stale "delivered" and "processing" POs with no categorized lines were never closed. The 22 POs delivered but not processed in the last 120 days ($672k retail, R-003) do count. PO line categories are B-Stock codes (`TOYS`), mapped by `CategoryMapping` majority. Local effect: Health & beauty fell from 74 to 42 (2,390 on order), Toys from 81 to 73, Office from 78 to 65. Still to come in Phase 2: sales and speed from R-004, processing from R-005, won-not-PO'd auctions (Phase 6 link), and Priority re-based on profit.

**2026-09-23 — Rethink after the first real pulls.** Costco pulls. Need and Priority are off: they ignore orders won but not processed, and "need" may be the wrong measure anyway. The owner laid out a 6-step daily process and 9 contexts (above). The phases were re-planned: 2 buying context, 3 listing triage, 4 manifest analysis, 5 wish list and price targets, 6 won to PO and report card. Recon goes to the runner (`.ai/protocols/runner.md`) as R-002 to R-007.

**2026-09-23 — Costco.** Costco never appeared (0 auctions ever): B-Stock hides it from anonymous search; the owner's signed-in search returned 272. Signed-in-only sellers are now searched with the handed-over login while it is live, and the Pull searches them before fixing its shortlist. Not yet seen end to end (the login had expired): the first real Pull confirms Costco lots carry a `lotId` and their manifests download.

**2026-09-23 — Fees and shipping (all-in cost, early).** First real login pull worked (40 auctions, one call each, full manifests). Fees: B-Stock's 5% buyer fee per marketplace (`buying/0022`). Shipping: B-Stock's quote from `shipment.bstock.com/v1/quotes` (only exists once the owner opened the listing), read by the pull after each manifest and by a Get B-Stock quote link; else rate x price. Max bid solves for the fee rate. Unquoted lots: a distance formula fitted on our PO history (owner's call: city from the PO description, pallets, cost, fee, month; distance from the store by Google). Per-city medians missed by 24%; the split truckload / LTL distance formula by 11-19%, and a 2026 level for truckloads (prices up about 60%) predicts the Franklin quote within 1%. $100 a pallet stays as the fallback when a city's distance is unknown. B-Stock would not list all past quotes in one call (timed out).

**2026-09-23 — Merged with AI settings.** `ai-settings-floorplan` merged into `main` (`ecc60707`). The pull's category mapping (`ai_key_mapping`) now takes its model and effort from **Settings > AI → KEY_MAPPING**; each call stays bounded so the job heartbeat keeps moving (at most 2 attempts, 60 s each at effort off or low, up to 110 s at high or max). Tests now run through the tester (`.ai/protocols/test-runner.md`); the merge is T-001. Still owner-side: one real login pull, and the Heroku Scheduler job `python manage.py pull_shortlist_manifests` every 10 minutes.

**2026-09-23 — Second review pass.** A second multi-agent pass (280 agents) re-checked all 88 fixes (58 fully fixed, 30 partly) and found 45 new confirmed issues, mostly from the rewrite. Biggest: one lot's 404 or refusal was treated as a systemic outage or refused login (wiping the token, stalling every later Pull at that lot); the routine could not be submitted on a day with nothing to pull; prune's keep-rule used watchlist statuses nothing sets. Now: per-lot errors stay on the lot (404 and too-large lots are `manifest_pull_blocked`), only a 401 or two refused lots in a row mean the login (and only that exact token is forgotten), the pull sends only the handed-over token, a resumed job releases the dead runner's in-flight lot, Stop keeps the interrupted result, Disconnect stops the job, a quiet day can be submitted, only superusers get or submit the routine, the run keeps every pull's results, CSV upload and manifest delete take the pull's row lock, a sign-in bounce shows a waiting-login notice, and the hand-off tab closes instead of opening a second runner. Buying pytest 143 green (fresh test DB), routines 32 and vitest 9 failures identical to `main`.

**2026-09-22 — Review pass.** A multi-agent review (7 lenses, 4 rounds, 3 skeptics per finding) confirmed 88 of 115 findings; all were fixed. Biggest: `buying.0021` would have broken the hourly sweep (raw-SQL insert, new NOT NULL columns; now `db_default=''`); only a 401 used to stop a pull, so a refused login or outage stamped the whole shortlist; the owner's JWT went through the rotating SOCKS5 pool; two jobs could run at once and overwrite a CSV; the scheduler could start a new 40-auction job every 10 minutes per login. Now: typed B-Stock errors, one live job with runner ownership and per-page heartbeat, row-locked per-auction claims, `_id`-sorted de-duplicated paging, direct authenticated calls, confirm-before-save hand-off, Stop / Disconnect, pruning, a routine without `system_key` (owner can retire or reassign it), plus the pre-existing list bug that multiplied manifest retail by the thumbs-vote count. Migrations are now `buying.0021_auction_manifest_auto_pull` (one file) and `routines.0028_bstock_pull_routine`, which depends on `routines.0027_orphan_section_drafts` from the concurrent cross-check work: ship them together or after it.

**2026-09-22 — Phase 1 built (not yet used with a real login).** Stats SQL fixed. Anonymous manifest API proved a 10-line preview, so the owner chose a daily superuser routine that hands over the B-Stock login (bookmarklet → `/routines/bstock-login#t=`) from desk or phone; the server stores it in `BStockToken` and runs `ManifestPullJob`s.

**2026-09-22 — Opened.** Audit of Buying → Auctions; the owner wants 1–2 best auctions a day driven by stock, sell-through, space, on-order, all-in cost, and bulk. Reverses the v2.18.0 "never ingest via the manifest API" call for shortlisted auctions only.

---

## See also

- Domain: [`.ai/extended/bstock.md`](../extended/bstock.md), [`.ai/extended/vpn-socks5.md`](../extended/vpn-socks5.md), [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- Prior work: [`bstock_auction_intelligence`](./_archived/_completed/bstock_auction_intelligence.md), [`historical_sell_through_analysis`](./_archived/_pending/historical_sell_through_analysis.md)
- Index: [`_index.md`](./_index.md)
