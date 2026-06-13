# Staff navigation

Shared route data and hooks live in `frontend/src/navigation/`. The sidebar shell is `frontend/src/components/layout/Sidebar.tsx`.

## Lifecycle workspaces

Pinned **Essentials:** Dashboard, Employees.

Workspaces (lifecycle order):

1. **Buying** — Vendors, Auctions, Watchlist
2. **Processing** — Orders, Preprocessing, Receiving, Processing, Finalization, Disputes
3. **Restoration** — TARS (placeholder)
4. **Floor** — Manage products, Manage items, Quick reprice
5. **Cashier** — Terminal, Transactions, Search items, Drawers, Cash Management
6. **Admin** (Manager/Admin) — Assumptions, POS setup, Users, Customers, Permissions, Settings

## Shared data

| File | Purpose |
|------|---------|
| `navItemCatalog.ts` | All staff sidebar links (single source of truth) |
| `slotCNavLayout.ts` | Workspace groups + selector metadata |
| `navResolve.ts` | Role-filter a layout into renderable groups/items |
| `navIcons.tsx` | Icon key → MUI icon component |
| `useStaffNav.ts` | `isActive`, `navigateToItem` |
| `NavItemRow.tsx` | Shared nav row styling |

**Adding a page:** one entry in `navItemCatalog.ts`, then assign its id to a workspace in `slotCNavLayout.ts`.

## Collapse / workspace behavior

- Exactly **one workspace panel** visible at a time.
- **Sidebar click** (Essentials or workspace panel): stay in the current workspace even when the link appears in multiple workspaces.
- **External URL** (bookmark, refresh, address bar): for routes shared across workspaces, select the **lowest lifecycle #** workspace (e.g. Floor for `/inventory/manage-items`).
- Manual workspace choice (selector or **Alt+1..6**) persists in `ecothrift.navC.workspace.v1`.

## Checklist

- [ ] `npm run build` passes
- [ ] All staff links reachable (including Finalization/Disputes query routes)
- [ ] Role gates unchanged (Admin workspace hidden for Employee)
- [ ] New catalog items appear after layout assignment without sidebar code changes
