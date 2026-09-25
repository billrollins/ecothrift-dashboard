<!-- initiative: slug=buying-intelligence-v2 status=active updated=2026-09-25 -->
<!-- Last updated: 2026-09-25 -->

# Initiative: Buying intelligence v2

**Status:** **Active**, Phase 1 not started. Plan agreed with the owner on 2026-09-25.

**Objective:** The owner buys B-Stock trucks on a truck value he can trust. Today the value is retail × a category rate, and on 201 finished trucks it ran about 30% hot (R-062). Instead, each manifest line should be priced from what similar items really sold for here, and how fast they sold. Only the sales we can make inside our time goal should count, and categories we are already overstocked in should be capped. Four other things come with it:
- **Product vectors made for matching.** An AI-written "vector text" per product drives dedupe, fast categorization and manifest matching.
- **A QA inbox.** The superuser sees and approves every data-quality call there, fast.
- **A buying loop that runs itself.** It shortlists and watches lots, polls them near the end, and alerts by email.
- **One coherent buying workspace.**

**Compass:** this file is the compass. It takes over from [`bstock_daily_buying`](./bstock_daily_buying.md) (Phases 1–6 done in v2.104.0; its open items move here). It absorbs [`product_intelligence`](./product_intelligence.md) Phases 4–6 (dedupe, enrich, intake) and [`data_quality_rails`](./data_quality_rails.md) Phase 3 (the review loop).

---

## How the phases ship

- **Five phases, about a week each.** Every phase goes from start to finish on its own: built, tested by the runner (a full pre-ship run as the gate), committed, pushed, and deployed to production.
- **Bugs between phases.** The owner can fix bugs between phases, and no phase leaves half-built code in production.
- **Owner OKs.** Each phase names the production data writes it needs.
- **Behind a switch.** Where a phase changes how trucks are valued, the new way ships behind a setting next to the old one, with a side-by-side comparison. The owner flips it.

**Before Phase 1** (carried over from `bstock_daily_buying`):
- [x] v2.104.0 and v2.105.0 deployed (Heroku v363, 2026-09-25; migrations buying 0032–0036 applied).
- [x] `fit_seller_factors --save` in production. It used 201 finished trucks: Target 0.791, Amazon 0.670, Walmart 0.856, Costco 0.862, Wayfair 0.303, Home Depot 0.744. `recompute_buying_valuations` followed.
- [ ] The similar-lots range switches to the retail-scaled one (R-068: the band is 1.32× the median, not 1.89×).

---

## Finish line

On the Buying workspace, the owner opens **Today** and gets three things:
- the day's 1–2 lots, already watched and polled every few seconds near the end;
- a truck value built line by line from similar items' real sales, capped at what sells inside the time goal and at 150% of target weeks of supply;
- the share of the truck that sells in that time, what is left over, and why.

An email tells him when to bid and asks whether he won. In the **QA inbox** he clears the day's data-quality calls in minutes: merges, placements, profiles and stale records, each with evidence and one-key accept or reject.

---

## Out of scope

- **Placing bids.** Automated or AI bidding on B-Stock stays out; the ideas are kept under **Notes** below. The app tells him when and how much.
- **B-Stock credentials.** No stored B-Stock passwords, no automated login, and no CAPTCHA handling. The daily login hand-off stays, only faster.
- **Labor and TARS costs in truck value.** These come in about a year, per the owner. For now, value is about sales.
- **QA checks outside Data Quality.** Finance, HR and the rest come after this initiative. The QA framework is built so they plug in.
- **Marketplaces other than B-Stock.**

---

## Phases

### Phase 1 — The QA inbox, and dedupe and backfill as routine work
The superuser has one fast place to approve data-quality calls, and the catalog cleanup (backfill proposals, duplicate merges) becomes a routine that feeds it.
**Gated by:** none (after v2.105.0).

Scope:
- **QA framework.**
  - `QaCheck` is a registry of deterministic checks, like tests but over live data. Each one has a domain (`data_quality` first), a standard it enforces (text), a query that finds offenders, and a fix it can propose.
  - `QaIssue` holds the check, the objects involved, the severity, the dollars at stake, the evidence, the proposed fix, the fix's confidence, and a status (open / proposed / accepted / rejected / snoozed / auto).
  - `run_qa_checks` runs nightly on the Scheduler, and on demand per check.
- **AI triage.** A batch model call reads each new issue with a constant context: the QA standards doc (`.ai/extended/qa-standards.md`, new), the data-quality register and the taxonomy rulings. It writes a proposed fix, a one-line reason and a confidence.
  - High confidence on a check the owner has marked "auto-OK" is applied automatically, and it can be undone.
  - Everything else goes to the inbox.
