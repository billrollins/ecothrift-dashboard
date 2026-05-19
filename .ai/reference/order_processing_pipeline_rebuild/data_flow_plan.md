<!-- intake data flow. design draft — partial supersession by v2.24.0 shipped code -->
# Intake pipeline. Data flow plan (review draft v2)

> **Status:** Design archaeology. **Shipped behavior** and runbooks: initiative [`order_processing_pipeline_rebuild`](../../initiatives/order_processing_pipeline_rebuild.md), [`_recon/README.md`](./_recon/README.md), [`extended/inventory-pipeline.md`](../../extended/inventory-pipeline.md). Repo root [`CHANGELOG.md`](../../../CHANGELOG.md) **`[2.24.0]`** / **`[2.24.1]`**.

What this is: which tables are source of truth vs transient, when rows appear and disappear, how stage tracking works across parallel pipeline tracks, and open design questions at write time.

What this is not: the live operational runbook (use `_recon/` + repair command).

---

## 1. Table roster

### Persisting (source of truth)

| Table | Role | Lifetime |
|---|---|---|
| `inventory_purchaseorder` | Order-level details. Single source of truth across the whole pipeline. | Indefinite |
| `inventory_manifestrow` | True inventory data (post-finalize) | Indefinite |
| `inventory_item` | True inventory data | Indefinite |
| `inventory_product` | True inventory data | Indefinite |
| `inventory_csvtemplate` | Header-signature-keyed templates for standardization | Indefinite |

### Transient (intake working data)

| Table | Role | Lifetime |
|---|---|---|
| `inventory_preprocessingrow` | Working data for preprocessing. `raw_row` JSONB plus standard / ai / final overlays. See §3. | Deleted X days after intake close. Q4. |
| `inventory_processingrow` | Working data for processing | Deleted X days after intake close. Q4. |

### Receiving

`inventory_receiving`, `inventory_receivingattachment`, `inventory_receivingpallet` — **shipped** (see **`v2.24.0`**).

### Disputes

`inventory_dispute` — **shipped** (migration wave **`0045+`**); see services + API in codebase.

### Dropping (planned)

| Table | Notes |
|---|---|
| `inventory_preprocessingorder` | **Dropped** in migration **`0047`**; fields on `inventory_purchaseorder`. |
| `inventory_processingbatch` | TBD when processing rebuild starts |
| `inventory_processingdatabuild` | TBD when processing rebuild starts. Currently active in Item Processor materialization. |
| `inventory_itemswapaudit` | Legacy, no active writes. Drop candidate. |
| `inventory_productmergeaudit` | Active in merge path. TBD with processing rebuild. |

### Audit (proposed)

If audit is needed at all: one general `audit` table with `id`, `type`, `data`, `status`, `date`. Logical delete only. Purge policy keyed by `type`. See Q5.

---

## 2. `inventory_purchaseorder` shape (proposed)

### Current column groups

```
-- Identity
--   id, order_number, status
-- Vendor
--   vendor_id, vendor_name_cache, vendor_code_cache
-- Dates (lifecycle)
--   ordered_date, paid_date, shipped_date, expected_delivery, delivered_date
-- Costs
--   purchase_cost, shipping_cost, fees, total_cost, retail_value, est_shrink
-- Order contents
--   item_count, order_pallet_count, condition, description, notes
-- Manifest (denormalized from S3 + parse)
--   manifest_id, manifest_filename, manifest_uploaded_at,
--   manifest_row_count, manifest_category_count, manifest_preview
-- Preprocessing
--   ai_cleanup_generation
-- Search
--   search_text
-- Audit
--   created_by_id, created_at, updated_at
```

### Planned changes

**1. Renames**
- `order_pallet_count` → `pallet_count`

**2. Stage tracking. Per-stage status columns.**

The pipeline is NOT linear. Preprocessing and Receiving run in parallel after Order Create and converge before Processing. Disputes can start during receiving and run alongside other stages. A single `intake_stage` enum cannot represent this honestly, so each stage owns its own status field on the PO. Per-stage status freezes at its terminal value when the stage completes (useful for audit). Cross-track gates live in code, not in the schema.

