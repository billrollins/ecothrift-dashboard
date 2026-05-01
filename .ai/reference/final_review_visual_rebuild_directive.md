# Final Review: Visual rebuild directive (mockup is ground truth)

**Short path for reviews:** **[`fix_this.md`](fix_this.md)** (repo: **`.ai/reference/fix_this.md`**) points here.

**Status:** This document supersedes ambiguous **visual** sections of [`consult_design_final_review.md`](consult_design_final_review.md) for Step 3. The mockup screenshot shared by the owner is the visual ground truth. The design doc still governs **behavior** where this directive does not override it (filter wiring where implemented, save semantics, eventual virtualization, keyboard shortcuts). Where the mockup and the design doc disagree on **visual treatment**, the mockup wins.

**Icon note:** The directive mentions `ArrowForward` from lucide-react or MUI. This repo does **not** ship `lucide-react`; use **`@mui/icons-material/ArrowForward`**.

**Audience:** Coder who shipped the data layer fix but did not ship the visual rebuild.

---

## What this document is

The previous review pass landed the data correctness fix (resolving the "All rows priced" vs "936 missing price" contradiction) and stopped. The visual rebuild has not started. This document tells you exactly what to build, region by region, to match the mockup the owner approved.

Read the whole document before writing code. Some sections override what the design doc said.

---

## 1. Header row

The page header above the stepper currently shows order code on the left and "936 units · Est. $14,870.36" plus "Back to Order" on the right. Keep this. Do not change it.

The stepper itself needs three changes:

- Step 3 label changes from "Final Review" to "Manual Review."
- The Finalize button on Step 3 changes from "Finalize" to "Finalize and Open Processing" with a right arrow icon (use `@mui/icons-material/ArrowForward`).
- The Finalize button stays in its current position at the right end of the stepper row in the mockup. It does not move into a separate status bar. This overrides design doc §4.2.

The button is `contained`, `primary`, with a slight increase in padding so it reads as the page-level CTA. Keep the disabled state behavior from the design doc: tooltip listing blockers (missing price count and unsaved count only).

---

## 2. The stat card row (replaces the chip cluster)

This is the single biggest visual change. Throw out the current chip cluster entirely. Build a horizontal row of stat cards.

### 2.1 Layout

Six stat cards in a single horizontal row, equal width, with consistent gap between them. Each card is a `Box` (or unstyled card) with:

- White background
- Border: 1px solid `divider` (or a slightly darker grey)
- Border radius: 6px to 8px
- Padding: 12px to 16px vertical, 16px to 20px horizontal
- Internal layout: small uppercase label on top, large value below

No MUI `Card` chrome or shadows. These are flat panels, not elevated cards.

### 2.2 The six cards

In order, left to right:

| Card | Label (top) | Value (bottom) |
|------|-------------|----------------|
| 1 | PAID | `$1860` (PO total paid) |
| 2 | IDEAL | `$830` (sum of ideal prices) |
| 3 | SET | `$830` (sum of currently set prices) |
| 4 | % VS IDEAL | `100%` |
| 5 | UNITS | `8` (total unit count) |
| 6 | MISSING PRICE | `0` |

### 2.3 Typography in cards

- **Label:** `caption` size, `0.7rem` to `0.75rem`, `fontWeight: 600`, `letterSpacing: 0.5`, `textTransform: uppercase`, `text.secondary`.
- **Value:** `h5` or `h6`, `fontWeight: 700` to `800`, `tabular-nums`, `text.primary`.
- Vertical gap between label and value: 4px to 6px.

### 2.4 The MISSING PRICE card special treatment

In the mockup, the MISSING PRICE card has a green border treatment when the count is 0. This is the "all clear" signal. Implement it like this:

- When count is 0: card border becomes `success.main` (green), border width stays 1px, value text color stays normal `text.primary`. Optional: very faint green tint background (`rgba(46, 125, 50, 0.04)`).
- When count is greater than 0: card border becomes `error.main` (red), border width stays 1px, value text color becomes `error.main`. Optional faint red tint background.

