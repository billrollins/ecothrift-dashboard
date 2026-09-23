> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-013 · recon · Data quality: sales, disputes, shrink, inventory counts

**Why:** Build the data-quality register for the end of the lifecycle. Register: `.ai/extended/data-quality.md` (read its rules and table first). Scope:
- `pos` `Cart`, `CartLine`, and returns or refunds if they exist;
- `Item` sold, lost and scrapped fields, and dispute fields;
- webstore orders and reservations;
- anything that looks like an inventory count or audit (routines tallies, section checks).

**Answer these:**

1. **Rails today.** For each model: the key fields, what code sets each one (`path:line`), the first date it was ever filled, and its fill %, all-time and last 90 days. Include refunds, returns and voids: how are they recorded, and do they reverse `Item.status`?
2. **Check these register rows** with fresh counts: SAL-01 to SAL-03, SHR-01, SHR-02. Say "confirmed", or correct them.
3. **Look for new issues.** At least these:
   - sold items with `sold_for` of 0 or null, or above retail;
   - sold items with no completed cart line;
   - cart lines with no item (misc sales);
   - duplicate sales of one item;
   - `sold_at` outside store hours or in the future;
   - discounts over 50%;
   - dispute usage (what `dispute_type` values exist, counts, and what sets them);
   - items `on_shelf` with a `sold_at`;
   - on-shelf age buckets (0–30, 31–90, 91–180, 180+ days since `listed_at`) by category.
4. **Counts and shrink signals:** is there any record today of a physical count, a "not found", or a routine tally tied to items (`apps/routines`)? What would the Monday floor count need to write so shrink can be measured? Describe the gap; don't design it.
5. **Give every issue as a register row:** proposed ID (next free SAL-nn, DSP-nn or SHR-nn), Stage, Issue, Scope (counts, as of date), Affects, Handling (suggested, with the rule), Rail (suggested), Status `open`.

**Result:** `.ai/comm/runner/results/R-013-dq-sales-disputes-shrink.md`. Read-only; no outside calls.
