<!-- initiative: slug=intake-processing-improvements status=active updated=2026-06-12 -->
<!-- Last updated: 2026-06-12 (Session 11 — P9 singles & sets row transforms shipped) -->

# Initiative: Intake → Processing improvements

**Status:** **Active** — product-identity roadmap **P1–P9 complete** (Sessions 3–11): P1–P6 shipped Sessions 3–8 (2026-06-09), Session 9 (2026-06-10) Fable post-ship audit + F1/F2, **Session 10 (2026-06-10)** shipped **P7 collapse groups** and the **P8 check-in/item UX overhaul** (buttons-first check-in, unified qty-aware add-item, quick check-in product prompt, defaults-at-top row detail), **Session 11 (2026-06-12)** shipped **P9 singles & sets** (Break apart / Make set row transforms, sub rows, `Item.unit_count`, Restart row undo). **Next:** remaining high-level work below (richer search, legacy retirement, rollups).

> **Landmark design:** [`.ai/reference/product_identity/product_identity_design.md`](../reference/product_identity/product_identity_design.md) — the binding target design for product matching/creation across intake (three rules, confidence ladder, field precedence, collapse/split, schema delta). This initiative tracks **phases and sessions** toward that design; when this file and the design doc disagree, the design doc wins (or update both deliberately).

Follow-on to the shipped inbound rebuild ([`order_processing_pipeline_rebuild`](./_archived/_completed/order_processing_pipeline_rebuild.md) **v2.20.0**–**v2.24.2**). The **Orders → Preprocessing → Receiving → Processing** pipeline is live; this initiative realigns the model and UX around a stable **ManifestRow → PreprocessingRow → ProcessingRow → Product/Item** flow, then tightens **Item Processor** (`/inventory/processing/:id`) and fixes intake→processing errors blocking daily use.

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

Detail: [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md) — Item Processor workspace section.

---

## North-star intake model

> **2026-06-09:** extended and superseded in detail by the landmark design doc ([`product_identity/product_identity_design.md`](../reference/product_identity/product_identity_design.md)). Key deltas vs the tables below: match candidates + decided match move to **staging** (`PreprocessingRow.match_candidates` / `final_matched_product`), `ManifestRow` match fields are **deprecated** (stop writes, audit readers), and product-vs-row reads follow the precedence rule (*product wins identity, row wins transaction*). The tables below remain valid grounding for everything else.

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
| **P2 — Final Decisions UI** | Session 4 ✅ | Rename Final Review → **Final Decisions**; candidate chips per row; accept / clear / inline product search; same-product badge + "same as row N" action; anchored bulk pricing | Staff can fully decide matches in the stepper without admin/API. Handoff: [`session_4_handoff_questions.md`](../reference/product_identity/session_4_handoff_questions.md). |
| **P3 — Precedence reads + check-in ladder** | Session 5 ✅ | Product-wins coalescing in workspace serializer + `search_string`; check-in prefill ladder (batch → product → row); **stop writing `ManifestRow.matched_product`** at check-in | Matched rows display product data live; check-in prefills per ladder; manifest writes stopped. **Handoff:** [`session_5_questions.md`](../reference/product_identity/session_5_questions.md) (Composer self-answered; Fable review on return). |
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

## Sessions

### Session 1 — 2026-06-06

- **Start:** 2026-06-06T10:00:00-05:00
- **est:** 2–4h (debug pass + first UX slice if errors are quick)
- **Goal:** Fix intake→processing errors the owner hits in production, then start Item Processor workspace improvements.
- **Finish line:** Errors reproduced and fixed (or documented blockers); at least one Phase B item **designed or shipped** if debug is light.
- **Scope:**
  - **In:** `ProcessingWorkspacePage` stack, processing APIs, intake handoff (`build-processing-data`, `ProcessingRow`/`Item`/`ManifestRow`) as needed for bugs.
  - **Out:** Final Review UI polish, public website, buying auction work.
- **Phase B backlog (owner):**
  1. Add item directly (not via `/inventory/items` Add Item).
  2. Search more fields / better matching.
  3. Allow edit item/product fields in workspace.
  4. Other QOL as we discover them.
