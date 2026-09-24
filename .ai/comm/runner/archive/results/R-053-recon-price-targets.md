# R-053 · Recon: expected close price and price-target calibration
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 15:46 · **Finished:** 2026-09-24 15:48 · **Status:** done

Dev database, read-only, as of 2026-09-24 15:46 local. Ended means `end_time` in the past. A last known price means `current_price > 0`. Ratio is `current_price / total_retail_value`. Bid bucket uses `COALESCE(bid_count, 0)`. Condition group is `condition_group()` in `apps/buying/services/condition.py` (five named groups plus `unspecified`). There are six marketplaces in this database, not eight.

## 1. Close ÷ retail

16,863 ended auctions. 16,456 are still `status=open`; 407 are `closed`.

Overall: n 16,863 · p25 0.035 · median 0.065 · p75 0.111.

| Marketplace | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| target | 8,052 | 0.038 | 0.068 | 0.118 |
| walmart | 4,400 | 0.032 | 0.075 | 0.115 |
| amazon | 2,260 | 0.043 | 0.066 | 0.100 |
| homedepot | 1,333 | 0.005 | 0.021 | 0.062 |
| costco | 495 | 0.052 | 0.081 | 0.114 |
| wayfair | 323 | 0.023 | 0.033 | 0.050 |

| Condition group | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| used_good | 7,904 | 0.038 | 0.066 | 0.110 |
| used_fair | 4,890 | 0.024 | 0.064 | 0.111 |
| new | 1,753 | 0.041 | 0.084 | 0.150 |
| like_new | 1,674 | 0.032 | 0.053 | 0.092 |
| damaged | 600 | 0.012 | 0.037 | 0.079 |
| unspecified | 42 | 0.005 | 0.020 | 0.088 |

| Bids | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| ≥ 5 | 10,086 | 0.044 | 0.075 | 0.120 |
| < 5 | 6,777 | 0.021 | 0.044 | 0.100 |

Cells with n ≥ 30 (marketplace × condition × bid bucket). 23 cells qualify. Another 22 cells have rows but n < 30.

| Cell | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| target / used_good / <5 | 1,994 | 0.036 | 0.046 | 0.106 |
| target / used_good / ≥5 | 3,926 | 0.039 | 0.069 | 0.110 |
| target / like_new / <5 | 119 | 0.037 | 0.065 | 0.131 |
| target / like_new / ≥5 | 274 | 0.046 | 0.081 | 0.129 |
| target / new / <5 | 489 | 0.035 | 0.041 | 0.100 |
| target / new / ≥5 | 1,250 | 0.058 | 0.097 | 0.164 |
| walmart / used_fair / <5 | 1,640 | 0.011 | 0.055 | 0.111 |
| walmart / used_fair / ≥5 | 2,149 | 0.057 | 0.090 | 0.130 |
| walmart / used_good / <5 | 36 | 0.109 | 0.123 | 0.130 |
| walmart / like_new / <5 | 339 | 0.001 | 0.050 | 0.075 |
| walmart / like_new / ≥5 | 201 | 0.002 | 0.026 | 0.046 |
| amazon / used_good / <5 | 748 | 0.031 | 0.052 | 0.085 |
| amazon / used_good / ≥5 | 817 | 0.057 | 0.085 | 0.125 |
| amazon / like_new / ≥5 | 671 | 0.043 | 0.058 | 0.085 |
| homedepot / damaged / <5 | 331 | 0.010 | 0.025 | 0.071 |
| homedepot / damaged / ≥5 | 255 | 0.019 | 0.050 | 0.125 |
| homedepot / used_fair / <5 | 571 | 0.003 | 0.017 | 0.021 |
| homedepot / used_fair / ≥5 | 174 | 0.030 | 0.052 | 0.076 |
| costco / used_fair / <5 | 59 | 0.023 | 0.047 | 0.073 |
| costco / used_good / <5 | 244 | 0.053 | 0.079 | 0.096 |
| costco / used_good / ≥5 | 118 | 0.090 | 0.147 | 0.207 |
| wayfair / used_fair / <5 | 128 | 0.018 | 0.025 | 0.036 |
| wayfair / used_fair / ≥5 | 155 | 0.031 | 0.044 | 0.057 |

## 2. Last-hour uplift

`buying_auctionsnapshot` has 642 rows: 465 captured on or after 2026-09-23 (461 auctions) and 177 older. A "before" price is the snapshot closest to the target inside a ±15 minute band (45–75 min, 165–195 min, 1,425–1,455 min). Final is a snapshot within 10 minutes of `end_time` when one exists, otherwise `current_price`.

| Window | n | Median final ÷ before | Of which had a snapshot within 10 min of the end |
|---|---:|---:|---:|
| 1 hour | 28 | 1.00 | 14 |
| 3 hours | 59 | 1.00 | 0 |
| 24 hours | 0 | | |

## 3. Which last price is stored

The hourly sweep writes `current_price` on every listing it still sees (`apps/buying/services/sweep_upsert.py:56`) and `last_updated_at` in the same update (`sweep_upsert.py:65`). It inserts an `AuctionSnapshot` only when the price or the bid count moved (`sweep_upsert.py:158`).

Among ended auctions with a positive price, `last_updated_at` is a median 28 minutes before `end_time` (n = 16,810 with `last_updated_at` at or before the end). A snapshot exists for only 439 of those ended auctions. For those, the last snapshot is a median 230 minutes before `end_time` (p25 170, p75 284). 53 of those last snapshots are after `end_time`. 2 are inside the 10 minutes before the end.

## 4. Manifest vs listing retail

Line retail is `SUM(COALESCE(quantity, 1) * retail_value)`, the unit price from R-052. Divided by `total_retail_value`. Every auction that has manifest rows matches the listing total.

| Marketplace | n | p10 | Median | p90 |
|---|---:|---:|---:|---:|
| costco | 32 | 1.000 | 1.000 | 1.000 |
| target | 28 | 1.000 | 1.000 | 1.000 |
| walmart | 18 | 1.000 | 1.000 | 1.000 |
| homedepot | 14 | 1.000 | 1.000 | 1.000 |
| amazon | 5 | 1.000 | 1.000 | 1.000 |
| wayfair | 1 | 1.000 | 1.000 | 1.000 |

## Observations

- Likely close = retail × 0.065 overall. Split it: about 0.07 for Target, Walmart, Amazon and Costco, 0.02 for Home Depot, 0.03 for Wayfair. A truck with 5 or more bids closes higher (0.075) than one with fewer (0.044).
- 23 marketplace × condition × bid cells are thick enough to use. 22 more exist but have n under 30, and the rest of that grid is empty.
- Do not apply R-033's 1.17 last-hour uplift. The new snapshots give median 1.00 on 28 auctions, and there is no 24-hour pair.
- `current_price` is a near-end sweep price (about 28 minutes before the end). The snapshot table is not a close-price series yet: 439 ended auctions, last point about 4 hours out.
- Manifest line retail and the listing's `total_retail_value` are the same number on all 98 auctions that have rows.
