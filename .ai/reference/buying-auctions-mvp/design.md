# Buying auctions: MVP design v11 (Dash Update #73)

---

# PART 1: FOR BILL (two minutes)

B-Stock browses and takes your bid; we link to it. We add what it cannot: **Estimate Profit** (ship 1, about a week), a **live watch** with alerts as an auction ends and **Buy Now alerts** (next), and a **want-list filter** on what sells here (about week 5, sales-only to start). You bid by hand.

## Ship 1 screen: two real Target trucks, run as new lots

| | Bikes/fitness (PO 318) | Bedding (PO 367) |
|---|---|---|
| Retail | $66,395 | $47,623 |
| PO cost | $13,205 | $5,282 |
| **Brings in: low / likely / high** | $22.6k / **$26.5k** / $29.9k | $5.7k / **$6.4k** / $9.9k |
| Profit at likely | +$13.3k | +$1.1k |
| Actual so far | $27,886 | $7,317 |

Rates are hand-set per Target seller category and **untested** (set looking at these trucks). The screen applies the missing-pieces rule (73% of the bedding truck carries that note). Tested without a truck's own results, the method missed these two by 15 and 18 points; across 8 Target trucks the median miss is 4.9 points. The screen says so every time, prints "weak estimate" when most of a lot has no rate of its own, and covers Target only.

## Questions (yes or no)

1. **Always-on worker, about $7 a month at list price,** for the live watch and Buy Now alerts? Until texting is approved, alerts go by email (can lag) and the Dash bell (only while Dash is open).
2. **Daily "Send to Eco-Thrift" tap** for manifest requests (later)?
3. **Start the want list from sales only,** and ask you for a customer signal then?

Ship 1 needs no answers. Defaults are in Part 2, A10.

---

# PART 2: APPENDIX FOR THE CODER

Design only; no code changed. Facts checked in code or read-only on prod or the local copy (through 11-04). Ship ids (H, P, 1, 1b, 2-8) are the ladder in A11 and are used everywhere. Scripts are in `workspace/manifest-check/`.

## A1. Code and data facts (grouped by use)

**Status and freshness (ship H)**

| Fact | Source |
|---|---|
| Sweep is hourly (`scheduled_sweep`); upsert is raw SQL | `.ai/extended/backend.md` 89; `sweep_upsert.py` |
| `last_updated_at` is set by the sweep upsert (`sweep_upsert.py` 65, `pipeline.py` 224/257) **and** by the watch poll and refresh (`pipeline.py` 426), so a sweep-only stamp is needed. `last_listed_at` does not exist yet, so "live" (A9) cannot be tested before ship H. | code; local schema |
| `apply_closed_inference` runs only in the watch poll and refresh (`pipeline.py` 95, 532, 581), not the sweep | code |
| Prod 11-05: 248 lots have a future end time and open/closing status (207 SPOT, 41 CONTRACT, all 41 with a current price). `run_watch_poll` already excludes contract lots (`pipeline.py` 472). | read-only query |

**Estimate inputs (ships 1, 1b)**