- **Status:** **Foundation implemented / active initiative remains open** — new-flow pipeline code is in place with legacy compatibility retained; Processing workspace UX, old-order migration, rollups, and cleanup remain.
- **Bug 1 — Item detail white screen after Add Item:** `ItemSerializer` omitted `category` and `retail_value`; `ItemForm` called `.trim()` on `undefined` category. Fixed: serializer exposes `category` + `retail_value` (→ `unit_retail`), persists category on Product; form null-safe. Tests: `apps.inventory.tests.test_item_serializer`.
- **Bug 2 — AI Suggest 500 on Add Item:** `retrieve_listing_examples_for_prompt` queried nonexistent `Item.category`. Fixed: filter/annotate via `product__category` + `manifest_row__category`. Same filter fix in `price_estimator._find_comparables`. Tests: `apps.inventory.tests.test_ai_listing_context`.
- **Design update:** Owner clarified north-star model: standardize creates permanent `ManifestRow`; preprocessing uses `ai_*` + `final_*` keyed by `manifest_row_id`; finalize creates `ProcessingRow`; check-in creates/matches `Product` and creates `Item`; no long-term **Create Processing Data** button; standalone Add Item Phase 1 should stabilize Product/Item ownership first.
- **Implemented:** Add Item / AI Suggest stabilization; Product-first standalone Add Item; `PreprocessingRow.manifest_row_id` migration; standardize creates/updates `ManifestRow` spine; cleanup CSV exports stable ManifestRow IDs and writes `ai_*`; finalize creates linked `ProcessingRow` bookmarks non-destructively; new `POST .../processing-row-check-in/` creates Product + Item rows at physical check-in; Processing workspace supports row detail with no prebuilt Items; legacy Create Processing Data is compatibility-labeled; category/report SQL audited; `classify_intake_redesign_orders` dry-run command added for migration safety cohorts.
- **AI Retail + Search Assist (2026-06-06):** `suggest_item` now returns `retail_value`, `model`, `search_tags`, and `google_query`; Add Item form auto-fills Retail/MSRP, shows a Google item link after AI Suggest, and saves durable tags to `Product.specifications.search_tags`; row-level check-in passes `ProcessingRow.search_tags` through the same Product resolver.
- **Item detail order link (2026-06-06):** `ItemSerializer` now exposes `purchase_order_number`; `ItemHeroStats` shows the linked order number and routes to `/inventory/orders/:id` when clicked. Design note: every purchased Item should belong to a PO, but `Item.purchase_order` remains nullable for now; catch-all PO enforcement/backfill is deferred by owner.
- **Verification performed:** targeted Django tests for item serializer, AI parsing/context, and manual item search tags passed; frontend TypeScript/Vite build passed after AI Retail + Search Assist changes.
- **2026-06-09T checkpoint — Quick check-in + Item Processor UX pulse:** Fixed quick check-in routing to always use `POST …/processing-row-check-in/` (was incorrectly calling `processing-print-and-check-in` on a prior checked-in item → "Item already dispositioned"). Subsequent quick check-ins reuse the latest batch's `product_id`; `ManifestRow.matched_product` and denorm refresh preserve product linkage. Rebuilt **Detailed check-in** modal (`ProcessingCheckInDialog`) with header quantity stepper, compact title/brand/model, emphasized identifiers/tags/notes, hover tooltips, and user-triggered AI suggest. Row defaults toolbar: smaller identity pills, larger identifiers/tags/notes, full-value hover tooltips. Queue table: hide inactive sort icons so `#` column no longer bleeds a dot before **Brand** header. Tests: `test_processing_row_check_in_reuses_latest_batch_product`.

### Session 2 — 2026-06-09

- **Start:** 2026-06-09T13:37:00-05:00
- **est:** 1–2h (design + docs only, no code)
- **Goal:** Turn the owner's product-identity design discussion into a landmark design doc and restructure this initiative into a phased session map.
- **Finish line:** Design doc exists in `.ai/reference/`; initiative has a phase → session map with "Done when" gates and a committed open/checkpoint/close routine.
- **Scope:**
  - **In:** design doc, initiative restructure, reference README index.
  - **Out:** any code, schema, or UI changes (start in Session 3 / P1).
