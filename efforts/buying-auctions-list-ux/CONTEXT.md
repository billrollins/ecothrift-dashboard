# Effort: Buying → auctions list UX (Inventory Need)

**Effort folder:** `efforts/buying-auctions-list-ux/` (committed). Optional mirror: **`workspace/buying-auctions-list-ux/CONTEXT.md`**.  
**Last updated:** 2026-04-17  

**How to use:** Read **after** `.ai/protocols/startup.md` (and `.ai/context.md`) when this thread is in scope. Supplements modular docs; does not replace initiatives or extended domain files.

---

## Where this lives in the app

- **Route:** `/buying/auctions` (see `frontend/src/App.tsx`).
- **Page:** `frontend/src/pages/buying/AuctionListPage.tsx` — search/filters wrapped in `Paper` (outlined), tightened vertical spacing between blocks.

---

## Inventory Need (main focus)

**Mental model:** Not a second page title. A **collapsible utility** above the auctions table: one bordered panel, header bar toggles **closed vs open** (no third “full” height state). **Open** height follows the **right detail card**; category list on the left scrolls vertically inside the panel.

### Components

| File | Role |
|------|------|
| `frontend/src/components/buying/CategoryNeedPanel.tsx` | Shell: header (click/caret to expand), `localStorage` key `buying.categoryNeedPanelSize` maps legacy `full` → `window`. Left: `CategoryNeedBars`. Right: `CategoryNeedDetail`. |
| `frontend/src/components/buying/CategoryNeedBars.tsx` | Category table + small distribution bars. Columns include **Shelf**, **Sold** (window), **n** (good-data cohort row count), **Margin**, **Recovery**, **Need**. Dynamic column widths via `ResizeObserver` + `measureTextWidth` (`frontend/src/utils/measureTextWidth.ts`). **Gap** in grid must stay explicit **`'4px'`** in `sx` — numeric `gap` is theme spacing, not pixels (was a horizontal scrollbar bug). Sort on all columns; columns right of distribution: **headers and values center-aligned**; “Need” spelled out, not “N”. |
| `frontend/src/components/buying/CategoryNeedDetail.tsx` | Sticky right **card**; **fixed width 440px** (was 320px — widened for formula explainer). “How is this calculated?” expander with structured **Unit leg / Retail leg / Combined / Need score** blocks. **Profitability**: row 1 avg retail / avg sale / recovery rate; row 2 avg cost / avg profit / profit margin. **Flow**: distribution on shelf %, distribution of sold %, gap. |
| `frontend/src/theme/index.ts` | Font metrics referenced for text measurement consistency. |

### Small behavioral / UX details

- **Selection:** When rows exist, **never leave no category selected** — default to **first row** (and re-sync if the list changes).
- **Bars:** Short indicators, left-aligned in cells; category column shows full text until distribution column hits **min**, then category may truncate; distribution can drop if still too tight.
- **Detail explainer:** Each block shows a **title line** like `Unit leg = 1.07` (value emphasized). Below: monospace **variable lines** (`shelf_units`, `sold_units`, etc.) with aligned `=` and short italic notes. Then a **formula line**: `[formula] = [numbers substituted] = result`.  
  - **Unit leg:** `sold_units / shelf_units` (display matches backend `need_raw_unit_leg`).  
  - **Retail leg:** `sold_retail / shelf_retail`.  
  - **Combined:** `(unit_leg + retail_leg) / 2`.  
  - **Need score:** linear map from `combined` between global `min_raw` / `max_raw` to 1–99 (formula shown; tie case still explained when bounds equal).

### Data quality (affects **n**, **Margin**, **Recovery**, Profitability tiles)

**v2.17.0** good-data metrics use sold rows with **sale, retail, cost** each **$0.01–$9,999**. **`Item.cost`** comes from **`PurchaseOrder.compute_item_cost`** (`item.retail / (PO.retail × (1 − shrink)) × total_cost`). If **`PurchaseOrder.retail_value`** is wrong (e.g. some backfills stored listing total **~100×** too low vs **`notes`** JSON **`ext_retail`**), every line cost is inflated and **Margin** / **avg cost** / **n** look wrong. Fix **`PO.retail_value`** to the true listing total, then run **`python manage.py recompute_all_item_costs`** and **`python manage.py compute_daily_category_stats`**. See **CHANGELOG [Unreleased]**, **`.ai/extended/backend.md`** (Item acquisition cost).

---

## Commands / safety (repo rule)

- B-Stock manifest API is paginated (~10 items/page); **do not** run bulk pull/sweep commands without counting calls. See `.cursor/rules/bstock-api-safety.mdc`. Frontend-only work does not hit B-Stock.

---

## Likely next steps (not assigned)

- Continue polishing **auctions list** or move to **auction detail** / **watchlist** per user.
- User may want different **440px** width or responsive `min()`/`max()` width — confirm visually.
