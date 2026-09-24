# R-036 · Close price ÷ retail from stored auctions
- **Runner:** Claude subagent (for coder) · **Started:** 2026-09-23 21:35 · **Status:** done · **Finished:** 2026-09-23 21:50

Scripts: `workspace/runner/R-036/q.py` (main tables), `s.py` (sanity check), `t.py` (watched-set gap check). Read-only.

## How the stored price gets there

The hourly sweep sets `current_price` and `last_updated_at = now` on every listing it still sees (`apps/buying/services/pipeline.py:223-224` on create, `:257` on update). The watch poll also sets `last_updated_at` (`pipeline.py:426`), and it keeps polling after the close. So watched auctions have `last_updated_at` **after** `end_time` and fall outside this task's window (see sanity check).

## 1. Ended auctions with a near-final stored price

"Near" = `end_time - 2h <= last_updated_at <= end_time`. `end_time < now` at 2026-09-23 21:35.

| Marketplace | Near | All ended | Share |
|---|---:|---:|---:|
| Target | 6,767 | 8,043 | 84.1% |
| Walmart | 4,068 | 4,445 | 91.5% |
| Amazon | 2,005 | 2,290 | 87.6% |
| Home Depot | 1,828 | 1,890 | 96.7% |
| Wayfair | 335 | 350 | 95.7% |
| **All** | **15,003** | **17,018** | **88.2%** |

- Gap from last update to end: median 21 min, max 119 min.
- 53 ended auctions have `last_updated_at` after `end_time` (the watched set); excluded.
- `status` on the near set: 14,926 still `open`, 77 `closed` (status is not moved to closed after the listing drops out).
- Usable for a ratio: **14,387**. Dropped: 610 with no or zero `total_retail_value`, 6 with no `current_price`. No `current_price = 0`.
- Top category source: AI 14,187, manifest 13, none 187.

## 2. Stored price ÷ `total_retail_value` (n = 14,387)

Overall: n 14,387 · p25 0.033 · **median 0.059** · p75 0.104.

**By marketplace**

| Marketplace | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| Target | 6,752 | 0.037 | 0.061 | 0.106 |
| Walmart | 4,028 | 0.030 | 0.069 | 0.110 |
| Amazon | 1,995 | 0.042 | 0.062 | 0.094 |
| Home Depot | 1,300 | 0.005 | 0.021 | 0.061 |
| Wayfair | 312 | 0.023 | 0.033 | 0.050 |

**By condition group** (`condition_group`, `apps/buying/services/condition.py:56`)

| Group | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| used_good | 6,273 | 0.037 | 0.058 | 0.098 |
| used_fair | 4,429 | 0.023 | 0.060 | 0.110 |
| like_new | 1,543 | 0.032 | 0.051 | 0.086 |
| new | 1,541 | 0.040 | 0.078 | 0.141 |
| damaged | 588 | 0.013 | 0.036 | 0.078 |
| unspecified | 13 | 0.007 | 0.018 | 0.022 |

**By top category** (the largest share in `manifest_category_distribution`, else `ai_category_estimates`, same as `apps/buying/serializers.py:144`)

| Top category | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| Apparel & accessories | 2,247 | 0.024 | 0.039 | 0.064 |
| Home décor & lighting | 1,871 | 0.023 | 0.039 | 0.061 |
| Kitchen & dining | 1,485 | 0.054 | 0.104 | 0.126 |
| Sports & outdoors | 1,291 | 0.041 | 0.083 | 0.134 |
| Furniture | 1,241 | 0.028 | 0.041 | 0.069 |
| Toys & games | 966 | 0.051 | 0.110 | 0.172 |
| Outdoor & patio furniture | 885 | 0.037 | 0.065 | 0.115 |
| Health, beauty & personal care | 765 | 0.061 | 0.089 | 0.113 |
| Electronics | 616 | 0.039 | 0.063 | 0.098 |
| Tools & hardware | 583 | 0.018 | 0.031 | 0.058 |
| Bedding & bath | 524 | 0.039 | 0.059 | 0.085 |
| Baby & kids | 466 | 0.059 | 0.106 | 0.184 |
| Mixed lots & uncategorized | 304 | 0.005 | 0.050 | 0.100 |
| Household & cleaning | 289 | 0.071 | 0.109 | 0.154 |
| Office & school supplies | 200 | 0.037 | 0.053 | 0.083 |
| (no mix) | 187 | 0.046 | 0.075 | 0.119 |
| Storage & organization | 171 | 0.043 | 0.063 | 0.095 |
| Pet supplies | 128 | 0.052 | 0.081 | 0.100 |
| Books & media | 101 | 0.073 | 0.097 | 0.129 |
| Party, seasonal & novelty | 67 | 0.032 | 0.049 | 0.072 |

**By pallet count band**

| Band | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| 1 | 1,716 | 0.037 | 0.063 | 0.109 |
| 2–5 | 6,374 | 0.037 | 0.063 | 0.110 |
| 6–12 | 2,445 | 0.026 | 0.052 | 0.100 |
| 13+ | 3,363 | 0.025 | 0.054 | 0.094 |
| (null) | 489 | 0.023 | 0.040 | 0.085 |

**Marketplace × condition** (all bid counts)

