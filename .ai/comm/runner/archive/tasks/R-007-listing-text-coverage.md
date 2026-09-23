# R-007 · recon · What listings tell us without signing in

**Why:** Listing triage (Phase 3) scores every live listing from its public data alone. We need to know how complete that data is today, per marketplace.

**Scope:** `buying.Auction` rows whose `last_updated_at` is in the last 30 days (dev DB).

**Answer these:**

1. **Field coverage by marketplace:** for each marketplace, the count of auctions and the % with a usable value in each of these:
   - `title`, `category`, `condition_summary`;
   - `lot_size` (units), `total_retail_value`, `current_price`;
   - `pallet_count`, `origin_city`, `shipment_type`, `lot_id`, `end_time`.

   `pallet_count`, `origin_city` and `shipment_type` are new today and filled only by sweeps since then. Say how many rows have them.
2. **Title patterns**, by marketplace: the % of titles that contain each of these. Use a throwaway script in `workspace/runner/R-007/`.
   - a pallet count (`N Pallet(s)`, `N Pallet Spaces`, `Truckload (N ...)`);
   - units (`N Units`);
   - `Ext. Retail $N`;
   - a condition word (New, Like New, Used - Good, Used - Fair, Salvage, Returns, Uninspected);
   - a trailing `City, ST`;
   - a lot code like `(DAL-6973667)`.
3. **Where the title and the fields disagree** (up to 10 examples): the title's units or retail against `lot_size` / `total_retail_value`.
4. **Misses:** for each marketplace, 5 titles where no pallet count or city could be found anywhere.
5. **Category text:** the 20 most common `category` values per marketplace, with counts.

**Result:** `results/R-007-listing-text-coverage.md`. Read-only; no outside calls.
