> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-025 · Sell speed by category

- **Type:** recon (dev DB read-only) · **Time box:** 45 min
- **Why:** bstock_daily_buying Phase 3 adds "sells fast" to the auction score. Check what the data can support first. Today's code is `_speed_rows` in `apps/buying/services/category_stats_sql.py`, which uses only `listed_at`.

## Do
1. For sold items, work out **days from listed to sold**. Say which timestamp fields you used, and what share of sold items have both.
2. For each of the 23 categories (the current bucket, as in `_speed_rows`), give:
   - n;
   - median days, and the 75th and 90th percentiles;
   - % sold within 30 days and within 90 days;
   - the average sold price.

   Show two versions: **V3 native only**, and **all eras**. The Eras table in `.ai/extended/data-quality.md` explains why the backfill eras may have fake dates.
3. **Survivors:** for items that are listed but unsold, how many per category, and how many days old (median)? Without these, speed looks faster than it is.
4. **Price band:** per category, is the median speed different for items under $10 and items $10 and over?

## Hand back
- Both tables, the survivor table, and the price-band note.
- One line on which timestamps are trustworthy in each era, with the evidence.
