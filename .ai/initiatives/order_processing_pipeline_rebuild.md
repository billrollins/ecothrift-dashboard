<!-- initiative: slug=order-processing-pipeline-rebuild status=active updated=2026-04-29 -->
<!-- Last updated: 2026-04-29 (Session 5 — receiving entry + for-receiving ordering; v2.20.0) -->

# Initiative: Order / Processing pipeline rebuild

**Status:** Active

---

## Umbrella product name — **Inbound fulfillment**

Staff-facing umbrella for PO → manifest → dock receive → processing → finalize → disputes → shelf. Nav uses plain language first; URLs may remain `inventory/*` until reroutes.

---

## Navigation plan (`frontend/src/components/layout/Sidebar.tsx`)

Subgroup headers under collapsible **Inventory**:

| Subgroup | Sidebar entries | Route / notes |
|----------|------------------|---------------|
| **Inbound fulfillment** | Orders | `/inventory/orders` |
| | Manifest prep | `/inventory/preprocessing` (legacy UI until replaced) |
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

1. **Rebuild** staff-facing **Order** and **Processing** flows (and manifest/preprocessing steps as defined in later sessions) so they are coherent, maintainable, and match operational reality.
2. **Remove or supersede** UI/API paths introduced under the abandoned initiative where they conflict with the new design—explicitly **not** layering fixes on top of the discarded approach.

---

## Acceptance

To be refined after discovery sessions. High level: one PO can flow **order → manifest/intake → processing** without dead ends, with errors surfaced and docs kept current.

---

## Out of scope

TBD per session. Buying auction manifests (`/buying/*`) remain a separate domain unless shared plumbing blocks this work.

---

## Backend follow-ups (tracked)

- **`est_shrink` on purchase orders:** Serializer currently keeps **`est_shrink`** read-only; **`PurchaseOrder.save`** applies default shrink from **`get_default_po_est_shrink()`**. Before staff can tune shrink from the **order detail** UI (not the create modal), add an explicit write path + validation on **`PurchaseOrderSerializer`** and ensure saves still trigger item cost recompute. Create modal intentionally omits **`est_shrink`** until then.

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
- **Scope:** `apps/inventory/views.py` (manifest upload / remove / staging expectations); **`OrderDetailPage.tsx`** Raw Manifest flow; **`PreprocessingPage.tsx`** small wiring; **`frontend/src/api/inventory.api.ts`**, **`frontend/src/types/inventory.types.ts`**; **`CHANGELOG.md`** **`[Unreleased]`** inventory manifest bullets expanded; `.ai/context.md`, `.ai/consultant_context.md`, `.ai/extended/{backend,frontend,inventory-pipeline}.md`; `.ai/protocols/review_bump.md`; `.ai/initiatives/_index.md`; additional initiative bookkeeping files per **`git show --stat 46e0996`**.
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

---

## See also

- **Supersedes / archaeology:** [`.ai/initiatives/_archived/_abandoned/inventory_intake_pipeline.md`](./_archived/_abandoned/inventory_intake_pipeline.md)
- Deep reference (may drift until updated): [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- [`.ai/initiatives/_index.md`](_index.md)