- **Design decisions captured (owner, 2026-06-09):**
  - Match scaffolding lives on **staging**: `PreprocessingRow.match_candidates` (scored suggestions) + `final_matched_product` (decided; null = new product) + `match_source`; decided match copies to `ProcessingRow.matched_product` at finalize. `ManifestRow` stays pure vendor evidence — its match fields are deprecated.
  - **Precedence rule:** product wins identity fields (title/brand/model/UPC/category/description/specs, read live via FK — never copied onto rows); row wins transaction fields (qty/retail/price/condition/notes). Wrong match = clear one FK, row data intact.
  - **Collapse** (N rows → 1 product): shared `matched_product` *is* the link — no new entity; "check in together" executes per-row check-ins; never merge ProcessingRows.
  - **Split** (1 row → N products): keep the line intact; N `ProcessingCheckInBatch`es each with own product; quantity truth = count(Items by `manifest_row_id`) vs `ManifestRow.quantity`.
  - Products are created **only at check-in** (or manual Add Item) — never during preprocessing/finalize; shorted lines leave no catalog artifact.
- **Result:** **Done.** Created [`.ai/reference/product_identity/product_identity_design.md`](../reference/product_identity/product_identity_design.md) (three rules, confidence ladder, precedence, stages, collapse/split, schema delta, deprecation audit list, open questions); added Roadmap-to-done phase map (S2 + P1–P6 → Sessions 3–8) with session routine commitment; indexed the doc in `.ai/reference/README.md`.

### Session 3 — 2026-06-09 (P1 — Matching backend)

- **Start:** 2026-06-09T14:20:00-05:00
- **est:** 2–4h
- **Goal:** Implement the matching backend per [`product_identity/product_identity_design.md`](../reference/product_identity/product_identity_design.md) §2/§8 — staging match fields, candidate matcher service, apply-cleanup hook, finalize carry-through.
- **Finish line (P1 gate):** Candidates generate for a real PO via API; `final_matched_product` decisions (incl. API-level set/clear) survive finalize onto `ProcessingRow.matched_product`; zero UI dependency; tests pass.
- **Scope:**
  - **In:** migration (`match_candidates`, `final_matched_product`, `match_source` on `PreprocessingRow`); `services/product_matching.py` matcher (UPC → `VendorProductRef` → exact title/brand); auto-run on `apply-cleanup-csv`; expose/accept match fields on `preprocessing-review`; finalize copies decided match → `ProcessingRow.matched_product`; tests.
  - **Out:** Final Decisions UI (P2), precedence reads/check-in ladder (P3), any `ManifestRow` match-field removal (P6).
- **Implemented (2026-06-09):**
  - **Migration `0057_preprocessing_match_fields`** — adds the three staging fields (plus benign auto-detected index renames reconciling 0054/0056 drift). Applied locally.
  - **`services/product_matching.py`** — `generate_match_candidates_for_order(order)`: batched lookups (one exact `IN` query per tier + per-miss `iexact` sweeps), candidates capped at 5/row with display snapshots; UPC-exact top hit auto-selects `final_matched_product` (`match_source='auto'`) only when undecided; **staff decisions (incl. explicit staff null = "this is new") never overridden**; safe to re-run.
  - **`apply-cleanup-csv`** (staging branch) auto-generates candidates after a successful apply; response includes `match_candidates` summary.
  - **`preprocessing-review`** — GET (full + minimal serializers) exposes `match_candidates` / `final_matched_product` / `match_source`; PATCH accepts `final_matched_product` (int validated against `Product`, or null) and stamps `match_source='staff'`; match-only patches do not clear `ai_status`.
  - **Finalize carry** — `processing_finalize.py` projects `final_matched_product_id` and sets `ProcessingRow.matched_product_id` at bookmark creation.
  - **Denorm ownership fix** — `refresh_processing_rows_denorm` no longer overwrites `ProcessingRow.matched_product` from `ManifestRow` (or nulls it for unlinked bookmarks); manifest hint / primary-item product are **fallbacks when null only**. Deliberate clears still go through `_unlink_processing_bookmarks`.
  - **Re-standardize reset** — `bulk_clear_preprocess_ai_and_final_layers` also clears the three match fields (consistent with its blanket `ai_*`/`final_*` reset).
- **Verification:** `test_product_matching.py` (13 tests: candidates per tier, auto-select, staff-decision immunity, PATCH set/clear/reject, GET exposure, finalize carry, denorm preservation linked+unlinked); regression: `test_preprocessing_redesign` + `test_processing_validation_matrix` (113 passed), `test_intake_undo` + `test_intake_po_repair` (17 passed). No lints.
- **Result:** **Done — P1 gate met.** Candidates generate via API on cleanup apply; decisions settable via review PATCH; finalize carries the match onto `ProcessingRow` and it survives denorm refresh; zero UI dependency. Docs: CHANGELOG `[Unreleased]`, `inventory-pipeline.md` steps 5–6.

