# R-004 result · Sales data we can use

Dev DB, read 2026-09-23. "Last 12 months" = `Item.status = 'sold'` and `sold_at >= 2025-09-23 17:57 UTC` (55,012 items). "Last 18 months" starts 2025-03-24, so March 2025 and September 2026 are partial. Category is the same taxonomy bucket as Need (`apps/buying/services/taxonomy_bucket_sql.py:31-39`): product category name if it is a taxonomy v1 name, else manifest-row category, else Mixed lots. Queries: `workspace/runner/R-004/query.py` and `extra.py`.

## 1. Where a sale lives

The sold record used everywhere below is the inventory item, not a separate sale model.

| Step | Model / field | Line |
|---|---|---|
| Sale price | `Item.sold_for` | `apps/inventory/models.py:1860` |
| Sale date | `Item.sold_at` | `models.py:1859` |
| Item | `Item` | `models.py:1776` |
| Product | `Item.product` → `Product` | `models.py:1807-1810` |
| Category | `Product.category` → `Category.name` | `models.py:1554-1558` |
| PO | `Item.purchase_order` | `models.py:1811-1814` |
| Vendor | `PurchaseOrder.vendor` → `Vendor` | `models.py:86` |

POS checkout writes the sale: completed `Cart` / `CartLine`, then `item.status = 'sold'`, `sold_at = now`, `sold_for = line_total / quantity`. `apps/pos/views.py:1485-1505`. `CartLine.item` is `pos/models.py:254-256`.

**Channel.** `Item` has no channel field. Of 55,012 items sold in 12 months, **55,008** have a completed POS cart line. **0** have a completed web reservation. Webstore `Order` rows in that window: **0**. `Reservation` rows in the whole table: 1, status `expired`. Online holds are completed at the register (`pos/views.py:1508` comment); the sale row is still the POS cart. Legacy `webstore.Order` (`apps/webstore/models.py:518-547`) has `fulfillment` pickup vs ship and is not what these items point at.

**Discount / cash-back.** No Thrift+ or cash-back field on `Item`, `Cart`, or `CartLine`. Discounts are `CartLine.sale_percent`, `sale_label`, and `line_kind = 'discount'` (`pos/models.py:263-286`). `sold_for` is the net unit price after `sale_percent` (`CartLine.save`, `pos/models.py:306-309`, then `pos/views.py:1505`). In the 12-month sold set, **1,388** items (2.5%) have a completed cart line with `sale_percent > 0`.

## 2. Days to sell

Date columns on `Item`:

| Asked | Column | Line | Set when |
|---|---|---|---|
| Created | `created_at` | `models.py:1889` | Row insert. |
| Received | none | | No received timestamp. `checked_in_at` is the shelf check-in. |
| Priced | none | | `price` has no priced-at. |
| Shelved | none by that name | | `listed_at` (`models.py:1845`) is set with `checked_in_at` when the item goes `on_shelf` (`processing_ops.py:1820-1822`). |
| Sold | `sold_at` | `models.py:1859` | POS checkout. |
| Also | `label_printed_at` | `models.py:1854-1858` | Label print. Migration `0067` backfilled it from check-in or created. |

Of 55,012 sold in 12 months:

| Date | Have it | Share | Median days (sold − start) | Sold before this date |
|---|---:|---:|---:|---:|
| `created_at` | 55012 | 100% | -75.3 | 32983 |
| `checked_in_at` | 17396 | 31.6% | 13.2 | 0 |
| `listed_at` | 21859 | 39.7% | 18.1 | 0 |
| `label_printed_at` | 54656 | 99.4% | -76.4 | 33002 |
| `sold_at` | 55012 | 100% | | |
| `sold_for` | 55012 | 100% | | |
| `retail` > 0 | 54574 | 99.2% | | |
| a PO | 49885 | 90.7% | | |

Every item with `checked_in_at` has `listed_at` equal to it (17,396). `listed_at` also covers 4,463 more.

**Best start: `listed_at`.** It is the shelf timestamp in current code, nothing in this window sold before it, and it covers more rows than `checked_in_at`. `created_at` and `label_printed_at` are filled on almost every row and are unusable: the median is negative because the stamp is after the sale (imports and the label backfill).

