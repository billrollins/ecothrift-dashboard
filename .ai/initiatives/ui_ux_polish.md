<!-- initiative: slug=ui-ux-polish status=active updated=2026-04-14 -->
<!-- Last updated: 2026-04-14T18:30:00-05:00 -->
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

### Session 2 — 2026-04-13 (Phase 2 polish)

- **Ship:** Enter-to-commit search on **ItemListPanel** and **TransactionListPage** (draft vs committed `q` / `receipt_number`, Search + Clear, helper copy). **`PurchaseOrderListSerializer`** + **`has_manifest`**; list queryset skips PO stats annotations; frontend **`PurchaseOrderListRow`**. **ItemForm** Add Item: taxonomy **`Autocomplete`**, **`retail_value`**, validation, brand default **Generic**; AI **`suggest_item`** / **`ai_cleanup_rows`** default **`AI_MODEL_FAST`**; taxonomy prompt + one category retry + fallback **`Mixed lots & uncategorized`**.

#### Session updates

- `2026-04-13T12:45:00-05:00` **Checkpoint** — Phase 2 implementation **landed in working tree** (not yet committed): `ItemListPanel` / `TransactionListPage` commit-on-enter search; `PurchaseOrderListSerializer` + `has_manifest`, lighter PO list queryset; `PurchaseOrderListRow` + call sites; `ItemForm` taxonomy `Autocomplete`, `retail_value`, create validation, brand default **Generic**; `taxonomyV1` helpers (`MIXED_LOTS_UNCATEGORIZED`, `isTaxonomyV1CategoryName`); `suggest_item` / `ai_cleanup_rows` → `DEFAULT_AI_FAST_MODEL`, taxonomy prompt + category retry + fallback; `_suggest_item_parse_suggestions_from_text` + test in `test_category_taxonomy.py`. **`CHANGELOG`** `[Unreleased]` updated this pulse. **Parking (session_close):** semver / dated section, `.version`, `commit_message.txt` lines 2+, full pre-commit matrix when cutting release.
- `2026-04-13T13:30:00-05:00` **Session close** — **`v2.11.2`** dated `CHANGELOG` section; `.version` + root `package.json` bumped; `commit_message.txt` set for this release.

#### Result

committed as **v2.11.2** (release includes `CHANGELOG` **2.11.2**, `.version`, root `package.json`; initiative + `_index` session-close lines).

### Session 3 — 2026-04-13 (v2.12.0 release + item list count cache)

- **Goal:** Session close at **v2.12.0** (minor) consolidating memory/perf, Phase 1–2 UX, and **quick win**: cache **`COUNT(*)`** for unfiltered **`GET /api/inventory/items/`** pagination (`item_list_total_count`, 300s TTL).
- **Ship:** `.version` / `package.json` **2.12.0**; `CHANGELOG` **2.12.0** (merged prior **2.11.2** notes + cache bullet); `ItemListPagination` in `ecothrift/pagination.py`; `ItemViewSet.pagination_class`.

#### Session updates

- `2026-04-13T14:00:00-05:00` **Session close** — **`v2.12.0`** shipped in one commit with cached item list total count.
- `2026-04-13T15:30:00-05:00` **`session_close.md`** — Finalized `#### Result` with short hash; `manage.py check`, `tsc --noEmit`, `compileall` on `apps/`; `.ai/context.md` version pointer; **push** to `origin/main` still pending locally.
- `2026-04-13T15:35:00-05:00` **Docs commit** — `.ai/context.md`, `.ai/consultant_context.md` aligned to **v2.12.0** (session_close Part 2).

#### Result

committed as **v2.12.0** at `eb98f6c` (see `CHANGELOG` **2.12.0**; `ecothrift.pagination.ItemListPagination`).

### Session 4 — 2026-04-14T10:00:00-05:00 (Phase 3A — auction list polish)

- **Goal:** Ship **Phase 3A** of the auction list UX work: demote profitability on the list, show raw need, manifest gold badge, search (commit-on-enter), misc-row Clear, and **reordered columns** — without backend priority/thumbs redesign, top-categories column, or default-sort/filter changes.
- **Finish line:** Auction list loads with the **new column order** (3A table below); **`estimated_revenue`** and **`profitability_ratio`** removed from the list (remain on detail); **`need_score`** shown as a **raw number** (no `NeedPill`); **gold chip** when `has_manifest`; **search** works (commit-on-enter; backend `q` / `search` as needed); **Clear** at the start of the misc filter row resets those filters.
- **Scope:** `AuctionListPage`, `AuctionListDesktop`, `AuctionListMobile`, list-related buying components; buying auction list API filter/search only as required for **H**; no change to valuation math or Heroku jobs in 3A.
- **Est:** 2–3h
- **Ship:** Accumulate; version bump at session close.

#### Scope items (Phase 3A)

**A. Demote profitability**
- Remove **`estimated_revenue`** and **`profitability_ratio`** from the auction **list** table.
- Keep est. revenue and profitability on the **auction detail** page (unchanged visibility there unless a tiny layout tweak is needed).

**B. Raw need score**
- Replace **`NeedPill`** with the **numeric `need_score`** (no High/Some/Low badge).

