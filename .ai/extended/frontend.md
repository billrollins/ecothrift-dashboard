<!-- Last updated: 2026-09-05 (v2.89.1 hours card + Visit rows) -->

# Eco-Thrift Dashboard — Frontend Context

## Tech Stack

- **React 18.3**, **TypeScript 5.9**, **Vite 7**, **MUI v7**
- Additional: TanStack React Query, React Router v7, notistack, date-fns, recharts, react-hook-form, @zxing/library, react-pdf / pdfjs-dist
- Routine chrome (Today, Pay, staff lists, phone tab bar, runner) is bilingual via `frontend/src/i18n/routines.ts` (`t`, `pick`, `triggerLabel`) and `User.language`. No i18n library. The profile menu holds the EN / ES toggle (`setLanguage` → `PATCH /auth/me/`). Clock-in tiles and the Change menu live in `frontend/src/components/hr/ShiftPicker.tsx` (`ShiftPicker`, `ShiftMenu`, `ShiftChip`): department eyebrow, then the position name.

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
- **SuperAdminRoute** — requires Django `is_superuser`; redirects to `/dashboard` otherwise (gates the Blog Studio)

**Public routes:** `/login`, `/forgot-password`, `/reset-password`

**Staff routes** (MainLayout): Dashboard; Essentials (**Dashboard** only); account menu (**Today** `/today`, **Pay** `/pay`, **Routines** `/routines`, **Language** EN / ES). On phones (`down('md')`), Dashboard / Today / Pay / Routines list use a slim top bar (hamburger + title) + `PhoneTabBar` (Home / Today / Pay / Routines) sitting in the layout flow so the page ends at the top of the bar. Filling or demoing a routine replaces that bar with `RoutinePhoneBar` (demo shows the Demo chip only; pick another routine or leave). Staff `/routines` is My routines + Catalog (read/fill); add / edit / delete lives in Admin - Routines. **Today** is the punch plus the day's routines on every device (`TodayPhone` / `TodayDesk`). **Pay** is the hours/periods ledger (`PayPhone` / `PayDesk`). `/hr/time-clock` and `/hr/time-history` redirect to `/pay`. There is no Day at a glance dialog. Desk Home / Today / Pay / Routines share `FloorPage` (green band + `FloorNav` Home / Today / Pay / Routines, Settings for Manager+). On phones, `/dashboard` renders `DashboardPhone` (today hero, trend, this week, past weeks, department cards) instead of stacking the desktop widgets. **Buying** (auctions, watchlist, **vendors**, **orders**, preprocessing); Inventory (**Inbound:** receiving, processing); **Retail Floor** (Catalog workbench, quick reprice, floorplans); POS (terminal, drawers, cash, transactions); **Studios** (Manager+: Label Studio, Floorplans, Blog Studio); **Admin** (Manager+: Users at `/admin/users` — Employees first and default for Admin, Customers via `?tab=customers`; Managers only see Customers; Settings house at `/admin/settings` (System / Printing / Store / Assumptions / Retail QA / Permissions); Retail inbox Admin-only; Super Admin: **Time & payroll** `/admin/time-payroll`, **Routines** (Routine Control) `/admin/routines` (`?view=routines|sections|grades`) — see `routines.md`). Super Admin **Enhancements** `/admin/enhancement-requests` is a Restoration guest. Staff **Consignment** routes remain (`/consignment/*`) but are **hidden from sidebar**; **Consignee portal** (`/consignee/*`) unchanged.

**Users directory (`/admin/users`):** Employees scan identity → # → **Dept** → **Job** → Role → Type → Phone → Tenure → Access. Customers scan identity → # → Phone → **Notes** → Holds → Account → Since. Dept, job, role, type, phone, and notes save on the row (`InlineCell`); name and access still open the drawer.

**HR — Time & payroll (`TimePayrollPage`, Super Admin):** No page title. One-line period toolbar (From/To, past periods, week/period/month chips, current-week hours). Content capped at **1680px**. Pending sits left of the **Payroll** total (`N` employees · `N` shifts). One card: tabs on the top edge — **Roster**, **By employee**, **Change requests**. **By employee**: Employee, # Shifts, Rate, Ind. weeks (stacked Mon–Sun lines), Time (Regular over Overtime), Payroll, plus a totals footer. OT uses a muted dash at zero and amber only at **≥ 1 h**. Hours and pay are computed from 2-decimal shift hours so `$` matches the printed hours. Pagination footer hides on a single page.