Using `listed_at`, **20,135 / 21,859 = 92.1%** of items that have the date sold within 90 days. The other 33,153 sold items have no shelf date, so their days to sell are unknown.

## 3. Last 12 months by category (top 25 by revenue)

There are 19 taxonomy buckets, so this is all of them. Revenue is `SUM(sold_for)`. Median days and the 90-day share use `listed_at`, and only rows that have it. `listed` is how many of the units have that date.

| Category | units | revenue | median price | median sold/retail | median days | sold ≤90d | listed |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mixed lots & uncategorized | 43533 | 569763.64 | 7.61 | 0.434 | 31.0 | 84.1% | 10381 |
| Household & cleaning | 1629 | 13808.73 | 2.75 | 0.544 | 7.8 | 99.9% | 1629 |
| Kitchen & dining | 1112 | 11640.56 | 4.89 | 0.358 | 9.9 | 99.0% | 1112 |
| Outdoor & patio furniture | 415 | 11616.54 | 18.11 | 0.550 | 21.0 | 100% | 415 |
| Toys & games | 732 | 9966.80 | 10.88 | 0.500 | 6.2 | 99.9% | 732 |
| Tools & hardware | 692 | 7720.74 | 3.99 | 0.500 | 23.0 | 96.2% | 691 |
| Health, beauty & personal care | 1633 | 7523.18 | 3.50 | 0.502 | 18.0 | 99.2% | 1633 |
| Bedding & bath | 501 | 7147.88 | 9.85 | 0.364 | 11.0 | 99.8% | 501 |
| Home décor & lighting | 590 | 6423.09 | 5.03 | 0.365 | 9.9 | 100% | 590 |
| Apparel & accessories | 942 | 5796.26 | 4.36 | 0.450 | 13.9 | 98.2% | 942 |
| Electronics | 306 | 4571.27 | 6.08 | 0.551 | 14.2 | 100% | 306 |
| Sports & outdoors | 240 | 4243.50 | 6.99 | 0.512 | 9.0 | 99.6% | 240 |
| Pet supplies | 548 | 3916.02 | 5.99 | 0.500 | 13.2 | 100% | 548 |
| Office & school supplies | 1073 | 3805.34 | 2.34 | 0.500 | 10.9 | 100% | 1073 |
| Storage & organization | 230 | 1770.39 | 5.85 | 0.500 | 4.0 | 100% | 230 |
| Baby & kids | 233 | 1642.53 | 3.56 | 0.552 | 7.1 | 100% | 233 |
| Books & media | 256 | 1504.80 | 5.00 | 0.371 | 8.0 | 99.2% | 256 |
| Furniture | 44 | 1453.07 | 20.24 | 0.450 | 10.0 | 100% | 44 |
| Party, seasonal & novelty | 303 | 900.91 | 2.00 | 0.306 | 15.1 | 100% | 303 |

Product category names on these sold items are the taxonomy names. The top name is Mixed lots, 43,531 of 55,012. Named categories almost all have `listed_at`. Mixed lots has it on 10,381 / 43,533.

## 4. Same, by vendor (top 10 by revenue)

Vendor is `PurchaseOrder.vendor`. Items with no PO are one row.

| Vendor | units | revenue | median price | median sold/retail | median days | sold ≤90d | listed |
|---|---:|---:|---:|---:|---:|---:|---:|
| TRGET Target | 18275 | 220954.03 | 7.76 | 0.462 | 19.9 | 93.5% | 3965 |
| AMZ Amazon | 10526 | 123450.15 | 8.40 | 0.473 | 14.2 | 97.4% | 2353 |
| WAL Walmart | 13431 | 117752.36 | 3.99 | 0.501 | 11.2 | 99.2% | 9824 |
| (no PO) | 5127 | 54241.49 | 5.99 | 0.350 | 47.0 | 73.9% | 5066 |
| CST Costco | 2071 | 49576.44 | 15.39 | 0.483 | 4.2 | 98.4% | 246 |
| HMD Home Depot | 1443 | 49518.25 | 19.16 | 0.473 | 14.9 | 100% | 203 |
| GEN Generic | 1327 | 25422.12 | 9.44 | 0.470 | 0.0 | 100% | 6 |
| MIS The Island of Misfit Items | 2459 | 22048.39 | 3.75 | 0.150 | 14.0 | 100% | 195 |
| WFR Wayfair | 329 | 11624.99 | 8.99 | 0.082 | | | 0 |
| ESS Essendant | 22 | 601.99 | 6.26 | 0.020 | | | 0 |

