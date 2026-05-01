# Preprocessing Final Review: Design Specification

**Page:** `/inventory/preprocessing/:orderId` (Step 3 / Final Review panel)
**Audience:** Coder implementing the rebuild. Design language reference: `.ai/extended/ux-spec.md`.
**Last updated:** 2026-05-01

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
| **Left: Headline state** | Either "Ready to finalize" (success) or "N issues blocking finalize" (warning/error) with an icon | `body1`, `fontWeight: 700`, color tied to state |
| **Center: Blocker chips** | One chip per blocker: missing price count, unsaved edits count, AI flagged count. Each chip is clickable and applies the matching filter | Outlined chips with semantic color, see below |
| **Right: Finalize button** | `contained`, `primary`, disabled when blockers exist with a tooltip explaining why | Right-aligned, large enough to be the visual anchor |

### 4.3 Blocker chip rules

Each blocker chip follows the same pattern:

- **Count + label** (for example: "12 missing price", "3 AI flagged", "5 unsaved")
- **Color by severity:**
  - Missing price: `error.main` border, `error.main` text, faint `error` tint background (`rgba(211, 47, 47, 0.06)`)
  - AI flagged: `warning.main` treatment
  - Unsaved edits: `info.main` or neutral primary treatment (this is a soft blocker, not an error)
- **Click behavior:** Sets the corresponding filter on the toolbar. The chip becomes the filter, not just a stat.
- **Hidden when zero.** A row of chips that says "0 missing price, 0 AI flagged, 0 unsaved" is noise.

When all blocker counts are zero, the headline switches to "Ready to finalize" with `success.main` and a green check icon, and the Finalize button enables.

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

Expanded state: a horizontal grid of four cells with labels above values, following the typography rules from `ux-spec.md`:

| Cell | Value | Label |
|------|-------|-------|
| Paid (PO total) | `$6,691.82` | "Paid" |
| Ideal (target retail rollup) | `$14,870.36` | "Ideal target" |
| Set (current sum of staged prices) | `$0.00` | "Currently set" |
| Variance | `-100.0%` color coded | "vs ideal" |

Use `tabular-nums`, `body2` `fontWeight: 700` for values, `caption` `text.secondary` for labels. Variance uses the margin/profitability threshold colors from `ux-spec.md`.

### 5.2 Why collapsible

The user's primary loop in this step is row level work, not portfolio level. Rolling these stats up but keeping them one click away respects both jobs without making either dominant.

---

## 6. Toolbar (search, filters, bulk actions)

Two clear regions. The current page conflates them, which causes misclicks on a long shift.

### 6.1 Left region: search and filters

| Control | Behavior |
|---------|----------|
| Search input | Debounced 300ms (already in code), placeholder "Search title, brand, description, UPC". Width around 320px. |
| Filter chips | Toggleable: "Missing price", "AI flagged", "Unsaved", "No category". Selected state uses filled background with semantic color. Unselected is outlined neutral. Multiple may be active simultaneously (AND combination). |
| Active filter readout | Small `caption` text to the right of chips: "Showing 12 of 936 rows" when any filter is active. Hidden otherwise. |

Filter chips and the status bar blocker chips are wired to the same state. Clicking "12 missing price" in the status bar toggles the "Missing price" filter chip on. They are two views of the same toggle.

### 6.2 Right region: bulk actions

Visually distinct from filters. Use `Button` (outlined) not chip. Group with a `ButtonGroup` or a divider so the eye sees them as a different class of control.

| Action | Behavior |
|--------|----------|
| Select all visible | Checkbox or text button. Selects all rows in the current filtered, paginated view. |
| Clear selection | Disabled when nothing is selected. Shows count, for example "Clear (12)". |
| Apply -10% | Disabled until rows are selected. Shows confirmation: "Apply -10% to N selected rows?" |
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
| 4 | Status indicator | 40px | Tiny icon column showing AI flag, missing price, or unsaved state. See 7.4. |
| 5 | Title | flex, min 240px | Editable inline. The single most important field. |
| 6 | Brand | 140px | Editable inline. |
| 7 | Category | 160px | Editable inline (autocomplete on canonical taxonomy). |
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

A 40px column carrying a single icon per row. Mutually exclusive priority order:

