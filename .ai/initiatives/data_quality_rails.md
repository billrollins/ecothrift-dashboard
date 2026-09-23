<!-- initiative: slug=data-quality-rails status=active updated=2026-09-23 -->
<!-- Last updated: 2026-09-23 (opened) -->

# Initiative: Data quality and rails

**Status:** **Active** — Phase 1 (runner recon R-009 to R-013).

**Objective:** Four years and at least three database restarts left messy data. The owner and every report or feature should know which data to trust, how much to trust it, and what was filled in. Every stage of the lifecycle should capture its data going forward, so the data gets cleaner over time:

auction → bids → won → order → in transit → receiving → preprocessing → processing → products → items → sales → disputes → shrinkage → inventory counts

We work with the data we have, labelled and filled in by stated rules, instead of throwing it out.

**Compass:** this file is not the compass; [`bstock_daily_buying`](./bstock_daily_buying.md) stays the compass. Every phase there reads the register here.

---

## Finish line

- **The register:** [`.ai/extended/data-quality.md`](../extended/data-quality.md) lists every known issue, with its scope, what it affects, how it is handled and the rail that stops it recurring.
- **Honest numbers:** every buying and inventory number on screen says how much data backs it and what was filled in.
- **Rails:** each lifecycle stage captures its record and its timestamps.
- **A daily data-health check** lists new breaks so they are fixed while they are fresh.

---

## Out of scope

- Rebuilding or re-importing the old databases (see [`historical_data_export`](./_archived/_pending/historical_data_export.md))
- Deleting old data because it is messy (fixes are reversible and logged)
- Product vectors themselves (only the hook; see bstock Phase 4)

---

## Phases

### Phase 1 — Know the data
Map the eras, and every issue at every stage, with counts. Decide how each issue is handled.
**Gated by:** none.

Acceptance:
- [x] The register opened with its rules, the lifecycle rails table, and the issues found so far (R-002 to R-007).
- [x] Eras mapped: the database restarts and imports, with dates and which fields to trust in each (R-009).
- [x] Each stage recon merged into the register with counts (43 new rows, 2026-09-23):
  - auctions, bids and outcomes (R-010);
  - orders, transit and receiving (R-011);
  - preprocessing, processing, products and items (R-012);
  - sales, disputes, shrink and counts (R-013).
- [ ] Every issue has a handling (use, fill, flag, exclude or unknown) and a rail. Every fill-in rule in code is in the imputation catalog.
- [ ] The lifecycle rails table filled in with what exists today, from the recon.

### Phase 2 — Quality-aware numbers
Buying and inventory numbers carry coverage and fill-in notes, starting with Need v2, shipping estimates, days to sell and auction need. The screens show them, for example "based on 40% of sales" or "filled in: no mix".
**Gated by:** Phase 1.
Detail when Phase 1 is built.

### Phase 3 — Rails
Each stage captures its record going forward:
- a won auction links to its PO;
- PO transitions are stamped;
- the category is required at processing;
- scraps and losses carry a reason;
- each sale records its channel;
- floor counts happen on Mondays.

A daily data-health check (command plus page) lists the breaks.
**Gated by:** Phase 1.
Detail when Phase 1 is built.

### Phase 4 — Cleanup and backfill
Fix what can be fixed, reversibly and with a log:
- close stale POs;
- merge duplicate vendors;
- map old categories;
- link POs to auctions by title;
- dedupe products.

**Gated by:** Phase 3.
Detail when Phase 3 is built.

---

## Acceptance

- [ ] Phase 1: know the data
- [ ] Out-of-scope items stay out

---

## Record

**2026-09-23 — Recon merged.** R-009 to R-013 are in the register:
- The eras: V1/V2 imported 2026-04-12, V3 native.
- 43 new issues.
- 9 standing decisions, including that 83k "scrapped" rows are import labels and not shrink, $0 means unknown, and enrichment is product-first with audition-then-backfill.

Still open in Phase 1: a handling decision on every open row, and the lifecycle "Today" column.

**2026-09-23 — Opened.** The owner: the data is not clean, and new, better data will keep landing on the old. Identify and understand the issues, plan for all of them, always state the known issues and the fill-ins used, and work with the data instead of throwing it out. Rails at every stage, from auction to inventory. The register was seeded with 26 issues from runner recon R-002 to R-007.

---

## See also

- Register: [`.ai/extended/data-quality.md`](../extended/data-quality.md)
- Compass: [`bstock_daily_buying`](./bstock_daily_buying.md)
- Related (pending): [`historical_data_export`](./_archived/_pending/historical_data_export.md), [`historical_sell_through_analysis`](./_archived/_pending/historical_sell_through_analysis.md)
- Index: [`_index.md`](./_index.md)
