# R-068 · Recon: does scaling similar lots by retail give a tighter likely-close range?
- **Runner:** Grok 4.7 · **Started:** 2026-09-24 18:30 · **Finished:** 2026-09-24 18:31 · **Status:** done

Dev database, read-only. Seed 61, 300 ended auctions from the last 60 days, same similar-lot rules as R-061 (same seller, same main category, ±2 pallets, ended in the prior 30 days, at most 5). The clock has moved since R-061, so this draw is 290 lots with 2 or more raw comps, not 292.

Scaled prediction for a similar lot: `close ÷ its retail × this lot's retail`. Seller prediction: `total_retail_value × _seller_ratio`. Width is `(max − min) ÷ median` of that method's predictions.

| Method | n | Inside [min, max] | Median final ÷ median prediction | Within ±15% | Within ±30% | Median width |
|---|---:|---:|---:|---:|---:|---:|
| Raw closes | 290 | 70.0% | 1.043 | 17.9% | 28.6% | 1.89 |
| Scaled by retail | 286 | 63.6% | 1.009 | 20.3% | 36.4% | 1.32 |
| Retail × seller ratio | 300 | (a point, no range) | 0.955 | 16.0% | 28.7% | |

Scaling is possible for 286 of 300 (95.3%): this lot and at least 2 similar lots have retail.

## Observations

- Scaling is the tighter range. The typical band shrinks from 1.89 times the median to 1.32, and the share of finals within ±30% of the median rises from 29% to 36%.
- It holds fewer finals inside the min-to-max band (64% versus 70%). The band got narrower, so some closes that used to sit inside now sit just outside.
- The seller-ratio point is not a tighter forecast than the similar median (16% within ±15%, against 18% raw and 20% scaled). Use the scaled range for the verdict. Keep the seller ratio for the early likely-close.
