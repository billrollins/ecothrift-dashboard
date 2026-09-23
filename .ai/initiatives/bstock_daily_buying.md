<!-- initiative: slug=bstock-daily-buying status=active updated=2026-09-23 -->
<!-- Last updated: 2026-09-22 (Phase 1 built) -->

# Initiative: B-Stock daily buying

**Status:** **Active** — Phase 1.

**Objective:** The buyer can go from ad-hoc buying (about 5 auctions every week or two, manifests downloaded and uploaded by hand) to buying the best 1–2 B-Stock auctions a day. The app finds candidates, pulls their manifests without a manual step, and scores each truck on what the store already has, what sells, how fast it sells, shelf space, what is already won and on the way, the all-in cost (bid + fees + shipping), and bulk (same or similar items across lines). A won auction becomes a PO without a second manifest upload, so every truck gets a report card that feeds the next score.

**Compass:** this file is not the compass; [`documents`](./documents.md) stays the compass.

---

## Finish line

Each morning the buyer opens **Buying → Top picks** and sees the best 1–2 auctions ending soon, each with a max bid, its manifest already loaded, and a plain breakdown (money in, all-in cost, weeks of shelf space, bulk flags). The buyer bids on B-Stock, marks the auction Won in the app, and a PO with that manifest appears in Inventory. When the truck's items sell, the auction shows predicted vs actual.

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

## Phases

### Phase 1 — Fresh stats and automatic manifests
Need scores are current again. A daily superuser routine hands the app the owner's B-Stock login (desk or phone) and the server pulls manifests for the auctions ending soon, with manual upload kept as a fallback.
**Gated by:** none.

Acceptance:
- [x] `compute_daily_category_stats` runs green (`unit_retail` → `retail`, `computed_at` now set on update); the six SQL tests that used pre-0061 Item fields now run the real SQL; local stats refreshed
- [x] One-request probe of the anonymous order-process manifest API, result recorded under Audit (preview only)
- [x] Shortlist: open, non-archived, non-contract auctions with a lot id and no manifest, ending inside the window, not failed inside the retry wait; watchlisted, then priority, then soonest; window / cap / retry / page delay are Admin → Assumptions settings
- [x] The routine's Pull button runs a `ManifestPullJob` with the handed-over login (one live job; Stop; the Scheduler's `pull_shortlist_manifests` only resumes a job whose runner died); rows save through the same fast-cat mapping and valuation as a CSV upload; a partial download is never saved
- [x] Daily **Pull B-Stock manifests** routine (`kind=bstock_pull`, superusers): open B-Stock → Send to Eco-Thrift bookmarklet → confirm on `/routines/bstock-login` → Pull → progress → Submit; works in the phone runner and the desk stage
- [x] Each auction records manifest source (auto / manual), last attempt, and error; auction detail (with the attempt time) and the list's manifest tooltip show them
- [x] Manual CSV upload still works and replaces an auto manifest
- [x] Scheduler step documented in `development.md` and `bstock.md`; buying pytest 143 green; routines pytest and vitest failures identical to `main`
- [ ] Verified end to end with a real B-Stock login (bookmark set up on desk and phone, one real pull)

### Phase 2 — Won auction to PO, and the data a report card needs
Mark Won creates a PO carrying the manifest; sales record channel, realized price, and days-to-sell.
**Gated by:** Phase 1.
Detail when Phase 1 is built.

### Phase 3 — Truck score
Manifest lines grouped into products (UPC / ASIN / near-same description); each group scored on stock on hand + on the way, days-to-sell, cash-back-adjusted price, clear-this-week price, shrink, and dispute clawback; ranked by profit per week of shelf space.
**Gated by:** Phase 2.
Detail when Phase 2 is built.

### Phase 4 — Daily Top picks
A Top picks board with the best 1–2 auctions a day, max bid, and a plain breakdown; predicted vs actual on won trucks.
**Gated by:** Phase 3.
Detail when Phase 3 is built.

