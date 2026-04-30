# Preprocessing UI/UX — Standardize & full wizard

Reference for staff-facing **`/inventory/preprocessing/:id`** as implemented in `frontend/src/pages/inventory/PreprocessingPage.tsx` and child components (**2026-04-29**; app **`v2.20.0`** area).

## Scope

**CHANGELOG [2.20.0]** reframed preprocessing as a **3-step wizard**: *Standardize Manifest → AI Cleanup → Manual Review*. The cluster **templates, AI suggest, formulas, preview** lives in **Step 1 (Standardize Manifest)**.

There is a hook **`usePreviewStandardize`** (`frontend/src/hooks/useInventory.ts`) for a live **`preview-standardize`** API, but **the current page does not use it**. Preview data loads **after** a successful **Standardize** via **`getPreprocessingReview`**.

## Global chrome and routing

- **Page header** (`PageHeader`): title **“Preprocessing”**, subtitle **`Order #… — {vendor_name}`**, action **“Back to Order”** → order detail.
- **`lastPreprocessOrderId`** in `localStorage` so **`/inventory/preprocessing`** (no id) can redirect to the last order.
- **No manifest on the PO:** info `Alert`: upload/replace CSV under **Raw Manifest** on the order detail, with an inline button navigating there.
- **With manifest:** the wizard UI below is shown.

## Step breadcrumb / stepper (chips)

Three chips: **“1. Standardize Manifest”**, **“2. AI Cleanup”**, **“3. Manual Review”** (`STEPS` in `PreprocessingPage.tsx`).

### Visual states (`getStepState`)

| State | Meaning | Chip styling |
|--------|---------|----------------|
| **selected** | Active step | Primary, filled, bold label |
| **done** | `index <= completedStep` | Success, filled, checkmark icon |
| **ready** | Next step after last completed | Info, filled, infinite pulse box-shadow |
| **notReady** | Future step | Default, outlined, reduced opacity, not clickable |

**Interaction:** Only steps with **`index <= completedStep + 1`** are clickable; click sets `activeStep`.

**Extra chip (step 3 only):** On Manual Review, with an active preprocessing session, **`missingPriceCount === 0`**, `completedStep < 2`, and `standardizedRowCount > 0`, a success chip **“All rows priced”** with a lock icon.

**Backend-driven navigation:** On first load for an order, `activeStep` is set to **`min(completedStep + 1, 2)`**.

## Step 1 — Standardize Manifest (templates, formulas, AI, preview)

### Top action bar (`step1State`)

- **`clear`:** Not standardized, no formulas filled → no primary Standardize button from this state.
- **`partial`:** Formulas started but not both mandatory fields (**Description**, **Retail Cost**).
- **`ready`:** Not yet standardized, mandatory formulas present → contained **“Standardize”**.
- **`done`:** Standardized and formulas match post-success snapshot (`standardizedFormulasRef`).
- **`edited`:** After standardize, formulas changed but still have mandatory mappings → **“Re-standardize”**.
- **`edited_partial`:** After standardize, edits dropped mandatory coverage → **Undo** may still show; no re-standardize until requirements met.

**Buttons:**

1. **Standardize / Re-standardize** — `process-manifest` with `template_id`, `column_mappings`, **`save_template: true`**, optional `template_name`. Blocked while raw manifest fetch is loading. Validations: snackbars if **Description** or **Retail Cost** formula empty. If `completedStep >= 1`: `confirm` warns about rebuilding rows and non-terminal generated Products/Items. On success: snackbar with row count, snapshot formulas ref, **`loadSavedPreview()`** (opens preview), **`activeStep → 1`**.

2. **Undo** — Outlined warning + delete icon (spinner while pending). `confirm` lists deletions. Calls clear-manifest-rows API.

**Success alert:** If `completedStep >= 0`, green **“Standardization complete — N row(s) created.”**

### Template metadata (read-only)

Caption: **`Template: {name}`** and/or **`Header key: {signature}`** when present — from manifest rows API (`template_id`, `template_name`, `template_mappings`). Separate admin entry: sidebar **`/inventory/templates`** (splash).

### Raw column reference (collapsible)

- **“Show/Hide Raw Column Reference (N columns)”** with expand/collapse chevron.
- Sticky small table: **Row** (`row_number`), then every raw CSV header; up to **5 sample rows** from fetch (`limit: 100`, display slice).

### Formula toolbar