**F. Manifest gold badge**
- When **`has_manifest`** is true, show a **gold** chip/badge (“final form” / manifest present). Subtle or empty when false.

**H. Search**
- **Commit-on-enter** (and Search button if present), same pattern as Item list / POS.
- Backend: add or extend list **`q`** / **`search`** so terms split on spaces and match with **`ILIKE '%term%'`** AND logic across **`title`** and **vendor/marketplace** (minimum).

**I. Clear (misc filters)**
- **Clear** at the **start** of the second filter row (mirrors marketplace **All**).
- Resets misc chips: has manifest, profitable, needed, thumbs up, watched, etc. (whatever `BuyingFilterChips` controls today).

**K. Column order (3A)**

Reorder desktop (and align mobile card order where practical) to:

| # | Field | Phase 3A notes |
|---|-------|----------------|
| 1 | Watch | See **Watch / thumbs (3A vs 3B)** below |
| 2 | Thumbs up | See **Watch / thumbs (3A vs 3B)** below |
| 3 | Priority | Existing numeric / steppers as today |
| 4 | Need | Raw `need_score` (item **B**) |
| 5 | Vendor | Marketplace chip |
| 6 | Title | *(no “Top categories” column in 3A — **Phase 3B**)* |
| 7 | Price | Current price |
| 8 | Retail | Tooltip manifest vs listing as today |
| 9 | Total cost / retail % | Cost as % of retail |
| 10 | Time left | Unchanged behavior |

**Watch / thumbs (3A vs 3B):** Columns **1** and **2** stay in this order for **3A**, but **full interactivity** (watch from list, thumbs-up **count** on row) is **Phase 3B**. In **3A**, use whatever the API already exposes: e.g. **read-only** watched tint / star state if derivable from existing list+watchlist fetch, **existing** thumbs toggle if it already works in-grid, or **placeholder** empty/read-only cells if promoting watch from detail-only would require **new API** work. Do **not** block 3A on new endpoints.

**Full target order (including deferred column):** When **Phase 3B** ships item **J**, insert **Top categories** between **Vendor** and **Title** (between current #5 and #6 above).

#### Phase 3B (deferred — out of Session 4 scope)

| Ref | Topic | Notes |
|-----|--------|--------|
| **C** | Watch + thumbs on list | Promote watch toggle; thumbs-up **count**; sort/priority tie-ins — interactive list actions |
| **D** | Staff thumbs in need/priority | Backend; design with **L** |
| **E** | Scheduled updates (no token) | Recompute / refresh jobs — may land under **B-Stock Phase 6** or a separate ops initiative |
| **G** | Default sort + completed filter | Session-sticky sort, hide completed by default, `end_time >= yesterday` when showing ended |
| **J** | Top categories column | Serializer / annotation for top 3 cats + % |
| **L** | Need distribution tuning | Backend spread of `need_score`; pairs with **D** |

#### Session updates

- `2026-04-14T12:00:00-05:00` **Checkpoint** — Session 4 **narrowed to Phase 3A** (scope A, B, F, H, I, K); deferred C, D, E, G, J, L documented as **Phase 3B**; finish line, est **2–3h**, Watch/Thumbs 3A placeholder note; **`CHANGELOG`** `[Unreleased]` steering bullet; **`_index.md`** phase note for `ui_ux_polish`.
- `2026-04-14T16:45:00-05:00` **Checkpoint** — **Phase 3A review (Bill)**: list — narrow **Watch** / **Thumbs** icon headers; **read-only priority** (steppers removed); **manifest** column plain Yes/No; **Clear** styled like marketplace **All**; **default list** hides ended auctions (active/open by default). Detail — manifest grid columns **# → … → SKU** with **Ext Retail** and **% of Manifest**; **Update** button calls **`recompute_valuation`** (no token). Aggregate **thumbs-up count** deferred (**Phase 3B**) until list serializer exposes it (`thumbs_up` is per-user boolean). Verified `npx tsc --noEmit`, `python manage.py check`.
- `2026-04-14T18:00:00-05:00` **Checkpoint** — **Final 3A review round**: (1) **`has_manifest`** serializer → `get_has_manifest` checks `ManifestRow` count, not B-Stock flag; (2) **`_apply_auction_list_visibility`** — default = live (open/closing, `end_time` in future); `completed=1` = ended last 24h; **Completed** chip added to `BuyingFilterChips` + wired into list/watchlist params; (3) manifest detail **Category** column narrowed (fixed width, ellipsis chip); (4) detail action row: **Watch star → Update → B-Stock** in compact `Stack` under title. `tsc --noEmit` + `manage.py check` pass.
- `2026-04-14T18:30:00-05:00` **Session close** — **v2.12.1**; Phase 3A complete (review items + final round). `npx tsc --noEmit`, `python manage.py check`.

#### Result

committed as **v2.12.1** (see root `CHANGELOG.md` section **[2.12.1]**).

---

## See also

- [`.ai/context.md`](../context.md) — project state
- [`.ai/extended/frontend.md`](../extended/frontend.md) — React / buying UI
- [`.ai/initiatives/bstock_auction_intelligence.md`](bstock_auction_intelligence.md) — buying valuation / category need product context