### Session 4 — 2026-06-09 (P2 — Final Decisions UI)

- **Start:** 2026-06-09T15:00:00-05:00
- **est:** 4–8h
- **Goal:** Ship P2 Final Decisions UI per [`session_4_handoff_questions.md`](../reference/product_identity/session_4_handoff_questions.md) — match column, immediate PATCH flow, anchored bulk pricing (Section P), stepper rename.
- **Finish line (P2 gate — L1–L8):** Step 3 labeled Final Decisions; staff decide matches via chip/popover without admin; Refresh matches works; same-product badges across pages; workspace detail shows ProcessingRow match after finalize; bulk pricing preserves AI dynamics + retail mode; never writes $0.00 over unpriced rows.
- **Scope:**
  - **In:** backend hydration (`matched_product_detail`, `same_product_row_numbers`), regen endpoint, detail fix; `PreprocessingMatchCell`; pricing toolbar rework; types/hooks; tests.
  - **Out:** workspace UI (except detail server fix), precedence reads (P3), collapse actions (P5), fuzzy matching, legacy panel rewire.
- **Status:** **Done**

- **Implemented (2026-06-09):**
  - **Backend:** `matched_product_detail` + `same_product_row_numbers` on review serializers (with `select_related` + one aggregate query); `POST …/regenerate-match-candidates/`; `build_processing_row_detail` prefers `ProcessingRow.matched_product`.
  - **Frontend:** Step 3 **Final Decisions** (stepper + helper line); `PreprocessingMatchCell` (5 chip states, popover with candidates/search/Confirm/New product/Same-as-row); immediate match PATCH via `useUpdatePreprocessingMatch`; Refresh matches + auto-regen-once; anchored bulk pricing (Scale AI / Target total / % of retail).
  - **Tests:** `test_product_matching.py` +5 (18 total); `preprocessingReviewTotals.test.ts` (5 cases); frontend build + 78 backend regressions pass.
- **Result:** **Done — P2 gate met (L1–L8).** Staff decide product matches and bulk-price in the stepper without admin/API; finalize → workspace list/detail show ProcessingRow match; pricing never zeroes unpriced rows. Docs: CHANGELOG, `inventory-pipeline.md` step 6.
- **Fable review fixes applied (2026-06-09):** pricing zero-guard, finalize search tokens, match PATCH validation.

### Session 5 — 2026-06-09 (P3 — Precedence reads + check-in ladder)

- **Start:** 2026-06-09
- **Goal:** Product-wins identity coalescing in workspace list/detail; check-in prefill ladder; stop writing `ManifestRow.matched_product` at check-in.
- **Finish line (P3 gate — K1–K8):** Queue + detail show product title when bookmark differs; check-in prefills matched product; no manifest match write; search finds product title and row/manifest wording; regressions green.
- **Scope:**
  - **In:** `coalesce_processing_row_identity`; list/detail payloads; denorm `products_by_id` timing; check-in manifest delete; frontend ladder + types; tests + docs.
  - **Out:** Final Decisions precedence, collapse UI (P5), split chips (P4), manifest column removal (P6), search_string base coalesce (G1).
- **Status:** **Done**

- **Implemented (2026-06-09):**
  - **Backend:** `coalesce_processing_row_identity`; workspace list coalesced title/brand/category + minimal `product`; detail product-wins identity + `manifestEvidence`; denorm `products_by_id` rebuild after legacy backfill; check-in stops manifest match write + manifest resolution fallback.
  - **Frontend:** Check-in open defaults to `keep` when matched; queue trusts server coalesced title; UPC scan prefers product; vendor-claim caption on active card.
  - **Tests:** `test_processing_identity.py` (K1/K4/K5/K8); matrix reuse test updated; 80 backend + 16 frontend filter tests pass.
- **Result:** **Done — P3 gate met (K1–K8).** Workspace shows product-wins identity when matched; check-in no longer writes manifest match; search finds both product and row wording. Docs: CHANGELOG, `inventory-pipeline.md` steps 8–9.

### Session 6 — 2026-06-09 (P4 — Split / N products)

