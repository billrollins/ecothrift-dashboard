<!-- Archived 2026-06-13: disposition=completed (P1–P9 shipped; superseded by product_item_crud_and_processing) -->
<!-- initiative: slug=intake-processing-improvements status=completed updated=2026-06-13 -->
<!-- Last updated: 2026-06-13 (closed — direction change; remaining work → product_item_crud_and_processing) -->

# Initiative: Intake → Processing improvements

**Status:** **Completed / superseded** — P1–P9 shipped (Sessions 3–11). Initiative closed 2026-06-13; owner direction reset. **Continued in:** [`product_item_crud_and_processing`](./product_item_crud_and_processing.md).


> **Landmark design:** `.ai/reference/product_identity/product_identity_design.md` — the binding target design for product matching/creation across intake (three rules, confidence ladder, field precedence, collapse/split, schema delta). This initiative tracks **phases and sessions** toward that design; when this file and the design doc disagree, the design doc wins (or update both deliberately).

Follow-on to the shipped inbound rebuild ([`order_processing_pipeline_rebuild`](./order_processing_pipeline_rebuild.md) **v2.20.0**–**v2.24.2**). The **Orders → Preprocessing → Receiving → Processing** pipeline is live; this initiative realigns the model and UX around a stable **ManifestRow → PreprocessingRow → ProcessingRow → Product/Item** flow, then tightens **Item Processor** (`/inventory/processing/:id`) and fixes intake→processing errors blocking daily use.

**Primary surface:** `ProcessingWorkspacePage` and related components under `frontend/src/pages/inventory/processing/`; backend **`apps/inventory/services/processing_workspace.py`**, **`processing_search_string.py`**, processing row/item APIs as needed.

**Out of scope (unless pulled forward):** Final Review visual polish, new inbound route placeholders, buying/B-Stock, broad legacy `/inventory/processing-legacy` revival.

---

## Current state (grounding)

| Area | Today | Gap |
|------|-------|-----|
| **Add item** | Standalone Add Item is Product-first; workspace **Add unmanifested item** creates PO-scoped Product+Item with `manifest_row_id` null and surfaces them in `unmanifested_items`. | Catch-all order policy still deferred; bulk migration of old orders not run yet. |
| **Processing data pipeline** | New-flow orders check in from linked `ProcessingRow`s; **Create Processing Data** shows only when `requires_legacy_build` (no manifest-linked rows). `intake_migration` flags expose cohort hints. | Old/in-flight orders have not been bulk repaired; compatibility build path still exists for bookmark-only cohorts. |
| **Search** | `search_string` augmented with Product number/UPC and checked-in Item SKUs; scanner Enter opens on exact UPC or SKU match. | Further shortcut tuning as staff patterns emerge. |
| **Edit fields** | Row defaults patch (`processing-row-patch`), Product edit (V-19), Item patch after check-in; row detail qty summary + unit table. | ManifestRow bookmark field edits from workspace still route through row defaults / manual review, not a separate manifest editor. |
| **Reports / safety** | Workspace `rollups` (expected/dispositioned/remaining/overage/sold/unmanifested); classifier command for migration cohorts. | Legacy SQL/report audit and automated repair passes remain before deleting compatibility paths. |

Detail: [`.ai/extended/inventory-pipeline.md`](../../../extended/inventory-pipeline.md) — Item Processor workspace section.

---

## North-star intake model

> **2026-06-09:** extended and superseded in detail by the landmark design doc (`product_identity/product_identity_design.md`). Key deltas vs the tables below: match candidates + decided match move to **staging** (`PreprocessingRow.match_candidates` / `final_matched_product`), `ManifestRow` match fields are **deprecated** (stop writes, audit readers), and product-vs-row reads follow the precedence rule (*product wins identity, row wins transaction*). The tables below remain valid grounding for everything else.

Design intent from owner discussion **2026-06-06**: preserve the vendor/order evidence, keep preprocessing separate from processing, and create permanent inventory only when physical goods are checked in.

