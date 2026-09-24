# R-034 result · Why is Pet supplies Need 99?

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 18:00 · **Finished:** 2026-09-23 18:04

`CategoryStats` was recomputed 2026-09-23 17:10 local (`computed_at` 22:10 UTC). No category goal is set (`buying_category_goals` is empty). Target weeks is 42.7 for every category.

## Inputs

| Category | Shelf | In building | On order | Sold / week | Cover weeks | Need | Sold within 30 days % |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pet supplies | 406 | 0 | 173 | 40.37 | 14.3 | 83 | 43.8 |
| Household & cleaning | 1,030 | 0 | 410 | 89.21 | 16.1 | 81 | 64.3 |
| Storage & organization | 253 | 0 | 79 | 17.27 | 19.2 | 78 | 48.5 |
| Toys & games | 732 | 0 | 303 | 54.68 | 18.9 | 78 | 51.7 |
| Mixed lots & uncategorized | 8,267 | 290 | 52 | 338.80 | 25.4 | 70 | 27.1 |
| Books & media | 119 | 0 | 215 | 12.68 | 26.3 | 69 | 69.1 |
| Office & school supplies | 1,244 | 0 | 863 | 78.79 | 26.7 | 69 | 45.4 |
| Bedding & bath | 783 | 0 | 178 | 35.31 | 27.2 | 68 | 34.2 |
| Tools & hardware | 1,131 | 0 | 200 | 48.69 | 27.3 | 68 | 23.1 |
| Baby & kids | 357 | 0 | 166 | 13.92 | 37.6 | 56 | 50.5 |
| Kitchen & dining | 2,664 | 0 | 473 | 83.30 | 37.7 | 56 | 43.2 |
| Furniture | 89 | 0 | 51 | 3.50 | 40.0 | 53 | 26.6 |
| Appliances | 0 | 0 | 0 | 0 | | 50 | |
| Arts & crafts | 0 | 0 | 27 | 0 | | 50 | |
| Automotive | 0 | 0 | 0 | 0 | | 50 | |
| Lawn & garden | 0 | 0 | 0 | 0 | | 50 | |
| Health, beauty & personal care | 2,160 | 0 | 2,779 | 104.69 | 47.2 | 45 | 41.4 |
| Sports & outdoors | 1,016 | 0 | 110 | 18.04 | 62.4 | 27 | 17.7 |
| Electronics | 1,165 | 0 | 360 | 23.72 | 64.3 | 25 | 21.9 |
| Outdoor & patio furniture | 351 | 0 | 2,028 | 30.33 | 78.4 | 8 | 34.8 |
| Apparel & accessories | 6,113 | 0 | 2,033 | 70.86 | 115.0 | 1 | 11.8 |
| Home décor & lighting | 1,048 | 0 | 5,241 | 45.03 | 139.7 | 1 | 40.8 |
| Party, seasonal & novelty | 2,553 | 0 | 885 | 23.57 | 145.9 | 1 | 16.8 |

## Pet supplies

Shelf count from `CategoryStats` matches a fresh `on_shelf` count: 406.

Sold in the last 90 days: 518 items, $3,754. That is 40.4 a week, the same as `weekly_sales_units`.

| Vendor | Under $10 | $10 and over |
|---|---:|---:|
| Walmart (`WAL`) | 245 items, $935 | 59 items, $1,030 |
| Amazon (`AMZ`) | 160 items, $974 | 54 items, $815 |

No other vendor. Most of the units are under $10.

Cover is (406 + 0 + 173) / 40.37 = 14.3 weeks, against a 42.7-week target, which is Need 83. Not 99.

## Top 50 open auctions by Priority

49 of 50 are more than 80% one category, using `ai_category_estimates` (none of the top ones have a manifest mix). 28 are Pet supplies. 21 are Health, beauty & personal care.

The pet auctions at the top (ids 111987, 469386, 68754, and others) store Need 94–99. Their AI mix is 92–98% pet, and they have no manifest. Category Need for pet, recomputed at 17:10, is 83. Those auction scores were not rebuilt with it.

## Data issues

The pet inputs agree with a direct count of shelf and of 90-day sales. V1/V2 categories barely enter that window (R-027: 0.25% of those sales). No goal is pushing the score. `in_building_units` is 0.

**Opinion:** the shortage is real (14 weeks of cover against a 43-week target, mostly cheap Walmart and Amazon pet goods), so a high Need is fair. Need 99 on the auction list is not the current number. It is a stale auction score on an AI mix, about 15 points above the category's 83.
