<!-- Last updated: 2026-03-24T23:00:00-06:00 -->
<!-- Archived from `.ai/plans/retag_cutover.md` — historical cutover checklist; live ops: `.ai/extended/retag-operations.md`. Migrated to `.ai/initiatives/_archived/_completed/` 2026-03-27. -->
# Plan: Retag + New Dashboard Cutover

End-to-end plan to replace the **old dashboard** (production; documented in `workspace/notes/context-dump/`) with **this repo** (new dashboard), using a **Retag** workflow: scan legacy tag → create new `Item` → print new label compatible with new POS.

---

## Status (2026-03-24)

**Preview / engineering readiness — closed.** DB2 snapshot checks (`retag_db2_readiness.ipynb`), import path validation, condition mapping (`retag_condition.py`), and v2 API + `RetagPage` are treated as **good enough to pilot** on a restored DB2 and dev DB3. No further preview-specific discovery is planned in-repo until ops schedules cutover.

**Still open** — production scheduling, staging import on real DB3, physical scanner/label checks, and Phase A–G below when the store is ready. This file remains the **master cutover checklist**. Repo layout and dev conventions are documented in `.ai/extended/development.md` / `README.md`; historical org plan: [codebase organization (retired)](./codebase_organization.md).

---

## How this relates to what is already built

This project **already ships Retag v2** (DB2 → DB3):

| Piece | Location |
|-------|----------|
| Staging model | `TempLegacyItem` in `apps/inventory/models.py` |
| Per-scan audit | `RetagLog` |
| Import from old DB snapshot | `python manage.py import_db2_staging` (`apps/inventory/management/commands/import_db2_staging.py`) |
| API | `POST /api/inventory/retag/v2/lookup/`, `create/`, `GET stats/`, `history/` |
| UI | `frontend/src/pages/inventory/RetagPage.tsx` → route `/inventory/retag` |
| Ops | `.ai/extended/retag-operations.md`, `.ai/extended/inventory-pipeline.md` |

**Default pricing behavior you asked for** is already available as a *strategy*: choose **“% of retail value”** and set the percentage (e.g. **55**). Remaining product work is mostly **presets** (remember 55% as default), **bulk overrides** for many SKUs, and **validation** against real production data and scanners.

---

## DB2 readiness — `retag_db2_readiness.ipynb` results (2026-03-24)

Snapshot from a successful notebook run against local DB2 restore:

| Check | Result |
|--------|--------|
| Tables `inventory_item` / `inventory_product` / `inventory_item_history` | Present |
| Duplicate active SKUs | **0** |
| SKU format | Length **10** everywhere; **0** rows with leading/trailing whitespace |
| **Importable rows** (`sold_at IS NULL` + product join) | **25,071** |
| **on_shelf** vs **processing** (within importable) | **18,572** / **6,499** |
| Unsold rows missing product | **0** |
| `retail_amt` null or zero | **2** (handle manually or fallback price on retag) |
| `starting_price` null or zero | **5** |
| Empty condition (no history) | **6,500** (~matches processing-heavy set) |
| Distinct conditions | Mostly `good`, empty, `very_good`, `salvage`; **11 × `poor`** (not a DB3 choice — now mapped to **`fair`** in code via `apps/inventory/retag_condition.py` + import) |
| Non-ASCII in titles | **92** (UTF-8 OK) |

**Decisions / next steps from this snapshot**

1. **Scope:** ~25k importable items vs ~10k on floor — confirm whether **all unsold** get tags or only **`on_shelf`** (~18.6k). If the latter, consider a filtered import or ops SOP to skip `processing` without physical tags.
2. **Run staging import on DB3:** `python manage.py import_db2_staging` (use `--update-existing` before retag day per `.ai/extended/retag-operations.md`).
3. **Spot-check the 2 + 5** pricing edge rows after import.
4. **Optional:** Set `RUN_DEV_CHECK = True` in the notebook to compare `TempLegacyItem` counts on dev after import.
5. **Remaining Phase A (ops):** Barcode on tag = `sku` (sample shows `ITM…`); scanner sends uppercase — quick physical scan test still recommended.

---

## Phase A — Questions for the AI (or engineer) owning the old database

*(Deferred to go-live prep — preview did not require blocking answers on every item.)*

Hand this section to the old-dashboard context owner when cutover is scheduled. Answers should be **copy-paste friendly** (SQL snippets, row counts, sample rows).

### A1. Physical tag ↔ database identity

1. **What exact string is encoded on the barcode** printed for floor items? Is it always `inventory_item.sku`, or a prefix/suffix, UPC, or secondary id?
2. **Normalization rules**: leading zeros, case, whitespace, check digits — what do scanners typically send vs what Postgres stores?
3. **Are duplicate `inventory_item.sku` values possible** in production? If yes, how are they disambiguated on the tag?

### A2. “On shelf” definition (must match staging import)

The new dashboard’s `import_db2_staging` treats **active** items as: `sold_at IS NULL` (see `ACTIVE_QUERY` in `import_db2_staging.py`).

4. Confirm that **every item you expect to retag on the floor** satisfies that predicate **or** provide the correct filter (e.g. returns, layaway, “processing” rows that still have tags).
5. **Count check**: `COUNT(*)` of rows your business calls “must retag” vs count produced by that query (and explain any delta).

### A3. Schema and column semantics (validate the import SQL)