**Restoration — TARS:** `/restoration/overview` (scoreboard + queue), `/restoration/bench` (grade table + purchase desk), `/restoration/parts-requests` (superuser command center). `/restoration/tars` redirects in-dashboard. Parts Requests nav badge counts approvals, cancel asks, and reviews from the live orders query (`useNavBadgeCounts` / `partsNavWaitingCount`). Domain: [`.ai/extended/restoration.md`](restoration.md). Initiative: [`finalize_tars_app`](../initiatives/_archived/_completed/finalize_tars_app.md).

**Enhancement requests:** staff file Restoration / Processing asks from `RequestsDrawer` (bottom sheet on the bench and Processing — fixed grabber, does not shift the page). Superuser board at `/admin/enhancement-requests` (Restoration workspace guest item **Enhancements**). Initiative: [`enhancement_requests`](../initiatives/_archived/_completed/enhancement_requests.md).

**Buying (StaffRoute):** **`AuctionListPage`** at **`/buying/auctions`** — **Phase 5 UI:** toolbar **Active auctions**, **Filters** + **Clear all**, marketplace row (**All** + chips) and filter row (**Profitable**, **Needed**, **Thumbs up**, **Watched**, **Has manifest**); multi-select tooltips via **`multiSelectChipTooltip`**; default sort **`-priority,end_time`**, valuation DataGrid columns (thumbs, vendor chip, est. revenue, profitability/need pills, priority steppers Admin, time colors **>4h / <4h / <1h**), watchlist row tint (≤**100** watchlist IDs); **category need panel** (desktop **`md+` only**): Min/Window/Full + bars + **Margin** + **Recovery** + detail **Profitability** tiles (**useBuyingCategoryNeed**; **`GET /api/buying/category-need/`** — **v2.17.0**). Marketplace + filter chip filters (Ctrl/⌘ multi-select where applicable), retail tooltips, list queries use **`keepPreviousData`** for stable server pagination; list hooks use **`refetchOnMount: false`** and **`staleTime`** so optimistic thumbs/watch/archive do not refetch the grid (see **Buying — desktop auction list** below). **`AuctionDetailPage`** (**v2.15.0** decision-flow layout — see **`.ai/extended/ux-spec.md`**): **`AuctionUrgencyStrip`** (full-width real-time banner: countdown, price, bids, status), **`AuctionDecisionSummary`** (margin ratio, risk flags, opportunity signal), then 3×2 CSS grid: **`ValuationMaxBidCard`** (multi-tick gauge, color-bordered tiles) | **`AuctionBiddingCard`** (priority, need, buy now, starting price, est. profit, profitability) | **`ValuationCostsCard`** (inputs/outputs split with est. profit + margin) | **`AuctionDetailsInfoCard`** (condition chip, avg retail/item) | **`ValuationCategoryTableCard`** (recovery rate color coding) | **manifest card** (compact metadata when loaded, full drop zone when empty). Below: **`CategoryDistributionBar`**, **Manifest Rows** DataGrid, price history chart. **`AiManifestComparisonStrip`** in manifest card. Admin overrides via **`PATCH …/valuation-inputs/`**. **`WatchlistPage`** at **`/buying/watchlist`**. **`buying.api.ts`** + hooks **`useBuyingAuctions`**, **`useBuyingAuctionsInfinite`**, **`useBuyingAuctionSummary`**, **`useBuyingMarketplaces`**, **`useBuyingAuctionDetail`**, **`useBuyingManifestRows`**, **`useBuyingAuctionSnapshots`**, **`useBuyingWatchlist`**, **`useBuyingWatchlistInfinite`**, **`useBuyingCategoryNeed`**, **`useBuyingThumbsUpMutation`**, **`useBuyingValuationInputsMutation`**. Initiative: **`.ai/initiatives/_archived/_completed/bstock_auction_intelligence.md`**.

**Inventory route behavior (M3)**:

- (**`v2.20.0`**) **`/inventory/receiving`** resolves to the first PO from **`GET /api/inventory/orders/for-receiving/`** (**`ReceivingEntryRedirect`**) or **`/inventory/orders`**; **`/inventory/receiving/:id`** — **`ReceivingOrderPage`**. Receiving + Processing floor order pickers share **`FLOOR_ORDER_PICKER_PARAMS`** (same statuses + milestone sort); vendor glyph badge colors encode receiving/processing status (`orderPickerDisplay.ts`). Photos: grids use **`attachmentThumbUrl`** (`thumbnail_file` → `s3_file` fallback); every BOL/truck/pallet image opens **`ImageViewerDialog`** with high-res; **Replace** stays a separate control. **`ReceivingCompleteDialog`** lists missing slots with per-slot override reasons when needed.
- **Shared file viewers:** **`ImageViewerDialog`** and **`CsvViewerDialog`** under `frontend/src/components/common/` (accessible MUI dialogs, loading/error, download actions). **`ImageViewerDialog`**: 100% = contain-fit (no default scrollbars); zoom/pan above 100%; always **Download**; optional **Replace** (`onReplaceFile` file picker) and **Crop / Rotate** (90°) with **Save** via `onSaveEdited`. Receiving wires authenticated **`GET …/receiving/photos/{id}/download/`** + **`POST …/receiving/photos/{id}/replace/`** (in-place high-res + thumbnail swap) for both crop-save and viewer Replace. Order wrapper **`PurchaseOrderManifestDialog`** lazily calls `getOrderManifestPreview` / `downloadOrderManifest` (blob + **`downloadBlob`**) — reuse from Order detail, Preprocessing (**View raw manifest**), and Processing header when `has_manifest`.
- **`OrderListPage` (`/inventory/orders`)**: server-paginated DataGrid (Status, Order #, Description, Dates, Condition, Items, Cost/Retail/Priced/Sold/Profit); checkbox selection drives Cost/Retail/Priced/Sold/Profit strip; receive action on Order #; URL-backed filters (`orderList/urlState.ts`); metrics from **`usePurchaseOrderSummary`** / **`usePurchaseOrderPageMetrics`**.

- **`OrderDetailPage`** handles order status management, **Raw Manifest** CSV upload/replace (`useUploadManifest` → `POST …/upload-manifest/`; multipart **`FormData`** without forcing boundary), and post-preprocessing actions (**Open Item Processor** → **`/inventory/processing/{id}`**, Mark Complete). Filename is clickable → **`PurchaseOrderManifestDialog`** (preview ≤10 rows + authenticated full download). **Preprocessing** unlocks when **`manifest_file`** exists. **Start Preprocessing** navigates to **`/inventory/preprocessing/:id`**.
- **`PreprocessingPage`** (`/inventory/preprocessing/:id`) is a standalone 3-step wizard: Standardize Manifest → AI Cleanup → **Final Decisions** (stepper labels). Step 3 UI is **`PreprocessingReviewTable`** (staging **`PreprocessingRow`**); **`ManualReviewPanel`** is used for **`GET …/manual-review/`** responses (paginated **`ManifestRow`** pricing grid — also embedded read-only on Item Processor). Has own sidebar nav entry **Preprocessing**. **localStorage** persists last order ID. **Finalize** / **Open processing** navigates to **`/inventory/processing/{id}`**. Raw Column Reference shows the stored **≤10-row** sample; **View raw manifest** opens the shared CSV dialog.
- **Standardize Manifest** auto-refreshes preview after formula/search changes and has an explicit **Refresh Preview** button; blank formulas render blank standardized fields. Commit creates **`ManifestRow`** spine + linked **`PreprocessingRow`** overlays.
- **AI Cleanup (Step 2, offline only):** **`CleanupStep`** → **`RowProcessingPanel`** — **Download cleanup CSV**, upload completed **12/13-column Grok** or **7-column narrow** CSV, validate locally (`cleanupCsv.ts`), then toolbar **Run Cleanup** → **`POST …/apply-cleanup-csv/`**. Post-apply **`soft_warnings`** in UI. **In-app Run AI Cleanup** (batch loop / concurrency) **removed from Step 2**; API hooks **`useAICleanupRows`** etc. remain unused. Local Grok: **`workspace/ai-cleanup-grok/`**. Review: [`.ai/initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md).
- **Final Decisions** uses **`PreprocessingReviewTable`**: searchable staging grid, product match column (`PreprocessingMatchCell`), summary chips, inline edits, bulk pricing toolbar, per-row **`ai_status`** chips.
- **`ProcessingWorkspacePage`** (**`/inventory/processing`**, **`/inventory/processing/:id`**) — manifest-queue Item Processor: **`ProcessingWorkspaceHeader`**, **`ProcessingFilterRow`** (segments, hide dispositioned default on, product chip), sortable **`ProcessingQueueTable`** with bulk checkboxes, **paginated infinite scroll** over **`processing-workspace`** (**`flattenRows`**), **queue OR active card** in the main column — active row detail from **`processing-row-detail`** (on row click only; **`v2.22.1`** removed hover prefetch), collapsible read-only **Manifest pricing audit** (**`useManualReview`** → **`GET …/manual-review/`**, **`ManualReviewPanel`** `readOnly`), **`ProcessingBulkActionBar`** + **`AssignSharedProductDialog`** / **`CheckInTogetherDialog`** / **`BulkDispositionModal`** (**row-first `processing_row_ids` / dispute `processing_rows`** — **v2.22.0**; **swap UI not shipped**; destructive merge removed P6), **`ProcessingWorkspaceFooter`**, **`ProcessingSessionLog`**, **print-after-check-in** (`localPrintService`), print-multiple + dispute. **`ProcessingActiveCard`** seeds editable shelf **`price`** from **`row.price`** (bookmark **`shelf_price`**). **v2.23.0:** list rows include API **`searchString`**; substring helpers use **`processingWorkspaceSearchBlob`**. Mutations consume **`workspace_patch`** for incremental cache merges (**`useProcessingWorkspace.ts`**); **`useProcessingRowDetail`** uses **`retry: false`** and **`refetchOnWindowFocus: false`** (**v2.22.1**). **v2.21.1 hotfix:** duplicate UPC hints may be blank (`likelyDuplicateOf: []`) because the full-PO JSON scan was removed from list/patch payloads for large-order responsiveness. Legacy **`/inventory/processing-legacy`** batch grid **removed** (**web_ui_cleanup** 2026-05-30). **P9 (2026-06-12):** row detail offers manager-only **Break apart… / Make set…** + **Restart row…** (`ProcessingTransformDialogs.tsx`; hooks `useProcessingBreakApartRow`/`useProcessingMakeSetRow`/`useProcessingRestartRow`); queue shows sub rows as `12.1` with `↳ … (from #12)` titles (`queueRowNumLabel`).
- **`ProcessingEntryRedirect`** (**`/inventory/processing`**) — optional **`?order=`** query or **`lastProcessingOrderId`** + eligible PO list.
- **`ItemListPanel`** / **POS `TransactionListPage`**: inventory item search param **`q`** and receipt **`receipt_number`** filter apply only after **Enter** or **Search** (draft typing does not refetch); orders **DataGrid** uses lean list rows with **`has_manifest`** for preprocess affordance
- **Quick reprice (v2.2.3+):** `QuickRepricePage` at `/inventory/quick-reprice` — exact SKU filter, default **10%** discount, **This Session** (label unchanged) list **persisted per browser · local calendar day** (`localStorage`, new list after local midnight), expandable with links to item detail, optional **`?sku=`** prefill. `ItemDetailPage` at `/inventory/items/:id` — **Print tag** (local print server), **Reprice** → quick-reprice with `?sku=`, **label reprint** banner after save when price/title/brand change.

**Consignee routes** (ConsigneeLayout): `/consignee`, `/consignee/items`, `/consignee/payouts`

**Standalone (outside MainLayout):** **`/blog-studio`** — **Blog Studio** (`ProtectedRoute` + **SuperAdminRoute**), **`React.lazy`**-loaded so the net-new **TipTap** editor builds as its own chunk and stays out of the main staff bundle. Full-screen three-pane studio scoped to its own fonts/CSS (`frontend/src/pages/blog/BlogStudioPage.tsx`, `StudioEditor.tsx`, `blogStudio.css`); opened in a **new window** from a superuser-only Admin nav item. Staff data via `api/blog.api.ts` + `hooks/useBlogStudio.ts` (`/api/blog/`, see `apps.blog`). Autosave is a debounced PATCH; draft/scheduled URL previews use the current title-derived slug and saved slugs keep tracking title until first publish, then lock. Series: assign via dropdown, **rename inline** (`updateBlogSeries` / `useUpdateBlogSeries`) when a series is selected, or create via prompt. Editor tools include preview, rich paste cleanup, word/character/selection counts, shortcut hints, image controls, callouts, tables, code/pull-quote/drop-cap/columns blocks, and safe no-iframe link cards with selected-card removal. Blog Studio and public blog rendering use the **Bold Modern** typography group (DM Serif Display + DM Sans, sage accents).

**Redirects:** `/` and `*` → `/dashboard`

## Public site (`frontend-public/`)

Separate Vite + React 18.3 + TypeScript build for shoppers (`ecothrift.us` / `www`). **Not** bundled with the staff dashboard.

- **Dev:** `cd frontend-public && npm run dev` → **http://localhost:5174** (proxies `/api` → Django `:8000`). Started by `scripts/dev/start_website.bat` (public only) or `scripts/dev/start_all.bat` (full stack).
- **Prod:** `npm run build` → `frontend-public/dist`, collected under `STATIC_ROOT/site` (`base: '/static/site/'`). `PublicSiteMiddleware` serves `index.html` on public hosts.
- **Routes:** `/` Home, `/shop` + `/shop/:slug` catalog, `/checkout`, `/order/:number`, `/blog` + `/blog/:slug`, `/visit`, `/sell`, `/404`.
- **Stack:** React Router v7, shared design tokens in `styles.css`, `useSeo` + JSON-LD, client cart (`localStorage`), code-split lazy routes.
- **API:** `AllowAny` `/api/webstore/catalog/*`, `checkout/`, `order-status/<number>/`, **`GET /api/webstore/config/`** — `hours` comes from AppSetting `online_sales.hours` (Python weekdays 0=Mon … 6=Sun) plus `overrides` / `today` / `resume_label` from `StoreHoursOverride`. Home, Visit, footer, checkout, holds, and account build the schedule from that payload; `StoreHoursBlock` prints a two-column weekly grid plus dated **Holiday hours** lines (`Mon, Sep 7 (Labor Day): 9 AM to 6 PM, note.`) when overrides are in the 7-day window. Visit/Home `.vinfo` rows are label | value (brand-green small-cap labels). **`GET /api/webstore/public/announcements/`** feeds `AnnouncementBanner` (Layout, above `.hdr`), `AnnouncementCard` (Home / Visit / Shop), and `AnnouncementGallery`. Dash CRUD: `/announcements` (Studios, Manager+) and Settings → Store → Holiday & special hours.
- Staff catalog + order management: **`WebStorePage`** (`/admin/web-store`), **`WebOrdersPage`** (`/admin/web-orders`) — Admin workspace, Manager/Admin.

## Layouts

### MainLayout

- **Sidebar** (**252px**): workspace nav — pinned Essentials (Dashboard) + workspaces (Buying → Processing → Restoration → Retail Floor → Cashier → Deliveries → Online Sales → Studios → Admin); logo, version footer. Waiting-work badges come from `useNavBadgeCounts` (Messages = `needs_reply`; Retail inbox = unread `MailMessage`; Parts Requests = live approvals / cancel asks / reviews) and roll up onto the workspace pip. **Overflow:** drawer paper and the nav scroll area use **`overflow-x: hidden`** (vertical scroll only); nav list is full-width with **`minWidth: 0`**; long labels **`noWrap`** + ellipsis (see **v2.2.4** `CHANGELOG`).
- **AppBar**: sticky, default color, user avatar + menu (logout)
- **Outlet** for page content
- Mobile: temporary drawer with hamburger toggle. Phone-shell routes (`showsPhoneTabBar`: `/dashboard`, `/today`, `/pay`, Routines list/catalog) keep the hamburger, show logo + page title, and mount `PhoneTabBar` (Home / Today / Pay / Routines) as an in-flow footer. Fill / demo / edit hide it so `RoutinePhoneBar` can own the bottom.
- Version in sidebar footer from `getAppVersion()` → `/api/core/system/version/`

**Floor pages (desk):** `FloorPage` + `FloorPageBand` + `FloorNav` (`frontend/src/navigation/floorNav.ts`, `frontend/src/components/layout/FloorPage.tsx`). Band is one 60px row on the runner green gradient: title 20/800, optional inline subtitle or chips, `FloorNav` on the right. The nav is identical on every page (white pill = active); nothing hangs below it. Content column is `maxWidth: 1440` on `dutyColors.paper` except Dashboard, which keeps the olive body. Cards use `dutyCardSx` / `dutyHeroSx` / `ColumnCard`. Phone tabs reuse the same ids and Home / Today / Pay / Routines labels.

**Today (`/today`):** Punch (clock in / break / clock out) plus Day at a glance. Phone is `TodayPhone`. Desk is `TodayDesk` (greeting in the band, punch + week bar left, glance grid right).

**Pay (`/pay`):** This week hours, current and past biweekly periods from `GET /hr/time-entries/my_pay/`, recent shifts, and Request time change. Dollars stay behind a `••••` control; one tap reveals or hides all of them. The toggle is local `useState` and resets on every visit. The hourly rate is never shown. Desk uses a hero current period, `ColumnCard` past periods, and a restyled shifts DataGrid. No punch on Pay.

### Staff navigation (workspace sidebar, 2026-05-30)

Shared module: **`frontend/src/navigation/`**

| File | Purpose |
|------|---------|
| `navItemCatalog.ts` | Single source of truth for all staff sidebar links |
| `slotCNavLayout.ts` | Lifecycle workspace groups + selector metadata |
| `navResolve.ts` | `resolveNavItem` / `resolveNavGroups` — role-filter layout into renderable items |
| `useStaffNav.ts` | Active route detection + navigation |
| `NavItemRow.tsx` | Shared row component |

Shell: **`frontend/src/components/layout/Sidebar.tsx`** — one workspace panel visible; sidebar clicks keep the current workspace (shared links like Search items); external URL entry picks lowest lifecycle # workspace via **`resolveWorkspaceForRoute`**; manual choice in `ecothrift.navC.workspace.v1`. Open the switcher and press the assigned digit (`1`–`8`, `0` Admin) or the short-name letter. Keys listen only while the menu is open. There is no Alt+digit shortcut.

Adding a staff nav link: one object in `navItemCatalog.ts` + assign its id to a workspace in `slotCNavLayout.ts`. See **`frontend/src/navigation/README.md`**. Item flags: **`superuserOnly`** (dropped for non-`is_superuser` in `navResolve`) and **`openInNewWindow`** (`navUtils.navigateForNavItem` → `window.open(path, '_blank', 'noopener')`) — both used by **`blogStudio`** (Studios workspace).

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
- **hooks/** — one per domain: `useAuth`, `usePOS`, `useEmployees`, `useInventory`, **`useProcessingWorkspace`**, `useAI`, `useDashboard`, `useConsignment`, `useCashManagement`, `useSickLeave`, `useTimeClock`, `useTimeEntries`, **`useBuyingAuctions`**, **`useBuyingAuctionsInfinite`**, **`useBuyingAuctionSummary`**, **`useBuyingMarketplaces`**, **`useBuyingAuctionDetail`**, **`useBuyingManifestRows`**, **`useBuyingAuctionSnapshots`**, **`useBuyingWatchlist`**, **`useBuyingWatchlistInfinite`**, **`useEnhancementRequests`**, **`useNavBadgeCounts`**
- **pages/** — by section: `hr/`, `inventory/`, `pos/`, `consignment/`, `consignee/`, `admin/`, **`buying/`**, **`restoration/`**
- **types/** — one per app: `accounts.types`, `pos.types`, `inventory.types`, `consignment.types`, `hr.types`, **`buying.types`**, **`enhancementRequests.types`**, `common.types`

## Theme

Canonical staff colours: [`.ai/extended/brand.md`](brand.md). `theme/index.ts` — MUI `createTheme`:

- **Primary**: `#2e7d32` (Eco green), light `#60ad5e`, dark `#1b5e20` (theme file still lists `#005005`; new UI uses `#1b5e20`)
- **Secondary**: `#558b2f`
- **Typography**: Inter, Roboto, Helvetica, Arial; h4/h5/h6 fontWeight 600
- **Shape**: borderRadius 8
- **Component overrides**: MuiButton (textTransform none, fontWeight 500), MuiCard (subtle shadow). **Buying grid snappiness (v2.13.1):** **`MuiIconButton`** and **`MuiCheckbox`** — **`defaultProps.disableRipple: true`**, **`styleOverrides.root.transition: 'none'`** — reduces perceived lag on checkbox / star / thumbs / archive interactions in **`AuctionListDesktop`**.
- **Routines / Documents** chrome: `frontend/src/components/duty/tokens.ts` (`dutyColors`) — brand green for actions and pass; sage desk; ink is `#1a1f1c`, not navy.

## Nothing may shift the page (house rule)

**No element may push existing content up, down, or sideways when it appears.** A warning that pops in above a table moves the row the user was reaching for, which on a shop floor means a mis-click on a real item. This applies to alerts, banners, hints, inline validation, empty states, and "N items need attention" strips.

Enforced as an always-on rule in [`.cursor/rules/no-content-shift.mdc`](../../.cursor/rules/no-content-shift.mdc), because a rule that has to be looked up is a rule that gets broken while writing the component.

**The test before any `{cond ? <X/> : null}`:** can `cond` change while someone is looking at this screen? If yes, it is a violation. A conditional is only safe when it is fixed for the life of the record on screen — a note that either exists on this item or does not.

Use instead, in order of preference:

- **Always render it, change only what it says** — the alternate state is usually real information rather than blank space (`{unclaimed ? 'Mark where it is now.' : \`Measured from ${grade}.\`}`).
- **A reserved slot** — render the container at a fixed height whether or not it has content (`<Box sx={{ minHeight: 74 }}>{data ? <Thing /> : null}</Box>`).
- **Colour, not size** — borders switch colour at the same width; never add a border, padding or margin that was not there before.
- **A toast** (`notistack` `enqueueSnackbar`) — for the outcome of something the user just did.
- **A badge and a drawer** — for standing conditions the user reads when they choose to. See `StudioNotices.tsx` in TARS: conditions collect behind a header badge and open in a right drawer. The Enhancement **Requests** grabber is `position: fixed` on the bottom edge and fades in; it must never sit in document flow.
- **A modal** — for anything requiring an answer before continuing.

Cards and rows in a list must be **fixed height with every slot always rendered**, empty or not, so filling in a field never reflows the list beneath the hand. Prefer **dimming** a row that no longer applies over removing it.

**Do not** mount `<Alert>` into a page body. `RestorationQueueCard.tsx` and `TarsGradeTable.tsx` are the reference implementations.

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
- ~~`MatchReviewPanel.tsx`, `FinalizePanel.tsx`, `ProductMatchingPanel.tsx`~~ — legacy ManifestRow-era match panels, **deleted 2026-06-10** (unmounted dead code; Fable audit F2 — current flow uses `PreprocessingMatchCell` in Final Decisions)
- `frontend/src/hooks/useStandardManifest.ts` — Formula-based state (replaces old rules-based)
- `frontend/src/components/inventory/StandardManifestBuilder.tsx` — Expression text input with autocomplete

### Key Components

**RowProcessingPanel** (`components/inventory/RowProcessingPanel.tsx`) — **Step 2 offline AI Cleanup only** (2026-04+):

- Download standardized cleanup CSV (`useDownloadCleanupCsv` → **`GET …/download-cleanup-csv/`**).
- Upload Grok **12/13-column** or legacy **7-column narrow** CSV; client validation via **`parseCleanupCsv`** (`cleanupCsv.ts`).
- Parent **`PreprocessingPage`** toolbar **Run Cleanup** posts validated rows to **`apply-cleanup-csv`**.
- Upload log + **`soft_warnings`** alert after apply.

**Removed from this panel (legacy — API hooks still in `useInventory.ts`):** in-app model selector, batch size, concurrency worker pool, expandable AI suggestion rows, Run/Pause/Cancel for **`ai-cleanup-rows`**. Planned restoration via slim batch endpoint — see [`preprocessing_ai_cleanup_review`](../initiatives/_archived/_completed/preprocessing_ai_cleanup_review.md).

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
