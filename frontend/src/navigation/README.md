# Staff navigation

Shared route data and hooks live in `frontend/src/navigation/`. The sidebar shell is `frontend/src/components/layout/Sidebar.tsx`.

## Anatomy (staff navigation redesign, phase 1)

One job per place:

| Place | Job | What is in it |
|-------|-----|---------------|
| **Sidebar** | The workspace you are in | Logo (click = Dashboard), the workspace switcher, the open workspace's pages. No pinned "Essentials" group. |
| **Top bar** | Right now | `ClockPill` (clock status; opens a protected clock dialog), `NotificationBell` (one bell), avatar. |
| **Avatar menu** | Me (HR side) | `AccountMenu`: name + role, ME, MY REQUESTS, OWNER (superuser), language, View as, sign out. |
| **Dashboard** | Store \| My day | Two tabs and nothing else (`FloorNav` on a desk, `PhoneTabBar` on a phone). Settings lives in Admin. |

- **Clock pill** (`components/layout/ClockPill.tsx`): "On shift since 8:58 AM" / "Not clocked in" from `useCurrentEntry`. Tapping only opens `ClockDialog` (today's shift + clock state). Every punch needs a second, explicit step: "Clock out now, 3:42 PM?" / "Clock in to Retail Open now, 8:58 AM?" with Cancel. It reuses `useTimeClockActions`, so every existing rule still applies (weekly-limit prompt, still-to-do routines guard, break must end first, forgotten punch is fixed in My day).
- **Bell** (`NotificationBell.tsx`): badge = unread Messages + Routines due (the old "!" nag count: routines, manager nudges, hours, buyer nags) + Approvals waiting (superuser only; pending `core/requests`, the Requests page's Waiting query). Rows open Messages, Dashboard > My day, and Requests. Nudge, hours and bid-now cards keep their place at the top of the panel; a new nudge opens the panel. Polling is unchanged (messages 60s, approvals 30s, the nag hooks as before).
- **Avatar menu** (`AccountMenu.tsx`): ME = My day, Schedule (Manager/Admin, its existing gate), My profile & PIN (`/me`). MY REQUESTS = Supplies (`/supplies`; there is no time-off request page yet). OWNER (superuser) = Owner page (`/owner`), Reports (`/reports`). Section labels are 12px semibold, letter-spaced, `#1F2937` (about 14:1 on white) with a divider above.
- **Dashboard tabs** (`dashboardTabs.ts`): `/dashboard?tab=store|myday`. With no `tab` in the URL the tab is the per-user choice remembered in `ecothrift.dashboard.tab.v1.<user id>` (localStorage), else Store for Manager/Admin/superuser and My day for an Employee. A routine (`run`, `routine`, `draft`) or `hours` in the URL always means My day. `/today` and `/pay` redirect to `/dashboard?tab=myday` (query kept); `/routines*` still lands on My day. My day renders `TodayPage` inside the tab; the phone keeps `DashboardPhone` / `TodayPhone` with the bottom `PhoneTabBar` (Store | My day).

## Lifecycle workspaces

Owner and Reports are no longer sidebar links (avatar menu, OWNER). Supplies is in the Admin workspace (Manager/Admin see it there; every staff login reaches it from the avatar menu). Documents stays in the catalog but is unwired until that UI is tuned.

Workspaces (assigned digits; letter is the first letter of the short name):

1. **Buying** (`1` / `B`) — Auctions, Watchlist, Vendors, Orders, Preprocessing
2. **Processing** (`2` / `P`) — Receiving, Processing (Restorations is a guest link)
3. **Restoration** (`3` / `R`) — Overview, Bench, Parts Requests (Enhancements is a superuser guest link)
4. **Retail Floor** (`4` / `F`) — Catalog, Quick reprice, Floorplans
5. **Cashier** (`5` / `C`) — Terminal, Thrift+ Staff, Transactions, Drawers, Cash management; Setup: Test terminal, Printables, POS setup, Thrift+
6. **Deliveries** (`6` / `D`) — Schedule, Table
7. **Online Sales** (`7` / `O`, Manager/Admin) — Listings, Holds, Messages
8. **Studios** (`8` / `S`, Manager/Admin) — Label Studio, Floorplans, Blog Studio (superuser)
9. **People** (`9`, Manager/Admin; `P` opens Processing) — Users, Applicants, Interviews, Onboarding, Check-ins; Setup: Payroll deductions, Jobs & careers page, Emails
10. **Admin** (`0` / `A`, Manager/Admin) — Departments, Shifts, Routines (superuser; Routine Control), Command Center, Time & payroll (superuser), Requests (superuser), Supplies, Keys, Settings

The same digit always opens the same workspace. A key for a workspace the user cannot see does nothing. Superuser **Enhancements** lives as a Restoration guest item (`/admin/enhancement-requests`). **Users** is Manager+; Employees is first and default for Admin, Customers is `?tab=customers`. Managers only see Customers.

Recently moved paths (e.g. `/inventory/workbench`, `/inventory/quick-reprice`, old count links) keep working as
redirects in `App.tsx` for a bookmark window and deliberately have no catalog entry — the catalog only holds links
that appear in the sidebar. Redirects older than that window are removed (2026-10-21: about 25 from before October);
an old URL then lands on the person's home page.

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
A page used every shift goes in `itemIds`; a set-and-forget page (setup, printables, practice) goes in
`setupItemIds`, drawn under a small **Setup** caption after the daily pages (owner, 2026-10-19).

**Adding a badge:** return the count from `hooks/useNavBadgeCounts.ts` keyed by nav item id. The
sidebar renders whatever ids appear there, so no navigation code changes. Item counts also roll
up onto a tiny pip on that workspace's icon in the switcher menu. Gate the underlying query on
the workspace being visible so staff who cannot open a page do not poll it. Parts Requests reads
the live parts-orders list (approvals, cancel asks, reviews) so the badge clears when those
orders are handled, not on a 30s poll.

## Collapse / workspace behavior

- Exactly **one workspace panel** visible at a time.
- **Sidebar click** (workspace panel): stay in the current workspace even when the link appears in multiple workspaces.
- **External URL** (bookmark, refresh, address bar): for routes shared across workspaces, select the **lowest lifecycle #** workspace (e.g. Inventory for `/inventory/manage-items`).
- Manual workspace choice persists in `ecothrift.navC.workspace.v1`. Open the
  switcher (the trigger card at the top of the sidebar) and press the assigned digit
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
