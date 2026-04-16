<!-- Archived 2026-04-06: disposition=completed (unified extracts, taxonomy_v1, manifest mapping, Claude categorization, Bin2 vs Bin3 sell-through; actionable buying recommendations) -->
<!-- initiative: slug=category-sales-inventory-taxonomy status=completed updated=2026-04-06 -->
<!-- Last updated: 2026-04-06 (archived completed) -->
# Category intelligence: sales, shelf, and a usable taxonomy

## Scope of this document

This initiative file was the **full program** — **Phases 0 through 7** (three data bins, then canonical taxonomy, mapping, validation, and sales-vs-shelf comparison). It was the **single steering doc** for outcomes and phase exit criteria.

**Sprint plans** in Cursor (e.g. `category_initiative_first_steps_*.plan.md`) described **what we commit to in a given sprint** only. They were **not** a substitute for this file.

---

## Completion — **2026-04-06**

**Phases 0–7 are complete.** Deliverables include unified notebook SQL extracts for three bins (`scripts/sql/unified_bin*_public.sql`), the **19-category** spine ([`taxonomy_v1.example.json`](../../../../workspace/notebooks/category-research/taxonomy_v1.example.json)), rule-based manifest mapping ([`cr/taxonomy_estimate.py`](../../../../workspace/notebooks/category-research/cr/taxonomy_estimate.py)), full-item **AI categorization** via Claude ([`cr/prompts.py`](../../../../workspace/notebooks/category-research/cr/prompts.py), [`cr/categorize.py`](../../../../workspace/notebooks/category-research/cr/categorize.py), [`categorize.ipynb`](../../../../workspace/notebooks/category-research/categorize.ipynb)), and **sell-through** comparison of sold (Bin 2) vs on-shelf (Bin 3) by category.

**Outcome:** The project produced **actionable buying recommendations** (e.g. category-level understock vs overstock, margin and days-to-sell context). Onboarding: [`.ai/extended/development.md`](../../../extended/development.md) (*Jupyter*) and the **`workspace/notebooks/category-research/`** tree (**`category_research.ipynb`**, **`cr/`**).

| Phase | Completed |
|-------|-----------|
| 0 — Ground rules and workspace | 2026-04-06 |
| 1 — Bin 1: 2025 processed | 2026-04-06 |
| 2 — Bin 2: 2026 sold | 2026-04-06 |
| 3 — Bin 3: current store | 2026-04-06 |
| 4 — Canonical taxonomy | 2026-04-06 |
| 5 — Mapping (labels → canonical) | 2026-04-06 |
| 6 — Apply, validate, reconcile | 2026-04-06 |
| 7 — Comparison and decisions | 2026-04-06 |

---

## How we run extracts (unified notebook + legacy CLI; no SET search_path in SQL)

