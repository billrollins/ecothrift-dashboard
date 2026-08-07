# Staff navigation

Shared route data and hooks live in `frontend/src/navigation/`. The sidebar shell is `frontend/src/components/layout/Sidebar.tsx`.

## Lifecycle workspaces

Pinned **Essentials:** Dashboard, Time clock.

Workspaces (lifecycle order):

1. **Buying** — Auctions, Watchlist, Vendors, Orders, Preprocessing
2. **Processing** — Receiving, Processing, Finalization, Disputes, Restorations
3. **Restoration** — TARS, Parts requests
4. **Inventory** — Catalog
5. **Retail Floor** — Quick reprice, Floorplans, Quality audit
6. **Store Sales** — Terminal, Transactions, Deliveries, Drawers, Cash, Printables, POS setup
7. **Online Sales** (Manager/Admin) — Listings, Holds, Customers
8. **Admin** (Manager/Admin) — Assumptions, Employees, Retail inbox, Permissions, Settings, Label Studio, Blog Studio, Payroll hours

Deprecated paths (`/online-sales/inbox`, `/online-sales/sales`, `/admin/web-store`, …) keep
working as redirects in `App.tsx` and deliberately have no catalog entry — the catalog only
holds links that appear in the sidebar.

## Shared data

| File | Purpose |
|------|---------|
| `navItemCatalog.ts` | All staff sidebar links (single source of truth) |
| `slotCNavLayout.ts` | Workspace groups + selector metadata |
| `navResolve.ts` | Role-filter a layout into renderable groups/items |
| `navIcons.tsx` | Icon key → MUI icon component |
| `useStaffNav.ts` | `isActive`, `navigateToItem` |
| `NavItemRow.tsx` | Shared nav row styling + waiting-work badge |

**Adding a page:** one entry in `navItemCatalog.ts`, then assign its id to a workspace in `slotCNavLayout.ts`.

**Adding a badge:** return the count from `hooks/useNavBadgeCounts.ts` keyed by nav item id. The
sidebar renders whatever ids appear there, so no navigation code changes. Gate the underlying
query on the workspace being visible so staff who cannot open a page do not poll it.

## Collapse / workspace behavior

- Exactly **one workspace panel** visible at a time.
- **Sidebar click** (Essentials or workspace panel): stay in the current workspace even when the link appears in multiple workspaces.
- **External URL** (bookmark, refresh, address bar): for routes shared across workspaces, select the **lowest lifecycle #** workspace (e.g. Inventory for `/inventory/manage-items`).
- Manual workspace choice (selector or **Alt+1..N**) persists in `ecothrift.navC.workspace.v1`.

## Checklist

- [ ] `npm run build` passes
- [ ] All staff links reachable (including Finalization/Disputes query routes)
- [ ] Role gates unchanged (Admin workspace hidden for Employee)
- [ ] New catalog items appear after layout assignment without sidebar code changes
