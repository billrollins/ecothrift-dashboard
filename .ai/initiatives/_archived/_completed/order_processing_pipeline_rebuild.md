<!-- Archived 2026-05-30: disposition=completed (inbound intake rebuild shipped v2.20.0–v2.24.2; polish deferred to future initiatives) -->
<!-- initiative: slug=order-processing-pipeline-rebuild status=completed updated=2026-05-30 -->
<!-- Last updated: 2026-05-30 (archived — Session 16 closeout) -->

# Initiative: Order / Processing pipeline rebuild

**Status:** Completed — archived. **Shipped:** **v2.20.0** (receiving + manifest upload) through **v2.24.2** (PO hot-path). Remaining polish (Final Review visual pass, inbound route placeholders, **`est_shrink`** UI write path) intentionally **out of scope** — track in new initiatives when ready.

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

- [x] **Step 1 — Schema + migration baseline:** migrations **0045–0051** shipped **`v2.24.0`**; prod migrated; `repair_intake_pipeline_pos --verify` OK after apply.
- [x] **Step 2 — Orders list/detail surfaces:** dashboard vendor `Q` fallback, timeline drawer, order detail PATCH retention — **`v2.24.0`**.
- [x] **Step 3 — Preprocessing transition hardening:** gates, undo, **`0047`** PO-linked **`PreprocessingRow`** — **`v2.24.0`**.
- [x] **Step 4 — Receiving transition hardening:** receiving timestamps/pallets + desktop fallback — **`v2.24.0`**.
- [x] **Step 5 — Processing handoff compatibility:** Item Processor + build-processing-data; **`v2.24.1`** decoupled Processing from Receiving gate.
- [x] **Step 6 — Disputes and rollups:** **`Dispute`** model/API + atomic **`processing_dispute`** — **`v2.24.0`**.
- [x] **Step 7 — Recon/repair/deploy runbook:** `_recon/README.md` exercised on prod rollout.
- [x] **Step 8 — Closeout docs/tests/commit message:** **`v2.24.0`** + **`v2.24.1`** released; steering cleanup in progress.

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
| Recon / deploy references | Supporting | `.ai/reference/order_processing_pipeline_rebuild/` (`_sql/`, `_recon/`, field map), `scripts/deploy/` |
| Final Review visual pass | **Deferred** (future initiative) | Mockup rebuild was tracked under retired **`fix_this.md`** (removed 2026-05 steering cleanup) |

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
| **Orders** | **Shipped** — dashboard, create PO, order detail workspace, **`POST …/upload-manifest/`**, [`CHANGELOG [2.20.0]`](../../../../CHANGELOG.md). |
| **Receiving** | **Shipped** — **`GET …/orders/for-receiving/`** tiered ED ordering; **`/inventory/receiving`** → next PO; **`OrderListPage`** receive truck; **`ReceivingOrderPage`** + desktop/mobile receiving UI. |
| **Preprocessing** | **Shipped (core)** — three-step **`PreprocessingPage`**: Standardize → Clean → **Final Review**; **`download-cleanup-csv`** / **`apply-cleanup-csv`** (wide Grok + narrow legacy); **`preprocessing-review`**; **`finalize-preprocessing`** (three-layer **`PreprocessingRow`** → **`final_*`** → rebuilt **`ManifestRow`**). **Iterative hardening** (UX polish, edge cases): [Preprocessing — target UX](#preprocessing--target-ux), **[`inventory-pipeline.md`](../../../extended/inventory-pipeline.md)** (cleanup CSV contract). Row validation (**`rule`** ids, **`rejected_rows`** / **`soft_warnings`**) lives in **`apps/inventory/cleanup_csv_validate.py`** (`validate_cleanup_row_values`). |
| **Processing** | Item Processor workspace shipped (**`/inventory/processing`**, **`/inventory/processing/:id`**); legacy **`/inventory/processing-legacy`**. **v2.21.1 hotfix:** **`build-processing-data`** bulk-creates minimal **`ManifestRow`** + **`Item`** rows from **`ProcessingRow`** bookmarks, skips Product/BatchGroup enrichment on the synchronous path, and removes duplicate-hint full-PO scans for large-order stability. **v2.21.0:** **`ProcessingRow`** queue rows, **`GET …/processing-workspace/`** pagination (**default 25**), **`GET …/processing-row-detail/`**, **`workspace_patch`** on mutations. **`POST …/processing-swap/`** removed from scope (**`inventory-pipeline.md`**). |
| **Disputes** | **Shipped** (model/API/services) — **`v2.24.0`**; dedicated inbound disputes **route** still placeholder. |
| **Finalization** | Roadmap placeholder. |

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

This initiative **replaces** the approach and shipped direction of **[Inventory intake pipeline (abandoned)](../_abandoned/inventory_intake_pipeline.md)** (`inventory_intake_pipeline`). That initiative tracked Order → Preprocess → Process hardening and a multi-step preprocessing redesign; **those pages and processes are being torn down** and rebuilt with a clearer scope.

**Supporting docs:** `2026.05.08_intake_updates.md`, `data_flow_plan.md`, `intake_field_map.md`, `order_dashboard_surfaces.md`, `_sql/`, and `_recon/`.

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

_Core path is **shipped** (stepper + CSV round-trip + final review + finalize). Remaining items are polish and deeper pricing workflows._ Step 2/3 details and handoff: `workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md`; validation contract: **[`inventory-pipeline.md`](../../../extended/inventory-pipeline.md)** (cleanup CSV contract).

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
  - **Wide Grok / Excel response:** `row_id`, `row_number`, `title`, `brand`, `model`, `category`, `condition`, `proposed_price`, `description`, `notes`, `specifications_json`, `search_tags_json`, plus optional **`ai_status`** (JSON object per row for validation/recovery metadata — see `workspace/ai-cleanup-grok/data/upload-pipeline-handoff.md` and **[`inventory-pipeline.md`](../../../extended/inventory-pipeline.md)** (cleanup CSV contract)).
  - **Legacy 7-column narrow:** `row_id`, `ai_title`, `ai_brand`, `ai_model`, `category`, `condition`, `proposed_price`.
- **Behavior:** server validates via `apps/inventory/cleanup_csv_validate.py` (**wide** staging import uses **`block_on_quality=False`**: most quality **`HARD_*`** rules surface in **`soft_warnings`** instead of **`400`**; invalid JSON in blob cells / bad **`ai_status`** still rejects), normalizes condition (`cleanup_condition.py`), then updates existing **PreprocessingRow** `ai_*`, **`ai_status`**, and **`proposed_price`**. Spoofed locked `identifiers` / `taxonomy` / `tracking` JSON in the CSV must not override standard buckets (copied from `standard_*` on write). **All-or-nothing** per upload when any row fails or counts mismatch. **`soft_warnings`** returned in API only (includes folded quality rules on wide apply).
- **Export vs apply:** **`GET …/download-cleanup-csv`** pre-AI snapshot; **`POST …/upload-cleanup-csv`** / **`POST …/apply-cleanup-csv`** apply AI output to staging rows.

---

### Step 3 — Final Review

- **UI:** Stepper label **Final Review**. Expand a staged row to see **standard | AI | coalesce preview** (locked buckets called out). Edits in the grid / save path write **`ai_*`**; **`final_*`** is populated inside **`POST …/finalize-preprocessing/`** via **`snapshot_finalize_from_ai_and_standard`**, then **`ManifestRow`** is replaced from **`final_*`**.
- Deeper bulk-pricing UX can still evolve; lifecycle split (**`preprocessing-review`** vs post-finalize **`manual-review`**) is documented in **`.ai/extended/inventory-pipeline.md`**.

---

## See also

- **Supersedes / archaeology:** [`.ai/initiatives/_archived/_abandoned/inventory_intake_pipeline.md`](../_abandoned/inventory_intake_pipeline.md)
- Deep reference: [`.ai/extended/inventory-pipeline.md`](../../../extended/inventory-pipeline.md)
- **Cleanup apply contract:** *(retired path `cleanup_csv_contract.md` — see **`inventory-pipeline.md`** and **`CHANGELOG`**)*
- [`.ai/initiatives/_index.md`](../../_index.md)