| Column | Values | Notes |
|---|---|---|
| `preprocess_status` | `not_started`, `standardized`, `cleaned`, `reviewing`, `finalized` | Replaces `PreprocessingOrder.workflow_status` and `current_step` and frontend-derived `completedStep`. |
| `receiving_status` | `not_started`, `active`, `done` | Independent of preprocess. |
| `processing_status` | `not_started`, `active`, `done` | Gated by `preprocess_status='finalized'` AND `receiving_status='done'`. |
| `closeout_status` | `open`, `closed` | Final terminal state. |
| `intake_dispute_status` | `none`, `active`, `resolved` | Rollup of pre-processing-kind disputes. |
| `processing_dispute_status` | `none`, `active`, `resolved` | Rollup of post-processing-kind disputes. |

The dashboard "headline state" is computed from these (bottleneck rule, most-advanced, or composite display). Q14.

**3. Stage timestamps.** Per-stage event dates kept alongside the status columns for full audit.

| Column | Set when |
|---|---|
| `standardized_at` | Standardize Manifest action completes |
| `ai_cleaned_at` | AI Cleanup completes |
| `review_saved_at` | First save in Review tab |
| `finalized_at` | Finalize action completes |
| `receiving_started_at`, `receiving_done_at` | TBD with receiving page |
| `processing_started_at`, `processing_done_at` | TBD with processing rebuild |
| `closed_at` | Closeout |

**4. Manifest fields to add** (currently on `inventory_preprocessingorder` or in `manifest_preview` JSON)
- `manifest_headers` (JSONB list of header strings)
- `manifest_signature` (text, MD5 of normalized headers; powers Step 3 template lookup). NOT in migration 0045; needs new migration.
- `template_id` (FK, nullable). Set ONLY when user picks a template in Step 3. NOT set at upload.
- Template caches, refreshed when `template_id` changes:
  - `template_name_cache` ← `csvtemplate.name`
  - `template_header_signature_cache` ← `csvtemplate.header_signature`
  - `template_column_mappings_cache` ← `csvtemplate.column_mappings`

**5. Standardization formulas.** Today on `PreprocessingOrder.standardization_formulas`. This is per-PO override state, not a template cache. Move to PO as `standardization_formulas` (JSONB), captured/updated when standardize runs.

**6. Drop `inventory_preprocessingorder`.** Field disposition:
- KEEP (move to PO): `manifest_headers`, `template_id`, `template_*_cache`, `standardization_formulas`, plus the new `manifest_signature`
- DROP entirely: `workflow_status` and `current_step` (replaced by per-stage status), `row_count` (= `manifest_row_count`), `created_at`, `updated_at`, `purchase_order_id`, `header_signature` (renamed `manifest_signature` on PO), `template_name` (replaced by `template_name_cache`)

---

## 3. `inventory_preprocessingrow` shape (proposed)

Each row is one source row from the manifest, plus overlay column families added by each preprocessing stage. Earlier columns are NEVER overwritten by later stages.

| Family | Filled by | Meaning |
|---|---|---|
| `raw_row` (single JSONB, unprefixed) | Standardize Manifest (Tab 1) | Vendor raw cells. Load-bearing: powers manifest-row search and formula re-evaluation. |
| `standard_*` | Standardize Manifest (Tab 1) | Template-mapped standardized values. Note: `standard_`, not `stand_`. |
| `ai_*` | AI Cleanup (Tab 2) | AI overlay on top of `standard_*`. |
| `final_*` | Review / Price / Finalize (Tab 3) | Human overlay on top of `ai_*`. |

Other columns (unprefixed) are row identity, ordering, audit, and pricing economics. Roughly: `id`, `purchase_order_id`, `row_number`, `quantity`, `unit_retail`, `proposed_price`, `final_price`, `pricing_stage`, `pricing_notes`, `batch_flag`, `ai_status`, `updated_at`. These are not stage overlays; they're cross-cutting per-row metadata. Pricing fields specifically may want a tighter prefix scheme later, but that's a separate cleanup.

**Why this shape:**
- Lineage preserved within a single row. No separate generation table.
- Undo is a column-NULL operation, not a row delete. See §6.
- Bulk insert into `inventory_processingrow` on finalize uses a coalesce: `final_*` else `ai_*` else `standard_*`. See Q3.

---

## 4. Pipeline stages

