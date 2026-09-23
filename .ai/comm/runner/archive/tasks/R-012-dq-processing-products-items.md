> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-012 · recon · Data quality: preprocessing, processing, products, items

**Why:** Build the data-quality register for the middle of the lifecycle. Register: `.ai/extended/data-quality.md` (read its rules and table first). Scope:
- inventory `ManifestRow`, `PreprocessingRow`, `ProcessingRow`, `ItemCheckIn` and `ItemHistory`;
- `Product`, `Category` and `VendorProductRef`;
- `Item`.

**Answer these:**

1. **Rails today.** For each model: the key fields, what code sets each one (`path:line`), the first date it was ever filled, and its fill %, all-time and last 120 days. For `Item`, cover:
   - `product`, `purchase_order`, `manifest_row`;
   - `price`, `retail`, `cost`;
   - `status`, `condition`, `location`;
   - `listed_at`, `checked_in_at`, `sold_at`, `sold_for`, `dispute_type`.
2. **Check these register rows** with fresh counts: PO-03, PO-04, ITM-01 to ITM-06, PRD-01, PRD-02. Say "confirmed", or correct them.
3. **Scrapped and lost (ITM-06):** what sets `scrapped` and `lost` (`path:line`)? Counts by year and month of `updated_at`. Which POs or vendors do they come from? Do they carry a reason anywhere (notes, history)? Is it one big era cleanup?
4. **Look for new issues.** At least these:
   - items with price 0 or null, or retail 0 or null, by status;
   - cost of 0 or null on purchased items;
   - price above retail;
   - items whose category comes from neither product nor manifest;
   - products with no category, or with a category outside taxonomy v1 (list the names and counts);
   - `Category` table names that are not taxonomy names;
   - `ManifestRow` quantity 0 or huge (> 500);
   - items with a `manifest_row` from a different PO than `item.purchase_order`.
5. **Give every issue as a register row:** proposed ID (next free PRE-nn, PRD-nn or ITM-nn), Stage, Issue, Scope (counts, as of date), Affects, Handling (suggested, with the rule), Rail (suggested), Status `open`.

**Result:** `.ai/comm/runner/results/R-012-dq-processing-products-items.md`. Read-only; no outside calls.
