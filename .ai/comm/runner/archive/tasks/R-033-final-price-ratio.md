> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-033 · How much does the price rise before an auction closes?

- **Type:** recon (dev DB read-only) · **Time box:** 45 min
- **Why:** profit and Priority use the **current** price. Early in an auction that makes profit look like 400–800%. Phase 5 needs a price target, so first learn how the price moves from a given hour to the close.

## Do
1. Find where price history lives: `AuctionSnapshot` (`apps/buying/models.py`) and anything else that stores price over time. Cite `path:line` and say how often a snapshot is taken.
2. For **closed** auctions with a snapshot near the end (the last snapshot within 1 hour of `end_time`), treat that price as the final price. For each auction, find the price at about 48, 24, 12, 6 and 1 hours before the end (the nearest snapshot within ±25% of that gap).
3. Report `final ÷ price_at_T` for each T: median, 25th and 75th percentiles, and n, overall and by marketplace (Target, Walmart, Amazon, Home Depot, Costco, Wayfair).
4. Also report the median final price ÷ `total_retail_value` by marketplace, and by condition group using the R-024 grouping (in `apps/buying/services/condition.py`, `condition_group`).
5. How many auctions have enough snapshots for this? If coverage is thin, say what snapshot cadence would be needed.

## Hand back
The ratio tables, the coverage numbers, and one line on whether "expected final = current × median ratio at T" looks usable.