This applies the design doc's "use color to encode state, but pair with text" rule. The number is the same (a count), the color tells you whether it's a problem.

### 2.5 The % VS IDEAL card variance treatment

Apply the same color encoding logic, but with a tolerance band:

- Within plus or minus 10% of ideal: neutral border, no special treatment.
- Outside that band but not extreme (10% to 30% off): warning border (`warning.main` orange), value in `warning.main`.
- More than 30% off ideal: error border, error value.

This is what the previous screenshot got wrong. "23.5% vs ideal" was rendered as alarming but is actually within normal range for thrift PO pricing. The color treatment must reflect actual severity, not just any non-zero variance.

### 2.6 What the stat cards replace

- Delete the entire chip strip (`Paid $X / Ideal $Y / Set $Z / % vs ideal / 936 units / 936 missing price`).
- Delete the success banner above the chip strip ("Final review complete: all staged rows are priced"). The MISSING PRICE card's green state already conveys this. The banner is redundant.
- Delete the collapsible pricing summary accordion that was specified in `consult_design_final_review.md` §5. The stat card row is permanently visible. It does not need to collapse.

---

## 3. Toolbar (single row, two regions)

The current toolbar has filters and bulk actions stacked or mixed together with Save Changes wedged in. The mockup is a single horizontal row.

### 3.1 Layout

One row, `Card variant="outlined"` or unstyled `Box` with white background and 1px border, padding around 12px. Two regions left-justified and right-justified within the row:

**Left region (filters):**
- Search input (320px wide), placeholder "Search items..."
- Missing Price filter button (outlined toggle, gets pressed/active state when on)

**Right region (bulk actions and save):**
- `-10%` button
- `+10%` button
- `Visible = Ideal` button
- `Reset to AI` button
- `Save Changes (N)` button, where N is the unsaved count

### 3.2 Button styling

All bulk action buttons are outlined, neutral color, small size, with thin borders. Not chips. Equal height. Tight horizontal spacing (4px to 8px gap).

The Save Changes button sits visually adjacent to the bulk actions but should be slightly differentiated:

- When N is 0: outlined, disabled appearance, label "Save Changes (0)" with the count in slightly muted color.
- When N is greater than 0: filled (`contained`), `primary` color, label "Save Changes (N)" with the count visible.
- The label always shows the count in parentheses. Do not hide the count.

### 3.3 Removed from toolbar

- "Select Visible" and "Clear Select" buttons. These are not in the mockup. Remove them.
- The "Save Changes" location specified in design doc §8.1 (footer right) is overridden. It lives in the toolbar right region per the mockup.

### 3.4 Filter chips removed

The mockup shows only the "Missing Price" filter as a button on the toolbar. The "AI flagged" and "Unsaved" filter chips specified in design doc §6.1 are not shown in the mockup. For this pass:

- Implement only the "Missing Price" filter button.
- Defer "AI flagged" and "Unsaved" filters to a later pass.
- Do not implement the issue-chips-as-filter-toggles behavior from the design doc until those filter chips exist.

---

## 4. Table columns (the actual fix)

Throw out the current column set. Implement exactly these columns in this order:

| Position | Column | Width strategy | Editable |
|----------|--------|----------------|----------|
| 1 | # (row number) | 48px fixed | No |
| 2 | DESCRIPTION / TITLE | flex, generous | Yes (title only) |
| 3 | BRAND | 140px to 180px | Yes |
| 4 | QTY | 60px right-aligned | No (read-only) |
| 5 | CATEGORY | 160px | Yes (chip with dropdown) |
| 6 | CONDITION | 140px | Yes (dropdown) |
| 7 | RETAIL | 90px right-aligned | No (read-only) |
| 8 | IDEAL | 90px right-aligned | No (read-only) |
| 9 | PRICE | 140px to 160px right-aligned | Yes (with buttons) |
| 10 | VS IDEAL | 90px center-aligned | No (computed) |

Total target: fits in 1280px content width with no horizontal scroll. Test it.

