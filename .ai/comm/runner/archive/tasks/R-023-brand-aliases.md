> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-023 · Brand spellings and junk brands

- **Type:** recon (dev DB read-only) · **Time box:** 45 min
- **Why:** product_intelligence Phase 2 needs a brand alias table, and the short-name rules drop junk seller names (see `.ai/extended/product-taxonomy.md`).

## Do
1. **`Product.brand`:** list the top 300 values with product counts. Also count how many products have `Generic`, a blank brand, or a brand equal to the whole title.
2. **Variant clusters:** find brands that are the same once case, spaces, punctuation and `&`/`and` are ignored (e.g. Hyper Tough / HyperTough / HYPER TOUGH), and brands with trigram similarity of at least 0.85. List each cluster with its counts.
3. **Brand in the title, not the field:** for products whose brand is `Generic` or blank, see whether the title starts with a known brand from step 1. Count how many do, and give 20 examples.
4. **Likely junk:** find names that are all caps, 5 or more letters, not a real word, and seen on fewer than 20 products (e.g. AYKLCZUU, HTSQYL). List the top 100, and give the total product count.
5. Write CSVs to `workspace/runner/R-023/`:
   - `brands_top.csv`;
   - `brand_clusters.csv`;
   - `junk_candidates.csv`.

## Hand back
- Counts tables and cluster examples: the top 30 clusters.
- Your one-line rule for junk detection, and how many real brands it would wrongly catch in the top 300.
