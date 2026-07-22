# Eco-Thrift Dashboard — App Map for Navigation Consultation

**Purpose:** Hand this document to a consulting AI (or UX reviewer) to evaluate whether the staff navbar, workspaces, and page grouping can be organized more clearly.

**App version at writing:** v2.52.0  
**Sources of truth in code:** `frontend/src/navigation/` (especially `navItemCatalog.ts`, `slotCNavLayout.ts`), `frontend/src/App.tsx`, `.ai/context.md`

---

## 1. What the app is

Eco-Thrift Dashboard is the **staff operating system** for Eco-Thrift, a thrift store in Omaha, NE. Tagline: *one app to run the whole store*.

It covers the full lifecycle of merchandise and store operations:

1. **Source / buy** — B-Stock auctions, vendors, purchase orders, manifest preprocessing  
2. **Inbound** — Receiving, item processing (check-in / disposition / print), restorations  
3. **Catalog** — Products, check-ins, sellable items  
4. **Floor** — Quick reprice, floorplans, retail quality audits  
5. **Sell** — POS terminal, drawers, cash, deliveries, transactions  
6. **People & admin** — Time clock, employees, payroll, settings, labels, blog  

**Stack (for context only):** React 18 + TypeScript + MUI staff SPA (`frontend/`); Django 5.2 + DRF + PostgreSQL backend; separate public storefront SPA (`frontend-public/`, hostname `ecothrift.us`) that is **not** part of the staff navbar. Staff app typically lives on `dash.*`.

**Related but separate surfaces:**

| Surface | Who | Nav model |
|---------|-----|-----------|
| Staff SPA | Employees, Managers, Admins, Superusers | Slot-C sidebar (workspaces) |
| Consignee portal | Consignees only | Simple top AppBar (Summary / Items / Payouts) |
| Public storefront | Shoppers | Separate app — not in staff nav |
| TARS Studio / Blog Studio / Floorplan editor | Staff (role-gated) | Often open in a **new window** without the main sidebar |

**Currently parked / partial:**

- **Online Sales** workspace — code retained; staff routes redirect to Dashboard (`ONLINE_SALES_ENABLED=false`)  
- **Staff Consignment** — routes still work; **hidden from sidebar**  
- **Finalization** and **Disputes** — nav links exist but pages are **placeholders** (not built)  

---

## 2. How the staff navbar works (“Slot C”)

### Shell

- **Desktop (`md+`):** permanent left sidebar (~252px) + top AppBar (user menu) + main content  
- **Mobile:** hamburger opens the same sidebar as a temporary drawer  
- Implemented in `MainLayout.tsx` + `Sidebar.tsx`

### Mental model

The sidebar is **not** a flat list of every page. It is:

1. **Essentials** — always visible (today: Dashboard, Time clock)  
2. **Workspace selector** — pick exactly **one** lifecycle workspace  
3. **Workspace panel** — only that workspace’s links are shown  

So users see a short Essentials block + one focused set of links at a time, not the entire IA at once.

### Workspaces (lifecycle order)

Intended story: *source → prep → ingest → restore → records → floor → sell → manage*.

| Order | Workspace id | Short label | Helper text (shown in selector) | Links in that workspace |
|------:|--------------|-------------|----------------------------------|-------------------------|
| — | `essentials` | — | — | Dashboard, Time clock |
| 1 | `buying` | Buying | Auctions, vendors, orders, and manifest prep | Auctions, Watchlist, Vendors, Orders, Preprocessing |
| 2 | `processing` | Processing | Receive through close-out | Receiving, Processing, Finalization*, Disputes*, Restorations |
| 3 | `restoration` | Restoration | Test, assemble, repair, salvage | TARS (new window), Parts requests (Manager+) |
| 4 | `inventory` | Inventory | Catalog — products, check-ins, items | Catalog |
| 5 | `retailFloor` | Floor | Shelf, floorplans, and quality audit | Quick reprice, Floorplans, Quality Audit (Manager+), QA Forms (Superuser) |
| 6 | `storeSales` | Sales | Register, drawers, and POS setup | Terminal, Transactions, Deliveries, Drawers, Cash Management, Printables, POS setup (Manager+) |
| 7 | `admin` | Admin | Setup and access | Assumptions, Employees, Customers, Permissions, Settings, Label Studio, Blog studio, Time & payroll *(Admin group itself Manager+; items further gated)* |

\*Placeholder pages.

### Dynamics / behavior consultants should know

