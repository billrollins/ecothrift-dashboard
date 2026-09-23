# R-002 · recon · How Need and Priority work today

**Why:** The owner says auction Need and Priority are off. One known gap: they ignore stock that is won or on order but not yet processed. We are replacing them with "Need v2" (weeks of cover). First we need the exact current formula, with numbers.

**Answer these:**

1. **The formula, end to end.** How each of these is computed, with `path:line` for every step:
   - `CategoryStats`: `have_units`, `have_retail`, `want_units`, `want_retail`, `need_units`, `need_retail`, `need_score_1to99` and `recovery_rate`;
   - `Auction.need_score` and `Auction.priority`.

   Start at `apps/buying/services/category_stats_sql.py` and `apps/buying/services/valuation.py`. Also say:
   - which `inventory_item` statuses count as "have";
   - the time window for "want", and where it comes from (setting name and value);
   - how an auction's category mix turns category need into its need;
   - when `priority` equals need, and when it doesn't (`priority_override`).
2. **Inputs it ignores.** For each, say yes or no with evidence:
   - items on POs not yet received;
   - received but not shelved (in processing);
   - auctions won but with no PO (`Outcome.win`, `WatchlistEntry` status `won`);
   - sales speed (days to sell);
   - profit.
3. **Current numbers** (dev DB):
   - All `CategoryStats` rows, as a table: category, have_units, want_units, need_units, need_score_1to99, recovery_rate, computed_at.
   - 5 live auctions that have a manifest, and 5 that don't: id, title (50 chars), mix (top 3 categories with %), need_score, priority, priority_override.
4. **Observations:** at most 5 bullets on what looks wrong or surprising in the numbers.

**Result:** `results/R-002-need-priority-today.md`. Read-only; no outside calls.
