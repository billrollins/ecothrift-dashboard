<!-- initiative: slug=intake-processing-improvements status=active updated=2026-06-09 -->
<!-- Last updated: 2026-06-09 (checkpoint — quick check-in + detailed check-in UX) -->

# Initiative: Intake → Processing improvements

**Status:** **Active** (Session 1, 2026-06-06).

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

- Shipped pipeline: [`order_processing_pipeline_rebuild`](./_archived/_completed/order_processing_pipeline_rebuild.md)
- Domain reference: [`.ai/extended/inventory-pipeline.md`](../extended/inventory-pipeline.md)
- Processing UI redesign demos: [`.ai/reference/processing_workspace/README.md`](../reference/processing_workspace/README.md)
- Frontend: [`frontend/src/pages/inventory/processing/`](../../frontend/src/pages/inventory/processing/)
- Search builder: [`apps/inventory/services/processing_search_string.py`](../../apps/inventory/services/processing_search_string.py)
- Prior add-item initiative (global dialog): [`add_item_dialog_and_sources`](./_archived/_completed/add_item_dialog_and_sources.md)