- **Start:** 2026-06-09
- **Goal:** N-products chip; mixed quick-check-in guard; detail grouped by product; batch product remap; primary product denorm recompute.
- **Finish line (P4 gate — L1–L7):** Two-product row shows chip; quick check-in blocked when mixed; detail groups by product; remap API works; crayons 10+14; tests green.
- **Scope:**
  - **In:** `distinct_product_count` migration + denorm; list `distinctProductCount`; check-in guard; remap API + UI; grouped history; tests + docs.
  - **Out:** collapse (P5), MergeModal (P6), Final Decisions stepper, manifest split/writes, search_string base coalesce (G1).
- **Status:** **Done**

- **Implemented (2026-06-09):**
  - **Backend:** `distinct_product_count` on `ProcessingRow`; `distinct_product_count_for_items` / `primary_product_id_for_items` in denorm; mixed-row check-in guard; `remap_check_in_batch_product` + view action.
  - **Frontend:** queue/detail N-products chip; quick check-in disabled when mixed; `buildProductGroupedHistory` + grouped checked-in table; `RemapBatchProductDialog` + `useRemapCheckInBatchProduct`.
  - **Tests:** `test_processing_split.py` (6); `checkedInHistory.test.ts` grouping; 66 backend regressions + tsc pass.
- **Result:** **Done — P4 gate met (L1–L7).** One manifest line can check in multiple products with chip, guard, grouping, and batch remap. Docs: CHANGELOG, `inventory-pipeline.md` step 9, [`session_6_questions.md`](../reference/product_identity/session_6_questions.md).

### Session 7 — 2026-06-09 (P5 — Collapse / check in together)

- **Start:** 2026-06-09 (prep — plan next)
- **Goal:** Group-by-product workspace display; **Check in together** for rows sharing `ProcessingRow.matched_product`; Items keep per-row `manifest_row_id`.
- **Finish line (P5 gate — L1–L7):** Grouped/peers visible on queue; multi-row same-product check-in from one form; no manifest merge writes; controllers scenario; regressions green.
- **Scope:**
  - **In:** `sameProductRowNumbers` (or equivalent) on list; grouped queue mode; `processing-check-in-together` API; bulk selection UX + dialog; tests + docs.
  - **Out:** `MergeModal` / `processing_merge_rows` retirement (P6); split/N-products changes (P4); manifest column removal; preprocessing stepper.
- **Status:** **Done — P5 gate met (L1–L7).**

- **Implemented (2026-06-09):**
  - **Backend:** `_same_product_peers_for_order` + list **`sameProductRowNumbers`**; extracted **`_check_in_processing_row`**; **`processing_check_in_together`** + **`POST …/processing-check-in-together/`** (atomic per-row batches; no manifest writes; rejects mixed P4 rows).
  - **Frontend:** queue checkbox multi-select, peer chips, **Group by product** toggle; **`ProcessingBulkActionBar`** + **`CheckInTogetherDialog`**; **`useProcessingCheckInTogether`** + label print flow.
  - **Tests:** `test_processing_collapse.py` (5); 71 backend regressions + tsc pass.
- **Result:** **Done — P5 gate met (L1–L7).** N manifest lines sharing one decided product can check in together from one form; Items keep per-row **`manifest_row_id`**. Docs: CHANGELOG, `inventory-pipeline.md` step 9, [`session_7_questions.md`](../reference/product_identity/session_7_questions.md).

### Session 8 — 2026-06-09 (P6 — Cleanup / deprecation)

- **Start:** 2026-06-09
- **Goal:** Stop **`ManifestRow`** match-field writes; audit readers; retire **`processing_merge_rows`** / **`MergeModal`**; add non-destructive **Assign shared product** where merge was wrongly used.
- **Finish line (P6 gate — L1–L7):** No manifest match writers; denorm/detail off manifest match FK; merge unavailable; assign-shared + docs; regressions green.
- **Scope:**
  - **In:** Writer/reader audit; remove merge; assign shared product API + bulk UX; deprecate **`match-products`** writes; model help_text; tests + docs.
  - **Out:** column drop migration; Product catalog merge workflow; P4/P5 behavior changes; Create Processing Data retirement.
- **Status:** **Done — P6 gate met (L1–L7).**