### 4.1 Column header styling

- Header row background: `grey.50` or very faint `action.hover`.
- Header text: `caption` size, `0.7rem` to `0.75rem`, `fontWeight: 600`, `letterSpacing: 0.5`, `textTransform: uppercase`, `text.secondary`.
- Header row sticks to the top of the grid as user scrolls.
- All editable columns sortable. # column not sortable.

### 4.2 What columns went away

- Checkbox column. Removed. Selection-based bulk actions are deferred per §3.4 above.
- Expand chevron column. Removed. The expand panel functionality is deferred to a later pass.
- Status indicator column. Removed. The MISSING PRICE stat card already shows the global count. Per-row issues surface inline (see §5.3 below for AI suggestion affordance).
- Description as a separate column. Merged with Title. See §5 below.

This is a significant scope reduction from `consult_design_final_review.md` §7. The mockup is simpler than the spec. Match the mockup.

---

## 5. The DESCRIPTION / TITLE column anatomy

This is the one column that is not a single line. Its design is specific.

### 5.1 Layout per row

```
┌──────────────────────────────────────────┐
│  [Title in bold, single line, larger]    │
│  [Description in lighter color, can wrap │
│   to a second line, then truncates]      │
│  [Apply button, only when AI differs]    │
└──────────────────────────────────────────┘
```

### 5.2 Typography

- **Title:** `body2`, `fontWeight: 700`, `text.primary`. Single line, ellipsis overflow, hover tooltip shows full title. Click to edit inline.
- **Description:** `caption`, `text.secondary`, max 2 lines with line-clamp, ellipsis on overflow. Not editable in this column. Read-only display.
- **Apply button:** small `outlined` button or text link, `primary.main` color, label "Apply." Only renders when the AI suggested title differs from the current title. When AI matches, do not render the Apply button or any AI text. This implements design doc §7.6.

### 5.3 Inline edit on Title

- Click anywhere on the title text. The title becomes a borderless text input filling the title slot.
- Description below remains visible and unaffected.
- Enter commits to draft. Escape reverts. Tab moves to the Brand cell of the same row.
- Edited rows get a faint left border accent (2px `primary.main`) on the # cell or the row's leading edge, marking the row as dirty.

### 5.4 What the Apply button does

When clicked: copies the AI title into the editable title (writes to draft state, marks row dirty). The Apply button disappears once title matches AI. It reappears if the user manually edits the title back to a value that differs from AI.

### 5.5 Row vertical height

The DESCRIPTION / TITLE cell drives row height. Target row height is around 56px to 64px to accommodate two lines of description plus the title plus the Apply affordance. This is denser than the current ~100px but not as tight as the 40px to 44px in design doc §7.2. Match the mockup, which appears to be in the 56px to 64px range.

---

## 6. Other column treatments

### 6.1 BRAND

- Default state: plain text, no input chrome.
- Hover: faint `action.hover` background to signal editability.
- Click: becomes a borderless text input filling the cell.
- Enter / Escape / Tab behavior consistent with title edit.

### 6.2 QTY

- Plain text, right-aligned, `tabular-nums`.
- Read-only. No edit affordance. No hover background change.

### 6.3 CATEGORY

- Default state: a `Chip` element showing the current category, sized small, outlined, with a faint background tint matching the chip color.
- Click: opens an `Autocomplete` dropdown anchored to the chip, filtered against `TAXONOMY_V1_CATEGORY_NAMES`.
- Selecting a value commits to draft.
- Chip color is neutral primary, not semantic. All categories use the same chip color in this column.

### 6.4 CONDITION

- Default state: a small inline display showing the current condition (for example "Used - Fair") with a chevron-down icon to its right indicating dropdown.
- Click: opens a `Select` or `Menu` with the available `ITEM_CONDITIONS` values.
- Selecting commits to draft.

### 6.5 RETAIL

- Plain text, right-aligned, `tabular-nums`, `text.secondary` color (muted).
- Read-only.

### 6.6 IDEAL

