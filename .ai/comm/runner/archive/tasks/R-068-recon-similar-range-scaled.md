> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-068 · Recon: does scaling similar lots by retail give a tighter likely-close range?

- **Type:** recon · **Database:** dev, read-only (your own script under `workspace/runner/R-068/`; no product code) · **Time box:** 45 minutes
- **Why:** R-061 found the similar-lots range (the raw closes of up to 5 similar lots, `apps/buying/services/decision.py` `_similar`) holds 67% of finals. But the typical final is half to double the similar median, because similar lots differ in size. The idea is to scale each similar lot to this lot's size: `close ÷ its retail × this lot's retail`.

## Questions
Use the same 300 auctions as R-061 (seed 61), with the same rules for picking similar lots, dated to each auction's end. Use R-061's script in `workspace/runner/R-061/` if it is there.

1. **Raw (today's rule).** Share of finals inside [min, max] of the similar closes; the median of `final ÷ median(similar closes)`; and the share within ±15% and within ±30% of that median. R-061 has these; repeat them for the same sample.
2. **Scaled by retail.** For similar lots with `total_retail_value > 0`, the prediction is `close ÷ retail × this lot's total_retail_value`. Report the same four numbers. Also: the share of auctions where scaling is possible (this lot and at least 2 similar lots have retail).
3. **Retail × seller ratio.** The prediction is `total_retail_value × the seller ratio` (`price_target.DEFAULT_CLOSE_MODEL`, via `_seller_ratio`). Report the median ratio and the shares within ±15% and within ±30%.
4. **Range width.** For methods 1 and 2, the median of `(max − min) ÷ median`.

## Hand back
The table (method × the numbers above), and **Observations** (3 lines at most): which method the "likely close" and the verdict should use.
