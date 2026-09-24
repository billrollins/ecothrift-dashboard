> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-034 · Why is Pet supplies Need 99?

- **Type:** recon (dev DB read-only) · **Time box:** 30 min
- **Why:** on dev, the top of the auction list is all Pet supplies at Need 94–99. Check the inputs are real before the buyer trusts it.

## Do
1. **Inputs:** for every category, list these `CategoryStats` values:
   - `have_units`, `in_building_units`, `on_order_units`, `weekly_sales_units`;
   - `cover_weeks`, `target_weeks`, `need_score_1to99`;
   - `sell_through_30_pct`, `computed_at`.
2. **Pet supplies:** break down its shelf count (`have_units`), sold in the last 90 days, and on-order units. Where do the pet sales come from: which vendors, and which price bands?
3. **Pet supplies goal:** is there one set? Read `buying_category_goals` (`apps/buying/services/buying_settings.py`).
4. **Sensitivity:** how many of the top 50 open auctions by Priority are more than 80% one category? Which categories?
5. **Data issues:** any register issue that could inflate Pet Need? Check `.ai/extended/data-quality.md`, e.g. shelf items not counted, or wrong statuses.

## Hand back
The inputs table, the Pet breakdown, the top-50 mix, and your one-line read on whether Need 99 for Pet is real, marked as your opinion.