| Fact | Source |
|---|---|
| `Auction.url` contains `external_id` on 248 of 248 live lots (`https://bstock.com/buy/listings/details/<external_id>`); B-Stock's human id ("66562-LKL-0VNA") is not stored. Accept the pasted **link**, match on the id. Ship 1: a lot not in our table answers "not in our list yet (sweep is hourly); ship 1b fetches it". **Ship 1b: fetch that lot by id** (anonymous `get_auction_states_batch`, as the watch poll; if it lacks title, retail or pallets, a search by listing id), store, estimate; "not found" only if the fetch fails, with the reason. | read-only query; fetch fields confirmed in 1b |
| The existing `POST auctions/{id}/upload_manifest/` takes B-Stock's Download CSV (`target_tl.csv` is one) | `backend.md` 18; `manifest_upload.py` |
| Truckload $1,667.98 + $1.6709/mi (shipment type Truckload or 16+ pallets); LTL $297.78 + $43.25/pallet + $0.0746/pallet-mile; 2026 level already in; typical error **25% truckload, 20% LTL**; fitted 2026-09-23 on 193 POs. 247 of 248 live lots have pallets, city and driving miles. | `shipping_formula.py` 36-98, 197-210; `buying_shippingorigin` |
| Seller-category history, 2026 POs (`inventory_manifestrow.taxonomy.seller_category`): Target 15 trucks, Walmart 6, Amazon 9, Home Depot 1, Wayfair 1, Costco 1. Old enough (ordered before 2026-08-01): Target 8 (POs 318-322, 360, 367, 373; $236k retail), Amazon 6, Walmart 5. Item-to-manifest-row links exist only from 2026 POs on. | read-only query |
| Checked Target lot `target_tl.csv` (2,377 lines, $81.7k): hard-sell shares Halloween 15.1%, used-good consumables 10.1%, Christmas 6.8%, dorm bedding 5.4%, apparel/shoes/bags 3.0%, party 1.1%; about 30% of retail carries "sets may be missing pieces"; 6 lines reach 20 units (2.2% of retail). | `hard.py`; hand run |
| Deep quantity (`deep.py`): store sold 14,311 units over 5,679 products in 90 days (about 2.5 each); only 44 of 2,377 lines match a product we sold in 90 days; pricing units beyond S at 10% moves Target "likely" from 31.7% to 28.2% (S=3), 27.6% (S=2.5) or 31.1% (S=12). `product_sales()` (`manifest_analysis.py` 306) is all-time; a 90-day query is new work. `ManifestRow.matched_product` exists (`models.py` 710-724) but the matcher found runs in the analysis step. | measured |
| `CategoryStats.recovery_rate` counts sold items only (runs high); `fit_seller_factors` measures actual / predicted per PO, not recovery (`seller_factor.py` 62-115) | code |

**Alerts, watch, Buy Now (ships 2, 3, P)**

| Fact | Source |
|---|---|
| `buy_now_price` filled 3 of 25,637; parsers read different key names (`pipeline.py` 70-76, `listing_mapping.py` 239-241); `listing_type` holds only SPOT/CONTRACT, so Buy Now is not detectable yet | code; query |
| Lot 677978: stored price $107.50, Buy Now sold at $10,750, exactly 1/100: either $107.50 was B-Stock's 1% starting bid, or our parser slipped a cents/dollars unit. Ship P settles which. | brief |
| Alert senders: `apps/texting/service.py` (held until `texting.live`), email in `apps/hiring/emails.py`, `apps/webstore/emails.py`; nothing in `apps/buying` sends. Nags are superuser only and show in the header bell, updated only while Dash is open (`NotificationBell.tsx` 62, 147). | headers |
| Scheduler cadence documented "10+ minutes" (`backend.md` 369). `WatchlistEntry.poll_interval_seconds` default 300, a minimum gap (`models.py` ~923). | docs; code |
| Manifest pull: `BstockLoginView` (class line 1006) and `ManifestPullView` (1034) are `IsSuperAdmin` (permission lines 1015, 1045); buyer endpoints are `IsStaff` (`api_views.py` 290+); job lots fixed at first run; shortlist = `_needs_pull_q` + `_window_q` (`last_updated_at` within `SEEN_WITHIN` 3 h); prompt text "Reload an auction page on B-Stock, then tap Send to Eco-Thrift" | `manifest_pull.py` 94-184 |

## A2. Estimate Profit: exact rules

