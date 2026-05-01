# Preprocessing UI/UX - v2.21 Design Spec

Reference for staff-facing **`/inventory/preprocessing/:id`** targeting **v2.21.0**. Companion mockup: `preprocessing-mockup.jsx`. Companion translation guide: `coder_instructions.md`. This spec replaces `preprocessing_page_v2.20_legacy.md`.

**Step 3 label:** The shipped app stepper uses **Final Review**; this spec and companion mockups may still say **Manual Review** for the same step.

> **Note to coder:** Ignore sidebar/navbar colors in the mockup. We are not changing global nav styling. Focus on the preprocessing content area only. See `coder_instructions.md` for MUI translation rules. We are not changing global nav styling. Focus on the preprocessing content area only. See `coder_instructions.md` for MUI translation rules.

---

## Scope of Changes from v2.20

1. **Page header:** Order selector dropdown replaces static order text. "Back to Order" as bordered button on right. No user avatar (already in global nav).
2. **Stepper:** Now holds the primary action button for each step on the right side (Standardize, Run Cleanup, Finalize).
3. **Step 1 (Standardize Manifest):** Major rework. Clear Formulas + Use AI moved to card header. Template row matches coder's horizontal layout. Formula Preview replaces Standardization Preview (runs formulas against manifest sample JSON, not preprocessing_rows).
4. **Step 2 (AI Cleanup):** Upload now validates only. New "Run Cleanup" button in stepper applies changes to preprocessing_rows.
5. **Step 3 (Manual Review):** All rows loaded in memory, client-side pagination/filter, dirty tracking with auto-save, +/-10% compounds on current price, added "Reset to AI" button. Finalize button in stepper (no separate finalize bar).

---

## Page Header

**Layout:** Horizontal bar, white bg, `border-bottom: 1px solid #DDD5C9`, `padding: 14px 24px`.

**Left side:**
- Page title: **"Preprocessing"** (18px, 700, `#1B4332`)
- **Order selector dropdown:** Button showing `{order_id} - {vendor_name}`, bordered (`1px solid #DDD5C9`, rounded 6px). Click opens a dropdown menu listing all orders in preprocessing state. Each item shows order number (bold), status badge (amber for "preprocessing", green for "standardized"), vendor name, and unit count. Active order highlighted with `bg: #F0F7F4` and left green border.

**Right side:**
- **Stats:** "{N} units" and "Est. {retailEst}" in grey 13px
- **Back to Order:** Bordered button (`1px solid #DDD5C9`, rounded 6px, 12px, `#2D6A4F`). Navigates to order detail page.

**No user avatar.** The global dashboard header already shows the user.

**Routing:**
- `/inventory/preprocessing` (no ID): auto-selects first order needing preprocessing, or falls back to `lastPreprocessOrderId` from localStorage
- `/inventory/preprocessing/:id`: loads that order
- Switching orders via dropdown updates the URL and swaps content without full page navigation

---

## Stepper (chips + action button)

**Layout:** Horizontal bar, white bg, `border-bottom: 2px solid #DDD5C9`, `padding: 10px 24px`. Step chips on the left, action button + hint on the right.

### Step Chips

Three chips: **"1. Standardize Manifest"** | **"2. AI Cleanup"** | **"3. Manual Review"**

| State | Meaning | Styling |
|---|---|---|
| **selected** | Active step | `bg: #2D6A4F`, `color: #fff`, bold, `border: 2px solid #2D6A4F` |
| **done** | `index <= completedStep` | `bg: #52B788`, `color: #fff`, checkmark prefix "✓", `border: 2px solid #52B788` |
| **ready** | `index === completedStep + 1` | `bg: #E3F2FD`, `color: #1565C0`, `border: 2px solid #90CAF9`, infinite pulse animation |
| **notReady** | Future step | `bg: transparent`, `color: #aaa`, `border: 2px solid #ddd`, `opacity: 0.5`, not clickable |

Only steps where `index <= completedStep + 1` are clickable. On first load: `activeStep = min(completedStep + 1, 2)`.

### Action Button (right side of stepper, changes per step)

