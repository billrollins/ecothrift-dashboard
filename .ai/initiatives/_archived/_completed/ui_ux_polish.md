<!-- initiative: slug=ui-ux-polish status=active updated=2026-04-15 -->
<!-- Last updated: 2026-04-16T14:35:00-05:00 (Session 7 — v2.15.0–v2.15.3 release train) -->
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
- `2026-04-14T22:00:00-05:00` **Checkpoint** — **`consultant_handoff`**: `consultant_context` + **flat** bundle (`workspace/to_consultant/files-update/`) + **`consultant_instructions.txt`**; no code change for this initiative. *(`.ai/personas/` later removed.)*

#### Result

committed as **v2.12.1** (see root `CHANGELOG.md` section **[2.12.1]**).

### Session 5 — 2026-04-15T10:00:00-05:00 (Phase 3B — auction list advanced)

- **Goal:** Implement deferred **Phase 3B** items **C, D, G, J, L** from Session 4: interactive watch + thumbs aggregate on the list, revised need/priority math (D+L), default/sticky composite sort (G), top categories column (J). **Exclude E** (scheduled no-token refresh — parked for ops / B-Stock Phase 6). **D+L process:** measure current distributions first (`audit_auction_need_priority`), propose a **specific** formula with numbers, get **Bill approval**, then implement Step 3 in code — no guessing math before approval.
- **Finish line:** List API exposes **thumbs-up count** (per-staff votes) + **`top_categories`**; **watch** toggles from grid; **D+L Step 3** implemented only after written formula approval; **default ordering** session-sticky; **Top categories** column between Vendor and Title. **D+L Step 1–2:** audit output recorded; formula proposal approved or explicitly deferred.
- **Scope:** `apps/buying/` (valuation when approved, serializers, `AuctionThumbsVote`), auction list UI. Out of scope: **E**, token-backed B-Stock.
- **Est:** 3–4h (multi-session if split).
- **Ship:** Accumulate; version bump at session close.

#### Phase 3B implementation plan (repository)

Execution detail and item breakdown live in the Cursor plan **Session 5 Phase 3B** (audit → approve → implement D+L; C / J / G ordering). Do not invent `valuation.py` changes before Bill signs off on the formula from audit numbers.

#### Session updates

- `2026-04-15` **Build start** — Session 5 opened; Phase 3B implementation per plan (audit command, C, J, G; D+L Step 3 gated on approval).
- `2026-04-15` **Checkpoint** — **C:** `AuctionThumbsVote` + list/retrieve annotations, thumbs API returns `thumbs_up_count`, filters use vote Exists; **watch** toggle on desktop/mobile (`useBuyingWatchlistToggleMutation`). **J:** `top_categories` SerializerMethodField + column (Vendor | Top categories | Title). **G:** session-sticky `ordering` via `ecothrift.buying.auctionList.ordering` / `ecothrift.buying.watchlist.ordering`, default `-priority,end_time`. **D+L Step 1:** `audit_auction_need_priority` management command. **D+L Step 3:** not implemented — awaiting written formula approval after audit. **Verify:** `npx tsc --noEmit`, `python manage.py check` OK; local `manage.py test apps.buying` blocked by Postgres test DB state.
- `2026-04-15T18:30:00-05:00` **Follow-up (v2.13.1)** — Desktop auction list **UX/performance** pass: **`AuctionListDesktop`** — stable **`columns`** via **`GridCellState`** ref; **`TimeRemainingCell`** self-tick; expand column **last**; inline row detail strip; theme **`MuiIconButton`** / **`MuiCheckbox`** snappiness; watch mutation optimistic **`watchlist_sort`** row patch; **`void cancelQueries`**. Root **`.version` / `package.json` / `CHANGELOG` [2.13.1]**; see **`.ai/extended/frontend.md`** “Buying — desktop auction list”.

#### Result

