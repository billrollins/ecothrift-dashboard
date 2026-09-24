> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-052 · Recon: buying manifests: fill, product match rates, hazard keywords

- **Type:** recon · **Database:** dev, read-only · **Time box:** 60 minutes
- **Why:** Buying Phase 4 matches B-Stock manifest lines (`apps.buying.models.ManifestRow`) to inventory `Product`s and flags hazards. The coder needs real rates to set thresholds.

## Questions

1. **Fill.** How many auctions have `buying.ManifestRow` rows, and how many rows in all? For rows: share with a UPC of 11+ digits (digits only), a title, a brand, `quantity`, `retail_value > 0`, a `condition`. Also rows with `retail_value` 0 or null.
2. **Match rates** on a random sample of 3,000 rows (seed 52):
   - **UPC:** the row's UPC (digits only, 11+) equals a `Product.identifiers['upc']` (compare digits only; try with and without a leading 0 pad to 12/13).
   - **Exact title:** lower-cased, whitespace-collapsed title equals a `Product.title` the same way.
   - **Near title:** best `pg_trgm` `similarity(title, product.title)` (use `TrigramSimilarity`; the `inv_product_title_trgm` GIN index exists). Report the share whose best score is ≥ 0.5, ≥ 0.6, ≥ 0.7 and ≥ 0.8, and 10 sample pairs at 0.55–0.65 and 10 at 0.65–0.75 (row title | product title | score) so the coder can pick a cut-off.
   - Overlap: rows matched by any method.
3. **Sales behind a match.** For the matched products (any method, best one per row): the share with ≥1 sold `Item` (`sold_at` not null), ≥3 sold, and the median of `sold_for / retail` over sold items with `retail > 0`, per `canonical_category` of the row.
4. **Hazard keywords** on row `title`, `condition` and `notes`. For each pattern: rows matched, auctions touched, and 5 sample titles (to judge precision). Case-insensitive regex:
   - `part`: `\b(box|carton|pc|piece|part)\s*\d+\s*(of|/)\s*\d+\b` or `\(\s*\d+\s*of\s*\d+\s*\)`
   - `incomplete`: `missing|incomplete|parts only|for parts|not working|damaged|broken|as[- ]is`
   - `fragile`: `\b(glass|ceramic|porcelain|mirror|crystal|vase|lamp|tv|television|monitor|dish(es)?|mug|stoneware)\b`
   - `high value`: unit retail (`retail_value / max(quantity,1)`, or `retail_value` if the template stores the unit price; say which you found) ≥ $300, ≥ $500, ≥ $1,000.
   - `bulk`: `quantity` ≥ 12, ≥ 24, ≥ 50.
5. **Unit vs line retail.** Is `ManifestRow.retail_value` the unit price or the line total? Check 3 manifests per marketplace against `raw_data` and say which it is per template, with `path:line` of the code that fills it (`apps/buying/services/manifest_upload.py`, `normalize.py`).

## Hand back

Tables for 1–4, the answer to 5 with code refs, and a short **Observations** section (5 lines max) on cut-offs you would pick and why.
