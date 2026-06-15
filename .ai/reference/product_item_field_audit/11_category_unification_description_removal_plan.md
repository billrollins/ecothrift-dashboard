# 11 — Category Unification + Product Description Removal Plan

**Purpose:** reset the category and Product description portions of the Product/Item cleanup. This supersedes any earlier plan text that allowed `Product.description`, `Product.category_ref`, a Product category string, or multiple canonical category systems.

## Owner Direction

- Categories have one purpose: Product categories.
- There is one canonical category set: the 19 existing `TAXONOMY_V1_CATEGORY_NAMES`.
- `inventory.Category` is the database table for that canonical set.
- `Product.category` is a foreign key to `inventory.Category`.
- `Product.category_ref` is removed.
- Product flat string category is removed.
- Item category is derived from `item.product.category`; Item does not own category.
- Manifest/source taxonomy can still contain vendor-specific values, but after AI cleanup all reviewed/processing/product category values must resolve to one of the 19 `inventory.Category` rows.
- `Product.description` is removed everywhere. No fallback, compatibility shim, hidden field, prompt input, serializer field, frontend type, or UI field remains.

## Final Category Target

### Canonical Category Table

`inventory.Category` becomes the single category owner.

Required shape:

- Exactly 19 active rows matching `TAXONOMY_V1_CATEGORY_NAMES`.
- No parent/child hierarchy in the canonical target.
- `Category.name` values match the 19 taxonomy strings exactly.
- Existing `Category.slug` may remain as a derived implementation detail if still useful.
- `Category.spec_template` must be reviewed. If retained, it must attach only to one of the 19 canonical rows.

Canonical values:

- `Kitchen & dining`
- `Furniture`
- `Outdoor & patio furniture`
- `Home décor & lighting`
- `Household & cleaning`
- `Bedding & bath`
- `Storage & organization`
- `Toys & games`
- `Sports & outdoors`
- `Tools & hardware`
- `Office & school supplies`
- `Electronics`
- `Baby & kids`
- `Health, beauty & personal care`
- `Apparel & accessories`
- `Books & media`
- `Pet supplies`
- `Party, seasonal & novelty`
- `Mixed lots & uncategorized`

### Model Ownership

| Model | Target |
|-------|--------|
| `Category` | The 19 canonical Product category rows. |
| `Product.category` | Required FK to `Category`. This replaces both old Product string `category` and old `category_ref`. |
| `Item.category` | No owned field. Read/display through `Item.product.category`. |
| `ManifestRow.taxonomy` | Source/vendor category-like JSON only. It can contain arbitrary vendor values. |
| `PreprocessingRow.ai_category` | Canonical `Category` selected from the 19 rows after AI cleanup. |
| `PreprocessingRow.final_category` | Staff-reviewed canonical `Category` from the 19 rows. |
| `ProcessingRow.category` | Canonical `Category` from `PreprocessingRow.final_category`. |

Implementation may temporarily add new FK columns during migration, but the final model names must not preserve legacy names like `category_ref`.

## Final Description Target

Product has no description.

Remove all Product description surfaces:

- `Product.description` model field.
- Product serializer/API fields.
- Product create/update payload handling.
- Product modal/state/type fields.
- Product AI suggest context or prompt wording.
- Product display/search fallbacks.
- Product imports/backfills/management commands.
- Tests and fixtures that set or assert Product description.

Remove broader canonical description lineage:

- `ManifestRow.description` as a canonical field.
- `PreprocessingRow.standard_description`.
- `PreprocessingRow.ai_description`.
- `PreprocessingRow.final_description`.
- `ProcessingRow.description`.
- Any serializer/API/frontend type fields for those removed description columns.
- Any prompt instruction that asks AI to create description/catalog copy for Product or processing identity.

Allowed replacements:

- Product identity: `title`, `brand`, `model`, `category`, `identifiers`, `specifications`, `tags`.
- Item/row notes: `notes`.
- Source/vendor long text that is not title: map to `ManifestRow.notes` or `ManifestRow.specifications` only when it is actually note/spec content.
- Template Formula must produce `ManifestRow.title` for identity.