1. **Unsaved edit** (highest): pencil icon, `info.main` or `primary.main`. Tooltip: "Unsaved changes."
2. **Missing price**: `AttachMoney` or `MoneyOff` icon, `error.main`. Tooltip: "No price set."
3. **AI flagged** (`ai_status` is non-null and indicates a flag): warning triangle, `warning.main`. Tooltip shows the ai_status reason.
4. **Clean and reviewed**: optional faint check, or empty cell. Empty cell preferred to reduce noise.

This single column replaces a lot of conditional formatting on other cells and gives the eye one place to scan for problems.

### 7.5 Inline editing pattern

Follow `ux-spec.md` inline edit pattern, with one adjustment for grid density.

**Default state for editable cells:**
- Cell shows the value as plain text (no input chrome).
- Cursor changes to text cursor on hover, with a faint background tint (`action.hover`) to signal editability.
- No visible pencil icon at this density. The hover affordance is enough.

**Active edit state:**
- Click or tab into the cell. The cell becomes a borderless `TextField` that fills the cell, no extra chrome.
- Enter commits the edit (marks row dirty, value persists in React state, save button enables in footer).
- Escape reverts to the previous value.
- Tab moves to the next editable cell in the same row, then the first editable cell of the next row.
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

The chevron in column 2 expands a row to show full detail without leaving the grid. Multiple rows may be expanded.

Panel content, in order:

1. **Layered values strip** for title, brand, category, model, condition, description. Three columns: Standard, AI (if different), Final (editable). Apply links from AI to Final where applicable.
2. **Identifiers**: UPC, ASIN, model number, vendor SKU, any other id values.
3. **Taxonomy detail**: full canonical category path.
4. **AI metadata** (if present): `ai_status`, AI reasoning text, search tags, specifications JSON rendered as a key-value grid.
5. **Raw row** (collapsible): the original CSV row, preserved as it came in. Useful for debugging mappings.

Panel uses `action.hover` background to visually attach to the row above it. No card chrome inside the panel, just sectioned content with `caption` labels.

### 7.8 Pagination footer

Anchored to the bottom of the grid, not floating below it.

| Region | Content |
|--------|---------|
| Left | "1 to 50 of 936 rows" plus filter context if any: "1 to 12 of 12 filtered" |
| Center | Rows per page dropdown (25, 50, 100, 200) |
| Right | Prev / Next arrows, page number input for jump to page |

Bigger touch targets on the prev/next arrows than the current implementation. Add a "Jump to row" input for power users who want to land on a specific row number, since 19 pages of 50 is a lot to click through.

---

## 8. Save Changes (the soft commit)

The current Save Changes button sits in the toolbar, grayed out, with no indication of what would enable it. That has to change.

### 8.1 Placement

Move to the grid footer, right side, next to pagination. Anchored to the work area.

### 8.2 States

| State | Visual | Behavior |
|-------|--------|----------|
| **No dirty rows** | Disabled, label "Save Changes", muted color | Tooltip on hover: "No unsaved changes." |
| **Dirty rows present** | Enabled, label "Save N changes", `contained` `primary` | Click triggers `PATCH preprocessing-review` with the dirty patches. Shows a snackbar on success: "Saved 12 rows." |
| **Saving in progress** | Loading spinner inside button, label "Saving N changes...", disabled | Prevents double-submit. |
| **Save failed** | Returns to enabled state, snackbar with error message | Dirty rows remain dirty so the user can retry. |

### 8.3 Auto-save consideration (decision required)

Today the page batches edits and requires explicit Save. Two paths:

- **Keep manual save** (current): the user has full control, but a forgotten save loses work on navigate-away.
- **Add auto-save with debounce** (3 to 5 seconds after last edit): safer, but introduces silent network traffic and can mask errors.

Recommendation: keep manual save, but add a navigation guard. If the user tries to leave the page with unsaved changes, show a confirmation modal: "You have N unsaved changes. Save before leaving?" with Save / Discard / Cancel buttons.

---

## 9. Finalize button

### 9.1 Placement

Top right of the status bar, as the visual conclusion of the headline state.

### 9.2 States

| State | Visual | Behavior |
|-------|--------|----------|
| **Blockers present** | Disabled, label "Finalize" | Tooltip lists the blockers: "Cannot finalize: 12 missing price, 5 unsaved edits." |
| **Ready** | Enabled, `contained` `primary`, perhaps slightly larger than other primary buttons on the page since this is the page goal | Click triggers confirmation modal. |

