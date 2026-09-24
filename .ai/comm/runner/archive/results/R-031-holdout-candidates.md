# R-031 result · Held-out set: 200 more products

**Status:** done

- **Runner:** Grok 4.7 · **Started:** 2026-09-23 17:50 · **Finished:** 2026-09-23 17:52

Same rules as R-021. **Seed 24.** The 300 ids in `workspace/gold/candidates.csv` were excluded (overlap in this file: 0).

- Bucket: product category name if it is one of the 23, else Mixed lots.
- Era: `v1v2` when at least half the sold items are `BACKFILL:`, else `v3`.
- 140 Mixed (70 / 70). 60 from the other buckets that have a sale, at least 3 each.
- No price-band repair.

CSV: `workspace/gold/holdout_candidates.csv` (200 rows).

## Bucket × era

| Bucket | v3 | v1v2 | n |
|---|---:|---:|---:|
| Mixed lots & uncategorized | 70 | 70 | 140 |
| Kitchen & dining | 2 | 2 | 4 |
| Furniture | 2 | 1 | 3 |
| Outdoor & patio furniture | 3 | 0 | 3 |
| Home décor & lighting | 2 | 2 | 4 |
| Household & cleaning | 2 | 1 | 3 |
| Bedding & bath | 3 | 0 | 3 |
| Storage & organization | 4 | 0 | 4 |
| Toys & games | 2 | 2 | 4 |
| Sports & outdoors | 2 | 1 | 3 |
| Tools & hardware | 2 | 2 | 4 |
| Office & school supplies | 2 | 1 | 3 |
| Electronics | 1 | 2 | 3 |
| Baby & kids | 2 | 1 | 3 |
| Health, beauty & personal care | 2 | 1 | 3 |
| Apparel & accessories | 2 | 1 | 3 |
| Books & media | 2 | 1 | 3 |
| Pet supplies | 4 | 0 | 4 |
| Party, seasonal & novelty | 2 | 1 | 3 |
| Lawn & garden, Appliances, Arts & crafts, Automotive | 0 | 0 | 0 |

Outdoor & patio, Bedding & bath, Storage, and Pet supplies had no remaining `v1v2` product outside the gold set, so those seats are all `v3`.

## Price bands

| Band | n |
|---|---:|
| under $5 | 46 |
| $5–20 | 118 |
| $20–50 | 24 |
| $50+ | 12 |