- Phase 3B **C / G / J** + **D+L audit (Step 1)** shipped in repo; **D+L valuation changes (Steps 2–3)** remain blocked until Bill approves a formula tied to audit output. **E** unchanged (out of scope). **v2.13.1** patches **desktop list grid** responsiveness and detail UX (separate from Phase 3B backend scope) — **CHANGELOG [2.13.1]**.

### Session 6 — 2026-04-15T21:00:00-05:00 (Auction detail UX v3)

- **Goal:** Comprehensive restructure of `AuctionDetailPage` around the user's decision process, driven by external UX consultant critique (scored 49/100). Restructure from data-category layout to decision-flow layout.
- **Finish line:** Urgency strip + decision summary above grid; bid reference card replacing auction end card; multi-tick gauge; costs input/output split; sell-through color coding; condition chips; avg retail/item; compact manifest when loaded; old AuctionEndDetailsCard deleted. Design spec captured in `.ai/extended/ux-spec.md`.
- **Scope:** `frontend/src/pages/buying/AuctionDetailPage.tsx`, `frontend/src/components/buying/` (new: `AuctionUrgencyStrip.tsx`, `AuctionDecisionSummary.tsx`, `AuctionBiddingCard.tsx`; modified: `AuctionValuationCard.tsx`, `AuctionDetailsInfoCard.tsx`; deleted: `AuctionEndDetailsCard.tsx`).
- **Ship:** **v2.15.0**

#### What was built (v2.15.0)

| Component | File | What it does |
|-----------|------|--------------|
| **AuctionUrgencyStrip** | `AuctionUrgencyStrip.tsx` | Full-width banner: hero countdown (h4, pulse <1h), current price, bid count ("No competition" signal), status chip. Ambient urgency bg tint. |
| **AuctionDecisionSummary** | `AuctionDecisionSummary.tsx` | Synthesized deal assessment: margin ratio text, risk flag chips (low sell-through, low demand), opportunity signals (no competition + wide margin). Auto-hides when no data. |
| **AuctionBiddingCard** | `AuctionBiddingCard.tsx` | Grid cell 1,2: priority (admin editable), need score (color-coded), buy now, starting price (moved from details), est. profit (green/red), profitability ratio (threshold-colored). |
| **ValuationMaxBidCard** | `AuctionValuationCard.tsx` | Multi-tick gauge (10px track, breakeven/moderate/target ticks, current price dot); color-differentiated tile left borders (error/warning/success); "Current margin: X.Xx breakeven" text. |
| **ValuationCostsCard** | `AuctionValuationCard.tsx` | Inputs section (tinted bg): price, fees, shipping, shrinkage, profit goal, revenue. Calculated section: total cost, expected revenue, est. profit (new), margin % (new). |
| **AuctionDetailsInfoCard** | `AuctionDetailsInfoCard.tsx` | Condition as color-coded Chip; "~$XXX/item" avg retail per item; starting price removed. |
| **ValuationCategoryTableCard** | `AuctionValuationCard.tsx` | Sell-through column color-coded: >=75% green, 50-75% amber, <50% red. |
| **Manifest card** | `AuctionDetailPage.tsx` | Loaded: compact metadata box + single-line replace/remove. Empty: full drop zone. |

#### Design spec

Full design system captured in **`.ai/extended/ux-spec.md`** — color system, typography hierarchy, spacing rules, interaction patterns (inline editing, empty states, button hierarchy, chips, tooltips), threshold tables, anti-patterns. Intended as the authoritative design reference for the entire application going forward.

#### Session updates

- `2026-04-15T21:00:00-05:00` **Build start** — Session 6 opened; implementing Auction detail UX v3 plan.
- `2026-04-15T23:45:00-05:00` **Session close** — All 9 plan todos complete. `npx tsc --noEmit` passes (zero errors). No linter errors. Version bumped to **v2.15.0**. CHANGELOG entry added. `.ai/extended/ux-spec.md` written. Context files, consultant context, frontend.md, initiative updated.

#### Result

Shipped as **v2.15.0** (see root `CHANGELOG.md` section **[2.15.0]**).

---

### Session 7 — 2026-04-16T09:00:00-05:00 (v2.15.0 detail polish follow-ups + manifest/sweep UX)