Median days for GEN is 6 items. Wayfair and Essendant have no `listed_at` in this window. Target, Amazon, Costco, Home Depot, and Misfit have a shelf date on a small share of units, so the day stats are not the whole vendor.

## 5. Monthly trend (18 months, all categories)

| Month | units | revenue |
|---|---:|---:|
| 2025-03 | 894 | 15071.06 |
| 2025-04 | 4063 | 78831.69 |
| 2025-05 | 5147 | 85620.34 |
| 2025-06 | 4439 | 71367.44 |
| 2025-07 | 3148 | 45826.29 |
| 2025-08 | 906 | 17078.35 |
| 2025-09 | 4019 | 61736.47 |
| 2025-10 | 11010 | 132872.74 |
| 2025-11 | 8227 | 116891.68 |
| 2025-12 | 5428 | 52563.24 |
| 2026-01 | 2185 | 34769.36 |
| 2026-02 | 2758 | 47404.32 |
| 2026-03 | 1614 | 27226.81 |
| 2026-04 | 1552 | 17809.70 |
| 2026-05 | 2574 | 41835.70 |
| 2026-06 | 4470 | 35832.21 |
| 2026-07 | 6044 | 65103.86 |
| 2026-08 | 4041 | 46590.82 |
| 2026-09 | 3348 | 32226.40 |

March 2025 starts the 24th. September 2026 stops on the 23rd.

## 6. Shelved over 90 days and still unsold

`status = 'on_shelf'` and `listed_at` before 2026-06-25. Every on-shelf item has `listed_at` (31,128 of 31,128). **11,017** items, retail **416,459.29** (`SUM(retail)`).

| Category | count | retail |
|---|---:|---:|
| Mixed lots & uncategorized | 7811 | 369238.75 |
| Apparel & accessories | 886 | 16909.81 |
| Health, beauty & personal care | 660 | 11572.93 |
| Tools & hardware | 634 | 4721.77 |
| Pet supplies | 132 | 3240.14 |
| Household & cleaning | 210 | 2021.94 |
| Outdoor & patio furniture | 73 | 1792.68 |
| Sports & outdoors | 97 | 1392.15 |
| Toys & games | 193 | 1391.37 |
| Kitchen & dining | 75 | 1279.97 |
| Books & media | 50 | 711.17 |
| Electronics | 34 | 622.70 |
| Bedding & bath | 40 | 527.31 |
| Baby & kids | 31 | 434.01 |
| Office & school supplies | 46 | 227.25 |

Fifteen buckets are the top 15. Mixed lots is most of the retail.

## 7. Existing code

| Path | What it does |
|---|---|
| `apps/buying/models.py:88-109` | `PricingRule.sell_through_rate`: a stored sold/retail ratio per category, not days. |
| `apps/buying/management/commands/seed_pricing_rules.py:1-90` | Loads that ratio from a CSV. It points at `scripts/data/build_sell_through_rates.py`, which is not in the repo. |
| `apps/inventory/management/commands/backfill_phase5_categories.py:810-838` | Recomputes `PricingRule.sell_through_rate` as `SUM(sold_for) / SUM(price)` on sold items whose notes start with `BACKFILL:`. |
| `apps/buying/services/category_stats_sql.py:76-101` | `recovery_rate`: all-time `SUM(sold_for) / SUM(retail)` on the good-data cohort. |
| `apps/buying/services/category_stats_sql.py:234-247` | Median days from `COALESCE(checked_in_at, listed_at, created_at)` to `sold_at`, and the share within 90 days, stored on `CategoryStats`. Not a sell-through rate. |
| `workspace/notebooks/category-research/cr/categorize.py:323-330` | Notebook metric `avg_days_to_sell_bin2`: mean of `cart_completed_at − processing_completed_at` for bin 2. |
| `apps/pos/services/dashboard_metrics.py:97-125` | Daily sales dollars and items sold. Not days to sell. |

`PurchaseOrder.avg_sell_through` was removed in `apps/inventory/migrations/0023_po_est_shrink_remove_cost_pipeline_fields.py`.