| Table | Created | Purpose | Lifetime |
|-------|---------|---------|----------|
| `PurchaseOrder` | Add order | Order-level costs, status, raw manifest file, receiving/processing rollups. Every purchased item should map to an order; unknown/manual sources should use explicit catch-all orders later. | Permanent |
| Raw manifest CSV | Upload manifest | Original vendor file. Best evidence when needed. | Archived on order |
| `ManifestRow` | Standardize manifest | Stable line spine: order id, raw CSV line number, standardized close-to-original fields. Used for disputes, future template mapping, and data science on what was known at buying/receiving time. | Permanent |
| `PreprocessingRow` | Standardize manifest | Work overlay keyed by `manifest_row_id`; stores `ai_*` cleaned/human-readable values and `final_*` approved values. **No new `clean_*`; use existing `ai_*`. Long-term: no `standard_*` here because standard data lives on `ManifestRow`.** | Temporary/worktable |
| `ProcessingRow` | Finalize preprocessing | Fast warehouse/search surface copied from `PreprocessingRow.final_*`; may overlap with `ManifestRow` by design because this is the cleaned/final processing view, not vendor evidence. | Worktable until order close/archive |
| `Product` | Check-in / product match | Stable reusable product definition across orders and manifest rows: title, brand, model, UPC, category, description, product-defining specs, default price. | Permanent |
| `Item` | Check-in | One physical unit: SKU, order, optional `manifest_row_id`, product, price, unit retail, cost, condition, status, location, dates, notes, optional instance specs. | Permanent |

### Permanent-vs-work rules

| Rule | Decision |
|------|----------|
| `ManifestRow` is the stable line id | `PreprocessingRow`, `ProcessingRow`, `Item`, and row-level disputes should use `manifest_row_id`. |
| `ManifestRow` wording stays close to original | Use standardized manifest fields, not cleaned/final copy, for vendor-readable dispute/audit context. Raw CSV stays available if needed. |
| Preprocessing cleanup layer | Use `ai_*` as the cleaned/AI/human-readable working layer. Do **not** add parallel `clean_*` fields. |
| Finalize preprocessing | Should create/update `ProcessingRow` from `final_*` values. Long-term: no separate **Create Processing Data** button. |
| Product/Item creation timing | Do **not** create `Product` or `Item` at preprocessing finalize. Create/match `Product` and create `Item` only during check-in. |
| Processing search | Read from `ProcessingRow.search_string`; counts come from `Item` rows joined by `manifest_row_id`. |
| Quantity mismatch | Allowed. Expected quantity comes from `ProcessingRow`/`ManifestRow`; actual quantity is count of checked-in `Item`s. Overages and shortages are workflow facts, not validation errors. |
| Bulk grouping | Long-term use `product_id`, `manifest_row_id`, or both. No new `batch_group_id` dependency for this redesign. |

### Product vs Item field decisions

| Field family | `Product` | `Item` |
|--------------|-----------|--------|
| Identity | `product_number`, title, brand, model, UPC | SKU, FK to `product` |
| Category | Flat `category` and optional `category_ref` | Derived through product/manifest; no `Item.category` |
| Description/specs | Reusable product description and product-defining specifications | `instance_specs` later for color, exact model suffix, missing parts, per-unit variation |
| Price | `default_price` as starting point | Actual `price`, `unit_retail`, `cost`, `sold_for` |
| Physical state | Not stored | `condition`, `status`, `location`, check-in/list/sold dates, notes |
| Order/manifest | Not stored | `purchase_order_id`, nullable `manifest_row_id` |
| Not adding now | `match_notes`, `canonical_confidence`, `merged_into_id` | `processing_row_id`, `condition_notes`, restoration/dispute status fields |

### Processing check-in target UX

| UI section | Behavior |
|------------|----------|
| Search/list | Query `ProcessingRow` only for fast row lookup. |
| Row detail | Show expected qty, checked-in count, remaining/overage, editable ProcessingRow defaults. |
| Checked-in list | Show `Item`s where `item.manifest_row_id = processingRow.manifest_row_id`; allow opening/editing those items. |
| Check-in form | Prefill from `ProcessingRow`; separate **Product** fields (title/brand/model/category/description/UPC/specs) from **Item** fields (quantity/condition/price/unit retail/location/notes). |
| Check-in save | Match/create `Product`; create N `Item`s linked to `manifest_row_id` and order. Edits in this form apply to the current check-in batch, not necessarily the ProcessingRow defaults unless explicitly saved there. |

