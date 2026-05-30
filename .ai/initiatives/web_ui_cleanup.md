<!-- initiative: slug=web-ui-cleanup status=active updated=2026-05-30 -->
<!-- Last updated: 2026-05-30 (Session 1 — page inventory seed) -->

# Initiative: Staff web UI cleanup (page audit)

**Status:** Active

---

## Objectives

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
| `/pricing`, `/pricing/:sku?` | `PublicItemLookupPage` | — | **TBD** | Customer-facing SKU lookup |

### Staff — Dashboard

| Route | Component | Sidebar section | Disposition | Notes |
|-------|-----------|-----------------|-------------|-------|
| `/dashboard` | `DashboardPage` | Dashboard | **TBD** | Default landing after `/` |

### Staff — HR

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/hr/time-clock` | `TimeClockPage` | HR → Time Clock | **TBD** | |
| `/hr/time-history` | `TimeHistoryPage` | HR → Time History | **TBD** | |
| `/hr/employees` | `EmployeeListPage` | HR → Employees | **TBD** | |
| `/hr/employees/:id` | `EmployeeDetailPage` | — (detail) | **TBD** | |
| `/hr/sick-leave` | `SickLeavePage` | HR → Sick Leave | **TBD** | |

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
| `/inventory/quick-reprice` | `QuickRepricePage` | Items → Quick reprice | **TBD** | Retag workflow |
| `/inventory/products` | `ProductListPage` | Items → Products | **TBD** | |

### Staff — Inventory → Vendors

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/inventory/vendors` | `VendorListPage` | Vendors → Vendors | **TBD** | |
| `/inventory/vendors/:id` | `VendorDetailPage` | — (detail) | **TBD** | Manifest templates live on vendor |
| `/inventory/templates` | `ManifestTemplatesSplashPage` | Vendors → Manifest templates | **TBD** | Splash → points at vendors |

### Staff — Inventory → Admin (inventory subgroup)

| Route | Component | Sidebar | Disposition | Notes |
|-------|-----------|---------|-------------|-------|
| `/inventory/admin/categories` | `InventoryRoadmapPage` | Admin → Categories | **Placeholder** | “Planned” taxonomy UI |
| `/inventory/legacy` | `InventoryLegacyHubPage` | Admin → Legacy inventory pages | **Hide (nav)?** | Escape hatch |
| `/inventory/legacy/orders` | `InventoryLegacyOrdersPage` | — (linked from hub) | **Hide (nav)?** | Old manifest/preprocess entry |
| `/inventory/admin/legacy` | redirect → `/inventory/legacy` | — | **Remove (later)?** | |

### Staff — Inventory (routes **not** in sidebar)

| Route | Component | Disposition | Notes |
|-------|-----------|-------------|-------|
| `/inventory/processing-legacy` | `ProcessingPage` | **Hide (nav)?** | Batch grid + `#settings` / `?settings=1` processing settings modal |
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
| `/consignment/accounts` | `ConsignmentAccountsPage` | Consignment → Accounts | **TBD** | |
| `/consignment/accounts/:id` | `ConsigneeDetailPage` | — (detail) | **TBD** | |
| `/consignment/items` | `ConsignmentItemsPage` | Consignment → Items | **TBD** | |
| `/consignment/payouts` | `ConsignmentPayoutsPage` | Consignment → Payouts | **TBD** | |

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

---

## See also

- [`.ai/extended/frontend.md`](../extended/frontend.md) — routing and pages (update after changes)
- [`.ai/extended/ux-spec.md`](../extended/ux-spec.md) — visual system
- Archived intake initiative: [order_processing_pipeline_rebuild](./_archived/_completed/order_processing_pipeline_rebuild.md)
- [`.ai/initiatives/_index.md`](_index.md)
