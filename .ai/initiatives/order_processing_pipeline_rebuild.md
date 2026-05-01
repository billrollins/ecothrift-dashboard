<!-- initiative: slug=order-processing-pipeline-rebuild status=active updated=2026-05-01 -->
<!-- Last updated: 2026-05-01 (review.0.Bump: cleanup.ipynb + CHANGELOG [Unreleased] adjunct docs) -->

# Initiative: Order / Processing pipeline rebuild

**Status:** Active

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
| **Processing** | Item-level processing workspace (check-in, labels, batches). **`/inventory/processing`**. |
| **Finalization** | Placeholder route until scoped. **`/inventory/inbound/finalization`**. |
| **Disputes** | Placeholder route until scoped. **`/inventory/inbound/disputes`**. |

---

## Progress (rollup)

| Stage | Status |
|-------|--------|
| **Orders** | **Shipped** — dashboard, create PO, order detail workspace, **`POST …/upload-manifest/`**, [`CHANGELOG [2.20.0]`](../../CHANGELOG.md). |
| **Receiving** | **Shipped** — **`GET …/orders/for-receiving/`** tiered ED ordering; **`/inventory/receiving`** → next PO; **`OrderListPage`** receive truck; **`ReceivingOrderPage`** + desktop/mobile receiving UI. |
| **Preprocessing** | **Next** — see [Preprocessing — target UX](#preprocessing--target-ux) (stepper rename, Standardize/Clean/Final Review, template-only Step 1 until apply, CSV round-trip Step 2, placeholder Step 3). |
| **Processing** | In place; iterative hardening ongoing. **`/inventory/processing`** |
| **Finalization / Disputes** | Roadmap placeholders. |

---

## Navigation plan (`frontend/src/components/layout/Sidebar.tsx`)

Subgroup headers under collapsible **Inventory**:

| Subgroup | Sidebar entries | Route / notes |
|----------|------------------|---------------|
| **Inbound fulfillment** | Orders | `/inventory/orders` |
| | Preprocessing | `/inventory/preprocessing` (**`/inventory/preprocessing/:id`**); **`/inventory/preprocessing`** redirects via last-ID or empty state |
| | Receiving | `/inventory/receiving` → next eligible PO (`ReceivingEntryRedirect`); work at `/inventory/receiving/:id` |
| | Processing | `/inventory/processing` |
| | Finalization | `/inventory/inbound/finalization` — roadmap placeholder |
| | Disputes | `/inventory/inbound/disputes` — roadmap placeholder |
| **Items** | Search items | `/inventory/items` (detail `/inventory/items/:id`) |
| | Quick reprice | `/inventory/quick-reprice` |
| | Products | `/inventory/products` |
| **Vendors** | Vendors | `/inventory/vendors` |
| | Manifest templates | `/inventory/templates` — splash pointing at vendors |
| **Admin** | Categories | `/inventory/admin/categories` — roadmap placeholder |
| | Processing settings | `/inventory/processing` + **`#settings`** opens settings modal (`?settings=1` still honored) |
| | Legacy inventory pages | `/inventory/legacy` — hub; **`/inventory/legacy/orders`** — legacy manifest/preprocessing/processing entry points ( **`/inventory/admin/legacy`** redirects here ) |

**Label:** Sidebar and **PreprocessingPage** **`PageHeader`** title use **Preprocessing** — not ~~Manifest prep~~.

---

## Hidden / delete later

- Existing implementations stay mounted; primary nav no longer mixes a flat Vendor→…→Quick Reprice list.
- After new inbound screens ship end-to-end, delete placeholder roadmap pages, obsolete routes/components, and document in **`CHANGELOG`** + **`inventory-pipeline.md`**.

---

## Context

This initiative **replaces** the approach and shipped direction of **[Inventory intake pipeline (abandoned)](./_archived/_abandoned/inventory_intake_pipeline.md)** (`inventory_intake_pipeline`). That initiative tracked Order → Preprocess → Process hardening and a multi-step preprocessing redesign; **those pages and processes are being torn down** and rebuilt with a clearer scope.

**Supporting docs folder:** [`.ai/reference/order_processing_pipeline_rebuild/`](../reference/order_processing_pipeline_rebuild/README.md).

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

_Next implementation (tracked here; shipping is Session 6)._

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

### Step 2 — Clean

Lightweight interchange with external cleanup (offline Grok, Excel, etc.).

- **Download:** export standardized preprocessing rows as **CSV**.
  - Filename: **order number**, e.g. **`C5TC0-OM1-A8R3.csv`** (**no** `-cleaned` suffix).
- **Upload:** user uploads the cleaned file back.
  - **Convention:** **`{order number}-cleaned.csv`** expected.
  - **Behavior:** **update existing** preprocessing rows — populate **`ai_*`** prefixed columns (and any agreed cleanup fields)—**do not create new rows**; merge by stable row identifiers as defined when implemented.
- **Export vs apply:** **`GET …/download-cleanup-csv`** delivers a standardized **pre-AI** snapshot (standard row fields plus **`base_cost`** / **`ideal_price`**—no AI-only columns). **`upload-cleanup-csv`** / **`apply-cleanup-csv`** still merge cleanup outputs into **`ai_suggested_*`** (and related fields) on **`PreprocessingRow`** / **`ManifestRow`** by **`row_id`**—that narrow payload is separate from the download schema.

---

### Step 3 — Final Review

**Placeholder until spec’d.**

- Page title **Final Review**; body copy along the lines of **Coming soon**.
- Later: manual walk-through of each row — pricing adjustments and other corrections (full spec **next iteration**).

---

## Sessions

### Session 1

- **Goal:** Group Inventory sidebar under **Inbound fulfillment** + Items / Vendors / Admin; roadmap placeholders for receiving/finalization/disputes/categories; legacy hub; manifest templates splash; processing settings via `#settings`.
- **Finish line:** Shipped nav + routes + initiative table; old pages not deleted.
- **Scope:** `Sidebar.tsx`, `App.tsx`, small pages under `pages/inventory/*`, `ProcessingPage` hash/`?settings=1`, initiative file.
- **Start:** 2026-04-29

### Session 2

- **Goal:** Maintain an **offline** manifest row cleanup harness for liquidation CSVs aligned with preprocessing taxonomy (**before/after** few-shot parity with in-app preprocessing expectations).
- **Scope (local tooling):** `workspace/ai-cleanup-grok/` — **`clean-grok.mjs`**, **`run.bat`**, `.config`, **`in/`** / **`out/`** / **`batches/active/`**, **`prompts/`** (`system-prompt.txt`, `examples.json`, `amazon-examples.json`), **`helpers/`** (xAI/Grok API key path; **`build-amazon-examples.mjs`** curates diversified few-shot from manifest + cleaned join).
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

### Session 6 — Preprocessing (**next**)

- **Goal:** Implement [Preprocessing — target UX](#preprocessing--target-ux) above: stepper **Standardize / Clean / Final Review**, Step 1 semantics (**`manifest_preview` only** until apply), Step 2 CSV **`{order}-cleaned`** upload into **`ai_*`** columns, Step 3 placeholder.
- **Scope (initial):** `PreprocessingPage.tsx` + preprocessing-related API/views/models as needed; **`Sidebar.tsx`** entry already **Preprocessing**; **`MainLayout`/document title parity** — keep route **`/inventory/preprocessing`** unless we deliberately rename URLs.
- **Finish line:** Staff can describe the three-step story without contradicting persisted data rules above; changelog + extended docs when shipped.
- **Start:** when picked up (**TBD**)

### Session 7 — Startup + `ai-cleanup-grok` review

- **Goal:** Run **`code.0.Startup`**: load **`.ai/context.md`**, version (**`v2.20.0`**), **`CHANGELOG`** (`[Unreleased]` + **`[2.20.0]`**), **`.ai/initiatives/_index.md`** + **`ARCHIVE.md`**, terminals check; deliver a concise **code review** of **`workspace/ai-cleanup-grok/`** (offline Grok CSV cleanup harness).
- **Finish line:** Startup summary + review notes in session chat; this session block recorded.
- **Scope:** Read-only assessment of **`clean-grok.mjs`**, **`.config`**, **`helpers/build-amazon-examples.mjs`**, **`prompts/`**; no repo product code changes.
- **Out of scope:** Session 6 preprocessing implementation; committing **`workspace/`** (remains gitignored unless whitelisted).
- **Start:** 2026-04-30

### Session 8 — Startup + Preprocessing Step 2 (Clean) understanding

- **Goal:** Run **`code.0.Startup`** and map **initiative Step 2 — Clean** to the **current shipped** preprocessing UI/API.
- **Finish line:** Startup checklist + concise explanation of Step 2 flow (download → offline edit → upload → apply) and naming/label gaps vs target UX.
- **Scope:** Read-only: **`.ai/context.md`**, **`.version`**, **`CHANGELOG`** top, **`_index.md`**, initiative file, **`PreprocessingPage`**, **`CleanupStep`**, **`RowProcessingPanel`**, inventory views cleanup endpoints.
- **Start:** 2026-04-30

### Session 9 — `review.0.Bump` (cleanup notebook + unreleased docs)

- **Goal:** Run **`review.0.Bump`**: **[Unreleased]** **`CHANGELOG`** bullets for **`cleanup.ipynb`** + **`inventory-pipeline.md`** adjunct; local **`git commit`** (no semver bump).
- **Scope:** `CHANGELOG.md`, `.ai/extended/inventory-pipeline.md`, this initiative header; `workspace/notebooks/ai-cleanup/notebooks/cleanup.ipynb` (lean CSV / apply schema intro).
- **Finish line:** Steering matches shipped notebook narrative; `workspace/ai-cleanup-grok/` remains gitignored.
- **Start:** 2026-05-01

---

## See also

- **Supersedes / archaeology:** [`.ai/initiatives/_archived/_abandoned/inventory_intake_pipeline.md`](./_archived/_abandoned/inventory_intake_pipeline.md)
- Deep reference (may drift until updated): [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- [`.ai/initiatives/_index.md`](_index.md)