- Same treatment as RETAIL. Plain text, right-aligned, `tabular-nums`, `text.secondary`, read-only.

### 6.7 PRICE

This column is special. It has a minus button, the price value, and a plus button, all on one line.

```
[ - ]  $179.99  [ + ]
```

- Minus button: small icon button, 24px to 28px, decreases price by 10% (or by $1, decide based on what users want, default to 10% to match bulk action).
- Price value: editable, right-aligned, `tabular-nums`, `body2`, `fontWeight: 700`. Click to edit inline. The dollar sign stays visible during edit.
- Plus button: small icon button, increases price by 10%.
- Use `IconButton` with `Remove` and `Add` icons (or `Minus` and `Plus` from lucide-react).
- Both buttons are subtle: outlined, neutral color, low visual weight. They should not compete with the price value visually.

### 6.8 VS IDEAL

- A small chip showing the percentage of ideal that the current price represents.
- Center-aligned in the column.
- Color encoded:
  - 90% to 110%: green chip (`success`), label "100%" or whatever the actual value is.
  - 70% to 89% or 111% to 130%: warning chip.
  - Below 70% or above 130%: error chip.
- When PRICE is empty (missing price), this cell shows nothing or a neutral em-dash equivalent (use a hyphen, not an em-dash, per user preference).

---

## 7. Row treatment

### 7.1 Row borders

- Faint horizontal divider between rows: 1px solid `divider` with low opacity, or simply `grey.100`.
- No vertical borders between cells inside a row.
- Hover on row: very faint `action.hover` tint across the entire row to indicate the active row.

### 7.2 Dirty row indicator

Per §5.3, edited rows get a 2px `primary.main` left border accent on the row's leading edge. This is the only per-row visual signal of dirty state in this pass (since the Status indicator column was removed).

### 7.3 Missing price row indicator

When a row has no price set:

- The PRICE cell shows a faint placeholder or empty input affordance with a subtle `error.main` left border accent on the PRICE cell only.
- Optional: very faint red tint on the PRICE cell background.
- Do not tint the entire row red. Keep the visual cost low.

---

## 8. Pagination footer

The footer stays anchored to the bottom of the grid. The current implementation is mostly fine but adjust:

- Background: `grey.50` or `action.hover` tint to anchor visually.
- Border-top: 1px `divider`.
- Layout: row count on the left ("1 to 50 of 936 rows"), rows per page dropdown in the center, prev/next arrows on the right.
- Larger touch targets on prev/next than the current implementation.

The Save Changes button is NOT in the footer in this pass. It is in the toolbar (per §3.2).

---

## 9. Spacing and rhythm

These spacing values produce the visual rhythm shown in the mockup:

- Gap between Header row and Stepper: 16px
- Gap between Stepper and Stat card row: 24px
- Gap between Stat card row and Toolbar: 16px
- Gap between Toolbar and Grid: 16px
- Stat card horizontal gap: 12px
- Toolbar internal gaps: 8px between buttons in the same group, 24px between left and right regions
- Grid cell horizontal padding: 12px to 16px
- Grid cell vertical padding: 8px to 12px

Use the MUI spacing scale (`theme.spacing(1)` = 8px). Do not invent new pixel values. Stick to multiples of 4 or 8.

---

## 10. Color palette compliance

Colors used in this rebuild come from the existing theme. Do not introduce new tokens.

- Page background: `#F4F1EB` (cream, unchanged from current).
- Card and panel backgrounds: white (`background.paper`).
- Primary CTA (Finalize, active Save Changes): `primary.main` (`#2E7D32`).
- Success states (zero missing price card border, in-tolerance vs ideal): `success.main`.
- Error states (non-zero missing price card border, missing price PRICE cell, far-out-of-tolerance vs ideal): `error.main`.
- Warning states (mid-tolerance variance): `warning.main`.
- Body text: `text.primary`.
- Secondary text and column headers: `text.secondary`.
- Borders: `divider`.

---

## 11. What the previous screenshot got wrong (specific, by element)