6. Confirm **table and column names** on production match what the import uses: `inventory_item` (`sku`, `starting_price`, `retail_amt`, `sold_at`, `on_shelf_at`, `product_id`, …), `inventory_product` (`title`, `brand`, `model`), `inventory_item_history` (`condition`, `updated_on`, `item_id`).
7. For **`starting_price` vs `retail_amt`**: which is “tag price” today on the old POS, and which should drive **% of retail** in the new app?
8. **Condition**: is latest `inventory_item_history` row the right source when present? What should happen when **no history row** exists (null/empty in staging today)?

### A4. Data quality and edge cases

9. Sample **20 real rows** (anonymized if needed): `sku`, `title`, `brand`, `starting_price`, `retail_amt`, `derived_status`, `condition` — exported with the **same SQL** the import uses.
10. Any items with **NULL or zero retail** where pricing strategy depends on retail — how should the store operate those on retag day?
11. **Products** with multiple active items, **items** missing products, or orphaned rows — counts and whether they can appear on the sales floor.

### A5. Snapshot / access for retag night

12. **How you will supply a Postgres backup or read-only replica** the night before or morning of retag so `import_db2_staging --update-existing` reflects latest prices (see `.ai/extended/retag-operations.md`).
13. Confirm **encoding / locale** (UTF-8) for titles with special characters so staging import does not corrupt text.

### A6. Old POS / label format (for sanity checks)

14. **Label layout**: human-readable fields and barcode field — what must match for staff to trust the scan?
15. After cutover, will old registers still run briefly? If yes, define **freeze** rules (no price changes on old DB after snapshot).

---

## Phase B — Data contract (new dashboard)

1. **Freeze the staging query** in code or document any production-specific overrides (if A2/A3 differ from current `ACTIVE_QUERY`).
2. **Map legacy condition strings** to new `CONDITION_CHOICES` (`Item` / Retag UI) — list any legacy values that do not map 1:1.
3. **Decide default Retag session settings**: default strategy = `% of retail`, default percentage = **55** (or your number), default `source` (purchased / consignment / house).
4. **Print payload**: confirm `retag_v2_create` response matches what `localPrintService` and the print server expect for **new** barcodes (SKU format `ITM…`).

---

## Phase C — New dashboard readiness (non-retag)

Work in parallel so “replace old dash” is not only retag:

1. **Parity checklist** — HR, inventory (non-retag), POS, consignment, admin: which features the store uses daily on old dash vs this repo (use context-dump routes/models as the old-side inventory).
2. **Production deploy path** — Heroku (or target): env vars, migrations, static build, database (DB3).
3. **Auth and roles** — staff accounts, permissions for retag and POS.
4. **Print server** — installed on every retag workstation; test label from `RetagPage` and from POS scan.

---

## Phase D — Retag UX and workflow hardening

1. **Dry run** — full `before_retag.md`: clear test data, import staging, scan sample SKUs, print, POS scan.
2. **Concurrent AI / optional**: not required for retag; ignore unless you use AI pricing strategy (`estimate`).
3. **Gaps vs ideal UX** (implement as needed):
   - **Default preset**: open Retag with strategy `% of retail` and pct **55** pre-filled.
   - **Bulk price override**: e.g. select many rows in session history and re-apply price (today each scan is individual; “50 items different price” may mean workflow: change strategy/pct before each batch, or a small bulk-edit feature).
   - **Duplicate scan policy**: today the app **always creates a new Item** with a warning; confirm that is still desired for retag day SOP.
4. **Hardware**: wired scanners, focus behavior, F2 / Enter behavior on `RetagPage` (verify on real machines).

---

## Phase E — Retag day (execution)

1. Final **DB2 snapshot** → local restore as `db2` (or adjust `DB2_CONFIG` in import command to match your environment).
2. `python manage.py import_db2_staging --update-existing`
3. Operators use **`/inventory/retag`** — scan → confirm/adjust price → print.
4. **Monitor**: `GET /api/inventory/retag/v2/stats/` and SQL from `.ai/extended/inventory-pipeline.md` / `retag-operations.md` (missed SKUs, duplicate scans).

---

## Phase F — After retag (`.ai/extended/retag-operations.md`)

1. Reconcile **missed** `TempLegacyItem` rows and **duplicate** `RetagLog` SKUs.
2. POS smoke test on new tags.
3. **Drop scaffolding**: `TempLegacyItem`, `RetagLog`, v2 endpoints, `RetagPage`, sidebar entry — per `after_retag.md`.
4. Run **historical / ML imports** when ready (`import_historical_sold`, etc.) — separate from retag floor event.

---

## Phase G — Decommission old dashboard

1. Redirect or retire `dash.ecothrift.us` (or old URL) once new dash is authoritative.
2. Archive read-only old DB backup; document where it lives.
3. Update internal SOP: single source of truth for inventory and POS.

---

## References

| Doc | Purpose |
|-----|---------|
| `workspace/notes/context-dump/OVERVIEW.md` | Old dashboard entry point |
| `workspace/notes/context-dump/MODELS-AND-DATABASE.md` | Old app tables / inventory |
| `.ai/extended/retag-operations.md` | Pre– / post–retag pointers |
| `.ai/extended/inventory-pipeline.md` | Retag v2 technical summary and endpoints |

---

## Open decisions (owner: you + store ops)

- Exact **default % of retail** (e.g. 55) and whether it ever varies by **category** (future).
- Whether **duplicate physical tags** (same legacy SKU scanned twice) should **block** instead of warn.
- **Cutover window**: hours/days when old POS is forbidden.

---

*Preview closed 2026-03-24; archived as historical reference. For day-of procedures use `.ai/extended/retag-operations.md`. Update the timestamp if you edit this archive copy.*
