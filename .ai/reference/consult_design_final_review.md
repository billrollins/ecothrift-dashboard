# Preprocessing Final Review: Design Specification

**Page:** `/inventory/preprocessing/:orderId` (Step 3 / Final Review panel)
**Audience:** Coder implementing the rebuild. Design language reference: `.ai/extended/ux-spec.md`.
**Last updated:** 2026-05-02

**Page chrome (out of scope for this rebuild):** Stepper, order picker dropdown, Back to Order button, cream background `#F4F1EB`, page header layout. Only the Step 3 Final Review panel is being rebuilt.

---

## 1. Why this rebuild exists

The current page is doing the right work with the wrong presentation. A user reviewing 936 rows can see five rows per screen, has a horizontal scrollbar cutting off Brand and Price, sees "All rows priced" and "936 missing price" simultaneously, and cannot tell what is a filter versus a bulk action versus a stat. This document is the spec for fixing it without changing the underlying API contract.

The job to be done is fixed: turn a vendor manifest into clean, priced, canonical inventory lines. This document is about doing that job at the speed and clarity the workflow demands.

---

## 2. Mental model the page must support

When Bill or a manager opens Final Review, the questions in their head, in order, are:

1. **Am I done?** Is this ready to finalize, or is something blocking me?
2. **What is blocking me?** How many rows need a price, how many are flagged by AI, how many have I edited but not saved?
3. **Where do I look first?** Show me the problem rows.
4. **Did I just break anything?** When I edit a row, does it look right alongside the others?
5. **Can I commit and move on?**

Every layout decision below serves these questions in this order. If a piece of UI does not answer one of them, it should be collapsed, hidden, or removed.

**Terminology:** Reserve **blocker** for what **gates Finalize** (missing price, unsaved edits only). Status bar chips that surface AI-flagged rows are **issue chips** / **attention chips**; they do not block Finalize.

---

## 3. Page layout (decision-flow structure)

Per `ux-spec.md`, organize around the decision, not the data category. The Final Review panel uses four stacked zones:

```
┌───────────────────────────────────────────────────────────────┐
│  STEPPER (unchanged from current implementation)              │
├───────────────────────────────────────────────────────────────┤
│  STATUS BAR: am I done? what blocks finalize? + Finalize CTA  │
├───────────────────────────────────────────────────────────────┤
│  TOOLBAR: search, filters (left) | bulk actions (right)       │
├───────────────────────────────────────────────────────────────┤
│  REVIEW GRID: dense, virtualized, row-expand for detail       │
│  (fills remaining viewport height)                            │
├───────────────────────────────────────────────────────────────┤
│  GRID FOOTER: pagination, row count, Save Changes CTA         │
└───────────────────────────────────────────────────────────────┘
```

The grid is the workspace. It must own the majority of the viewport. Everything above it must be compressible to a single line of useful information once the user is in flow.

---

## 4. Status bar (replaces today's chip cluster)

### 4.1 The contradiction must die

The current page shows "All rows priced" next to Finalize and "936 missing price" in the chip row. That cannot ship. There is one source of truth for each piece of state, and the page reflects it consistently.

### 4.2 Layout

A single full-width row, `Card variant="outlined"`, padded `p: 1.25`. Three regions, left to right:

| Region | Content | Style |
|--------|---------|-------|
| **Left: Headline state** | Either "Ready to finalize" (success) or "N issues blocking finalize" (warning/error) with an icon (count reflects **Finalize blockers** only: missing price + unsaved) | `body1`, `fontWeight: 700`, color tied to state |
| **Center: Issue chips** | One chip per **attention** issue: missing price count, unsaved edits count, AI flagged count. Each chip is clickable and toggles the matching toolbar filter | Outlined chips with semantic color, see below |
| **Right: Finalize button** | `contained`, `primary`, disabled when **blockers** exist (missing price or unsaved only) with a tooltip explaining why | Right-aligned, large enough to be the visual anchor |

### 4.3 Issue chip rules

Each issue chip follows the same pattern:

- **Count + label** (for example: "12 missing price", "3 AI flagged", "5 unsaved")
- **Color by severity:**
  - Missing price: `error.main` border, `error.main` text, faint `error` tint background (`rgba(211, 47, 47, 0.06)`)
  - AI flagged: `warning.main` treatment
  - Unsaved edits: `info.main` or neutral primary treatment (attention, not a Finalize blocker by itself in isolation; paired with missing price logic as needed)
