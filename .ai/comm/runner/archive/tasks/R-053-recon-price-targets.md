> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-053 · Recon: expected close price and price-target calibration

- **Type:** recon · **Database:** dev, read-only · **Time box:** 60 minutes
- **Why:** Buying Phase 5 shows a "likely close" and a price target per auction. R-036 (archive) gave close ÷ retail medians; R-033 gave the last-hour uplift (1.17, n = 19). The sweep has been saving price snapshots (`AuctionSnapshot`) since 2026-09-23, so there should be more data now.

## Questions

1. **Close ÷ retail**, for ended auctions (`Auction.status` closed/ended, or `end_time` in the past) with `total_retail_value > 0` and a last known price: median, p25, p75 and n, split by:
   - marketplace (top 8 by count);
   - condition group (`apps/buying/services/condition.py`, the 6 groups);
   - bid bucket: < 5 bids vs ≥ 5.
   Report the cells with n ≥ 30 as one table: marketplace × condition group × bid bucket.
2. **Last-hour uplift, again.** For auctions with an `AuctionSnapshot` 45 to 75 minutes before `end_time` **and** one within 10 minutes of it (or a final price): ratio final ÷ 1-hour-before, median and n; the same for 3 hours before, and 24 hours before when present.
3. **Which "last price" is stored** on an ended auction (`current_price`), and how close to `end_time` it usually was captured (median minutes, from the last snapshot). Cite `path:line` of the code that writes it in the sweep.
4. **Manifest vs listing retail.** For auctions with manifest rows: Σ manifest line retail (per R-052's unit/line answer if it is done; otherwise say which you assumed) ÷ `total_retail_value`: median, p10, p90, n, by marketplace.

## Hand back

Tables for 1–4 and **Observations** (5 lines max): the multipliers you would use for "likely close = retail × m", and how many cells are too thin.
