> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-062 · Recon: tie old POs to their B-Stock auctions, and backtest the valuation on finished trucks

- **Type:** recon · **Database:** dev, read-only (write your own read-only script under `workspace/runner/R-062/`; no product code) · **Time box:** 90 minutes
- **Why:** The report card and the calibration (`apps/buying/services/won_to_po.py`: `report_card`, `calibration`) only count trucks won through the new "We won it" button, so they start empty. Older POs already hold years of trucks, with their items and sales. If they can be tied to auctions, or valued directly, the calibration gets history now instead of in 90 days.

## Questions

1. **Which POs are B-Stock trucks.** Count `inventory.PurchaseOrder` by vendor (top 15): POs, the median `total_cost`, and the share with a manifest (`manifest_row_count > 0`). Which vendors are B-Stock sellers (Target, Walmart, Amazon, Costco, Home Depot, Wayfair and so on)?
2. **Links to auctions.** For those vendors' POs, try to find the `buying.Auction` each one came from:
   - (a) a lot or listing id in `order_number`, `description` or `notes` equal to `Auction.lot_id` or `Auction.external_id`;
   - (b) failing that, the same marketplace name as the vendor, `end_time` within 7 days before `ordered_date`, and `current_price` within 3% of `purchase_cost`.

   Report the matches by (a), by (b), and ambiguous ones (2 or more candidates). Mark 15 random (b) matches **right**, **wrong** or **unsure** by comparing titles, pallets and retail.
3. **Backtest on finished trucks.** Take the POs of those vendors that were delivered or ordered 120 or more days ago, that have `inventory.Item`s, and with 50% or more of those items sold (`sold_at` set).
   - For each PO, give:
     - `actual_revenue = Σ sold_for`;
     - `retail = PurchaseOrder.retail_value`, or Σ item `retail_value` when it is blank (say which you used);
     - a **category prediction**: Σ over items of the item's retail × `buying.CategoryStats.recovery_rate` for its category (`Item.category`, or the product's category; say which);
     - the ratio `actual ÷ predicted`.
   - Report n, and the median, p25 and p75 of the ratio: overall, by vendor (n ≥ 5), and by year of `ordered_date`.
   - Also give `actual ÷ retail`, and the 5 POs with the lowest and the highest ratio (id, vendor, items, sold %, actual, predicted).
4. **Unsold tail.** For the same POs: the share of items still unsold after 120 days, and their total retail.

## Hand back

- The tables for questions 1–4.
- **Observations** (5 lines at most):
  - Can we link past trucks well enough to backfill their outcomes?
  - What overall calibration factor would the backtest give?
  - Does the factor differ by seller or by year?
