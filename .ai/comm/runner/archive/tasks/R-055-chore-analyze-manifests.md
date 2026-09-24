> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-055 · Chore: analyze every dev manifest (Buying Phase 4 backfill) and report

- **Type:** chore · **Database:** dev (this task **may write**: it runs the two named commands only) · **Time box:** 150 minutes
- **Code:** the main tree as it is (`apps/buying/services/manifest_analysis.py`, command `analyze_manifests`). Migration `buying.0032_manifest_analysis` is already applied on dev.

## Steps

1. From `C:\Coding\ecothrift-dashboard`:
   `venv\Scripts\python.exe manage.py analyze_manifests --all --force > workspace\runner\R-055\1-analyze.log 2>&1`
   Report the last line (analyzed / unchanged / failed / seconds) and any `auction N:` error lines.
1b. Then re-value every open auction so the new fields fill in (`price_target`, `expected_close`; Phases 5 and 6):
   `venv\Scripts\python.exe manage.py recompute_buying_valuations > workspace\runner\R-055\1b-recompute.log 2>&1`
   Report its last line and how long it took. It can take a while (dev has many stale "open" auctions); let it finish.
1c. Read-only: in `manage.py shell`, `from apps.buying.services.wishlist import build_wishlist; d = build_wishlist()` and report `live_total`, `eligible`, and the first 5 rows' `priority`, `marketplace`, `top_category`, `current_price`, `max_bid`, `room`, `state`, `hazard_count`.
2. Read-only summary in `manage.py shell` over auctions whose `manifest_analysis` is set:
   - count; median and p10/p90 of `matched_retail_pct` and `product_basis_retail_pct`;
   - `match_methods` totals (upc / title / near) summed over auctions;
   - median of `revenue / revenue_by_category` (both strings in the JSON), and the 5 auctions with the lowest and highest ratio (id, lines, the two revenues);
   - per hazard code: auctions touched, lines, median `retail_pct`;
   - the 3 slowest auctions to analyze if the log shows timing (else skip).
3. **Spot-check matches:** 20 random `buying.ManifestRow` with `match_method='near'` (seed 55): row title | row brand | matched product title | `match_score`, and mark each **same product**, **same kind** or **wrong**. Then 10 with `match_method='upc'`, same marks.

## Hand back

The step 1 line, tables for step 2, the step 3 lists with your marks and the count of **wrong** per method.
