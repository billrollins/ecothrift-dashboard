> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-021 · Gold-set candidates (300 products)

- **Type:** recon (dev DB read-only) · **Time box:** 45 min
- **Why:** product_intelligence Phase 3. The coder answers these 300 products by hand as the gold set, then models are auditioned against it. Read `.ai/extended/product-taxonomy.md` first for the category list.

## Do

1. Pick 300 `inventory.Product` rows that have at least one sold item (`sold_for > 0`). Use a fixed random seed of 23 and record it.
2. Stratify the pick so the set covers the hard cases:
   - **120 in Mixed lots:** the current bucket, via `taxonomy_bucket_case_sql` in `apps/buying/services/category_stats_sql.py`, or `canonical_category_name(product.category)`. Say which one you used.
   - **180 from the other buckets,** spread evenly: at least 5 per bucket that has data.
   - **Era:** for each bucket, pick about half from V3 native (no `BACKFILL:` note) and half from V1/V2 (`BACKFILL:v1`/`v2`). See the Eras table in `.ai/extended/data-quality.md` for how to tell them apart.
   - **Price band** (average sold price): under $5, $5–20, $20–50, $50+. Make sure each band has at least 30 products.
3. Write `workspace/gold/candidates.csv` with these columns:
   - `product_id`, `title`, `brand`, `model`, `current_category`, `bucket`, `era`, `price_band`;
   - `sold_count`, `avg_sold`, `avg_retail` (blank if unknown);
   - `manifest_title`: one linked manifest row's raw title, if any;
   - `manifest_category_code`.
4. Leave out customer data.

## Hand back
- The seed and the rules you used.
- A table of counts: bucket × era, and bucket × price band.
- The path to the CSV.
- Anything odd, in 5 lines at most (e.g. a bucket with fewer than 5 products).