| Active Step | Condition | What Shows |
|---|---|---|
| Step 1 | Formulas not ready | Amber hint: "Fill required fields (Description, Retail Cost) to standardize" |
| Step 1 | Ready (desc + retail filled, not done) | **Standardize** (primary green) |
| Step 1 | Done | **🗑 Undo** (outlined red) + **Re-standardize** (primary green) |
| Step 2 | CSV not uploaded | Nothing |
| Step 2 | CSV uploaded and validated | **Run Cleanup** (primary green) |
| Step 2 | Cleanup already run | Nothing (step shows as done) |
| Step 3 | Always | **Finalize and Open Processing →** (primary green). Disabled if `missingPriceCount > 0` or `dirtyCount > 0`. |

---

## Step 1 - Standardize Manifest

### Success Alert

When `completedStep >= 0`: Green alert bar. `bg: #E8F5EE`, `border: 1px solid #A3D9BB`, rounded 8px. Text: **"✓ Standardization complete"** (bold) + " - N preprocessing row(s) created."

### Formula Mappings Card

Single white card. Contains: card header, template row, formula grid.

#### Card Header

- **Left:** "Formula Mappings" (16px, 700, `#1B4332`)
- **Right:** "Clear Formulas" (red text button, visible when formulas exist and not done) + "✦ Use AI" (outlined green button). AI loading state: spinner + "AI analyzing..."

#### Template Row

Horizontal row inside the card, below header. `bg: #FAFAF6`, `border: 1px solid #EDE8E0`, rounded 6px, `padding: 8px 14px`, `margin-bottom: 14px`.

**Left side:**
- Label: "Template:" (13px, `#555`, 500)
- `<select>` dropdown (min-width 200px) showing matched template name or "No matching templates"
- Status text in italic grey: "No saved template match" or template match info

**Right side:**
- Field count badge: "{N} fields" (`bg: #EDE8E0`, 11px, rounded 12px)
- Header key in monospace: "Header key: {hash}" (11px, `#999`)

**Data source:** Templates from `matching_templates` embedded in the `manifest-rows` API response (matched on vendor + header signature).

#### Formula Grid Table

Three columns inside the card, below template row.

| Column | Width | Content |
|---|---|---|
| **Standard Field** | 150px | Field label (bold, 13px, `#1B4332`), required fields get red `*`. Below: field key in monospace (10px, `#aaa`). AI reasoning chip when present. |
| **Formula Expression** | flex | Monospace input (`Fira Code`). Placeholder: `e.g. TITLE([Column Name])`. Required empty fields get warm border `#e8c4a0`. When done: `bg: #f5f5f5`, disabled. |
| **Sample Result (Row 1)** | 200px | Runs formula against first manifest sample row. Output: `bg: #F0F7F4`, rounded 4px, 12px, `#2D6A4F`. Empty: "--" italic `#ccc`. |

**Standard fields** (in order): Quantity*, Description*, Title, Brand, Model, Category, Condition, Retail Cost*, UPC, Vendor Item #, Notes.

**Sample result data source:** `Order.manifest_sample` JSON (stored on the Order model). Row 1 of this sample is used. This is NOT from the CSV on AWS and NOT from preprocessing_rows. The sample is available immediately without any API call beyond the initial order load.

**AI reasoning chip:** "AI" badge (9px bold, `bg: #E3F2FD`, `color: #1565C0`) with tooltip on hover. Present after AI suggest runs.

**Inline autocomplete:** Typing `[` suggests raw header names. Typing function names suggests UPPER, LOWER, TITLE, TRIM, REPLACE, CONCAT, LEFT, RIGHT. Max 8 suggestions, mousedown to select.

**Formula Change Protection:** Modifying a formula from a saved template (when `savedFormulas` exists and `isCustom` is false) triggers the "Create New Template?" modal. Does not fire once `isCustom` is true.

### Raw Column Reference (collapsible)

Separate card below Formula Mappings. Collapsed by default.