Canonical step list from `2026.05.08_intake_updates.md` is reference-only. The real graph is a DAG: Preprocessing and Receiving run in parallel, Processing waits for both, disputes can start during receiving and run in parallel with other stages.

### Step 1. Create Order

**Surface:** Order list page → "New order" dialog
**Trigger:** User clicks "New order"

**Reads (on open):** `inventory_vendor` (id, name, code) for vendor dropdown.
**Optional edits:** form fields, dialog state until submit.
**Gate to advance:** `vendor_id` set.
**Writes on advance** (POST `/orders/`):
- `inventory_purchaseorder`: INSERT. Initial values for vendor, order_number (generated if blank), ordered_date, costs, counts, description, condition, notes.
- Side-effect on save: `vendor_name_cache`, `vendor_code_cache`, `search_text`, `total_cost` populated by model.

**Deletes:** none.

### Step 2. Edit Order

**Surface:** Order Detail page (`/inventory/orders/:id`)
**Trigger:** User opens the page.

**Reads (on page load):** `inventory_purchaseorder` 1 row via the `detail-surface` endpoint (already live).
**Optional edits:** writable PO scalars. PATCH on save click.
**Deletes:** none.

### Step 2b. Upload Manifest

**Surface:** Order Detail page, manifest panel.
**Trigger:** User selects file.

**Writes on upload** (single atomic save):
- `core_s3file`: INSERT.
- `inventory_purchaseorder`: UPDATE `manifest_id`, `manifest_filename`, `manifest_uploaded_at`, `manifest_row_count`, `manifest_category_count`, `manifest_preview`, `manifest_headers`, `manifest_signature`.

NOT set here: `template_id`, `template_*_cache`, `standardization_formulas`. These are Step 3 decisions.

NOT included in `manifest_preview` going forward: `template_id`, `template_name`, `template_mappings`. Strip from current code; these belong on PO scalars (set in Step 3) or not at all.

**Writes on remove:**
- `inventory_purchaseorder`: NULL all manifest fields above.
- `core_s3file`: DELETE row + storage key.

**Deletes:** `inventory_preprocessingrow` rows for this PO if preprocessing was started before re-upload.

### Step 3. Preprocessing (parallel with Receiving)

**Surface:** `/inventory/preprocessing/:id`
**Tabs:** Standardize → AI Cleanup → Review / Finalize
**Trigger:** User opens the page.

#### On page load (all tabs)

**Reads:**
- `inventory_purchaseorder`: 1 row. `preprocess_status`, manifest fields, template caches, all stage timestamps, row counts. Drives the "you are on step X" / "Y rows ready to clean" / "standardized at Z using template W" summaries.
- `inventory_csvtemplate`: rows WHERE `header_signature = po.manifest_signature`, ordered by last-used. Powers the template picker.

NOT read on page load: `inventory_preprocessingrow`. Status info comes from PO scalars.

#### Tab 1. Standardize Manifest

**Action:** "Standardize Manifest" button. Tab open does no I/O.

**Reads on action:**
- `inventory_purchaseorder`: manifest pointer + signature.
- `inventory_csvtemplate`: 1 row (chosen template, or just-created one).
- `core_s3file`: full manifest content via `manifest_id`. **This is the only S3 full-file parse the design wants in the entire preprocessing flow.** Today's code parses S3 in additional places (see §9); reducing to one is a design goal, not yet reality.

**Writes on action:**
- `inventory_preprocessingrow`: INSERT one row per manifest row. `raw_row` JSONB + `standard_*` columns populated.
- `inventory_purchaseorder`: UPDATE `template_id`, `template_*_cache`, `standardization_formulas`, `standardized_at`, `preprocess_status='standardized'`.
- `inventory_csvtemplate`: INSERT 1 row IF user chose "create new template" (`name`, `header_signature`, `column_mappings`).

#### Tab 2. AI Cleanup

**Action:** "Run cleanup" (download cleanup CSV → external AI flow → upload cleaned CSV). Mechanics already in code.

**Reads on action:** `inventory_preprocessingrow` rows for this PO. `standard_*` values feed the download CSV.

**Writes:**
- `inventory_preprocessingrow`: UPDATE `ai_*` columns per row.
- `inventory_purchaseorder`: UPDATE `ai_cleaned_at`, `ai_cleanup_generation`, `preprocess_status='cleaned'`.

