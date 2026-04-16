<!-- Last updated: 2026-04-16 (v2.17.0 category need Margin + Profitability) -->
# UI/UX Design Specification

## Document Purpose

This spec captures every design decision, pattern, and rule used across the Eco-Thrift Dashboard. It started from a consultant review of the auction detail page (v2.15.0) but is intended as the **authoritative design reference** for the entire application. When building new pages or components, follow these rules unless the user explicitly overrides them.

---

## Design Philosophy

Every page exists to support a **user decision or action**. Elements must either directly enable that action or provide evidence the user needs to decide. If a component doesn't serve the page's core question, it should be minimized, collapsed, or removed from the primary view.

**Organize around the decision flow, not data categories.** Instead of grouping by data type (costs card, details card, categories card), group by decision step:

1. **Urgency** — What's time-sensitive? (deadlines, competition, status)
2. **Assessment** — How good is this? (margin, price position, risk summary)
3. **Analysis** — What are the details? (costs, revenue, category breakdown)
4. **Action** — What should I do? (bid, archive, edit, approve)

---

## Page Layout Patterns

### Decision-flow page (auction detail, future evaluation pages)

```
┌─────────────────────────────────────────────────────────┐
│  Title + action buttons                                  │
├─────────────────────────────────────────────────────────┤
│  URGENCY STRIP (full-width, real-time data only)        │
├─────────────────────────────────────────────────────────┤
│  DECISION SUMMARY (synthesized recommendation)          │
├──────────────────────────────┬──────────────────────────┤
│  Analysis card 1             │  Analysis card 2          │
├──────────────────────────────┼──────────────────────────┤
│  Analysis card 3             │  Analysis card 4          │
├──────────────────────────────┼──────────────────────────┤
│  Analysis card 5             │  Analysis card 6          │
├──────────────────────────────┴──────────────────────────┤
│  Detail tables / supplementary content                   │
└─────────────────────────────────────────────────────────┘
```

**Grid:** CSS Grid (`display: grid`), `gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }`, `gap: 1.5`, `alignItems: 'stretch'`. Cards fill their grid cell height naturally.

**Responsive:** Single column below `md` breakpoint. Real-time/urgency elements should never scroll off screen on mobile.

### List page (auction list, inventory, orders)

Title + filter chips, then DataGrid (desktop) or card list (mobile). Filters use chip toggle pattern. Summary counts above the grid when applicable.

---

## Color System

### Semantic Colors (Used Consistently Everywhere)

| Purpose | MUI token | Hex (light theme) | Usage |
|---------|-----------|-------------------|-------|
| Positive / safe | `success.main` | `#2E7D32` | High category recovery, strong margin, target zone, profit positive, high need score (>=60) |
| Caution / moderate | `warning.main` | `#ED6C02` | Mid recovery (see threshold table), moderate margin, time running low (<4h), need 30-59 |
| Danger / risk | `error.main` | `#D32F2F` | Low recovery, thin/negative margin, near breakeven, time critical (<1h), loss |
| Default metric | `#9A8866` | (warm ochre) | System-calculated values in editable fields (not overridden) |
| Overridden value | `text.primary` | (standard dark) | User-set override values; `fontWeight: 600`, left accent border `primary.main` |
| Neutral / static | `text.secondary` | (gray) | Labels, captions, secondary text, empty state dashes |

### Rules

1. **Never use color alone** — always pair with text labels or icons for accessibility.
2. **Same color = same meaning everywhere.** Green = good/safe. Red = risk/danger. No exceptions.
3. **Background tints** use very low opacity (3-4% for ambient urgency, 10-15% max for interactive hover). Reserve full saturation for small elements: chips, dots, left borders.
4. **Urgency backgrounds** — `rgba(211, 47, 47, 0.04)` for critical, `rgba(237, 108, 2, 0.03)` for soon. These are computed from semantic colors, not hardcoded.

### Threshold Tables (Reuse Across All Components)

**Time remaining:**

| Condition | Color | Weight | Animation |
|-----------|-------|--------|-----------|
| > 24h | `text.primary` | 600 | none |
| 4h – 24h | `warning.dark` | 600 | none |
| 1h – 4h | `warning.main` | 700 | none |
| < 1h | `error.main` | 700 | `urgentPulse` 2s infinite |

**Need score (1–99):**

| Range | Color |
|-------|-------|
| >= 60 | `success.main` |
| 30 – 59 | `warning.main` |
| < 30 | `text.secondary` |