| Behavior | Detail |
|----------|--------|
| One workspace at a time | Switching workspace replaces the link list under the selector |
| Persistence | Last selected workspace stored in `localStorage` (`ecothrift.navC.workspace.v1`) |
| Keyboard | `Alt+1…N` switches among visible workspaces and focuses the first item |
| Default workspace | `buying` if nothing stored |
| Sidebar click vs deep link | Clicking a sidebar link keeps the current workspace pinned. Opening a URL / refresh resolves which workspace “owns” the active route (lowest lifecycle order that contains a matching item) |
| Role filtering | Items and whole groups can require min role or `superuserOnly`; empty groups disappear |
| New window | Some items (`TARS`, `Blog Studio`) open in a new browser window without MainLayout chrome |
| Badges | Nav rows do **not** show notification/count badges today |
| Search in nav | Some items use `navSearch` so active-state matching can include query strings |

### Data architecture (for reorg proposals)

| Layer | File | Responsibility |
|-------|------|----------------|
| Catalog | `navItemCatalog.ts` | Every link: id, path, label, icon, roles, flags |
| Layout | `slotCNavLayout.ts` | Which ids belong to Essentials vs which workspace |
| Resolve | `navResolve.ts` / `navUtils.ts` | Filter by user roles; active matching |
| UI | `Sidebar.tsx`, `NavItemRow.tsx` | Render Essentials + selector + panel |

**Implication for reorg:** Renaming workspaces, moving links, or changing Essentials is mostly a layout/catalog change — routes can stay put unless you also rename URLs.

---

## 3. Roles and who sees what

### Roles

`Employee` | `Manager` | `Admin` | `Consignee` (Django groups). Users can have multiple groups; UI also has **`is_superuser`** (Super Admin) separate from the Admin role.

### Route guards (high level)

| Guard | Rule |
|-------|------|
| Authenticated | Else → login |
| Staff | Consignees redirected to `/consignee` |
| ManagerRoute | Primary role Manager or Admin |
| AdminRoute | Primary role Admin only |
| SuperAdminRoute | `is_superuser` |

**Quirk to flag in consultation:** Sidebar filtering uses **max rank across all roles**, while some route guards use **primary role**. Multi-role users can occasionally see a link they then get bounced from (or the reverse), depending on primary role.

### Practical matrix (staff sidebar)

| Area | Employee | Manager | Admin | Superuser extras |
|------|----------|---------|-------|------------------|
| Essentials, Buying, most Processing, Inventory, Sales (ops), Floorplans, Quick reprice, TARS, Restorations | Yes | Yes | Yes | — |
| Admin workspace appears | No | Yes (subset) | Yes | — |
| POS setup, Assumptions, Settings, Label Studio, Quality Audit hub, Parts requests | No | Yes | Yes | — |
| Employees, Customers, Permissions | No | No | Yes | — |
| Time & payroll, QA Forms, Blog Studio | No | No | No* | Yes |

\*Admin **role** alone is not enough without `is_superuser` for those three.

---

## 4. Page-by-page descriptions

Grouped the way the **current navbar** presents them. Paths are staff SPA routes.

### Essentials (always visible)

| Page | Path | What it does |
|------|------|----------------|
| **Dashboard** | `/dashboard` | Store pulse: sales run-rate / weekly book, department cards (Buying, Processing, Restoration, Retail QA), who’s working. Manager-facing home. |
| **Time clock** | `/hr/time-clock` | Clock in/out/break, recent shifts, request modifications. Everyday employee entry point. |

### Buying workspace

| Page | Path | What it does |
|------|------|----------------|
| **Auctions** | `/buying/auctions` | B-Stock auction list with valuation, filters, category-need signals for buying decisions. |
| **Auction detail** | `/buying/auctions/:id` | Deep dive on one auction (not always a top-level nav row; reached from list). |
| **Watchlist** | `/buying/watchlist` | Saved / watched auctions. |
| **Vendors** | `/inventory/vendors` | Vendor directory (Amazon, etc.). |
| **Vendor detail** | `/inventory/vendors/:id` | Vendor profile and related orders. |
| **Orders** | `/inventory/orders` | Purchase order list with status filters, profitability metrics (Cost / Retail / Priced / Sold / Profit), selection summary, receive shortcut. |
| **Order detail** | `/inventory/orders/:id` | Single PO: milestones, costs, manifest upload, jump into preprocess / process / receive. |
| **Preprocessing** | `/inventory/preprocessing` (+ `/:id`) | Manifest prep wizard: standardize → AI cleanup → final decisions before receiving/processing. |