---

## Future hooks (design for, do not build here)

- **Weekly inventory count:** item places are one list (floor, backstock, processing, restoration, in transit, online, sold, lost, broken) so counts update places and real shrink per category / seller.
- **Online sales:** a sale channel on every sale, so days-to-sell and price split in-store vs online.
- **Product vectors:** product matching sits behind one "which products is this like?" function; UPC / ASIN / description first, vectors swap in later.
- **Thrift+ cash back:** expected price = starting price × (1 − cash back on the likely sell day); record the realized price after cash back.

---

## Acceptance

- [ ] Phase 1 fresh stats and automatic manifests
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-23 — Second review pass.** A second multi-agent pass (280 agents) re-checked all 88 fixes (58 fully fixed, 30 partly) and found 45 new confirmed issues, mostly from the rewrite. Biggest: one lot's 404 or refusal was treated as a systemic outage or refused login (wiping the token, stalling every later Pull at that lot); the routine could not be submitted on a day with nothing to pull; prune's keep-rule used watchlist statuses nothing sets. Now: per-lot errors stay on the lot (404 and too-large lots are `manifest_pull_blocked`), only a 401 or two refused lots in a row mean the login (and only that exact token is forgotten), the pull sends only the handed-over token, a resumed job releases the dead runner's in-flight lot, Stop keeps the interrupted result, Disconnect stops the job, a quiet day can be submitted, only superusers get or submit the routine, the run keeps every pull's results, CSV upload and manifest delete take the pull's row lock, a sign-in bounce shows a waiting-login notice, and the hand-off tab closes instead of opening a second runner. Buying pytest 143 green (fresh test DB), routines 32 and vitest 9 failures identical to `main`.

**2026-09-22 — Review pass.** A multi-agent review (7 lenses, 4 rounds, 3 skeptics per finding) confirmed 88 of 115 findings; all were fixed. Biggest: `buying.0021` would have broken the hourly sweep (raw-SQL insert, new NOT NULL columns; now `db_default=''`); only a 401 used to stop a pull, so a refused login or outage stamped the whole shortlist; the owner's JWT went through the rotating SOCKS5 pool; two jobs could run at once and overwrite a CSV; the scheduler could start a new 40-auction job every 10 minutes per login. Now: typed B-Stock errors, one live job with runner ownership and per-page heartbeat, row-locked per-auction claims, `_id`-sorted de-duplicated paging, direct authenticated calls, confirm-before-save hand-off, Stop / Disconnect, pruning, a routine without `system_key` (owner can retire or reassign it), plus the pre-existing list bug that multiplied manifest retail by the thumbs-vote count. Migrations are now `buying.0021_auction_manifest_auto_pull` (one file) and `routines.0028_bstock_pull_routine`, which depends on `routines.0027_orphan_section_drafts` from the concurrent cross-check work: ship them together or after it.

**2026-09-22 — Phase 1 built (not yet used with a real login).** Stats SQL fixed. Anonymous manifest API proved a 10-line preview, so the owner chose a daily superuser routine that hands over the B-Stock login (bookmarklet → `/routines/bstock-login#t=`) from desk or phone; the server stores it in `BStockToken` and runs `ManifestPullJob`s.

**2026-09-22 — Opened.** Audit of Buying → Auctions; the owner wants 1–2 best auctions a day driven by stock, sell-through, space, on-order, all-in cost, and bulk. Reverses the v2.18.0 "never ingest via the manifest API" call for shortlisted auctions only.

---

## See also

- Domain: [`.ai/extended/bstock.md`](../extended/bstock.md), [`.ai/extended/vpn-socks5.md`](../extended/vpn-socks5.md), [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- Prior work: [`bstock_auction_intelligence`](./_archived/_completed/bstock_auction_intelligence.md), [`historical_sell_through_analysis`](./_archived/_pending/historical_sell_through_analysis.md)
- Index: [`_index.md`](./_index.md)
