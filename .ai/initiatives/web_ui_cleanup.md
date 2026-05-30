<!-- initiative: slug=web-ui-cleanup status=active updated=2026-05-30 -->
<!-- Last updated: 2026-05-30 (Session 2 — hide + remove shipped) -->

# Initiative: Staff web UI cleanup (page audit)

**Status:** Active — **Phase 1–3 shipped** (2026-05-30). Initiative may archive after deploy or if no follow-up polish.

**Owner pass:** [`.ai/reference/web_ui_cleanup_section_pass.txt`](../reference/web_ui_cleanup_section_pass.txt) · **Hidden / removed** lists in [`.ai/context.md`](../context.md).

---

## Current execution steps

- [x] **Step 0 — Section pass:** owner marked **HIDE** vs **REMOVE** vs implicit keep ([`web_ui_cleanup_section_pass.txt`](../reference/web_ui_cleanup_section_pass.txt)).
- [x] **Step 1 — Hide from nav:** `Sidebar.tsx` — HR subset, staff Consignment section, Products, Templates, Inventory Admin subgroup.
- [x] **Step 2 — Removal audit:** inline in plan + execution (no blockers; processing settings were legacy-only).
- [x] **Step 3 — Execute removals:** routes/pages deleted; `InboundFulfillmentPlaceholderPage` legacy copy removed.
- [x] **Step 4 — Docs:** `frontend.md`, `context.md`, `CHANGELOG [Unreleased]`, this file.

---

## Section pass results (2026-05-30)

### HIDE (nav only — routes remain)

| Label | Route(s) | Sidebar today |
|-------|----------|---------------|
| Time Clock | `/hr/time-clock` | HR |
| Time History | `/hr/time-history` | HR |
| Sick Leave | `/hr/sick-leave` | HR |
| Consignment Accounts | `/consignment/accounts`, `…/accounts/:id` | Consignment |
| Consignment Items | `/consignment/items` | Consignment |
| Consignment Payouts | `/consignment/payouts` | Consignment |
| Public pricing lookup | `/pricing`, `/pricing/:sku?` | — | **Removed** | Route + page deleted (owner: unused) |

### REMOVE (full investigation before delete)

| Label | Route(s) | Audit status |
|-------|----------|--------------|
| Categories (placeholder) | `/inventory/admin/categories` | **Not started** |
| Legacy inventory hub | `/inventory/legacy` | **Not started** |
| Legacy orders | `/inventory/legacy/orders` | **Not started** |
| processing-legacy | `/inventory/processing-legacy` | **Not started** — also hosts processing **settings** modal (`#settings`) |
| Products | `/inventory/products` | **Not started** |
| Manifest templates | `/inventory/templates` | **Not started** |

### Implicit KEEP (everything not listed above)

Dashboard; HR **Employees**; full **Inbound** block; **Search items**, **Quick reprice**, item detail; **Vendors** + vendor detail; **POS** (all four); **Buying** (auctions + watchlist); **App Admin** (assumptions, POS setup, users, customers, permissions, settings); **Consignee portal** (summary, items, payouts); login / forgot-password.

---

## Removal audit template (per REMOVE ALL row)

Before deleting route + page files, capture:

1. **Nav / links** — `Sidebar.tsx`, cross-links from other pages, redirects in `App.tsx`.
2. **Deep links** — bookmarks, emails, `OrderDetailPage` / intake handoffs pointing here.
3. **Backend** — API endpoints used only by this page; models still needed elsewhere?
4. **Shared components** — modals/settings only reachable from this route (e.g. **`processing-legacy`** + `#settings`).
5. **Tests** — frontend or e2e routes referencing path.
6. **Recommendation** — hide-only vs delete route vs delete page + dead code; migration/API impact **none / low / high**.

Store audits under **`.ai/reference/web_ui_cleanup/`** (one file per target when investigation starts).

---

1. **Inventory every staff-facing React route** (plus consignee portal and public pages for completeness).
2. For each page, agree a **disposition**: **Keep (nav)**, **Keep (route only)**, **Hide (nav)**, **Remove (later)**, or **Placeholder**.
3. Implement nav/route changes in follow-on sessions — **hide first**, delete routes only when safe.

**Out of scope (initially):** backend API removal, Django admin (`/db-admin/`), print server, buying scraper jobs.

---

## Disposition legend

| Disposition | Meaning |
|-------------|---------|
| **Keep (nav)** | Stay in sidebar; daily use |
| **Keep (route only)** | Deep links / bookmarks OK; remove from sidebar |
| **Hide (nav)** | Drop sidebar entry; route may still work |
| **Remove (later)** | Target delete page + route after grace period |
| **Placeholder** | Roadmap stub — hide or remove when real page ships |
| **TBD** | Owner has not decided yet |

---

## Page inventory

