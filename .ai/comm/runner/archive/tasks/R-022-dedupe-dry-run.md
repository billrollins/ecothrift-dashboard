> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-022 · Duplicate products: dry run

- **Type:** recon (dev DB read-only) · **Time box:** 60 min
- **Why:** product_intelligence Phase 4, and register PRD-01 ("66% of products are in duplicate-title groups"). This sizes the merge work before anything is built. Nothing is merged.

## Do
1. **Normalized-title groups:** lowercase the title, strip punctuation, and collapse spaces. Count the groups of 2 or more, the products in them, the items linked to them, and the sold dollars. Also give the share of all products.
2. **Same normalized title, different brand or category:** count those groups, and give 15 examples.
3. **Near titles:** take a random sample of 2,000 product titles (seed 23). For each, find other products with `pg_trgm` `similarity >= 0.8` among all products. Stay inside the time box: use the `%` operator with `set_limit(0.8)`, or an index if one exists.
   - Report how many of the 2,000 have at least one near match.
   - Show 30 example pairs, each marked by you as **same product**, **variant** (size, color or count differs) or **different**.
4. Write CSVs to `workspace/runner/R-022/`:
   - `exact_groups_top200.csv`: the top 200 groups by item count;
   - `near_pairs_sample.csv`.

## Hand back
- A totals table.
- The 15 examples and 30 pairs, as short tables.
- How long each query took. This tells the coder whether trigram matching works at full scale or vectors are needed.