- **Goal:** Polish follow-ups to the v2.15.0 detail restructure — extract the details card into decomposed components, add live countdown hook, add manifest pull queue + sweep progress dialogs, redesign the category-need detail card around 1–99 raw inputs, and stand up a staff Assumptions admin stub.
- **Finish line:** New components wired into `AuctionDetailPage`; manifest queue + sweep progress dialogs usable from the list; `CategoryNeedDetail` shows raw need-score inputs with "sold-items window since" date; v2.15.1 / v2.15.2 / v2.15.3 backend work (manifest pipeline optimizations, retail-weighted mix, AI title yield) releases-ready in the same push.
- **Scope (new frontend files):** `frontend/src/components/buying/AuctionDetailsInfoCard.tsx`, `AuctionPrimaryCard.tsx`, `AuctionSecondaryCard.tsx`, `BuyingDetailSectionTitle.tsx`, `BuyingSweepProgressDialog.tsx`, `ManifestQueueDialog.tsx`, `ManifestPullProgressPanel.tsx`; `frontend/src/hooks/useLiveBuyingCountdown.ts`, `useBuyingManifestPullProgress.ts`; `frontend/src/utils/buyingOptimisticCache.ts`, `valuationParse.ts`; `frontend/src/pages/admin/AssumptionsPage.tsx` (stub).
- **Scope (modified):** `AuctionDetailPage.tsx`, `AuctionListDesktop.tsx`, `AuctionListMobile.tsx`, `AuctionListPage.tsx`, `WatchlistPage.tsx`, `AuctionValuationCard.tsx`, `BuyingFilterChips.tsx`, `CategoryNeedBars.tsx`, `CategoryNeedDetail.tsx`, `CategoryNeedPanel.tsx`, `NeedPill.tsx`, `Sidebar.tsx`, `api/buying.api.ts`, `hooks/useBuyingThumbsUpMutation.ts`, `hooks/useBuyingWatchlistToggleMutation.ts`, `theme/index.ts`, `types/{buying,inventory}.types.ts`, `utils/{auctionMaxBid,buyingAuctionList}.ts`.
- **Ship:** **v2.15.3** (release train — carries v2.14.0 → v2.15.3 backend/frontend work).

#### Session updates

- `2026-04-16T09:30:00-05:00` Detail page decomposition — `AuctionDetailsInfoCard` + primary/secondary split; `BuyingDetailSectionTitle` for consistent heading spacing.
- `2026-04-16T10:15:00-05:00` `useLiveBuyingCountdown` hook — per-row 1 s interval only under threshold (avoids parent re-renders); reused on desktop list + detail.
- `2026-04-16T11:00:00-05:00` `ManifestQueueDialog` (Next up + Pull log) + `ManifestPullProgressPanel` + `useBuyingManifestPullProgress` wire into anonymous manifest pull queue; `BuyingSweepProgressDialog` replaces inline sweep status.
- `2026-04-16T12:00:00-05:00` `CategoryNeedDetail` redesigned around raw 1–99 inputs + "sold-items window since"; `CategoryNeedBars` / `NeedPill` aligned to same thresholds.
- `2026-04-16T13:00:00-05:00` `AssumptionsPage` stub (admin) — placeholder for staff-editable universal defaults (B6 captured in `.ai/initiatives/ui_ux_polish.md` (todo B6)); implementation deferred.
- `2026-04-16T14:35:00-05:00` Session close — docs + changelog + version sync for v2.15.3 release train; all open initiative Sessions closed.

#### Result

Prepared for release as part of the **v2.15.3** release train (see root `CHANGELOG.md` [2.15.0]–[2.15.3] and `scripts/deploy/commit_message.txt`).

---

## See also

- [`.ai/context.md`](../context.md) — project state
- [`.ai/extended/frontend.md`](../extended/frontend.md) — React / buying UI
- [`.ai/initiatives/bstock_auction_intelligence.md`](bstock_auction_intelligence.md) — buying valuation / category need product context
