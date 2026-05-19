<!-- Last updated: 2026-05-18 (v2.24.1 processing gate; shelf price — see CHANGELOG [2.23.0]+) -->

# Eco-Thrift Dashboard — Frontend Context

## Tech Stack

- **React 18.3**, **TypeScript 5.9**, **Vite 7**, **MUI v7**
- Additional: TanStack React Query, React Router v7, notistack, date-fns, recharts, react-hook-form, @zxing/library

## Entry Point

`main.tsx` — Provider hierarchy (outer → inner):

1. `BrowserRouter`
2. `QueryClientProvider` (TanStack React Query: retry 1, no refetch on focus, 30s stale)
3. `ThemeProvider` (MUI)
4. `LocalizationProvider` (MUI X Date Pickers, AdapterDateFns)
5. `CssBaseline`
6. `SnackbarProvider` (maxSnack 3, autoHide 4s)
7. `AuthProvider`
8. `App`

## Routing

`App.tsx` uses React Router v7 with route guards:

- **ProtectedRoute** — requires `isAuthenticated`; redirects to `/login` if not
- **StaffRoute** — redirects Consignees to `/consignee`
- **ManagerRoute** — requires Admin or Manager; redirects to `/dashboard` otherwise
- **AdminRoute** — requires Admin; redirects to `/dashboard` otherwise

**Public routes:** `/login`, `/pricing`, `/pricing/:sku` (PublicItemLookupPage)

**Staff routes** (MainLayout): Dashboard, HR (time-clock, time-history, employees, sick-leave), Inventory (vendors, orders, processing, products, items), POS (terminal, drawers, cash, transactions), Consignment (Manager+), **Buying** (`/buying/auctions`, `/buying/auctions/:id`, `/buying/watchlist` — Phase **5** UI **v2.9.0**), **Admin** (Manager+ see section; **Assumptions**, **POS setup**, **Settings**; **Users**, **Customers**, **Permissions** Admin-only)

**Buying (StaffRoute):** **`AuctionListPage`** at **`/buying/auctions`** — **Phase 5 UI:** toolbar **Active auctions**, **Filters** + **Clear all**, marketplace row (**All** + chips) and filter row (**Profitable**, **Needed**, **Thumbs up**, **Watched**, **Has manifest**); multi-select tooltips via **`multiSelectChipTooltip`**; default sort **`-priority,end_time`**, valuation DataGrid columns (thumbs, vendor chip, est. revenue, profitability/need pills, priority steppers Admin, time colors **>4h / <4h / <1h**), watchlist row tint (≤**100** watchlist IDs); **category need panel** (desktop **`md+` only**): Min/Window/Full + bars + **Margin** + **Recovery** + detail **Profitability** tiles (**useBuyingCategoryNeed**; **`GET /api/buying/category-need/`** — **v2.17.0**). Marketplace + filter chip filters (Ctrl/⌘ multi-select where applicable), retail tooltips, list queries use **`keepPreviousData`** for stable server pagination; list hooks use **`refetchOnMount: false`** and **`staleTime`** so optimistic thumbs/watch/archive do not refetch the grid (see **Buying — desktop auction list** below). **`AuctionDetailPage`** (**v2.15.0** decision-flow layout — see **`.ai/extended/ux-spec.md`**): **`AuctionUrgencyStrip`** (full-width real-time banner: countdown, price, bids, status), **`AuctionDecisionSummary`** (margin ratio, risk flags, opportunity signal), then 3×2 CSS grid: **`ValuationMaxBidCard`** (multi-tick gauge, color-bordered tiles) | **`AuctionBiddingCard`** (priority, need, buy now, starting price, est. profit, profitability) | **`ValuationCostsCard`** (inputs/outputs split with est. profit + margin) | **`AuctionDetailsInfoCard`** (condition chip, avg retail/item) | **`ValuationCategoryTableCard`** (recovery rate color coding) | **manifest card** (compact metadata when loaded, full drop zone when empty). Below: **`CategoryDistributionBar`**, **Manifest Rows** DataGrid, price history chart. **`AiManifestComparisonStrip`** in manifest card. Admin overrides via **`PATCH …/valuation-inputs/`**. **`WatchlistPage`** at **`/buying/watchlist`**. **`buying.api.ts`** + hooks **`useBuyingAuctions`**, **`useBuyingAuctionsInfinite`**, **`useBuyingAuctionSummary`**, **`useBuyingMarketplaces`**, **`useBuyingAuctionDetail`**, **`useBuyingManifestRows`**, **`useBuyingAuctionSnapshots`**, **`useBuyingWatchlist`**, **`useBuyingWatchlistInfinite`**, **`useBuyingCategoryNeed`**, **`useBuyingThumbsUpMutation`**, **`useBuyingValuationInputsMutation`**. Initiative: **`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`**.

