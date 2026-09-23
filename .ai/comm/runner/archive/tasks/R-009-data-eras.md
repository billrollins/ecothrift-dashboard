> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-009 · recon · Data eras: find the database restarts and imports

**Why:** Eco-Thrift has had at least 3 database restarts over 4+ years, with imports and backfills between them. Every trend and average mixes those eras. We need era boundaries, and which fields can be trusted in each. The register is `.ai/extended/data-quality.md` (ERA-01).

**Answer these:**

1. **Creation profile per table.** For `inventory_item`, `inventory_product`, `inventory_purchaseorder`, `inventory_manifestrow`, `pos_cart` (or the completed-sale table), and `buying_auction`, give a month-by-month table: rows created (by `created_at` or the nearest date), min and max `id` created that month, and the % of rows with each key date filled:
   - items: `sold_at`, `listed_at`, `checked_in_at`, `sold_for`, `retail`, `cost`, `purchase_order_id`, `product_id`;
   - POs: `ordered_date`, `delivered_date`, `purchase_cost`, `shipping_cost`.

   Flag months with sudden jumps or `id` gaps.
2. **Import markers.** Find rows or code that show imports or backfills:
   - notes starting `BACKFILL:` and other note prefixes;
   - management commands with import, backfill or legacy in the name (`path:line`, what they import);
   - migrations that load data;
   - `.ai/initiatives/_archived/_pending/historical_data_export.md` and `historical_sell_through_analysis.md`: what they say about V1, V2 and V3.
3. **Time that runs backwards.** By month: counts of items with `sold_at < created_at`, and with `listed_at > sold_at`. These show where imports stamped dates after the fact.
4. **Era table.** Your best reading, as a table: era name, date range, source (legacy import, native app, backfill), tables affected, and fields that are trustworthy or not in that era. Mark guesses `UNKNOWN`.

**Result:** `.ai/comm/runner/results/R-009-data-eras.md`. Read-only; no outside calls. Put the scratch queries in `workspace/runner/R-009/`.
