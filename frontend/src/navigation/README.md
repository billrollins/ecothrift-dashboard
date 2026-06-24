# Staff navigation

Shared route data and hooks live in `frontend/src/navigation/`. The sidebar shell is `frontend/src/components/layout/Sidebar.tsx`.

## Lifecycle workspaces

Pinned **Essentials:** Dashboard, Employees.

Workspaces (lifecycle order):

1. **Buying** — Auctions, Watchlist, Vendors, Orders, Preprocessing
2. **Processing** — Receiving, Processing, Finalization, Disputes
3. **Restoration** — TARS (Send to Restoration → Check-In & Evaluate → TARS verb queues)
4. **Inventory** — Catalog
5. **Floor Ops** — Quick reprice *(more coming)*
6. **Cashier** — Terminal, Transactions, Drawers, Cash Management
7. **Admin** (Manager/Admin) — Assumptions, POS setup, Web store, Web orders, Users, Customers, Permissions, Settings

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
- **External URL** (bookmark, refresh, address bar): for routes shared across workspaces, select the **lowest lifecycle #** workspace (e.g. Inventory for `/inventory/manage-items`).
- Manual workspace choice (selector or **Alt+1..N**) persists in `ecothrift.navC.workspace.v1`.

## Checklist

- [ ] `npm run build` passes
- [ ] All staff links reachable (including Finalization/Disputes query routes)
- [ ] Role gates unchanged (Admin workspace hidden for Employee)
- [ ] New catalog items appear after layout assignment without sidebar code changes
