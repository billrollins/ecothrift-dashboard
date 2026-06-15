<!-- initiative: slug=product-item-crud-processing status=active updated=2026-06-15 -->
<!-- Last updated: 2026-06-15 — v2.29.0 shipped catalog CRUD + category reset + product check-in -->

# Initiative: Product & Item CRUD → Processing check-in

**Status:** **Active** — direction reset 2026-06-13. Build canonical Product and Item CRUD/search UX first; wire into Processing only after those forms are right.

**Supersedes (remaining scope from):** [`intake_processing_improvements`](./_archived/_completed/intake_processing_improvements.md) — P1–P9 shipped; further processing/product UX work continues here.

---

## North star

1. **Processing queue** stays row-level only: search/filter, open row, checkbox, collapse/uncollapse.
2. **Row detail** has three sections: Row data · Products linked to row · Prior checked-in items.
3. **Product** and **Item** each get a dedicated CRUD/search page and shared form components.
4. **Check-in** becomes thin: pick/create product → create N items with item-only fields.

---

## Phases (high level — no implementation detail yet)

| Phase | Outcome |
|-------|---------|
| **1 — Product CRUD** | Staff Product page: search, create, edit. Fields aligned to target Product model. |
| **2 — Item CRUD** | Staff Item page: search, create, edit. Item form assumes product selected first; item fields only on edit. |
| **3 — Schema / field cleanup** | Audit and migrate bad field choices on `Product` and `Item` (POS, preprocessing, reports impact). **Planning pack:** [product_item_field_audit/](../reference/product_item_field_audit/README.md) (decisions, schema, lineage, code audit, migration, testing, ready-to-code gate). |
| **4 — Search-or-create form** | Reusable Product picker modal: simple token search, AI suggest, create/edit/select; used standalone and from processing. |
| **5 — Slim check-in** | Item create = quantity + condition + dispatch + price + notes after product is chosen. |
| **6 — Processing integration** | Row detail: attach products, list products from check-ins + explicit attachments, check-in uses shared forms. |

---

## Product model target (owner 2026-06-13)

**Owns:** title, brand, model, canonical category, description (manual/catalog detail only), specifications, identifiers (JSON: UPC, ASIN, item number, SKU, etc.), tags (AI-suggested/search aid; schema name TBD)

**Remove / stop using:** `default_price` (fully removed; Product has no price source), `upc` column (→ identifiers), `times_ordered`, `total_units_received` (defer). Category cleanup: `ManifestRow.taxonomy` stores source category-like fields, while `PreprocessingRow.ai_category` through `Product.category` are canonical; string-vs-FK (`category` vs `category_ref`) can be consolidated later.

**Decision:** no Product price field. Shelf/tag price lives on `ProcessingRow.shelf_price` → `Item.price`; upstream unit retail remains `Raw/MR/PR/ProcessingRow.unit_retail` while quantity exists, then becomes `Item.retail`.

---

## Item model target (owner 2026-06-13)

**Owns:** sku, product, purchase_order, manifest_row, price, retail, status, location, condition, specifications (instance), listed_at, sold_at, sold_for, notes, dispute fields

**Remove / stop using on Item:** title, brand, `unit_retail` (rename to `retail`), `unit_count` (all Items represent 1), `processing_tier`, `batch_group` (collapse lives on ProcessingRow, not Item)

**Defer:** `cost` (computed/view later; restoration spend)

---

## Product search (v1 — now)

Simple search only. No semantic embeddings yet.

- Do **not** add `product.search_string` by default.
- Query: split user input on spaces; each token must match at least one indexed Product field / JSON value / tag (AND across tokens).
- Searchable sources: `product_number`, title, brand, model, canonical category, identifiers JSON values, tags.
- Add a denormalized search string only if profiling shows indexed multi-field search is too slow.
- Fuzzy semantic similarity search is **on hold** — will replace/enhance search-or-create when ready.

---

## Search-or-create UX (v1)

1. User opens Product form/modal (from Product page, row detail, or check-in).
2. Optional: AI suggest fills fields from row context or partial input.
3. Simple search runs against indexed Product fields / identifiers / tags.
4. User selects existing, edits match, or creates new.
5. Return selected product to caller (attach to row or prefill check-in).

---

## Processing integration (after phases 1–5)

- Queue: collapse only bulk action; no assign product, group-by-product, broken/undelivered from queue.
- Row products = union of (a) products from checked-in items on row, last-used first, (b) products explicitly attached before check-in.
- Check-in dropdown: attached products + **New / search or create** → Product modal → back to check-in with selection.

---

## Caveat — future semantic search

A kick-ass **sentence-embedding similarity** search is in progress elsewhere. When ready it will likely replace v1 token search for product match. v1 ships with simple token-AND search across Product fields / identifiers / tags; design forms so the search backend can be swapped without redoing CRUD UI.

---

## Moved from prior initiative (not done)

From [`intake_processing_improvements`](./_archived/_completed/intake_processing_improvements.md) **Remaining high-level work**:

- Processing workspace UX simplification (this initiative reframes it)
- Richer processing search → **deferred** to semantic search; v1 uses Product indexed field / identifier / tag search
- Legacy **Create Processing Data** retirement
- Old/in-flight order migration
- Rollups/reporting pass
- Preprocessing layer cleanup: `ManifestRow` is the standardized row; `PreprocessingRow` has AI and final layers only
- Fast prior-product search/copy → **Product search-or-create** (phase 4)

**Session 11+ processing tweaks** (check-in edit, break apart nav, Go To buttons) — park until phase 6 unless small hotfixes.

---

## Acceptance (initiative-level)

- Product and Item CRUD pages exist and match target field ownership.
- Shared Product and Item forms are reused in processing check-in and row product attach.
- Processing queue is row-only with collapse as sole bulk action.
- Product v1 search uses token AND across Product fields, identifiers, and tags.
- Semantic search integration path documented; not blocking v1.

---

## Sessions

### 2026-06-15 — v2.29.0 catalog CRUD + product check-in

#### Result

Shipped **Manage Products** / **Manage Items** catalog pages, Product CRUD modal (AI suggest, stat cards, **Check in items**), migrations **`0061`–`0062`** (canonical categories, drop Product/description lineage), **`POST /api/inventory/products/{id}/check-in/`**, and post-create catalog search. Initiative phases 1–3 + partial phase 5 complete; phase 6 processing integration remains.

---

## See also

- Prior initiative (closed): [`intake_processing_improvements`](./_archived/_completed/intake_processing_improvements.md)
- **Field audit planning pack (Phase 3):** [`.ai/reference/product_item_field_audit/`](../reference/product_item_field_audit/README.md) — decisions, target schema, lineage, code audit, migration/backfill, implementation plan, testing, ready-to-code gate
- Long-form audit report: [`.ai/reference/product_item_field_audit.md`](../reference/product_item_field_audit.md)
- Field matrix: [`.ai/reference/item_product_creation_fields.md`](../reference/item_product_creation_fields.md)
- Landmark design (historical): [`.ai/reference/product_identity/product_identity_design.md`](../reference/product_identity/product_identity_design.md)
- Models: [`apps/inventory/models.py`](../../apps/inventory/models.py) (`Product`, `Item`)
- Existing forms: [`frontend/src/components/inventory/ItemForm.tsx`](../../frontend/src/components/inventory/ItemForm.tsx)