### 9.3 Confirmation modal

Already partially exists. Should clearly state:

- Number of rows being finalized.
- That this closes the staging session and creates `ManifestRow` records.
- That this cannot be undone without admin intervention.
- Confirm / Cancel buttons.

---

## 10. Page states

### 10.1 Loading

While the initial `preprocessing-review?full=true` fetch is in flight:

- Status bar shows skeleton text on the headline and chips.
- Pricing summary shows skeleton values.
- Toolbar is rendered but disabled.
- Grid shows a skeleton table with 10 placeholder rows.

Do not block the entire page with a centered spinner. The chrome can render immediately and skeletons fill in the data zones.

### 10.2 Empty (zero staged rows)

This should not happen if the user reached Step 3 with an active session, but defend against it:

- Centered empty state in the grid area: icon, "No staged rows", "Go back to Step 2 to apply cleanup or Step 1 to standardize again."

### 10.3 Error

If the review fetch fails:

- Toast notification with the error message.
- Empty state in the grid area: "Could not load review rows" with a Retry button.

### 10.4 Saving

Snackbar at the top right (matches existing notistack pattern in the app), max 3 stacked, 4-second auto-hide. "Saved 12 rows" on success, "Save failed: [reason]" on failure.

---

## 11. Performance and virtualization

The page already loads up to 10,000 rows in a single payload. The current DOM strategy renders the visible page (50 rows) which works, but degrades with row complexity (expanded rows, complex inline editors).

### 11.1 Recommendations

- **Virtualize the grid.** Use `@tanstack/react-virtual` or MUI X DataGrid Pro virtualization. Render only rows in the viewport plus a small overscan buffer. This makes 200 rows per page feel as fast as 50.
- **Memoize row components.** Each row should be a `React.memo` component receiving a stable row object reference. Editing one cell must not rerender all 50 rows. The `buying.md` desktop grid lessons (refs for frequently changing cell state) apply here.
- **Defer expand panel content.** Render the expand panel only when expanded. Do not render hidden detail upfront for 50 rows.
- **Server-side pagination as a future option.** The technical doc notes `?page` and `?page_size` are supported but unused. If virtualization plus memoization is not enough on the largest manifests, switch to server pagination with the same UI.

### 11.2 What not to do

- Do not introduce a full table redraw on every keystroke during search. The 300ms debounce stays.
- Do not invalidate the full review query on every save. Patch the local state with the saved values, do not refetch all rows. Optimistic update with rollback on error.

---

## 12. Keyboard shortcuts (power user layer)

Bill is reviewing 936 rows. Saving him keyboard time matters.

| Shortcut | Action |
|----------|--------|
| `/` | Focus search input |
| `Tab` / `Shift+Tab` | Move between editable cells in the current row |
| `Enter` (in cell) | Commit edit, move to same column next row |
| `Escape` (in cell) | Revert edit, blur cell |
| `j` / `k` | Move row focus down / up (vim-style, optional) |
| `e` | Expand or collapse focused row |
| `x` | Toggle selection on focused row |
| `Ctrl+S` | Save Changes |
| `Ctrl+Enter` | Trigger Finalize (only when enabled) |

Show a discoverable shortcuts cheat sheet behind a `?` icon in the page header.

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

---

## 16. Implementation order (suggested)

The coder should not attempt a single-shot rewrite. Sequence:

1. **Status bar refactor.** Resolve the contradiction. Wire blocker chips to filter state. Move Finalize button into the status bar. Hide pricing chips into a collapsible.
2. **Toolbar split.** Separate filters from bulk actions visually. Move Save Changes to the grid footer.
3. **Grid column refactor.** Cap Description column, push detail into expand panel, add status indicator column, fix horizontal scroll.
4. **Row density pass.** Tighten padding, single-line cells, hide redundant AI suggestion text.
5. **Inline edit pattern.** Replace the visible TextField on every row with hover-to-reveal editing.
6. **Expand panel.** Build the layered values display.
7. **Virtualization.** Once the layout is stable, optimize render performance.
8. **Keyboard shortcuts.** Layer on after the visual rebuild lands.

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

When all eight of these are true, ship it.
