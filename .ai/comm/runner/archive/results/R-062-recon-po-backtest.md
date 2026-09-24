# R-062 · Recon: tie old POs to their B-Stock auctions, and backtest the valuation on finished trucks
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 17:34 · **Finished:** 2026-09-24 17:36 · **Status:** done

Dev database, read-only. "120 days ago" is 2026-05-27. Category for the prediction is `product.category.name`, matched to `CategoryStats.category` (23 stats rows). Item retail is `Item.retail`. Every qualified PO had `PurchaseOrder.retail_value` set, so that field was used and the item-retail fallback was not.

## 1. Which POs are B-Stock trucks

Top vendors. B-Stock sellers are Target (two codes), Amazon, Walmart, Costco, Wayfair, and Home Depot. 300 POs on those seven vendor rows.

| Vendor | Code | POs | Median total_cost | With manifest_row_count > 0 |
|---|---|---:|---:|---:|
| Target | TGT | 69 | 5,417 | 0 (0%) |
| Amazon | AMZ | 67 | 2,695 | 8 (12%) |
| Walmart | WAL | 52 | 5,583 | 6 (12%) |
| Costco | CST | 46 | 2,333 | 5 (11%) |
| Generic | GEN | 40 | | 0 |
| Target | TRGET | 33 | 4,307 | 13 (39%) |
| Wayfair | WFR | 18 | 5,240 | 0 |
| Home Depot | HMD | 15 | 11,640 | 1 (7%) |
| Essendant | ESS | 5 | 3,373 | 0 |
| The Island of Misfit Items | MIS | 2 | | 0 |
| Nebraska Furniture Mart | NFMRT | 1 | 1,160 | 1 |
| Ramaekers | RAM | 1 | 3 | 0 |

## 2. Links to auctions

| Rule | POs |
|---|---:|
| (a) order number, description, or notes equals `lot_id` or `external_id` | 0 |
| (b) one candidate: same seller name, ended within 7 days before `ordered_date`, price within 3% of `purchase_cost` | 3 |
| (b) two or more candidates | 22 |
| (b) no candidate | 275 |

All three unique (b) matches, seed 62 (the whole set):

| PO | Auction | Mark |
|---|---|---|
| 316 `AMZ0N-OQL-CCP4`, $4,025, 24 pallets, retail $119,901. "24 Pallets of FBA Home Improvement" | 9951, same price, 24 pallets, same retail, same title | right |
| 323 `WLMRT-OJU-3V74`, $5,737, 22 pallets, retail $57,374. Same truckload title | 102777, same price, 22 pallets, same retail, same title | right |
| 363 `TRGET-O7D-FRTF`, $700, 6 pallets, retail $17,528. "6 Pallets of Wall Décor" | 198045, same price, 4 pallets, retail $7,346. "4 Pallets of Amazon-Owned Furniture" | wrong |

## 3. Backtest on finished trucks

B-Stock-vendor POs ordered on or before 2026-05-27, with items, and at least half of those items sold: **201**. Predicted revenue is Σ `Item.retail` × that category's `recovery_rate`.

| | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| actual ÷ predicted | 201 | 0.576 | 0.698 | 0.844 |
| actual ÷ PO retail | 201 | 0.162 | 0.216 | 0.273 |

By vendor, n ≥ 5:

| Vendor | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| target | 71 | 0.641 | 0.712 | 0.884 |
| amazon | 41 | 0.489 | 0.603 | 0.701 |
| costco | 37 | 0.623 | 0.776 | 0.872 |
| walmart | 37 | 0.664 | 0.771 | 0.886 |
| wayfair | 9 | 0.226 | 0.272 | 0.368 |
| home depot | 6 | 0.580 | 0.670 | 0.748 |

By year of `ordered_date`:

| Year | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| 2024 | 94 | 0.539 | 0.659 | 0.811 |
| 2025 | 100 | 0.622 | 0.732 | 0.868 |
| 2026 | 7 | 0.600 | 0.844 | 1.056 |

Lowest actual ÷ predicted: Wayfair POs 125, 238, 97, 237, 50 (ratios 0.21 to 0.27). Highest: Target 319 (1.09), Walmart 264 (1.19), Walmart 152 (1.24), Costco 235 (1.26), Walmart 228 (1.31).

## 4. Unsold tail

On those 201 POs: 43,735 of 126,949 items are still unsold (34.5%). Their retail is $1,884,222. Sold items: 83,214.

## Observations

- Past trucks cannot be backfilled onto auctions. Lot id and external id never appear on the PO. Price-and-date matching is unique for 3 of 300 and wrong for 1 of those 3.
- The category-rate prediction runs hot. Actual revenue is about 0.70 of predicted (median). A calibration factor near 0.70 would line the report card up with these trucks.
- The factor is not one number. Wayfair is about 0.27, Amazon about 0.60, and Target, Walmart, Costco, and Home Depot sit around 0.67 to 0.78.
- By year it moved from 0.66 in 2024 to 0.73 in 2025. 2026 is only 7 trucks, median 0.84.
- Most of these POs have no manifest row count. The sales backtest does not need the manifest. The auction link does, and it is not there.
