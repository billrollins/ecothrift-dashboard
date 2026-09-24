> **Start here (runner).** 1) Load context: steps 1–5 of `.ai/protocols/context-load.md` (skip its STOP: this file is the ask). 2) Follow `.ai/protocols/runner.md` for this one task: rules, progress header, result file, queue status. 3) Do only the task below.

# R-024 · Auction condition (register AUC-05)

- **Type:** recon (code and dev DB, read-only) · **Time box:** 45 min
- **Why:** bstock_daily_buying Phase 3 plans to parse the listing condition (new, returns, salvage...) into the score. First, learn what data we have.

## Do
1. **Code:** where does condition come in today? Check `Auction.condition_summary`, the `condition` field around `apps/buying/models.py:646`, `listing_mapping.py`, and the raw listing JSON if it's stored. Cite `path:line`.
2. **Values:** list the distinct condition values or phrases on auctions, with counts and a split by marketplace. Also scan titles for condition words: new, like new, customer returns, uninspected, shelf pulls, overstock, salvage, damaged, untested, refurbished, mixed condition.
3. **Coverage:** what share of auctions from the last 90 days have any condition signal (field or title)?
4. **Outcomes:** for won auctions that have a purchase order, is there a way to join condition to results, such as recovery (sold dollars ÷ all-in cost), share of items sold, or shrink? If the join exists, give a small table by condition group, with n. Name the data gaps.

## Hand back
- A table of condition value → count → marketplaces.
- A proposed grouping into 4–6 condition groups, marked as your suggestion.
- The outcomes table, or `UNKNOWN` with what you checked.