**Ship 1 (Target, about a week for one coder):**
- **Who gets a number:** Target. Every other seller shows "not yet for this seller" until ships 1b and 5.
- **Retail used:** the manifest sum (qty x unit retail, deleted and zero lines excluded) when a CSV is dropped, else B-Stock's `total_retail_value`. Both shown with source tags; a line says so if they differ by more than 5%.
- **With a CSV: the sum-product.** For each seller category, `retail x rate` (low, likely, high) from the seeded Target rate table (A3), summed.
- **Without a CSV: whole truck.** `lot retail x 31.4%` (pooled recovery of the 8 Target trucks: $74,107 sold / $235,900 retail), band 24% to 40% (their quartiles). Label "whole truck, no manifest".
- **Season rule (Halloween and Christmas only).** Calendar: **Halloween** (season date Nov 1; SEASONAL lines), **Christmas** (Thanksgiving; TRIM A TREE lines). Other SEASONAL lines (Easter, summer) show "season not set" and use the category rate. Each season has a late and an in-time rate. Halloween 5 / 10 / 18% was written for after the season, so it is the **late** rate; in-time is Bill's to set in 1b (equal to late until set). Christmas 12 / 22 / 30% was written as "must hit the floor before Thanksgiving" (`est3.py` note), so it is the **in-time** rate; the late Christmas rate is unmeasured, so ship 1 uses 5 / 10 / 18% as a placeholder marked "judgement". Shelf date = close date + lead time (default 21 days until measured from our POs; the value is shown); after the season date means late. Nothing is shifted twice. Worked: Christmas line, lot closing Nov 10, shelf date Dec 1, after Thanksgiving Nov 26: late 5 / 10 / 18%. Closing Oct 20, shelf Nov 10: in-time 12 / 22 / 30%. Today is Nov 5, so every Halloween line is late.
- **Missing pieces rule:** a line noting "sets may be missing pieces" uses its category **low** rate as likely (about $1-1.5k off on the checked lot, before overlap).
- **Landed** = price + 5% fee (one setting; `Marketplace.default_fee_rate` unused) + freight (typed, else formula). **If freight is None** (1 of 248 live lots): price + fee only, marked "freight not included", no profit line; the ship 3 alert uses a 20% ceiling for it and says so.
- **Brings in, profit, multiple** at low / likely / high; **Bid up to** = `(retail x pct - freight) / 1.05` at 20% and at 23%.
- **Which number ship 1 shows:** the **seeded-rate sum-product** (A3 table, "judgement") is the number; its band is the table's low and high. The **history-only** result (rates built without that truck) is never the number; it is the **miss line** under it: "Target method, 8 trucks: median miss 4.9 points, 4 of 8 within 4, worst 18; seeded rates are tuned on these trucks (in-sample); thin". Part 1's example is the screen for POs 318 and 367, chosen because their category rows carry the retail (default-rate share 0% and 6%) and run through the ship 1 rules (`loo_rules.py`: likely 26,539 and 6,409; bands 22,574-29,878 and 5,707-9,890; missing-pieces share 0% and 73%; the season rule changes nothing for these trucks, which reached the shelf before Nov 1 and Thanksgiving, and the in-time rates equal the seeded ones). A truck like PO 360, 98% in fill-in rows, would print "weak estimate" and its "likely" is mostly the 31.4% constant. The no-CSV whole-truck 31.4% is also in-sample (pooled recovery of the same 8 trucks), and its screen says "wide" beside the 24-40% band.
- **Your number:** a box that saves Bill's own estimate beside ours.
- **Horizon:** rates are to-date at about 4-6 months of selling (Target about 31% to date, about 34% final); the screen says "over about 6 months".
- **Shrink:** the history denominator is manifest-row retail for every unit, so missing, damaged or never-itemised units are already zeros in computed rates. Computed rows get no shrink. Seeded (judgement) rows are the hand run's and take no extra shrink either, because the in-sample 8-truck result in A3 shows them landing on to-date results without it (in-sample, so forward scoring decides); a haircut input arrives in 1b.

**Ship 1b:** fetch a brand-new lot (A1); editable rate table, in-time and late season rates, handling and haircut inputs; text-matched hard-sell rules (Halloween/Christmas text outside their categories, dorm comforters and bedding sets 10 / 13 / 18%, party and balloons 6 / 12 / 18%; a line matching several takes the lowest likely, once); bid-up-to also with freight +25% (truckload) or +20% (LTL); deep lines **flagged, not priced** (units, our 90-day sales if matched else "unknown", days of selling, share of retail); Walmart and Amazon after their own leave-one-out; check whether the existing bookmark can also send the lot link.

