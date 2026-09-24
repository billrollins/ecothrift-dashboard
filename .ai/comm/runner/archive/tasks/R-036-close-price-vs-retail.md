> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-036 · Close price ÷ retail from the auctions we already have

- **Type:** recon (dev DB read-only) · **Time box:** 40 min
- **Why:** R-033 had only 54 auctions with a snapshot at the close. `Auction.current_price` is refreshed by every hourly sweep until the listing drops out, so for many ended auctions the last stored price is close to the final price. That could give a baseline "expected close = retail × ratio" for early auctions, before real price history builds up.

## Do
1. **Ended auctions:** `end_time` in the past, with `last_updated_at` within 2 hours before `end_time` (so the stored price is near final). How many are there, by marketplace? Say what share of all ended auctions that is.
2. **Close ÷ `total_retail_value`:** for those, give the median and the 25th and 75th percentiles:
   - by marketplace;
   - by condition group (`apps/buying/services/condition.py` `condition_group`);
   - by the top category of the AI or manifest mix (use `top_categories` logic: manifest distribution first, else `ai_category_estimates`);
   - by pallet count band (1, 2–5, 6–12, 13+).
3. **Same, with `bid_count`:** is the ratio different for auctions with fewer than 5 bids?
4. **Sanity check:** compare with R-033's 54 exact closes (Target 0.111, Walmart 0.133, Amazon 0.053). Do they agree?

## Hand back
The tables, n in every cell, and a one-line verdict on whether marketplace × condition medians are stable enough (n ≥ 30) to use.
