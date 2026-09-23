# R-002 result · How Need and Priority work today

Snapshot of `buying_categorystats.computed_at` = **2026-09-23 18:01:02 UTC**. Every row shares that timestamp. `need_score_1to99` on those rows matches `need_from_cover` with the stored inputs (0 mismatches). Live-auction counts were read a few minutes later (487 live).

Settings at that read: `pricing_need_window_days` = **90**, `buying_target_cover_weeks` = **0** (auto), `buying_pipeline_max_age_days` = **90**, `buying_category_goals` = null (every category is `normal`).

## 1. Formula

### Category bucket

An item's category is the product category name when that name is one of the 19 taxonomy v1 names, else the manifest-row category when that string is a taxonomy name, else `Mixed lots & uncategorized`. `apps/buying/services/taxonomy_bucket_sql.py:31-39` and `apps/buying/services/category_need.py:21-42`.

### `have_units` / `have_retail`

Count and sum of `COALESCE(retail, price, 0)` for `inventory_item.status = 'on_shelf'` only. `apps/buying/services/category_stats_sql.py:26-38`.

Statuses that count as have: **`on_shelf` only.** `intake`, `processing`, `sold`, `returned`, `scrapped`, and `lost` do not.

### `want_units` / `want_retail`

Count and sum of the same retail line for `status = 'sold'`, `sold_at >= since`, and `COALESCE(sold_for, price) >= 0.01`. `category_stats_sql.py:50-64`.

`since` is now minus `pricing_need_window_days`. The daily job reads that setting (`apps/buying/management/commands/compute_daily_category_stats.py:66-67`). The helper defaults to 90 if the row is missing (`apps/buying/services/buying_settings.py:8-16`). Dev value: **90**.

### `need_units` / `need_retail`

`want − have`. Can be negative. `category_stats_sql.py:353-354`. This gap does not subtract in-building or on-order units.

### `recovery_rate`

All-time, not the 90-day window. Sold rows where `sold_for`, `retail`, and `cost` are each between 0.01 and 9999. Rate = `SUM(sold_for) / SUM(retail)`, else 0. `category_stats_sql.py:76-101` and `330-331`.

### `need_score_1to99` (Need v2)

