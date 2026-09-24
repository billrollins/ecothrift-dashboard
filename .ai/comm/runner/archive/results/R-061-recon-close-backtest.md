# R-061 · Recon: backtest the likely close and the similar-lots range
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 17:26 · **Finished:** 2026-09-24 17:28 · **Status:** done

Dev database, read-only, as of 2026-09-24 17:26 local. Ended auctions in the last 60 days with `total_retail_value > 0` and `current_price > 0`: **7,501**. Snapshots with a price on those auctions: **452**. Nothing was saved. `expected_close` was called on an in-memory copy with the snapshot price and `now` set to the snapshot time.

Inside the last 3 hours, `expected_close` returns the current price times the late bump (`price_target.py:168`). Both bumps are 1.00 (`price_target.py:52`). So the 2–4 hour and 45–75 minute points test the bump, not the seller ratio. The 20–30 hour point would test retail × the seller ratio. There is no snapshot in that window.

## 1. Likely close vs the final price

Ratio is final `current_price` ÷ what `expected_close` would have said. "Within ±15%" is that ratio between 0.85 and 1.15.

| Point | n | p25 | Median | p75 | Within ±15% |
|---|---:|---:|---:|---:|---:|
| 2–4 hours before | 163 | 0.933 | 1.000 | 1.000 | 77.3% |
| 45–75 minutes before | 7 | 1.000 | 1.000 | 1.000 | 100% |
| 20–30 hours before | 0 | | | | |

Top 5 sellers by ended-auction count in the 60 days: Target 3,208, Walmart 2,174, Amazon 696, Home Depot 651, Costco 568. Almost every 2–4 hour snapshot is Costco.

| Point | Seller | n | p25 | Median | p75 | Within ±15% |
|---|---|---:|---:|---:|---:|---:|
| 2–4 hours | costco | 157 | 0.935 | 1.000 | 1.000 | 77.7% |
| 2–4 hours | target | 6 | 0.774 | 1.000 | 1.000 | 66.7% |
| 45–75 minutes | amazon | 4 | 1.000 | 1.000 | 1.000 | 100% |
| 45–75 minutes | target | 3 | 1.000 | 1.000 | 1.000 | 100% |

Walmart, Home Depot, and the other cells in these windows have n = 0.

## 2. Similar-lots range

300 auctions, seed 61. Same marketplace, same main category from `_mix_for_auction`, ±2 pallets when both have a pallet count, ended in the 30 days before this auction, at most 5 lots, newest first. Same rules as `_similar` (`decision.py:177`), dated to the auction's end instead of today.

| | n | Share |
|---|---:|---:|
| Sample | 300 | |
| 2 or more similar lots | 292 | 97.3% |
| Final inside [min, max] of those closes | 196 | 67.1% of the 292 |
| Final below the range | 48 | 16.4% |
| Final above the range | 48 | 16.4% |
| Fewer than 2 similar lots | 8 | 2.7% of the sample |

Final ÷ median of the similar closes (n = 292): p25 0.573, median 1.035, p75 1.904. Only 13.7% of those finals sit within ±15% of that median.

## 3. Early price vs close

No auction in the 60 days has a snapshot 20–30 hours before `end_time`. Median and the bid split are empty.

## Observations

- The 1.17 last-hour bump and the 1.35 three-hour bump are too high for this data. Where a snapshot exists, the close equals the price already on the board (median 1.00). Keep the bumps at 1.00.
- Do not widen the 30-day window or the ±2 pallets. 97% of the sample already has 2 or more similar lots. The range is wide, not scarce: two thirds of closes fall inside it, but the typical close is anywhere from about half to double the similar median.
- This backtest cannot say which sellers need their own ratio. The hour where retail × ratio would be the prediction has no snapshots. The seller ratios already in the model were fit on close ÷ retail (R-053), not on this snapshot set.