| Marketplace / group | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| Target / used_good | 4,896 | 0.036 | 0.056 | 0.097 |
| Walmart / used_fair | 3,434 | 0.036 | 0.075 | 0.111 |
| Target / new | 1,540 | 0.040 | 0.078 | 0.141 |
| Amazon / used_good | 1,322 | 0.041 | 0.064 | 0.099 |
| Home Depot / used_fair | 723 | 0.003 | 0.018 | 0.036 |
| Amazon / like_new | 673 | 0.042 | 0.058 | 0.085 |
| Home Depot / damaged | 575 | 0.011 | 0.037 | 0.079 |
| Walmart / like_new | 525 | 0.001 | 0.031 | 0.068 |
| Target / like_new | 316 | 0.040 | 0.068 | 0.114 |
| Wayfair / used_fair | 272 | 0.023 | 0.034 | 0.052 |
| Walmart / used_good | 49 | 0.108 | 0.123 | 0.143 |
| Wayfair / like_new | 29 | 0.023 | 0.030 | 0.051 |
| Walmart / unspecified | 11 | 0.010 | 0.018 | 0.022 |
| Walmart / damaged | 8 | 0.020 | 0.050 | 0.050 |
| Wayfair / used_good | 6 | 0.016 | 0.021 | 0.025 |
| Wayfair / damaged | 5 | 0.026 | 0.028 | 0.035 |
| Home Depot / unspecified | 2 | 0.015 | 0.026 | 0.037 |
| Walmart / new | 1 | 0.028 | 0.028 | 0.028 |

Each marketplace sells mostly one condition group (Target: used_good; Walmart: used_fair; Home Depot: used_fair/damaged), so the condition table largely repeats the marketplace table.

## 3. Bid count

| Bids | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| ≥ 5 | 9,714 | 0.044 | 0.075 | 0.119 |
| < 5 | 4,673 | 0.017 | 0.036 | 0.055 |

(`bid_count` null counted as < 5; none were null in the usable set.) Fewer than 5 bids roughly halves the ratio in every marketplace:

| Marketplace | ≥5 n | ≥5 median | <5 n | <5 median |
|---|---:|---:|---:|---:|
| Target | 5,324 | 0.075 | 1,428 | 0.038 |
| Walmart | 2,336 | 0.084 | 1,692 | 0.050 |
| Amazon | 1,461 | 0.072 | 534 | 0.041 |
| Home Depot | 425 | 0.051 | 875 | 0.018 |
| Wayfair | 168 | 0.043 | 144 | 0.026 |

**Marketplace × condition, ≥ 5 bids only**

| Marketplace / group | n | p25 | Median | p75 |
|---|---:|---:|---:|---:|
| Target / used_good | 3,842 | 0.039 | 0.069 | 0.110 |
| Walmart / used_fair | 2,115 | 0.057 | 0.090 | 0.130 |
| Target / new | 1,219 | 0.059 | 0.097 | 0.165 |
| Amazon / used_good | 800 | 0.057 | 0.085 | 0.125 |
| Amazon / like_new | 661 | 0.043 | 0.059 | 0.085 |
| Target / like_new | 263 | 0.046 | 0.081 | 0.129 |
| Home Depot / damaged | 254 | 0.019 | 0.050 | 0.125 |
| Walmart / like_new | 196 | 0.002 | 0.026 | 0.047 |
| Home Depot / used_fair | 170 | 0.030 | 0.052 | 0.076 |
| Wayfair / used_fair | 153 | 0.031 | 0.044 | 0.057 |
| Walmart / used_good | 15 | 0.112 | 0.143 | 0.164 |
| Wayfair / like_new | 13 | 0.030 | 0.048 | 0.076 |
| Walmart / unspecified | 9 | 0.012 | 0.021 | 0.022 |
| (4 more cells) | 1 each | | | |

## 4. Sanity check against R-033

Rebuilt R-033's set (ended, price snapshot within ±1 h of `end_time`, retail set): 58 auctions (R-033 had 54, window slightly different).

| Marketplace | n | Snapshot ÷ retail | `current_price` ÷ retail | Also in this task's near set |
|---|---:|---:|---:|---:|
| Target | 33 | 0.113 | 0.113 | 3 |
| Walmart | 9 | 0.145 | 0.145 | 1 |
| Amazon | 15 | 0.049 | 0.049 | 1 |
| Home Depot | 1 | 0.084 | 0.084 | 0 |

- The medians match R-033 (0.111 / 0.133 / 0.053).
- They **do not agree** with the sweep set: Target 0.113 vs 0.061, Walmart 0.145 vs 0.069, Amazon 0.049 vs 0.062.
- The two sets barely overlap: of 64 watched ended auctions, 54 have `last_updated_at` after `end_time` (watch poll keeps writing) and only 10 fall in the 2 h window. So R-033 is a small, hand-picked (watched) sample, and this task is the broad market.
- The sweep price is a median 21 min before the end, so it misses late bidding. By gap bucket: 0–30 min median 0.062 (n 9,112), 30–60 min 0.053 (n 5,162), 60–120 min 0.055 (n 113). R-033 saw about ×1.17 from 1 h out to the close. So these ratios are likely a low estimate of the true close, by very roughly 5–20%. `UNKNOWN` exactly how much: no sweep auction has an exact close to compare with.

## Verdict

Marketplace × condition medians are stable enough (n ≥ 30) for the 10 main cells (Target used_good/new/like_new, Walmart used_fair/like_new, Amazon used_good/like_new, Home Depot used_fair/damaged, Wayfair used_fair), but only as a pre-close floor: split by bids (≥5 is about 2× <5), and expect the real close to run somewhat higher. Walmart used_good (49), Wayfair like_new (29) and everything else are too thin.

## Observations

- 14,926 ended auctions still show `status = open`; any "closed" filter misses them.
- The IQR is wide everywhere (p75 ÷ p25 about 3), so a single median gives a rough center, not a tight estimate.
