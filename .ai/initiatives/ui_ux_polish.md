<!-- initiative: slug=ui-ux-polish status=active updated=2026-04-12 -->
<!-- Last updated: 2026-04-13T12:00:00-05:00 -->
# Initiative: UI/UX polish and metric corrections

**Status:** Active

---

## Context

Post-**v2.11.1** production deployment. The app is live with full backfill data, cost pipeline, and category need panel. This initiative covers UI/UX improvements, metric corrections, and display fixes identified during the **v2.11.0**–**v2.11.1** development cycle.

---

## Objectives

1. Polish the user-facing experience across buying, inventory, and dashboard pages.
2. Fix metric calculations that mix time windows incorrectly (starting with category need — **Phase 1**).
3. Address roughly **25** UI/UX items Bill has identified (**Phase 2+**, list to be added).

---

## Phase 1: Category need metric windowing fix

### Problem

The category need panel mixes 90-day windowed data with all-time data inconsistently:

- **`sell_through_pct` (Thru)** divides windowed sold by (windowed sold + all-time shelf) — inconsistent units.
- **`need_gap`** subtracts all-time shelf share from windowed sold share — **intentional** (“recent selling share vs what’s on the shelf”); **keep as-is**.
- **`avg_cost`**, **`profit_per_item`**, **`profit_sales_ratio`**, **`return_on_cost`** were windowed to 90 days but should be **all-time** for more stable estimates.

### Fix (decided by Bill)

All metrics should be **all-time** except:

| Metric | Window |
|--------|--------|
| **`sold_count`** | 90-day (windowed) |
| **`sold_pct`** | 90-day (share of store-wide sold in window) |

**Changes in `build_category_need_rows`** ([`apps/buying/services/category_need.py`](../../apps/buying/services/category_need.py)):

| Field | Change |
|-------|--------|
| **`avg_sale`** | All-time — remove `sold_at__gte=since` for this aggregation |
| **`avg_retail`** | All-time |
| **`avg_cost`** | All-time |
| **`profit_per_item`** | All-time (paired sale/cost over all-time sold lines) |
| **`profit_sales_ratio`** | All-time |
| **`return_on_cost`** | All-time |
| **`sell_through_pct`** | All-time numerator and denominator: **all-time sold / (all-time sold + current shelf)** |

**Unchanged:**

- **`shelf_count`** / **`shelf_pct`** — all-time current on-shelf (already correct).
- **`sell_through_rate`** — from **`PricingRule`**, not item loops (already correct).
- **`need_gap`** — **`sold_pct` (windowed) − `shelf_pct` (all-time)** — intentional.

---

### Implementation plan (`category_need.py`)

**Current behavior (single sold queryset):** `sold_qs` filters `status='sold'` and `sold_at__gte=since`. One iterator fills **`_Agg`**: **`sold_count`**, sale/retail/cost sums, and paired profit fields — so everything except shelf is windowed.

**Target behavior:**

1. **Introduce `all_time_sold_qs`** — same filters as **`sold_qs`** except **omit** `sold_at__gte=since` (still `status='sold'` and the sale/price nullability filter, **`select_related('product')`**).

2. **Extend `_Agg`** (or add a parallel structure) so windowed and all-time sold facts are separate:
   - **`sold_count`** — only incremented in a pass over **`sold_qs`** (unchanged semantics).
   - **`all_time_sold_count`** — count of sold items per bucket from **`all_time_sold_qs`** (for **`sell_through_pct`** denominator with shelf).
   - **`sum_sale`**, **`sale_lines`**, **`sum_retail`**, **`retail_lines`**, **`sum_cost`**, **`cost_lines`**, **`paired_sale`**, **`paired_cost`**, **`paired_count`** — populated **only** from the **`all_time_sold_qs`** iterator (same body as today’s sold loop for those fields, but no window filter).

3. **Order of passes** (to keep logic clear):
   - Shelf iterator → **`shelf_count`** (unchanged).
   - All-time sold iterator → financial aggregates + **`all_time_sold_count`** per category.
   - Windowed sold iterator → **`sold_count`** only (lightweight second pass).

4. **`total_sold`** for **`sold_pct`** — still **`sum(per[b].sold_count)`** (windowed only); **do not** use all-time sold count here.

5. **`sell_through_pct`** per row:
   - **`denom_movement = all_time_sold_count + shelf_count`**
   - **`sell_through_pct = (all_time_sold_count / denom_movement * 100)`** when **`denom_movement > 0`**, else **0** (same pattern as today, different inputs).

6. **Docstring** — Update the function docstring: clarify that shelf % / sold % semantics stay as today; financials and Thru use all-time sold.

7. **Tests** — [`apps/buying/tests/test_valuation.py`](../../apps/buying/tests/test_valuation.py) currently only asserts **`sell_through_rate`** from **`PricingRule`**. After implementation, add or extend tests if you want locked expectations on **`sell_through_pct`** or averages (optional but recommended for regression).

8. **API/FE** — Response shape unchanged; React types need no change unless labels/tooltips should explain “90d” vs “all-time” (defer to Phase 2 UX if desired).

---

### Phase 1 verification

1. `python manage.py check`
2. Run dev server; open category need panel — profit and Thru numbers should shift (profit metrics reflect all-time, not 90 days only).
3. `cd frontend && npx tsc --noEmit`

---

## Phase 2+ (placeholder)

Roughly **25** UI/UX items Bill has identified — **to be listed** in this file when scoped.

---

## Sessions

### Session 1 — 2026-04-12T18:00:00-05:00

- **Goal:** Create initiative, index entry, and written implementation plan for Phase 1 category need fix; no code changes until **Build**.
- **Finish line:** **`ui_ux_polish.md`** and **`_index.md`** updated; Phase 1 plan approved for implementation.
- **Scope:** Documentation and planning only; **`category_need.py`** implementation is a follow-up after **Build**.
- **Est:** 0.5h
- **Ship:** Accumulate; no version bump this session.

#### Session updates

- `2026-04-13T12:00:00-05:00` **Checkpoint** — Phase 1 **implemented** (not just planned): `category_need.py` all-time vs 90-day windowing per initiative table; `CategoryNeedBars.tsx` layered blue/red bars; `test_valuation.py` `CategoryNeedWindowingTests`. **Memory/performance overhaul** (same deployment train): `max_page_size` 200; Gunicorn `--workers 2` + worker recycle; Django **database cache** + TTL on `item_stats` global block and `category_need` panel; PO list queryset annotations + list no longer prefetches manifest/batch rows; `PurchaseOrderSerializer.get_processing_stats` uses annotations when present; `_item_stats_payload` single aggregate; ProcessingPage **`useItemsAllPages`** + item filter param **`q`**; server-side pagination + `keepPreviousData` / 5m `staleTime` on orders, items, carts; ItemForm PO/agreement **async** search (`page_size` 20) + `useAgreement` / `usePurchaseOrder` for selected row; consignment agreements **`SearchFilter`**; `docs/operations/heroku-memory.md`. **Revised scope:** Session 1 “no code until Build” was superseded by Agent implementation pass. **Parking (session_close):** semver / dated `CHANGELOG` section, `.version`, `commit_message.txt` lines 2+, full pre-commit matrix.

---

## See also

- [`.ai/context.md`](../context.md) — project state
- [`.ai/extended/frontend.md`](../extended/frontend.md) — React / buying UI
- [`.ai/initiatives/bstock_auction_intelligence.md`](bstock_auction_intelligence.md) — buying valuation / category need product context
