<!-- Last updated: 2026-11-12 (Facilities > Store map #105, Signage #106) -->
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

- **Online Sales** workspace (Manager+) — Listings (tabs Catalog, To list, **Sold online**), Holds, Messages. Sold online (E5, 2026-10-21): record an item sold online and paid outside the register (tag, price, Facebook / other online); it leaves inventory, with Undo; lists every online sale of 90 days, holds paid at the register included. A listing's Mark sold also takes its item out.  
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
| — | `essentials` | — | — | Dashboard (Time clock and Routines are in the account menu) |
| 1 | `buying` | Buying | Auctions, vendors, orders, and manifest prep | Auctions, Watchlist, Vendors, Orders, Preprocessing |
| 2 | `processing` | Processing | Receive through close-out | Receiving, Processing, Finalization*, Disputes*, Restorations |
| 3 | `restoration` | Restoration | Test, assemble, repair, salvage | TARS (new window), Parts requests (Manager+) |
| 4 | `inventory` | Inventory | Catalog — products, check-ins, items | Catalog |
| 5 | `retailFloor` | Floor | Shelf and floorplans | Catalog, Quick reprice, Floorplans |
| 5 | `storeSales` | Cashier | Register, sales, drawers, and Thrift+ | Terminal, Thrift+ Staff, Transactions, Returns, Drawers, Cash (Manager+; #49, 2026-11-02: Thrift+ members left the menu, the Member window covers it); **Setup:** Test terminal, Printables, POS setup (Manager+), Thrift+ (superuser); Command Center after a line (Manager+) |
| 7 | `admin` | Admin | Setup and access | Assumptions, Employees, Customers, Permissions, Settings, Label Studio, Blog studio, Time & payroll *(Admin group itself Manager+; items further gated)* |

\*Placeholder pages.

### Dynamics / behavior consultants should know

| Behavior | Detail |
|----------|--------|
| One workspace at a time | Switching workspace replaces the link list under the selector |
| Persistence | Last selected workspace stored in `localStorage` (`ecothrift.navC.workspace.v1`) |
| Keyboard | Open the workspace switcher, then press the assigned digit (`1`–`8`, `0` Admin) or the short-name letter. Keys do nothing while the menu is closed. There is no Alt+digit shortcut. |
| Default workspace | If nothing stored: Retail on a register computer, then the person's department's **Starts in** workspace (Admin > Departments; #86), then `buying` |
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
| SuperAdminRoute | `is_superuser` |

**Quirk to flag in consultation:** Sidebar filtering uses **max rank across all roles**, while some route guards use **primary role**. Multi-role users can occasionally see a link they then get bounced from (or the reverse), depending on primary role.

### Practical matrix (staff sidebar)

| Area | Employee | Manager | Admin | Superuser extras |
|------|----------|---------|-------|------------------|
| Essentials, Buying, most Processing, Inventory, Sales (ops), Floorplans, Quick reprice, TARS, Restorations | Yes | Yes | Yes | — |
| Admin workspace appears | No | Yes (subset) | Yes | — |
| POS setup, Assumptions, Settings, Label Studio, Parts requests | No | Yes | Yes | — |
| Employees, Customers, Permissions | No | No | Yes | — |
| Time & payroll, Routine Control, Blog Studio | No | No | No* | Yes |

\*Admin **role** alone is not enough without `is_superuser` for those three.

---

## 4. Page-by-page descriptions

Grouped the way the **current navbar** presents them. Paths are staff SPA routes.

### Essentials (always visible)

| Page | Path | What it does |
|------|------|----------------|
| **Dashboard** | `/dashboard` | Store pulse: sales run-rate / weekly book, department cards (Buying, Processing, Restoration, Retail), who’s working. Manager-facing home. |

**HR** (`/hr`, #56) is first on the account menu: one page with tabs (Requests, Me, Schedule, People, Hiring, Onboarding, Time & payroll) around the existing HR pages, each tab and section shown only when that person can open its page. **Requests** (#59, `/hr`) is every HR request in one place: days off and new times, time changes and questions to HR; each person sees their own, and whoever answers a kind sees everyone's waiting ones.

Time clock and Routines are on the **account menu** (avatar), not the sidebar. The name at the top of that menu opens **Me** (`/me`, every staff login: details, password and register PIN, Hours & pay, shifts, onboarding and check-ins, sign out on all devices); Thrift+ Staff has it as its **Me** tab. Documents is unwired until a later UI tune.

| Page | Path | What it does |
|------|------|----------------|
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
| **Returns** | `/inventory/returns` | Items customers brought back (every Thrift+ return lands here by itself). One tap each: Price again (prints a tag), Back to shelf as is, Send to Restoration, Scrap. Under the "In progress" caption (#83). |
| **My numbers** | `/processing/my-numbers` | Every processor (#87): their own line for a day and its week (items, tag dollars, per clocked hour, big items, tag errors, to Restoration) beside the room and the goal. |
| **Command Center** | `/processing/command-center` | Leads and the owner (#87): the same numbers for every processor, the room against the day's share of the weekly goal, new hires beside the room pace. Read only. |
| **Finalization** | `/inventory/inbound?view=finalization` | **Placeholder** — close-out workflow not implemented. |
| **Disputes** | `/inventory/inbound?view=disputes` | **Placeholder** — disputes inbox not implemented. |
| **Restorations** | `/inventory/restorations` | Hub for items going to / returning from restoration (TO setup / FROM desk lanes). |
| **Floor issues** | `/inventory/floor-issues` | Items someone on the floor reported with **Report a problem** (the one report for a problem with an item or its tag; it replaced "Report a bad tag" on Today and the register, and is also on Search and the item window). The item keeps its status (a "processing" status would read as never received on its truck) and waits here; one action finishes it: Price again, Back to shelf as is, Send to Restoration, Scrap. The list and actions are shared with Returns (`ProcessingReentry`, `services/reentry.py`); the report is `FloorIssue` (`services/floor_issues.py`). A tag problem is still a `BadTag` (Tag errors keeps its trace). Under "In progress" in the menu until Bill signs off (Dash Updates #84). |

### Restoration workspace

| Page | Path | What it does |
|------|------|----------------|
| **TARS** | `/restoration/tars` | Full-screen “TARS Studio” bench for test / assemble / repair / salvage workflows. Opens in a **new window** from nav. |
| **Parts requests** | `/restoration/parts-requests` | Manager+ queue of parts requests from restoration work. |
| **Restoration list** | `/restoration/tracking` | Every item in restoration: path (tested / assembled / repaired / salvaged), next stop, landing, days; In progress or Finished (30 days). |

### Inventory workspace

| Page | Path | What it does |
|------|------|----------------|
| **Search** (Find item) | `/inventory/search` | One box, one row per product, its items one click away (`/inventory/workbench` redirects here). **Add item** adds Misfit items (no purchase order); **Misfit only** filters to them. Phone: cards. |
| **Review** | `/inventory/review` | Inventory review, tabs Categories, Vendors, Price points and Flags: Week / 4 weeks of in, out, on hand, weeks of supply, stale, bulk, recovery, days to sell and flags. A category opens its subcategories; a subcategory, vendor or price point opens its items in Search. Flags: each rule, its limit (managers edit it there) and what carries it. Everyone who sees Search. Desk: sortable table; phone: cards. [`inventory-review.md`](inventory-review.md) |
| **Item** | `/inventory/search?open=item:<id>` | Single item window over Inventory search: price, status, history, reprice/print. The old `/inventory/items` list and page were removed 2026-10-21. |

### Retail Floor workspace

| Page | Path | What it does |
|------|------|----------------|
| **Quick reprice** | `/inventory/quick-reprice` | Scan/SKU session to apply shelf discounts quickly. |
| **Tag errors** | `/inventory/tag-errors` | Bad tags by week, traced to who checked them in and the truck (Inventory menu, under PR Fix-it). |
| **Floorplans** | `/floor-ops/floorplans` | List of store floorplans. |
| **Floorplan editor** | `/floor-ops/floorplans/:id/edit` | Full-screen SVG editor (walls, fixtures, print). Outside main chrome. |
| **Store map** | `/facilities/store-map` | Facilities: the location's Current floorplan with layers of pins (Signage first). All staff look; managers place, drag and edit pins (#105). |
| **Signage** | `/facilities/signage` | Facilities: every store sign with its status (to make, printed, up), copies up, print PDF (Print / Download) and its spots on the store map. All staff look and print; managers change it (#106). |
| **Routines** | `/routines` | Account menu. Phone-first My Routines / Catalog; fill-in and live preview in a 9:20 frame. |
| **Routine runner / editor** | `/routines/run/:id`, `/routines/run/new?routine=&draft=`, `/routines/new`, `/routines/catalog` | Staff fill a run; `?draft=` resumes an in-progress submission. Superuser authors in the left form with a live phone preview. Retail QA kinds (section tally, cross-check, owner spot check, work cycle) carry their own runners instead of an authored checklist. |

### Store Sales workspace

| Page | Path | What it does |
|------|------|----------------|
| **Terminal** (Register) | `/pos/terminal` | Live POS register: cart, tender, discounts, delivery lines, checkout. Idle registers are asked for a work cycle after a few minutes with no cart. **Return** in the header (#71) opens the Return window: Thrift+ 3-day returns (find the receipt, tick lines, summary, a manager's own PIN past the 3 days); `?return=1` opens it; the old `/pos/returns` redirects here (`?practice=1` to `/pos/test`). |
| **Transactions** | `/pos/transactions` | **Checkouts** (completed and voided sales) and **Returns** (#72: every Thrift+ return on the day it came back, late ones marked; the mark, why and who allowed it, for managers). Same filters on both; a row opens its Sale window. `?show=returns&late=1` = late only (Owner page link). |
| **Deliveries** | `/pos/deliveries` | Entry redirect into **Delivery Desk** (desktop) or **Delivery Field** (mobile) Days. |
| **Delivery Desk** | `/pos/deliveries/desk/schedule`, `/desk/table`, `/desk/schedule/:dayId` | Office planning/review + live run/route/ETA monitor on day detail; never renders the Field driver wizard. |
| **Delivery Field** | `/pos/deliveries/field/schedule`, `/field/table`, `/field/schedule/:dayId` | Mobile full-day run: Contact → Load → Routes → Deliveries → Finish; Routes API ETAs; sticky timer + step rail. |
| **Drawers** | `/pos/drawers` | Cash drawer open/close status by register/day. |
| **Cash** | `/pos/cash` | Managers and the owner: office cash, the safe, bank deposits and change (Retail 5). |
| **Printables** | `/pos/printables` | Policy sheets / driver logs and similar printables. |
| **POS setup** | `/admin/pos-setup` | Manager+: registers, locations, POS configuration. |

### Admin workspace

| Page | Path | What it does |
|------|------|----------------|
| **Assumptions** | `/admin/assumptions` | Manager+: business defaults (shrink, buying assumptions, category-need knobs). |
| **Employees** | `/admin/users` | Admin: users, roles, pay-related fields. |
| **Departments** | `/admin/departments`, `/admin/departments/:slug` | Manager+: directory and per-department hub (home staff, shifts, routines, sections when present). Superuser create / rename / deactivate / delete / reorder. **Starts in** (#86): the menu workspace the department's people open on until they pick one (Manager+ can change it). Grouping only; departments grant no permissions. |
| **Customers** | `/admin/customers` | Admin: customer list. |
| **Permissions** | `/people/permissions` (`/admin/permissions` redirects) | People workspace; Managers read, the owner changes (#53): Levels (a dial per area for Employee and Manager; Owner locked at Full), Departments (adds only), People (each person's level, dial per area with where it came from, exceptions with an end date and a note, View as), History. |
| **Settings** | `/admin/settings` | Manager+: app settings. Tabs `?tab=` — System, Printing, Store, Assumptions, **Retail QA** (grade weights, letter lines, audit floors, idle prompt minutes), Permissions (a link to People → Permissions), **AI** (superuser only: model catalog, per-action model + effort). |
| **Keys** | `/admin/keys` (`?tab=rings`, `where`, `find`) | Owner and Admin role: every key with its photo and AI-read metrics, key rings with check out / check in, where everything is, find a key from a photo. Desk and phone layouts. Details: `keys.md`. |
| **Label Studio** | `/admin/label-studio` (+ `/:id`) | Manager+: label template library and visual/PDF designer; print integration. |
| **Blog Studio** | `/blog-studio` | Superuser TipTap blog CMS for the public site; **new window**. |
| **Schedule** | `/people/schedule` | Manager+: build the week (every department as green timeline bars; Retail flags floor gaps), clear a week (type to confirm), hours planned vs worked so far, record call-ins and no-shows, call-in counts over 30 / 90 days. Staff see their own week on Me. |
| **Supplies** | `/supplies`, `/supplies/lists/:id`, `/supplies/count/:id`, `/supplies/receive`, `/supplies/requests`, `/supplies/order` | Essentials, every staff login: supply lists, the weekly count (also a block on Me while a list needs counting), Receive (tick deliveries in) and We need… requests. Manager+ edit lists and answer requests; the order page with spend is the owner's (linked from the Owner page). Desk and phone layouts. Details: `supplies.md`. |
| **Messages** | `/messages` | Every staff login (envelope in the top bar; also Thrift+ Staff and a section on Me). Owner and managers start a thread to one person or a department; anyone on it replies; read receipts; one-time secrets (a PIN) shown once. |
| **Social Studio** | `/studios/social`, `/studios/social/photos`, `/studios/social/numbers`, `/studios/social/post/:id` | Studios workspace, every staff login (the Studios group has no role gate since 2026-10-21; its other pages keep Manager+). The week's posts, the photo library, the post editor and Post it. Desk and phone layouts. Details: `marketing.md`. |
| **Social Studio app** | `/social` (`post`, `photos`, `scan`, `week`, `numbers`, `me`) | Every staff login, full screen outside MainLayout, installs as its own home-screen app (scope `/social/`). Bottom bar: Post, Photos, Scan, Schedule, Me. Details: `marketing.md` → The phone app. |
| **Time & payroll** | `/admin/time-payroll` | Superuser: roster (with each shift's change trail), payroll summary, time-change requests, QuickBooks numbers per pay period (overtime 1.5x, copy, CSV) and Close / Reopen period. |
| **Routines** (Routine Control) | `/admin/routines` (`?id=` selects, `?view=sections`) | Superuser. One header for Routines and Sections; `?id=` survives a view switch. **Routines**: every routine incl. retired, run stats, filters, quick edits; program routines cannot be retired. **Sections**: areas of the floor and who keeps them, drag order, coverage gaps. Week scoring is Command Center (`/admin/retail-qa`). Old `?view=grades` redirects there. |

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