- **Clear Formulas** — If `step1State !== 'clear'`: clears every standard field formula to `''`.
- **Cancel Edits** — If `edited` or `edited_partial`: restores `standardizedFormulasRef` snapshot.
- **Use AI** — Outlined, AutoAwesome icon; pending: small `CircularProgress`, **“AI analyzing…”**; disabled if no headers. **`suggest-formulas`** with optional `template_id`. Populates formulas + `aiReasonings` tooltips; snackbar on success/failure.

### Formula grid — `StandardManifestBuilder`

- Bordered `Table`, sticky header: **Standard Field** | **Formula Expression**.
- Fields from API `standard_columns` or fallback in `useStandardManifest.ts`: Quantity, Description (required), Title, Brand, Model, Category, Condition, Retail Cost (`retail_value`), UPC, Vendor Item #, Notes — label, caption = `key`, `*` if required.
- **AI reasoning:** Small **“AI”** info chip + tooltip when `reasoning` exists for that field.
- **Formula `TextField`:** monospace, placeholder `TITLE([first header])`.
- **Inline suggestions** (focused, formula non-empty): inside `[`, suggests `[Header]` matches; else suggests `UPPER`, `LOWER`, `TITLE`, `TRIM`, `REPLACE`, `CONCAT`, `LEFT`, `RIGHT` by prefix. Floating list (max 10), mousedown select.

**Initial formulas** (`useStandardManifest`): From saved template (formula string or legacy `source` + `transforms`), else alias heuristics (`SOURCE_ALIASES`) → `[header]`.

### Standardization preview — `StandardManifestPreview`

- Toggle: **Show/Hide Standardization Preview**; spinner beside label while `loadSavedPreview` runs.
- Caption: **“Preview loads once after Standardize saves staged rows.”**
- **`loadSavedPreview`:** `getPreprocessingReview(orderId, { page: 1, page_size: 100 })`, opens preview.
- Empty: **“No preview rows yet…”**
- With rows: caption with counts + file total; table: Row + standard columns; `maxHeight` 400px, sticky header.

## Step 2 — AI Cleanup (`RowProcessingPanel`)

**Success alert:** If `completedStep >= 1`: **“AI Cleanup complete — all N row(s) cleaned.”**

**Offline Cleanup CSV** `Paper`:

- Copy: download source rows, local AI cleanup, upload strict CSV: `row_id, ai_title, ai_brand, ai_model, category, condition, proposed_price`; full-file validation before apply.
- **Download Cleanup CSV** / **Upload Completed CSV** (hidden file input, `accept=".csv,text/csv"`).
- Chips: standardized row count; imported/cleaned count.
- Status/error `Alert`s, `LinearProgress` while busy.
- **Upload log:** grey `Paper`, newest-first lines (cap 50), color by level.

**Gap:** `PreprocessingPage` passes **`onClearCleanup`** / **`isClearingCleanup`** to `RowProcessingPanel`, but the component **does not use them** — no **Clear AI cleanup** button in UI.

## Step 3 — Manual Review (`PreprocessingReviewTable`)

Runs when **`hasActivePreprocessingSession`** and `activeStep === 2`.

**Success alert:** If `completedStep >= 2` and session active: **“Manual review complete — all staged rows are priced.”**

### Summary chips

Paid, Ideal, Set, % vs ideal, units, missing price, unsaved rows.

### Control strip

Search (debounced in parent 300ms), **Missing Price** toggle, Select Visible / Clear Select, bulk **±10%** vs ideal, **Visible = Ideal**, **Save Changes** (dirty rows).

### Table

Checkbox, #, Description (+ UPC/vendor caption), Title/AI field + **Apply** for AI suggestions, Brand, Model, Category, Condition select, Retail/Base/Ideal read-only, Price (+ per-row ±10%), Vs Ideal chip. Price `onBlur` saves that row.

**Pagination:** 25 / 50 / 100; page 1-based in API.

### Finalize

Warning if drafts unsaved. **Finalize and Open Processing** → `/inventory/processing?order={id}`.

### Alternate states

- Canonical processing queue exists, no staging: info alert + **Open Processing**.
- Else: **Standardize the manifest first…**

## Loading and errors

- `LoadingScreen` until status + order; `activeStep === null` until derived.
- Missing order: **“Order not found.”**
- Snackbars for API failures; `detail` when present.

## Source files

- `frontend/src/pages/inventory/PreprocessingPage.tsx`
- `frontend/src/components/inventory/StandardManifestBuilder.tsx`
- `frontend/src/components/inventory/StandardManifestPreview.tsx`
- `frontend/src/hooks/useStandardManifest.ts`
- `frontend/src/components/inventory/RowProcessingPanel.tsx`
- `frontend/src/components/inventory/PreprocessingReviewTable.tsx`
