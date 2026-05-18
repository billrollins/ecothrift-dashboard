<!-- initiative: slug=order-processing-pipeline-rebuild status=active updated=2026-05-18 -->
<!-- Last updated: 2026-05-18 (**Session 15**: review.0/1/9 — steering + deep-dive **`latest/`**) -->

# Initiative: Order / Processing pipeline rebuild

**Status:** Active

---

## Current Operating Scope

**Active slice:** stabilize the intake rebuild now on disk so the app can move through **Orders → Preprocessing → Receiving → Processing handoff → Disputes / repair** without schema drift, dead ends, or unclear ownership of writes.

**In scope for this wave:**

- Orders list/detail surfaces, manifest metadata, vendor dashboard filtering, and the intake timeline drawer.
- Purchase order schema/status fields from migrations **0045–0051**, including preprocessing, receiving, processing, dispute, manifest, and timestamp rollups.
- Preprocessing transition hardening: gates, undo/reset, final snapshots, and manifest rebuild expectations.
- Receiving transition hardening: status/timestamp rollups, pallet counts, and desktop receiving workspace behavior.
- Processing handoff compatibility: legacy queue/build paths and row/workspace assumptions touched by intake state.
- Disputes, intake repair, recon SQL, and deploy/runbook notes needed to safely migrate existing POs.

**Parked unless explicitly pulled forward:** finalization UI, new route/nav expansions beyond existing inbound paths, advanced pricing polish, broad legacy cleanup, and buying auction manifest behavior.

---

## Current Execution Steps

- [ ] **Step 1 — Schema + migration baseline:** migrations **0045–0051**, `schema.csv`, migrate/test DB behavior, and any required pre/post repair notes are coherent.
- [ ] **Step 2 — Orders list/detail surfaces:** `orders/`, `summary/`, manifest metadata, vendor fallback/dashboard filtering, and order timeline/detail UI behave after migrations.
- [ ] **Step 3 — Preprocessing transition hardening:** status gates, undo/reset, final snapshot backfills, and final review/preprocessing tests are aligned.
- [ ] **Step 4 — Receiving transition hardening:** receiving statuses, timestamps, pallet counts, and receiving workspace/API tests are aligned.
- [ ] **Step 5 — Processing handoff compatibility:** processing workspace/finalize code still handles rebuilt intake state and legacy queue compatibility.
- [ ] **Step 6 — Disputes and rollups:** dispute model/API/service behavior and PO rollups are covered by focused tests.
- [ ] **Step 7 — Recon/repair/deploy runbook:** premigrate/postmigrate recon, repair command/service, and deploy scripts explain the operational path.
- [ ] **Step 8 — Closeout docs/tests/commit message:** update steering docs/changelog as needed, run the targeted suite, and fill the deploy commit message.

**Work loop:** finish one step at a time. Each step ends with targeted tests or a noted blocker, any migration/deploy note captured, and a short Session 15 update before starting the next step.

---

## Scope Ledger

| Area | Status | Current file groups |
|------|--------|---------------------|
| Schema / migrations | In scope | `apps/inventory/models.py`, `apps/inventory/migrations/0045_*` through `0051_*`, `.ai/extended/sql/schema.csv` |
| Orders API / UI | In scope | `apps/inventory/views.py`, `apps/inventory/serializers.py`, `frontend/src/api/inventory.api.ts`, `frontend/src/pages/inventory/OrderDetailPage.tsx`, `frontend/src/types/inventory.types.ts`, `frontend/src/components/inventory/orderDetail/OrderIntakeTimelineDrawer.tsx` |
| Preprocessing transition | In scope | `apps/inventory/layer_helpers.py`, `apps/inventory/preprocessing_summary.py`, `apps/inventory/services/intake_gates.py`, `apps/inventory/services/intake_undo.py`, `apps/inventory/services/manifest_meta.py`, `apps/inventory/services/manifest_remove.py`, `frontend/src/pages/inventory/PreprocessingPage.tsx` |
| Receiving transition | In scope | `apps/inventory/services/receiving.py`, `frontend/src/components/inventory/receiving/ReceivingDesktopWorkspace.tsx`, `frontend/src/pages/inventory/ReceivingOrderPage.tsx` |
| Processing handoff | In scope | `apps/inventory/processing_ops.py`, `apps/inventory/services/processing_finalize.py`, `apps/inventory/services/processing_workspace.py`, `apps/inventory/management/commands/build_legacy_checkin_queue.py` |
| Disputes / repair | In scope | `apps/inventory/services/disputes.py`, `apps/inventory/services/intake_po_repair.py`, `apps/inventory/management/commands/repair_intake_pipeline_pos.py`, dispute/intake repair tests |
| Recon / deploy references | Supporting | `.ai/reference/order_processing_pipeline_rebuild/2026.05.08_intake_updates.md`, `data_flow_plan.md`, `intake_field_map.md`, `order_dashboard_surfaces.md`, `_sql/`, `_recon/`, `scripts/deploy/0_pull_prod_to_local.bat`, `scripts/deploy/commit_message.txt` |
| Scratch / one-off helpers | Parking lot | `_backfill_manifest_denorm.py` until it is either promoted to a command or removed |