**Ship 5 (deep quantity priced):** compare the units of one item in the lot with our 90-day sales of its **kind** (B-Stock Subcategory / Product Class mapped to our product categories, not the exact SKU), pay the category rate for what we can sell in about 90 days and a steep rate (5 / 10 / 15%; toilet paper at 90% off is 10%) beyond. Staples are not exempt; they clear faster. Needs a new 90-day sales query and a measured match rate; done when `deep.py` is re-run with the kind map and reports the move in likely.

**Other rules:**
- **Tag:** the 55% start tag is a label until ship 5, which tests the tag effect across every vendor from item price/retail and sold_for and moves rates by tag level. Seed evidence: 52-60% tags brought in about 46-47% of retail with 80%+ selling in household, pet, office and kitchen; toys about 36%.
- **Weekday:** not in the estimate; it shows only as the closing day and time on each lot. We sell most on Saturday (about 28% of dollars) and Friday (19%), which changes when we sell, not what a truck brings in over six months.
- **Contract lots (41 of 248 live):** no bidding, so no room ranking, watch, price-jump or last-call. Estimate Profit works on a pasted contract lot at its contract price, labelled "contract, no bidding". The live-lots list (ship 4) shows them in a separate collapsed group.
- **Watch until ship 2:** the estimate carries the existing star (polls every 5 minutes).

## A3. Rate table and the measured test

- **Table (read-only in ship 1, editable in 1b):** one row per seller + seller category: low, likely, high, **basis ("computed: n items, retail base, cohort dates" or "judgement")**, evidence, Bill's tweak, updated. Ship 1 seeds Target from `est3.py` (18 categories) with the **fill-in for any other category = Target whole-truck 24 / 31.4 / 40%**, labelled "judgement" (the old 18 / 25 / 32% fill-in ran low on three trucks). It replaces `CategoryStats.recovery_rate` for Deals. Every ship 1 row is judgement, so every Target estimate says "judgement rates"; "weak estimate" prints only when over 30% of retail uses the fill-in rate (a category with no row of its own). The two tags read together: "judgement rates" says every rate is hand-set; "weak estimate" says most of this lot has no rate of its own.
- **Computed row** (ships 1b, 5): likely = pooled recovery (sum sold_for / sum manifest retail) over cohort trucks; low and high = 25th and 75th percentile of that category's truck-level recovery with at least 3 trucks and $1,000+ retail, else likely x 0.7 and x 1.3 (marked "judgement band"). It replaces a judgement row only with at least 30 items and $2,000 retail in the cohort and a passing leave-one-out.
- **Cohort:** POs ordered Apr-Jul 2026 for rates; Aug-Sep 2026 trucks (about $224k Target retail) are young and are scored forward as they mature.

**Measured 11-05 on the local copy (`loo.sql`, `loo.py`, `loo_hand.py`; actual = sold_for to date; miss = (predicted - actual) / truck retail):**

| PO | Ordered | Age (mo) | Retail | Actual | History-only predicted | Miss | Hand rates, in-sample, new fill-in | Miss |
|---|---|---|---|---|---|---|---|---|
| 318 | Apr 21 | 6.5 | $66,395 | 42.0% | 27.3% | -14.7 | 40.0% | -2.0 |
| 319 | Apr 21 | 6.5 | $6,177 | 40.9% | 42.4% | +1.5 | 39.7% | -1.2 |
| 320 | May 8 | 5.9 | $14,529 | 37.5% | 31.0% | -6.5 | 31.9% | -5.6 |
| 321 | May 13 | 5.8 | $8,318 | 21.3% | 31.8% | +10.4 | 24.0% | +2.7 |
| 322 | May 14 | 5.7 | $54,303 | 30.5% | 31.3% | +0.8 | 35.4% | +4.8 |
| 360 | Jun 26 | 4.3 | $30,459 | 31.9% | 31.0% | -1.0 | 31.5% | -0.4 |
| 367 | Jul 15 | 3.7 | $47,623 | 15.4% | 33.2% | +17.8 | 15.7% | +0.3 |
| 373 | Jul 29 | 3.2 | $8,096 | 35.3% | 31.9% | -3.4 | 31.8% | -3.5 |