#### Tab 3. Review / Price / Finalize

**On tab open:** first time prep rows enter the read path on this page.

**Reads:**
- `inventory_preprocessingrow`: rows for this PO, all column families, for diff display and editing.
- `inventory_purchaseorder`: refresh.

**Writes during editing:**
- `inventory_preprocessingrow`: UPDATE `final_*` columns per row. Save mode TBD (autosave vs save click). Q13.
- `inventory_purchaseorder`: UPDATE `review_saved_at`, `preprocess_status='reviewing'`. Possibly other PO scalars. Q12.

**Writes on Finalize:**
- `inventory_purchaseorder`: UPDATE `finalized_at`, `preprocess_status='finalized'`.
- `inventory_processingrow`: bulk `INSERT ... SELECT` from `inventory_preprocessingrow`. Coalesce per Q3.

### Step 4. Receiving (parallel with Preprocessing)

**Surface:** `/inventory/receiving/:id` (draft `inventory_receiving`, `inventory_receivingpallet`, `inventory_receivingattachment`).

**PO train:** `receiving_status`: `not_started` → `active` (first draft touch) → `done` (successful complete). Timestamps: `receiving_started_at`, `receiving_done_at`.

**Completion:** Sets `PurchaseOrder.status='delivered'` / `delivered_date` but **does not** create `ManifestRow` / `Item` for new POs. Legacy POs with `uses_legacy_processing=True` may still use operator-only `build_legacy_checkin_queue` for manifest→item materialization. Processing owns canonical materialization for the new path.

**Gate:** Processing mutations require `receiving_status='done'` (with finalized preprocessing).

### Step 5. Processing

**Surface:** Processing page.
**Gate to advance:** `preprocess_status='finalized'` AND `receiving_status='done'`.

**PO train:** `processing_status` `not_started` / `active` / `done` with `processing_started_at` / `processing_done_at`. `uses_legacy_processing` on PO selects legacy vs new processing branches (backfilled; new POs default `False`).

Canonical `ManifestRow` / `Item` materialization stays in Processing (`ProcessingDataBuild`); Q1–Q3 locked: bookmark-per-row, coalesce at finalize, chunked build.

### Step 6. Disputes (parallel; can start during receiving)

**Table:** `inventory_dispute` (kind `intake` | `processing`, status `open` | `resolved` | `cancelled`). Rollups: `intake_dispute_status` and `processing_dispute_status` on PO (`none` | `active` | `resolved`).

Intake disputes are created from Receiving (pallet-linked). Processing disputes are recorded when marking items disputed via the existing processing-dispute endpoint (durable row + `dispute_id` in response).

### Step 7. Closeout

**Writes on advance:**
- `inventory_purchaseorder`: `closeout_status='closed'`, `closed_at`, top-level `status` if applicable.

**Gate (Q15):** does closeout block on open disputes, or close with disputes outstanding?

**Deletes (background sweep):** `inventory_preprocessingrow` and `inventory_processingrow` rows for this PO, X days after `closed_at`. See Q4.

---

## 5. Stage status modeling (rationale)

Three sources of truth exist today and must collapse into one:
1. `PreprocessingOrder.workflow_status` (5 string values: `draft`, `standardized`, `ai_imported`, `review`, `finalized`)
2. `PreprocessingOrder.current_step` (numeric: 0=standardize, 1=AI, 2=review)
3. Frontend-derived `completedStep` from row counts (`-1` if no rows; `0` rows exist; `1` all rows have `ai_title`; `2` all rows `pricing_stage='final'`)

Decision: collapse to **`preprocess_status` on PO** with values aligned to the design's lifecycle: `not_started | standardized | cleaned | reviewing | finalized`. Frontend `completedStep` derivation goes away. `workflow_status` and `current_step` go away with `PreprocessingOrder`.

Same pattern for the other tracks: `receiving_status`, `processing_status`, `closeout_status`, `intake_dispute_status`, `processing_dispute_status`. Each owns its own lifecycle. Each freezes at its terminal value when the stage completes.