---

## Umbrella product name — **Inbound fulfillment**

Staff-facing umbrella for **`Orders → Preprocessing → Receiving → Processing → Finalization → Disputes`**. Plain-language sidebar first; URLs may remain `inventory/*` until deliberate reroutes.

---

## Canonical pipeline sequence

**Orders → Preprocessing → Receiving → Processing → Finalization → Disputes**

| Stage | Meaning (high level) |
|-------|----------------------|
| **Orders** | PO list + detail — manifest upload (**Raw Manifest** CSV to S3), lifecycle, dashboards. |
| **Preprocessing** | Standardize vendor CSV into internal shape (templates, staged rows, external clean step, review). |
| **Receiving** | Dock receiving against the PO (pallets, shortages, discrepancy handling). **`/inventory/receiving`** / **`/inventory/receiving/:id`**. |
| **Processing** | Item-level workspace (manifest queue, check-in, labels, disputes). **`/inventory/processing`** → **`/inventory/processing/:id`**; legacy batch grid **`/inventory/processing-legacy`**. |
| **Finalization** | Placeholder route until scoped. **`/inventory/inbound/finalization`**. |
| **Disputes** | Placeholder route until scoped. **`/inventory/inbound/disputes`**. |

---

## Progress (rollup)

| Stage | Status |
|-------|--------|
| **Orders** | **Shipped** — dashboard, create PO, order detail workspace, **`POST …/upload-manifest/`**, [`CHANGELOG [2.20.0]`](../../CHANGELOG.md). |
| **Receiving** | **Shipped** — **`GET …/orders/for-receiving/`** tiered ED ordering; **`/inventory/receiving`** → next PO; **`OrderListPage`** receive truck; **`ReceivingOrderPage`** + desktop/mobile receiving UI. |
| **Preprocessing** | **Shipped (core)** — three-step **`PreprocessingPage`**: Standardize → Clean → **Final Review**; **`download-cleanup-csv`** / **`apply-cleanup-csv`** (wide Grok + narrow legacy); **`preprocessing-review`**; **`finalize-preprocessing`** (three-layer **`PreprocessingRow`** → **`final_*`** → rebuilt **`ManifestRow`**). **Iterative hardening** (UX polish, edge cases): [Preprocessing — target UX](#preprocessing--target-ux), **[`cleanup_csv_contract.md`](../reference/cleanup_csv_contract.md)**. Row validation (**`rule`** ids, **`rejected_rows`** / **`soft_warnings`**) lives in **`apps/inventory/cleanup_csv_validate.py`** (`validate_cleanup_row_values`). |
| **Processing** | Item Processor workspace shipped (**`/inventory/processing`**, **`/inventory/processing/:id`**); legacy **`/inventory/processing-legacy`**. **v2.21.1 hotfix:** **`build-processing-data`** bulk-creates minimal **`ManifestRow`** + **`Item`** rows from **`ProcessingRow`** bookmarks, skips Product/BatchGroup enrichment on the synchronous path, and removes duplicate-hint full-PO scans for large-order stability. **v2.21.0:** **`ProcessingRow`** queue rows, **`GET …/processing-workspace/`** pagination (**default 25**), **`GET …/processing-row-detail/`**, **`workspace_patch`** on mutations. **`POST …/processing-swap/`** removed from scope (**`inventory-pipeline.md`**). |
| **Finalization / Disputes** | Roadmap placeholders. |

---

## Navigation plan (`frontend/src/components/layout/Sidebar.tsx`)

Subgroup headers under collapsible **Inventory**:

| Subgroup | Sidebar entries | Route / notes |
|----------|------------------|---------------|
| **Inbound fulfillment** | Orders | `/inventory/orders` |
| | Preprocessing | `/inventory/preprocessing` (**`/inventory/preprocessing/:id`**); **`/inventory/preprocessing`** redirects via last-ID or empty state |
| | Receiving | `/inventory/receiving` → next eligible PO (`ReceivingEntryRedirect`); work at `/inventory/receiving/:id` |
| | Processing | **`/inventory/processing`** → **`ProcessingEntryRedirect`**; work at **`/inventory/processing/:id`** (**Item Processor**). Legacy grid: **`/inventory/processing-legacy`** |
| | Finalization | `/inventory/inbound/finalization` — roadmap placeholder |
| | Disputes | `/inventory/inbound/disputes` — roadmap placeholder |
| **Items** | Search items | `/inventory/items` (detail `/inventory/items/:id`) |
| | Quick reprice | `/inventory/quick-reprice` |
| | Products | `/inventory/products` |
| **Vendors** | Vendors | `/inventory/vendors` |
| | Manifest templates | `/inventory/templates` — splash pointing at vendors |
| **Admin** | Categories | `/inventory/admin/categories` — roadmap placeholder |
| | Processing settings | **`/inventory/processing-legacy`** + **`#settings`** / **`?settings=1`** opens settings modal (`ProcessingSettingsModal`) |
| | Legacy inventory pages | `/inventory/legacy` — hub; **`/inventory/legacy/orders`** — legacy manifest/preprocessing/processing entry points ( **`/inventory/admin/legacy`** redirects here ) |

**Label:** Sidebar and **PreprocessingPage** **`PageHeader`** title use **Preprocessing** — not ~~Manifest prep~~.

---

## Hidden / delete later

- Existing implementations stay mounted; primary nav no longer mixes a flat Vendor→…→Quick Reprice list.
- After new inbound screens ship end-to-end, delete placeholder roadmap pages, obsolete routes/components, and document in **`CHANGELOG`** + **`inventory-pipeline.md`**.

---

## Context

This initiative **replaces** the approach and shipped direction of **[Inventory intake pipeline (abandoned)](./_archived/_abandoned/inventory_intake_pipeline.md)** (`inventory_intake_pipeline`). That initiative tracked Order → Preprocess → Process hardening and a multi-step preprocessing redesign; **those pages and processes are being torn down** and rebuilt with a clearer scope.

**Supporting docs:** [`2026.05.08_intake_updates.md`](../reference/order_processing_pipeline_rebuild/2026.05.08_intake_updates.md), [`data_flow_plan.md`](../reference/order_processing_pipeline_rebuild/data_flow_plan.md), [`intake_field_map.md`](../reference/order_processing_pipeline_rebuild/intake_field_map.md), [`order_dashboard_surfaces.md`](../reference/order_processing_pipeline_rebuild/order_dashboard_surfaces.md), [`_sql/`](../reference/order_processing_pipeline_rebuild/_sql/README.md), and [`_recon/`](../reference/order_processing_pipeline_rebuild/_recon/README.md).

---

## Objectives (brief)

1. **Rebuild** staff-facing flows so **Orders → … → Disputes** is coherent—especially **Preprocessing**, **Receiving**, **Processing**.
2. **Remove or supersede** UI/API paths introduced under the abandoned initiative where they conflict with the new design—explicitly **not** layering fixes on top of the discarded approach.

---

## Acceptance

High level: one PO can traverse **Orders → Preprocessing → Receiving → Processing** without dead ends; errors surfaced; **`CHANGELOG`** and extended docs kept current.

---

## Out of scope

TBD per session. Buying auction manifests (`/buying/*`) remain a separate domain unless shared plumbing blocks this work.

---

## Backend follow-ups (tracked)

- **`est_shrink` on purchase orders:** Serializer currently keeps **`est_shrink`** read-only; **`PurchaseOrder.save`** applies default shrink from **`get_default_po_est_shrink()`**. Before staff can tune shrink from the **order detail** UI (not the create modal), add an explicit write path + validation on **`PurchaseOrderSerializer`** and ensure saves still trigger item cost recompute. Create modal intentionally omits **`est_shrink`** until then.

---

## Preprocessing — target UX

_Core path is **shipped** (stepper + CSV round-trip + final review + finalize). Remaining items are polish and deeper pricing workflows._ Step 2/3 details and handoff: [`workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md`](../../workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md); validation contract: **[`cleanup_csv_contract.md`](../reference/cleanup_csv_contract.md)**.

**Route:** keep **`/inventory/preprocessing`** and **`/inventory/preprocessing/:id`** unless we decide a clearer path later (either is fine).

**Global chrome**

- **Stepper across the top** (visual): **1. Standardize** → **2. Clean** → **3. Final Review**
  - Highlight the **active** step.
  - **Grey out** steps not yet reachable (future steps).
  - **Checkmark** completed steps.

---

### Step 1 — Standardize

Template matching / creation. This is **not** the old “instant write to DB” story until **Apply**.

- **On load:** try to match the order’s manifest to an existing vendor/signature **template**.
- **If no match:** user creates a template manually or with AI assistance.
- **Preview data source:** **only** the order model’s **`manifest_preview`** (**manifest sample JSON**). **Do not** read or mutate the canonical CSV object on AWS/S3 **during editing**—only **`manifest_preview`** drives the UI.
- **Session-only transforms:** all field mappings and transform definitions run on **session / draft state**. **Nothing persists** until the user explicitly **Save / Apply**.
- **Preview timing:** preview updates **on user interaction** only (formula change, toggle, blur, explicit refresh)—**not** polling, not background auto-refresh.
- **On Save / Apply (commit):**
  - If linking an **existing** template: persist **template ID** on the preprocessing order row (or equivalent association).
  - If **new** template: **create** template row **first**, **then** link it.
  - **Then:** load CSV from AWS, apply the template pipeline, generate **standardized preprocessing rows** (`process-manifest`/successor semantics).
- **After apply:** Step 1 is **locked** visually—read-only / finalized; treated as complete.
- **Undo / change template (full reset):** delete **all** preprocessing staged rows for this PO, clear preprocessing state **as if new**. Confirmation modal:  
  **“This will delete all preprocessing data and start over. Are you sure?”**

---

### Step 2 — Clean (AI Cleanup)

Lightweight interchange with external cleanup (offline Grok, Excel, etc.).

- **Download:** export standardized preprocessing rows (**16-column** standard CSV: economics + vendor text + `*_json` buckets) from the preprocessing UI. Filename defaults to **`{order_number}.csv`** (sanitized).
- **Upload:** user uploads the cleaned file (any filename). **Supported wire formats:**
  - **Wide Grok / Excel response:** `row_id`, `row_number`, `title`, `brand`, `model`, `category`, `condition`, `proposed_price`, `description`, `notes`, `specifications_json`, `search_tags_json`, plus optional **`ai_status`** (JSON object per row for validation/recovery metadata — see `workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md` and **[`cleanup_csv_contract.md`](../reference/cleanup_csv_contract.md)**).
  - **Legacy 7-column narrow:** `row_id`, `ai_title`, `ai_brand`, `ai_model`, `category`, `condition`, `proposed_price`.
- **Behavior:** server validates via `apps/inventory/cleanup_csv_validate.py` (**wide** staging import uses **`block_on_quality=False`**: most quality **`HARD_*`** rules surface in **`soft_warnings`** instead of **`400`**; invalid JSON in blob cells / bad **`ai_status`** still rejects), normalizes condition (`cleanup_condition.py`), then updates existing **PreprocessingRow** `ai_*`, **`ai_status`**, and **`proposed_price`**. Spoofed locked `identifiers` / `taxonomy` / `tracking` JSON in the CSV must not override standard buckets (copied from `standard_*` on write). **All-or-nothing** per upload when any row fails or counts mismatch. **`soft_warnings`** returned in API only (includes folded quality rules on wide apply).
- **Export vs apply:** **`GET …/download-cleanup-csv`** pre-AI snapshot; **`POST …/upload-cleanup-csv`** / **`POST …/apply-cleanup-csv`** apply AI output to staging rows.

---

### Step 3 — Final Review

- **UI:** Stepper label **Final Review**. Expand a staged row to see **standard | AI | coalesce preview** (locked buckets called out). Edits in the grid / save path write **`ai_*`**; **`final_*`** is populated inside **`POST …/finalize-preprocessing/`** via **`snapshot_finalize_from_ai_and_standard`**, then **`ManifestRow`** is replaced from **`final_*`**.
- Deeper bulk-pricing UX can still evolve; lifecycle split (**`preprocessing-review`** vs post-finalize **`manual-review`**) is documented in **`.ai/extended/inventory-pipeline.md`**.

---

## Sessions

### Session 1

- **Goal:** Group Inventory sidebar under **Inbound fulfillment** + Items / Vendors / Admin; roadmap placeholders for receiving/finalization/disputes/categories; legacy hub; manifest templates splash; processing settings via `#settings`.
- **Finish line:** Shipped nav + routes + initiative table; old pages not deleted.
- **Scope:** `Sidebar.tsx`, `App.tsx`, small pages under `pages/inventory/*`, `ProcessingPage` hash/`?settings=1`, initiative file.
- **Start:** 2026-04-29

### Session 2

- **Goal:** Maintain an **offline** manifest row cleanup harness for liquidation CSVs aligned with preprocessing taxonomy (**before/after** few-shot parity with in-app preprocessing expectations).
- **Scope (local tooling):** `workspace/ai-cleanup-grok/` — **`helpers/clean-grok.mjs`**, **`run.bat`**, `.config`, **`data/in/`** / **`data/out/`** / **`data/on deck/`** (optional staging) / **`data/batches/active/`**, **`prompts/`** (`system-prompt.txt`, `examples.json`, `amazon-examples.json`), **`helpers/`** ( **`build-amazon-examples.mjs`**, Grok API key file path in `.config`).
- **Repo note:** `workspace/*` is **gitignored** (see repo root `.gitignore`); this tree is **not in git commit history**. To track in-repo later, whitelist a path such as **`!workspace/ai-cleanup-grok/`** intentionally.
- **Start:** 2026-04-29

### Session 3 — PO Raw Manifest CSV (git: `46e0996`)

- **Evidence:** local commit **`46e0996`** — **`feat(inventory): PO manifest upload + review_bump steering`** (`git show --stat`).
- **Scope:** `apps/inventory/views.py` (manifest upload / remove / staging expectations); **`OrderDetailPage.tsx`** Raw Manifest flow; **`PreprocessingPage.tsx`** small wiring; **`frontend/src/api/inventory.api.ts`**, **`frontend/src/types/inventory.types.ts`**; **`CHANGELOG.md`** **`[Unreleased]`** inventory manifest bullets expanded; `.ai/context.md`, `.ai/consultant_context.md`, `.ai/extended/{backend,frontend,inventory-pipeline}.md`; `.ai/protocols/review.0.Bump.md`; `.ai/initiatives/_index.md`; additional initiative bookkeeping files per **`git show --stat 46e0996`**.
- **Finish line (for this slice):** doc + changelog alignment with unreleased backend/FE prep; semver bump deferred per protocol until explicit release (`session_close`).

### Session 4 — Inbound receiving + preprocessing primitives (working tree only)

- **Evidence:** working tree snapshot (uncommitted / untracked vs **`HEAD`** at stewardship); not necessarily present on **`origin/main`**. Modified **`frontend/src/App.tsx`**, **`frontend/src/components/layout/Sidebar.tsx`**, **`apps/inventory/models.py`**, **`serializers.py`**, **`views.py`**; untracked **`frontend/src/components/inventory/receiving/`**, migrations **`0024_preprocessing_staging.py`**, **`0025_po_vendor_cache_search.py`**, **`0026_receiving_models.py`** (introduces **`Receiving`**), **`0027_purchase_order_order_pallet_count.py`**, plus tests **`test_receiving_api.py`**, **`test_preprocessing_redesign.py`**, **`test_po_dashboard.py`**, **`test_purchase_order_pallet_count.py`**. **Receiving** dirs/files visible in **`git status`** as **`??`** at capture time.
- **Finish line:** TBD once committed and reviewed — do not treat API/UI guarantees as shipped until merged.
- **Start:** 2026-04-29

### Session 5 — Receiving entry + `for-receiving` ordering (`v2.20.0`)

- **Evidence:** **`review_bump`** aligns **`.version`**, **`CHANGELOG [2.20.0]`**, steering docs (**2026-04-29**).
- **Goal:** Tiered **`GET /api/inventory/orders/for-receiving/`** queryset; **`/inventory/receiving`** resolves to the first PO in that list; **Orders** table **Receive** truck when status is eligible; back from receiving to **`/inventory/orders`** (no separate receiving list page).
- **Scope:** `apps/inventory/views.py` (for-receiving ordering + tests); `ReceivingEntryRedirect.tsx`; `App.tsx`; `OrderListPage.tsx`; `ReceivingOrderPage.tsx`; removed `ReceivingListPage.tsx`.
- **Finish line:** Sidebar **Receiving** and orders **Receive** both land staff on dock receive for the right PO by **expected_delivery** priority.
- **Start:** 2026-04-29

### Session 6 — Preprocessing (**core shipped 2026-05**)

- **Goal (met):** [Preprocessing — target UX](#preprocessing--target-ux): stepper **Standardize / Clean / Final Review**, Step 1 **`manifest_preview` until apply**, Step 2 **wide Grok CSV (+ optional `ai_status`) + legacy narrow** cleanup apply with server validation, Step 3 **Final Review** + **`finalize-preprocessing`** coalesce to **`ManifestRow`**.
- **Scope (shipped):** `PreprocessingPage.tsx` + preprocessing API/views/models (**`apps/inventory/views.py`**, **`cleanup_csv_validate.py`**, **`layer_helpers.py`**, three-layer **`PreprocessingRow`**), **`Sidebar`** **Preprocessing** entry, route **`/inventory/preprocessing`**. See **`test_preprocessing_redesign.py`**.
- **Finish line:** Staff can run export → offline clean → apply → final review → finalize; canonical manifest reflects **`final_*`**.
- **Remaining:** Step 3 **mockup** Final Review UI (**[`fix_this.md`](../reference/fix_this.md)**); UX polish, optional advanced pricing; keep **`CHANGELOG`** + extended docs in sync.
- **Start:** 2026-04-29; **core complete:** 2026-05-01

### Session 7 — Startup + `ai-cleanup-grok` review

- **Goal:** Run **`code.0.Startup`**: load **`.ai/context.md`**, version (**`v2.20.0`**), **`CHANGELOG`** (`[Unreleased]` + **`[2.20.0]`**), **`.ai/initiatives/_index.md`** + **`ARCHIVE.md`**, terminals check; deliver a concise **code review** of **`workspace/ai-cleanup-grok/`** (offline Grok CSV cleanup harness).
- **Finish line:** Startup summary + review notes in session chat; this session block recorded.
- **Scope:** Read-only assessment of **`helpers/clean-grok.mjs`**, **`.config`**, **`helpers/build-amazon-examples.mjs`**, **`prompts/`**; no repo product code changes.
- **Out of scope:** Core Session 6 preprocessing implementation (**shipped 2026-05**); committing **`workspace/`** (remains gitignored unless whitelisted).
- **Start:** 2026-04-30

### Session 8 — Startup + Preprocessing Step 2 (Clean) understanding

- **Goal:** Run **`code.0.Startup`** and map **initiative Step 2 — Clean** to the **current shipped** preprocessing UI/API.
- **Finish line:** Startup checklist + concise explanation of Step 2 flow (download → offline edit → upload → apply) and naming/label gaps vs target UX.
- **Scope:** Read-only: **`.ai/context.md`**, **`.version`**, **`CHANGELOG`** top, **`_index.md`**, initiative file, **`PreprocessingPage`**, **`CleanupStep`**, **`RowProcessingPanel`**, inventory views cleanup endpoints.
- **Start:** 2026-04-30

### Session 9 — `review.0.Bump` (cleanup docs + unreleased steering)

- **Goal:** Align **[Unreleased]** **`CHANGELOG`** + **`inventory-pipeline.md`** with the adjunct **Grok** path and three-layer staging; local **`git commit`** (no semver bump).
- **Scope:** `CHANGELOG.md`, `.ai/extended/inventory-pipeline.md`, this initiative header; **`workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md`** (workspace; gitignored unless whitelisted); committed **`workspace/notebooks/ai-cleanup/`** tree **removed** — notebook narrative lives in handoff + **[`cleanup_csv_contract.md`](../reference/cleanup_csv_contract.md)** instead.
- **Finish line:** No steering references to missing notebook paths unless marked historical.
- **Start:** 2026-05-01

### Session 10 — Final Review **`ai_status`** + second **`review.0.Bump`**

- **Goal:** Surface **`ai_status`** on Final Review; keep client/server in sync when staff edits clear it; refresh **`CHANGELOG [Unreleased]`**, **`context.md`** / **`consultant_context.md`**, **`extended/*`**, initiative Sessions; local **`git commit`** (no **`.version`** bump).
- **Scope:** `PreprocessingReviewTable.tsx`, `PreprocessingPage.tsx` (`mergeReviewPatches`), `RowProcessingPanel.tsx`, `cleanupCsv.ts`, `apps/inventory/views.py` (`_normalize_cleanup_ai_status_value`, `update_preprocessing_review_rows`), `test_preprocessing_redesign.py`.
- **Finish line:** Steering + **[Unreleased]** describe 13-col CSV, **`soft_warnings`**, Final Review chips, and clear-on-edit semantics.
- **Start:** 2026-05-01

### Session 12 — `review.0.Bump` (Item Processor pricing audit + `manual-review` Retail)

- **Goal:** Staff can **see** manifest-line economics (**`GET …/manual-review/`**) during Item Processor without editing; **Retail** column matches API **`unit_retail`**; active card shows manifest MSRP vs shelf when investigating bad prices.
- **Scope:** `ProcessingWorkspacePage.tsx` (accordion + **`useManualReview`**), `ManualReviewPanel.tsx` (`readOnly`, **`displayRetail`**), `ProcessingActiveCard.tsx`, `inventory.types.ts` **`ManifestRow.unit_retail`**; **`CHANGELOG [Unreleased]`**; `.ai/context.md`, `.ai/consultant_context.md`, `.ai/extended/{frontend,inventory-pipeline}.md`; this session block.
- **Finish line:** Steering + **[Unreleased]** describe read-only audit + column fix; **no** `.version` bump (`review.0.Bump` Part **2A**).
- **Start:** 2026-05-02

### Session 13 — Item Processor Phase 3 row-first + **`review.0.Bump`** (`v2.22.0`)

- **Evidence:** **`CHANGELOG [2.22.0]`**, **`.version`**, migration **`inventory/0042_processing_data_build`**.
- **Goal:** Selection identity (**`processing_row_id`**) matches mutation payloads — dispute, merge, bulk disposition, print-multiple accept **`processing_row_ids`** / **`processing_row_id`**; bookmark-only rows yield **`processing_data_required`**; merge denorm refresh scoped.
- **Scope:** **`apps/inventory/processing_ops.py`**, **`views.py`**, **`processing_workspace.py`**, **`processing_finalize.py`**, **`models.py`**; **`frontend`** processing modals/page/hooks/**`inventory.api.ts`**; **`test_processing_validation_matrix`**, **`test_preprocessing_redesign`**; **`.gitignore`** **`.0.learning/`** (safe **`git add .`** before deploy bats); steering **`context.md`** / **`consultant_context.md`** / **`extended/{inventory-pipeline,frontend}.md`**.
- **Finish line:** Operators can **`5_deploy_yolo.bat`** without staging stray learning dirs; **`commit_message.txt`** holds full deploy message (**line 1** not **`---`**).
- **Start:** 2026-05-02

### Session 14 — Intake pipeline data flow (2026-05-08)

- **Goal:** Clarify **how data is created and mutated** across the full intake path (order → preprocess → receiving → processing → disputes) so writes can be cleaned up and SSOT is obvious per stage.
- **Finish line:** Working notes + per-step object/entry-point map in [`.ai/reference/order_processing_pipeline_rebuild/2026.05.08_intake_updates.md`](../reference/order_processing_pipeline_rebuild/2026.05.08_intake_updates.md); agreed follow-on code scoped to specific pipeline steps.
- **Scope:** Data-flow documentation and targeted refactors only as needed after mapping; pipeline steps: Create/Edit Order → Standardize Manifest → AI Cleanup → Final Manual Review → Receiving (photos) → Build Data → Check-in/labels → Close PO → Disputes.
- **Est:** TBD · **Start:** 2026-05-08
- **Result:** Discovery produced the intake reference docs/recon scaffolding and revealed that the active work is larger than documentation-only mapping. Implementation is now split into the Session 15 stabilization steps above.

#### Session updates

- Bearing: MESSY — ~40% — next: Reconcile Session 14 scope vs working tree (intake migrations 0045–51 + API/FE); update session entry or add Session 15 before committing — 2026-05-09

### Session 15 — Intake rebuild stabilization wave

- **Goal:** Stabilize the intake rebuild currently on disk by working through the **Current Execution Steps** in order.
- **Finish line:** Local/test can run orders list/detail, preprocessing, receiving, processing handoff, disputes, and repair paths after migrations; targeted tests and deploy notes are aligned; `scripts/deploy/commit_message.txt` is ready for the eventual commit/deploy.
- **Scope:** The **Current Operating Scope** and **Scope Ledger** above. Do not pull parked finalization UI, broad nav expansion, advanced pricing polish, buying auction behavior, or broad legacy cleanup into this session without an explicit scope update.
- **Start:** 2026-05-18

#### Session updates

- Scope cleanup: Session 14 closed as discovery; Session 15 owns the ordered stabilization wave. Next: Step 1 — schema + migration baseline.
- Review: **`review.0.Bump`** + **`review.1.Diff`** + **`review.9.Deep`** — **`CHANGELOG [Unreleased]`** intake bullets + steering sync (**`context`**, **`consultant_context`**, **`extended/inventory-pipeline`**) + persisted diff **`20260518-092215.diff.md`** + refreshed **`.ai/reference/deep_dive/latest/`** (prior run under **`_runs/20260518T092130/previous_latest/`**) — semver bump deferred Part 2A — 2026-05-18
- Stabilization pass (Business-hours readiness): **`0045`** rollout PO map corrected; **`processing_dispute`** all-in-one **`transaction.atomic()`**; **`OrderDetailPage`** PATCH queue retention + **`ReceivingOrderPage`** desktop missing-PO fallback; targeted pytest (8 modules) **`121`** OK; **`repair_intake_pipeline_pos --verify`** OK; **`npm run build`**. **`0050`** still full-scan on migrate — rehearsal deploy/window timing on prod-sized copy remains a release gate — 2026-05-18

---

## See also

- **Supersedes / archaeology:** [`.ai/initiatives/_archived/_abandoned/inventory_intake_pipeline.md`](./_archived/_abandoned/inventory_intake_pipeline.md)
- Deep reference: [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- **Cleanup apply contract:** [`.ai/reference/cleanup_csv_contract.md`](../reference/cleanup_csv_contract.md)
- [`.ai/initiatives/_index.md`](_index.md)