**Recovery rate** (category mix table; `SUM(sold_for)/SUM(retail_value)`, typical thrift ~0.20–0.45):

| Range | Color |
|-------|-------|
| >= 35% | `success.main` |
| 20% – 34% | `warning.main` |
| < 20% | `error.main` |

**Margin / price ratio (current / breakeven):**

| Range | Color |
|-------|-------|
| < 50% | `success.main` (strong margin) |
| 50% – 80% | `warning.main` |
| > 80% | `error.main` (near breakeven) |

**Profitability ratio:**

| Range | Color |
|-------|-------|
| >= 1.5x | `success.main` |
| 1.0x – 1.5x | `warning.main` |
| < 1.0x | `error.main` |

**Condition (qualitative):**

| Value | Chip color |
|-------|-----------|
| New / Like New | `success` |
| Used Good / Good | `primary` |
| Used Fair / Used / Fair | `warning` |
| Salvage / Damaged | `error` |
| Other | `default` |

---

## Typography

### Hierarchy

| Level | MUI variant | Usage | Weight |
|-------|-------------|-------|--------|
| Page title | `h5` or `subtitle1` | Lot name, page heading | 600 |
| Section header | `BuyingDetailSectionTitle` | Card section titles ("Costs & revenue", "Category mix") | 800, `text.primary` |
| Hero value | `h4` | Countdown timer, primary data point | 800 |
| Prominent value | `h5` | Current price, bid count in urgency strip | 700 |
| Card value | `h6` | Max bid amounts in tiles | 800 |
| Body value | `body2` | Most metric values, grid cell values | 600–700 |
| Caption / label | `caption` | Field labels above values | 400, `text.secondary` |
| Micro label | `caption` at `0.65rem` | Compact grid labels (inside dense metric grids) | 400 |
| Section sublabel | `caption` at `0.6rem` | Above hero values in urgency strip | 400 |

### Rules

1. **`fontVariantNumeric: 'tabular-nums'`** on ALL numeric displays (prices, counts, percentages, ratios). This ensures columns align and values don't shift width as digits change.
2. **No inline helper text.** Developer-facing explanations ("Override ($); default = rate x price") belong in **Tooltips** on the label, triggered by hover on an info icon or the label itself. Never as permanent visible captions.
3. Section headers use **`fontWeight: 800`**, **`text.primary`** color. Not subtle pastel colors.
4. **Uppercase micro-labels** (`textTransform: 'uppercase'`, `letterSpacing: 0.5`, `fontSize: '0.65rem'`) for section dividers within a card (e.g., "INPUTS", "CALCULATED").

---

## Spacing & Layout

### Card internals

- Card padding: `p: 1.25` (MUI spacing = 10px)
- Gap between metric grid cells: `gap: 1` (8px)
- Gap between major sections within a card: `mb: 1.25` (10px)
- Label-to-value spacing: `mb: 0.2` (caption to value below it)
- `Divider` between sections within a card: `mb: 1.25` on both sides

### Grid cells

- Main analysis grid: `gap: 1.5` (12px)
- Urgency strip / decision summary: `mb: 1.5` from each other and from the grid
- Cards use `variant="outlined"` (`Card`), not `Paper` with elevation

### Responsive

- Grid: `gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }`
- Inner metric grids: `{ xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' }`
- Single-column stacks on `xs`/`sm`; two-column on `md+`

---

## Interaction Patterns

### Inline editing (override fields)

The pattern for editable values (fees, shipping, shrinkage, profit goal, revenue):

**Default state:**
- Value displayed as `Typography` with `cursor: pointer`
- Warm ochre color (`#9A8866`) when showing system default
- Subtle `EditOutlined` pencil icon (opacity 0.4, 14px) appears to the right
- On hover: pencil opacity increases to 1

**Editing state:**
- Click transforms the value into a compact `TextField` (128px wide)
- Green `CheckIcon` (save) and `CloseIcon` (cancel) appear as `IconButton`s
- `Enter` saves, `Escape` cancels
- Auto-focus on the text field

**Override state:**
- Value text switches to `text.primary` color with `fontWeight: 600`
- Left accent border (`borderLeft: 2px solid`, `borderLeftColor: primary.main`)
- "Reset" button appears where applicable

### Empty states

**Use em-dashes (`'—'`) for all missing/null values.** Not "Not set", not "N/A", not blank. The `formatCurrency` and `formatCurrencyWhole` utilities already return `'—'` for null. Apply the same in all custom displays.

Style empty dashes in normal-weight `body2` typography. Never italic, never a different font size.

### Action button hierarchy

