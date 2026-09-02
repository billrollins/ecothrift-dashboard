# Staff navigation

Shared route data and hooks live in `frontend/src/navigation/`. The sidebar shell is `frontend/src/components/layout/Sidebar.tsx`.

## Lifecycle workspaces

Pinned **Essentials:** Dashboard. Time clock and Routines live in the account menu (avatar). Documents stays in the catalog but is unwired until that UI is tuned.

Workspaces (assigned digits; letter is the first letter of the short name):

1. **Buying** (`1` / `B`) — Auctions, Watchlist, Vendors, Orders, Preprocessing
2. **Processing** (`2` / `P`) — Receiving, Processing (Restorations is a guest link)
3. **Restoration** (`3` / `R`) — Overview, Bench, Parts Requests (Enhancements is a superuser guest link)
4. **Retail Floor** (`4` / `F`) — Catalog, Quick reprice, Floorplans
5. **Cashier** (`5` / `C`) — Terminal, Transactions, Drawers, Cash, Printables, POS setup
6. **Deliveries** (`6` / `D`) — Schedule, Table
7. **Online Sales** (`7` / `O`, Manager/Admin) — Listings, Holds, Messages
8. **Studios** (`8` / `S`, Manager/Admin) — Label Studio, Floorplans, Blog Studio (superuser)
9. *(free — digit 9 and letter L are unassigned)*
10. **Admin** (`0` / `A`, Manager/Admin) — Users, Retail inbox (Admin), Settings, Time & payroll (superuser), Routines (superuser; Routine Control)

The same digit always opens the same workspace. A key for a workspace the user cannot see does nothing. Superuser **Enhancements** lives as a Restoration guest item (`/admin/enhancement-requests`). **Users** is Manager+; Employees is first and default for Admin, Customers is `?tab=customers`. Managers only see Customers.

Deprecated paths (`/online-sales/inbox`, `/online-sales/customers`, `/online-sales/sales`, `/admin/web-store`, …) keep
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
  switcher (the trigger card under Essentials) and press the assigned digit
  (`1`–`9`, `0` for Admin) or the highlighted first letter of a workspace
  short name to jump. An Employee's **5** (or **C**) is Cashier; **6** (or **D**)
  is Deliveries; **9** / **L** do nothing. **8** / **S** and **0** / **A** do
  nothing for an Employee.
  Keys only listen while the menu is open, so they cannot steal a keystroke
  from a SKU scan or a price field. There is no Alt+digit shortcut.

## Checklist

- [ ] `npm run build` passes
- [ ] All staff links reachable (including Finalization/Disputes query routes)
- [ ] Role gates unchanged (Admin workspace hidden for Employee)
- [ ] New catalog items appear after layout assignment without sidebar code changes