1. In building: items with status `intake` or `processing`, same bucket as have. `category_stats_sql.py:144-160`.
2. On order: manifest lines on POs with status `ordered`, `paid`, `shipped`, `delivered`, or `processing`, `ordered_date` within `buying_pipeline_max_age_days` (90), and no item pointing at that line. `category_stats_sql.py:142` and `204-220`. The line's `category` is a B-Stock code. `category_code_to_taxonomy` maps it to a taxonomy name when `CategoryMapping` rows whose source key contains `-api-<slug>` agree: at least 2 votes and 60%. Otherwise Mixed lots. `category_stats_sql.py:172-200` and `225-230`.
3. Weekly sales = `want_units / (window_days / 7)`. `category_stats_sql.py:386-392`.
4. Supply = have + in building + on order.
5. Target weeks: if `buying_target_cover_weeks` > 0, that number. It is **0**, so target = all supply / all weekly sales (the store's own cover), here **35.5**. Fallback 8 if nothing sold. `category_stats_sql.py:268-281` and `buying_settings.py:52-61`. A category goal multiplies that (`more` 1.5, `less` 0.5, `stop` forces score 1). No goals are stored. `category_stats_sql.py:284-304`.
6. Cover = supply / weekly sales. Score = `round(100 × (1 − cover / target / 2))`, clamped 1–99. 50 means cover equals the target. 99 means empty. Twice the target or more is 1. No sales and no supply → 50. No sales but some supply → 1. `category_stats_sql.py:301-309`.

Median days to sell and percent sold within 90 days are stored from the same window (`category_stats_sql.py:234-247`) and are not inputs to the score.

### `Auction.need_score`

Retail-weighted category mix: manifest distribution first; if that mix has a Mixed-lots weight and an AI mix exists, the Mixed weight is spread across the AI mix. No manifest mix → the AI mix. `apps/buying/services/valuation.py:63-76`. Manifest percents come from qty × retail on `ManifestRow.fast_cat_value`. `valuation.py:88-124`.

Auction need = round of the weighted sum of each category's `need_score_1to99`, clamped 1–99. Unknown category falls back to Mixed, then to 50. No weights → **50**. `valuation.py:157-182`. Written in full and lightweight recompute. `valuation.py:370` and `425`.

### `Auction.priority`

Equals `need_score` when `priority_override` is false. `valuation.py:373-374` and `428-429`. A staff save that includes `priority` sets `priority_override` true and keeps that number through the recompute that follows. `apps/buying/api_views.py:702-718`. Dev DB: **0** auctions have `priority_override` true. On the 487 live auctions, priority equals need_score on every row that was checked (the samples below, and a count of mismatches was 0 on an earlier read of the same set).

## 2. Inputs

| Input | In the score? | Evidence |
|---|---|---|
| Items on POs not yet received | Yes, as on order | PO statuses through `processing`, no item on the line, ordered in the last 90 days. `category_stats_sql.py:204-220`. |
| Received but not shelved | Yes, as in building | Item status `intake` or `processing` only. `category_stats_sql.py:144-160`. A delivered PO with no items yet is on order, not in building. |
| Auctions won with no PO | No | No read of `Outcome`, `WatchlistEntry`, or `Bid` in this SQL. |
| Days to sell | No | Stored (`_speed_rows`) and unused by `need_from_cover`. Weekly unit sales are an input. |
| Profit | No | `recovery_rate` is stored beside the score and is not an argument to `need_from_cover`. Auction `est_profit` does not change `need_score`. |

## 3. Numbers

`need_units` = want − have. Cover and the 1–99 score use have + in building + on order. Target weeks is 35.5 on every row.

| Category | have | want | need_units | in building | on order | weekly | cover wks | need 1–99 | recovery |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Apparel & accessories | 6113 | 908 | -5205 | 0 | 332 | 70.62 | 91.3 | 1 | 0.428072 |
| Baby & kids | 360 | 183 | -177 | 0 | 21 | 14.23 | 26.8 | 62 | 0.465888 |
| Bedding & bath | 786 | 443 | -343 | 0 | 24 | 34.46 | 23.5 | 67 | 0.366794 |
| Books & media | 119 | 166 | 47 | 0 | 2 | 12.91 | 9.4 | 87 | 0.389115 |
| Electronics | 1166 | 303 | -863 | 0 | 39 | 23.57 | 51.1 | 28 | 0.381091 |
| Furniture | 80 | 44 | -36 | 0 | 108 | 3.42 | 55.0 | 23 | 0.428989 |
| Health, beauty & personal care | 2010 | 1374 | -636 | 0 | 2390 | 106.87 | 41.2 | 42 | 0.420327 |
| Home décor & lighting | 987 | 559 | -428 | 0 | 99 | 43.48 | 25.0 | 65 | 0.390194 |
| Household & cleaning | 992 | 1169 | 177 | 0 | 0 | 90.92 | 10.9 | 85 | 0.481091 |
| Kitchen & dining | 2648 | 1053 | -1595 | 0 | 272 | 81.90 | 35.7 | 50 | 0.418357 |
| Mixed lots & uncategorized | 8265 | 4390 | -3875 | 290 | 4210 | 341.44 | 37.4 | 47 | 0.347010 |
| Office & school supplies | 1248 | 1007 | -241 | 0 | 677 | 78.32 | 24.6 | 65 | 0.347642 |
| Outdoor & patio furniture | 339 | 392 | 53 | 0 | 290 | 30.49 | 20.6 | 71 | 0.488015 |
| Party, seasonal & novelty | 2513 | 296 | -2217 | 0 | 0 | 23.02 | 109.2 | 1 | 0.355772 |
| Pet supplies | 408 | 527 | 119 | 0 | 8 | 40.99 | 10.1 | 86 | 0.413552 |
| Sports & outdoors | 1015 | 230 | -785 | 0 | 27 | 17.89 | 58.2 | 18 | 0.440200 |
| Storage & organization | 233 | 221 | -12 | 0 | 0 | 17.19 | 13.6 | 81 | 0.432900 |
| Tools & hardware | 1114 | 635 | -479 | 0 | 28 | 49.39 | 23.1 | 67 | 0.491464 |
| Toys & games | 732 | 695 | -37 | 0 | 323 | 54.06 | 19.5 | 73 | 0.455093 |

Live = not archived, status `open` or `closing`, `end_time` in the future. **487 live, all `has_manifest` true. 0 live without that flag.** 130 of the 487 have a category mix; **357 have the flag and a null mix**, so need and priority stay at 50.

Five live auctions with a mix, soonest `end_time` first:

| id | title | mix (top 3) | need | priority | override |
|---|---|---|---:|---:|---|
| 468951 | 4 Pallets of Rugs, 61 Units, Ext. Retail $6,722, I | Home décor 78%, Furniture 10%, Bedding & bath 3% | 60 | 60 | false |
| 468965 | 3 Pallets of Fillable Word Storage Gift Boxes, 611 | Kitchen & dining 100% | 50 | 50 | false |
| 468953 | 3 Pallets of Baby Gear, Baby Essentials & More, 76 | Baby & kids 65%, Toys & games 15%, Furniture 5% | 58 | 58 | false |
| 469860 | Truckload of Bedroom Furniture, Kitchen & Dining F | Furniture 45%, Kitchen & dining 20%, Home décor 20% | 40 | 40 | false |
| 469854 | Truckload of Sofas, Dressers & Chests, Vanities, P | Furniture 60%, Outdoor & patio 20%, Mixed lots 15% | 38 | 38 | false |

Five live auctions with `has_manifest` true and no mix (need stays 50):

| id | title | need | priority | override |
|---|---|---:|---:|---|
| 473065 | 4 Pallets of Cooling Appliances, Fans, Air Treatme | 50 | 50 | false |
| 472980 | Truckload of Exercise Equipment (CPK-7046718), Use | 50 | 50 | false |
| 473143 | 3 Pallets of Pressure Washers, Gardening, Patio Fu | 50 | 50 | false |
| 473156 | Truckload of Massage/Relaxation, Exercise Equipmen | 50 | 50 | false |
| 473204 | Truckload of Upholstered Furniture & Dining Furnit | 50 | 50 | false |

The whole table has **3** auctions with `has_manifest` false. All are closed, so they are not in the live recompute. Their stored need was not refreshed against the 18:01 category scores.

| id | title | status | mix (top 3) | need | priority | override |
|---|---|---|---|---:|---:|---|
| 469386 | 2 Pallets of Pet Supplies, 3,106 Units, Ext. Retai | closed | Pet supplies 95.05%, Toys 0.99%, Bedding 0.99% | 97 | 97 | false |
| 540 | 4 Pallets of Children's Apparel, 1,582 Units, Ext. | closed | Baby & kids 78.64%, Mixed 4.63%, Apparel 1.85% | 83 | 83 | false |
| 565 | Truckload (26 Pallets) of Storage, 737 Units, Ext. | closed | Storage 85%, Mixed 15%, Furniture 0% | 64 | 64 | false |

## 4. Observations

- `need_units` is still want minus shelf stock, so it is negative for 16 of 19 categories, while the 1–99 score is weeks of cover against the store average (35.5). Kitchen is on that average (35.7 weeks, score 50). Books is the shortest cover (9.4 weeks, score 87). Apparel (91.3) and Party (109.2) sit on the floor of 1.
- In-building stock is 290 units and all of it is Mixed lots. That matches the item-status count: 290 `intake`, 0 `processing`. Named categories get pipeline only through on-order lines whose B-Stock code maps.
- On-order is uneven: Health has 2,390 units on order against 2,010 on the shelf; Household, Party, and Storage have 0. Mixed still holds 4,210 on-order units the mapper did not place.
- 357 of 487 live auctions have no category mix, so they all show need 50 and priority 50 regardless of the title.
- Days to sell, recovery, and won-without-a-PO are not in the score. `Outcome` and `Bid` are empty (see R-003).