- **History-only (rates from the other 7 trucks; a category with under $1,000 of retail in the others falls back to their whole-truck rate):** median miss 4.9 points, worst 17.8, within 4 points on 4 of 8; whole-truck rate alone: median 8.1, worst 20.1, 3 of 8. Most categories appear on only one or two trucks, so the fallback decides most lines (PO 318: 100%).
- **Hand rates with the 24 / 31 / 40% fill-in** (in-sample, **not a test**: the rates and fill-in were set looking at these trucks): median 2.3, worst 5.6, within 4 on 6 of 8; band covers 8 of 8.
- **With the ship 1 missing-pieces rule (`loo2.sql`, `loo_rules.py`; in-sample):** median miss 2.3, worst 5.6, within 4 on 5 of 8. Default-rate share of retail per truck: 318 0%, 319 4%, 320 88%, 321 26%, 322 39%, 360 98%, 367 6%, 373 77%, so "weak estimate" would print on 320, 322, 360 and 373; their in-sample hits mostly reflect a fill-in set to the same trucks' pooled recovery. The missing-pieces rule matters most on 367 (73% of retail carries the note: likely 7,465 to 6,409).
- **Pass line** (likely within 4 points on at least 75% of trucks, median miss 3 or less; on an $80k lot 4 points is $3,200, about 13% of a $24k take) **is failed by history-only rates on Target.** Decision: ship 1 ships the seeded rates labelled "judgement", shows this miss history on every result, and says "thin"; the line stays as the gate for computed rows and for Walmart and Amazon. The real test is **forward scoring** of the Aug-Sep Target trucks (and later ones) as they pass about 4 months, reported to Bill each time.
- **Band coverage** is reported with every test (a quartile band should hit about half; the whole-truck 24-40% band, which is the in-sample quartiles of these 8 trucks, covers 4 of 8: POs 318 (42.0%) and 319 (40.9%) fall above it, and the bedding truck 367 (15.4%) and PO 321 (21.3%) fall below: two low, two high, which is what a quartile band should do). Reproduce: `sh q.sh -A -F, --csv -f loo.sql > loo.csv`, then `python loo.py` (history-only) and `python loo_hand.py newdef` (seeded rates, in-sample).

## A4. Live lots list (ship 4)

One row per live SPOT lot (about 207), no cards or browsing: vendor, title (links to B-Stock), retail, current price, ends (closing day and time), manifest status, **room** = bid-up-to at 20% minus current price. Lots with a stored manifest rank first, then the rest, each by room as a share of retail. Whole-truck estimate unless a manifest is stored; formula freight; same source and age tags; sellers with no number show "not yet". Contract lots in a collapsed group, no room. Each row has Estimate Profit and the star (and the Watch button once ship 2 exists). Honest limit: without manifests the room mostly reflects price to retail and freight, which B-Stock's list already shows as % of MSRP; if Bill finds nothing he would not have noticed, the list is dropped and its manifest-first idea moves into ship 6 (want list). Once ship 6 exists, a Want-share column and a "Want first" sort are added.

## A5. Live watch and snipe alerts (ship 2)

- **Watch:** reuses `WatchlistEntry` (the star). Ship 2 adds the **Watch button on the estimate** (max defaults to bid-up-to at 20%, editable). About 10 SPOT lots. One batch call per tick; every 10 min far out, 60 s in the last hour, 15 s in the last 10 min; overrides `poll_interval_seconds` (300). Ship 2 begins with a test of the endpoint at 15 s. Each poll re-reads `end_time`: B-Stock's own page says the end time can move "unless the auction is extended by popcorn bidding" (`bstock-detail.png`). Tab shows "last polled N s ago".
- **Alerts, once each:** **window open** 10 minutes before the end and **last call** 2 minutes before (both Bill settings), price jump (15%+ since last poll, max 5 per lot), over max, extended, ended; stall alert if no poll for 3 min while a watched lot ends within an hour.
- **Alert content:** lot title, vendor, current price and bids, Bill's max and bid-up-to, minutes left, link to the lot on B-Stock.
- **Channel:** last call goes by text once texting is live (`texting.live`; approval pending); until then email and the bell. Email can lag minutes and the bell works only while Dash is open, so the 10-minute alert is the dependable one; the Watching tab says so.
- **Runner (question 1):** an always-on worker ticking every 15-60 s (Heroku Basic dyno about $7 a month at list price; confirm on the plan).

