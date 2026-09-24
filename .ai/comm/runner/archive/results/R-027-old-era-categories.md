# R-027 result · How far the bad old-era categories reach (ITM-13)

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:28 · **Finished:** 2026-09-23 17:34

Era is the R-021 rule: a product is V1/V2 when at least half of its items with `sold_for > 0` have `notes` starting with `BACKFILL:`. An item is V1/V2 when its own note does. Bucket is the product's category name when it is one of the 23, else Mixed lots.

## 1. V1/V2 products that are not Mixed

2,774 such products, 3,667 sold items, $78,265 sold. Lawn & garden, Appliances, Arts & crafts, and Automotive have none.

| Bucket | Products | Sold items | Sold $ |
|---|---:|---:|---:|
| Electronics | 1,526 | 2,037 | 47,660 |
| Toys & games | 502 | 645 | 12,077 |
| Health, beauty & personal care | 185 | 240 | 6,158 |
| Sports & outdoors | 117 | 160 | 2,502 |
| Home décor & lighting | 98 | 143 | 2,927 |
| Tools & hardware | 101 | 118 | 1,414 |
| Baby & kids | 64 | 80 | 915 |
| Apparel & accessories | 66 | 80 | 1,309 |
| Kitchen & dining | 31 | 47 | 814 |
| Books & media | 31 | 37 | 608 |
| Party, seasonal & novelty | 17 | 26 | 670 |
| Office & school supplies | 9 | 21 | 827 |
| Furniture | 9 | 13 | 175 |
| Household & cleaning | 6 | 7 | 111 |
| Pet supplies | 5 | 5 | 33 |
| Storage & organization | 3 | 3 | 37 |
| Bedding & bath | 2 | 3 | 14 |
| Outdoor & patio furniture | 2 | 2 | 11 |

There are 73,699 V1/V2 products in all. Almost all of the rest are Mixed.

## 2. Where the categories disagree

`inventory_item` has no category column (checked `information_schema`). Of 183,785 items tagged `BACKFILL:`, **0** have a manifest row. Agreement between product bucket and item category, and between product bucket and manifest category, cannot be scored. There is no second source on those items.

The only category on a V1/V2 item is the product's. The task's gold-set note says that matched a hand label 10% of the time. `workspace/gold/gold_labels.csv` is not on disk, so that 10% was not recomputed here.

Ten V1/V2 items (seed 23 on the products), all Mixed, no manifest:

| Item's product | Product category | Item category | Manifest category |
|---|---|---|---|
| 66qt Latch Storage Box - Clear/Blue, 6pk | Mixed lots | (no column) | (no row) |
| Sterilite Wide 3 Drawer Cart … | Mixed lots | (no column) | (no row) |
| Pop Specs Reading Glasses … | Mixed lots | (no column) | (no row) |
| Antitheft Travel Hip Pack Bag - Dark Ivy | Mixed lots | (no column) | (no row) |
| Funko POP! Comic Cover Marvel Amazing Spider-Man … | Mixed lots | (no column) | (no row) |
| Disney Princess Style Collection Play Phone … | Mixed lots | (no column) | (no row) |
| Modern Armchair With Wooden Arms and Legs | Mixed lots | (no column) | (no row) |
| Computer Desk with Drawer - 22in, Black | Mixed lots | (no column) | (no row) |
| Washed Stone/Espresso Post Mount Mailbox | Mixed lots | (no column) | (no row) |
| Cat Litter Pads - 30ct | Mixed lots | (no column) | (no row) |

## 3. Windows

`get_pricing_need_window_days()` is 90 (`AppSetting` key `pricing_need_window_days`, default 90, `apps/buying/services/buying_settings.py:8`). The daily stats job passes `now() - 90 days` into both `_want_rows` and `_speed_rows` (`apps/buying/management/commands/compute_daily_category_stats.py:66`).

| Reader | Window | Earliest `sold_at` it reads | Sold rows in the window | V1/V2 share |
|---|---|---|---:|---:|
| Need window (`category_need.py:268`) | 90 days | 2026-06-25 (oldest row inside the cutoff) | 14,589 | 37 (0.25%) |
| `_want_rows` | same 90 days, `status = sold` | same | 14,589 | 37 (0.25%) |
| `_speed_rows` | same, plus `listed_at` set and not after `sold_at` | same | 14,511 | 6 (0.04%) |

The current Need and speed numbers are almost all V3. The bad categories are outside this window.

## 4. Other readers

| Where | What it groups | Date range |
|---|---|---|
| `apps/inventory/views.py:8409` `store_report_view` | On-shelf items, not sold. Category is the manifest row's category, else the product's (`:8422`). Breakdown at `:8479`. | Current shelf. Stale flag defaults to 60 days (`:8419`). |
| `apps/inventory/views.py:7562` `item_stats` | All items whose product category name or manifest category equals the query (`:7584`). No sold filter. | None. |
| `apps/webstore/` | Listings have their own category. No query groups sold items by product category. | n/a |

## 5. Siblings

20 V1/V2 products, seed 23. **0** have a V3 product with the same normalized title. Across all titles, 788 of 68,815 V1/V2 titles (1.15%) also exist on a V3 product, and only 20 of those 788 have a V3 category that is not Mixed. A same-title V3 product is not a useful source for the old catalog.

Whether that V3 category matches a hand label: UNKNOWN. `workspace/gold/gold_labels.csv` is not on disk.