Source of truth for routes: [`frontend/src/App.tsx`](../../frontend/src/App.tsx). Sidebar: [`frontend/src/components/layout/Sidebar.tsx`](../../frontend/src/components/layout/Sidebar.tsx).

### Public (no auth)

| Route | Component | In sidebar | Disposition | Notes |
|-------|-----------|------------|-------------|-------|
| `/login` | `LoginPage` | — | **Keep (route only)** | Auth entry |
| `/forgot-password` | `ForgotPasswordPage` | — | **Keep (route only)** | Linked from login |
| `/pricing`, `/pricing/:sku?` | `PublicItemLookupPage` | — | **Hide** | Owner: unused; route may stay until audit |

### Staff — Dashboard

| Route | Component | Sidebar section | Disposition | Notes |
|-------|-----------|-----------------|-------------|-------|
| `/dashboard` | `DashboardPage` | Dashboard | **Keep (nav)** | |

### Staff — HR

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/hr/time-clock` | `TimeClockPage` | HR → Time Clock | **Hide (nav)** | |
| `/hr/time-history` | `TimeHistoryPage` | HR → Time History | **Hide (nav)** | |
| `/hr/employees` | `EmployeeListPage` | HR → Employees | **Keep (nav)** | |
| `/hr/employees/:id` | `EmployeeDetailPage` | — (detail) | **Keep (route only)** | |
| `/hr/sick-leave` | `SickLeavePage` | HR → Sick Leave | **Hide (nav)** | |

### Staff — Inventory → Inbound fulfillment

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/inventory/orders` | `OrderListPage` | Inbound → Orders | **TBD** | Core intake |
| `/inventory/orders/:id` | `OrderDetailPage` | — (detail) | **TBD** | |
| `/inventory/preprocessing` | `PreprocessingPage` | Inbound → Preprocessing | **TBD** | Empty state when no PO |
| `/inventory/preprocessing/:id` | `PreprocessingPage` | — | **TBD** | |
| `/inventory/orders/:id/preprocess` | redirect → preprocessing | — | **Remove (later)?** | Legacy URL |
| `/inventory/receiving` | `ReceivingEntryRedirect` | Inbound → Receiving | **TBD** | Resolves next PO |
| `/inventory/receiving/:id` | `ReceivingOrderPage` | — | **TBD** | |
| `/inventory/processing` | `ProcessingEntryRedirect` | Inbound → Processing | **TBD** | Item Processor entry |
| `/inventory/processing/:id` | `ProcessingWorkspacePage` | — | **TBD** | |
| `/inventory/inbound?view=finalization` | `InboundFulfillmentPlaceholderPage` | Inbound → Finalization | **Placeholder** | Roadmap stub |
| `/inventory/inbound?view=disputes` | `InboundFulfillmentPlaceholderPage` | Inbound → Disputes | **Placeholder** | Disputes API exists; no dedicated page |
| `/inventory/inbound/receiving` | redirect → `/inventory/receiving` | — | **Remove (later)?** | Old path alias |

### Staff — Inventory → Items

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/inventory/items` | `ItemListPage` | Items → Search items | **TBD** | |
| `/inventory/items/:id` | `ItemDetailPage` | — (detail) | **TBD** | |
| `/inventory/quick-reprice` | `QuickRepricePage` | Items → Quick reprice | **Keep (nav)** | Retag workflow |
| `/inventory/products` | `ProductListPage` | Items → Products | **Remove (audit)** | Section pass REMOVE ALL |

### Staff — Inventory → Vendors

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/inventory/vendors` | `VendorListPage` | Vendors → Vendors | **TBD** | |
| `/inventory/vendors/:id` | `VendorDetailPage` | — (detail) | **TBD** | Manifest templates live on vendor |
| `/inventory/templates` | `ManifestTemplatesSplashPage` | Vendors → Manifest templates | **Remove (audit)** | Section pass REMOVE ALL |

### Staff — Inventory → Admin (inventory subgroup)

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/inventory/admin/categories` | `InventoryRoadmapPage` | Admin → Categories | **Remove (audit)** | Placeholder |
| `/inventory/legacy` | `InventoryLegacyHubPage` | Admin → Legacy inventory pages | **Remove (audit)** | |
| `/inventory/legacy/orders` | `InventoryLegacyOrdersPage` | — (linked from hub) | **Remove (audit)** | |
| `/inventory/admin/legacy` | redirect → `/inventory/legacy` | — | **Remove (later)?** | |

### Staff — Inventory (routes **not** in sidebar)

| Route | Component | Disposition | Notes |
|-------|-----------|-------------|-------|
| `/inventory/processing-legacy` | `ProcessingPage` | **Remove (audit)** | Settings modal `#settings` — audit before delete |
| `/inventory/inbound` | `InboundFulfillmentPlaceholderPage` | **Placeholder** | Base path without `?view=` |

