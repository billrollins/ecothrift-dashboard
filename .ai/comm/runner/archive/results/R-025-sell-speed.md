# R-025 result · Sell speed by category

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:16 · **Finished:** 2026-09-23 17:20

Days are `sold_at - listed_at`, the same pair `_speed_rows` uses (`apps/buying/services/category_stats_sql.py:260`). Bucket is `taxonomy_bucket_case_sql`. Sold means `status = 'sold'`. A row counts only when both timestamps are set and `listed_at` is not after `sold_at`. None of the rows with both timestamps were backwards.

Of 122,766 sold items, 22,008 (17.9%) have both timestamps. V3 native (`notes` not starting with `BACKFILL:`): 22,001 of 22,477 (97.9%). V1/V2: 7 of 100,289 (0.007%).

**Timestamps:** V3 `listed_at` and `sold_at` are usable. V1/V2 are not: almost none of those sold items have a list date, which matches the Eras table (don't use `listed_at` on the import). The all-eras speed table is the V3 table plus those 7 rows.

## V3 native

| Category | n | Median days | 75th | 90th | % ≤ 30 days | % ≤ 90 days | Avg sold $ |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kitchen & dining | 1,134 | 10.1 | 25.9 | 43.6 | 81.2 | 98.9 | 10.38 |
| Furniture | 45 | 10.0 | 32.3 | 46.9 | 71.1 | 100 | 33.40 |
| Outdoor & patio furniture | 415 | 21.0 | 40.0 | 62.8 | 65.3 | 100 | 27.99 |
| Home décor & lighting | 614 | 9.2 | 23.3 | 40.8 | 80.9 | 100 | 10.71 |
| Household & cleaning | 1,635 | 7.8 | 19.8 | 35.0 | 86.5 | 99.9 | 8.47 |
| Bedding & bath | 516 | 11.3 | 26.2 | 45.1 | 80.4 | 99.8 | 14.46 |
| Storage & organization | 232 | 4.0 | 15.9 | 29.1 | 90.1 | 100 | 7.70 |
| Toys & games | 742 | 6.2 | 17.2 | 25.3 | 94.2 | 99.9 | 13.45 |
| Sports & outdoors | 243 | 9.0 | 27.6 | 46.1 | 76.5 | 99.2 | 17.49 |
| Tools & hardware | 692 | 23.0 | 44.2 | 72.0 | 59.5 | 96.2 | 11.18 |
| Office & school supplies | 1,081 | 10.9 | 23.8 | 38.1 | 82.7 | 99.9 | 3.54 |
| Electronics | 307 | 15.0 | 27.9 | 41.9 | 78.2 | 100 | 14.87 |
| Baby & kids | 236 | 7.2 | 19.0 | 34.1 | 88.6 | 100 | 7.05 |
| Health, beauty & personal care | 1,642 | 17.9 | 33.2 | 58.0 | 70.2 | 99.1 | 4.62 |
| Apparel & accessories | 950 | 14.0 | 32.1 | 49.9 | 73.6 | 98.2 | 6.13 |
| Books & media | 256 | 8.0 | 24.2 | 35.0 | 86.3 | 99.2 | 5.88 |
| Pet supplies | 551 | 13.2 | 33.0 | 55.2 | 71.0 | 100 | 7.18 |
| Party, seasonal & novelty | 313 | 15.1 | 27.9 | 39.8 | 78.3 | 100 | 2.98 |
| Lawn & garden | 0 | | | | | | |
| Appliances | 0 | | | | | | |
| Arts & crafts | 0 | | | | | | |
| Automotive | 0 | | | | | | |
| Mixed lots & uncategorized | 10,397 | 31.0 | 67.0 | 109.1 | 49.0 | 84.0 | 12.72 |

## All eras

Same numbers, except Electronics n = 308 (median 14.6) and Mixed lots n = 10,403 (49.1% within 30 days, average sold $12.71). Those are the 7 backfill rows.

## Still listed, not sold

`listed_at` set, status not `sold` and not `scrapped`, list date not in the future. Age is days from `listed_at` to now.

| Category | n | Median age, days |
|---|---:|---:|
| Kitchen & dining | 2,664 | 9.3 |
| Furniture | 89 | 34.1 |
| Outdoor & patio furniture | 351 | 75.1 |
| Home décor & lighting | 1,048 | 20.1 |
| Household & cleaning | 1,030 | 27.3 |
| Bedding & bath | 783 | 57.4 |
| Storage & organization | 253 | 36.0 |
| Toys & games | 732 | 49.3 |
| Sports & outdoors | 1,016 | 41.1 |
| Tools & hardware | 1,131 | 93.1 |
| Office & school supplies | 1,244 | 42.0 |
| Electronics | 1,165 | 33.3 |
| Baby & kids | 357 | 16.2 |
| Health, beauty & personal care | 2,160 | 29.1 |
| Apparel & accessories | 6,113 | 41.0 |
| Books & media | 119 | 54.3 |
| Pet supplies | 406 | 41.1 |
| Party, seasonal & novelty | 2,553 | 26.3 |
| Mixed lots & uncategorized | 8,270 | 173.4 |

The four new categories have no listed unsold items either. Sold-only speed is the optimistic number: tools that sold did so in a median 23 days, while the 1,131 tools still listed have a median age of 93 days. Mixed lots still on the shelf are a median 173 days old.

## Price band (V3, sold price)

Median days, under $10 versus $10 and over. It does differ, usually by a few days, and not in one direction.

| Category | Under $10 | n | $10 and over | n |
|---|---:|---:|---:|---:|
| Mixed lots | 34.0 | 6,860 | 25.7 | 3,483 |
| Apparel | 14.9 | 867 | 10.1 | 83 |
| Outdoor & patio | 25.9 | 106 | 18.9 | 309 |
| Storage | 3.3 | 180 | 8.0 | 52 |
| Party | 15.2 | 305 | 7.3 | 8 |
| Books & media | 8.0 | 250 | 31.5 | 6 |
| Kitchen | 10.9 | 869 | 8.1 | 265 |
| Health & beauty | 17.3 | 1,575 | 21.1 | 67 |

Books and party over $10 are tiny samples. Everywhere else the two medians are within about 5 days.