| Priority | Variant | Color | Example |
|----------|---------|-------|---------|
| Primary action | `contained` | `primary` | "Refresh" (pull B-Stock state on auction detail), "Choose file" |
| Secondary action | `outlined` | default | Secondary toolbar actions (e.g. list sweep) |
| Destructive | `text` | `error` | "Archive", "Remove" |
| Tertiary / link-style | `text` | `primary` | "Replace manifest", "Download from B-Stock" |

### Chips

- Status chips: `variant="outlined"`, `size="small"`, semantic `color` where applicable
- Condition chips: `variant="outlined"`, `size="small"`, color-mapped (see threshold table)
- Risk/signal chips: `variant="outlined"`, `size="small"`, `height: 22`, label `px: 0.75, fontSize: '0.7rem'`

### Tooltips

- All technical helper text lives in Tooltips, not inline captions
- `enterDelay={200-300}` to avoid flickering on mouse movement
- Info icons (`InfoOutlined`, 16px) for explicit "what is this?" tooltips
- Label text itself wrapped in `Tooltip` for implicit "explain this field" help (`cursor: 'help'`)

---

## Component Patterns (Implemented v2.15.0)

### Urgency Strip (`AuctionUrgencyStrip`)

Full-width `Paper variant="outlined"` between action row and analysis grid. Contains ONLY real-time changing data:

| Element | Position | Style |
|---------|----------|-------|
| Time left | Left | `h4`, `fontWeight: 800`, color from `timeRemainingDetailSx`, pulse under 1h |
| Current price | Center-left | `h5`, `fontWeight: 700`, `tabular-nums` |
| Bid count | Center-right | `h5`, with "No competition" caption when 0 bids on open auction |
| Status chip | Right | `Chip size="small" variant="outlined"` |

Grid: `{ xs: '1fr 1fr', sm: 'auto 1fr 1fr auto' }`. Background tints by urgency (see color system). Micro-labels (`0.6rem`) above each value.

### Decision Summary (`AuctionDecisionSummary`)

Horizontal `Box` with left color border (4px, green/amber/red based on overall signal). Contains:

- **Margin text**: "Current price is X% of breakeven" (body2, fontWeight 600)
- **Risk chips**: Low recovery categories, low inventory demand (warning), no competition + wide margin (success)

Auto-hides (returns null) when there's insufficient data to compute anything.

### Bid Reference Card (`AuctionBiddingCard`)

Grid cell holding static bid-decision data (NOT real-time). 3x2 inner grid:

| Field | Behavior |
|-------|----------|
| Priority | Admin: editable `TextField` (1-99, save on blur); non-admin: read-only |
| Need score | Color-coded by threshold, tooltip: "Inventory demand (1–99). Higher = more needed." |
| Buy now | `formatCurrency` |
| Starting price | `formatCurrency` (moved from AuctionDetailsInfoCard) |
| Est. profit | Color-coded green (positive) / red (negative) |
| Profitability | Color-coded by ratio threshold, tooltip explains |

### Max Bid Gauge (`ValuationMaxBidCard`)

Three tile boxes with **color-differentiated left borders** (error.light / warning.light / success.light for breakeven / moderate / target).

Below tiles: **multi-tick gauge** — 10px track (`borderRadius: 5`), positioned tick marks at breakeven/moderate/target as fraction of target*1.15, current price as an 8px dot. Background fill to current price with opacity 0.35, colored by margin ratio. Labels below gauge show dollar values at each tick. Margin text: "Current margin: X.Xx breakeven".

### Costs & Revenue Card (`ValuationCostsCard`)

Two visually distinct sections:

**Inputs** (tinted `action.hover` bg, rounded corners, `p: 1.25`):
- "INPUTS" uppercase micro-label
- Current price (read-only), Fees, Shipping, Shrinkage, Profit goal, Revenue pre-shrink
- All editable fields use the inline editing pattern

**Calculated** (default bg, below a `Divider`):
- "CALCULATED" uppercase micro-label
- Total cost, Expected revenue (after shrink), Est. profit (color-coded), Margin % (color-coded)

### Category Table (`ValuationCategoryTableCard`)

Fixed-layout `Table` with sticky header, scroll body (`maxHeight: 280px`), pinned footer.

Color-coded columns:
- **Need metric**: by need score thresholds
- **Recovery**: by recovery rate thresholds (green >= 35%, amber 20–34%, red < 20%, fontWeight 600)

### Category need table (`CategoryNeedBars`, auction list panel)

