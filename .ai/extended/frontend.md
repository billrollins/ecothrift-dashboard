<!-- Last updated: 2026-02-18T16:00:00-06:00 -->

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

**Staff routes** (MainLayout): Dashboard, HR (time-clock, time-history, employees, sick-leave), Inventory (vendors, orders, processing, products, items), POS (terminal, drawers, cash, transactions), Consignment (Manager+), Admin (Admin only)

**Inventory route behavior (M3)**:
- `OrderDetailPage` handles order status management, manifest upload, and post-preprocessing actions (Match Products, Build Check-In Queue, Open Item Processor, Mark Complete). "Start Preprocessing" button navigates to `/inventory/preprocessing/:id`.
- `PreprocessingPage` (`/inventory/preprocessing/:id`) is a standalone 3-step wizard: Standardize Manifest → Row-Level Processing → Pricing & Finalize. Has own sidebar nav entry "Preprocessing". localStorage persists last order ID. Legacy route `/inventory/orders/:id/preprocess` redirects.
- **Row-Level Processing** (Step 2) uses `RowProcessingPanel` with: AI cleanup controls (model selector, batch size 5/10/25/50, concurrency 1/4/8/16), expandable rows table showing original data vs AI suggestions, product matching section, and review decisions section.
- `ProcessingPage` is a unified processing workspace for set fields, check-in, and label printing (batch + individual flows)

**Consignee routes** (ConsigneeLayout): `/consignee`, `/consignee/items`, `/consignee/payouts`

**Redirects:** `/` and `*` → `/dashboard`

## Layouts

### MainLayout

- **Sidebar** (260px): logo, nav sections (Dashboard, HR, Inventory, POS, Consignment, Admin), version footer
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

- **api/** — one module per backend app: `core.api`, `accounts.api`, `hr.api`, `inventory.api`, `ai.api`, `pos.api`, `consignment.api`, `client.ts`
- **hooks/** — one per domain: `useAuth`, `usePOS`, `useEmployees`, `useInventory`, `useAI`, `useDashboard`, `useConsignment`, `useCashManagement`, `useSickLeave`, `useTimeClock`, `useTimeEntries`
- **pages/** — by section: `hr/`, `inventory/`, `pos/`, `consignment/`, `consignee/`, `admin/`
- **types/** — one per app: `accounts.types`, `pos.types`, `inventory.types`, `consignment.types`, `hr.types`, `common.types`

## Theme

`theme/index.ts` — MUI `createTheme`:

- **Primary**: `#2e7d32` (Eco green), light `#60ad5e`, dark `#005005`
- **Secondary**: `#558b2f`
- **Typography**: Inter, Roboto, Helvetica, Arial; h4/h5/h6 fontWeight 600
- **Shape**: borderRadius 8
- **Component overrides**: MuiButton (textTransform none, fontWeight 500), MuiCard (subtle shadow)

## Vite Config

`vite.config.ts`:

- Port 5173
- **Proxy**: `/api` and `/admin` → `http://127.0.0.1:8000`
- Build: `dist`, no sourcemaps

## Version Display

Sidebar footer shows `v{appVersion.version}` from `getAppVersion()` → `/api/core/system/version/` (core app endpoint).

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
- Sidebar: "Preprocessing" entry added between "Orders" and "Processing" in Inventory section

### Render Loop Fix (1.6.0)
- `PreprocessingPage.tsx` `useEffect` for templateName: replaced `order` object dependency with scalar `orderVendorCode` and `orderPreviewTemplateName`
- `rawManifestParams` useMemo: changed `order?.manifest_file` (object ref) to `!!order?.manifest_file` (boolean)
- `matchSummary` prop: memoized with `useMemo` instead of inline object literal