- **Click behavior (toggle):** Clicking an issue chip in the status bar when the matching filter is **off** turns the filter **on**. Clicking when the filter is **on** turns it **off**. Clicking the same filter on the toolbar uses the **same** boolean state. Both chips reflect the same selection and identical selected visual styling.
- **Hidden when zero.** A row of chips that says "0 missing price, 0 AI flagged, 0 unsaved" is noise.

When all **Finalize blockers** are zero (`missingPriceCount === 0 && unsavedCount === 0`), the headline switches to "Ready to finalize" with `success.main` and a green check icon, and the Finalize button enables (AI flagged may still be non-zero).

### 4.4 What goes away

- The standalone "Paid $X / Ideal $Y / Set $Z / -100% vs ideal / 936 units / 936 missing price" chip strip in its current form. The financial rollups move into a collapsible Pricing Summary panel below the status bar (see section 5). Unit count goes inline in the page header next to the order ID.

---

## 5. Pricing summary (collapsible, default closed)

Replaces the current orange-and-green chip salad. The user does not need this open while editing rows. They need it when the headline question is "are we close to ideal in dollars?"

### 5.1 Layout

A collapsible `Accordion` or a small expandable panel directly under the status bar. Default state: **closed** with a single line summary, for example:

```
Pricing  •  Paid $6,691.82  •  Set $0.00  •  Variance from ideal: -100%   [v]
```

**Collapsed:** do not add a filter-scope caption (the line is too short).

Expanded state: a horizontal grid of four cells with labels above values, following the typography rules from `ux-spec.md`:

| Cell | Value | Label |
|------|-------|-------|
| Paid (PO total) | `$6,691.82` | "Paid" |
| Ideal (target retail rollup) | `$14,870.36` | "Ideal target" |
| Set (current sum of staged prices) | `$0.00` | "Currently set" |
| Variance | `-100.0%` color coded | "vs ideal" |

Use `tabular-nums`, `body2` `fontWeight: 700` for values, `caption` `text.secondary` for labels. Variance uses the margin/profitability threshold colors from `ux-spec.md`.

**Filter scope caption (expanded only):** When any grid filter or search is active, add a small `caption` line below the four-cell grid: `Totals reflect all N rows in this PO, not the current filter.` Substitute `N` for the total staged row count. When no filter is active, omit this caption.

### 5.2 Why collapsible

The user's primary loop in this step is row level work, not portfolio level. Rolling these stats up but keeping them one click away respects both jobs without making either dominant.

---

## 6. Toolbar (search, filters, bulk actions)

Two clear regions. The current page conflates them, which causes misclicks on a long shift.

### 6.1 Left region: search and filters

| Control | Behavior |
|---------|----------|
| Search input | Debounced 300ms (already in code), placeholder "Search title, brand, description, identifiers." Width around 320px. Search matches against: title, brand, description, model, vendor SKU, UPC, ASIN, and any other values in `identifiers` JSON. Identifier values are flattened to a per-row search string when rows load so the debounced filter does not walk JSON on every keystroke. |
| Filter chips | Toggleable: "Missing price", "AI flagged", "Unsaved", "No category". Selected state uses filled background with semantic color. Unselected is outlined neutral. Multiple may be active simultaneously (AND combination). |
| Active filter readout | Small `caption` text to the right of chips: "Showing 12 of 936 rows" when any filter is active. Hidden otherwise. |

Toolbar filter chips and the status bar issue chips share the same filter booleans. Toggle behavior is specified in **§4.3**.

### 6.2 Right region: bulk actions

Visually distinct from filters. Use `Button` (outlined) not chip. Group with a `ButtonGroup` or a divider so the eye sees them as a different class of control.

**Bulk action policy (Option A):** Buttons are **disabled until at least one row is selected.** User checks rows, then runs the bulk action. If QA shows this breaks muscle memory for Bill, **Option B (fallback):** with no selection, clicking a bulk action treats **all rows on the current filtered pagination page** as the implicit target, always with an appropriate confirmation modal (documented in implementation plan).