### Processing workspace

| Page | Path | What it does |
|------|------|----------------|
| **Receiving** | `/inventory/receiving` → `/:id` | Entry redirect picks next eligible PO; page is the physical receiving workspace (pallets, condition, complete). |
| **Processing** | `/inventory/processing` → `/:id` | Item Processor workspace: work queue, check-in, dispositions, label print, order picker. |
| **Finalization** | `/inventory/inbound?view=finalization` | **Placeholder** — close-out workflow not implemented. |
| **Disputes** | `/inventory/inbound?view=disputes` | **Placeholder** — disputes inbox not implemented. |
| **Restorations** | `/inventory/restorations` | Hub for items going to / returning from restoration (TO setup / FROM desk lanes). |

### Restoration workspace

| Page | Path | What it does |
|------|------|----------------|
| **TARS** | `/restoration/tars` | Full-screen “TARS Studio” bench for test / assemble / repair / salvage workflows. Opens in a **new window** from nav. |
| **Parts requests** | `/restoration/parts-requests` | Manager+ queue of parts requests from restoration work. |

### Inventory workspace

| Page | Path | What it does |
|------|------|----------------|
| **Catalog** | `/inventory/workbench` | Unified catalog UI for products, check-ins, and items (search-heavy). Primary inventory records home. |
| **Item detail** | `/inventory/items/:id` | Single item: price, status, history, reprice/print (usually reached from Catalog / POS / processing). |
| **Search items (legacy)** | `/inventory/items` | Older item list; **not in Slot-C nav** but route still exists. |

### Retail Floor workspace

| Page | Path | What it does |
|------|------|----------------|
| **Quick reprice** | `/inventory/quick-reprice` | Scan/SKU session to apply shelf discounts quickly. |
| **Floorplans** | `/floor-ops/floorplans` | List of store floorplans. |
| **Floorplan editor** | `/floor-ops/floorplans/:id/edit` | Full-screen SVG editor (walls, fixtures, print). Outside main chrome. |
| **Quality Audit** | `/admin/quality-audit` | Hub to start floor QA forms; table of submitted audits with review. Feeds Dashboard **Retail QA** grade when form is marked dashboard-feeding. |
| **QA wizard / review** | `/admin/quality-audit/run/:formSlug/:auditId` | Mobile-friendly checklist run; submitted audits open read-only. |
| **QA Forms** | `/admin/quality-audit/forms` (+ editor) | Superuser: create/edit checklist form definitions. |

### Store Sales workspace

| Page | Path | What it does |
|------|------|----------------|
| **Terminal** | `/pos/terminal` | Live POS register: cart, tender, discounts, delivery lines, checkout. |
| **Transactions** | `/pos/transactions` | Historical completed sales / lookups. |
| **Deliveries** | `/pos/deliveries` | Entry redirect into **Delivery Desk** or **Delivery Field** (Days + Total Deliveries). Legacy board at `/pos/deliveries/legacy` is a one-release deprecated escape hatch. |
| **Delivery Desk** | `/pos/deliveries/desk/days`, `/desk/total`, `/desk/days/:dayId` | Office planning/review + live run monitor on day detail; never renders the Field driver wizard. |
| **Delivery Field** | `/pos/deliveries/field/days`, `/field/total`, `/field/days/:dayId` | Mobile full-day run: Start Today → contact → load → truck → route → drive → return; sticky timer + bottom shortcuts. |
| **Deliveries (legacy)** | `/pos/deliveries/legacy` | Deprecated one-release escape hatch for the prior unified Day Board. |
| **Drawers** | `/pos/drawers` | Cash drawer open/close status by register/day. |
| **Cash Management** | `/pos/cash` | Drops, pickups, safe / reconciliation workflows. |
| **Printables** | `/pos/printables` | Policy sheets / driver logs and similar printables. |
| **POS setup** | `/admin/pos-setup` | Manager+: registers, locations, POS configuration. |

### Admin workspace

