# Staff navigation

Shared route data and hooks live in `frontend/src/navigation/`. The sidebar shell is `frontend/src/components/layout/Sidebar.tsx`.

## Lifecycle workspaces

Pinned **Essentials:** Dashboard, Time clock.

Workspaces (lifecycle order):

1. **Buying** — Auctions, Watchlist, Vendors, Orders, Preprocessing
2. **Processing** — Receiving, Processing (Restorations is a guest link)
3. **Restoration** — Overview, Bench, Parts Requests (Enhancements is a superuser guest link)
4. **Inventory** — Catalog
5. **Retail Floor** — Quick reprice, Floorplans, Quality audit
6. **Cashier** — Terminal, Transactions, Drawers, Cash, Printables, POS setup
7. **Deliveries** — Schedule, Table
8. **Online Sales** (Manager/Admin) — Listings, Holds, Customers
9. **Admin** (Manager/Admin) — Assumptions, Employees, Retail inbox, Permissions, Settings, Label Studio, Blog Studio, Time & payroll. Superuser **Enhancements** lives as a Restoration guest item (`/admin/enhancement-requests`), not in the Admin list.

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
| `NavItemRow.tsx` | Shared nav row styling + waiting-work badge. Hover glows the icon in the workspace letter colour; selected stays green. |
| `WorkspaceSwitcher.tsx` | Trigger card + dropdown of workspace cards; digits jump while open |

**Adding a page:** one entry in `navItemCatalog.ts`, then assign its id to a workspace in `slotCNavLayout.ts`.

**Adding a badge:** return the count from `hooks/useNavBadgeCounts.ts` keyed by nav item id. The
sidebar renders whatever ids appear there, so no navigation code changes. Item counts also roll
up onto a tiny pip on that workspace's icon in the switcher menu. Gate the underlying query on
the workspace being visible so staff who cannot open a page do not poll it. Parts Requests reads
the live parts-orders list (approvals, cancel asks, reviews) so the badge clears when those
orders are handled, not on a 30s poll.

## Collapse / workspace behavior

- Exactly **one workspace panel** visible at a time.
- **Sidebar click** (Essentials or workspace panel): stay in the current workspace even when the link appears in multiple workspaces.
- **External URL** (bookmark, refresh, address bar): for routes shared across workspaces, select the **lowest lifecycle #** workspace (e.g. Inventory for `/inventory/manage-items`).
- Manual workspace choice persists in `ecothrift.navC.workspace.v1`. Open the
  switcher (the trigger card under Essentials) and press **1..N** or the
  highlighted first letter of a workspace name to jump. An Employee's **6**
  (or **S**) is Cashier; **7** (or **D**) is Deliveries. Keys only listen while the menu is open, so they
  cannot steal a keystroke from a SKU scan or a price field.

## Checklist

- [ ] `npm run build` passes
- [ ] All staff links reachable (including Finalization/Disputes query routes)
- [ ] Role gates unchanged (Admin workspace hidden for Employee)
- [ ] New catalog items appear after layout assignment without sidebar code changes
