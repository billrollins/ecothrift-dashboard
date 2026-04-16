<!-- Archived 2026-04-10: disposition=pending paused off main index (initial rates seeded manually v2.8.0; data-backed refinement deferred until needed) -->
<!-- initiative: slug=historical-sell-through-analysis status=pending updated=2026-04-10 -->
<!-- Last updated: 2026-04-10T14:15:00-05:00 -->
# Initiative: Historical sell-through analysis

**Status:** Pending — initial rates seeded manually (v2.8.0); data-backed refinement deferred until needed.

**Current phase:** Phase 1 planned (legacy DB documentation) — paused

**Dependency for:** `bstock_auction_intelligence.md` Phase 5 (auction valuation). Phase 5 shipped with **manually seeded** `PricingRule` rates; this initiative still supplies data-backed refinement and historical joins.

---

## Delivered tooling (partial — toward Phase 3)

- [x] **PO extract (app v2.7.1):** Ad hoc **`extract_po_descriptions.py`** (historically under **`workspace/notes/to_consultant/`**; optional local copy under **`scripts/data/`**) — connects to **`ecothrift_v1`**, **`ecothrift_v2`**, **`ecothrift_v3`** (see script for V3 table guard). Writes CSV/MD under **`workspace/data/`** (and any consultant-facing copy you add locally). Documented in **`CHANGELOG`** **[2.7.1]** and **`.ai/consultant_context.md`**.

---

## Context

Eco-Thrift needs category-level sell-through rates to power auction valuation (suggested max bid, projected revenue). The formula is simple: `sum(sold_price) / sum(retail_value)` per `fast_cat_value` category. But the data lives across three database generations (V1, V2, V3) and hundreds of historical manifest CSVs that have never been processed through the fast-cat pipeline.

This initiative documents the legacy databases, builds reusable tooling to process historical data, and outputs a pricing rules table that Phase 5 consumes.

---

## Non-negotiables

- Legacy DB documentation is permanent reference material. Do it once, do it right.
- All database schema docs go in `.ai/extended/databases/` with metadata (date range, record counts, known quirks).
- Historical CSV processing reuses the existing fast-cat pipeline (ManifestTemplate detection, fast_cat_key composition, CategoryMapping lookup + AI for unknowns).
- The output is `sum(sold_price) / sum(retail_value)` per fast_cat_value. Not a fancy model. Simple and grounded in real data.
- Shrinkage, refunds, and disputes are handled separately as configurable factors, not baked into the sell-through rate.

---

## Phased plan

### Phase 1: Legacy database documentation

Document V1, V2, and V3 (current) database schemas. For each:
- Tables, columns, relationships, primary/foreign keys
- Where manifests, items, products, categories, carts, cart lines, sold prices live
- Date range of data (sales from X to Y)
- Record counts (approximate)
- Known quirks, inconsistencies, data quality issues
- How to connect (host, credentials pattern, Django config)

Output: `.ai/extended/databases/v1_schema.md`, `.ai/extended/databases/v2_schema.md`, `.ai/extended/databases/v3_schema.md`. Update `.ai/extended/databases.md` as the index.

V1 and V2 are frozen (no longer updated), so this documentation is permanent.

### Phase 2: Historical CSV processing

Process all historical manifest CSVs through the fast-cat pipeline:
- Inventory all available CSVs (local machine paths, counts, vendors)
- Detect or create ManifestTemplates for each unique header signature
- Generate fast_cat_keys for every row
- Map keys to canonical categories (seeded mappings + AI for unknowns)
- Build reusable tooling (management command or script) that can process a folder of CSVs

Output: a clean dataset with manifest line identifiers, retail_value, fast_cat_value for every historical manifest line.

### Phase 3: Sales join and sell-through computation