### Migration and report safety

Principle: future-flow correctness first; do **not** rewrite history unless a scoped backfill is needed and verified.

| Area | Safety rule |
|------|-------------|
| Priced/tagged/on-shelf items | Preserve `Item.id`, `sku`, `price`, `status`, `location`, `listed_at`, `checked_in_at`, `sold_at`, `sold_for`. Shelf tags stay valid as long as SKUs do not change. |
| POS / sales history | Preserve `CartLine.item_id` targets by never deleting/recreating real `Item` rows. Cart/drawer/day reports should stay stable if Item IDs and sold fields remain stable. |
| Historical orders | Leave completed/sold history mostly as-is. Add nullable fields/indexes and compatibility reads before considering cleanup. |
| In-flight orders | Migrate more aggressively only when safe: raw/preprocessing-only orders are easiest; orders with created/sold/scrapped/lost Items are locked unless explicitly repaired. |
| Manifest rows | Do not delete `ManifestRow` rows linked to real Items. Future design creates them earlier; historical rows can remain in their current shape. |
| Products | Improve or backfill links conservatively. Do not merge/delete Products as part of this initiative. |
| Reports / SQL | Audit raw SQL and code assumptions before dropping fields/paths. Highest-risk assumption: `Item.category` (category must derive from Product or ManifestRow). |

---

## Roadmap to done — product identity phases (2026-06-09)

**Where we are:** new-flow pipeline foundation shipped (standardize → ManifestRow spine; finalize → ProcessingRow; row check-in → Product/Item); Session 1 fixed Add Item / AI Suggest / quick check-in and rebuilt the detailed check-in modal. **What's missing for the design:** the matching layer (candidates → decided match → fact), the Final Decisions UX, precedence reads, multi-product-row handling, collapse, and legacy match-field cleanup.

**How we get to done:** one phase at a time, one or more sessions per phase. Each phase has a narrow goal and a "Done when" gate. Edit this map as we learn — but edit it deliberately, in a session entry.