## A6. Buy Now (ships P and 3)

- **Ship P (alongside, read-only):** log one raw search and one detail payload for lot 677978; store the real key and a flag; **confirm the price unit against B-Stock's page on that lot** (settle the $107.50 vs $10,750 gap: 1% starting bid or a unit slip; name which); test whether search sorts newest or filters Buy Now; measure B-Stock's own Saved Search Alert delay with one test search; count active marketplaces. **If the probe fails:** ship 3 is not built (a pasted Buy Now link already works in ship 1), Bill keeps B-Stock's saved-search alert as the trigger, and the Buy Now value waits for a better field; the page says so.
- **Ship 3, alert:** refuses to alert until the price unit is confirmed. Scan newest lots every 2-5 min, one search request per active marketplace per tick (Costco only while the login is live); estimate at the Buy Now price (whole truck unless a manifest is stored); alert when landed % is at or under 23% and retail over $3,000, once per lot. Text: vendor, title, retail, Buy Now price, landed %, profit range, "whole truck, no manifest" or "from manifest", the measured-miss line, link to B-Stock. Blocked until question 1 is answered.

## A7. Want list (ship 6)

Earliest start: after ships 1, 1b, 2 and 3, about week 5 for one coder at a week per ship; Bill's customer signal is asked then (question 3 starts it sales-only).

- **One list: our ~23 buckets** (`taxonomy_v1`), each Want / Neutral / Skip, seeded as a **proposal for Bill to confirm** from units sold per week and days to sell only (not weeks of cover). Sales only; the next signal is the one Bill names in question 3.
- Placement: with a manifest, seller category -> our bucket by a mapping Bill can correct (`CategoryMapping`); without one, B-Stock's `Auction.category` through the same mapping; otherwise **unsorted**. Each share names its source. A title guess is never counted.
- Beside each category, plain facts, no verdict: units sold per week (90 days), median days to sell, recovery incl. unsold, units on the shelf now.
- "Worth a look" tab: live lots ending in 3 days with Want share above Bill's number; the row says why.

## A8. Manifest request (ship 7, summary)

New record `ManifestRequest` (auction, requested_by, requested_at, state). Superuser only. Requested lots bypass the shortlist window, freshness test and retry wait, not the hard ones (lot id, active marketplace, not ended, not blocked, not contract). Freshness reads `last_listed_at`. A request made mid-job waits; when the job ends and the login is live, the next job starts on its own, requested lots first. States: No manifest / Not pulled / Requested (age, amber after 24 h) / Pulling (lots) / Pulled / Failed (reason, Retry or Upload CSV). A pulled manifest gets the ship 1 sum-product and rules.

## A9. Freshness, words and states (ship H and all ships)

- `last_listed_at`: written only by the sweep upsert when a lot appears in results. After a complete sweep of a marketplace, absent lots with a past end time become closed; absent lots with a future end time show "No longer listed (reason unknown)". **Live = listed within 3 hours.**
- First run: column empty, every lot "not seen" until the next sweep stamps it. Backfill of ended lots is a production data request in Dash for Bill to approve.
- Words: "Bid now" only when live; "Last bid seen" after; "Buy Now" only when captured. Until ship P, no Buy Now label and no landed % on a lot that could have an unknown Buy Now price.
- Empty: "No live lots match." Stale: amber bar "Last sweep 3 h ago" (superuser: Refresh now). Error: real text + Retry. Loading: fixed-height skeletons. Phone: cards with reserved lines; short source tags (B = B-Stock, H = our history, F = freight estimate), full words in the panel.
- **Kept, not used by Deals:** Need score, Priority, truck value v1, seller factors, close model, price target, decision panel, hazards, AI title categories, wish list ranks, thumbs: left in place on old pages. Report cards and Won/Lost stay and later compare each estimate with the actual.

