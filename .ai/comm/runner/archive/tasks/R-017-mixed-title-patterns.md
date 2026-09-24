> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-017 · recon · What is inside "Mixed lots" (titles and brands)

**Why:** 87.6% of sold items are "Mixed lots" (register ITM-01). Before any AI, we want to know how much cheap rules and copies can place. Decision 8 in `.ai/extended/data-quality.md`.

**Answer these:**

1. **Free copies** (tier 1): among sold and on-shelf items whose product category is Mixed lots, how many could take a real category from:
   - their manifest line's category (register ITM-11);
   - a product with the same normalized title that has a real category;
   - their PO's preprocessing `final_category`.

   Count each source, then the union.
2. **Brands:** the top 100 brands, from the product brand field or the first title token, by units among Mixed items. For each brand, the share of its non-Mixed items in their top category. A brand at 90% or more in one category is a rule candidate.
3. **Keywords:** the top 200 title words (minus stopwords) among Mixed items, each with its dominant category among non-Mixed items, and the share.
4. **Estimate:** the share of Mixed items that tier 1 plus brand rules plus keyword rules would place at 90% or better agreement. Show it by era (V1, V2, V3 per the register).
5. **Samples:** 30 random Mixed titles no rule places.

**Result:** `results/R-017-mixed-title-patterns.md`. Read-only; no outside calls. Put the scratch work in `workspace/runner/R-017/`. Archive when done.