Dense grid: **Category**, **Distribution** (shelf vs window-sold share), **Shelf**, **Sold**, **n** (good-data cohort count), **Margin**, **Recovery**, **Need** (1–99). Detail card (**`CategoryNeedDetail`**) — **Profitability**: row 1 avg retail / avg sale / recovery rate; row 2 avg cost / avg profit / profit margin. **Flow**: shelf distribution %, sold distribution %, gap.

### Auction Details (`AuctionDetailsInfoCard`)

Static reference card. Notable patterns:
- **Total retail**: highlighted box (`action.hover` bg, border)
- **Lot size**: shows count + derived "~$XXX/item" avg retail per item
- **Condition**: color-coded `Chip` (see threshold table)
- **Listing type**: with info tooltip explaining the code
- **No starting price** (moved to BiddingCard)

### Manifest Card (in AuctionDetailPage)

**Two states:**

**No manifest loaded:**
- Full drop zone (dashed border, 260px min-height, centered text + "Choose file" button)
- "Download from B-Stock" as tertiary text link below
- Card is the entire drop target

**Manifest loaded:**
- Compact metadata box: row count, categorized count, template name, manifest retail total
- `AiManifestComparisonStrip` (AI vs manifest comparison)
- Single-line replace zone: "Replace manifest" text button + "Remove" error text button
- Whole card still functions as drag target (visual feedback only on drag-over)
- No giant drop area consuming screen space during active analysis

---

## Anti-patterns (Things We Don't Do)

1. **No inline helper text** — "Override ($); default = rate x price" as permanent visible text. Use Tooltips.
2. **No bare italic "Not set"** — Use em-dash `'—'` in normal typography.
3. **No equally-styled boxes** that should communicate a gradient (e.g., breakeven/moderate/target need different visual weight).
4. **No full-width input fields** for values that are 6-8 characters wide. Match input width to expected content.
5. **No editorial commentary in urgency zones** — "No bids yet - early opportunity" is interpretation. Raw data goes in urgency; interpretation goes in the decision summary.
6. **No Paper with elevation** for card containers — use `Card variant="outlined"`.
7. **No `Grid` component** for page layout — use CSS Grid via `Box sx={{ display: 'grid' }}`.
8. **No color as the only indicator** — always pair with text or icons.

---

## Implementation Status (v2.15.0)

| Spec Component | Status | Notes |
|----------------|--------|-------|
| Urgency strip | **Shipped** | `AuctionUrgencyStrip.tsx` |
| Decision summary | **Shipped** | `AuctionDecisionSummary.tsx` |
| Bid reference card | **Shipped** | `AuctionBiddingCard.tsx` (replaces AuctionEndDetailsCard) |
| Multi-tick gauge | **Shipped** | In `ValuationMaxBidCard`, `AuctionValuationCard.tsx` |
| Costs input/output split | **Shipped** | In `ValuationCostsCard`, `AuctionValuationCard.tsx` |
| Condition chips | **Shipped** | `AuctionDetailsInfoCard.tsx` |
| Recovery color | **Shipped** | In `ValuationCategoryTableCard`, `AuctionValuationCard.tsx` |
| Avg retail/item | **Shipped** | `AuctionDetailsInfoCard.tsx` |
| Compact manifest | **Shipped** | `AuctionDetailPage.tsx` |
| Bid action bar | **Not applicable** | Bidding happens on bstock.com, not in-app |
| Responsive/mobile | **Partial** | Grid stacks on xs; urgency strip responsive; no sticky bars yet |
| Keyboard shortcuts | **Future** | Power-user feature for multi-lot evaluation sessions |
| Historical context | **Future** | Similar lot comparison, relist detection — Phase 6+ |

---

## Applying These Patterns to New Pages

When building a new page or component:

1. **Identify the core question** the page answers.
2. **Order content by decision flow** (urgency → assessment → analysis → action), not by data category.
3. **Use the color system** from the threshold tables above. Copy the helper function patterns (`needScoreColor`, `conditionChipColor`, recovery cell styling).
4. **Use the typography hierarchy** — `BuyingDetailSectionTitle` for card headers, `body2` with `tabular-nums` for values, `caption` at `0.65rem` for micro-labels.
5. **Card style** — `Card variant="outlined"`, `p: 1.25`, CSS Grid for multi-card layouts.
6. **Editable fields** — follow the `ValuationInlineField` pattern (ochre defaults, pencil icon, inline edit with save/cancel).
7. **Empty states** — em-dash, never italic "Not set".
8. **Tooltips** — all technical explanation in hover tooltips, not permanent visible text.
