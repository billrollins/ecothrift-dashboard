<!-- Last updated: 2026-02-13T10:53:00-06:00 -->

# Eco-Thrift Dashboard — Frontend Context

## Tech Stack

- **React 19**, **TypeScript**, **Vite 7**, **MUI v7**
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

- **api/** — one module per backend app: `core.api`, `accounts.api`, `hr.api`, `inventory.api`, `pos.api`, `consignment.api`, `client.ts`
- **hooks/** — one per domain: `useAuth`, `usePOS`, `useEmployees`, `useInventory`, `useDashboard`, `useConsignment`, `useCashManagement`, `useSickLeave`, `useTimeClock`, `useTimeEntries`
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
