<!-- Last updated: 2026-02-21T18:00:00-06:00 -->
# Frontend Routes & Pages

## Route Guards

| Guard | Allows |
|-------|--------|
| `ProtectedRoute` | Any authenticated user |
| `StaffRoute` | Admin, Manager, Employee |
| `ManagerRoute` | Admin, Manager |
| `AdminRoute` | Admin only |

Consignee routes use `ProtectedRoute` + role check in `ConsigneeLayout`.

---

## Public Routes

| Path | Page | Description |
|------|------|-------------|
| `/login` | LoginPage | Email + password login form |
| `/pricing` | PublicItemLookupPage | Public item price lookup |
| `/pricing/:sku` | PublicItemLookupPage | Direct SKU lookup |
| `/forgot-password` | ForgotPasswordPage | Password reset request + token entry |

## Staff Routes (MainLayout)

### Dashboard

| Path | Page | Description |
|------|------|-------------|
| `/dashboard` | DashboardPage | Revenue stats, weekly chart, 4-week comparison, alerts |

### HR

| Path | Page | Description |
|------|------|-------------|
| `/hr/time-clock` | TimeClockPage | Clock in/out with break entry |
| `/hr/time-history` | TimeHistoryPage | Time entry list with filters, bulk approve |
| `/hr/employees` | EmployeeListPage | Employee directory with search/filter |
| `/hr/employees/:id` | EmployeeDetailPage | Employee profile detail/edit |
| `/hr/sick-leave` | SickLeavePage | Sick leave balances and requests |

### Inventory

| Path | Page | Description |
|------|------|-------------|
| `/inventory/vendors` | VendorListPage | Vendor directory |
| `/inventory/vendors/:id` | VendorDetailPage | Vendor detail with PO history |
| `/inventory/orders` | OrderListPage | Purchase order list |
| `/inventory/orders/:id` | OrderDetailPage | PO detail with status workflow, manifest info, and nav buttons (Back/Preprocessing/Processing/Delete) in page header |
| `/inventory/preprocessing` | PreprocessingRedirect | Redirects to last preprocessed order or prompts for order ID |
| `/inventory/preprocessing/:id` | PreprocessingPage | Standalone 4-step manifest preprocessing (Standardize → AI Cleanup → Product Matching → Pricing) with breadcrumb navigation and undo for each step |
| `/inventory/processing` | ProcessingPage | Unified processing workspace: set fields, check in, print tags |
| `/inventory/products` | ProductListPage | Product catalog |
| `/inventory/items` | ItemListPage | Item inventory with status filters |
| `/inventory/items/:id` | ItemDetailPage | Item detail view/edit |

### POS

| Path | Page | Description |
|------|------|-------------|
| `/pos/terminal` | TerminalPage | POS terminal — scan items, complete sales |
| `/pos/drawers` | DrawerListPage | Open/close drawers, handoffs |
| `/pos/cash` | CashManagementPage | Supplemental drawer, bank transactions |
| `/pos/transactions` | TransactionListPage | Completed sale history |

### Consignment (Manager+)

| Path | Page | Description |
|------|------|-------------|
| `/consignment/accounts` | AccountsPage | Consignee account management (people) |
| `/consignment/accounts/:id` | ConsigneeDetailPage | Consignee profile detail + agreements |
| `/consignment/items` | ItemsPage | All consignment items |
| `/consignment/payouts` | PayoutsPage | Payout generation and tracking |

### Admin

| Path | Page | Description |
|------|------|-------------|
| `/admin/users` | UserListPage | User management (CRUD) |
| `/admin/permissions` | PermissionsPage | Role/group management |
| `/admin/customers` | CustomerListPage | Customer management (CRUD) |
| `/admin/settings` | SettingsPage | App settings + print server status |

## Consignee Portal (ConsigneeLayout)

| Path | Page | Description |
|------|------|-------------|
| `/consignee` | SummaryPage | Consignee dashboard summary |
| `/consignee/items` | MyItemsPage | Own consignment items |
| `/consignee/payouts` | MyPayoutsPage | Own payout history |

---

## Navigation (Sidebar)

The sidebar in `MainLayout` is organized into collapsible sections:

1. **Dashboard** — Dashboard
2. **HR** — Time Clock, Time History, Employees, Sick Leave
3. **Inventory** *(collapsible)* — Vendors, Orders, Preprocessing, Processing, Products, Items
4. **POS** *(collapsible)* — Terminal, Drawers, Cash Management, Transactions
5. **Consignment** — Accounts, Items, Payouts *(Manager+ only)*
6. **Admin** — Users, Customers, Permissions, Settings *(Admin only)*

Sections are hidden when the user's role doesn't have access.