- **Implemented (2026-06-09):**
  - **Backend:** **`processing_assign_shared_product`** + **`POST …/processing-assign-shared-product/`**; removed **`processing_merge_rows`** action; **`match-products`** POST → **410 Gone**; **`ensure_manifest_products_and_items`** / check-in queue sync **`ProcessingRow.matched_product_id`** only; denorm + row detail drop manifest match fallback; **`link_processing_rows_to_manifest_rows`** one-way legacy bootstrap when PR hint null.
  - **Frontend:** **`AssignSharedProductDialog`** + bulk bar when hints differ; deleted **`MergeModal`** / merge API hook.
  - **Tests:** **`test_processing_deprecation.py`** (5); identity denorm test updated for P6; 132 backend regressions + tsc pass.
- **Result:** **Done — P6 gate met (L1–L7).** Staff align hints via **Assign shared product**, collapse via **Check in together**; no manifest match writers on processing paths. Docs: CHANGELOG, `inventory-pipeline.md`, [`session_8_questions.md`](../reference/product_identity/session_8_questions.md).

### Session 9 — 2026-06-10 (Fable post-ship audit + F1/F2)

- **Goal:** Audit shipped P2–P6 against the landmark design (owner request via [`fable_product_matching_review.md`](../reference/product_identity/fable_product_matching_review.md)); fix what's wrong.
- **Result:** **Done.** Audit written to [`fable_product_matching_audit.md`](../reference/product_identity/fable_product_matching_audit.md) — all Composer session claims verified in code; regression suite 45/45. Two fixes shipped same day:
  - **F1 (Rule 1 violation):** deleted `_sync_manifest_row_from_processing_defaults` — row-default edits no longer overwrite the linked `ManifestRow` (frozen vendor claim); regression test added; two matrix tests flipped from asserting the old sync.
  - **F2 (dead code):** deleted unreachable `undo-product-matching` endpoint + unmounted `ProductMatchingPanel`/`MatchReviewPanel`/`FinalizePanel` + the orphaned frontend match API surface (fns, hooks, types, query-key invalidations). Zero dangling references; 95 backend + 60 frontend tests green.
  - **Owner rulings recorded:** undo works through Final Decisions / assign / remap (legacy endpoint did nothing); **P7 Collapse rows wizard approved** including pre-check-in Product creation in that flow (deliberate Level-3 exception).
  - **Data note — RESOLVED 2026-06-10:** divergence measured (read-only check vs `standard_*`): **production never affected** (`fefa548` was never deployed; prod lacks the spine columns entirely). Local dev DB: **6 rows on PO 323** (WLMRT-OJU-3V74 — row 3 brand, rows 740–744 condition/notes) — **repaired** from staging originals; re-check shows 0 diverged. Scripts: `workspace/check_manifest_taint.py` / `repair_manifest_taint.py`.

### Session 10 — 2026-06-10 (P7 collapse + P8 check-in/item UX overhaul)