Join processed manifest lines to actual sold items across V1/V2/V3:
- Identify the join key(s) across databases (PO number + SKU, UPC, item identifier)
- Handle mismatches and data quality issues
- Compute `sum(sold_price) / sum(retail_value)` per fast_cat_value
- Document coverage gaps (items that sold but can't be traced to a manifest line, and vice versa)

Output: a PricingRule seed (category, sell_through_rate, sample_size, version_date) ready for Phase 5 to load into the database.

### Phase 4: Pricing rules table and Phase 5 handoff

- Create or populate the PricingRule model with computed rates
- Add admin-configurable factors: shrinkage_factor (default 0.10), profit_factor (default 2.0)
- Document the formula: `auction_value = sum(line_retail * category_rate) * (1 - shrinkage_factor)`, profitable when `auction_value >= profit_factor * (bid + fees + shipping)`
- Hand off to Phase 5 in bstock_auction_intelligence.md

---

## Sessions

_Session ID:_ count `### Session` headers below and add 1 for the next session. Keep full detail for the **3** most recent sessions; when starting session 4, collapse session 1 to one line.

### Session 1 — Local DB names (`ecothrift_v1` / `v2` / `v3`) + initiative alignment — est 1h — started 2026-04-09T08:45:00-05:00

**Goal:** Rename local database references so PO extract and notebook docs agree on DSN naming before running multi-DB scripts.

**Finish line:** `.env.example`, `databases.md`, and this initiative reference the `ecothrift_v*` names consistently.

**Scope:** `.ai/extended/databases.md`, `.ai/context.md`, initiative wording, deploy scripts — no extract logic yet.

#### Session updates

- 2026-04-09T08:45:00-05:00 Session started — grep for old DB name strings; draft initiative paragraph for V1/V2/V3.
- 2026-04-09T09:35:00-05:00 Cross-checked `import_*` management commands and notebook `_shared` config examples.

#### Result

Completed — committed (no bump) at `5923974` (chore: rename local databases to `ecothrift_v1`/`v2`/`v3`).

---

### Session 2 — PO extract script (V1/V2 paths) — est 2h — started 2026-04-09T10:00:00-05:00

**Goal:** Stand up `extract_po_descriptions.py` against local `ecothrift_v1` / `ecothrift_v2` with `.env` `DATABASE_*` and write consultant-facing CSV rows.

**Finish line:** Script runs on dev machine; PO-level rows land under **`workspace/data/`** with columns aligned to **`po_descriptions_all.csv`**.

**Scope:** Python script, argparse / connection helpers, error messages when DB unreachable; no dashboard UI.

#### Session updates

- 2026-04-09T10:00:00-05:00 Session started — scaffold script + V1/V2 DSN wiring from `.env`.
- 2026-04-09T11:15:00-05:00 First successful pull of PO headers; normalized description fields for CSV.

#### Result

Completed — committed as v2.7.1 at `28d1352` (CHANGELOG **[2.7.1]**).

---

### Session 3 — V3 guard + expanded outputs — est 2h — started 2026-04-09T11:30:00-05:00

**Goal:** Add optional V3 read when `public.inventory_purchaseorder` exists; emit category distribution + sell-through join artifacts for consultant review.

**Finish line:** `purchase_orders_all_details.csv` plus `po_category_distribution.csv` / `po_category_sell_through.csv` and `po_description_analysis.md` generated from one command run.

**Scope:** Script branches for V3 zero-row case; join to `workspace/data/sell_through_by_po.csv`; document caveats in markdown output.

#### Session updates

- 2026-04-09T11:30:00-05:00 Session started — V3 table guard + empty-result messaging.
- 2026-04-09T12:45:00-05:00 Category aggregation + markdown summary sections drafted.

#### Result

Completed — committed as v2.7.1 at `28d1352`.

---

### Session 4 — Track script + consultant doc sync — est 1h — started 2026-04-09T12:50:00-05:00

**Goal:** Version the extract in git while keeping generated blobs ignored; align consultant and initiative references.

**Finish line:** `.gitignore` whitelist for `extract_po_descriptions.py`; `CHANGELOG` **[2.7.1]** + `consultant_context.md` mention the workflow.

**Scope:** `.gitignore`, `CHANGELOG.md`, `.ai/consultant_context.md` cross-links only.

#### Session updates

- 2026-04-09T12:50:00-05:00 Session started — **`.gitignore`** whitelist for extract script path (since removed; script not committed today).
- 2026-04-09T13:30:00-05:00 CHANGELOG + consultant blurbs reviewed against script path.

#### Result

Completed — committed as v2.7.1 at `28d1352`.

---

### Session 5 — `seed_pricing_rules` CSV + Phase 5 handoff check — est 2h — started 2026-04-09T16:30:00-05:00

**Goal:** Align flat category rates with consultant CSV outputs and document how Phase 5 `PricingRule` seeds relate to future data-backed refinements.

**Finish line:** CSV + `AppSetting` keys validated against taxonomy_v1 list; notes captured for Phase 3–4 sales join (not blocking buying ship).

**Scope:** `seed_pricing_rules` inputs, category list parity with buying initiative; analysis only (buying app owns migrations).

#### Session updates

- 2026-04-09T16:30:00-05:00 Session started — compared extract categories to `taxonomy_v1` + planned `PricingRule` rows.
- 2026-04-09T18:40:00-05:00 Documented “manual seed now, historical join later” for Phase 3; handed off list to buying Phase 5 session.

#### Result

Completed — committed as v2.8.0 at `d863b4f` (seeds shipped with buying Phase 5 backend).

---

## Acceptance (initiative level)

- [ ] **Phase 1 complete:** `v1_schema.md`, `v2_schema.md`, `v3_schema.md` under `.ai/extended/databases/` (or equivalent) and `databases.md` index updated.
- [ ] **Phase 2 complete:** Tooling to process historical manifest CSVs through fast-cat; documented commands/paths.
- [ ] **Phase 3 complete:** Sales join + per-`fast_cat_value` sell-through computation with documented coverage gaps.
- [ ] **Phase 4 complete:** PricingRule seed / handoff documented; formula aligned with buying initiative.
- [x] **PO extract deliverable (v2.7.1):** `extract_po_descriptions.py` and outputs (see **Delivered tooling** above) — supports research; not a substitute for Phases 1–4.

---

## Open questions

- How many historical CSVs exist and across how many vendor formats?
- What are the join keys between manifest lines and sold items in V1 vs V2 vs V3?
- How complete is the sales data? What percentage of manifest lines can be matched to a sale?
- Are V1 and V2 databases accessible from the dev machine? Connection details?

---

## See also

- [`.ai/initiatives/bstock_auction_intelligence.md`](../../bstock_auction_intelligence.md) Phase 5 (consumer of this data)
- `workspace/notebooks/category-research/` (prior Bin 2 analysis, taxonomy_v1)
- `.ai/extended/databases.md` (database connection reference)
