> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-061 · Recon: backtest the likely close and the similar-lots range

- **Type:** recon · **Database:** dev, read-only (write your own read-only script under `workspace/runner/R-061/`; no product code) · **Time box:** 75 minutes
- **Why:** The auction page shows a "likely close" (`apps/buying/services/price_target.py`, `expected_close`) and a "similar lots closed" range (`apps/buying/services/decision.py`, `_similar`). The verdict uses both ("expect a fight", "will likely get away"). This task checks how often they are right on auctions that already ended.

## Questions

1. **Likely close vs the final price.** Take the ended auctions of the last 60 days that have `total_retail_value > 0` and a final `current_price > 0`. For each one, find the latest `AuctionSnapshot` 2–4 hours, 45–75 minutes, and 20–30 hours before `end_time`, when there is one. At each of those points, compute what `expected_close` would have said. To do that, copy the auction in memory, set `current_price` to the snapshot price, and call `expected_close(copy, now=snapshot_time)`. Do not save anything. Report per point: n, the median of `final ÷ predicted`, the p25 and p75, and the share within ±15%. Split by marketplace for the top 5.
2. **Similar-lots range.** For 300 of those auctions (seed 61), rebuild the similar lots as they were at the auction's end. Use the same seller, the same main category (the largest weight in `valuation._mix_for_auction`), ±2 pallets, and lots that ended in the 30 days before this auction's `end_time`, 5 lots at most. Report:
   - the share with 2 or more similar lots;
   - where the final close fell: inside [min, max], below it, or above it;
   - the median of `final ÷ median(similar closes)`.
3. **Early price vs close.** The same 60 days: `final ÷ price 20–30 hours before`. Give the median, and split by bid count at that time (< 5 vs ≥ 5).

## Hand back

- The tables for questions 1–3.
- **Observations** (5 lines at most):
  - Is the late bump (1.17 in the last hour, 1.35 in the last 3 hours) about right?
  - Would you widen the similar-lots window or the ±2 pallets?
  - Which sellers need their own ratio?