| Phase | Session(s) | Goal | Done when |
|-------|-----------|------|-----------|
| **S2** | Session 2 ✅ | Landmark design doc + this phase map | Design doc exists; initiative restructured around it |
| **P1 — Matching backend** | Session 3 ✅ | Migration: `PreprocessingRow.match_candidates` / `final_matched_product` / `match_source`; candidate matcher service (UPC → `VendorProductRef` → exact title/brand); auto-run hook on apply-cleanup; finalize copies decided match → `ProcessingRow.matched_product`; tests | Candidates generate for a real PO via API; finalize carries the match; zero UI dependency |
| **P2 — Final Decisions UI** | Session 4 ✅ | Rename Final Review → **Final Decisions**; candidate chips per row; accept / clear / inline product search; same-product badge + "same as row N" action; anchored bulk pricing | Staff can fully decide matches in the stepper without admin/API. Handoff: `session_4_handoff_questions.md`. |
| **P3 — Precedence reads + check-in ladder** | Session 5 ✅ | Product-wins coalescing in workspace serializer + `search_string`; check-in prefill ladder (batch → product → row); **stop writing `ManifestRow.matched_product`** at check-in | Matched rows display product data live; check-in prefills per ladder; manifest writes stopped. **Handoff:** `session_5_questions.md` (Composer self-answered; Fable review on return). |
| **P4 — Split (1 row → N products)** | Session 6 ✅ | "N products" chip; quick check-in confirms product on mixed-product rows; row detail groups Items/batches by product; batch product remap | Crayons scenario works end-to-end without workarounds |
| **P5 — Collapse (N rows → 1 product)** | Session 7 ✅ | Group-by-product display; "check in together" multi-row action distributing per-row quantities | Grouped rows check in from one form; Items keep own `manifest_row_id` |
| **P6 — Cleanup / deprecation** | Session 8 ✅ | Audit `ManifestRow` match-field readers (`match-products`, denorm refresh, manual-review, raw SQL); retire or re-scope `MergeModal`; docs pass (`inventory-pipeline.md`) | No code writes ManifestRow match fields; readers audited; columns flagged for future drop |
| **Audit** | Session 9 ✅ | Fable post-ship audit of P2–P6 (Q1 walkthrough, Q2 pass/fail, fixes) | Audit doc written; F1 (manifest-frozen row patch) + F2 (dead legacy match code) shipped |
| **P8 — Check-in / item UX overhaul** | Session 10 ✅ | Owner spec 2026-06-10: ONE add/edit/check-in model everywhere (Add Item here + Search-items page identical, qty-aware; check-in = same model with qty); quick check-in fills gaps from row defaults, creates new product when none, explicitly asks new-vs-existing only when ambiguous; row detail shows DEFAULTS at top (not header) + full professional redesign; all modals (add/edit item, check-in, edit prior check-in batch) redesigned: all Product+Item fields, easy product search, "editing this product affects X items across Y orders" warning, buttons over dropdowns, click-couple-buttons-then-Print flow — speed to check-in is the top priority after accuracy | Staff check in a normal unit in ≤3 clicks + Print |
| **P7 — Collapse rows wizard** | Session 10 ✅ | One **Collapse rows…** action at any match state: assess (unmatched/partial/matched/contradictions) → resolve → re-point checked-in batches → orphan-product confirm → final Product CRUD approval; `assign_shared_product` gains `product_mode: new` (owner-approved Level-3 exception). **Owner check-in semantics (2026-06-10):** collapsed group is presentation-only (manifest untouched); group check-ins **fill rows in order** — e.g. rows of 5/3/7, check in 10 → fills 5, 3, then 2 of the 7; remaining 5 stays on the last row. Group identity via first-row id, check-in-relevant fields nulled on followers while collapsed. **Refined 2026-06-10 (evening):** term is **Collapse** with an explicit collapsed/expanded **toggle**; collapsed shows ONLY the first row as master (individual rows hidden) with combined qty/check-in counts; one check-in spanning rows = multiple per-row check-in batches under the hood. ✅ Shipped same day: `assign shared product` accepts **`product_mode: new`** (creates catalog Product from first row's fields, assigns to all — dialog has "New product from row #N"). **✅ Shipped 2026-06-10 (Session 10):** `ProcessingRow.collapse_master` self-FK (migration 0059), `processing-collapse-rows` / `processing-uncollapse-rows` endpoints (`product_mode` keep/existing/new), fill-in-order check-in distribution on the master (per-member batches, `check_in_batch_ids`), followers reject direct check-in, `collapsedGroup` rollups in workspace payloads, queue UI (members hidden by default + **Show collapsed rows** toggle, ⊟/↳ prefixes, combined qty on master, bulk **Collapse rows**/**Uncollapse**, mixed-hint selections resolve product via shared dialog in collapse mode). 9 backend tests incl. owner's 5/3/7→10 example. | Bill's two-lines-no-catalog-product case has one clean path; spec: audit doc § F3 + owner semantics here |

| **P9 — Singles & sets (row transforms)** | Session 11 ✅ | Owner spec 2026-06-12 (design session same day): merchandising can change a row's **unit of measure** — **Break apart** (1 unit → X subitems; 10 cases of 500 plates → 5,000 plates) and **Make set** (S units → 1 set with ONE tag; 12,000 candles → boxes of 500 for churches, priced independently). Whole-row converts in place (expected qty rewritten); partial creates a **sub row** (`split_parent`, displayed `#12.1`) on the same frozen manifest line. `Item.unit_count` stamps physical units per tag from `ProcessingRow.units_per_item`. **Restart row** = coarse v1 undo: family-wide delete (Items/batches/sub rows + transform-created Products when unreferenced) + snapshot restore; blocked on sold/cart-referenced items or collapsed family rows. Design amendment recorded as §7.5 of the landmark doc (two-level quantity truth; second Level-3 exception; split × collapse mutually exclusive). | Plates and candles scenarios work end-to-end; sibling rows never cross-count; restart returns the row to its finalize state; regressions green |

Phase B backlog items from Session 1 (in-workspace add item ✅, richer search, inline edits, QOL) continue alongside — fold into the phase whose surface they touch, or take as standalone QOL slices between phases.

**Session routine (committed):** every session is opened with a `### Session N` block (goal, finish line, scope, est, start timestamp — `code.0.Startup` step 8), checkpointed during work (`session.1.Checkpoint`), and closed with a **Result** line + docs/changelog pass (`session.9.Close`). A session closes only when its phase's "Done when" gate is met or the remainder is explicitly re-scoped into the map above. Within a session, iterate plan → code → test → debug freely; the gate is what makes "done" unambiguous.

---

## Objectives (priority order)

### Phase A — Debug (first)

- [ ] Reproduce and fix owner-reported **intake → processing** errors (list in Session 1 once shared).
- [ ] Add regression coverage or manual repro notes where cheap.

### Phase B — Processing workspace UX

1. **Add item in context** — Add a unit/line **directly from the processing workspace** (PO-scoped), instead of routing staff to **Search items → Add item** on `/inventory/items`.
2. **Richer search** — Expand searchable fields and/or matching behavior (server `search_string` builder, API `search` param, client filter helpers in `processingWorkspaceFilters.ts`).
3. **Edit item / product fields** — Inline edit for manifest bookmark + **Item** + **Product** fields staff need during processing (title, brand, model, identifiers, notes, etc.) with correct write paths and workspace refresh.
4. **QOL backlog** — Capture and implement small wins as they surface (keyboard shortcuts, filter defaults, empty states, batch actions, etc.).

---

## Delivery phases

| Phase | Goal | Current status |
|-------|------|----------------|
| 0 | Stabilize current Add Item / AI Suggest | **Implemented** — item detail white-screen and AI Suggest `Item.category` 500 fixed. |
| 1 | Product-first standalone Add Item | **Implemented** — Add Item creates/matches `Product`, then creates thin `Item`; category/model/UPC live on Product. |
| 1A | AI retail/search assist | **Implemented** — AI returns retail/MSRP, model, search tags, Google query; durable tags persist to `Product.specifications.search_tags`. |
| 2 | ManifestRow-at-standardize migration | **Implemented for new flow** — standardize creates/updates stable `ManifestRow` rows and links `PreprocessingRow.manifest_row_id`. |
| 3 | PreprocessingRow simplification | **Partially implemented** — cleanup CSV uses ManifestRow IDs and uploads write `ai_*`; transitional `standard_*` fields/assumptions remain. |
| 4 | Finalize-to-ProcessingRow | **Implemented** — finalize creates linked `ProcessingRow` bookmarks without creating/deleting real Items. |
| 5 | Check-in creates real inventory | **Implemented foundation** — row-level check-in matches/creates Product and creates N Items linked to order + manifest row. |
| 6 | Retire Create Processing Data | **Not done** — button/path remains as legacy compatibility for old/bookmark-only orders. |
| 7 | Processing workspace redesign | **Partial** — row detail can open without prebuilt Items and quantity check-in works; richer search, inline edits, checked-in item management still remain. |
| 8 | Rollups and reporting | **Partial** — category/retail assumptions fixed in key paths; order-level expected/actual/dispute/restoration rollups still need a pass. |
| 9 | Cleanup old paths | **Not done** — keep compatibility until old-order migration/report audit is complete. |

Practical status: the **pipeline foundation is implemented for new-flow orders**, with legacy compatibility retained. The remaining work is mostly Processing workspace UX, old-order migration strategy, rollups/reporting, and cleanup of transitional paths.

---

## Phase 1 coding plan — Add Item / AI Suggest stabilization

Goal: stop current Add Item / AI Suggest failures and align standalone `/inventory/items` with the Product/Item ownership rules, without rebuilding the full intake pipeline yet.

| Step | Work | Files / areas |
|------|------|---------------|
| 1 | Finish `Item.category` audit. Replace remaining invalid `Item.category` reads with `product__category` / `manifest_row__category` or serializer-derived category. | `apps/inventory/views.py`, `apps/inventory/services/*`, tests |
| 2 | Add a small manual-item product resolver: UPC match → exact title/brand/model/category match → create Product. Keep it conservative and deterministic. | new `apps/inventory/services/manual_item.py` or nearby service |
| 3 | Route standalone Add Item through Product. `category`, `model`, and `upc` write to Product; `retail_value` maps to `Item.unit_retail`; `Item` remains thin. | `apps/inventory/serializers.py`, `apps/inventory/views.py` |
| 4 | Update Add Item form shape. Keep current fields working; add/confirm `model` and `upc` inputs only if needed for Product matching; show linked Product after save where practical. | `frontend/src/components/inventory/ItemForm.tsx`, `frontend/src/types/inventory.types.ts` |
| 5 | Keep AI Suggest taxonomy-safe. `category` must remain one of taxonomy v1 names; optional next field is `model`, but no prompt expansion beyond Product/Item alignment in this phase. | `apps/inventory/views.py`, `apps/inventory/services/ai_listing_context.py` |
| 6 | Add focused regression tests. Cover item detail load, Add Item create/link Product, AI Suggest examples with category, and any store report/category query fixed in step 1. | `apps/inventory/tests/` |
| 7 | Update docs/changelog for the small shipped slice. Do not claim the full north-star pipeline is implemented. | `CHANGELOG.md`, `.ai/extended/inventory-pipeline.md` if behavior changes |

Phase 1 non-goals:

- No schema rebuild of `PreprocessingRow` / `ManifestRow` / `ProcessingRow`.
- No removal of **Create Processing Data** yet.
- No in-workspace Add Item yet.
- No Product merge workflow or Product match confidence fields.
- No restoration/dispute field expansion on `Item`.

---

## Acceptance

- Reported **Phase A** errors are resolved or explicitly deferred with owner sign-off.
- Staff can **add an item/line from the processing workspace** for the active PO without leaving `/inventory/processing/:id`.
- Workspace **search** finds rows by the expanded field set the owner cares about (documented in session notes).
- Staff can **edit item and product fields** needed for shelf prep without Django admin or a separate item detail round-trip.
- Changes stay compatible with existing check-in, print, merge, dispute, and bulk disposition flows (**row-first** `processing_row_id` semantics — **v2.22.0**).

---

## QOL ideas (parking lot)

_Add during sessions; not committed scope until prioritized._

- Remember last queue segment / filters per PO (localStorage).
- Focus search on `/` or `Ctrl+F` (partial — `searchFocusSignal` exists).
- Show SKU / row number chips in queue table columns.
- Quick link to order detail / preprocessing from workspace header.
- Refresh `search_string` after inline field edits without full page reload.
- Duplicate-row / split-quantity helper for manifest exceptions.

---

## See also

- **Landmark design:** `.ai/reference/product_identity/product_identity_design.md`
- **Session 4 handoff (P2, shipped):** `session_4_handoff_questions.md`
- **Session 5 handoff (P3):** `session_5_questions.md`
- **Session 6 handoff (P4):** `session_6_questions.md`
- **Session 7 handoff (P5):** `session_7_questions.md`
- **Session 8 handoff (P6, prep):** `session_8_questions.md`
- Field matrix: `.ai/reference/item_product_creation_fields.md`
- Shipped pipeline: [`order_processing_pipeline_rebuild`](./order_processing_pipeline_rebuild.md)
- Domain reference: [`.ai/extended/inventory-pipeline.md`](../../../extended/inventory-pipeline.md)
- Processing UI redesign demos: `.ai/reference/processing_workspace/README.md`
- Frontend: [`frontend/src/pages/inventory/processing/`](../../../../frontend/src/pages/inventory/processing/)
- Search builder: [`apps/inventory/services/processing_search_string.py`](../../../../apps/inventory/services/processing_search_string.py)
- Prior add-item initiative (global dialog): [`add_item_dialog_and_sources`](./add_item_dialog_and_sources.md)