- **Header:** "▸ Raw Column Reference (N columns)". Badge: "Manifest sample - N rows"
- **Content:** Table with one column per raw header, showing all manifest sample rows from `Order.manifest_sample`
- **Data source:** Same `Order.manifest_sample` JSON. These are the preview rows sampled from the raw manifest and stored on the Order model. The CSV on AWS is never touched here.

### Formula Preview (collapsible)

Separate card below Raw Column Reference. Collapsed by default.

- **Header:** "▸ Formula Preview". Badge: "N sample rows". Refresh button (↻) when expanded.
- **Caption:** "Applies current formulas to the manifest sample stored on the order. No data is saved."
- **Content:** Table transposed into standard columns. Only columns with mapped formulas are shown. Each row is a manifest sample row run through all current formulas.
- **Data source:** Client-side computation. Takes ALL rows from `Order.manifest_sample` and runs each formula against each row using the same `simulateFormula` logic as the Sample Result column. This is the full-sample version of what the Sample Result column shows for row 1 only.
- **Refresh:** Recalculates on expand click or manual refresh button. Does not auto-update on formula change.
- **This is NOT a preview of preprocessing_rows.** Preprocessing rows don't exist until Standardize is run. This preview uses only the Order model's stored sample data.

---

## Step 2 - AI Cleanup

### Two-Phase Flow: Upload (validate) then Run (apply)

**Phase 1: Upload.** User uploads the cleaned CSV. The system validates columns and row matching against existing preprocessing rows. No data is written to the database. Validation results appear in the upload log and status chips.

**Phase 2: Run Cleanup.** User clicks "Run Cleanup" in the stepper toolbar. This applies the validated CSV data to preprocessing_rows (writing into `ai_` prefixed columns). Only available after successful validation.

### Success Alert

When cleanup has been run: Green alert. "✓ AI Cleanup complete - N row(s) updated in preprocessing."

### Info Alert

When CSV is uploaded and validated but not yet applied: Blue alert (`bg: #E3F2FD`, `border: 1px solid #90CAF9`). "ℹ CSV validated - N rows ready. Click Run Cleanup in the toolbar to apply changes to preprocessing rows."

### Offline AI Cleanup Card

Header: "Offline AI Cleanup" (16px, 700).

Description text explaining the two-phase flow: upload validates, Run Cleanup applies. Expected columns listed in `<code>`: `row_id, ai_title, ai_brand, ai_model, category, condition, proposed_price`.

**Two-column grid:**

#### Download Panel
- Circle icon: ↓ (`bg: #F0F7F4`, `color: #2D6A4F`)
- Title: "Download Cleanup CSV"
- Filename: `{order_number}.csv` (monospace, green bg)
- Info chip: "{N} rows"
- Primary button: "Download CSV"

#### Upload Panel
- Circle icon: ↑ (amber when pending, green when validated)
- Title: "Upload Completed CSV"
- Filename: `{order_number}-cleaned.csv`
- Status chip: "0 imported" (amber) or "{N} validated" (green)
- Before upload: dashed drop zone. After validation: green badge "✓ Validated - Ready to Apply"

#### Upload Log
Below the grid. Monospace 11px, grey bg. Color-coded by level. Shows validation results.

---

## Step 3 - Manual Review

### Architecture (client-side pagination)

**Mount:** Single GET fetches all preprocessing rows for the order (cap 10K server-side). Show loading skeleton with row count while fetching.

**State:** All rows held in React state. Pagination, search, and filtering are client-side against the in-memory array. Only 25-50 rows render in the DOM at a time via `slice((page-1)*perPage, page*perPage)`.

**Edits:** Mutate in-memory array, flag rows as `dirty: true`. Dirty rows saved via:
1. Manual "Save Changes" button (immediate)
2. 30-second debounce after last edit (auto-save)
3. Step navigation (flush on leave)
4. Browser beforeunload (best-effort)

Only dirty rows are sent in the PATCH. Finalize sends remaining dirty rows inside the atomic transaction.

### Success Alert

When `completedStep >= 2` and `missingPriceCount === 0`: "✓ Manual review complete - all staged rows priced."

### Summary Chips Row

