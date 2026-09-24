> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-027 · How far do the bad old-era categories reach? (register ITM-13)

- **Type:** recon (dev DB read-only) · **Time box:** 45 min
- **Why:** on the gold set (`workspace/gold/gold_labels.csv` against `candidates.csv`), the current category of V1/V2 products matched a hand label only 10% of the time. V3 matched 83%. Find out how much of our numbers sit on those categories.

## Do
1. **Products by era:** count V1/V2 products (sold items tagged `BACKFILL:`, as in R-021) that have a non-Mixed category. Give their sold item count and sold dollars, by current bucket.
2. **Where categories disagree:** for V1/V2 items, compare the product's bucket with the item's own category field (if items have one) and with the manifest row's category. Give an agreement % for each pair, and 10 example rows. Check whether any source is trustworthy for that era.
3. **Windows:** for each of these, give the current window, the earliest `sold_at` it reads, and the share of its sold rows that are V1/V2:
   - `get_pricing_need_window_days()` (`apps/buying/services/category_need.py:268`);
   - the category stats want mix (`_want_rows` in `category_stats_sql.py`);
   - `_speed_rows`.
4. **Other readers:** grep for other reports that group sold items by product category (store report, item stats, webstore). List each as `path:line` with its date range.
5. **Siblings:** for 20 random V1/V2 products, check whether a V3 product with the same normalized title exists, and whether its category matches the hand-label logic. Is it a better source?

## Hand back
Tables for 1–3, the list for 4, and the result for 5. Mark anything you couldn't confirm as `UNKNOWN`.
