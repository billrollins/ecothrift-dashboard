# R-064 · Chore: re-run the manifest analysis and the valuation with the fixes
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 18:08 · **Finished:** 2026-09-24 18:29 · **Status:** done

## Steps 1 and 2

`analyze_manifests --all --force`: **analyzed 98, unchanged 0, failed 0 in 1196s**.

`recompute_buying_valuations`: **Recomputed 160 auctions.** About 4 seconds. R-055's run of the same command recomputed 17,291.

## 3a. The four Costco appliance trucks

R-055's log had value 0.00 for all four. There is no stored "before" for `price_target` or `expected_close` in that result. Now:

| id | analysis revenue | estimated_revenue | price_target | expected_close | current_price | priority |
|---:|---:|---:|---:|---:|---:|---:|
| 476952 | 21,890.44 | 21,890.44 | 6,219.24 | 5,675.00 | 5,675.00 | 75 |
| 477313 | 2,899.40 | 2,899.40 | 460.12 | 825.00 | 825.00 | 53 |
| 477424 | 25,832.64 | 25,832.64 | 8,801.49 | 7,705.00 | 7,705.00 | 75 |
| 477471 | 2,606.17 | 2,606.17 | 618.56 | 1,125.00 | 1,125.00 | 44 |

None of the four has `retail_mismatch`.

Auction 523: `retail_mismatch` is `{'scale': 0.001448, 'listing_retail': '96167.05', 'manifest_retail': '66394033.29'}`. Value went from 24,561,272.58 in R-055's log to 35,564.52. `estimated_revenue` is 35,564.52, `price_target` 12,765.75, `expected_close` 6,539.36, `current_price` 110.50, priority 60.

## 3a2. Hazard lines

| Code | R-055 | Now |
|---|---:|---:|
| bulk_line | 2,589 | 2,589 |
| fragile | 1,046 | 836 |
| high_value | 2,025 | 2,025 |
| high_volume | 1,628 | 1,628 |
| incomplete | 9 | 0 |
| part | 2 | 0 |
| stocked | 142 | 142 |
| zero_retail | 86 | 86 |

## 3b. Value changes

Matched lines: R-055 log 4,296, this run 4,215.

Largest absolute changes in the logged "value":

| id | R-055 value | Now |
|---:|---:|---:|
| 523 | 24,561,272.58 | 35,564.52 |
| 477424 | 0.00 | 25,832.64 |
| 476952 | 0.00 | 21,890.44 |
| 477313 | 0.00 | 2,899.40 |
| 477160 | 1,322.14 | 4,001.11 |
| 477471 | 0.00 | 2,606.17 |
| 476953 | 33,037.54 | 35,327.44 |
| 477012 | 15,830.28 | 17,600.67 |
| 477197 | 2,573.29 | 4,159.16 |
| 477532 | 2,270.22 | 2,599.53 |

## 3c. Wishlist

`live_total` 56, `eligible` 30. R-055 was 111 and 34.

| priority | marketplace | top_category | current_price | max_bid | room | state | hazard_count |
|---:|---|---|---:|---:|---:|---|---:|
| 88 | Target | Household & cleaning | 4100.00 | 4753.77 | 653.77 | in_range | 0 |
| 86 | Walmart | Household & cleaning | 3450.00 | 3505.55 | 55.55 | in_range | 0 |
| 86 | Target | Toys & games | 346.00 | 37552.93 | 37206.93 | in_range | 0 |
| 83 | Home Depot | Tools & hardware | 100.00 | 2094.19 | 1994.19 | in_range | 1 |
| 82 | Target | Bedding & bath | 8600.00 | 13783.42 | 5183.42 | in_range | 0 |

## 3d. Decision for 477424

Verdict: `Bid up to $8,801. 1 hazard to check. Similar lots closed near your max, so expect a fight.`

`landed`: bid 7705.00, fee 385.25, freight 2383.13, labor 0.00, disposal 0.00, total 10473.38, recovery 23249.38, profit 12776.00, fee_rate 0.0500, ship_rate null, labor_units 58 (manifest), disposal_pallets 58 (listing), recovery_pct_of_retail 31, value_basis_pct 0.0, filled_categories `["Appliances"]`, store_rate 0.347029, seller_factor null.

## Observations

- The four $0 appliance trucks now have a revenue, and 523's manifest is scaled back to the listing. Those two fixes show up in the numbers.
- `part` and `incomplete` are gone (0 lines). `fragile` fell from 1,046 to 836. The other hazard counts did not move.
- This valuation command refreshed 160 auctions, not the 17,291 from R-055. The live wishlist also fell from 111 to 56. If ended auctions are supposed to keep a stored valuation, this run did not refresh them.