| Chip | Label | Value | Special Styling |
|---|---|---|---|
| Paid | PAID | `$sum(retail * qty)` | -- |
| Ideal | IDEAL | `$sum(proposed_price * qty)` | -- |
| Set | SET | `$sum(final_price * qty)` | Value `#2D6A4F` |
| % vs Ideal | % VS IDEAL | `(totalSet/totalIdeal * 100)%` | -- |
| Units | UNITS | `sum(qty)` | -- |
| Missing Price | MISSING PRICE | count with no price | Border `#e8a83e`/`#52B788`, value `#c0392b`/`#2D6A4F` |
| Unsaved | UNSAVED | dirty count | Only if >0. Border `#e8a83e`, value `#B8860B` |

### Control Strip

Horizontal bar. Contents left to right:

1. **Search input** (200px, debounced 300ms, filters by `ai_title`)
2. **Missing Price toggle** (outline/green fill)
3. Flex spacer
4. **-10% button** - `final_price * 0.9` on filtered rows. **Compounds on current price, not ideal.**
5. **+10% button** - `final_price * 1.1` on filtered rows. **Compounds on current price, not ideal.**
6. **Visible = Ideal** - sets `final_price = proposed_price` on filtered rows. Price reset only.
7. **Reset to AI** - reverts `final_price` AND all user-edited fields (`ai_title`, `ai_brand`, `ai_category`, `condition`) back to original AI cleanup values on filtered rows. Full row revert to what Step 2 produced.
8. **Save Changes (N)** - primary green, disabled when N=0

**Bulk ops apply to the current filtered set.** When no filter active, filtered set = all rows. Button labels stay as shown, no dynamic renaming.

**+/-10% compounding:** Both row-level micro buttons and bulk buttons use `final_price * 1.1` or `final_price * 0.9`. NOT `proposed_price`. Users can click +10% multiple times: $10 -> $11 -> $12.10 -> $13.31. Only "Visible = Ideal" resets to `proposed_price`.

### Review Table

Plain `<table>` (not MUI DataGrid). See `coder_instructions.md` for why.

| Column | Width | Content |
|---|---|---|
| # | 30px | Row ID, grey, 12px |
| Description / Title | flex | Line 1: original title (bold 13px). Line 2: AI title (12px, green) + Apply button |
| Brand | auto | AI brand, 13px |
| Qty | 55px center | Read-only |
| Category | auto | AI category as tag chip |
| Condition | auto | `<select>` dropdown |
| Retail | right | Original retail, grey |
| Ideal | right | `proposed_price`, green, 12px |
| Price | 120px right | `-` button, clickable price (inline edit), `+` button. Compounds at 10%. |
| vs Ideal | 72px center | % chip. Green 95-105%, red <95%, amber >105% |

Row styling: alternating `#FAFAF6`. Dirty rows `#FFFDF0`.

Client-side pagination: 25 / 50 / 100 per page. Page resets to 1 on filter change.

### Finalize

Button lives in the stepper row (not a separate bar). Triggers confirmation modal. Disabled when `missingPriceCount > 0` or `dirtyCount > 0`.

**Unsaved warning:** If dirty rows exist, show hint in stepper action area.

**Finalize modal:**
- Title: "Finalize Preprocessing"
- Body: "This will lock the manifest and move all staged rows into Processing."
- Actions: Cancel | Finalize and Open Processing
- Backend: single atomic transaction (save dirty rows, set status to finalized, create processing rows)
- On success: navigate to `/inventory/processing?order={id}`

---

## Modals Summary

| Modal | Trigger | Title | Danger? | Confirm Label |
|---|---|---|---|---|
| New Template | Formula changed on saved template | Create New Template? | No | Create New Template |
| Undo | Undo button in stepper (Step 1) | Undo Standardization | Yes (red) | Delete & Undo |
| Re-standardize | Re-standardize in stepper (Step 1) | Re-standardize Manifest | No | Re-standardize |
| Finalize | Finalize in stepper (Step 3) | Finalize Preprocessing | No | Finalize and Open Processing |

All modals: centered overlay (`rgba(0,0,0,0.5)`), white card (max-width 440px, rounded 12px, padding 32px), emoji icon, title, body, two-button footer.