Do not keep a read-only `description`, `legacy_description`, or compatibility alias.

## Migration Strategy

### Step 1 — Freeze Canonical Category Seed

Create a migration or management-safe data step that makes `inventory.Category` match the 19 canonical names.

Rules:

- Create any missing 19 rows.
- Normalize names to exact taxonomy spelling.
- Remove or archive parent/child relationships from the target data model.
- For existing non-19 categories, map each to one of the 19 canonical categories before deleting/merging.
- `Mixed lots & uncategorized` is the default for unmappable historical data.

Required mapping inputs:

- Existing `inventory.Category` rows.
- Existing `Product.category` strings.
- Existing `Product.category_ref` rows.
- Existing `Item.category` strings if the column exists.
- Existing `ProcessingRow.category` strings.
- Existing `PreprocessingRow.ai_category` / `final_category` strings.
- Existing source taxonomy remains on `ManifestRow.taxonomy` and does not need to map unless it has already become a canonical stage value.

Output:

- A deterministic mapping table in the migration or a checked-in helper, not ad hoc runtime guesses.
- Logged counts by source category, target category, and unmapped/defaulted category.

### Step 2 — Add Canonical FK Columns Where Needed

Add temporary FK columns only where needed to migrate safely.

Likely temporary fields:

- `Product.category_new` FK to `Category`.
- `PreprocessingRow.ai_category_new` FK to `Category`.
- `PreprocessingRow.final_category_new` FK to `Category`.
- `ProcessingRow.category_new` FK to `Category`.

Backfill these from existing strings / `category_ref` using the deterministic mapping from Step 1.

Checks:

- Every Product has `category_new_id`.
- Every finalized/processing category that is required by active workflows has a mapped Category FK.
- No Product uses a category outside the 19 canonical rows.

### Step 3 — Rewrite Code To FK Category

Before dropping old columns, update all active app code:

- Product model code uses `Product.category` as FK.
- Product serializers expose `category` as the Category ID/write field and include read-only display fields as needed, such as `category_name`.
- Product create/update accepts only canonical Category IDs or exact 19-name inputs that are immediately resolved to FK.
- Product AI suggest receives allowed categories from `inventory.Category` seeded with the 19 rows.
- Product AI suggest returns category text from the 19 names and backend/frontend map it to `Category`.
- Item serializers/viewsets expose Product-backed category display from `item.product.category`.
- Item create/update never writes category directly.
- Processing finalization/check-in writes canonical Category FK into Product, not a string.
- Buying/webstore/category stats use `Category` rows or the same 19-name source, not a separate constant list that can drift.

### Step 4 — Remove Product Description Code

Rewrite all active code to stop reading or writing Product description and processing description lineage.

Required removals:

- Backend models, serializers, views, services, prompts, imports, backfills, admin, tests.
- Frontend API/types, Product modal, product helpers, AI suggest state/context, tests.
- Processing and preprocessing surfaces.
- Search/display fallbacks that use description.

Before dropping DB columns, grep app code for:

- `Product.description`
- `.description`
- `description:` in Product/Processing DTOs
- `standard_description`
- `ai_description`
- `final_description`
- `ProcessingRow.description`
- `ManifestRow.description`

Each match must be either removed, clearly unrelated to Product/manifest/processing identity, or a historical migration.

### Step 5 — Rename / Drop Category Columns

After code reads the new FK columns:

Product:

- Drop old Product string `category`.
- Drop old Product `category_ref`.
- Rename `category_new` to `category`.
- Make `Product.category` non-null.

Preprocessing/Processing:

- Drop old string category columns after callers use FK fields.
- Rename FK columns to the final field names if those models keep category columns.
- If a serializer exposes category names, compute them from FK rows.

Item:

- Drop Item category column if it exists.
- Keep only Product-backed category read fields if the API needs them.

Category:

- Remove hierarchy behavior from active code if parent/child is no longer part of the target.
- Remove or rewrite `seed_categories` so it seeds the 19 canonical rows only.
- Remove categorizer rules that create arbitrary Category rows.

### Step 6 — Drop Description Columns

Drop after app-code grep and tests are clean:

- `Product.description`
- `ManifestRow.description`
- `PreprocessingRow.standard_description`
- `PreprocessingRow.ai_description`
- `PreprocessingRow.final_description`
- `ProcessingRow.description`

No replacement compatibility columns are allowed.

### Step 7 — Retire Duplicate Taxonomy Constants Or Make Them DB-Backed

`TAXONOMY_V1_CATEGORY_NAMES` can remain only as the seed/source list for the 19 `Category` rows, or be replaced by a DB-backed helper.

Final rule:

- Runtime category choices come from `inventory.Category`.
- If `TAXONOMY_V1_CATEGORY_NAMES` remains, tests must prove it exactly matches `Category` seed data.
- No UI/API/AI prompt may use a divergent category list.

## Backend Implementation Areas

Audit and update:

- `apps/inventory/models.py`
- `apps/inventory/serializers.py`
- `apps/inventory/views.py`
- `apps/inventory/services/manual_item.py`
- `apps/inventory/services/categorizer.py`
- `apps/inventory/services/ai_cleanup.py`
- `apps/inventory/services/product_matching.py`
- `apps/inventory/services/processing_workspace.py`
- `apps/inventory/services/processing_transforms.py`
- `apps/inventory/processing_ops.py`
- management commands including `seed_categories`
- buying category stats/services that assume taxonomy constants
- webstore category helpers
- admin registrations and search fields

## Frontend Implementation Areas

Audit and update:

- `frontend/src/types/inventory.types.ts`
- `frontend/src/api/inventory.api.ts`
- `frontend/src/pages/inventory/manage/ProductManageDrawer.tsx`
- `frontend/src/pages/inventory/ManageProductsPage.tsx`
- Product search/autocomplete/display helpers
- Item table/form pages that show category
- processing/preprocessing pages and DTOs
- AI cleanup/suggest UI state
- tests and fixtures with category or description fields

## Verification

### Data Checks

- `inventory_category` has exactly 19 canonical names.
- No Category names outside the 19 remain active.
- Every Product has non-null `category_id`.
- No Product category FK points outside the 19 rows.
- No Item has an owned category column/value in the final schema.
- No finalized preprocessing or processing category points outside the 19 rows.
- No Product/ManifestRow/PreprocessingRow/ProcessingRow description columns remain in the final schema.

### Grep Checks

Exclude historical migrations and this planning folder.

Category:

- `category_ref`
- `Product.category` string assumptions
- `product__category` string filters that should now join FK/name
- `Item.category` owned writes
- `TAXONOMY_V1_CATEGORY_NAMES` runtime choices outside seed/tests
- `seed_categories` hierarchy/keyword seeding

Description:

- `Product.description`
- `ManifestRow.description`
- `standard_description`
- `ai_description`
- `final_description`
- `ProcessingRow.description`
- Product/processing `description` DTO/type fields

### Test Coverage

Add or update tests proving:

- Category seed creates exactly the 19 canonical rows.
- Existing Category/Product/Processing category values migrate to one of the 19.
- Product create/update requires a canonical Category FK.
- Product AI suggest only accepts/returns one of the 19 category names.
- Item category display is Product-backed.
- AI cleanup maps arbitrary source taxonomy to one canonical Category.
- Product description is absent from serializers, API types, UI state, and prompts.
- Migrations remove description columns and old category columns.

## Done Criteria

- One canonical category source exists at runtime: `inventory.Category`.
- `inventory.Category` contains the 19 names from the prior taxonomy v1 list.
- Product has exactly one category field: `category` FK to `inventory.Category`.
- Item category is Product-backed only.
- Manifest source taxonomy remains source JSON only.
- Preprocessing/Processing/Product category values are canonical Category references.
- Product description and canonical description lineage are fully removed.
- Grep checks are clean outside historical migrations and planning docs.
