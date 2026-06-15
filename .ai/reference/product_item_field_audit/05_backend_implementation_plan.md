# 05 — Backend Implementation Plan

**Purpose:** approved backend work plan for implementation.

Also keep [`10_audit_followups.md`](./10_audit_followups.md) open during implementation; it captures additional backend/frontend/migration findings from the audit passes.

## Phase A — Model Additions

### Product

- Add `identifiers = JSONField(default=dict, blank=True)`.
- Add `tags` as JSON/list.
- Replace Product category implementation with `category = ForeignKey(Category, ...)`.
- Remove Product string `category`.
- Remove Product `category_ref`.
- Remove Product `description`.
- Add indexes for search fields:
  - `product_number`
  - `title`
  - `brand`
  - `model`
  - `category` FK/name joins as needed
  - identifiers JSON values where DB support allows
  - tags where DB support allows

### ManifestRow

- Ensure `title` is the canonical standardized title field.
- Ensure `taxonomy` JSON holds source category-like fields.
- Ensure `identifiers` JSON holds source ID/tracking-like fields.
- Remove `description` target reliance and field.
- Remove separate `tracking`.

### PreprocessingRow

- Remove source-copy layer fields after callers move to `ManifestRow`.
- Keep AI/final layers for adjusted fields only.
- Stop AI/final duplication of source identifiers, taxonomy, and tracking.
- Resolve `ai_category` and `final_category` to canonical `inventory.Category` rows from the 19-name set.
- Remove `standard_description`, `ai_description`, and `final_description`.
- Move Product tag creation/suggestion to Product-owned `tags`.

### Item

- Prepare rename `unit_retail` to `retail`.
- Prepare `product` FK migration to required `PROTECT`.

## Phase B — Product Identifiers + Matching

Update Product lookup helpers:

- `manual_item.py`
- manifest product find/create helpers in `views.py`
- `product_matching.py`
- processing product resolver paths in `processing_ops.py`
- transform product resolver paths in `processing_transforms.py`

Required behavior:

- Normalize identifier keys and values through one helper.
- Match UPC through `identifiers['upc']`.
- Support additional identifiers where useful: ASIN, item number, MPN, EAN, GTIN.
- Keep Product identity match (`title + brand + model + category_id`) as a later match tier.
- Category matching uses canonical `Category` FK only.
- Never read `Product.default_price`.
- Never read `Product.description`.

Output shape:

- Product snapshots should expose `identifiers`, not flat `upc`.
- If the API needs `product_upc` for convenience, compute it from identifiers.

## Phase C — Product Search

Implement token-AND search:

- Split user search into tokens.
- For each token, match at least one Product source:
  - `product_number`
  - `title`
  - `brand`
  - `model`
  - `category.name`
  - identifiers JSON values
  - tags
- AND across tokens.

Rules:

- Keep API parameter as `search`.
- Use indexes first.
- Do not add a Product `search_string` unless measured search performance requires it.

## Phase D — Item Identity Rewrite

Update:

- `Item.rebuild_search_text()`
- Item serializers
- Item viewsets/search
- POS cart line/item query paths
- reports/stale/unpriced item views
- AI listing context and pricing services
- duplicate/resale services

Required behavior:

- Item does not write title/brand.
- Item reads Product identity when needed.
- Bulk query paths that render Product fields use `select_related('product')`.
- POS cart line description uses `item.product.title`.
- API read fields can expose `title`, `brand`, `product_title`, or `product_brand` as Product-backed fields, but not as Item-owned writes.

## Phase E — Check-In / Processing Rewrite

Update:

- `processing_ops.py`
- `processing_workspace.py`
- `processing_transforms.py`
- processing serializers/view helpers

Required behavior:

- Check-in resolves/creates/selects Product before Item creation.
- Item creation always includes Product.
- Item title/brand are not stamped.
- Item category is not stamped; Item category display reads Product category.
- Product category is assigned from canonical `ProcessingRow.category`.
- `ProcessingRow.unit_retail` writes `Item.retail`.
- `ProcessingRow.shelf_price` / check-in price writes `Item.price`.
- Check-in creates **`ItemCheckIn`** + sets **`Item.check_in`** on every item ([12_check_in_normalization](./12_check_in_normalization.md)).
- `ProcessingRow.quantity` controls how many single-unit Items are created.
- `ProcessingRow.units_per_item` and `Item.unit_count` are removed from v1 flows.

Transform behavior:

- Remove or simplify make-set/break-apart paths that depend on `units_per_item`.
- Keep collapse/uncollapse row behavior only where it does not create multi-unit Items.

## Phase F — Serializers / ViewSets

Product serializers:

- Explicitly include target Product fields.
- Remove `description`, `category_ref`, string category, `default_price`, flat `upc`, and retired stats from write surfaces.
- Expose/write Product `category` as the canonical Category FK.
- Include read-only category display fields from the FK if useful, such as `category_name`.
- Include `identifiers` and tags.
- Optionally include computed convenience fields such as `upc` only as read-only derived values during API transition if necessary for current frontend update; final target should be identifiers.

Item serializers:

- Explicitly include target Item fields.
- Rename `unit_retail` to `retail`.
- Remove `unit_count`, `processing_tier`, `batch_group`.
- Remove Item-owned `title`/`brand` writes.
- Remove Item-owned category writes.
- Include Product-backed identity read fields.

ViewSets/search:

- Rewrite category filters/search from string fields to canonical Category FK/name joins.
- Rewrite `product__upc` filters/search fields to identifier-aware search.
- Add `select_related('product')` to Item querysets that return Product-backed fields.
- Remove `BatchGroupViewSet` when no route/UI depends on it.

## Phase G — POS + Reports

POS:

- Query Items with Product joined where cart lines need Product identity.
- Replace `item.title` with Product-backed description.
- Keep labels/receipts stable from the API perspective if UI still expects text.

Reports:

- Stale/unpriced reports read Product identity.
- Product stats are recomputed in query/report if needed instead of stored fields.

## Phase H — Management Commands / Scripts

Audit and update:

- historical imports
- historical sold imports
- Product/manifest backfills
- category exports/imports
- price model training
- deployment scripts that serialize Product/Item payloads

Rules:

- Commands that write old fields must be updated or retired before column drops.
- Commands that are one-time and no longer valid should fail clearly or be removed.
- Any command that imports Item rows must attach Product.

## Phase I — Drop Retired Backend Fields

Only after tests and grep checks pass:

- Drop Product `description`, string `category`, `category_ref`, `upc`, `default_price`, stats fields.
- Drop Item `title`, `brand`, owned category if present, `unit_count`, `processing_tier`, `batch_group`.
- Drop `ProcessingRow.units_per_item`.
- Drop `ProcessingRow.description`.
- Drop `ManifestRow.description`.
- Drop `PreprocessingRow.standard_description`, `ai_description`, and `final_description`.

## Backend Done Criteria

- No backend app-code reads/writes retired Product/Item fields.
- Runtime category choices come from `inventory.Category`, which contains exactly the 19 canonical rows.
- No backend app-code reads/writes Product or processing description fields.
- Item creation cannot happen without Product.
- Product search finds by identifiers/tags.
- POS and reports use Product identity without N+1 query patterns.
- Migrations run from current DB to target DB cleanly.