Cross-track gates live in code, not in any single field. Examples:
- "Can start Processing" = `preprocess_status='finalized' AND receiving_status='done'`
- "Can close" = `processing_status='done' AND` (dispute rule per Q15)

---

## 6. Undo / cascade pattern

Each preprocessing tab has an Undo action. Undo nulls its own column family AND all downstream families. PO timestamps null. PO `preprocess_status` reverts. Always requires explicit user confirmation.

| Undo from | Prep row columns nulled | PO fields nulled | preprocess_status revert | Other |
|---|---|---|---|---|
| Standardize | `standard_*`, `ai_*`, `final_*` (or DELETE rows entirely; Q11) | `standardized_at`, `ai_cleaned_at`, `review_saved_at`, `finalized_at`, `template_id`, `template_*_cache`, `standardization_formulas` | `not_started` | none |
| AI Cleanup | `ai_*`, `final_*` | `ai_cleaned_at`, `ai_cleanup_generation`, `review_saved_at`, `finalized_at` | `standardized` | none |
| Finalize | `final_*` | `finalized_at`, `review_saved_at` | `cleaned` | DELETE all `inventory_processingrow` for this PO |

---

## 7. Decisions captured

- **PO is the single source of truth for stage tracking.** Per-stage status columns. No `intake_stage` umbrella; the pipeline is a DAG, not linear.
- **Three sources of truth (workflow_status, current_step, derived completedStep) collapse to one** (`preprocess_status` on PO).
- **Receiving and Preprocessing are parallel tracks** after Order Create. Each owns its lifecycle. Processing waits on both.
- **Disputes can start during receiving** and run in parallel. Two kinds (intake-time, processing-time). Detailed design out of scope here.
- **Order Create / Edit / Upload Manifest** touches only `inventory_purchaseorder` and `core_s3file`. No preprocessing/manifest/item/product rows.
- **Template selection happens in Step 3, not at upload.** Strip template fields out of `manifest_preview` and `ensure_preprocessing_raw_rows` auto-match.
- **`manifest_signature` is set at upload.** Powers Step 3 template lookup. Needs new migration; not in 0045.
- **Preprocessing page reads only PO + csvtemplate on load.** Row reads are deferred to Tab 3.
- **One S3 parse is the goal.** [resolved Wave 4 — May 2026] Full-file read is confined to `ensure_preprocessing_raw_rows` / standardize; preview stays sample-only. Historical note: `manifest_rows` also parsed S3 before removal.
- **`inventory_preprocessingrow` keeps `raw_row` as a single unprefixed JSONB.** Load-bearing for search and formula re-eval. Three prefix families above it: `standard_*`, `ai_*`, `final_*`.
- **`standardization_formulas` is per-PO state, not a template cache.** Lives on PO directly.
- **Undo is column-NULL with cascade**, with user confirmation. Finalize undo additionally DELETEs processing rows.
- **Finalize is fast.** Bulk `INSERT ... SELECT` from prep to processing rows, no per-row vetting.

---

## 8. Open questions

1. When are `inventory_manifestrow` records created? At preprocessing finalize, or deferred to processing close?
2. Granularity of `inventory_processingrow`: item-level or manifest-row-level?
3. Coalesce order on finalize: `final_*` else `ai_*` else `standard_*`, OR each `processingrow` column points at exactly one source layer?
4. Deletion policy: exact value of "X days after intake close" for prep and processing row purge. Hard delete or soft?
5. Audit table scope: one general `audit` table sufficient, or dedicated tables per case?
6. Resolved as of v2: per-stage status modeling (see §5).
7. Receiving stage statuses, dates, and surface design (deferred to receiving page work).
8. Processing stage substates, dates, and timing of item/product materialization (deferred to processing rebuild).
9. Disputes table shape and FKs (out of scope here).
10. `manifest_preview` future: still used for sample previews on Step 3. Stays for now.
11. Undo Standardize row handling: NULL `standard_*`/`ai_*`/`final_*` and keep prep row, or DELETE prep row entirely?
12. Tab 3 PO scalar editing scope: just rollup timestamps, or actual PO fields (description, condition, costs)?
13. Tab 2 background job model: sync vs async; if async, polling location.
14. Dashboard "headline state" rule: bottleneck, most-advanced, or composite display?
15. Closeout gating: does closeout block on open disputes, or close with disputes outstanding?