| Action | Behavior |
|--------|----------|
| Select all visible | Selects **all rows on the current pagination page** (the current page of the filtered set). Not the virtualized DOM viewport. Not the full filtered set. Example: page size 50, page 3 of a 200-row filtered set selects row indices 101 to 150. If the filtered set has 12 rows on one page, selects all 12. |
| Clear selection | Disabled when nothing is selected. Shows count, for example "Clear (12)". |
| Apply -10% | Disabled until rows are selected (Option A). Shows confirmation: "Apply -10% to N selected rows?" |
| Apply +10% | Same pattern. |
| Set to ideal | Same pattern. |
| Reset to AI suggestion | Same pattern. Confirmation explains this overwrites manual edits. |

All bulk pricing actions require a confirmation modal when the selection size exceeds 10 rows. Below 10, apply immediately. The modal pattern already exists for finalize and undo standardize, reuse it.

### 6.3 What goes away

- "Save Changes" button does not live in the toolbar. It moves to the grid footer next to pagination, so it is visually anchored to the work area, not the controls. See section 8.

---

## 7. The review grid (the bulk of the work)

This is where the page lives or dies. The current implementation gives 5 rows per 1080p screen. The target is 18 to 22 rows per screen at default density, with an option to expand individual rows for detail.

### 7.1 Column set (default visible, in order)

Aim to fit these in the viewport with no horizontal scroll on a 1280px wide content area:

