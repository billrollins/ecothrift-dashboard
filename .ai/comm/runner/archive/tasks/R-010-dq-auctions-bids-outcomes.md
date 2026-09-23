> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-010 · recon · Data quality: auctions, bids, outcomes

**Why:** Build the data-quality register for the first lifecycle stages. Register: `.ai/extended/data-quality.md` (read its rules and table first). Scope: the `apps/buying` models.

**Answer these:**

1. **Rails today.** For `Auction`, `AuctionSnapshot`, `ManifestRow` (buying), `CategoryMapping`, `WatchlistEntry`, `Bid`, `Outcome`, `ManifestPullLog` and `ManifestPullJob`, list:
   - the key fields;
   - what code sets each one (`path:line`);
   - the first date it was ever filled;
   - its fill %, all-time and last 90 days.
2. **Check these register rows** with fresh counts: AUC-01 to AUC-06. Say "confirmed", or correct them.
3. **Look for new issues.** At least these:
   - duplicate auctions (same `lot_id` or same title and end time);
   - prices of 0 or null on closed auctions;
   - `status` against `end_time` (open but ended);
   - `total_retail_value` against manifest retail (big gaps);
   - buying `ManifestRow`s with no `fast_cat_value`, or with retail of 0 or null ($0 lines can mean soft-deleted);
   - `CategoryMapping` conflicts (the same key text mapped differently by vendor prefix);
   - marketplace-level gaps.
4. **Give every issue as a register row:** proposed ID (next free AUC-nn), Stage, Issue, Scope (counts, as of date), Affects, Handling (suggested: use / fill / flag / exclude / unknown, with the rule), Rail (suggested), Status `open`.

**Result:** `.ai/comm/runner/results/R-010-dq-auctions-bids-outcomes.md`. Read-only; no outside calls.
