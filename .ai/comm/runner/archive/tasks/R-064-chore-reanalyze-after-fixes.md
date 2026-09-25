> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-064 · Chore: re-run the manifest analysis and the valuation with the fixes, and report the change

- **Type:** chore · **Database:** dev (this task **may write**: it runs the two named commands only) · **Time box:** 90 minutes
- **Code:** the main tree as it is.
- **Why:** R-055 ran before three fixes:
  - **Store-wide rate for new categories.** A category with no recovery rate of its own now uses the store-wide rate (`apps/buying/services/recovery.py`). Before, Appliances was 0, and 4 Costco appliance trucks (476952, 477313, 477424, 477471) were valued at $0.
  - **Near lookups by retail.** Near-title lookups now go to the titles with the most retail first.
  - **Units and pallets fill-in.** When the unit count or the pallet count is missing, it is estimated from the other.
  - **Manifest over the listing.** A manifest whose retail is more than 3× the listing's is scaled back to the listing (auction 523 was 690×). Report 523's `manifest_analysis['retail_mismatch']` and its value.

## Steps
1. From `C:\Coding\ecothrift-dashboard`, run:
   `venv\Scripts\python.exe manage.py analyze_manifests --all --force > workspace\runner\R-064\1-analyze.log 2>&1`
   Report the last line.
2. Then run:
   `venv\Scripts\python.exe manage.py recompute_buying_valuations > workspace\runner\R-064\2-recompute.log 2>&1`
   Report the last line and how long it took.
3. Read-only, in `manage.py shell`:
   - (a) For auctions 476952, 477313, 477424 and 477471, give `analysis_revenue`, `estimated_revenue`, `price_target`, `expected_close`, `current_price` and `priority`, before (from R-055's result, if it has them) and now.
   - (a2) Hazard lines per code now, next to R-055's table (bulk_line 2,589 · fragile 1,046 · high_value 2,025 · high_volume 1,628 · incomplete 9 · part 2 · stocked 142 · zero_retail 86). The hazard rules were tightened after R-060.
   - (b) Compare this run's `1-analyze.log` with R-055's, auction by auction:
     - list the 10 auctions whose "value" changed most (id, old, new);
     - give the total "matched" lines in each run.
   - (c) Run `from apps.buying.services.wishlist import build_wishlist; d = build_wishlist()`. Give `live_total` and `eligible`, and for the first 5 rows: `priority`, `marketplace`, `top_category`, `current_price`, `max_bid`, `room`, `state` and `hazard_count`.
   - (d) Run `from apps.buying.services.decision import decision` and call `decision(Auction.objects.get(pk=477424))`. Give its `verdict` and `landed` (the whole dict).

## Hand back
The step 1 and 2 lines, the tables for step 3, and **Observations** (3 lines at most): anything that looks wrong.