- **QA inbox**, a superuser page built for speed:
  - issues grouped by check, sorted by dollars;
  - `J`/`K` to move, `A` to accept, `R` to reject, `E` to edit, `S` to snooze;
  - bulk accept for a whole cluster;
  - a side-by-side compare for merges (titles, photos, UPCs, specs, sales);
  - every action is logged and can be undone (`CatalogMerge.unmerge`, profile field history).
- **Data-quality checks to start with:**
  - duplicate products: same UPC, same title and brand, near title with the same specs;
  - pending product proposals (the existing Product review queue folds into the inbox);
  - V1/V2 products still in "Mixed lots";
  - POs stale in delivered or processing (PO-01);
  - sold items with no PO (ITM-04);
  - manifests far off their listing retail;
  - categories valued with no rate of their own.
- **Production load, with owner OK:**
  - the backfill proposals (366k auto-accepts; Mixed goes from 89.6% to 4.3% of sales);
  - brand aliases;
  - the first dedupe merges, run through the inbox.
- **V2 and V3 both usable.** Sales, products, categories and (in Phase 2) vectors work across eras (ERA-01).

Acceptance:
- [ ] `run_qa_checks` finds issues for each starting check on dev, and the runner's spot check agrees with 90%+ of them.
- [ ] In the QA inbox, the owner clears 50 issues in under 5 minutes, and any accept can be undone.
- [ ] In production, the backfill is applied and the first merge batch goes through the inbox. Mixed lots are under 10% of 2-year sales.
- [ ] The ship gate is GREEN, and `apps/pos` and processing have 0 NEW failures.

### Phase 2 — Vector text: the true product vector, used everywhere
Every product and every manifest line gets an AI-written "vector text", a dense keyword dump of everything that describes it, and that text is what gets embedded. The vectors then drive dedupe, fast categorization and matching.
**Gated by:** Phase 1.

Scope (detail when Phase 1 is built):
- **Preprocessing profile.** One AI call per manifest row (batched), fed everything we know about the row: the manifest columns, UPC/ASIN/TCIN, brand, seller category, retail, and the matched product if there is one. It returns:
  - a title and a short name (price tag);
  - a description;
  - a category and subcategory;
  - attributes (size, color, material, count);
  - the **vector text**: brand, type, use, material, audience, style, size words and synonyms, with no filler.
  - Stored with provenance in `ProductProfile` (`field_meta`), and on the manifest row for buying.
- **The embedding input.** Vectors are re-embedded from the vector text, not the title, and they cover V2 and V3 products alike. The gold set sets the bar: nearest-5 placement must beat today's 90.5% from title and brand.
- **Dedupe uses vectors.** Near neighbours with matching specs become merge candidates in the QA inbox. Trigram and UPC stay as the first rungs.
- **Fast categorization.** A nearest-neighbour vote places a row before any model call (the cheap rung of the intake ladder), and the model only sees the rows the vote is unsure of.
- **Buying matching.** A manifest line matches by UPC, then title, then **vector**, lifting the match rate from 14% (R-055).
- **Backfill.** Vector text for the catalog, prioritized by sold dollars.

### Phase 3 — Price and speed: the truck value that counts only what sells in time
For each manifest line, predict what it sells for and how fast, from similar items' real sales here. Then value the truck only on the sales that fit inside the time goal, with overstock capped.
**Gated by:** Phase 2.

Scope (detail when Phase 2 is built):
- **Price model.** Sold price and retail of the nearest sold neighbours (vector, then category), era-aware and weighted by recency. It gives a price point and a range. Later, maybe a small learned model over the vector plus context (condition, seller, season).
- **Speed model.** The demand rate (units a week) of similar items, and the weeks each unit takes to sell.
- **Supply cap (owner idea 4).**
  - Weeks of supply is counted per product and per similar-item cluster, not just per category.
  - Supply past 150% of the target weeks is worth nothing.
  - Ten years of candles adds nothing; a first shelf of a missing item adds a lot.
- **Truck value v3.**
  - For each line: the units sellable within the **horizon** H (Assumptions, e.g. 4–8 weeks), given the demand rate minus the stock and pipeline we already have, × the predicted price.
  - The truck total, the **share sold within H**, and what is **left over** after H: units, retail, and a rough value later.
  - "10,000 units at $1 that take 10 years" contributes only H weeks of sales.