### Staff — POS

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/pos/terminal` | `TerminalPage` | POS → Terminal | **TBD** | |
| `/pos/drawers` | `DrawerListPage` | POS → Drawers | **TBD** | |
| `/pos/cash` | `CashManagementPage` | POS → Cash Management | **TBD** | |
| `/pos/transactions` | `TransactionListPage` | POS → Transactions | **TBD** | |

### Staff — Buying

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/buying/auctions` | `AuctionListPage` | Buying → Auctions | **TBD** | |
| `/buying/auctions/:id` | `AuctionDetailPage` | — (detail) | **TBD** | |
| `/buying/watchlist` | `WatchlistPage` | Buying → Watchlist | **TBD** | |

### Staff — Consignment (Manager+)

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/consignment/accounts` | `ConsignmentAccountsPage` | Consignment → Accounts | **Hide (nav)** | |
| `/consignment/accounts/:id` | `ConsigneeDetailPage` | — (detail) | **Hide (route only)** | |
| `/consignment/items` | `ConsignmentItemsPage` | Consignment → Items | **Hide (nav)** | |
| `/consignment/payouts` | `ConsignmentPayoutsPage` | Consignment → Payouts | **Hide (nav)** | |

### Staff — Admin (app admin)

| Route | Component | Sidebar | Min role | Disposition | Notes |
|-------|-----------|---------|----------|-------------|-------|
| `/admin/assumptions` | `AssumptionsPage` | Admin → Assumptions | Manager | **TBD** | Buying/pricing assumptions |
| `/admin/pos-setup` | `PosStoreSetupPage` | Admin → POS setup | Manager | **TBD** | |
| `/admin/users` | `UserListPage` | Admin → Users | Admin | **TBD** | |
| `/admin/customers` | `CustomerListPage` | Admin → Customers | Admin | **TBD** | |
| `/admin/permissions` | `PermissionsPage` | Admin → Permissions | Admin | **TBD** | |
| `/admin/settings` | `SettingsPage` | Admin → Settings | Manager | **TBD** | App settings |

### Consignee portal (Consignee role)

| Route | Component | Disposition | Notes |
|-------|-----------|-------------|-------|
| `/consignee` | `ConsigneeSummaryPage` | **TBD** | Consignee layout (separate from staff sidebar) |
| `/consignee/items` | `ConsigneeItemsPage` | **TBD** | |
| `/consignee/payouts` | `ConsigneePayoutsPage` | **TBD** | |

### Global redirects

| Route | Behavior | Disposition | Notes |
|-------|----------|-------------|-------|
| `/` | → `/dashboard` | **Keep** | |
| `*` | → `/dashboard` | **Keep** | Unknown paths |

---

## Acceptance

- [ ] Every row in **Page inventory** has an agreed disposition (not **TBD**).
- [ ] Sidebar updated to match **Keep (nav)** vs **Hide** decisions.
- [ ] Placeholder / legacy routes either hidden or documented as intentional escape hatches.
- [ ] **`frontend.md`** updated when nav/routes change.

---

## Sessions

### Session 1 — Page inventory + disposition pass

- **Goal:** Complete the page inventory and mark what you actually use vs what should be hidden or removed.
- **Finish line:** Owner has filled **Disposition** on every row (or explicitly deferred sections); next session scope is clear (nav-only vs route deletion).
- **Scope:** This file + walkthrough in chat; **no code changes** unless owner asks mid-session.
- **Out of scope:** Deleting pages, API changes, consignee portal redesign.
- **Est:** 1–2h · **Start:** 2026-05-30
- **Result:** Section pass in [`web_ui_cleanup_section_pass.txt`](../reference/web_ui_cleanup_section_pass.txt) — **6 hide**, **6 remove (audit first)**, rest **keep**. Hidden list copied to **`context.md`**.

### Session 2 — Hide from nav + execute removals

- **Goal:** Staff sidebar matches section pass; remove dead routes/pages in one pass.
- **Finish line:** `Sidebar.tsx` updated; removed routes/pages deleted; `npm run build` green; docs synced.
- **Scope:** `Sidebar.tsx`, `App.tsx`, placeholder page, deleted page files, `useInventory` hook trim, steering docs.
- **Start:** 2026-05-30
- **Result:** **Shipped.** Hidden: HR (3), staff Consignment (section), Products, Templates, Inventory Admin. Removed: categories, legacy hub/orders, processing-legacy (+ settings modal), products page, templates splash, `/pricing`. **`frontend npm run build`** OK.

---

## See also

- [`.ai/extended/frontend.md`](../extended/frontend.md) — routing and pages (update after changes)
- [`.ai/extended/ux-spec.md`](../extended/ux-spec.md) — visual system
- Archived intake initiative: [order_processing_pipeline_rebuild](./_archived/_completed/order_processing_pipeline_rebuild.md)
- [`.ai/initiatives/_index.md`](_index.md)
