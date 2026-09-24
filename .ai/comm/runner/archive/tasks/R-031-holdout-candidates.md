> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-031 · Held-out set: 200 more products

- **Type:** recon (dev DB read-only) · **Time box:** 30 min
- **Why:** Spark scored 98% on the 300-product gold set, but some rulings were written from those same products. A fresh set gives an honest score.

## Do
Repeat R-021 exactly (see `archive/tasks/R-021-gold-candidates.md` and its result for the rules), with these changes:
- **seed 24;**
- **exclude** every `product_id` in `workspace/gold/candidates.csv`;
- **200 products:** 140 in Mixed lots (70 V3, 70 V1/V2), and 60 from the other buckets (at least 3 per bucket that has data);
- no price-band minimum, but report the band counts.

Write `workspace/gold/holdout_candidates.csv` with the same columns as `candidates.csv`.

## Hand back
The seed, the counts (bucket × era, and bands), and the CSV path.
