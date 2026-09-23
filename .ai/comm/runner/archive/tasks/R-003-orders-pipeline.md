# R-003 · recon · Orders pipeline: won through shelved

**Why:** Need v2 adds "pipeline" stock: auctions won, POs entered, preprocessed, shipped, received, and in processing but not shelved. We need to know what the data can tell us at each stage, and by category.

**Answer these:**

1. **PurchaseOrder stages.** List every status-like field on `apps/inventory/models.py` `PurchaseOrder`, with its choices and `path:line`:
   - `status`;
   - `preprocess_status`, `receiving_status` and `processing_status`;
   - the dates (`ordered_date`, `paid_date`, `shipped_date`, `expected_delivery`, `delivered_date`, `receiving_*`).

   Say in one line each what the stage means in the app. Check the views and services that set it.
2. **Counts** (dev DB): POs grouped by (`status`, `processing_status`) for POs ordered in the last 120 days, with count, oldest ordered_date, and sum of `retail_value`.
3. **Category mix of open POs.** For POs not fully processed, can we get units and retail by canonical category?
   - Which model holds the lines: inventory `ManifestRow`, staging or preprocessing rows? Which field holds the category (canonical / taxonomy_v1 or other)?
   - Show, for up to 10 open POs: order_number, status/processing_status, rows, rows with a category, units by top 3 categories.
   - How many open POs have no manifest lines at all?
4. **Items not on the shelf.** `Item` status choices (`path:line`), and a count of items by status. Which statuses mean "in the building but not on the shelf"? Which mean "on the shelf"? Which field holds the item's canonical category?
5. **Auction to PO.** Is there any link between `buying.Auction` and `PurchaseOrder`, such as a field or an FK? If not, for POs from the last 120 days, how many have a `description` that exactly equals some `Auction.title`, and how many match on the first 60 characters?
6. **Won auctions.** Counts of `Outcome` (win true/false), `WatchlistEntry` by status, and `Bid`. Is anything in the code writing these today?

**Result:** `results/R-003-orders-pipeline.md`. Read-only; no outside calls.