---

## 9. Reality check vs current code

Findings from [`_recon/README.md`](./_recon/README.md) and shipped code. Where the design at write time diverged from **`v2.24.0`**.

**Findings reflect the state at design time. Wave 1 has shipped; some items below are now resolved. See §10 for wave-by-wave status.**

**Template-at-upload is happening.** [resolved in Wave 1] Code locations to tear out:
- `apps/inventory/views.py:2154` (header_signature lookup at upload)
- `apps/inventory/views.py:2186-2196` (embeds `template_id` / `template_name` / `template_mappings` in `manifest_preview`)
- `apps/inventory/views.py:2774-2780` (`process_manifest` re-writes those keys)
- `apps/inventory/views.py:189-198, 207-215` (`ensure_preprocessing_raw_rows` auto-matches template by `header_signature`)
- `frontend/src/pages/inventory/PreprocessingPage.tsx:193-202, 725` (reads `template_*` from `manifest_sample`)

**`manifest_signature` is not a PO column.** [resolved in Wave 1] Today: `manifest_preview['signature']` and `PreprocessingOrder.header_signature`. New migration needed.

**`PreprocessingOrder` is still the live home for stage state.** [resolved Wave 3 — May 2026] The model/table is removed. `PreprocessingRow` rows belong directly to `PurchaseOrder`; finalize gates and preprocess scalars use the PO (`preprocess_status`, `finalized_at`, per-stage timestamps).

**Prep row prefix is `standard_*`, not `stand_*`.** [doc already aligned in v2] Doc updated. Field set in code matches the three-family model already.

**`raw_row` is a JSONB column with real consumers.** [confirmed; no change planned] Manifest-row search (`row_matches_search`) and formula re-eval (`preview_manifest_formulas`) read it. Keep.

**Multiple full-file S3 parses today.** [resolved Wave 4 — May 2026] `parse_manifest_file` runs only from `ensure_preprocessing_raw_rows`. `preview_standardize` without `rows` uses `manifest_preview` only. The `GET …/manifest-rows/` endpoint was removed.

**`preprocessing_status` endpoint uses DB aggregates, not row materialization.** [confirmed; not a correctness issue] Earlier concern unfounded. Counts-on-PO denormalization is an optional optimization, not a correctness fix.

**Frontend reads `manifest_sample` (server-normalized), not raw `manifest_preview`.** [resolved in Wave 1 cleanup] Stripping template fields from `manifest_preview` storage cleanly cascades to the sample.

**`ProcessingDataBuild` is firmly active.** [deferred to Wave 7] Item Processor materialization, chunk polling, frontend pages all use it. "Likely drop" framing was wrong; deferred.

**Migration 0045 added** `manifest_filename`, `manifest_uploaded_at`, `manifest_row_count`, `manifest_category_count` on PO. `manifest_signature` not included. [confirmed; manifest_signature added in Wave 1 / migration 0046]

**`detail-surface` endpoint is live.** [confirmed; pre-Wave 1] `PurchaseOrderDetailSurfaceSerializer` excludes `manifest_preview`, nested `manifest_file`, `processing_stats`. Used by Order Detail page.

---

## 10. Rebuild waves (canonical roadmap)

Cross-cutting rebuild program: schema and writers first, readers and table drops next, then receiving, disputes, processing, and polish. Status values are for this file only—update them as waves land.

### Wave 1. Schema + write-side cutover

**Status:** done  
**Plan:** shipped **`v2.24.0`** — see initiative Session 15 + [`CHANGELOG [2.24.0]`](../../../CHANGELOG.md)  
**Scope:** New PO columns (`manifest_signature`, `manifest_headers`, `template_id` + caches, `standardization_formulas`, per-stage statuses, per-stage timestamps), `pallet_count` rename on PO, `received_pallet_count` rename on Receiving, `last_ai_import_at` copied to `ai_cleaned_at` then dropped, `manifest_sample` cleanup in `preprocessing_status` response, dual-writes to PO alongside `PreprocessingOrder` on every preprocess action, template-at-upload teardown.  
**Depends on:** nothing (foundation wave)  
**Unblocks:** Waves 2 and the timeline drawer detour

### Timeline drawer detour