| Page | Path | What it does |
|------|------|----------------|
| **Assumptions** | `/admin/assumptions` | Manager+: business defaults (shrink, buying assumptions, category-need knobs). |
| **Employees** | `/admin/users` | Admin: users, roles, pay-related fields. |
| **Customers** | `/admin/customers` | Admin: customer list. |
| **Permissions** | `/admin/permissions` | Admin: permission matrix UI. |
| **Settings** | `/admin/settings` | Manager+: app settings. |
| **Label Studio** | `/admin/label-studio` (+ `/:id`) | Manager+: label template library and visual/PDF designer; print integration. |
| **Blog Studio** | `/blog-studio` | Superuser TipTap blog CMS for the public site; **new window**. |
| **Time & payroll** | `/admin/time-payroll` | Superuser: roster, payroll summary, time-change requests. |

### Hidden from nav (still reachable by URL)

| Page | Path | Notes |
|------|------|-------|
| Staff Consignment Accounts | `/consignment/accounts` | Manager+; intentionally de-emphasized |
| Consignee detail | `/consignment/accounts/:id` | |
| Staff Consignment Items | `/consignment/items` | |
| Staff Consignment Payouts | `/consignment/payouts` | |

### Consignee portal (separate layout — not Slot-C)

| Page | Path | What it does |
|------|------|----------------|
| Summary | `/consignee` | Consignee earnings / overview |
| My Items | `/consignee/items` | Their consigned inventory |
| My Payouts | `/consignee/payouts` | Their payout history |

### Auth

| Page | Path | What it does |
|------|------|----------------|
| Login | `/login` | Email/password |
| Forgot password | `/forgot-password` | Reset request flow |

### Catch-alls

- `/` and unknown paths → `/dashboard`

---

## 5. Known IA tensions (useful for the consult)

These are observations from the current structure — not prescriptions.

1. **Overlapping “homes” for inventory work** — Orders live under Buying; Receiving/Processing under Processing; Catalog under Inventory; Restorations under Processing while TARS is its own Restoration workspace. Users may not know which workspace to open for “work this PO.”

2. **URL prefixes ≠ workspace labels** — e.g. Quality Audit lives under `/admin/...` but appears in **Retail Floor**; Vendors/Orders under `/inventory/...` appear in **Buying**.

3. **Essentials are very small** — Only Dashboard + Time clock. Heavy daily tools (Terminal, Processing, Orders) require a workspace switch.

4. **Admin is a mixed bag** — Ops tools (Label Studio, Assumptions, QA Forms) sit next to HR/security (Employees, Permissions, Payroll).

5. **Placeholders in primary Processing nav** — Finalization and Disputes occupy slots without product behind them.

6. **Dual restoration surfaces** — Restorations hub (Processing) vs TARS Studio (Restoration, new window) vs Parts requests.

7. **Parked Online Sales** — Will need a workspace slot again when re-enabled; currently absent from the selector.

8. **Mobile** — Same workspace model in a drawer; dense workspaces (Store Sales has 7 links) may be hard on phone.

9. **Role vs Superuser split** — “Admin” role ≠ Super Admin; Time & payroll / Blog / QA Forms are easy to misplace mentally.

10. **Consignee vs staff Consignment** — Staff consignment hidden; consignee portal separate — easy to confuse in IA discussions.

---

## 6. Prompt suggestions for the consulting AI

You can paste this file and ask something like:

> Given this thrift-store staff app map, propose 2–3 alternative navbar / workspace organizations that optimize for: (a) floor cashiers, (b) inbound processors, (c) managers who jump between buying and POS. Preserve role gates. Call out which current links should be Essentials vs workspace-only. Avoid inventing features that aren’t listed; placeholders can be demoted or removed from nav. Return a recommended primary IA with migration notes from the current Slot-C workspaces.

Optional constraints to add:

- Prefer **≤6 links visible** at once after Essentials  
- Keep **keyboard Alt+N** workspace switching  
- Don’t break deep links (paths can stay; labels/grouping can change)  
- Call out mobile drawer usability  

---

## 7. File index

| Concern | Path |
|---------|------|
| Nav catalog | `frontend/src/navigation/navItemCatalog.ts` |
| Workspace layout | `frontend/src/navigation/slotCNavLayout.ts` |
| Role resolve | `frontend/src/navigation/navResolve.ts`, `navUtils.ts` |
| Sidebar UI | `frontend/src/components/layout/Sidebar.tsx` |
| Staff shell | `frontend/src/components/layout/MainLayout.tsx` |
| Consignee shell | `frontend/src/components/layout/ConsigneeLayout.tsx` |
| Routes / guards | `frontend/src/App.tsx` |
| Product context | `.ai/context.md` |
| Auth notes | `.ai/extended/auth-and-roles.md` |