- **Backtest before switching.** Replay finished trucks (R-062's 201) and the report cards; v3 must beat v2, where v2 × the seller factor was a median 0.70. Ship behind `buying_valuation_model` = v2 | v3, with both shown on the auction page until the owner flips it.
- The report cards and the seller factors stay as the check on v3.

### Phase 4 — The buying loop runs itself
The shortlist, the watching, the near-end tracking and the alerts happen without the owner starting them. He only hands over the login and bids.
**Gated by:** Phase 3.

Scope (detail when Phase 3 is built):
- **Auto-shortlist.** After each sweep, the top lots by Priority are auto-watched; Priority uses v3 value, Need and profit. Then an **AI review** reads the shortlist with the store context (need, stock, won and on-order, the report cards) and writes a short take on each. It adds flags; it does not re-rank on its own.
- **Automatic Pull.** Manifests and freight quotes are pulled for the shortlist whenever a login is live. The login hand-off is one tap from the email or the nag, and it stays manual per B-Stock.
- **Near-end polling.** A worker polls watched lots every minute in the last hour and every 10–15 seconds in the last 10 minutes. The snapshots feed the close model. This needs a worker dyno: the owner decides on the cost.
- **Alerts.** Email, plus phone push if cheap:
  - "Bid now: $X max, ends 3:40";
  - "Did we win?";
  - a morning digest of Today's plan.
  - Quiet hours, and superuser only.
- Also: a freight hazard (freight over X% of the price), and the retail-scaled similar-lots range in the verdict (if not done before Phase 1).

### Phase 5 — The Buying workspace
One coherent, tabbed Buying workspace instead of separate pages. The owner said today's pages are about 10% of what he wants.
**Gated by:** Phase 4.

Scope (detail when Phase 4 is built):
- **Design first.** An owner walkthrough, then 2–3 layouts as clickable mockups (tabs versus a side rail). The owner picks before any build.
- **Probable shape:**
  - **Today**: plan, shortlist, nags, live countdowns;
  - **Auctions**: every live lot with the decision columns;
  - **Truck**: one lot, tabbed into Decision, Manifest, Value (v3, horizon, leftovers), History and Notes;
  - **Won**: POs and report cards;
  - **Need**: supply by category and cluster;
  - **Settings**: the buying Assumptions.
- Phone first for Today and Truck. Desk first for Auctions and Manifest.
- The QA inbox's layout patterns (keyboard, fast accept) carry over.

---

## Acceptance

- [ ] Phase 1: QA inbox, and dedupe and backfill as routine work
- [ ] Out-of-scope items stay out

---

## Notes

**AI-assisted bidding (owner, 2026-09-25: notes only).**
- **Bid assistant, the safest.** At T−2 minutes a push or email says "bid $X now, max $Y" with a one-tap link. The owner places the bid.
- **B-Stock's own max bid.** If B-Stock extends an auction when a bid lands near the end, sniping at T−30 s gains little. Entering the computed max as B-Stock's own max bid near the end does the same job. Confirm B-Stock's extension and max-bid behaviour first.
- **Armed auto-snipe, only if B-Stock's terms allow it.**
  - The owner arms a lot "up to $X". At T−30 s a server job bids the minimum increment, never above the max, with a kill switch and an audit log.
  - It needs a live login token, which lasts about an hour.
  - The AI sets the max and the strategy; the bid itself is plain code with a hard cap.

**Owner ideas captured (2026-09-25):**
- QA covers every domain eventually (Finance, HR, Inventory…), the same pattern: deterministic checks, then AI triage, then the superuser inbox.
- Labor and TARS go into truck value in about a year.

---

## Record

**2026-09-25 — Before Phase 1.** Shipped v2.105.0 and deployed it to Heroku v363, which took v2.104.0 live too. The seller factors are saved in production (the numbers above) and the open auctions were re-valued. The owner asked for all of this to be done for him.

**2026-09-25 — Opened.** The owner laid out 8 goals after v2.104.0; this is the 5-phase plan, each phase shipped to production on its own.

---

## See also

- Before this: [`bstock_daily_buying`](./bstock_daily_buying.md), [`product_intelligence`](./product_intelligence.md), [`data_quality_rails`](./data_quality_rails.md)
- Data rules: [`.ai/extended/data-quality.md`](../extended/data-quality.md) · Taxonomy: [`.ai/extended/product-taxonomy.md`](../extended/product-taxonomy.md) · B-Stock: [`.ai/extended/bstock.md`](../extended/bstock.md)
- Index: [`_index.md`](./_index.md)