**Status:** done (UI is functional but legacy data prevents full end-to-end testing until Wave 7)  
**Plan:** timeline drawer shipped in intake wave (initiative sessions)  
**Scope:** Side drawer for Order Detail showing all stages with rich meta and per-stage undo. Universal launcher pattern. Backend `intake_undo` service + `undo-preview` and `undo` endpoints.  
**Depends on:** Wave 1  
**Unblocks:** testable UI surface for all later waves; full verification waits for clean data from Wave 7

### Wave 2. Read-side cutover

**Status:** done  
**Plan file:** none yet  
**Scope:** Switch every reader off `PreprocessingOrder.workflow_status` and `current_step` onto `PurchaseOrder.preprocess_status` and per-stage timestamps. Includes `preprocessing_status` endpoint, `preprocessing_queue` ordering, frontend `completedStep` derivation removal. Writes stay dual.  
**Depends on:** Wave 1  
**Unblocks:** Wave 3

### Wave 3. Drop PreprocessingOrder

**Status:** done (May 2026; deployed in same release as migration `0047_drop_preprocessing_order`)  
**Plan file:** none yet  
**Scope:** PO-only staging (`PreprocessingRow.purchase_order`); remove synthetic `workflow_status` / `current_step` from API; delete dead serializers and `manifest-rows` client hooks.  
**Depends on:** Wave 2 and Wave 4  
**Unblocks:** Wave 5

### Wave 4. S3 parse reduction

**Status:** done (May 2026)  
**Plan file:** none yet  
**Scope:** Single full-file parse on standardize; sample-only `preview_standardize`; remove `manifest-rows` endpoint.  
**Depends on:** Wave 2  
**Unblocks:** Wave 3 (release bundle)

### Wave 5. Receiving track

**Status:** done (May 2026)  
**Plan file:** `waves-5-6-7-bundle` (Cursor plans)  
**Scope:** `receiving_status` / `receiving_started_at` / `receiving_done_at`; receiving completion without manifest→item side effects; timeline + Order Detail entry; stub/now-wired intake dispute on pallet rows.

### Wave 6. Disputes

**Status:** done (May 2026)  
**Plan file:** same bundle  
**Scope:** `inventory_dispute` model, rollups on PO, CRUD APIs, processing-dispute durable row + `dispute_id`, grouped backfill from `Item.dispute_type` when volume high.

### Wave 7. Processing rebuild

**Status:** done (May 2026; gates + PO train + legacy flag)  
**Plan file:** same bundle  
**Scope:** `processing_status` / timestamps, preprocessing+receiving gates on build/clear/chunk, `uses_legacy_processing` backfill, timeline processing card, undo blocked for legacy POs. `closeout_status` writes still deferred to Wave 8. Full `ItemSwapAudit` drop deferred.

### Wave 8. Cleanup, audit, and polish

**Status:** deferred  
**Plan file:** none yet  
**Scope:** Audit table (Q5). Purge sweep for transient rows (Q4). Dashboard headline state rule (Q14). Closeout gating (Q15). Pricing-field prefix cleanup on prep rows. Anything left.  
**Depends on:** Waves 1–7  
**Unblocks:** end of rebuild

---

## 11. Out of scope for this doc

- Code changes, migrations, frontend implementation
- The PO manifest meta + slim detail effort (separate plan, partially landed)
- Disputes design (table shape, FKs, UX)
- Receiving page design
- Processing rebuild (`ProcessingDataBuild` and friends)

---

## See also

| Doc | Role |
|---|---|
| `2026.05.08_intake_updates.md` | Canonical 10-step pipeline list (reference; the real graph is a DAG) |
| `order_dashboard_surfaces.md` | Order list/create/detail surfaces; `detail-surface` vs full `retrieve` |
| `.ai/reference/order_processing_pipeline_rebuild/intake_field_map.md` | Authoritative field-level spec; per-table, per-stage |
| [`_recon/README.md`](./_recon/README.md) | Operational recon + repair runbook (post-migrate). Source for §9 today. |
| [`.ai/initiatives/order_processing_pipeline_rebuild.md`](../../initiatives/order_processing_pipeline_rebuild.md) | Active plan + sessions (replaces `.ai/plans/`) |
| [`README.md`](./README.md) | Reference hub for this folder |