- **Goal:** Owner's 10-item processing list ("DO IT ALL"): P7 collapse groups end-to-end + P8 speed-to-check-in overhaul; standing directive: FAST processing, no lag.
- **Result:** **Done.**
  - **P7 (items 2–3):** `ProcessingRow.collapse_master` (migration 0059); `processing-collapse-rows`/`processing-uncollapse-rows` (`product_mode` keep/existing/new); master-only display with combined qty (`collapsedGroup` rollups); fill-in-order check-in distribution (owner's 5/3/7→10 example tested); followers reject direct check-in; queue **Show collapsed rows** toggle + bulk **Collapse rows**/**Uncollapse**; mixed-hint selections resolve via the shared-product dialog in collapse mode. 9 tests.
  - **P8 (items 5–10):** detailed check-in dialog buttons-first (`SegmentedButtons` for product action/condition/dispatch) + **"affects X items across Y orders"** warning on Edit-linked (new `products/{id}/usage/` endpoint, fetch only on demand); quick check-in asks **new-vs-existing** explicitly when the row has no product (`QuickCheckInProductPrompt`) instead of silently creating one; row detail shows **Row defaults at the top** (expanded); **ONE add-item model**: workspace add dialog hosts the Items-page `ItemForm` (`submitOverride` → processing-add-item pipeline), `ItemForm` + `POST /items` quantity-aware (workspace POs route through `processing_add_item` → Added queue row; `created_count`/`created_items` in response). 8 tests (`test_item_create_unified.py`).
  - **Perf (owner: "NO lag"):** product search debounced 250ms with keep-previous results; check-in dialog loads nothing on open (search/usage/AI all on-demand); locked-PO `ItemForm` skips PO fetches; all mutations keep the workspace-patch path (no full refetches).
  - **Print server (owner request):** verified healthy (v1.2.38, label printer assigned + ready, autostart via HKCU Run key); removed a dead legacy V2 Startup VBS pointing at the deleted `C:\DashPrintServer`; fixed the installer's legacy-cleanup to match both VBS name variants (it only knew the hyphenated one). Note: `settings.json` names receipt printer "Receipt Printer", which isn't installed on the dev machine — irrelevant for labels; store POS machines carry their own settings.
  - Suites: backend 274 passed (full inventory), frontend 78/78, tsc clean.
  - **Follow-up (owner bug report, same day):** master detail "Expected" showed only the first row's qty. Fixed group coherence everywhere: master `queue_status` denorm'd from **group** totals (own-row status read `checked_in` after fill-in-order filled the master first → `hide_checked_in`/segment dropped half-checked groups; scoped denorm now pulls the master in even when only members were touched); master row detail returns `collapsedGroup` + all member items/batches + group status; client `effectiveRowQty` helper drives detail tiles, quick check-in caps/"Left after", dialog pills (5/3/7 → Expected 15); "⊟ Rows … as one" header chip; member detail opens redirect to master (scan path); Check-in-together / assign-shared exclude collapse-involved rows. Backend 278, frontend 82, all green. Second owner pass: the **queue table Qty cell + qty sort** rendered raw row fields (missed by the first fix) — now use `effectiveRowQty`; and the **500-unit check-in cap was removed everywhere** (owner: warn instead — >100 units shows "about to check in X", printing requires typing **`PRINT <qty>`**; 10,000 fat-finger backstop returns an explicit 400, never a silent clamp). Backend 280, frontend 85.

### Session 11 — 2026-06-12 (P9 — Singles & sets row transforms)

- **Start:** 2026-06-12 (design review → owner approval → implementation, same conversation)
- **Goal:** Owner use case "check in 10 individuals AND 5 sets of 10": Break apart / Make set row transforms with sub rows, full unit accounting, and a coarse restart undo; keep collapse/split/check-in flows intact.
- **Design decisions captured (owner, 2026-06-12):**
  - Sets are **physically bundled with ONE tag** (candle boxes for churches, priced independently); the whole process must be accounted for — expected counts rewrite to the new unit of measure.
  - **Break apart** N of Q units × X subitems; **Make set** K sets × S units. Full quantity + nothing checked in → in-place rewrite ("the row can stay as one"); partial → **sub row** on the same manifest line.
  - Sub-row standard format: fresh internal `row_number` (per-PO unique constraint), display label **`#12.1`** via `split_parent`/`split_seq`; searching the parent number finds the family.
  - **Undo = Restart row** (v1, all-or-nothing): deletes ALL family Items/batches/sub rows + transform-created Products (only when unreferenced — qualified from owner's "deletes ALL"), restores root from a **first-transform snapshot** (not staging — purged monthly). Two-step confirm listing on-shelf SKUs to pull; blocked on sold/cart-referenced items.
- **Implemented:**
  - **Migration `0060`** — `ProcessingRow.split_parent` (self-FK CASCADE) / `split_seq` / `units_per_item` / `transforms` (audit list) / `original_snapshot`; **`Item.unit_count`** (default 1).
  - **`services/processing_transforms.py`** — `processing_break_apart_row` / `processing_make_set_row` (guards: original manifest-backed rows only, not collapsed, units ≤ un-checked-in; price/retail scaling; `product_mode` keep/existing/new — new = second Level-3 exception) + `processing_restart_row` (two-step confirm; family-wide reset; `_product_safe_to_delete` reference checks). Endpoints: `POST …/processing-break-apart-row/` / `…/processing-make-set-row/` / `…/processing-restart-row/`.
  - **Family-aware attribution** — `split_family_attribution` + `attributed_items_for_processing_row` (claim via check-in batches; unclaimed → root): denorm refresh, row detail, `_mixed_product_row_distinct_count`, assign-shared-product checks; `push_shelf_price_to_bookmark` pinned by `processing_row_id`/`item_id` so sibling check-ins never overwrite each other's shelf price. Check-in stamps `Item.unit_count = row.units_per_item`. Collapse ⟂ split guards both directions.
  - **Workspace payloads** — list/patch rows carry `splitParentId`/`splitSeq`/`splitParentRowNumber`/`unitsPerItem`; detail adds `transforms` + `splitFamily` (+`canRestart`); items expose `unit_count`; queue shows `12.1` row numbers and `↳ … (from #12)` titles.
  - **Frontend** — `ProcessingTransformDialogs.tsx` (one dialog body for both ops: live math, in-place vs sub-row preview, product keep/existing/new, optional price; restart confirm dialog with deletion summary + pull-tags SKU list); row detail gains **Break apart… / Make set…** (managers, original rows) + set-of-N chip + family/sub-row alerts with **Restart row…**; hooks `useProcessingBreakApartRow`/`useProcessingMakeSetRow`/`useProcessingRestartRow`.
- **Verification:** `test_processing_transforms.py` (18 tests: plates whole/partial, candles partial + unit_count stamp + rollups 10,004, product_mode new, sub-row/collapse guards both ways, sibling attribution isolation, price-push scoping, restart confirm/execute/sold-block/cart-block/kept-product/no-transforms); full inventory suite **299 green**; frontend tsc + **85 tests green**.
- **Result:** **Done — P9 gate met.** Plates (10×500 → 5,000) and candles (12,000 → 10,000 singles + 4 boxes of 500) work end-to-end with honest unit accounting and a one-click family restart. Docs: CHANGELOG `[Unreleased]`, design doc §7.5, `inventory-pipeline.md`.

### Remaining high-level work

- **Processing workspace UX:** add item/line directly in `/inventory/processing/:id`; improve row/item/product editing; show/manage checked-in Items cleanly; polish expected/checked-in/remaining/overage display.
- **Richer processing search:** expand matching across checked-in Item SKU, Product number/model/UPC, manifest identifiers, and staff-friendly shortcuts while keeping `ProcessingRow.search_string` fast.
- **Legacy path retirement:** decide old-order migration strategy, then remove or hide **Create Processing Data** once old/bookmark-only orders are handled.
- **Old/in-flight order migration:** use `classify_intake_redesign_orders` output to decide which POs can be repaired/migrated and which should remain locked history.
- **PO ownership policy:** later create/use explicit catch-all orders for unknown/manual/owner-provided inventory and backfill null `Item.purchase_order_id` only after owner approves.
- **Rollups/reporting:** build order-level expected vs received vs checked-in vs sold/lost/disputed/restoration rollups from Manifest/Processing/Item state; continue auditing raw SQL for Product/Manifest ownership assumptions.
- **Preprocessing cleanup:** reduce long-term dependence on transitional `standard_*` fields once ManifestRow-standard reads are fully proven.
- **Product workflow:** add fast prior-product search/copy/fork UX, conservative merge/cleanup workflow, and clearer handling for product-vs-item variations.

---

## See also

- **Landmark design:** [`.ai/reference/product_identity/product_identity_design.md`](../reference/product_identity/product_identity_design.md)
- **Session 4 handoff (P2, shipped):** [`session_4_handoff_questions.md`](../reference/product_identity/session_4_handoff_questions.md)
- **Session 5 handoff (P3):** [`session_5_questions.md`](../reference/product_identity/session_5_questions.md)
- **Session 6 handoff (P4):** [`session_6_questions.md`](../reference/product_identity/session_6_questions.md)
- **Session 7 handoff (P5):** [`session_7_questions.md`](../reference/product_identity/session_7_questions.md)
- **Session 8 handoff (P6, prep):** [`session_8_questions.md`](../reference/product_identity/session_8_questions.md)
- Field matrix: [`.ai/reference/item_product_creation_fields.md`](../reference/item_product_creation_fields.md)
- Shipped pipeline: [`order_processing_pipeline_rebuild`](./_archived/_completed/order_processing_pipeline_rebuild.md)
- Domain reference: [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- Processing UI redesign demos: [`.ai/reference/processing_workspace/README.md`](../reference/processing_workspace/README.md)
- Frontend: [`frontend/src/pages/inventory/processing/`](../../frontend/src/pages/inventory/processing/)
- Search builder: [`apps/inventory/services/processing_search_string.py`](../../apps/inventory/services/processing_search_string.py)
- Prior add-item initiative (global dialog): [`add_item_dialog_and_sources`](./_archived/_completed/add_item_dialog_and_sources.md)