**Inventory route behavior (M3)**:

- (**`v2.20.0`**) **`/inventory/receiving`** resolves to the first PO from **`GET /api/inventory/orders/for-receiving/`** (**`ReceivingEntryRedirect`**) or **`/inventory/orders`**; **`/inventory/receiving/:id`** — **`ReceivingOrderPage`**. **`OrderListPage`**: **Receive** column (**`LocalShipping`**) when PO status permits receiving.

- **`OrderDetailPage`** handles order status management, **Raw Manifest** CSV upload/replace (`useUploadManifest` → `POST …/upload-manifest/`; multipart **`FormData`** without forcing boundary), and post-preprocessing actions (**Open Item Processor** → **`/inventory/processing/{id}`**, Mark Complete). **Preprocessing** unlocks when **`manifest_file`** exists. **Start Preprocessing** navigates to **`/inventory/preprocessing/:id`**.
- `PreprocessingPage` (`/inventory/preprocessing/:id`) is a standalone 3-step wizard: Standardize Manifest → AI Cleanup → **Final Review** (stepper labels). Step 3 UI is **`PreprocessingReviewTable`** (staging **`PreprocessingRow`**); **`ManualReviewPanel`** is used for **`GET …/manual-review/`** responses (paginated **`ManifestRow`** pricing grid — also embedded read-only on Item Processor). **Mockup-aligned** stepper copy and layout are **pending** — **[`fix_this.md`](../reference/fix_this.md)** / **`final_review_visual_rebuild_directive.md`**. Has own sidebar nav entry **Preprocessing**. **localStorage** persists last order ID. Legacy route **`/inventory/orders/:id/preprocess`** redirects. **Finalize** / **Open processing** navigates to **`/inventory/processing/{id}`**.
- **Standardize Manifest** auto-refreshes preview after formula/search changes and has an explicit **Refresh Preview** button; blank formulas render blank standardized fields. Commit creates **`ManifestRow`** plus early **`Product`**/**`Item`** records.
- **AI Cleanup** uses **`RowProcessingPanel`** with preprocessing-specific model controls (add model id/name, verify, set default), batch size 5/10/25/50, concurrency default **1**, optional 4/8/16 — multi-thread mode is best-effort, expandable rows showing original data vs AI suggestions, optional **13-column** Grok CSV (trailing **`ai_status`**), and post-apply **`soft_warnings`** from the server.
- **Final Review** uses **`PreprocessingReviewTable`**: searchable staging grid, summary chips, inline edits, bulk ±10% ideal pricing, per-row **`ai_status`** state/issue chips, and client clears local **`ai_status`** when saves touch the same fields the backend clears.
- **`ProcessingWorkspacePage`** (**`/inventory/processing`**, **`/inventory/processing/:id`**) — manifest-queue Item Processor: **`ProcessingWorkspaceHeader`**, **`ProcessingFilterRow`** (segments, hide dispositioned default on, product chip), sortable **`ProcessingQueueTable`** with bulk checkboxes, **paginated infinite scroll** over **`processing-workspace`** (**`flattenRows`**), **queue OR active card** in the main column — active row detail from **`processing-row-detail`** (on row click only; **`v2.22.1`** removed hover prefetch), collapsible read-only **Manifest pricing audit** (**`useManualReview`** → **`GET …/manual-review/`**, **`ManualReviewPanel`** `readOnly`), **`ProcessingBulkActionBar`** + **`MergeModal`** / **`BulkDispositionModal`** (**row-first `processing_row_ids` / dispute `processing_rows`** — **v2.22.0**; **swap UI not shipped**), **`ProcessingWorkspaceFooter`**, **`ProcessingSessionLog`**, **print-after-check-in** (`localPrintService`), print-multiple + dispute. **`ProcessingActiveCard`** seeds editable shelf **`price`** from **`row.price`** (bookmark **`shelf_price`**). **v2.23.0:** list rows include API **`searchString`**; substring helpers use **`processingWorkspaceSearchBlob`**. Mutations consume **`workspace_patch`** for incremental cache merges (**`useProcessingWorkspace.ts`**); **`useProcessingRowDetail`** uses **`retry: false`** and **`refetchOnWindowFocus: false`** (**v2.22.1**). Header links **`/inventory/processing-legacy`**. **v2.21.1 hotfix:** duplicate UPC hints may be blank (`likelyDuplicateOf: []`) because the full-PO JSON scan was removed from list/patch payloads for large-order responsiveness.
- **`ProcessingEntryRedirect`** (**`/inventory/processing`**) — optional **`?order=`** query or **`lastProcessingOrderId`** + eligible PO list.
- **`ProcessingPage`** (**legacy**, **`/inventory/processing-legacy`**) — **Command Center** batch **`DataGrid`** + **`ProcessingDrawer`** (individual/bulk check-in, **`processing_sticky_defaults`**).
- **`ItemListPanel`** / **POS `TransactionListPage`**: inventory item search param **`q`** and receipt **`receipt_number`** filter apply only after **Enter** or **Search** (draft typing does not refetch); orders **DataGrid** uses lean list rows with **`has_manifest`** for preprocess affordance
- **Quick reprice (v2.2.3+):** `QuickRepricePage` at `/inventory/quick-reprice` — exact SKU filter, default **10%** discount, **This Session** (label unchanged) list **persisted per browser · local calendar day** (`localStorage`, new list after local midnight), expandable with links to item detail, optional **`?sku=`** prefill. `ItemDetailPage` at `/inventory/items/:id` — **Print tag** (local print server), **Reprice** → quick-reprice with `?sku=`, **label reprint** banner after save when price/title/brand change.

**Consignee routes** (ConsigneeLayout): `/consignee`, `/consignee/items`, `/consignee/payouts`

**Redirects:** `/` and `*` → `/dashboard`

## Layouts

### MainLayout

- **Sidebar** (260px): logo, nav sections (Dashboard, HR, Inventory, POS, Consignment, Admin), version footer. **Overflow:** drawer paper and the nav scroll area use **`overflow-x: hidden`** (vertical scroll only); **`Sidebar`** list is full-width with **`minWidth: 0`**; long labels **`noWrap`** + ellipsis; section chevrons **`flexShrink: 0`** (see **v2.2.4** `CHANGELOG`).
- **AppBar**: sticky, default color, user avatar + menu (logout)
- **Outlet** for page content
- Mobile: temporary drawer with hamburger toggle
- Version in sidebar footer from `getAppVersion()` → `/api/core/system/version/`

### ConsigneeLayout

- **Top nav**: logo, My Items / My Payouts / Summary, Logout
- **Outlet** for page content
- Centered content, max-width 1200px

## State Management

- **TanStack React Query** — server state (API data, caching, invalidation)
- **AuthContext** — auth state (user, login, logout)
- **No Redux** — local component state + React Query + context only

## Code Organization

- **api/** — one module per backend app: `core.api`, `accounts.api`, `hr.api`, `inventory.api`, `ai.api`, `pos.api`, `consignment.api`, **`buying.api`**, `client.ts`
- **hooks/** — one per domain: `useAuth`, `usePOS`, `useEmployees`, `useInventory`, **`useProcessingWorkspace`**, `useAI`, `useDashboard`, `useConsignment`, `useCashManagement`, `useSickLeave`, `useTimeClock`, `useTimeEntries`, **`useBuyingAuctions`**, **`useBuyingAuctionsInfinite`**, **`useBuyingAuctionSummary`**, **`useBuyingMarketplaces`**, **`useBuyingAuctionDetail`**, **`useBuyingManifestRows`**, **`useBuyingAuctionSnapshots`**, **`useBuyingWatchlist`**, **`useBuyingWatchlistInfinite`**
- **pages/** — by section: `hr/`, `inventory/`, `pos/`, `consignment/`, `consignee/`, `admin/`, **`buying/`**
- **types/** — one per app: `accounts.types`, `pos.types`, `inventory.types`, `consignment.types`, `hr.types`, **`buying.types`**, `common.types`

## Theme

`theme/index.ts` — MUI `createTheme`:

- **Primary**: `#2e7d32` (Eco green), light `#60ad5e`, dark `#005005`
- **Secondary**: `#558b2f`
- **Typography**: Inter, Roboto, Helvetica, Arial; h4/h5/h6 fontWeight 600
- **Shape**: borderRadius 8
- **Component overrides**: MuiButton (textTransform none, fontWeight 500), MuiCard (subtle shadow). **Buying grid snappiness (v2.13.1):** **`MuiIconButton`** and **`MuiCheckbox`** — **`defaultProps.disableRipple: true`**, **`styleOverrides.root.transition: 'none'`** — reduces perceived lag on checkbox / star / thumbs / archive interactions in **`AuctionListDesktop`**.

## Buying — desktop auction list (`AuctionListDesktop`, v2.18.0 list columns + layout; v2.13.1 grid perf; need v2.14.0)

Staff **`/buying/auctions`** on **`md+`** uses **MUI X DataGrid** with **checkbox** selection. **v2.18.0:** columns **`Top category %`** (lead category word + share), **`P/R %`**, **Category** hover (full retail-weighted mix + **From Manifest** / **AI Estimate**); **expand** column header **expand all / collapse all** for the page; **compact** cell/header padding and **vertical centering**. **Expand/collapse** per row for the inline detail strip is the **last** column (after **Time left**). Multiple rows may be expanded. Expanded row shows a compact **pipe-separated** metrics strip under the row via **`slots.row`** + **`getRowHeight`** (**`GridRow`** wrapper). **Shift+click** a row toggles expand without navigating.

**Performance:** Column **`GridColDef[]`** is built **once** (stable `useMemo` deps: admin flag + callbacks); frequently changing values (**`watchlistIds`**, **`rows`**, selection, sort model, **expanded ids** `Set`) live in a **`useRef`** (`GridCellState`) read inside **`renderCell`** / **`renderHeader`** so optimistic watch/thumbs/archive updates **do not** replace the entire columns array (avoids full-grid re-renders). **`TimeRemainingCell`** subscribes to its own 1 s timer when **`end_time`** is within the live window — parent **`countdownTick`** from **`useLiveBuyingCountdownTick`** is kept for mobile but **void**’d in desktop columns so it does not invalidate column memo every second. **`useBuyingWatchlistToggleMutation`** optimistically sets **`watchlist_sort`** on the auction row via **`patchAllBuyingAuctionLists`** so the star cell’s row data updates. Mutations use **`void queryClient.cancelQueries`** instead of **`await`** before optimistic patches.

**v2.19.0 (see `CHANGELOG`):** Auction list/watchlist rows use **`my_thumbs_up`** (highlight) and **`thumbs_up_count`** (tally); default ordering **`-watchlist_sort,-thumbs_up_count,-priority,-need_score`**; **`normalizeBuyingListOrdering`** in **`buyingAuctionList.ts`** maps legacy **`thumbs_up`** sort tokens for stored session ordering.

**v2.19.1 (see `CHANGELOG`):** **`useBuyingValuationInputsMutation`** — `cancelQueries` for detail, **`setQueryData` before predicate** `invalidateQueries` (excludes the written detail), **`onError`** snackbar. **`AuctionDetailPage`** `scheduleDebouncedManifestInvalidate` only **`manifest_rows`** + **`auctions/summary`**. **`AuctionValuationCard`**: **pending** readouts, **select all** on **ValuationInlineField** focus.

**v2.18.2 (see `CHANGELOG`):** List hooks avoid refetch-on-mount churn (`refetchOnMount: false`, `staleTime`); bulk thumbs/watch/archive no longer invalidate full list queries (trust optimistic patches + `removeAuctionFromAllBuyingLists` where needed). Single-row archive uses **`useBuyingArchiveGrace`** (2 s cancel window, pulse on icon). Neighbor page prefetch. **`AuctionSecondaryCard`**: max-bid gauge **0 → break-even**; shared dark tooltip on tiles + chart. **`AuctionValuationCard`**: category mix **Units** + footer total. UI patterns: **`.ai/extended/ux-spec.md`**.

## Vite Config

`vite.config.ts`:

- Port 5173
- **Proxy**: `/api` and `/db-admin` (Django `contrib.admin`) → `http://127.0.0.1:8000`. **`/admin/*`** is **not** proxied — it is served by Vite as the React SPA (in-app admin pages: settings, users, etc.).
- Build: `dist`, no sourcemaps

**Guardrail — Django admin vs React `/admin/*`:** Do **not** add `path('admin/', admin.site.urls)` in `ecothrift/urls.py` or a Vite proxy of **`/admin`** to Django. That breaks **hard refresh** and direct URLs for React staff routes (`/admin/settings`, `/admin/users`, `/admin/pos-setup`, …). Keep Django **contrib.admin** at **`/db-admin/`** only; exact `/admin` may redirect to `/db-admin/` for bookmarks. See archived initiative **`.ai/initiatives/_archived/_completed/django_admin_legacy_navigation.md`**.

## Version Display

Sidebar footer shows `v{appVersion.version}` from `getAppVersion()` → `/api/core/system/version/`. The backend reads semver from repo root `.version` (no `v` prefix in the JSON `version` field).

---

## Frontend Inventory UX Updates (Post-1.4.0 Pass)

- `OrderDetailPage` now includes a destructive reset path with a guided modal:
  - loads reverse-sequence artifact preview from `delete-preview`,
  - requires typed order-number confirmation,
  - executes purge via `purge-delete`,
  - redirects back to order list on success.
- Preprocessing section was restructured into a 3-step accordion workflow:
  1) Upload Manifest CSV,
  2) Review Raw Manifest Sample,
  3) Map + Standardize Manifest.
- Accordions now support multi-open behavior (multiple sections can be open concurrently).
- Raw manifest sample behavior:
  - server query capped to top 100 rows,
  - search input filters against full raw manifest server-side,
  - table viewport tuned for approximately 10 visible rows before vertical scroll.
- Standardized preview behavior:
  - preview request capped to top 100 normalized rows,
  - search input filters against full normalized result server-side (`search_term`),
  - table viewport tuned for approximately 20 visible rows before vertical scroll.
- Sidebar nav consistency pass:
  - Inventory and POS now use collapsible grouped sections (matching HR behavior),
  - prevents visual "spill" between unrelated menu groups.

## Frontend Inventory UX Updates (1.5.0 Pass)

- Preprocessing extracted into a dedicated standalone page (`PreprocessingPage.tsx` at `/inventory/orders/:id/preprocess`):
  - 3-step chip-based MUI Stepper: Upload Manifest → Standardize Manifest → Set Prices (optional)
  - Full-width spacious layout with no accordions; each step is an open flat content area
  - Forward/back navigation between all steps at all times
  - From Step 3, the only forward action is "Go to Item Processor"
- `OrderDetailPage` simplified: the full preprocessing accordion block (~260 lines) removed; replaced with a single "Open Preprocessing" card button navigating to the new route
- Pre-arrival pricing Step 3 redesign:
  - Removed pricing mode toggle (`% of Retail` vs `Manual`)
  - `Retail %` input and "Apply to All" button always visible as a tool at the top
  - Added "Clear All" button
  - All proposed price inputs always editable (no `disabled` prop)
  - Removed explicit "Save Prices" button; auto-save triggers on Apply All, Clear All, and individual field blur
  - Saving indicator (spinner + "Saving..." text) shown during in-flight API calls
- `retail_value` mapping enforced as required at standardization step:
  - `handleStandardizeManifest` blocks and shows a warning snackbar if `retail_value` has no source header mapped
  - Step 3 shows a warning Alert for any rows missing `retail_value`, explaining they will be skipped by "Apply to All"
- Infinite render loop bug fixed:
  - `manualPrices` initialization `useEffect` now depends on stable `rowsKey` string (row IDs joined) instead of `manifestRows ?? []` array reference which created a new array each render

## Frontend AI Preprocessing (1.6.0)

### New Files
- `frontend/src/api/ai.api.ts` — `sendAIChat()`, `getAIModels()`
- `frontend/src/hooks/useAI.ts` — `useAIModels()`, `useAIChat()`
- `frontend/src/components/common/ModelSelector.tsx` — Reusable Claude model dropdown, persisted to localStorage
- `frontend/src/components/inventory/RowProcessingPanel.tsx` — Flat-form AI cleanup + matching + review component
- `frontend/src/components/inventory/MatchReviewPanel.tsx` — Product match review panel
- `frontend/src/components/inventory/FinalizePanel.tsx` — Finalize + pricing panel
- `frontend/src/hooks/useStandardManifest.ts` — Formula-based state (replaces old rules-based)
- `frontend/src/components/inventory/StandardManifestBuilder.tsx` — Expression text input with autocomplete

### Key Components

**RowProcessingPanel** (`components/inventory/RowProcessingPanel.tsx`):
- Section A: AI Cleanup Controls — ModelSelector, batch size dropdown (5/10/25/50), threads dropdown (1/4/8/16), Run/Pause/Cancel buttons, progress bar with active thread count
- Section B: Rows Table — Expandable rows with chevron toggle. Compact row shows #, Description, AI Title, AI Brand, AI Model, Status chip. Expanded detail shows two side-by-side Paper cards: "Original Manifest Data" (description, brand, model, category, condition, retail, UPC, vendor item#, qty) and "AI Suggestions" (AI title/brand/model, search tags, specifications as key-value grid, AI reasoning in styled quote block). Changed fields are bold with warning color highlight.
- Section C: Product Matching — "Find Matching Products" button, summary chips (Confirmed/Uncertain/New)
- Section D: Review Decisions — Accept/Reject/Modify per row, "Accept All Confirmed", "Submit Reviews"
- State: `expandedCleanupRows: Set<number>` for multi-expand, `concurrency` state, `nextOffsetRef` for worker pool coordination

**Concurrent Batch Processing** (in RowProcessingPanel):
- Frontend drives batch loop: launches N concurrent workers (Promise.allSettled)
- Each worker grabs next offset via shared `nextOffsetRef`, sends `ai-cleanup-rows` request, loops until done/paused/cancelled
- Pause sets flag checked between iterations; Cancel calls `cancel-ai-cleanup` endpoint to clear AI data
- localStorage persists `{ offset }` for cross-session resume

### Routing Changes
- `/inventory/preprocessing` — Reads `lastPreprocessOrderId` from localStorage, redirects to `/inventory/preprocessing/:id` or shows message
- `/inventory/preprocessing/:id` — `PreprocessingPage`
- `/inventory/orders/:id/preprocess` — Legacy redirect to `/inventory/preprocessing/:id`
- `/inventory/processing` — `ProcessingEntryRedirect` (`?order=` supported; else eligible PO list + `lastProcessingOrderId`)
- `/inventory/processing/:id` — `ProcessingWorkspacePage` (Item Processor workspace)
- `/inventory/processing-legacy` — `ProcessingPage` (legacy batch grid + drawer)
- Sidebar: "Preprocessing" entry added between "Orders" and "Processing" in Inventory section

### Render Loop Fix (1.6.0)
- `PreprocessingPage.tsx` `useEffect` for templateName: replaced `order` object dependency with scalar `orderVendorCode` and `orderPreviewTemplateName`
- `rawManifestParams` useMemo: changed `order?.manifest_file` (object ref) to `!!order?.manifest_file` (boolean)
- `matchSummary` prop: memoized with `useMemo` instead of inline object literal

## Processing Page Overhaul (1.9.0)

### New Files
- `frontend/src/hooks/useLocalPrintStatus.ts` — polls `/health` every 30s; returns `{ online, version, printersAvailable, lastChecked }`
- `frontend/src/components/inventory/ProcessingDrawer.tsx` — right-side MUI `Drawer` (width 420px); exports `ProcessingDrawer`, `buildItemForm`, `buildBatchForm`, `EMPTY_FORM`, `DRAWER_WIDTH`, `DrawerMode`, `ProcessingFormState` types
- `frontend/src/components/inventory/ProcessingStatsBar.tsx` — session stats bar; shows elapsed, items/hr, ETA, session count, auto-advance toggle

### ProcessingPage.tsx (redesign)
- **Layout**: "Command Center + Side Drawer" — PageHeader → Order Context Bar → Scanner Card → Tabbed Queue Card → Stats Bar + right-anchored Drawer
- **Order selector**: MUI `Autocomplete` with search, vendor name, status chips per option
- **Progress ring**: `CircularProgress` (determinate, 52px) overlaid with `%` text; stats chips for on-shelf/pending/batch counts
- **Scanner input**: always-visible `TextField` with F2 hotkey; Enter finds item by SKU and opens Drawer
- **Tabs**: `Batches (N)` / `Items (N)` / `Checked In (N)` with MUI `Badge` counts; compact DataGrid per tab
- **Items tab**: checkbox `checkboxSelection` for bulk; `rowSelectionModel` uses `{ type: 'include', ids: Set<number> }`; floating "Bulk Check-In" button when selection > 0
- **Checked In tab**: sorted `checked_in_at` desc; per-row printer icon reprint button
- **ProcessingDrawer**: source context `Accordion` (collapsed), Copy from Last button, form fields, print toggle, Save/Check-In/Reprint/Next buttons; auto-focuses first field on open
- **Batch label printing**: `printBatchLabels()` sends N `/print/label` calls via `Promise.allSettled` with 200ms stagger; `printProgress` state drives inline Alert
- **Auto-advance**: `advanceToNext()` finds next item in queue by index after check-in; toggle in StatsBar
- **Sticky defaults**: `processing_sticky_defaults` in localStorage; loaded on drawer open for empty fields
- **Hotkeys**: single `keydown` listener — F2, Ctrl+Enter, Escape, Ctrl+P, N
- **useItems / useBatchGroups**: now accept `enabled` param (false when no order selected)
- **queueNotBuilt**: triggers on `delivered` OR `processing` status with zero items
