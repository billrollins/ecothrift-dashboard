# R-021 result · Gold-set candidates (300 products)

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 16:41 · **Finished:** 2026-09-23 16:45

## Seed and rules

- **Seed:** 23 (`random.Random(23).sample`).
- **Who is eligible:** an `inventory.Product` with at least one `inventory.Item` where `sold_for > 0`. 82,788 products.
- **Bucket:** the product's category name when it is one of the 23 in `TAXONOMY_V1_CATEGORY_NAMES`; otherwise Mixed lots. That is the product branch of `taxonomy_bucket_case_sql` (`apps/buying/services/taxonomy_bucket_sql.py:36`). The manifest-row fallback was not used, because each row is a product.
- **Era:** `v1v2` when at least half of that product's sold items have `notes` starting with `BACKFILL:`; otherwise `v3`. Split is the tag, not the calendar (Eras in `.ai/extended/data-quality.md`).
- **Price band** on average `sold_for`: `under_5` (< $5), `5_20` ($5 up to $20), `20_50` ($20 up to $50), `50_plus` ($50 and up).
- **Draw:** 120 Mixed (60 `v3`, 60 `v1v2`). The other 180 are 10 from each of the 18 buckets that have a sold product, half and half by era when both eras had enough. After that draw, products were swapped inside the same bucket and era until every price band had at least 30.
- **`avg_retail`:** average of `item.retail` where `retail > 0`. Blank when none of the sold items have one.
- **Manifest:** the sold item with the lowest id that has a manifest row. Title and category code from that row. One title had a line break; it was flattened to one line.

CSV: `workspace/gold/candidates.csv` (300 rows).

## Bucket × era

| Bucket | v3 | v1v2 | n |
|---|---:|---:|---:|
| Mixed lots & uncategorized | 60 | 60 | 120 |
| Kitchen & dining | 5 | 5 | 10 |
| Furniture | 5 | 5 | 10 |
| Outdoor & patio furniture | 8 | 2 | 10 |
| Home décor & lighting | 5 | 5 | 10 |
| Household & cleaning | 5 | 5 | 10 |
| Bedding & bath | 8 | 2 | 10 |
| Storage & organization | 7 | 3 | 10 |
| Toys & games | 5 | 5 | 10 |
| Sports & outdoors | 5 | 5 | 10 |
| Tools & hardware | 5 | 5 | 10 |
| Office & school supplies | 5 | 5 | 10 |
| Electronics | 5 | 5 | 10 |
| Baby & kids | 5 | 5 | 10 |
| Health, beauty & personal care | 5 | 5 | 10 |
| Apparel & accessories | 5 | 5 | 10 |
| Books & media | 5 | 5 | 10 |
| Pet supplies | 5 | 5 | 10 |
| Party, seasonal & novelty | 5 | 5 | 10 |
| Lawn & garden | 0 | 0 | 0 |
| Appliances | 0 | 0 | 0 |
| Arts & crafts | 0 | 0 | 0 |
| Automotive | 0 | 0 | 0 |

## Bucket × price band

| Bucket | under $5 | $5–20 | $20–50 | $50+ |
|---|---:|---:|---:|---:|
| Mixed lots & uncategorized | 32 | 61 | 19 | 8 |
| Kitchen & dining | 4 | 4 | 0 | 2 |
| Furniture | 1 | 4 | 4 | 1 |
| Outdoor & patio furniture | 2 | 3 | 2 | 3 |
| Home décor & lighting | 3 | 5 | 1 | 1 |
| Household & cleaning | 3 | 3 | 3 | 1 |
| Bedding & bath | 2 | 6 | 2 | 0 |
| Storage & organization | 2 | 5 | 2 | 1 |
| Toys & games | 2 | 4 | 1 | 3 |
| Sports & outdoors | 3 | 3 | 1 | 3 |
| Tools & hardware | 8 | 0 | 2 | 0 |
| Office & school supplies | 6 | 3 | 0 | 1 |
| Electronics | 2 | 4 | 2 | 2 |
| Baby & kids | 3 | 5 | 0 | 2 |
| Health, beauty & personal care | 5 | 3 | 1 | 1 |
| Apparel & accessories | 3 | 6 | 0 | 1 |
| Books & media | 3 | 6 | 1 | 0 |
| Pet supplies | 6 | 4 | 0 | 0 |
| Party, seasonal & novelty | 4 | 3 | 3 | 0 |

Band totals: under $5 = 94, $5–20 = 132, $20–50 = 44, $50+ = 30.

## Odd

- Lawn & garden, Appliances, Arts & crafts, and Automotive have no product whose category name is that bucket and that has a sold item (0 of 82,788).
- Outdoor & patio, Bedding & bath, and Storage did not have enough `v1v2` products for a 5/5 split, so those seats were filled from `v3` (8/2, 8/2, and 7/3).