## A10. Decided defaults (Bill may change any)

Staff see Deals and estimates; only superusers get alerts and the manifest button (today's `IsStaff` / superuser split). Rates assume a tag near 55% of retail until ship 5. 5% B-Stock fee (one setting). Snipe alerts at 10 and 2 minutes. Buy Now alert at 23% landed or less on $3,000+ retail. Price-jump alert at 15%. Freight band +25% truckload, +20% LTL. Handling 0 until set. Contract lots: no bidding features. Texting turned on when its approval clears.

## A11. Full ladder (each ships alone; done-when)

| # | Ship | Blocked by | Done when |
|---|---|---|---|
| H | Fix stale status (`last_listed_at`, complete-sweep close), alongside | nothing | Live lots about 250, none past end |
| P | Buy Now field and price-unit probe (A6), alongside, read-only | nothing | A Buy Now lot's price matches B-Stock and the unit is confirmed, or the fallback is recorded |
| 1 | Target Estimate Profit (A2): paste (lot in our table), CSV drop, sum-product on seeded rates, whole-truck without CSV, Halloween/Christmas season rule, missing-pieces rule, bid up to, your number, measured-miss line | nothing | Bill sees the result on a lot he knows; with Bill-typed B-Stock freight, price + 5% fee + freight is within $25 of B-Stock's landed cost on 3 lots (formula freight shown separately with its band); `target_tl.csv` run reports the missing-pieces effect (compare $1-1.5k); on a lot Bill knows, the whole-truck profit (no CSV) equals retail x 31.4% minus landed to within $1, with the band edges 24% and 40% shown and the word "wide" |
| 1b | Fetch a brand-new lot; editable rates; text hard-sell rules; handling and haircut; deep lines flagged; Walmart and Amazon after their leave-one-out | 1 | A lot listed in the last 10 minutes works; a changed rate shows its source; Walmart and Amazon each pass A3 or say "not yet" |
| 2 | Watch button, live watch and snipe alerts (A5) | question 1 | Alerts once each at 10 min and 2 min; a stalled watch alerts |
| 3 | Buy Now alert (A6) | P, question 1 | Beats B-Stock's own saved-search alert |
| 4 | Live lots list (A4) | 1 | Bill finds a lot he would not have noticed, or it is dropped and its manifest-first ordering moves into 6 |
| 5 | Rates for more sellers; 55% tag test across every vendor; deep-quantity pricing by kind (A2); forward scoring of Aug-Sep Target trucks | 1 | A seller moves from "not yet" to whole-truck or category; `deep.py` re-run with the kind map reports the move in likely; forward miss reported to Bill |
| 6 | Want list, Worth a look (A7) | 1, question 3 | Bill: looks like what sells here |
| 7 | Manifest request (A8) | question 2 | Requested manifest arrives or says why not |
| 8 | Retire unused old pieces with Bill's say | Bill | |

## Change log

- **v11:** Part 1 example replaced with two real Target trucks whose category rows carry the retail (POs 318 and 367) run through the ship 1 rules, with the "untested" and "weak estimate" statements; Part 1 cut to about 230 words and names all four values; whole-truck rate stated exactly (31.4%); `loo_rules.py` result added to A3; how the two warning tags read together stated.
- **v10:** change log moved to the end; Part 1 showed the ship 1 screen; band coverage corrected to 4 of 8; yes/no questions; want-list timing (about week 5); no-CSV done-when made a calculation; "weak estimate" rule; ship 3 fallback and ship 4 drop target.
- **v9:** headline method measured on 8 real Target trucks (history-only leave-one-out: median miss 4.9 points, 4 of 8 within 4, worst 18); pass line fails, so seeded rates ship labelled "judgement" with the miss line; fill-in rate 31% (band 24-40%); ship 1 cut to a week; ladder reordered.
- **v1-v8:** replaced the v0 B-Stock browse rebuild with the four value pieces, then fixed the manifest request, deep quantity, season, contract lots, price unit and ship numbering.