For the coder to verify the rebuild has actually happened, here is the specific list of defects in the previous screenshot that this rebuild must eliminate:

1. The chip cluster `Paid $X / Ideal $Y / Set $Z / -23.5% vs ideal / 936 units / 0 missing price` must be gone, replaced by the six-card row in §2.
2. The success banner "Final review complete: all staged rows are priced" must be gone.
3. The horizontal scrollbar at the bottom of the table must be gone. All columns fit in viewport.
4. The Description column must no longer consume disproportionate width. Title is the prominent value, description is secondary.
5. The "AI: [identical title] Apply" line under every row must be gone when AI matches the current title. It only appears when AI differs.
6. The Brand column must be visible without scrolling.
7. Rows must show at least 12 to 15 per 1080p viewport at default density. Currently shows 5 to 6.
8. The Save Changes button must show a count `(N)` and must visually communicate when there are or are not unsaved changes.
9. The "0 missing price" indicator must be a clear "all clear" signal (green border around the stat card) rather than a green pill chip in a row of orange chips.
10. The "23.5% vs ideal" indicator must use color appropriate to severity (within tolerance is neutral, outside is warning, far outside is error). Not always orange.

If any of these defects survive into the next screenshot, the rebuild has not landed.

---

## 12. Out of scope for this pass

To keep the visual rebuild focused, defer these to a later pass:

- Selection-based bulk actions (checkbox column, "Select all visible," confirmation modals at greater than 10 rows). **Bulk actions in this pass operate on all visible filtered rows**, matching current behavior.
- Status indicator column.
- Row expand panel.
- AI flagged and Unsaved filter chips.
- Virtualization. The current pagination strategy is acceptable until visual layout is stable.
- Keyboard shortcuts beyond what already exists.
- Navigation guard for unsaved changes (still recommended, but not blocking on the visual rebuild).

These are real features that should land. They do not land in this pass. Ship the visual rebuild first.

---

## 13. Implementation order for this pass

In order, smallest-to-largest blast radius:

1. **Update stepper labels and Finalize button copy.** "Manual Review" and "Finalize and Open Processing" with arrow icon. (Trivial, ship first.)
2. **Build the six-card stat row.** Replace the chip cluster. Wire to existing computed values. (Self-contained.)
3. **Restyle the toolbar.** Single row, two regions, move Save Changes to the right region with count. Remove "Select Visible" and "Clear Select" buttons. (Self-contained.)
4. **Refactor the table columns.** Drop checkbox, expand, status indicator, separate Description column. Add VS IDEAL column. Cap column widths. Validate no horizontal scroll. (Highest blast radius. Ship in isolation.)
5. **Update the DESCRIPTION / TITLE cell.** Title bold, description below, conditional Apply button. (Needs the column refactor first.)
6. **Update PRICE cell with minus and plus buttons.** (Needs the column refactor first.)
7. **Update CATEGORY and CONDITION cells.** Chip with dropdown for Category, inline select for Condition. (Self-contained per cell.)
8. **Add color-encoded states to MISSING PRICE and % VS IDEAL stat cards.** (Polish layer.)
9. **Tighten spacing per §9.** (Final visual pass.)

Each step ships independently. Steps 1, 2, and 3 should land in a single PR. Step 4 is its own PR. Steps 5 through 9 can batch.

---

## 14. Done definition

This rebuild is done when:

- A screenshot of the page side-by-side with the mockup is visually equivalent.
- All ten defects in §11 are eliminated.
- The page renders 80 units (the mockup's example PO size) without a horizontal scrollbar at 1280px viewport width.
- The page renders 936 units (the previous screenshot's example PO size) without a horizontal scrollbar at the same width.
- The MISSING PRICE card border is green when count is 0 and red when count is greater than 0, and the surrounding UI does not have any redundant "all clear" or "X missing" indicators.
- The Save Changes button shows `(0)` or `(N)` in its label at all times.
- The DESCRIPTION / TITLE cells do not show an Apply button or AI text when the AI title equals the current title.