| # | Column | Width | Purpose |
|---|--------|-------|---------|
| 1 | Selection checkbox | 40px | Bulk action targeting |
| 2 | Expand chevron | 36px | Reveal row detail |
| 3 | Row number (#) | 56px | Stable reference |
| 4 | Status indicator | 40px | Tiny icon column. See **§7.4** (mutually exclusive priority). |
| 5 | Title | flex, min 240px | Editable inline. The single most important field. |
| 6 | Brand | 140px | Editable inline. |
| 7 | Category | 160px | Editable inline (autocomplete on canonical taxonomy; options must match backend PATCH validation). |
| 8 | Condition | 110px | Chip with dropdown on click. |
| 9 | Qty | 60px right aligned | Tabular-nums. |
| 10 | Retail | 90px right aligned | Read-only, tabular-nums. |
| 11 | Price | 100px right aligned | Editable, tabular-nums, the second most important field after title. |

Description, UPC, model, identifiers, taxonomy JSON, specifications, search tags, AI reasoning, raw row, ai_status detail: **all live in the row expand panel.** Not in the default grid.

### 7.2 Row density

- Cell vertical padding: 6px to 8px.
- Single line per cell. Title and Brand truncate with ellipsis and a hover tooltip showing the full value.
- Description does **not** appear in the row by default. It appears in the expand panel.
- Row height target: 40px to 44px.

This is "spreadsheet energy with better aesthetics." A processor scrolling through 936 rows should be able to scan visually without the page scrolling like molasses.

### 7.3 Header row

- Sticky header that stays pinned to the top of the grid as the user scrolls.
- All columns sortable except checkbox, expand, status indicator.
- Active sort indicated with a small arrow and `primary.main` color on the column label.
- Header background `action.hover` or a faint `grey.50` tint to distinguish from rows.

### 7.4 Status indicator column

A 40px column carrying **one** icon per row. **Mutually exclusive**; **highest priority wins:**

1. **Unsaved edit:** pencil icon, `info.main`, tooltip "Unsaved changes."
2. **Missing price:** `MoneyOff` icon, `error.main`, tooltip "No price set."
3. **AI flagged** (`ai_status` non-null and indicates a flag): `Warning` icon, `warning.main`, tooltip shows the `ai_status` reason.
4. **Clean:** empty cell. Do **not** render a checkmark.

This single column replaces a lot of conditional formatting on other cells and gives the eye one place to scan for problems.

### 7.5 Inline editing pattern

Follow `ux-spec.md` inline edit pattern, with one adjustment for grid density.

**Persistence:** The only path to the database is **Save Changes** in the grid footer. No `onBlur` auto-save on price or other fields. No background timer auto-save. Navigation away with unsaved edits uses a **Save / Discard / Cancel** guard.

**Default state for editable cells:**

- Cell shows the value as plain text (no input chrome).
- Cursor changes to text cursor on hover, with a faint background tint (`action.hover`) to signal editability.
- No visible pencil icon at this density. The hover affordance is enough.

**Active edit state:**

- Click or tab into the cell. The cell becomes a borderless `TextField` that fills the cell, no extra chrome.
- **Enter** commits the edit to draft (marks row dirty, enables Save in footer).
- **Escape** reverts to the previous value and blurs.
- **Tab** moves to the next editable cell in the same row, then the first editable cell of the next row.
- Edited cells show a faint left border accent (`borderLeft: 2px solid`, `primary.main`) until saved, matching the override pattern in `ux-spec.md`.

**Dirty row highlight:**

- A row with any unsaved edit gets a very faint `primary` tint on its background (`rgba(46, 125, 50, 0.04)`) and the unsaved icon in the status column.

### 7.6 AI suggestion display

The current page shows "AI: [exact same value as the field] Apply" under every editable cell. When the AI value matches what is already in the field, this line is dead pixels.

**New rule:** Show the AI suggestion only when it differs from the current coalesced value.

In the row expand panel (not the default row), show:

```
Field: Title
  Standard:  Cenozo LED Dimmable Acrylic Ball Chandelier Black
  AI:        Cenozo LED Chandelier  (Apply)
  Final:     [editable, current working value]
```

In the default grid row, when an AI suggestion differs from the current value, render a small `AutoFixHigh` icon in the cell next to the value. Hover shows a popover with the AI value and an Apply button. This keeps the row tight without losing the affordance.

### 7.7 Row expand panel

The chevron in column 2 expands a row to show full detail without leaving the grid. Multiple rows may be expanded. **Lazy-load** panel body only when the row is expanded.

**Visual treatment:** `action.hover` background, no card chrome, sectioned content with `caption` labels above each section, **dividers between sections**.

**Section 1: Layered values strip**

A three-column grid for: **title, brand, category, model, condition, description.**

| Column | Content |
|--------|---------|
| Standard | Values from `standard_*` fields |
| AI | Values from `ai_*` fields; **only render when AI differs from Standard.** Apply link below when applicable. |
| Final | Current working value; editable inline using the same pattern as the grid row |

`caption` labels above each column. `body2` for values. Empty cells show "not set".

After Section 1, **Section 2: Identifiers** — horizontal key-value list: UPC, ASIN, model number, vendor SKU, any other id values in `identifiers` JSON. Two columns on desktop (label / value per row).

**Section 3: Taxonomy detail** — Single line, full canonical category path. If `taxonomy` JSON encodes a hierarchy, render as breadcrumbs separated by chevrons (`>`).

**Section 4: AI metadata (conditional)** — Renders only when `ai_status` is non-empty/meaningful or other AI metadata exists.

- `ai_status` as chips with colors aligned with §7.4 rules.
- AI reasoning: styled quote block (left border, italic, `text.secondary`).
- Search tags: small chip array.
- Specifications JSON: key-value grid, two columns.

**Section 5: Raw row** — Collapsible subsection, **default collapsed.** When expanded: key-value table; keys are original CSV header strings, values are raw cell strings.

### 7.8 Grid footer (pagination + Save)

A **single** horizontal row, **full width** of the grid, **sticky** to the bottom of the grid container. **Height ~48px.** Background `grey.50` or `action.hover`.

| Region | Content |
|--------|---------|
| **Left** | Row count: "1 to 50 of 936 rows" or, when filtered, "1 to 12 of 12 filtered" (and equivalent). |
| **Center** | Rows per page dropdown (25, 50, 100, 200); prev/next arrows with large touch targets; page number input; **Jump to row** input (row number in manifest). |
| **Right** | **Save Changes** button (placement per §8). |

---

## 8. Save Changes (the soft commit)

### 8.1 Placement

Grid footer **right** region, anchored to the work area (§7.8).

### 8.2 States

| State | Label | Tooltip | Disabled |
|-------|-------|---------|----------|
| No dirty rows | "Save Changes" | "No unsaved changes." | Yes |
| N dirty rows | "Save N changes" | "Save N rows to the database." | No |
| Saving | "Saving N changes..." | (none) | Yes |
| Save failed | "Save N changes" | "Last save failed. Click to retry." | No |

Snackbar on success: `Saved N rows.`  
Snackbar on failure: `Save failed: {error message}.`

### 8.3 Navigation guard

**Keep manual save only.** No auto-save debounce. If the user tries to leave the page with unsaved changes, show a confirmation modal: Save / Discard / Cancel (wired via `useBlocker` from `react-router-dom`).

---

## 9. Finalize button

### 9.1 Placement

Top right of the status bar, as the visual conclusion of the headline state.

### 9.2 States

| State | Visual | Behavior |
|-------|--------|----------|
| **Blockers present** | Disabled, label "Finalize" | Tooltip: `Cannot finalize: 12 missing price, 5 unsaved edits.` (AI flagged is **not** listed here.) |
| **Ready** | Enabled, `contained` `primary`, perhaps slightly larger than other primary buttons on the page since this is the page goal | Click triggers confirmation modal. |

### 9.3 Confirmation modal

**Title:** `Finalize preprocessing for {orderNumber}?`

**Body:**

```
This will finalize {N} rows and create canonical ManifestRow records for this purchase order. The preprocessing staging session will close.

This cannot be undone without admin intervention.
```

**Buttons:** **Cancel** `text` neutral. **Finalize** `contained` `primary`.

---

## 10. Page states

### 10.1 Loading

While the initial `preprocessing-review?full=true` fetch is in flight:

- **Status bar:** skeleton on headline (one line, **240px** wide); **three** skeleton chips at **80px** wide each.
- **Pricing summary:** collapsed row with **three** skeleton value bars at **80px** each.
- **Toolbar:** rendered; **all controls disabled**. Search shows normal placeholder.
- **Grid:** **10** skeleton rows at default row height (40 to 44px). **Column headers render immediately** from static config (no skeleton on headers).

Do not block the entire page with a centered full-page spinner. The chrome can render immediately and skeletons fill in the data zones.

### 10.2 Empty (zero staged rows)

This should not happen if the user reached Step 3 with an active session, but defend against it:

- Centered empty state in the grid area: icon, "No staged rows", "Go back to Step 2 to apply cleanup or Step 1 to standardize again."

### 10.3 Error

If the review fetch fails:

- Toast notification with the error message.
- Empty state in the grid area: "Could not load review rows" with a Retry button.

### 10.4 Saving

Snackbar at the top right (matches existing notistack pattern in the app), max 3 stacked, 4-second auto-hide. Use exact strings from **§8.2** (`Saved N rows.` / `Save failed: {error message}.`).

---

## 11. Performance and virtualization

The page already loads up to 10,000 rows in a single payload. The current DOM strategy renders the visible page (50 rows) which works, but degrades with row complexity (expanded rows, complex inline editors).

### 11.1 Recommendations

- **Virtualize the grid** with **`@tanstack/react-virtual`** and `useVirtualizer` on the row list inside a fixed-height flex region (`flex: 1; minHeight: 0`). Add the package if missing. Do not rely on MUI X DataGrid for this grid.
- **Memoize row components** per the **row memoization contract** below.
- **Defer expand panel content.** Render the expand panel only when expanded. Do not render hidden detail upfront for collapsed rows.
- **Server-side pagination** remains a future option if virtualization is insufficient.

**Row memoization contract:**

- Each memoized row receives **`row` (data)** and a **stable callbacks object** from a parent whose handlers are **`useCallback`** with stable deps.
- Frequently changing data (selection, expansion, draft values) should flow through **refs** inside the row where needed (see `AuctionListDesktop.tsx` patterns) so a single-cell edit does not change row props for every row.
- **Goal:** Editing one cell must not rerender other rows. Validate with React DevTools Profiler before closing the milestone.

### 11.2 What not to do

- Do not introduce a full table redraw on every keystroke during search. The 300ms debounce stays.
- Do not invalidate the full review query on every save. Patch the local state with the saved values, do not refetch all rows. Optimistic update with rollback on error.

---

## 12. Keyboard shortcuts (power user layer)

**First pass (ship):**

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Tab` / `Shift+Tab` | Move between editable cells in the current row |
| `Enter` (in cell) | Commit edit, move to same column next row |
| `Escape` (in cell) | Revert edit, blur cell |
| `Ctrl+S` | Save Changes |
| `Ctrl+Enter` | Trigger Finalize when enabled |

**Deferred (second pass, time permitting):**

| Shortcut | Action |
|----------|--------|
| `j` / `k` | Move row focus down / up |
| `e` | Expand or collapse focused row |
| `x` | Toggle selection on focused row |

Show a shortcuts cheat sheet behind a `?` icon in the page header listing **first-pass** shortcuts only in v1.

---

## 13. Color and typography (binding to ux-spec)

This page does not invent new tokens. It uses the system already defined in `ux-spec.md`:

- **Section header** (status bar headline, pricing summary header): `body1` `fontWeight: 700`, `text.primary`.
- **Cell values**: `body2`, `fontWeight: 500`, `tabular-nums` on all numeric cells.
- **Cell labels in expand panel**: `caption`, `text.secondary`, `0.7rem`, `textTransform: uppercase`, `letterSpacing: 0.5`.
- **Status colors**: `success.main` for ready, `error.main` for missing price, `warning.main` for AI flagged, `info.main` for unsaved.
- **Card containers**: `Card variant="outlined"`, `borderRadius: 8`, `p: 1.25`. No elevation shadows.

If a color or weight does not appear in `ux-spec.md`, do not add it. Ask before extending the palette.

---

## 14. What to keep from the current page

Do not throw these out in the rebuild:

1. The three-step stepper. It works.
2. The order picker dropdown in the header.
3. The "Back to Order" button.
4. The success banner pattern (the green "Final review complete" panel) for one-shot confirmations elsewhere on the page.
5. The 300ms debounced search.
6. The confirmation modal pattern for destructive actions (already used for finalize and undo standardize).
7. The cream background and green CTA tradition that distinguishes preprocessing chrome from generic dashboard pages. Keep `#F4F1EB` page background.
8. The `Apply` link affordance for accepting AI suggestions, just relocated per section 7.6.

---

## 15. What explicitly does not change in this rebuild

To keep scope bounded:

- API contract is unchanged. The endpoints in section 1.5 of the technical doc continue to be called the same way.
- `PreprocessingRow` model and serializer are unchanged.
- Step 1 (Standardize Manifest) and Step 2 (AI Cleanup) panels are out of scope for this design doc. They get their own pass later.
- Mobile and tablet layouts. This is a desktop-only workflow tool. A 1280px minimum content width is acceptable.
- **Page chrome unchanged:** stepper, order picker dropdown, Back to Order button, cream background `#F4F1EB`, page header layout. Only the Step 3 Final Review panel is rebuilt.

---

## 16. Implementation order (suggested)

The coder should not attempt a single-shot rewrite. Sequence:

1. **Status bar refactor.** Resolve the contradiction. Wire issue chips to filter state. Move Finalize button into the status bar. Hide pricing chips into a collapsible.
2. **Toolbar split.** Separate filters from bulk actions visually. Move Save Changes to the grid footer.
3. **Grid column refactor.** Cap Description column, push detail into expand panel, add status indicator column, fix horizontal scroll.
4. **Row density pass.** Tighten padding, single-line cells, hide redundant AI suggestion text.
5. **Inline edit pattern.** Replace the visible TextField on every row with hover-to-reveal editing.
6. **Expand panel.** Build the layered values display per §7.7.
7. **Virtualization.** Once the layout is stable, optimize render performance with `@tanstack/react-virtual`.
8. **Keyboard shortcuts (first pass).** After the visual rebuild lands.

Each step ships independently and improves the page. Do not block any one step on later ones.

---

## 17. Done definition

This page is done when:

- A user with 936 rows can see at least 18 rows per 1080p screen at default density, with no horizontal scroll.
- The status bar tells them in one sentence whether they can finalize, and exactly what blocks them if they cannot.
- Clicking "12 missing price" in the status bar filters the grid to those 12 rows in under 200ms.
- Editing a row, saving, and seeing the row update in place, takes one click after the edit.
- Finalize is enabled when and only when zero rows are missing prices and zero rows are dirty.
- The page does not waste vertical space on data the user is not currently using.
- A new staff member can sit down at this page and understand the workflow without training.
- After deleting all draft state and saving, the unsaved icon disappears from all affected rows within one render cycle.
- Filtering to a 12-row subset, selecting all visible, and applying -10% only changes those 12 rows in `reviewRowsFull`; other rows are untouched.
- Navigating away with unsaved changes shows the modal; **Discard** navigates immediately; **Save** persists then navigates; **Cancel** stays with edits intact.

When all of these are true, ship it.

**Taxonomy (hard requirement):** Category `Autocomplete` options come from **`TAXONOMY_V1_CATEGORY_NAMES`** in [`frontend/src/constants/taxonomyV1.ts`](frontend/src/constants/taxonomyV1.ts). Before merging the rebuild, **verify** this set matches what the backend accepts on `PATCH …/preprocessing-review/` for `category`. If they have drifted, fix drift before ship. Add a comment on the Autocomplete pointing to the backend validation source so future drift is caught early.