- **Unified notebook path (preferred for Phase 1):** [`scripts/sql/unified_bin1_public.sql`](../../../../scripts/sql/unified_bin1_public.sql), [`unified_bin2_public.sql`](../../../../scripts/sql/unified_bin2_public.sql), [`unified_bin3_public.sql`](../../../../scripts/sql/unified_bin3_public.sql) — identical columns from **`public`** item/manifest/product/**vendor**; Bin 3 uses **ecothrift** only to filter SKUs (retag notes). Run via [`workspace/notebooks/category-research/cr/`](../../../../workspace/notebooks/category-research/cr/) and [`category_research.ipynb`](../../../../workspace/notebooks/category-research/category_research.ipynb). Discovery queries: [`ai_scripts/sql/category_research_discovery.sql`](../../../../workspace/notebooks/category-research/ai_scripts/sql/category_research_discovery.sql) — run with [`ai_execute_sql.py`](../../../../workspace/notebooks/category-research/ai_scripts/ai_execute_sql.py) (see `scripts/sql/category_research_discovery.sql` for the one-line pointer).

- **Legacy CLI path:** **`export_category_bins`** ([`apps/inventory/management/commands/export_category_bins.py`](../../../../apps/inventory/management/commands/export_category_bins.py)) runs older bin SQL from [`scripts/sql/`](../../../../scripts/sql/) (Bins 1–2 **`public.*`**; legacy Bin 3 was **`ecothrift.*`**-shaped). Still supported for existing workflows.

- **Bins 1–3** use one connection: Django’s **`default`** database (`DATABASE_*` in `.env`). Typical production: **same** Postgres holds both schemas — no second `DATABASES` entry.

- **Do not** rely on `SET search_path` in hand-written SQL for this initiative — qualify tables (`public.inventory_item`, `ecothrift.inventory_item`, …). Django’s `search_path=ecothrift` on the default connection does not replace explicit `public.` prefixes in these scripts.

**Shared taxonomy columns** — See [`docs/taxonomy_input_schema.md`](../../../../workspace/notebooks/category-research/docs/taxonomy_input_schema.md) for the **unified** contract (`vendor_name`, identical column order) vs legacy CLI. Do not use `ecothrift.inventory_item.category` as a taxonomy proxy.

**Taxonomy list artifact** — [`taxonomy_v1.example.json`](../../../../workspace/notebooks/category-research/taxonomy_v1.example.json) holds the **19 canonical categories** (`taxonomy_v1`); use with `categorize_category_bins --taxonomy`. Copy to `taxonomy_v1.json` in the same folder locally if you fork names (gitignored).

**AI mapping (Bins 2–3)** — [`categorize_category_bins`](../../../../apps/inventory/management/commands/categorize_category_bins.py): `python manage.py categorize_category_bins --taxonomy … --bin bin2|bin3 --input …`. Logs: **`logs/categorization/*.jsonl`** (gitignored). Outputs: **`categorized_exports/`** (gitignored; includes **`_chunks/`** during long runs).

**Reports** — [`report_category_bins`](../../../../apps/inventory/management/commands/report_category_bins.py): aggregates validated assignments for Bin 2 and Bin 3 → markdown under **`reports/`** (gitignored).

**Process logs** — Append-only **`logs/extraction_runs.log`** for exports; optional human notes can live in the same **`logs/`** tree or in this initiative. **SQL staging** (temp tables): document in initiative or a dated file under **`logs/`** when used.

**Notebook project** — [`category_research.ipynb`](../../../../workspace/notebooks/category-research/category_research.ipynb) plus [`cr/`](../../../../workspace/notebooks/category-research/cr/) helpers. CLI artifact paths remain in [`apps/inventory/category_research_paths.py`](../../../../apps/inventory/category_research_paths.py).

**Working principles**

1. **Automate first** — Prefer **`manage.py`**, unified SQL, or the **`cr`** notebook helpers so work is **repeatable** and **verifiable**; Jupyter is for review/pickle, not one-off spreadsheets.
2. **Sequential delivery** — Plan the next step **after** the previous one is validated (row counts, spot checks). Avoid shipping a bundle of manual steps 1–4 when step 1 might force a redesign of 2–4.
3. **Verify extracts** — Do not treat an extract as “done” until counts and a quick sanity pass match expectations (document anomalies in **Notes**).

---

## Three data bins (where each story lives)

| Bin | Question it answers | Where the data lives |
|-----|---------------------|----------------------|
| **1 — Processed in 2025** | What did we touch and how was it labeled? (foundation for **categories**) | **`public`** (V2-era tables, same DB as V3) |
| **2 — Sold in 2026** | **What do people actually buy?** | **`public`** POS (same DB) |
| **3 — In store now** | **What do I have on hand?** | **`ecothrift`** (V3; **sold** rows excluded from extract — still in DB for reporting) |

---

## Outcome I am driving toward

1. **What actually sells** — by category: units, dollars, % of retail where available (**Bin 2**).
2. **What I am holding** — same framing for current stock (**Bin 3**).
3. **Bin 1** trains **labels** and mapping before comparing Bins 2 and 3 on the **same** category spine.

---

## What I need the ability to do

- **Work from Bin 1** — Full **2025 processed** slice from **`public`** with manifest/product context.
- **Work from Bin 2** — **2026** POS sales from **`public`**.
- **Work from Bin 3** — **ecothrift** item rows **excluding `sold`** (sold history stays in DB for reporting; not in this extract), with derived retail where rules exist.
- **Map labels → canonical categories** systematically (AI assists; human sign-off).
- **Compare** Bin 2 vs Bin 3 on the **same** canonical categories (counts, avg $, avg % retail with coverage notes).

---

## Why this is valuable

- **Buying / pricing / staff clarity** — Same as before: decisions need trustworthy categories and honest retail coverage.
- **Repeatability** — Command-based exports plus logs avoid one-off spreadsheets nobody can reproduce.

---

## Key concepts and must-haves

- **Three bins, three jobs** — Do not merge the questions; **`public`** (V2) vs **`ecothrift`** (V3) in the **same** database is intentional.
- **Retail / estimated retail** — Part of the analytics story; document **missing** retail, do not silently average junk.
- **SKU as bridge** — Across DBs when both sides exist.
- **Artifacts** — [`workspace/notebooks/category-research/`](../../../../workspace/notebooks/category-research/) (generated `exports/`, `logs/`, etc., are gitignored locally).

---

## Project phases (stay on track)

Skip ahead only when a phase’s **exit criteria** are met (or explicitly waived in writing). Extracts use **`export_category_bins`** where applicable.

### Phase 0 — Ground rules and workspace

**Purpose:** One definition each for “processed,” “sold,” and “in store”; artifacts don’t sprawl.

**Do:** Resolve or default open decisions; confirm **`workspace/notebooks/category-research/`** layout for exports/logs; name who signs off on taxonomy.

**Exit criteria:** Project README records three bin definitions and export naming (append **`logs/extraction_runs.log`** on first extract).

**Depends on:** Nothing.

---

### Phase 1 — Bin 1: 2025 processed (taxonomy evidence)

**Purpose:** Volume and real labels from legacy processing.

**Do:** Run **`export_category_bins --bins bin1`**; rollups by legacy label; short read (top labels, merge candidates, junk, blanks).

**Exit criteria:** CSV in **`exports/`** + notes (optional milestone in initiative or `logs/`).

**Depends on:** Phase 0.

---

### Phase 2 — Bin 2: 2026 sold (what people buy)

**Purpose:** Demand from POS.

**Do:** **`export_category_bins --bins bin2`**; sanity-check row counts.

**Exit criteria:** CSV + one-paragraph sanity note (initiative or `logs/`).

**Depends on:** Phase 0. Can parallel Phase 1 after Phase 0.

---

### Phase 3 — Bin 3: current store (what I have)

**Purpose:** Supply in V3.

**Do:** **`export_category_bins --bins bin3`** (SQL omits **`status = sold`** — sold rows remain in DB for reporting); coverage note (blank category, missing retail).

**Exit criteria:** CSV + coverage stats (documented in initiative or `logs/`).

**Depends on:** Phase 0. Can parallel Phases 1–2.

---

### Phase 4 — Canonical taxonomy (draft → sign-off)

**Purpose:** Lock the list of new categories before mapping at scale.

**Do:** Draft from Bin 1 rollups + Bin 2/3 spot checks; stress-test names; sign off (`taxonomy_v1`).

**Exit criteria:** Published list with version; explicit “out of scope for v1” if needed.

**Depends on:** Phases 1–3 sufficient for edge cases.

---

### Phase 5 — Mapping (old labels → canonical)

**Purpose:** Systematic mapping (AI assists; human owns exceptions).

**Do:** Mapping table; AI/bulk first pass; human review on hot spots; document defaults and exceptions.

**Exit criteria:** Mapping artifact + coverage % + small named unmapped list.

**Depends on:** Phase 4.

---

### Phase 6 — Apply, validate, reconcile

**Purpose:** Catch double-counts, bad joins, bad mapping.

**Do:** Apply rules; spot-check rows; reconcile money totals where possible; bump mapping version if needed.

**Exit criteria:** Validation log; no silent giant “unknown” bucket.

**Depends on:** Phase 5.

---

### Phase 7 — Comparison and decisions (outputs)

**Purpose:** Bin 2 vs Bin 3 on canonical categories (counts, avg $, avg % retail); optional buying narrative.

**Exit criteria:** Dated snapshot under **`reports/`** (or notebook output); actionable read without re-deriving numbers.

**Depends on:** Phase 6.

---

### Phase sequencing at a glance

| Phase | Name | Parallel? |
|-------|------|-----------|
| 0 | Ground rules | First |
| 1 | Bin 1 processed 2025 | After 0; parallel with 2–3 |
| 2 | Bin 2 sold 2026 | After 0; parallel with 1, 3 |
| 3 | Bin 3 current store | After 0; parallel with 1, 2 |
| 4 | Canonical taxonomy | After 1–3 have exports |
| 5 | Mapping | After 4 |
| 6 | Validate | After 5 |
| 7 | Compare & decide | After 6 |

---

## Success looks like

- Named **canonical categories** with traceability to Bin 1 evidence.
- **Comparable** Bin 2 vs Bin 3 metrics on that spine, with **coverage** called out.
- Clear **buying** narrative from the numbers.

---

## Open decisions

- Subcategories in v1 or not.
- Missing retail handling for % metrics.
- Exact **“processed in 2025”** column in **`public`**.

---

## See also

- **`python manage.py export_category_bins`** — [`apps/inventory/management/commands/export_category_bins.py`](../../../../apps/inventory/management/commands/export_category_bins.py)
- **`python manage.py categorize_category_bins`** — [`apps/inventory/management/commands/categorize_category_bins.py`](../../../../apps/inventory/management/commands/categorize_category_bins.py)
- **`python manage.py report_category_bins`** — [`apps/inventory/management/commands/report_category_bins.py`](../../../../apps/inventory/management/commands/report_category_bins.py)
- **[`.ai/extended/development.md`](../../../extended/development.md)** — Jupyter / notebook setup; **`workspace/notebooks/category-research/`** — exports, taxonomy, AI, reports
- **[`apps/inventory/category_research_paths.py`](../../../../apps/inventory/category_research_paths.py)** — canonical paths for CLI outputs
- **[`apps/inventory/services/category_taxonomy.py`](../../../../apps/inventory/services/category_taxonomy.py)** — taxonomy helpers and validation
- **[`scripts/sql/`](../../../../scripts/sql/)** — `unified_bin*_public.sql`, `category_research_discovery.sql`, legacy `public_bin*_`, `ecothrift_bin3_*`
- **Backlog:** [item retail on instance](../_backlog/item_retail_price_on_instance.md)

---

*Parent: [`.ai/initiatives/_index.md`](../../_index.md).*