---

## MUI Translation Guide

| Mockup Element | Production Approach |
|---|---|
| Order selector dropdown | MUI `Autocomplete` with custom `renderOption`. Override sizing via sx. |
| Formula grid table | Plain `<table>` with token styles. MUI Table adds too much padding. |
| Formula input fields | Plain `<input>` with `st.fInput` styles. MUI TextField doubles the height. |
| Template dropdown | MUI `Select` or plain `<select>`. Override sizing if using MUI. |
| Confirm modals | MUI `Dialog`. Override `PaperProps.sx` to match `st.modal`. |
| Step 2 file upload drop zone | Plain `<div>` with drag events + hidden `<input type="file">`. |
| Step 3 review table | Plain `<table>`. No MUI DataGrid, no virtualization. |
| Step 3 inline price edit | Plain `<input type="number">` with `st.inlineInput`. |
| Step 3 micro buttons (+/-) | Plain `<button>` with `st.microBtn` (22x22px). |
| Step 3 category/condition tags | Plain `<span>` / `<select>` with token styles. |
| Summary stat chips | Plain `<div>` with `st.sumChip`. |
| Stepper chips | Plain `<div>` with custom styling + pulse animation. |
| Toast notifications | MUI `Snackbar` via notistack (already wired). |

---

## Color Reference

| Token | Value | Usage |
|---|---|---|
| `bg-page` | `#F4F1EB` | Main content background |
| `bg-card` | `#fff` | Cards, bars, modals |
| `bg-stripe` | `#FAFAF6` | Alternating rows, template row bg |
| `border-default` | `#DDD5C9` | Card borders, input borders |
| `border-subtle` | `#EDE8E0` | Row dividers, lighter separators |
| `green-dark` | `#1B4332` | Headings, primary text |
| `green-primary` | `#2D6A4F` | Buttons, links, active states |
| `green-mid` | `#52B788` | Success/done chips |
| `green-light` | `#E8F5EE` | Success alert bg |
| `green-tint` | `#F0F7F4` | Sample result bg, icon circles |
| `amber` | `#B8860B` | Warnings, pending states |
| `amber-light` | `#FFF3E0` | Warning chip bg |
| `red` | `#c0392b` | Danger, required markers |
| `blue-chip` | `#E3F2FD` | AI chip bg, info alert bg |
| `blue-text` | `#1565C0` | AI chip text, info alert text |
| `dirty-row` | `#FFFDF0` | Unsaved row highlight |

---

## Typography

| Element | Font | Size | Weight |
|---|---|---|---|
| Page title | DM Sans | 18px | 700 |
| Card title | DM Sans | 16px | 700 |
| Table header | DM Sans | 11px uppercase | 700 |
| Body text | DM Sans | 13px | 400 |
| Formula input | Fira Code / SF Mono / Consolas | 13px | 400 |
| Field key caption | monospace | 10px | 400 |
| Chip labels | DM Sans | 10px uppercase | 700 |
| Chip values | DM Sans | 18px | 700 |

---

## Source Files (expected after implementation)

- `frontend/src/pages/inventory/PreprocessingPage.tsx`
- `frontend/src/components/inventory/preprocessing/preprocessingTokens.ts` (new)
- `frontend/src/components/inventory/preprocessing/PreprocessingStepper.tsx` (new)
- `frontend/src/components/inventory/preprocessing/StandardizeStep.tsx` (new)
- `frontend/src/components/inventory/preprocessing/FormulaMappingsTable.tsx` (new)
- `frontend/src/components/inventory/preprocessing/TemplateSelector.tsx` (new)
- `frontend/src/components/inventory/preprocessing/FormulaPreview.tsx` (new)
- `frontend/src/components/inventory/preprocessing/CleanupStep.tsx` (new)
- `frontend/src/components/inventory/preprocessing/ManualReviewStep.tsx` (new)
- `frontend/src/components/inventory/preprocessing/ConfirmModal.tsx` (new)
- `frontend/src/hooks/useStandardManifest.ts` (updated)
